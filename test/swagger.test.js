import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

test('Swagger page, assets and OpenAPI definition are served without a database', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/api/docs/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /swagger-ui/);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  assert.equal((await fetch(`${base}/api/docs/swagger-ui-init.js`)).status, 200);
  const spec = await (await fetch(`${base}/api/docs.json`)).json();
  assert.equal(spec.openapi, '3.0.3');
  assert.deepEqual(spec.paths['/api/auth/me'].get.security, [{ bearerAuth: [] }]);
  assert.ok(spec.paths['/api/auth/register'].post.responses['409']);
});
