import { validateCopy, createRows, parseCount, getRowStatus, summarizeRows, makeRecord, findCopy } from './domain.js';
import { getCopies, getChecks, saveCopy, saveCheck, storageError } from './storage.js';
import { prepareImage } from './images.js';
import { recognizeComponents } from './recognition.js';
import { demoCopy, scenarios } from './seed.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  camera: '<path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="4"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  box: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4"/>',
  barcode: '<path d="M3 4v16M7 4v16M10 4v16M15 4v16M18 4v16M21 4v16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  minus: '<path d="M5 12h14"/>',
  leaf: '<path d="M20 3C10 2 3 6 4 13s11 10 15 1c2-5 1-11 1-11ZM5 20 15 10"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 4-6 4 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>'
};
function icon(name, className = '') { return `<svg class="icon ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.box}</svg>`; }
const state = { copies: [], checks: [], selected: null, image: null, filename: '', source: null, scenario: 'missing', tab: 'return', rows: null, recognitionMode: null, busy: false, saving: false, note: '', completed: null, historyOpen: false, uploadVersion: 0 };
let setupImage = null;
let setupBusy = false;
let setupVersion = 0;
let toastTimeout;
const activeCopy = () => state.copies.find(copy => copy.id === state.selected);
const copyChecks = () => state.checks.filter(check => check.copyId === state.selected).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
const date = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

function toast(message, error = false) {
  clearTimeout(toastTimeout);
  const el = $('#toast'); el.textContent = message; el.hidden = false; el.classList.toggle('error', error);
  toastTimeout = setTimeout(() => { el.hidden = true; }, error ? 8000 : 4500);
}

function resetSession(copy, withSample = false) {
  state.uploadVersion++;
  Object.assign(state, { selected: copy.id, image: withSample && copy.isDemo ? scenarios[state.scenario].image : null, source: withSample && copy.isDemo ? 'sample' : null, filename: '', tab: 'return', rows: null, recognitionMode: null, busy: false, note: '', completed: null });
}

function selectCopy(id) {
  if (state.busy || state.saving) return false;
  const copy = state.copies.find(item => item.id === id);
  if (!copy) return false;
  if (id === state.selected) return true;
  if (state.rows && !state.completed && !window.confirm('Switch copies? The current unsaved check will be discarded.')) return false;
  resetSession(copy, copy.isDemo); render(); return true;
}

function sidebar() {
  return `<aside class="sidebar">
    <a class="brand" href="#main" aria-label="ShelfCheck home"><img src="/favicon.svg" width="37" height="37" alt=""/><span>ShelfCheck<span class="brand-caption">THE LIBRARY CHECK-IN TOOL</span></span></a>
    <div class="workspace-label">WORKSPACE</div>
    <button class="nav-item active" data-action="return-view">${icon('box')}<span>Return check</span><span class="nav-shortcut">01</span></button>
    <button class="nav-item" data-action="history">${icon('clock')}<span>Check history</span><span class="nav-count">${state.checks.length}</span></button>
    <div class="collection-heading"><span>YOUR COLLECTION</span><span>${state.copies.length}</span></div>
    <div class="copy-list">${state.copies.map(copy => `<button class="copy-nav ${copy.id === state.selected ? 'selected' : ''}" data-action="select-copy" data-id="${escape(copy.id)}" ${state.busy || state.saving ? 'disabled' : ''}><span class="mini-cover">${icon(copy.isDemo ? 'leaf' : 'box')}</span><span class="copy-nav-text"><strong>${escape(copy.name)}</strong><small>${escape(copy.barcode)}${copy.isDemo ? ' · Sample' : ''}</small></span>${copy.id === state.selected ? '<span class="selection-dot"></span>' : ''}</button>`).join('')}</div>
    <button class="add-copy-link" data-action="setup">${icon('plus')} Add game copy</button>
    <div class="sidebar-bottom"><div class="library-mark">${icon('shield')}<strong>Your desk, your records.</strong></div><p>Saved in this browser on this device.</p><span class="prototype-tag">PROTOTYPE · v0.1</span></div>
  </aside>`;
}

