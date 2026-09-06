import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';
import { Onboarding } from '../src/models/onboarding.js';

test('test identity creation, verification, privacy and provider failures', async (t) => {
  const customer = { _id: 'customer-one', onboardingStatus: 'unverified' };
  let record;
  let providerStatus = 201;
  let networkFailure = false;
  const providerCalls = [];
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    providerCalls.push({ url, body: JSON.parse(options.body) });
    if (networkFailure) throw new Error('Test network failure');
    return new Response('{}', { status: providerStatus });
  });
  t.mock.method(Session, 'findOne', async () => ({ customerId: customer._id, expiresAt: new Date(Date.now() + 60000) }));
  t.mock.method(Customer, 'findById', async () => customer);
  t.mock.method(Customer, 'updateOne', async (filter, update) => {
    assert.equal(filter._id, customer._id);
    customer.onboardingStatus = update.$set.onboardingStatus;
  });
  t.mock.method(Onboarding, 'create', async (data) => {
    if (record) throw Object.assign(new Error('Duplicate'), { code: 11000 });
    record = { ...data, _id: 'record-one', status: 'pending', save: async () => {} };
    return record;
  });
  t.mock.method(Onboarding, 'findOne', async (filter) => {
    assert.equal(filter.customerId, customer._id);
    return record;
  });
  t.mock.method(Onboarding, 'deleteOne', async () => { record = undefined; });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/onboarding`;
  async function request(path = '', method = 'POST', body, loggedIn = true) {
    const response = await localFetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(loggedIn ? { Authorization: `Bearer ${'a'.repeat(64)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const details = { type: 'BVN', firstName: 'Test', lastName: 'Customer', dob: '1995-06-15', phone: '08000000000' };

  await t.test('rejects missing login, submitted identity numbers and invalid dates', async () => {
    assert.equal((await request('', 'POST', details, false)).status, 401);
    assert.equal((await request('', 'POST', { ...details, bvn: '12345678901' })).status, 400);
    assert.equal((await request('', 'POST', { ...details, dob: '1995-02-30' })).status, 400);
    assert.equal((await request('/verify')).status, 409);
    assert.equal(providerCalls.length, 0);
  });

  await t.test('generates a test BVN and blocks duplicate creation', async () => {
    assert.equal((await request('', 'POST', details)).status, 201);
    assert.equal(record.status, 'created');
    assert.equal(customer.onboardingStatus, 'unverified');
    assert.match(providerCalls[0].body.bvn, /^\d{11}$/);
    assert.ok(providerCalls[0].url.endsWith('/api/insertBvn'));
    assert.equal((await request('', 'POST', details)).status, 409);
    assert.equal(providerCalls.length, 1);
    const status = await request('?customerId=someone-else', 'GET');
    assert.deepEqual(status.body.onboarding, { type: 'BVN', status: 'created' });
  });

  await t.test('only provider-confirmed verification marks the customer verified', async () => {
    providerStatus = 404;
    assert.equal((await request('/verify')).status, 502);
    assert.equal(customer.onboardingStatus, 'unverified');
    providerStatus = 200;
    assert.equal((await request('/verify')).status, 200);
    assert.equal(customer.onboardingStatus, 'verified');
    assert.ok(providerCalls.at(-1).url.endsWith('/api/validateBvn'));
    assert.equal(providerCalls.at(-1).body.bvn, record.testId);
    const count = providerCalls.length;
    assert.equal((await request('/verify')).status, 200);
    assert.equal(providerCalls.length, count);
  });

  await t.test('creates and verifies NIN using its own endpoints', async () => {
    record = undefined;
    customer.onboardingStatus = 'unverified';
    assert.equal((await request('', 'POST', { ...details, type: 'NIN' })).status, 201);
    assert.ok(providerCalls.at(-1).url.endsWith('/api/insertNin'));
    assert.equal(providerCalls.at(-1).body.phone, undefined);
    assert.equal((await request('/verify')).status, 200);
    assert.ok(providerCalls.at(-1).url.endsWith('/api/validateNin'));
    assert.equal(customer.onboardingStatus, 'verified');
  });

  await t.test('definite rejection allows a new attempt; unknown outcomes stay pending', async () => {
    record = undefined;
    customer.onboardingStatus = 'unverified';
    providerStatus = 400;
    assert.equal((await request('', 'POST', details)).status, 502);
    assert.equal(record, undefined);
    networkFailure = true;
    assert.equal((await request('', 'POST', details)).status, 504);
    assert.equal(record.status, 'pending');
    const count = providerCalls.length;
    assert.equal((await request('', 'POST', details)).status, 409);
    assert.equal((await request('/verify')).status, 409);
    assert.equal(providerCalls.length, count);
    assert.equal(customer.onboardingStatus, 'unverified');
  });
});
