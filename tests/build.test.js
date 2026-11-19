import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('offline build embeds all assets and produces syntactically valid application code', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const html = await readFile('dist/index.html', 'utf8');
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    assert.equal(document.querySelectorAll('script[src],link[rel="stylesheet"]').length, 0);
    assert.ok(document.querySelector('style').textContent.length > 1000);
    const script = document.querySelector('script[type="module"]').textContent;
    assert.equal(/\/assets\/tray-/.test(script), false);
    assert.equal(/\/favicon\.svg/.test(script), false);
    assert.equal(/^import /m.test(script), false);
    const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: script, encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
  } finally { dom.window.close(); }
});