function render() {
  const copy = activeCopy();
  const latest = copyChecks()[0];
  $('#app').innerHTML = `${sidebar()}<div class="app-content">
    <header class="topbar"><span class="breadcrumb">Library workspace <span>/</span> <strong>Circulation desk</strong></span><span class="topbar-right">${icon('shield')} Staff review required <span class="avatar" aria-label="Library staff">LS</span></span></header>
    <main id="main" tabindex="-1">
      <div class="page-heading"><div><p class="eyebrow">LESS COUNTING. MORE PLAYING.</p><h1>Return check<span class="heading-dot">.</span></h1><p class="page-subtitle">A complete game starts with a thoughtful check.</p></div><button class="button secondary" data-action="setup">${icon('plus')} Add game copy</button></div>
      <div class="workflow" aria-label="Check-in progress">${['Identify copy', 'Photograph pieces', 'Review & save'].map((label, i) => { const current = state.completed ? 3 : state.rows ? 2 : state.image ? 1 : 0; return `<div class="workflow-step ${i < current ? 'done' : ''} ${i === current ? 'current' : ''}"><span>${i < current ? icon('check') : i + 1}</span>${label}</div>`; }).join('')}<div class="workflow-tail"></div><span class="prototype-note">${icon('info')} Recognition API not connected</span></div>
      <section class="copy-strip" aria-labelledby="copy-heading"><span class="game-cover">${icon(copy.isDemo ? 'leaf' : 'box')}</span><div class="copy-description"><div class="copy-name-line"><h2 id="copy-heading">${escape(copy.name)}</h2>${copy.isDemo ? '<span class="tag">SAMPLE COPY</span>' : ''}</div><p>${escape(copy.barcode)} <span>·</span> ${copy.components.length} component groups ${latest ? `<span>·</span> <span class="last-state ${latest.disposition}">${latest.disposition === 'hold' ? 'On hold' : 'Ready to shelve'}</span>` : '<span>·</span> Inventory confirmed'}</p></div><form id="barcode-form" class="barcode-form"><label class="sr-only" for="barcode-input">Look up a copy by barcode</label>${icon('barcode')}<input id="barcode-input" name="barcode" placeholder="Scan or enter barcode" autocomplete="off" maxlength="80" ${state.busy ? 'disabled' : ''}/><button type="submit" aria-label="Find barcode">Find</button></form></section>
      ${state.completed ? completedView() : `<div class="workspace-grid">${photoPanel()}${inventoryPanel()}</div>${state.rows ? reviewPanel() : '<div class="under-workspace">' + icon('shield') + '<span>The tool flags discrepancies. You make the final call.</span><span class="scope-note">Presence checks only · No damage assessment</span></div>'}`}
      ${historyPanel()}
      <footer class="page-footer"><span>ShelfCheck <span class="footer-divider">/</span> A little care for the next player.</span><span>Local prototype · Photos stay on this device</span></footer>
    </main></div>`;
  updateReviewUI();
}

