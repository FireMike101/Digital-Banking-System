import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { Account } from '../src/models/account.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';
import { Transaction } from '../src/models/transaction.js';

test('transfer validates ownership, balance, recipient, and provider result', async (t) => {
  const oldKey = process.env.NIBSS_API_KEY;
  const oldSecret = process.env.NIBSS_API_SECRET;
  const oldCode = process.env.NIBSS_BANK_CODE;
  process.env.NIBSS_API_KEY = 'fake-key';
  process.env.NIBSS_API_SECRET = 'fake-secret';
  process.env.NIBSS_BANK_CODE = '870';
  t.after(() => {
    if (oldKey === undefined) delete process.env.NIBSS_API_KEY; else process.env.NIBSS_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.NIBSS_API_SECRET; else process.env.NIBSS_API_SECRET = oldSecret;
    if (oldCode === undefined) delete process.env.NIBSS_BANK_CODE; else process.env.NIBSS_BANK_CODE = oldCode;
  });

  const realFetch = globalThis.fetch;
  let sender;
  let balance = 15000;
  let recipientBankCode = '870';
  let transferFailure = 0;
  let transferTimeout = false;
  let providerCalls = 0;
  const transactions = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/token')) return Response.json({ token: 'bank-token' });
    providerCalls++;
    assert.equal(options.headers.Authorization, 'Bearer bank-token');
    if (url.includes('/name-enquiry/')) return Response.json({
      accountNumber: '8701111111', accountName: 'Recipient Test', bankCode: recipientBankCode,
    });
    if (url.includes('/balance/')) return Response.json({ balance });
    assert.ok(url.endsWith('/api/transfer'));
    assert.deepEqual(JSON.parse(options.body), { from: '8708090496', to: '8701111111', amount: 1000 });
    if (transferTimeout) throw new Error('test timeout');
    if (transferFailure) return Response.json({ message: 'rejected' }, { status: transferFailure });
    return Response.json({ message: 'Transfer successful', transaction: { reference: `provider-${transactions.length}` } });
  });
  t.mock.method(Session, 'findOne', async () => ({ customerId: 'owner', expiresAt: new Date(Date.now() + 60000) }));
  t.mock.method(Customer, 'findById', async () => ({ _id: 'owner' }));
  t.mock.method(Account, 'findOne', async ({ customerId }) => {
    assert.equal(customerId, 'owner');
    return sender;
  });
  t.mock.method(Transaction, 'create', async (data) => {
    const transaction = { ...data, status: 'pending', save: async () => {} };
    transactions.push(transaction);
    return transaction;
  });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  async function transfer(body, loggedIn = true) {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/transactions/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(loggedIn ? { Authorization: `Bearer ${'a'.repeat(64)}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await transfer({}, false)).status, 401);
  for (const body of [null, {}, { recipientAccount: '123', amount: 1 },
    { recipientAccount: '8701111111', amount: 0 }, { recipientAccount: '8701111111', amount: 1.001 },
    { recipientAccount: '8701111111', amount: 1, narration: 123 },
    { recipientAccount: '8701111111', amount: 1, senderAccount: '8700000000' }]) {
    assert.equal((await transfer(body)).status, 400);
  }
  assert.equal(providerCalls, 0);

  assert.equal((await transfer({ recipientAccount: '8701111111', amount: 1000 })).status, 403);
  sender = { accountNumber: '8708090496', mode: 'local-test', status: 'active' };
  assert.equal((await transfer({ recipientAccount: '8701111111', amount: 1000 })).status, 403);
  sender.mode = 'nibss';
  assert.equal((await transfer({ recipientAccount: '8708090496', amount: 1000 })).status, 400);
  delete process.env.NIBSS_BANK_CODE;
  assert.equal((await transfer({ recipientAccount: '8701111111', amount: 1000 })).status, 503);
  process.env.NIBSS_BANK_CODE = '870';
  assert.equal(providerCalls, 0);

  balance = 500;
  assert.equal((await transfer({ recipientAccount: '8701111111', amount: 1000 })).body.message, 'Insufficient funds.');
  assert.equal(transactions.length, 0);
  balance = 15000;

  const successful = await transfer({ recipientAccount: '8701111111', amount: 1000, narration: ' Test transfer ' });
  assert.equal(successful.status, 201);
  assert.equal(successful.body.transaction.status, 'successful');
  assert.equal(successful.body.transaction.transferType, 'intra-bank');
  assert.equal(successful.body.transaction.amount, 1000);
  assert.equal(transactions[0].customerId, 'owner');
  assert.equal(transactions[0].narration, 'Test transfer');
  assert.doesNotMatch(JSON.stringify(successful.body), /bank-token|fake-secret/);

  recipientBankCode = '999';
  const interBank = await transfer({ recipientAccount: '8701111111', amount: 1000 });
  assert.equal(interBank.body.transaction.transferType, 'inter-bank');

  transferFailure = 400;
  const rejected = await transfer({ recipientAccount: '8701111111', amount: 1000 });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.status, 'failed');
  assert.equal(transactions.at(-1).status, 'failed');

  transferFailure = 0;
  transferTimeout = true;
  const uncertain = await transfer({ recipientAccount: '8701111111', amount: 1000 });
  assert.equal(uncertain.status, 504);
  assert.equal(uncertain.body.status, 'pending');
  assert.match(uncertain.body.reference, /^[0-9a-f-]{36}$/);
  assert.equal(transactions.at(-1).status, 'pending');
});
