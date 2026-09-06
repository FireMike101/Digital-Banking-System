import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { Customer } from '../src/models/customer.js';
import { Session } from '../src/models/session.js';

test('registration, login, private profile, expiry and logout', async (t) => {
  // Replace database calls for this test only. No .env file or Atlas connection is used.
  const customers = [];
  const sessions = [];
  t.mock.method(Customer, 'create', async (data) => {
    if (customers.some((customer) => customer.email === data.email)) {
      throw Object.assign(new Error('Duplicate'), { code: 11000 });
    }
    const customer = { ...data, _id: String(customers.length + 1), onboardingStatus: 'unverified' };
    customers.push(customer);
    return customer;
  });
  t.mock.method(Customer, 'findOne', ({ email }) => ({
    select: async () => customers.find((customer) => customer.email === email),
  }));
  t.mock.method(Customer, 'findById', async (id) => customers.find((customer) => customer._id === id));
  t.mock.method(Session, 'create', async (data) => sessions.push(data));
  t.mock.method(Session, 'findOne', async ({ tokenHash }) => sessions.find((session) => session.tokenHash === tokenHash));
  t.mock.method(Session, 'deleteOne', async ({ tokenHash }) => {
    const index = sessions.findIndex((session) => session.tokenHash === tokenHash);
    if (index !== -1) sessions.splice(index, 1);
  });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  async function request(path, method = 'GET', body, token) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const details = { fullName: 'Test Customer', email: ' TEST@example.com ', password: 'testing-password-123' };

  await t.test('rejects invalid input before database access', async () => {
    for (const body of [null, {}, { ...details, email: { $ne: null } }, { ...details, password: 'short' },
      { ...details, password: 'a'.repeat(73) }, { ...details, fullName: 123 }]) {
      assert.equal((await request('/register', 'POST', body)).status, 400);
    }
    assert.equal(customers.length, 0);
  });

  await t.test('hashes passwords, ignores verification input and rejects duplicate emails', async () => {
    const result = await request('/register', 'POST', { ...details, onboardingStatus: 'verified' });
    assert.equal(result.status, 201);
    assert.equal(result.body.customer.email, 'test@example.com');
    assert.equal(result.body.customer.onboardingStatus, 'unverified');
    assert.equal(result.body.customer.passwordHash, undefined);
    assert.notEqual(customers[0].passwordHash, details.password);
    assert.equal(await bcrypt.compare(details.password, customers[0].passwordHash), true);
    assert.equal((await request('/register', 'POST', { ...details, email: 'test@example.com' })).status, 409);
  });

  await t.test('rejects unknown emails, wrong passwords and missing tokens', async () => {
    for (const body of [{ email: 'missing@example.com', password: details.password },
      { email: details.email, password: 'incorrect-password' }]) {
      assert.equal((await request('/login', 'POST', body)).status, 401);
    }
    assert.equal((await request('/me')).status, 401);
    assert.equal((await request('/me', 'GET', undefined, 'bad-token')).status, 401);
    assert.equal((await request('/me', 'GET', undefined, 'a'.repeat(64))).status, 401);
  });

  await t.test('profile belongs to the token owner; expired and logged-out tokens fail', async () => {
    await request('/register', 'POST', { ...details, email: 'second@example.com' });
    const login = await request('/login', 'POST', { email: details.email, password: details.password });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.notEqual(sessions[0].tokenHash, token);
    const profile = await request('/me?customerId=2', 'GET', undefined, token);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.customer.id, '1');
    assert.equal(profile.body.customer.passwordHash, undefined);
    sessions[0].expiresAt = new Date(Date.now() - 1000);
    assert.equal((await request('/me', 'GET', undefined, token)).status, 401);
    sessions[0].expiresAt = new Date(Date.now() + 60000);
    assert.equal((await request('/logout', 'POST', undefined, token)).status, 200);
    assert.equal((await request('/me', 'GET', undefined, token)).status, 401);
  });

  await t.test('limits repeated authentication attempts', async () => {
    let response;
    for (let attempt = 0; attempt < 21; attempt++) response = await request('/login', 'POST', {});
    assert.equal(response.status, 429);
  });
});