function photoPanel() {
  const copy = activeCopy();
  const reference = state.tab === 'reference';
  const image = reference ? copy.referenceImage : state.image;
  return `<section class="panel photo-panel" aria-labelledby="photo-panel-heading"><div class="panel-heading"><div><h2 id="photo-panel-heading">${icon('camera')} The check-in tray</h2><p>One photo. All the pieces in view.</p></div><div class="segmented" aria-label="Photo view"><button data-action="photo-tab" data-tab="return" aria-pressed="${!reference}" class="${!reference ? 'selected' : ''}">Return</button><button data-action="photo-tab" data-tab="reference" aria-pressed="${reference}" class="${reference ? 'selected' : ''}">Reference</button></div></div>
    <div class="photo-surface ${image ? 'has-image' : ''}" id="drop-zone">${image ? `<img class="tray-image" src="${escape(image)}" alt="${reference ? 'Complete reference inventory' : state.source === 'sample' ? 'Illustrated sample: ' + scenarios[state.scenario].label : 'Uploaded returned game components'}"/><span class="photo-label">${reference ? 'REFERENCE INVENTORY' : state.source === 'sample' ? 'ILLUSTRATED SAMPLE' : 'RETURN PHOTO'}</span><button class="expand-photo icon-button" data-action="expand-photo" aria-label="Enlarge ${reference ? 'reference' : 'return'} photo">${icon('expand')}</button>` : `<div class="upload-empty"><span class="upload-orbit">${icon('camera')}</span><h3>Let’s see what’s inside.</h3><p>Spread the pieces on a tray.<br/>Keep every piece visible and avoid overlap.</p><button class="button primary" data-action="upload">${icon('upload')} Add return photo</button><small>JPG, PNG or WebP · Up to 12 MB</small></div>`}</div>
    <div class="photo-bottom"><div class="photo-caption">${icon('image')}<span>${reference ? 'The complete contents confirmed at setup.' : state.source === 'sample' ? scenarios[state.scenario].caption : state.filename ? escape(state.filename) : 'You can also drag and drop a photo here.'}</span></div><div class="photo-actions"><button class="button secondary compact" data-action="upload" ${state.busy ? 'disabled' : ''}>${icon('upload')} ${state.image ? 'Upload your photo' : 'Choose photo'}</button>${copy.isDemo && state.source !== 'sample' ? '<button class="button text compact" data-action="use-sample">Try a sample</button>' : ''}<input type="file" id="return-upload" accept="image/jpeg,image/png,image/webp" hidden/></div></div>
  </section>`;
}

function inventoryPanel() {
  const copy = activeCopy();
  return `<aside class="panel inventory-panel"><div class="panel-heading"><div><p class="eyebrow">THIS COPY’S BASELINE</p><h2>What belongs inside</h2></div><span class="inventory-icon">${icon('box')}</span></div><div class="inventory-list">${copy.components.map(component => `<div class="inventory-item"><span class="piece-symbol ${component.manual ? 'manual' : ''}">${icon(component.manual ? 'image' : component.id === 'pawns' ? 'leaf' : 'box')}</span><span>${escape(component.name)}${component.manual ? '<small>Manual count</small>' : ''}</span><strong>${component.expected}<span> pcs</span></strong></div>`).join('')}</div><div class="inventory-footnote">${icon('check')} Confirmed at copy setup</div>
    <div class="run-area">${state.source === 'sample' ? `<label class="field-label" for="demo-scenario">Try a demo scenario</label><select id="demo-scenario" ${state.busy ? 'disabled' : ''}>${Object.entries(scenarios).map(([id, scenario]) => `<option value="${id}" ${id === state.scenario ? 'selected' : ''}>${scenario.label}</option>`).join('')}</select><p class="mode-description">Preset results for this sample illustration. No image analysis is performed.</p>` : `<div class="manual-notice">${icon('info')}<span>Recognition is a placeholder. Your photo will open a manual checklist.</span></div>`}<button class="button primary run-button" data-action="run" ${!state.image || state.busy || state.rows ? 'disabled' : ''}>${state.busy ? '<span class="spinner"></span>' : icon(state.source === 'sample' ? 'camera' : 'check')}${state.busy ? 'Preparing checklist…' : state.rows ? 'Checklist ready' : state.source === 'sample' ? 'Run demo check' : 'Prepare manual review'}</button></div>
  </aside>`;
}

function statusMarkup(row) {
  const status = getRowStatus(row);
  const count = parseCount(row.actual);
  const label = status === 'uncertain' ? 'Manual count needed' : status === 'missing' ? `${row.confirmed ? 'Missing' : 'Possibly missing'} ${row.expected - count}` : status === 'extra' ? `${count - row.expected} extra · review` : row.confirmed ? 'Count confirmed' : 'Count matches';
  return `<span class="result-status ${status}">${icon(status === 'match' ? 'check' : status === 'uncertain' ? 'info' : 'alert')} ${label}</span>`;
}

