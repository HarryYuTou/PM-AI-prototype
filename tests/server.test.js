import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server.mjs';

async function request(url, method = 'GET') {
  const result = {};
  await handleRequest({ url, method }, {
    writeHead(status, headers = {}) { result.status = status; result.headers = headers; },
    end(body) { result.body = body; }
  });
  return result;
}

test('local server serves the page, scripts, styles, and bundled sample illustrations', async () => {
  const routes = [ ['/', 'text/html'], ['/src/app.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/assets/tray-complete.svg', 'image/svg+xml'], ['/favicon.svg', 'image/svg+xml'] ];
  for (const [url, type] of routes) {
    const result = await request(url); assert.equal(result.status, 200); assert.ok(result.body.length > 0);
    assert.ok(result.headers['Content-Type'].startsWith(type));
  }
});

test('local server rejects hidden files, traversal, unexpected files, and write requests', async () => {
  for (const url of ['/.git/config', '/.env', '/package.json', '/tests/app.test.js', '/src/%2e%2e/.git/config', '/assets/unknown.svg', '/%E0%A4%A']) assert.equal((await request(url)).status, 404);
  assert.equal((await request('/', 'POST')).status, 405);
  const head = await request('/', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, undefined);
});
