import mongoose from 'mongoose';
import { Customer } from '../models/customer.js';
import { Onboarding } from '../models/onboarding.js';
import { Account } from '../models/account.js';
import { findProviderAccount, getProviderIdentity, getProviderBalance } from './provider-banking.js';

function stop(message) {
  const error = new Error(message);
  error.publicMessage = message;
  throw error;
}

// Operator-only helper. Never expose this as a public account-claiming endpoint.
export async function linkProviderAccount(email, accountNumber) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof accountNumber !== 'string' || !/^\d{10}$/.test(accountNumber)) {
    stop('Enter a valid customer email and 10-digit provider account number.');
  }
  const customer = await Customer.findOne({ email: email.trim().toLowerCase() });
  if (!customer) stop('No app customer has that email. Register the customer before linking.');

  const provider = await findProviderAccount(accountNumber);
  const type = provider.kycType;
  if (typeof provider.kycID !== 'string' || !/^\d{11}$/.test(provider.kycID) ||
      typeof provider.accountName !== 'string' || !provider.accountName.trim()) {
    stop('The provider account is missing its identity or account name.');
  }
  const identity = await getProviderIdentity(type, provider.kycID);
  const balanceKobo = await getProviderBalance(accountNumber);

  await mongoose.connection.transaction(async (session) => {
    const currentCustomer = await Customer.findById(customer._id).session(session);
    if (!currentCustomer) stop('The customer no longer exists. Nothing was linked.');
    const owner = await Account.findOne({ accountNumber }).session(session);
    if (owner && String(owner.customerId) !== String(customer._id)) stop('This account is already linked to another customer.');
    const existing = await Account.findOne({ customerId: customer._id }).session(session);
    if (existing?.mode === 'nibss' && existing.status === 'active' && existing.accountNumber !== accountNumber) {
      stop('This customer already has a different active provider account.');
    }
    const identityOwner = await Onboarding.findOne({ type: type.toUpperCase(), testId: provider.kycID }).session(session);
    if (identityOwner && String(identityOwner.customerId) !== String(customer._id)) {
      stop('The provider identity is already linked to another customer.');
    }

    // A transaction saves all three records together, or rolls them all back on failure.
    await Onboarding.findOneAndUpdate({ customerId: customer._id }, { $set: {
      type: type.toUpperCase(), testId: provider.kycID, firstName: identity.firstName,
      lastName: identity.lastName, dob: identity.dob.slice(0, 10), status: 'verified',
    } }, { upsert: true, runValidators: true, session });
    await Account.findOneAndUpdate({ customerId: customer._id }, { $set: {
      accountNumber, accountName: provider.accountName, balanceKobo, currency: 'NGN', mode: 'nibss', status: 'active',
    }, ...(existing && existing.accountNumber !== accountNumber ? { $unset: { openingBalanceKobo: 1 } } : {}) },
    { upsert: true, runValidators: true, session });
    await Customer.updateOne({ _id: customer._id }, { $set: { onboardingStatus: 'verified' } }, { session });
  });
  return { accountNumber, accountName: provider.accountName, balance: balanceKobo / 100, currency: 'NGN', mode: 'nibss' };
}
