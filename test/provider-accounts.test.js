import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { Account } from '../src/models/account.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';
import { Onboarding } from '../src/models/onboarding.js';
import { toKobo, createProviderAccount } from '../src/services/provider-banking.js';

test('provider account requests use lowercase identity types', async (t) => {
  let sentBody;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sentBody = JSON.parse(options.body);
    return Response.json({ accountNumber: '1234567890', accountName: 'Test Customer', balance: 15000 });
  });
  for (const type of ['BVN', 'NIN']) {
    await createProviderAccount({ type, testId: '12345678901', dob: '1995-06-15' }, 'fake-token');
    assert.equal(sentBody.kycType, type === 'BVN' ? 'bvn' : 'nin');
    assert.equal(sentBody.kycID, '12345678901');
    assert.equal(sentBody.dob, '1995-06-15');
  }
});

test('provider balance validation rejects invalid money', () => {
  assert.equal(toKobo(15000), 1500000);
  assert.equal(toKobo(0.29), 29);
  for (const value of ['15000', -1, NaN, Infinity, 1.001, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => toKobo(value));
  }
});

test('provider account flow uses authenticated ownership and never simulates provider success', async (t) => {
  // This test does not load .env or send any requests to the real provider.
  const originalKey = process.env.NIBSS_API_KEY;
  const originalSecret = process.env.NIBSS_API_SECRET;
  process.env.NIBSS_API_KEY = 'fake-key';
  process.env.NIBSS_API_SECRET = 'fake-secret';
  t.after(() => {
    if (originalKey === undefined) delete process.env.NIBSS_API_KEY; else process.env.NIBSS_API_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.NIBSS_API_SECRET; else process.env.NIBSS_API_SECRET = originalSecret;
  });
  const realFetch = globalThis.fetch;
  let record;
  let verified = false;
  let createStatus = 200;
  let balanceStatus = 200;
  let openingBalance = 15000;
  let malformed = false;
  let createCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/token')) return Response.json({ token: 'private-bank-token' });
    assert.equal(options.headers.Authorization, 'Bearer private-bank-token');
    if (url.endsWith('/api/account/create')) {
      createCalls++;
      assert.deepEqual(JSON.parse(options.body), { kycType: 'bvn', kycID: '12345678901', dob: '1995-06-15' });
      return Response.json(malformed ? {} : { accountNumber: '1234567890', accountName: 'Test Customer', balance: openingBalance }, { status: createStatus });
    }
    assert.ok(url.endsWith('/api/account/balance/1234567890'));
    return Response.json({ balance: 14000 }, { status: balanceStatus });
  });
  t.mock.method(Session, 'findOne', async () => ({ customerId: 'owner', expiresAt: new Date(Date.now() + 60000) }));
  t.mock.method(Customer, 'findById', async () => ({ _id: 'owner', onboardingStatus: verified ? 'verified' : 'unverified' }));
  t.mock.method(Onboarding, 'findOne', async () => ({
    status: verified ? 'verified' : 'created', type: 'BVN', testId: '12345678901', dob: '1995-06-15', firstName: 'Test', lastName: 'Customer',
  }));
  t.mock.method(Account, 'findOne', async ({ customerId }) => { assert.equal(customerId, 'owner'); return record; });
  t.mock.method(Account, 'create', async (data) => {
    if (record) throw Object.assign(new Error('Duplicate'), { code: 11000 });
    record = { ...data, _id: 'account', currency: 'NGN', save: async () => {} };
    return record;
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  async function request(path = '', method = 'POST', body) {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/accounts${path}`, {
      method, headers: { Authorization: `Bearer ${'a'.repeat(64)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  await t.test('requires verification and configured bank credentials', async () => {
    assert.equal((await request('', 'POST', { balance: 90000 })).status, 400);
    assert.equal((await request('', 'POST', null)).status, 400);
    assert.equal((await request()).status, 403);
    verified = true;
    delete process.env.NIBSS_API_KEY;
    assert.equal((await request()).status, 503);
    assert.equal(record, undefined);
    process.env.NIBSS_API_KEY = 'fake-key';
  });
  await t.test('confirms provider funding without exposing its token', async () => {
    const results = await Promise.all([request(), request()]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    const result = results.find((value) => value.status === 201);
    assert.equal(result.body.account.mode, 'nibss');
    assert.equal(result.body.account.balance, 15000);
    assert.equal(result.body.openingFundingMatchesRequirement, true);
    assert.doesNotMatch(JSON.stringify(result.body), /private-bank-token|fake-secret/);
    assert.equal(createCalls, 1);
    assert.equal((await request()).status, 409);
    assert.equal(createCalls, 1);
  });
  await t.test('reads live balances and does not return cached balances on failure', async () => {
    assert.equal((await request('/balance?customerId=someone-else', 'GET')).body.balance, 14000);
    balanceStatus = 500;
    const failed = await request('/balance', 'GET');
    assert.equal(failed.status, 502);
    assert.equal(failed.body.balance, undefined);
    balanceStatus = 200;
  });
  await t.test('HTTP 500 preserves pending state and blocks another attempt', async () => {
    record = undefined;
    createStatus = 500;
    assert.equal((await request()).status, 502);
    assert.equal(record.status, 'pending');
    const count = createCalls;
    assert.equal((await request()).status, 409);
    assert.equal(createCalls, count);
    assert.deepEqual((await request('/me', 'GET')).body.account, { mode: 'nibss', status: 'pending' });
    assert.equal((await request('/balance', 'GET')).status, 409);
  });
  await t.test('incomplete success responses also remain pending', async () => {
    record = undefined;
    createStatus = 200;
    malformed = true;
    assert.equal((await request()).status, 502);
    assert.equal(record.status, 'pending');
  });
});
