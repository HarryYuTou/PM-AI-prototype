import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, validateCopy, createRows, getRowStatus, summarizeRows, makeRecord, findCopy } from '../src/domain.js';
import { recognizeComponents } from '../src/recognition.js';
import { validateImageFile } from '../src/images.js';
import { demoCopy } from '../src/seed.js';

const copy = structuredClone(demoCopy);
const fixture = () => ({ ...copy, id: 'new-copy', barcode: 'NEW-002' });
const confirmedRows = () => copy.components.map(component => ({ ...component, observed: component.manual ? null : component.expected, actual: component.expected, confirmed: true }));
const recordInput = () => ({ copy, rows: confirmedRows(), disposition: 'ready', id: 'check-1', now: '2026-11-19T21:00:00.000Z', source: 'sample', recognitionMode: 'demo', image: '/assets/tray-complete.svg' });

test('counts accept zero and whole numbers; reject blank, negative, decimal, infinite and excessive values', () => {
  for (const value of [0, '0', 30, ' 30 ', 10000]) assert.equal(parseCount(value), Number(value));
  for (const value of ['', null, undefined, false, [], [3], {}, -1, '-1', 1.5, '1.5', '1e2', Infinity, NaN, 10001, 'abc']) assert.equal(parseCount(value), null);
});

test('inventory is copy-specific, trims input and rejects duplicate barcodes case-insensitively', () => {
  const valid = validateCopy({ ...fixture(), name: ' Harbor Trail ', barcode: '  NEW-002  ' }, [copy]);
  assert.equal(valid.name, 'Harbor Trail'); assert.equal(valid.barcode, 'NEW-002');
  assert.throws(() => validateCopy({ ...fixture(), barcode: 'sc-001' }, [copy]), /already belongs/);
  assert.equal(findCopy([copy, valid], ' new-002 ').id, 'new-copy');
  assert.equal(findCopy([copy], 'Harbor Trail'), null);
});

test('setup requires photo, components, positive counts and unique group names', () => {
  assert.throws(() => validateCopy({ ...fixture(), referenceImage: null }), /reference photo/);
  assert.throws(() => validateCopy({ ...fixture(), components: [] }), /between 1 and 40/);
  assert.throws(() => validateCopy({ ...fixture(), components: [{ name: 'Dice', expected: 0 }] }), /whole number/);
  assert.throws(() => validateCopy({ ...fixture(), components: [{ name: 'Dice', expected: 2 }, { name: ' dice ', expected: 2 }] }), /unique name/);
  assert.throws(() => validateCopy({ ...fixture(), name: '' }), /game name/);
});

test('actual photo uploads never receive fabricated AI counts', async () => {
  const result = await recognizeComponents({ copy, source: 'upload', image: 'real-photo', scenario: 'complete' });
  assert.equal(result.mode, 'manual');
  assert.ok(result.components.every(component => component.count === null));
  assert.equal(summarizeRows(createRows(copy, result)).uncertain, copy.components.length);
});

test('only the seeded copy and sample source can use fixed demo results', async () => {
  const result = await recognizeComponents({ copy: { ...copy, isDemo: false }, source: 'sample', image: 'photo' });
  assert.equal(result.mode, 'manual');
  await assert.rejects(() => recognizeComponents({ copy, source: 'sample', image: null }), /photo/);
  await assert.rejects(() => recognizeComponents({ copy, source: 'sample', image: 'photo', scenario: 'unknown' }), /available/);
});

test('missing fixture flags one pawn; card deck is always manual', async () => {
  const result = await recognizeComponents({ copy, source: 'sample', image: 'photo', scenario: 'missing' });
  const rows = createRows(copy, result);
  assert.equal(rows.find(row => row.id === 'pawns').actual, 3);
  assert.equal(rows.find(row => row.id === 'cards').actual, null);
  assert.equal(summarizeRows(rows).missingPieces, 1);
  assert.ok(rows.every(row => row.confirmed === false));
});

test('uncertain fixture keeps obscured tiles unknown, never treats them as absent or complete', async () => {
  const result = await recognizeComponents({ copy, source: 'sample', image: 'photo', scenario: 'uncertain' });
  const rows = createRows(copy, result);
  assert.equal(rows.find(row => row.id === 'tiles').actual, null);
  assert.equal(summarizeRows(rows).uncertain, 2);
  assert.equal(summarizeRows(rows).missing, 0);
});

test('malformed or missing recognition results become manual review, and manual-only groups remain manual', () => {
  const rows = createRows(copy, { components: [{ id: 'pawns', count: -1 }, { id: 'cards', count: 30 }, { id: 'dice', count: 2.5 }] });
  assert.ok(rows.every(row => row.actual === null));
  assert.equal(getRowStatus({ expected: 4, actual: 0 }), 'missing');
  assert.equal(getRowStatus({ expected: 4, actual: 5 }), 'extra');
});

test('ready-to-shelve requires every group counted, confirmed, and matching', () => {
  const input = recordInput();
  assert.equal(summarizeRows(input.rows).canShelve, true);
  input.rows[0].confirmed = false;
  assert.throws(() => makeRecord(input), /confirm/);
  input.rows[0].confirmed = true; input.rows[0].actual = 3;
  assert.throws(() => makeRecord(input), /discrepancy/);
  input.rows[0].actual = 5;
  assert.throws(() => makeRecord(input), /discrepancy/);
  input.rows[0].actual = null;
  assert.throws(() => makeRecord(input), /confirm/);
});

test('saved hold records contain confirmed shortages and an immutable inventory snapshot', () => {
  const input = recordInput(); input.disposition = 'hold'; input.rows[0].actual = 2;
  const record = makeRecord(input);
  assert.deepEqual(record.missing, [{ name: 'Player pawns', quantity: 2 }]);
  assert.equal(record.barcode, 'SC-001'); assert.equal(record.checkedAt, input.now);
  input.rows[0].actual = 4; input.rows[0].expected = 99;
  assert.equal(record.components[0].actual, 2); assert.equal(record.components[0].expected, 4);
});

test('a non-shortage hold needs an explicit reason; valid ready checks have no missing items', () => {
  assert.deepEqual(makeRecord(recordInput()).missing, []);
  const input = recordInput(); input.disposition = 'hold';
  assert.throws(() => makeRecord(input), /reason/);
  input.note = '  Extra piece needs sorting.  ';
  assert.equal(makeRecord(input).note, 'Extra piece needs sorting.');
  assert.throws(() => makeRecord({ ...input, disposition: 'unknown' }), /disposition/);
});

test('photo input rejects unsupported, empty, and oversized files before processing', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => validateImageFile({ type, size: 100 }));
  assert.throws(() => validateImageFile({ type: 'image/heic', size: 100 }), /HEIC/);
  assert.throws(() => validateImageFile({ type: 'image/svg+xml', size: 100 }), /JPG/);
  assert.throws(() => validateImageFile({ type: 'image/jpeg', size: 0 }), /empty/);
  assert.throws(() => validateImageFile({ type: 'image/jpeg', size: 13 * 1024 * 1024 }), /too large/);
});