function reviewPanel() {
  const sorted = [...state.rows].sort((a, b) => ({ missing: 0, uncertain: 1, extra: 2, match: 3 })[getRowStatus(a)] - ({ missing: 0, uncertain: 1, extra: 2, match: 3 })[getRowStatus(b)]);
  return `<section class="panel review-panel" aria-labelledby="review-heading"><div class="review-heading"><div><p class="eyebrow">YOUR FINAL CALL</p><h2 id="review-heading">Review the checklist</h2><p>${state.recognitionMode === 'demo' ? 'Demo suggestions only. Check the pieces and confirm each count.' : 'No AI counts were generated. Enter the counts you verify by hand.'}</p></div><span class="mode-badge">${state.recognitionMode === 'demo' ? 'DEMO RESULTS' : 'MANUAL REVIEW'}</span></div><div id="review-summary" class="review-summary" aria-live="polite"></div>
    <div class="table-scroll"><table class="results-table"><thead><tr><th>Component</th><th>Expected</th><th>${state.recognitionMode === 'demo' ? 'Demo count' : 'AI count'}</th><th>Your count</th><th>Result</th><th>Confirmed</th></tr></thead><tbody>${sorted.map(row => `<tr data-row-id="${escape(row.id)}"><th scope="row"><strong>${escape(row.name)}</strong><small>${escape(row.note)}</small></th><td class="numeric">${row.expected}</td><td class="numeric muted">${row.observed === null ? '—' : row.observed}</td><td><label class="sr-only" for="count-${escape(row.id)}">Actual count for ${escape(row.name)}</label><input class="count-input" id="count-${escape(row.id)}" data-count-id="${escape(row.id)}" type="number" min="0" max="10000" step="1" inputmode="numeric" value="${row.actual ?? ''}" placeholder="Count"/></td><td class="status-cell">${statusMarkup(row)}</td><td class="confirm-cell"><input type="checkbox" data-confirm-id="${escape(row.id)}" aria-label="Confirm ${escape(row.name)} count" ${row.confirmed ? 'checked' : ''} ${parseCount(row.actual) === null ? 'disabled' : ''}/></td></tr>`).join('')}</tbody></table></div>
    <div class="review-actions"><div><label class="field-label" for="check-note">Staff note <span class="optional">(optional, unless holding without a missing piece)</span></label><textarea id="check-note" maxlength="1000" rows="2" placeholder="Anything the next staff member should know?">${escape(state.note)}</textarea></div><div class="decision-area"><p id="decision-help"></p><div class="decision-buttons"><button class="button secondary hold-button" data-action="save-hold">${icon('alert')} Hold for follow-up</button><button class="button primary" data-action="save-ready">${icon('check')} Ready to shelve</button></div></div></div></section>`;
}

function updateReviewUI() {
  if (!state.rows || state.completed || !$('#review-summary')) return;
  const summary = summarizeRows(state.rows);
  $('#review-summary').innerHTML = `<span>${icon('check')} <strong>${summary.confirmed} of ${summary.total}</strong> groups confirmed</span><span>${summary.missing ? `${summary.missing} possible shortage${summary.missing === 1 ? '' : 's'}` : 'No shortages entered'}${summary.uncertain ? ` · ${summary.uncertain} need a count` : ''}${summary.extra ? ` · ${summary.extra} extra-count group${summary.extra === 1 ? '' : 's'}` : ''}</span>`;
  for (const row of state.rows) {
    const tr = [...document.querySelectorAll('[data-row-id]')].find(el => el.dataset.rowId === row.id);
    if (!tr) continue;
    tr.querySelector('.status-cell').innerHTML = statusMarkup(row);
    tr.classList.toggle('row-confirmed', row.confirmed);
    const checkbox = tr.querySelector('input[type="checkbox"]');
    checkbox.disabled = parseCount(row.actual) === null || state.saving;
    checkbox.checked = row.confirmed;
    tr.querySelector('.count-input').disabled = state.saving;
  }
  $('[data-action="save-ready"]').disabled = !summary.canShelve || state.saving;
  $('[data-action="save-hold"]').disabled = !summary.complete || (!summary.missing && !state.note.trim()) || state.saving;
  $('#check-note').disabled = state.saving;
  $('#decision-help').textContent = state.saving ? 'Saving this check…' : !summary.complete ? 'Enter and confirm every count before finishing.' : summary.canShelve ? 'All counts match. This copy is ready for your final decision.' : 'Counts differ from the inventory. Hold this copy or correct the counts.';
}

