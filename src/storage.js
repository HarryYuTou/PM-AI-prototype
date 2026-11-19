const DB_NAME = 'shelfcheck-prototype';
const VERSION = 1;
let database;

export function openDatabase() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('This browser does not support local storage for this app.')); return; }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('copies')) db.createObjectStore('copies', { keyPath: 'id' }).createIndex('barcode', 'barcodeKey', { unique: true });
      if (!db.objectStoreNames.contains('checks')) db.createObjectStore('checks', { keyPath: 'id' }).createIndex('copyId', 'copyId');
    };
    request.onsuccess = () => {
      database = request.result;
      database.onversionchange = () => { database.close(); database = undefined; };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other ShelfCheck tabs, then reload this page.'));
  });
}

async function transaction(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    const request = operation(tx.objectStore(storeName));
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || request.error || new Error('Unable to save to this browser.'));
    tx.onabort = () => reject(tx.error || new Error('Save was cancelled. Please try again.'));
  });
}

export const getCopies = () => transaction('copies', 'readonly', store => store.getAll());
export const getChecks = () => transaction('checks', 'readonly', store => store.getAll());
export const saveCopy = copy => transaction('copies', 'readwrite', store => store.add({ ...copy, barcodeKey: copy.barcode.toLowerCase() }));
export const saveCheck = check => transaction('checks', 'readwrite', store => store.add(check));

export function storageError(error) {
  if (error?.name === 'QuotaExceededError') return 'Browser storage is full. Your changes were not saved. Free some browser storage and try again.';
  if (error?.name === 'ConstraintError') return 'This barcode or record already exists. Refresh and try again.';
  return error?.message || 'Local storage is unavailable. Your changes were not saved.';
}
