import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';

// DOM integration tests run the real app, domain and recognition code in memory.
// IndexedDB and image decoding are test doubles; these tests do not substitute
// for a real browser's rendering, camera, image decoder or persistence checks.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const modules = await Promise.all(['domain', 'recognition', 'images', 'seed', 'app'].map(async name => (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8')).replace(/^import .+ from .+;\n/gm, '').replace(/^export /gm, '')));
const source = `const { getCopies, getChecks, saveCopy, saveCheck, storageError } = window.testStorage;\n${modules.join('\n')}`;

function store() {
  const data = { copies: [], checks: [], failSave: false, copyWrites: 0, checkWrites: 0 };
  return {
    data,
    async getCopies() { return structuredClone(data.copies); },
    async getChecks() { return structuredClone(data.checks); },
    async saveCopy(copy) {
      if (data.copies.some(c => c.barcode.toLowerCase() === copy.barcode.toLowerCase())) throw Object.assign(new Error('Duplicate barcode.'), { name: 'ConstraintError' });
      data.copyWrites++; data.copies.push(structuredClone(copy));
    },
    async saveCheck(record) {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (data.failSave) throw new Error('Browser storage is full. Check was not saved.');
      data.checkWrites++; data.checks.push(structuredClone(record));
    },
    storageError: error => error.message
  };
}