function completedView() {
  const record = state.completed;
  return `<section class="panel completed-panel" aria-labelledby="completed-heading"><div class="completion-symbol ${record.disposition}">${icon(record.disposition === 'ready' ? 'check' : 'alert')}</div><p class="eyebrow">CHECK SAVED</p><h2 id="completed-heading">${record.disposition === 'ready' ? 'Ready for the next player.' : 'Set aside for a closer look.'}</h2><p>${record.disposition === 'ready' ? 'Every component count was confirmed against this copy’s inventory.' : record.missing.length ? record.missing.map(item => `${item.quantity} × ${escape(item.name)}`).join(' · ') + ' missing.' : escape(record.note)}</p><div class="completion-metadata"><span>${escape(record.barcode)}</span><span>${date(record.checkedAt)}</span><span>${record.recognitionMode === 'demo' ? 'Demo-assisted check' : 'Manual check'}</span></div><button class="button primary" data-action="new-check">${icon('refresh')} Start another check</button><button class="button text" data-action="history">View saved record</button></section>`;
}

function historyPanel() {
  const checks = copyChecks();
  return `<section class="history-section" id="history"><button class="history-toggle" data-action="toggle-history" aria-expanded="${state.historyOpen}"><span>${icon('clock')} Check history <span class="history-count">${checks.length}</span></span><span>${state.historyOpen ? 'Hide records' : 'View records'} ${icon('chevron', state.historyOpen ? 'rotated' : '')}</span></button><div class="history-content" ${state.historyOpen ? '' : 'hidden'}><p class="history-caption">Records for ${escape(activeCopy().name)} · ${escape(activeCopy().barcode)}. Saved on this browser and device.</p>${checks.length ? checks.map(check => `<details class="history-record"><summary><span class="history-status ${check.disposition}">${icon(check.disposition === 'ready' ? 'check' : 'alert')}</span><span><strong>${check.disposition === 'ready' ? 'Ready to shelve' : 'Hold for follow-up'}</strong><small>${check.missing.length ? check.missing.map(item => `${item.quantity} × ${escape(item.name)} missing`).join(' · ') : check.disposition === 'ready' ? 'All component counts confirmed' : escape(check.note)}</small></span><time datetime="${check.checkedAt}">${date(check.checkedAt)}</time>${icon('chevron')}</summary><div class="history-detail"><div><span class="tag">${check.recognitionMode === 'demo' ? 'DEMO-ASSISTED' : 'MANUAL CHECK'}</span><ul>${check.components.map(component => `<li><span>${escape(component.name)}</span><strong>${component.actual} / ${component.expected}</strong></li>`).join('')}</ul>${check.note ? `<p class="saved-note"><strong>Staff note:</strong> ${escape(check.note)}</p>` : ''}</div>${check.image ? `<button class="saved-photo" data-action="record-photo" data-id="${escape(check.id)}" aria-label="Open return photo for check on ${escape(date(check.checkedAt))}"><img src="${escape(check.image)}" alt="Saved return photo"/>${icon('expand')}</button>` : ''}</div></details>`).join('') : `<div class="empty-history">${icon('clock')}<strong>A fresh start for this copy.</strong><p>Completed checks and confirmed missing pieces will appear here.</p></div>`}</div></section>`;
}

