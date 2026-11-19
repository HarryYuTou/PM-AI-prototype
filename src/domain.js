export const MAX_COUNT = 10000;

export function parseCount(value) {
  if (!['string', 'number'].includes(typeof value) || value === '') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 && count <= MAX_COUNT ? count : null;
}

export function validateCopy(draft, copies = []) {
  const name = String(draft.name || '').trim();
  const barcode = String(draft.barcode || '').trim();
  if (!name || name.length > 100) throw new Error('Enter a game name between 1 and 100 characters.');
  if (!barcode || barcode.length > 80) throw new Error('Enter a copy barcode between 1 and 80 characters.');
  if (copies.some(copy => copy.barcode.toLowerCase() === barcode.toLowerCase() && copy.id !== draft.id)) throw new Error('This barcode already belongs to another copy.');
  if (!draft.referenceImage) throw new Error('Add a reference photo of the complete game.');
  if (!Array.isArray(draft.components) || !draft.components.length || draft.components.length > 40) throw new Error('Add between 1 and 40 component groups.');
  const names = new Set();
  const components = draft.components.map((component, index) => {
    const label = String(component.name || '').trim();
    const expected = parseCount(component.expected);
    if (!label || label.length > 80) throw new Error(`Give component ${index + 1} a name (up to 80 characters).`);
    if (names.has(label.toLowerCase())) throw new Error(`Use a unique name for each component group: ${label}.`);
    if (expected === null || expected < 1) throw new Error(`Enter a whole number from 1 to ${MAX_COUNT} for ${label}.`);
    names.add(label.toLowerCase());
    return { id: component.id || `component-${index}`, name: label, expected, manual: Boolean(component.manual) };
  });
  return { ...draft, name, barcode, components };
}

export function createRows(copy, recognition) {
  const recognized = new Map((recognition.components || []).map(item => [item.id, item]));
  return copy.components.map(component => {
    const match = recognized.get(component.id);
    const observed = component.manual ? null : parseCount(match?.count);
    return {
      ...component,
      observed,
      actual: observed,
      confirmed: false,
      note: component.manual ? 'Count this group by hand.' : (match?.note || 'Review and enter the actual count.')
    };
  });
}

export function getRowStatus(row) {
  const actual = parseCount(row.actual);
  if (actual === null) return 'uncertain';
  if (actual < row.expected) return 'missing';
  if (actual > row.expected) return 'extra';
  return 'match';
}

export function summarizeRows(rows) {
  const summary = { total: rows.length, match: 0, missing: 0, extra: 0, uncertain: 0, confirmed: 0, missingPieces: 0 };
  for (const row of rows) {
    summary[getRowStatus(row)]++;
    if (row.confirmed && parseCount(row.actual) !== null) summary.confirmed++;
    const actual = parseCount(row.actual);
    if (actual !== null) summary.missingPieces += Math.max(0, row.expected - actual);
  }
  summary.complete = summary.total > 0 && summary.confirmed === summary.total;
  summary.canShelve = summary.complete && summary.match === summary.total;
  return summary;
}

export function makeRecord({ copy, rows, disposition, note = '', image, source, recognitionMode, id, now }) {
  const summary = summarizeRows(rows);
  if (!summary.complete) throw new Error('Enter and confirm a count for every component group first.');
  if (!['ready', 'hold'].includes(disposition)) throw new Error('Choose a final disposition.');
  if (disposition === 'ready' && !summary.canShelve) throw new Error('Resolve every count discrepancy before marking this game ready to shelve.');
  if (disposition === 'hold' && !summary.missing && !note.trim()) throw new Error('Add a reason for holding this copy.');
  return {
    id, copyId: copy.id, gameName: copy.name, barcode: copy.barcode,
    checkedAt: now, disposition, note: note.trim(), image,
    source, recognitionMode,
    components: rows.map(({ id, name, expected, observed, actual }) => ({ id, name, expected, observed, actual: parseCount(actual) })),
    missing: rows.filter(row => getRowStatus(row) === 'missing').map(row => ({ name: row.name, quantity: row.expected - parseCount(row.actual) }))
  };
}

export function findCopy(copies, barcode) {
  const normalized = String(barcode).trim().toLowerCase();
  return copies.find(copy => copy.barcode.toLowerCase() === normalized) || null;
}