async function until(predicate, message = 'Condition did not become true') {
  for (let i = 0; i < 60; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail(message);
}

async function app(test, storage = store()) {
  const dom = new JSDOM(html, { url: 'http://shelfcheck.test', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.testStorage = storage;
  Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;
  w.URL.createObjectURL = () => 'blob:local-test-image';
  w.URL.revokeObjectURL = () => {};
  w.Image.prototype.decode = async function () { Object.defineProperties(this, { naturalWidth: { value: 100 }, naturalHeight: { value: 100 } }); };
  w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,TEST';
  const errors = [];
  w.addEventListener('error', event => { errors.push(event.error); });
  w.eval(source);
  test.after(() => { assert.deepEqual(errors, [], 'Unexpected DOM runtime error'); w.close(); });
  await until(() => w.document.querySelector('.copy-strip'), 'Workspace failed to initialize');
  const find = selector => w.document.querySelector(selector);
  const click = selector => { const element = find(selector); assert.ok(element, `Missing element: ${selector}`); element.click(); };
  const input = (selector, value) => { const element = find(selector); assert.ok(element, `Missing input: ${selector}`); element.value = value; element.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (selector, value) => { const element = find(selector); element.value = value; element.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const submit = selector => find(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const upload = (selector, type = 'image/png', name = 'pieces.png') => { const element = find(selector); Object.defineProperty(element, 'files', { configurable: true, value: [new w.File(['test-image-bytes'], name, { type })] }); element.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const confirmAll = () => [...w.document.querySelectorAll('[data-confirm-id]')].forEach(checkbox => { if (!checkbox.checked) checkbox.click(); });
  return { dom, w, find, click, input, change, submit, upload, confirmAll, storage };
}

test('missing-piece flow saves one hold record, retains history across app reload, and prevents duplicate save', async t => {
  const a = await app(t);
  assert.match(a.find('.prototype-note').textContent, /not connected/);
  assert.equal(a.storage.data.copies.length, 1);
  a.click('[data-action="run"]'); await until(() => a.find('.results-table'));
  assert.equal(a.find('#count-pawns').value, '3');
  assert.equal(a.find('#count-cards').value, '');
  assert.equal(a.find('[data-action="save-ready"]').disabled, true);
  a.input('#count-cards', '30'); a.confirmAll();
  assert.equal(a.find('[data-action="save-hold"]').disabled, false);
  assert.equal(a.find('[data-action="save-ready"]').disabled, true);
  a.click('[data-action="save-hold"]'); a.click('[data-action="save-hold"]');
  await until(() => a.find('#completed-heading'));
  assert.equal(a.storage.data.checkWrites, 1);
  assert.deepEqual(a.storage.data.checks[0].missing, [{ name: 'Player pawns', quantity: 1 }]);
  const reloaded = await app(t, a.storage);
  reloaded.click('[data-action="history"]');
  assert.equal(reloaded.find('.history-content').hidden, false);
  assert.match(reloaded.find('.history-record').textContent, /1 × Player pawns missing/);
  assert.match(reloaded.find('.copy-description').textContent, /On hold/);
  assert.equal(a.storage.data.copyWrites, 1, 'Reload must not reseed the sample');
});

test('complete flow requires a manual card count and every confirmation; changing a count clears confirmation', async t => {
  const a = await app(t); a.change('#demo-scenario', 'complete');
  a.click('[data-action="run"]'); await until(() => a.find('.results-table'));
  a.confirmAll(); assert.equal(a.find('[data-action="save-ready"]').disabled, true);
  a.input('#count-cards', '30'); a.confirmAll();
  assert.equal(a.find('[data-action="save-ready"]').disabled, false);
  a.input('#count-dice', '3');
  assert.equal(a.find('[data-confirm-id="dice"]').checked, false);
  a.confirmAll(); assert.equal(a.find('[data-action="save-ready"]').disabled, true);
  a.input('#count-dice', '2'); a.confirmAll();
  a.click('[data-action="save-ready"]'); await until(() => a.find('#completed-heading'));
  assert.match(a.find('#completed-heading').textContent, /next player/);
  assert.equal(a.storage.data.checks[0].disposition, 'ready');
  assert.deepEqual(a.storage.data.checks[0].missing, []);
});

test('uncertain scenario exposes both manual groups and preserves entered values when switching photo views', async t => {
  const a = await app(t); a.change('#demo-scenario', 'uncertain');
  a.click('[data-action="run"]'); await until(() => a.find('.results-table'));
  assert.equal(a.find('#count-tiles').value, ''); assert.equal(a.find('#count-cards').value, '');
  a.input('#count-tiles', '6'); a.input('#count-cards', '30'); a.confirmAll();
  a.click('[data-action="photo-tab"][data-tab="reference"]');
  assert.equal(a.find('#count-tiles').value, '6');
  assert.equal(a.find('[data-confirm-id="tiles"]').checked, true);
  assert.equal(a.find('[data-action="save-ready"]').disabled, false);
  assert.match(a.find('.photo-label').textContent, /REFERENCE/);
});

test('new copy setup, barcode lookup, photo upload, manual review, and ready record work end-to-end', async t => {
  const a = await app(t); a.click('[data-action="setup"]');
  assert.equal(a.find('#setup-dialog').open, true);
  a.input('[name="game-name"]', 'Catan — copy two'); a.input('[name="copy-barcode"]', 'LIB-002');
  const names = [...a.w.document.querySelectorAll('[name="component-name"]')];
  const counts = [...a.w.document.querySelectorAll('[name="component-quantity"]')];
  names[0].value = 'Dice'; counts[0].value = '2'; names[1].value = 'Cards'; counts[1].value = '20';
  a.w.document.querySelectorAll('[name="component-manual"]')[1].checked = true;
  a.upload('#reference-upload'); await until(() => !a.find('#save-copy-button').disabled);
  a.find('#inventory-confirm').checked = true; a.submit('#setup-form'); a.submit('#setup-form');
  await until(() => !a.find('#setup-dialog').open);
  assert.equal(a.storage.data.copies.length, 2, 'Double submit creates only one copy');
  assert.match(a.find('#copy-heading').textContent, /Catan/);
  assert.equal(a.find('[data-action="run"]').disabled, true);
  a.upload('#return-upload'); await until(() => a.find('.photo-label')?.textContent === 'RETURN PHOTO');
  a.click('[data-action="run"]'); await until(() => a.find('.results-table'));
  assert.match(a.find('.mode-badge').textContent, /MANUAL/);
  assert.ok([...a.w.document.querySelectorAll('.count-input')].every(input => input.value === ''));
  const rows = a.storage.data.copies.find(copy => copy.barcode === 'LIB-002').components;
  for (const row of rows) a.input(`[data-count-id="${row.id}"]`, String(row.expected));
  a.confirmAll(); a.click('[data-action="save-ready"]'); await until(() => a.find('#completed-heading'));
  assert.equal(a.storage.data.checks[0].barcode, 'LIB-002');
  assert.equal(a.storage.data.checks[0].recognitionMode, 'manual');
  a.input('#barcode-input', ' sc-001 '); a.submit('#barcode-form');
  assert.equal(a.find('#copy-heading').textContent, 'Harbor Trail');
  a.input('#barcode-input', 'unknown'); a.submit('#barcode-form');
  assert.match(a.find('#toast').textContent, /No copy matches/);
});

test('duplicate barcode is rejected and no new copy is saved', async t => {
  const a = await app(t); a.click('[data-action="setup"]');
  a.input('[name="game-name"]', 'Duplicate'); a.input('[name="copy-barcode"]', 'sc-001');
  a.submit('#setup-form'); await until(() => !a.find('#setup-error').hidden);
  assert.match(a.find('#setup-error').textContent, /already belongs/);
  assert.equal(a.storage.data.copies.length, 1);
  assert.equal(a.find('#setup-dialog').open, true);
});

test('unsupported upload leaves previous photo intact and reports an actionable error', async t => {
  const a = await app(t); const previous = a.find('.tray-image').getAttribute('src');
  a.upload('#return-upload', 'text/plain', 'not-a-photo.txt');
  await until(() => /Choose a JPG/.test(a.find('#toast').textContent));
  assert.equal(a.find('.tray-image').getAttribute('src'), previous);
  assert.equal(a.find('[data-action="run"]').disabled, false);
});

test('storage failure keeps the editable checklist; success is never shown for a failed save', async t => {
  const a = await app(t); a.change('#demo-scenario', 'complete'); a.click('[data-action="run"]');
  await until(() => a.find('.results-table')); a.input('#count-cards', '30'); a.confirmAll();
  a.storage.data.failSave = true; a.click('[data-action="save-ready"]');
  await until(() => /not saved/.test(a.find('#toast').textContent));
  assert.equal(a.find('#completed-heading'), null); assert.ok(a.find('.results-table'));
  assert.equal(a.storage.data.checks.length, 0);
  assert.equal(a.find('[data-action="save-ready"]').disabled, false);
  a.storage.data.failSave = false; a.click('[data-action="save-ready"]');
  await until(() => a.find('#completed-heading'));
  assert.equal(a.storage.data.checks.length, 1);
});

test('untrusted game and component labels render as text, not executable HTML', async t => {
  const s = store();
  s.data.copies.push({ id: 'custom', name: '<img src=x onerror=alert(1)>', barcode: 'XSS-001', referenceImage: '/assets/tray-complete.svg', components: [{ id: 'piece', name: '<script>alert(1)</script>', expected: 1, manual: false }] });
  const a = await app(t, s);
  assert.equal(a.find('#copy-heading').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(a.find('#copy-heading img'), null);
  assert.equal(a.find('.inventory-list script'), null);
});

test('cancelling a scenario change retains the current review and selected scenario', async t => {
  const a = await app(t); a.click('[data-action="run"]'); await until(() => a.find('.results-table'));
  a.w.confirm = () => false; a.change('#demo-scenario', 'complete');
  assert.equal(a.find('#demo-scenario').value, 'missing');
  assert.equal(a.find('#count-pawns').value, '3');
});

test('blank and negative manual counts cannot be confirmed or saved', async t => {
  const a = await app(t); a.change('#demo-scenario', 'complete'); a.click('[data-action="run"]');
  await until(() => a.find('.results-table')); a.input('#count-cards', '-1'); a.confirmAll();
  assert.equal(a.find('[data-confirm-id="cards"]').disabled, true);
  assert.equal(a.find('[data-action="save-ready"]').disabled, true);
  assert.equal(a.find('[data-action="save-hold"]').disabled, true);
});