function setupRow(index) {
  return `<div class="setup-component"><label><span class="sr-only">Component name</span><input name="component-name" placeholder="e.g. Player pawns" maxlength="80" required/></label><label><span class="sr-only">Expected quantity</span><input name="component-quantity" type="number" min="1" max="10000" step="1" placeholder="Qty" required/></label><label class="manual-checkbox"><input name="component-manual" type="checkbox"/> Manual count</label><button type="button" class="icon-button" data-action="remove-component" aria-label="Remove component row">${icon('close')}</button></div>`;
}

function showSetup() {
  if (state.busy || state.saving) return;
  if (state.rows && !state.completed && !window.confirm('Add a different game copy? Saving it will discard this unsaved check.')) return;
  setupVersion++; setupImage = null; setupBusy = false;
  $('#setup-dialog').innerHTML = `<form id="setup-form"><div class="dialog-heading"><div><p class="eyebrow">ONE COPY. ONE BASELINE.</p><h2 id="setup-title">Add a game copy</h2><p>Confirm the complete contents before the first return.</p></div><button type="button" class="icon-button" data-action="close-setup" aria-label="Close setup">${icon('close')}</button></div><div class="dialog-body"><div class="two-fields"><label class="field-label">Game name<input name="game-name" placeholder="e.g. Catan" maxlength="100" required/></label><label class="field-label">Copy barcode<input name="copy-barcode" placeholder="e.g. LIB-002" maxlength="80" required/></label></div><label class="field-label" for="reference-upload">Complete reference photo</label><label class="reference-upload" for="reference-upload"><span id="reference-preview">${icon('camera')}<strong>Upload a photo of all the pieces</strong><small>Flat on a tray, without overlaps · JPG, PNG or WebP · 12 MB max</small></span><input id="reference-upload" type="file" accept="image/jpeg,image/png,image/webp"/></label><div class="component-heading"><span class="field-label">Component inventory</span><span class="optional">Group by type</span></div><div id="component-rows">${setupRow(0)}${setupRow(1)}</div><button type="button" class="button text compact" data-action="add-component">${icon('plus')} Add component group</button><p class="field-hint">Mark card decks or large sets of small pieces for manual counting.</p><label class="inventory-confirm"><input id="inventory-confirm" type="checkbox" required/><span>I checked this copy. The photo and inventory represent its complete contents.</span></label><p id="setup-error" class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button type="button" class="button secondary" data-action="close-setup">Cancel</button><button type="submit" class="button primary" id="save-copy-button">${icon('check')} Save game copy</button></div></form>`;
  $('#setup-dialog').showModal();
}

function openPhoto(image, title) {
  $('#photo-dialog').innerHTML = `<div class="dialog-heading"><h2 id="photo-title">${escape(title)}</h2><button class="icon-button" data-action="close-photo" aria-label="Close photo">${icon('close')}</button></div><img src="${escape(image)}" alt="${escape(title)}"/>`;
  $('#photo-dialog').showModal();
}

async function uploadReturn(file) {
  if (!file || state.busy || state.saving) return;
  if (state.rows && !state.completed && !window.confirm('Replace this photo? The current unsaved checklist will be discarded.')) return;
  const version = ++state.uploadVersion;
  state.busy = true; render();
  try {
    const image = await prepareImage(file);
    if (version !== state.uploadVersion) return;
    Object.assign(state, { image, filename: file.name, source: 'upload', rows: null, completed: null, tab: 'return', note: '', busy: false });
    render(); toast('Photo added. Prepare a manual review while recognition is not connected.');
  } catch (error) { if (version === state.uploadVersion) { state.busy = false; render(); toast(error.message, true); } }
}

