import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { Account } from '../src/models/account.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';
import { Onboarding } from '../src/models/onboarding.js';

test('account defaults use whole kobo and reject invalid balances', async () => {
  const account = new Account({ customerId: '507f1f77bcf86cd799439011', accountNumber: '1234567890', accountName: 'Test Customer' });
  assert.equal(account.balanceKobo, 1500000);
  assert.equal(account.mode, 'local-test');
  await account.validate();
  for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    account.balanceKobo = amount;
    await assert.rejects(account.validate());
  }
});

test('account creation, duplicate requests, verification and privacy', async (t) => {
  const customers = {
    a: { _id: 'one', onboardingStatus: 'unverified' },
    b: { _id: 'two', onboardingStatus: 'verified' },
  };
  const records = [];
  let verified = false;
  let collisions = 0;
  t.mock.method(Session, 'findOne', async ({ tokenHash }) => {
    const { hashToken } = await import('../src/middleware/authenticate.js');
    return { customerId: tokenHash === hashToken('a'.repeat(64)) ? 'one' : 'two', expiresAt: new Date(Date.now() + 60000) };
  });
  t.mock.method(Customer, 'findById', async (id) => Object.values(customers).find((customer) => customer._id === id));
  t.mock.method(Onboarding, 'findOne', async () => ({ status: verified ? 'verified' : 'created', firstName: 'Test', lastName: 'Customer' }));
  t.mock.method(Account, 'findOne', async ({ customerId }) => records.find((account) => account.customerId === customerId));
  t.mock.method(Account, 'create', async (data) => {
    if (records.some((account) => account.customerId === data.customerId)) {
      throw Object.assign(new Error('Duplicate customer'), { code: 11000, keyPattern: { customerId: 1 } });
    }
    if (collisions > 0) {
      collisions--;
      throw Object.assign(new Error('Duplicate account number'), { code: 11000, keyPattern: { accountNumber: 1 } });
    }
    const account = { ...data, balanceKobo: 1500000, currency: 'NGN', mode: 'local-test' };
    records.push(account);
    return account;
  });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  async function request(path = '', method = 'GET', body, user = 'a') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/accounts${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.repeat(64)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  await t.test('requires login and both saved verification statuses', async () => {
    assert.equal((await request('', 'POST', undefined, '')).status, 401);
    assert.equal((await request('', 'POST')).status, 403);
    customers.a.onboardingStatus = 'verified';
    assert.equal((await request('', 'POST')).status, 403);
    verified = true;
    assert.equal((await request('', 'POST', { balanceKobo: 9999999 })).status, 400);
    assert.equal(records.length, 0);
  });

  await t.test('creates one funded account even when requests arrive together', async () => {
    const results = await Promise.all([request('', 'POST'), request('', 'POST')]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal(records.length, 1);
    assert.equal(records[0].balanceKobo, 1500000);
    const created = results.find((result) => result.status === 201).body.account;
    assert.equal(created.balance, 15000);
    assert.equal(created.mode, 'local-test');
    assert.match(created.accountNumber, /^\d{10}$/);
    assert.equal((await request('', 'POST')).status, 409);
    assert.equal(records[0].balanceKobo, 1500000);
  });

  await t.test('account and balance are isolated by the login token', async () => {
    assert.equal((await request('/me?customerId=one', 'GET', undefined, 'b')).status, 404);
    assert.equal((await request('/balance?customerId=one', 'GET', undefined, 'b')).status, 404);
    const mine = await request('/me?customerId=two');
    assert.equal(mine.body.account.accountNumber, records[0].accountNumber);
    assert.equal(mine.body.account.customerId, undefined);
    assert.equal((await request('/balance')).body.balance, 15000);
  });

  await t.test('bounds account-number collision retries', async () => {
    collisions = 3;
    assert.equal((await request('', 'POST', undefined, 'b')).status, 503);
    assert.equal(records.length, 1);
    collisions = 1;
    assert.equal((await request('', 'POST', undefined, 'b')).status, 201);
    assert.equal(records.length, 2);
  });
});
