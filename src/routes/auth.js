import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { Customer } from '../models/customer.js';
import { Session } from '../models/session.js';
import { authenticate, hashToken } from '../middleware/authenticate.js';

export const authRouter = Router();

// Slow down repeated attempts to guess passwords.
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { success: false, message: 'Too many attempts. Try again later.' },
});

function validateCredentials(req, res, next) {
  const { email, password } = req.body ?? {};
  // Check types before calling string methods or passing values to MongoDB.
  if (typeof email !== 'string' || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }
  // bcrypt supports at most 72 bytes. Reject longer passwords instead of truncating them.
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ success: false, message: 'Password must be at least 12 characters and at most 72 bytes.' });
  }
  next();
}

function customerDetails(customer) {
  // Only send these fields back; never send the password hash.
  return {
    id: customer._id,
    fullName: customer.fullName,
    email: customer.email,
    onboardingStatus: customer.onboardingStatus,
  };
}

authRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

authRouter.post('/register', loginLimit, validateCredentials, async (req, res) => {
  const { fullName, email, password } = req.body;
  if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Full name must contain 2 to 100 characters.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    // Copy specific fields so a customer cannot submit their own verification status.
    const customer = await Customer.create({ fullName: fullName.trim(), email: email.trim().toLowerCase(), passwordHash });
    res.status(201).json({ success: true, customer: customerDetails(customer) });
  } catch (error) {
    // MongoDB's unique email index also prevents duplicates when requests arrive together.
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email is already registered.' });
    }
    throw error;
  }
});

authRouter.post('/login', loginLimit, validateCredentials, async (req, res) => {
  const { email, password } = req.body;
  const customer = await Customer.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  if (!customer || !(await bcrypt.compare(password, customer.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  // A session is a saved login. Its random token acts like a temporary access pass.
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await Session.create({ tokenHash: hashToken(token), customerId: customer._id, expiresAt });
  res.json({ success: true, token, expiresAt, customer: customerDetails(customer) });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ success: true, customer: customerDetails(req.customer) });
});

authRouter.post('/logout', authenticate, async (req, res) => {
  await Session.deleteOne({ tokenHash: req.tokenHash });
  res.json({ success: true, message: 'Logged out successfully.' });
});