async function runCheck() {
  if (!state.image || state.busy || state.rows) return;
  state.busy = true; render();
  try {
    const result = await recognizeComponents({ copy: activeCopy(), source: state.source, scenario: state.scenario, image: state.image });
    state.rows = createRows(activeCopy(), result);
    state.recognitionMode = result.mode;
  } catch (error) { toast(error.message, true); }
  finally { state.busy = false; render(); $('#review-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

async function finishCheck(disposition) {
  if (state.saving || !state.rows || state.completed) return;
  try {
    const record = makeRecord({ copy: activeCopy(), rows: state.rows, disposition, note: state.note, image: state.image, source: state.source, recognitionMode: state.recognitionMode, id: crypto.randomUUID(), now: new Date().toISOString() });
    state.saving = true; updateReviewUI();
    await saveCheck(record);
    state.checks.push(record); state.completed = record; state.saving = false;
    render(); $('#completed-heading')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Check saved to this browser.');
  } catch (error) { state.saving = false; updateReviewUI(); toast(storageError(error), true); }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if ((state.busy || state.saving) && !['close-photo'].includes(action)) return;
  if (action === 'setup') showSetup();
  if (action === 'close-setup' && !setupBusy) { setupVersion++; $('#setup-dialog').close(); }
  if (action === 'select-copy') selectCopy(button.dataset.id);
  if (action === 'return-view') $('#main').scrollIntoView({ behavior: 'smooth' });
  if (action === 'upload') $('#return-upload').click();
  if (action === 'run') await runCheck();
  if (action === 'save-ready') await finishCheck('ready');
  if (action === 'save-hold') await finishCheck('hold');
  if (action === 'photo-tab') { state.tab = button.dataset.tab; render(); }
  if (action === 'expand-photo') openPhoto(state.tab === 'reference' ? activeCopy().referenceImage : state.image, state.tab === 'reference' ? 'Complete reference inventory' : 'Return photo');
  if (action === 'close-photo') $('#photo-dialog').close();
  if (action === 'record-photo') { const record = state.checks.find(check => check.id === button.dataset.id); if (record) openPhoto(record.image, `Return photo · ${date(record.checkedAt)}`); }
  if (action === 'toggle-history') { state.historyOpen = !state.historyOpen; render(); }
  if (action === 'history') { state.historyOpen = true; render(); $('#history').scrollIntoView({ behavior: 'smooth' }); }
  if (action === 'use-sample' || action === 'new-check') {
    if (state.rows && !state.completed && !window.confirm('Start again? The current unsaved checklist will be discarded.')) return;
    resetSession(activeCopy(), activeCopy().isDemo); render();
  }
  if (action === 'add-component' && !setupBusy) {
    if ($('#component-rows').children.length >= 40) { toast('You can add up to 40 component groups.', true); return; }
    $('#component-rows').insertAdjacentHTML('beforeend', setupRow($('#component-rows').children.length));
    $('#component-rows').lastElementChild.querySelector('input').focus();
  }
  if (action === 'remove-component' && !setupBusy) {
    if ($('#component-rows').children.length > 1) button.closest('.setup-component').remove();
    else toast('Keep at least one component group.', true);
  }
});

document.addEventListener('input', event => {
  if (event.target.dataset.countId && !state.saving) {
    const row = state.rows?.find(row => row.id === event.target.dataset.countId);
    if (row) { row.actual = parseCount(event.target.value); row.confirmed = false; updateReviewUI(); }
  }
  if (event.target.id === 'check-note') { state.note = event.target.value; updateReviewUI(); }
});

document.addEventListener('change', async event => {
  if (event.target.id === 'return-upload') await uploadReturn(event.target.files[0]);
  if (event.target.id === 'demo-scenario') {
    const scenario = event.target.value;
    if (state.rows && !window.confirm('Change scenarios? The current unsaved checklist will be discarded.')) { event.target.value = state.scenario; return; }
    state.scenario = scenario; resetSession(activeCopy(), true); render();
  }
  if (event.target.dataset.confirmId && !state.saving) {
    const row = state.rows?.find(row => row.id === event.target.dataset.confirmId);
    if (row) { row.confirmed = event.target.checked && parseCount(row.actual) !== null; updateReviewUI(); }
  }
  if (event.target.id === 'reference-upload' && !setupBusy) {
    const file = event.target.files[0]; if (!file) return;
    const version = ++setupVersion; setupBusy = true; $('#save-copy-button').disabled = true; event.target.disabled = true;
    try {
      const image = await prepareImage(file);
      if (version !== setupVersion || !$('#setup-dialog').open) return;
      setupImage = image;
      $('#reference-preview').innerHTML = `<img src="${escape(image)}" alt="Uploaded reference preview"/><strong>${escape(file.name)}</strong><small>Click to replace photo</small>`;
      $('#setup-error').hidden = true;
    } catch (error) { if (version === setupVersion) { $('#setup-error').textContent = error.message; $('#setup-error').hidden = false; } }
    finally { if (version === setupVersion) { setupBusy = false; $('#save-copy-button').disabled = false; $('#reference-upload').disabled = false; } }
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'barcode-form') {
    event.preventDefault();
    const barcode = new FormData(event.target).get('barcode');
    const copy = findCopy(state.copies, barcode);
    if (!copy) { toast('No copy matches this barcode. Add the game copy first.', true); $('#barcode-input').focus(); }
    else if (selectCopy(copy.id)) toast(`Selected ${copy.name} · ${copy.barcode}`);
  }
  if (event.target.id === 'setup-form') {
    event.preventDefault(); if (setupBusy) return;
    const form = event.target;
    try {
      setupBusy = true; $('#save-copy-button').disabled = true;
      const data = new FormData(form);
      const copy = validateCopy({ id: crypto.randomUUID(), name: data.get('game-name'), barcode: data.get('copy-barcode'), referenceImage: setupImage, createdAt: new Date().toISOString(), isDemo: false, components: [...form.querySelectorAll('.setup-component')].map(row => ({ id: crypto.randomUUID(), name: row.querySelector('[name="component-name"]').value, expected: row.querySelector('[name="component-quantity"]').value, manual: row.querySelector('[name="component-manual"]').checked })) }, await getCopies());
      if (!$('#inventory-confirm').checked) throw new Error('Confirm the complete inventory before saving.');
      await saveCopy(copy);
      state.copies = await getCopies(); setupBusy = false; $('#setup-dialog').close(); resetSession(copy); render(); toast('Game copy saved. You can now check its returns.');
    } catch (error) { setupBusy = false; $('#save-copy-button').disabled = false; $('#setup-error').textContent = storageError(error); $('#setup-error').hidden = false; }
  }
});

$('#setup-dialog').addEventListener('cancel', event => { if (setupBusy) event.preventDefault(); else setupVersion++; });
document.addEventListener('dragover', event => { if (event.target.closest('#drop-zone')) { event.preventDefault(); event.target.closest('#drop-zone').classList.add('dragging'); } });
document.addEventListener('dragleave', event => { event.target.closest('#drop-zone')?.classList.remove('dragging'); });
document.addEventListener('drop', event => {
  if (event.target.closest('#drop-zone')) { event.preventDefault(); event.target.closest('#drop-zone').classList.remove('dragging'); uploadReturn(event.dataTransfer.files[0]); }
});
window.addEventListener('beforeunload', event => { if (state.rows && !state.completed) { event.preventDefault(); event.returnValue = ''; } });

async function initialize() {
  try {
    state.copies = await getCopies();
    if (!state.copies.length) {
      try { await saveCopy(demoCopy); } catch (error) { if (error?.name !== 'ConstraintError') throw error; }
      state.copies = await getCopies();
    }
    state.checks = await getChecks();
    const first = state.copies.find(copy => copy.isDemo) || state.copies[0];
    resetSession(first, first.isDemo); render();
  } catch (error) {
    $('#app').innerHTML = `<main class="startup"><img src="/favicon.svg" width="48" height="48" alt=""/><h1>We couldn’t open your workspace.</h1><p>${escape(storageError(error))}</p><p>Allow website storage, then reload. No changes have been saved.</p><button class="button primary" onclick="location.reload()">Reload workspace</button></main>`;
  }
}
initialize();
