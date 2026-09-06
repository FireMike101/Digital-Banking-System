import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import { Onboarding } from '../models/onboarding.js';
import { Customer } from '../models/customer.js';
import { postToNibss } from '../services/nibss.js';

export const onboardingRouter = Router();
onboardingRouter.use(authenticate);
onboardingRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const attemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { success: false, message: 'Too many onboarding attempts. Try again later.' },
});

onboardingRouter.get('/', async (req, res) => {
  const record = await Onboarding.findOne({ customerId: req.customer._id });
  res.json({ success: true, onboarding: record ? { type: record.type, status: record.status } : null });
});

onboardingRouter.post('/', attemptLimit, async (req, res) => {
  const { type, firstName, lastName, dob, phone } = req.body ?? {};
  const allowed = ['type', 'firstName', 'lastName', 'dob', 'phone'];
  // BVN/NIN values are generated here. Never accept a customer's real identity number.
  if (!req.body || Object.keys(req.body).some((key) => !allowed.includes(key))) {
    return res.status(400).json({ success: false, message: 'Use only type, firstName, lastName, dob and phone. Do not submit a BVN or NIN.' });
  }
  if (!['BVN', 'NIN'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Type must be BVN or NIN.' });
  }
  if ([firstName, lastName].some((name) => typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
    return res.status(400).json({ success: false, message: 'First and last names must contain 2 to 100 characters.' });
  }
  const birthDate = new Date(dob);
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
      Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dob || birthDate > new Date()) {
    return res.status(400).json({ success: false, message: 'Enter a real, non-future date in YYYY-MM-DD format.' });
  }
  if (type === 'BVN' && (typeof phone !== 'string' || !/^0\d{10}$/.test(phone))) {
    return res.status(400).json({ success: false, message: 'BVN creation needs an 11-digit test phone number starting with 0.' });
  }

  let record;
  try {
    // Save first: the unique customer index prevents simultaneous duplicate submissions.
    record = await Onboarding.create({
      customerId: req.customer._id, type,
      testId: String(randomInt(10000000000, 100000000000)),
      firstName: firstName.trim(), lastName: lastName.trim(), dob,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Onboarding already exists. Check its status; do not create another identity.' });
    }
    throw error;
  }

  try {
    const body = { firstName: record.firstName, lastName: record.lastName, dob };
    if (type === 'BVN') {
      await postToNibss('/api/insertBvn', { ...body, bvn: record.testId, phone }, 201);
    } else {
      await postToNibss('/api/insertNin', { ...body, nin: record.testId }, 200);
    }
  } catch (error) {
    // A definite rejection allows a new attempt. Uncertain results stay pending to avoid duplicates.
    if (error.rejected) await Onboarding.deleteOne({ _id: record._id });
    return res.status(error.status ?? 502).json({ success: false, message: error.message });
  }
  record.status = 'created';
  await record.save();
  res.status(201).json({ success: true, message: 'Test identity created. Verify it next.', onboarding: { type, status: record.status } });
});

onboardingRouter.post('/verify', attemptLimit, async (req, res) => {
  const record = await Onboarding.findOne({ customerId: req.customer._id });
  if (!record || record.status === 'pending') {
    return res.status(409).json({ success: false, message: 'A confirmed identity creation is required before verification. If pending, the provider outcome needs to be checked before continuing.' });
  }
  if (record.status !== 'verified') {
    try {
      if (record.type === 'BVN') {
        await postToNibss('/api/validateBvn', { bvn: record.testId }, 200);
      } else {
        await postToNibss('/api/validateNin', { nin: record.testId }, 200);
      }
    } catch (error) {
      return res.status(error.status ?? 502).json({ success: false, message: error.message });
    }
    record.status = 'verified';
    await record.save();
  }
  // Repeating this update is safe if an earlier request stopped after saving verification.
  await Customer.updateOne({ _id: req.customer._id }, { $set: { onboardingStatus: 'verified' } });
  res.json({ success: true, message: 'Test identity verified.', onboarding: { type: record.type, status: 'verified' } });
});
