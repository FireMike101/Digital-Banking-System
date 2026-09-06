import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { Account } from '../models/account.js';
import { Onboarding } from '../models/onboarding.js';

export const accountRouter = Router();
accountRouter.use(authenticate);
accountRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function accountDetails(account) {
  return {
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    balance: account.balanceKobo / 100,
    currency: account.currency,
    mode: account.mode,
  };
}

accountRouter.post('/', async (req, res) => {
  // The customer cannot choose an owner, balance or verification status in this request.
  if (req.body !== undefined && (!req.body || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
    return res.status(400).json({ success: false, message: 'Send no body, or an empty JSON object.' });
  }
  const onboarding = await Onboarding.findOne({ customerId: req.customer._id });
  if (req.customer.onboardingStatus !== 'verified' || onboarding?.status !== 'verified') {
    return res.status(403).json({ success: false, message: 'Complete BVN or NIN verification before creating an account.' });
  }

  // A random number can rarely collide. Retry only that case, not duplicate customers.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const account = await Account.create({
        customerId: req.customer._id,
        accountNumber: String(randomInt(1000000000, 10000000000)),
        accountName: `${onboarding.firstName} ${onboarding.lastName}`,
      });
      return res.status(201).json({ success: true, account: accountDetails(account) });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.customerId) {
        return res.status(409).json({ success: false, message: 'You already have an account.' });
      }
      if (error.code === 11000 && error.keyPattern?.accountNumber) continue;
      throw error;
    }
  }
  res.status(503).json({ success: false, message: 'Could not generate an account number. Please try again.' });
});

accountRouter.get('/me', async (req, res) => {
  // Always look up the owner from the login token, never from request parameters.
  const account = await Account.findOne({ customerId: req.customer._id });
  if (!account) return res.status(404).json({ success: false, message: 'You have not created an account yet.' });
  res.json({ success: true, account: accountDetails(account) });
});

accountRouter.get('/balance', async (req, res) => {
  const account = await Account.findOne({ customerId: req.customer._id });
  if (!account) return res.status(404).json({ success: false, message: 'You have not created an account yet.' });
  res.json({ success: true, balance: account.balanceKobo / 100, currency: account.currency, mode: account.mode });
});
