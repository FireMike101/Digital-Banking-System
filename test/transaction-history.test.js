import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';
import { Account } from '../src/models/account.js';
import { Transaction } from '../src/models/transaction.js';
import { getProviderTransactionStatus } from '../src/services/provider-banking.js';

test('provider transaction statuses are normalized', async (t) => {
  const oldKey = process.env.NIBSS_API_KEY;
  const oldSecret = process.env.NIBSS_API_SECRET;
  process.env.NIBSS_API_KEY = 'fake-key';
  process.env.NIBSS_API_SECRET = 'fake-secret';
  t.after(() => {
    if (oldKey === undefined) delete process.env.NIBSS_API_KEY; else process.env.NIBSS_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.NIBSS_API_SECRET; else process.env.NIBSS_API_SECRET = oldSecret;
  });
  let status = 'completed';
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/api/auth/token')) return Response.json({ token: 'bank-token' });
    return Response.json({ transaction: { status } });
  });
  for (const value of ['success', 'successful', 'completed']) {
    status = value;
    assert.equal(await getProviderTransactionStatus('provider-ref'), 'successful');
  }
  for (const value of ['failed', 'failure', 'reversed']) {
    status = value;
    assert.equal(await getProviderTransactionStatus('provider-ref'), 'failed');
  }
  for (const value of ['pending', 'processing']) {
    status = value;
    assert.equal(await getProviderTransactionStatus('provider-ref'), 'pending');
  }
  status = 'mystery';
  await assert.rejects(getProviderTransactionStatus('provider-ref'), /unknown transaction status/);
});

test('history and status only return the logged-in customer’s transactions', async (t) => {
  const oldKey = process.env.NIBSS_API_KEY;
  const oldSecret = process.env.NIBSS_API_SECRET;
  process.env.NIBSS_API_KEY = 'fake-key';
  process.env.NIBSS_API_SECRET = 'fake-secret';
  t.after(() => {
    if (oldKey === undefined) delete process.env.NIBSS_API_KEY; else process.env.NIBSS_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.NIBSS_API_SECRET; else process.env.NIBSS_API_SECRET = oldSecret;
  });
  const ownerReference = '11111111-1111-4111-8111-111111111111';
  const otherReference = '22222222-2222-4222-8222-222222222222';
  const ownerTransaction = {
    customerId: 'owner', reference: ownerReference, providerReference: 'provider-1',
    sourceAccount: '8708090496', recipientAccount: '8701111111', recipientName: 'Recipient Test',
    recipientBankCode: '870', transferType: 'intra-bank', amountKobo: 100000,
    narration: 'Test', status: 'pending', createdAt: new Date('2026-09-08T10:00:00Z'),
    save: async () => {},
  };
  const pendingWithoutProviderReference = {
    ...ownerTransaction, reference: '33333333-3333-4333-8333-333333333333', providerReference: undefined,
  };
  const incomingTransaction = {
    ...ownerTransaction,
    customerId: 'another-customer',
    reference: '44444444-4444-4444-8444-444444444444',
    sourceAccount: '8702222222',
    recipientAccount: '8708090496',
    status: 'successful',
  };
  let statusResponse = 'completed';
  let providerStatusCalls = 0;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/api/auth/token')) return Response.json({ token: 'bank-token' });
    providerStatusCalls++;
    assert.ok(url.endsWith('/api/transaction/provider-1'));
    return Response.json({ data: { status: statusResponse } });
  });
  t.mock.method(Session, 'findOne', async () => ({ customerId: 'owner', expiresAt: new Date(Date.now() + 60000) }));
  t.mock.method(Customer, 'findById', async () => ({ _id: 'owner' }));
  t.mock.method(Account, 'findOne', async ({ customerId }) => {
    assert.equal(customerId, 'owner');
    return { accountNumber: '8708090496' };
  });
  t.mock.method(Transaction, 'find', (filter) => {
    assert.deepEqual(filter, { $or: [
      { customerId: 'owner' },
      { recipientAccount: '8708090496', status: 'successful' },
    ] });
    return { sort: (sort) => {
      assert.deepEqual(sort, { createdAt: -1 });
      return { limit: async (limit) => {
        assert.equal(limit, 100);
        return [incomingTransaction, ownerTransaction, pendingWithoutProviderReference];
      } };
    } };
  });
  t.mock.method(Transaction, 'findOne', async (filter) => {
    assert.equal(filter.customerId, 'owner');
    if (filter.reference === ownerReference) return ownerTransaction;
    if (filter.reference === pendingWithoutProviderReference.reference) return pendingWithoutProviderReference;
    return undefined;
  });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  async function request(path, loggedIn = true) {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/transactions${path}`, {
      headers: loggedIn ? { Authorization: `Bearer ${'a'.repeat(64)}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await request('/history', false)).status, 401);
  const history = await request('/history?customerId=another-customer');
  assert.equal(history.status, 200);
  assert.equal(history.body.count, 3);
  assert.equal(history.body.transactions[0].customerId, undefined);
  assert.equal(history.body.transactions[0]._id, undefined);
  assert.equal(history.body.transactions[0].direction, 'incoming');
  assert.equal(history.body.transactions[1].direction, 'outgoing');

  assert.equal((await request('/status/not-a-uuid')).status, 400);
  assert.equal((await request(`/status/${otherReference}`)).status, 404);
  assert.equal(providerStatusCalls, 0);

  const refreshed = await request(`/status/${ownerReference}?customerId=another-customer`);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.transaction.status, 'successful');
  assert.equal(providerStatusCalls, 1);

  const pending = await request(`/status/${pendingWithoutProviderReference.reference}`);
  assert.equal(pending.status, 200);
  assert.equal(pending.body.transaction.status, 'pending');
  assert.match(pending.body.message, /manual review/);
  assert.equal(providerStatusCalls, 1);
});
