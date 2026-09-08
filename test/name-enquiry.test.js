import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';

test('name enquiry validates and confirms recipient details', async (t) => {
  const oldKey = process.env.NIBSS_API_KEY;
  const oldSecret = process.env.NIBSS_API_SECRET;
  process.env.NIBSS_API_KEY = 'fake-key';
  process.env.NIBSS_API_SECRET = 'fake-secret';
  t.after(() => {
    if (oldKey === undefined) delete process.env.NIBSS_API_KEY; else process.env.NIBSS_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.NIBSS_API_SECRET; else process.env.NIBSS_API_SECRET = oldSecret;
  });

  const realFetch = globalThis.fetch;
  let enquiryStatus = 200;
  let malformed = false;
  let enquiryCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/token')) return Response.json({ token: 'private-bank-token' });
    enquiryCalls++;
    assert.ok(url.endsWith('/api/account/name-enquiry/8708090496'));
    assert.equal(options.headers.Authorization, 'Bearer private-bank-token');
    return Response.json(malformed ? { accountName: 'Micheal Fire' } : {
      accountNumber: '8708090496', accountName: 'Micheal Fire', bankCode: '870',
    }, { status: enquiryStatus });
  });
  t.mock.method(Session, 'findOne', async () => ({ customerId: 'owner', expiresAt: new Date(Date.now() + 60000) }));
  t.mock.method(Customer, 'findById', async () => ({ _id: 'owner' }));

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  async function enquiry(number, loggedIn = true) {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/accounts/name-enquiry/${number}`, {
      headers: loggedIn ? { Authorization: `Bearer ${'a'.repeat(64)}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await enquiry('8708090496', false)).status, 401);
  assert.equal((await enquiry('123')).status, 400);
  assert.equal((await enquiry('abcdefghij')).status, 400);
  assert.equal(enquiryCalls, 0);

  const success = await enquiry('8708090496');
  assert.equal(success.status, 200);
  assert.deepEqual(success.body.account, {
    accountNumber: '8708090496', accountName: 'Micheal Fire', bankCode: '870',
  });
  assert.doesNotMatch(JSON.stringify(success.body), /private-bank-token|fake-secret/);

  enquiryStatus = 404;
  assert.equal((await enquiry('8708090496')).status, 404);
  enquiryStatus = 200;
  malformed = true;
  assert.equal((await enquiry('8708090496')).status, 502);
});
