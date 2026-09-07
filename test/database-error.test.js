import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDatabaseError } from '../src/utils/database-error.js';

test('database diagnostics preserve useful errors without exposing credentials', () => {
  const uri = 'mongodb+srv://test:secret%40pass@example.mongodb.net/test';
  const message = safeDatabaseError({ name: 'MongoNetworkError', code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR',
    message: `TLS connection failed using ${uri}; password secret@pass or secret%40pass` }, uri);
  assert.match(message, /ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR/);
  assert.match(message, /TLS connection failed/);
  assert.doesNotMatch(message, /secret|mongodb\+srv:\/\//);
  assert.match(safeDatabaseError({ message: 'Invalid connection string' }, 'not-a-uri'), /Invalid connection string/);
});
