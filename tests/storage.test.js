import test from 'node:test';
import assert from 'node:assert/strict';

// These tests check the IndexedDB adapter's event/transaction contract.
// The actual browser database still requires browser acceptance testing.
function databaseHarness() {
  const calls = { stores: [], indexes: [], operations: [] };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore(name, options) {
      calls.stores.push({ name, options });
      return { createIndex(...args) { calls.indexes.push(args); } };
    },
    transaction(name, mode) {
      const request = {};
      const tx = {
        objectStore() { return {
          add(value) { calls.operations.push({ type: 'add', value, name, mode }); return request; },
          getAll() { calls.operations.push({ type: 'getAll', name, mode }); return request; }
        }; }
      };
      calls.tx = tx; calls.request = request;
      return tx;
    },
    close() { calls.closed = true; }
  };
  const factory = { open(name, version) {
    calls.open = { name, version };
    const request = { result: db };
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess(); });
    return request;
  } };
  return { factory, calls, db };
}

let sequence = 0;
const freshStorage = () => import(`../src/storage.js?test=${++sequence}`);
const tick = () => new Promise(resolve => setImmediate(resolve));

test('database upgrade creates separate stores and enforces unique normalized barcodes', async () => {
  const harness = databaseHarness(); globalThis.indexedDB = harness.factory;
  const storage = await freshStorage(); await storage.openDatabase();
  assert.deepEqual(harness.calls.stores, [{ name: 'copies', options: { keyPath: 'id' } }, { name: 'checks', options: { keyPath: 'id' } }]);
  assert.deepEqual(harness.calls.indexes[0], ['barcode', 'barcodeKey', { unique: true }]);
  let settled = false;
  const saving = storage.saveCopy({ id: 'copy-1', barcode: 'LIB-ABC' }).then(() => { settled = true; });
  await tick();
  assert.equal(harness.calls.operations[0].value.barcodeKey, 'lib-abc');
  harness.calls.request.result = 'copy-1'; harness.calls.request.onsuccess();
  await tick(); assert.equal(settled, false, 'Request success alone must not claim data is durable');
  harness.calls.tx.oncomplete(); await saving; assert.equal(settled, true);
  harness.db.onversionchange(); assert.equal(harness.calls.closed, true);
  delete globalThis.indexedDB;
});

test('transaction abort and storage quota failure are reported instead of false success', async () => {
  const harness = databaseHarness(); globalThis.indexedDB = harness.factory;
  const storage = await freshStorage(); await storage.openDatabase();
  const saving = storage.saveCheck({ id: 'record-1' });
  const rejection = assert.rejects(saving, { name: 'QuotaExceededError' });
  await tick();
  harness.calls.tx.error = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
  harness.calls.tx.onabort(); await rejection;
  assert.match(storage.storageError(harness.calls.tx.error), /not saved/);
  assert.match(storage.storageError({ name: 'ConstraintError' }), /already exists/);
  delete globalThis.indexedDB;
});

test('stored copies and checks are read through readonly transactions', async () => {
  const harness = databaseHarness(); globalThis.indexedDB = harness.factory;
  const storage = await freshStorage();
  const reading = storage.getChecks(); await tick();
  harness.calls.request.result = [{ id: 'saved-record', disposition: 'hold' }];
  harness.calls.request.onsuccess(); harness.calls.tx.oncomplete();
  assert.deepEqual(await reading, [{ id: 'saved-record', disposition: 'hold' }]);
  assert.deepEqual(harness.calls.operations[0], { type: 'getAll', name: 'checks', mode: 'readonly' });
  delete globalThis.indexedDB;
});

test('unsupported browser storage fails explicitly', async () => {
  delete globalThis.indexedDB;
  const storage = await freshStorage();
  await assert.rejects(() => storage.openDatabase(), /does not support/);
});
