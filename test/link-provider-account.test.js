import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Customer } from '../src/models/customer.js';
import { Onboarding } from '../src/models/onboarding.js';
import { Account } from '../src/models/account.js';
import { linkProviderAccount } from '../src/services/link-provider-account.js';

test('operator linking verifies the bank account and prevents customer ownership conflicts', async (t) => {
  const oldKey = process.env.NIBSS_API_KEY;
  const oldSecret = process.env.NIBSS_API_SECRET;
  process.env.NIBSS_API_KEY = 'fake-key';
  process.env.NIBSS_API_SECRET = 'fake-secret';
  t.after(() => {
    if (oldKey === undefined) delete process.env.NIBSS_API_KEY; else process.env.NIBSS_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.NIBSS_API_SECRET; else process.env.NIBSS_API_SECRET = oldSecret;
  });
  let customer = { _id: 'owner' };
  let existing;
  let otherOwner;
  let identityOwner;
  const writes = [];
  const session = {};
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(!url.endsWith('/api/account/create'));
    if (url.endsWith('/api/auth/token')) return Response.json({ token: 'bank-token' });
    if (url.endsWith('/api/accounts')) return Response.json({ accounts: [{
      accountNumber: '8708090496', accountName: 'Micheal Fire', kycType: 'bvn', kycID: '12341234123',
    }] });
    if (url.endsWith('/api/validateBvn')) {
      assert.deepEqual(JSON.parse(options.body), { bvn: '12341234123' });
      return Response.json({ success: true, data: {
        bvn: '12341234123', firstName: 'Micheal', lastName: 'Fire', dob: '2000-12-03T00:00:00.000Z',
      } });
    }
    assert.ok(url.endsWith('/api/account/balance/8708090496'));
    return Response.json({ balance: 15000 });
  });
  t.mock.method(Customer, 'findOne', async () => customer);
  t.mock.method(Customer, 'findById', () => ({ session: async () => customer }));
  t.mock.method(Account, 'findOne', (filter) => ({ session: async () => filter.accountNumber ? otherOwner : existing }));
  t.mock.method(Onboarding, 'findOne', () => ({ session: async () => identityOwner }));
  t.mock.method(mongoose.connection, 'transaction', async (callback) => callback(session));
  for (const [model, method] of [[Account, 'findOneAndUpdate'], [Onboarding, 'findOneAndUpdate'], [Customer, 'updateOne']]) {
    t.mock.method(model, method, async (filter, update, options) => {
      assert.equal(options.session, session);
      writes.push({ model: model.modelName, filter, update });
    });
  }

  const result = await linkProviderAccount('customer@example.com', '8708090496');
  assert.equal(result.balance, 15000);
  assert.equal(writes.length, 3);
  assert.equal(writes.find((write) => write.model === 'Account').update.$set.mode, 'nibss');
  assert.equal(writes.find((write) => write.model === 'Onboarding').update.$set.testId, '12341234123');
  assert.equal(writes.find((write) => write.model === 'Customer').update.$set.onboardingStatus, 'verified');

  writes.length = 0;
  otherOwner = { customerId: 'someone-else' };
  await assert.rejects(linkProviderAccount('customer@example.com', '8708090496'), /another customer/);
  assert.equal(writes.length, 0);
  otherOwner = undefined;
  existing = { mode: 'nibss', status: 'active', accountNumber: '8700000000' };
  await assert.rejects(linkProviderAccount('customer@example.com', '8708090496'), /different active provider account/);
  assert.equal(writes.length, 0);
  existing = undefined;
  identityOwner = { customerId: 'someone-else' };
  await assert.rejects(linkProviderAccount('customer@example.com', '8708090496'), /identity is already linked/);
  assert.equal(writes.length, 0);
  identityOwner = undefined;
  customer = null;
  await assert.rejects(linkProviderAccount('customer@example.com', '8708090496'), /No app customer/);
  assert.equal(writes.length, 0);
});
