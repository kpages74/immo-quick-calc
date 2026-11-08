import {
  compute,
  defaultParameters,
  DEFAULT_INPUTS,
  DEFAULT_SETTINGS,
  FIELDS,
  Fmt,
  parseNumber,
  clampField,
  sliderFraction,
  fieldDisplay,
} from './calc.js';

// Speicherschlüssel wie in CalcStore.swift.
const STORAGE_KEYS = {
  mode: 'iqc.mode',
  variant: 'iqc.variant',
  settings: 'iqc.settings',
  vermietet: 'iqc.page.vermietet',
  kap: 'iqc.page.kap',
  leerstehend: 'iqc.page.leerstehend',
};

// Felder, die in parameters statt in inputs liegen.
const PARAM_KEYS = new Set(['targetMargin', 'salesCommission', 'rentPerSqm', 'targetYield']);

// Datensatz je Kalkulationsart.
const PAGE_KEY = { vermietet: 'vermietet', kap: 'kap', en: 'leerstehend' };

// Vierte Kopfzelle je Art.
const CELL4 = {
  vermietet: { caption: 'Mietrendite Käufer', fig: (r) => Fmt.percent(r.buyerYield), sub: () => 'brutto' },
  kap: { caption: 'Miete p. M.', fig: (r) => Fmt.currency(r.monthlyRent), sub: (r) => Fmt.perSqm(r.currentRentPerSqm) },
  en: { caption: 'Vertriebskosten', fig: (r) => Fmt.currency(r.salesCommission), sub: () => ' ' },
};

const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>';

// MARK: - Zustand

function makePage(kind) {
  return { inputs: { ...DEFAULT_INPUTS }, parameters: defaultParameters(kind) };
}

const state = {
  mode: 'vermietet',
  variant: 'en',
  settings: { ...DEFAULT_SETTINGS },
  pages: {
    vermietet: makePage('vermietet'),
    kap: makePage('kap'),
    leerstehend: makePage('en'),
  },
};

function currentKind() {
  if (state.mode === 'vermietet') return 'vermietet';
  return state.variant === 'kap' ? 'kap' : 'en';
}

function currentPage() {
  return state.pages[PAGE_KEY[currentKind()]];
}

// MARK: - Speicherung (localStorage, alle Zugriffe abgesichert)

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher nicht verfügbar: die App arbeitet ohne Speicherung weiter.
  }
}

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function sanitizePage(raw, kind) {
  const page = makePage(kind);
  if (!raw || typeof raw !== 'object') return page;
  for (const key of Object.keys(page.inputs)) {
    if (isFiniteNumber(raw.inputs?.[key])) page.inputs[key] = raw.inputs[key];
  }
  for (const key of Object.keys(page.parameters)) {
    if (isFiniteNumber(raw.parameters?.[key])) page.parameters[key] = raw.parameters[key];
  }
  return page;
}

function loadState() {
  const mode = readJSON(STORAGE_KEYS.mode);
  if (mode === 'vermietet' || mode === 'leerstehend') state.mode = mode;

  const variant = readJSON(STORAGE_KEYS.variant);
  if (variant === 'kap' || variant === 'en') state.variant = variant;

  const settings = readJSON(STORAGE_KEYS.settings);
  if (settings && typeof settings === 'object') {
    if (settings.marginBasis === 'salesPrice' || settings.marginBasis === 'totalInvestment') {
      state.settings.marginBasis = settings.marginBasis;
    }
    if (settings.closingCostMode === 'euro' || settings.closingCostMode === 'percent') {
      state.settings.closingCostMode = settings.closingCostMode;
    }
  }

  state.pages.vermietet = sanitizePage(readJSON(STORAGE_KEYS.vermietet), 'vermietet');
  state.pages.kap = sanitizePage(readJSON(STORAGE_KEYS.kap), 'kap');
  state.pages.leerstehend = sanitizePage(readJSON(STORAGE_KEYS.leerstehend), 'en');
}

function saveState() {
  writeJSON(STORAGE_KEYS.mode, state.mode);
  writeJSON(STORAGE_KEYS.variant, state.variant);
  writeJSON(STORAGE_KEYS.settings, state.settings);
  writeJSON(STORAGE_KEYS.vermietet, state.pages.vermietet);
  writeJSON(STORAGE_KEYS.kap, state.pages.kap);
  writeJSON(STORAGE_KEYS.leerstehend, state.pages.leerstehend);
}

function changed() {
  saveState();
  render();
}

// MARK: - DOM-Hilfen

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setHint(node, text) {
  node.textContent = text ?? '';
  node.hidden = !text;
}

/** Anzeige im Eingabefeld ohne Fokus mit Einheit (calc.js fieldDisplay, wie in der App). */
const fieldText = (spec, value) => fieldDisplay(spec, value);

/** Schriftgröße so verkleinern, dass der Text in die Zelle passt (wie minimumScaleFactor). */
function fitText(node) {
  node.style.fontSize = '';
  const width = node.clientWidth;
  const needed = node.scrollWidth;
  if (width > 0 && needed > width + 1) {
    const base = parseFloat(getComputedStyle(node).fontSize);
    node.style.fontSize = `${Math.max(base * 0.6, (base * width) / needed)}px`;
  }
}

// Messfeld für Eingabefelder: gleiche Schrift wie die Pill, außerhalb des sichtbaren Layouts.
let probe = null;

/**
 * Schriftgröße eines Eingabefeldes (Pill) so verkleinern, dass der Text ohne Auslassung passt.
 * Mindestens 60 % der Grundgröße, wie minimumScaleFactor 0.6 in der App.
 */
function fitPill(input) {
  input.style.fontSize = '';
  const width = input.clientWidth;
  if (width <= 0) return;
  const cs = getComputedStyle(input);
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0;';
    document.body.append(probe);
  }
  probe.style.fontFamily = cs.fontFamily;
  probe.style.fontWeight = cs.fontWeight;
  probe.style.fontVariantNumeric = 'tabular-nums';
  probe.style.fontSize = cs.fontSize;
  probe.textContent = input.value;
  const avail = width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const needed = probe.getBoundingClientRect().width;
  if (avail > 0 && needed > avail) {
    const base = parseFloat(cs.fontSize);
    input.style.fontSize = `${Math.max(base * 0.6, (base * avail * 0.98) / needed)}px`;
  }
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

// MARK: - Zahlenfeld (Commit nur bei Änderung, ungültig = alter Wert)

/**
 * Zahleneingabe. Beim Fokus steht der exakte Wert im Feld, beim Verlassen (blur oder Enter)
 * wird übernommen, wenn der Text geändert und gültig ist.
 */
function numberField({ spec, get, set, header = false, display, clamp }) {
  const input = el('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.enterKeyHint = 'done';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.className = header ? 'head-input' : 'pill';
  input.setAttribute('aria-label', spec.label);

  // Bearbeitungstext beim Fokus. null = nicht im Bearbeitungsmodus.
  let editStart = null;

  const shown = (value) => (display ? display(value) : fieldText(spec, value));

  function fitWidth() {
    if (header) input.style.width = `${Math.max(3, input.value.length + 1)}ch`;
  }

  function sync() {
    if (editStart === null) input.value = shown(get());
    fitWidth();
    if (!header) fitPill(input);
  }

  input.addEventListener('focus', () => {
    editStart = Fmt.editingNumber(get());
    input.value = editStart;
    fitWidth();
    if (!header) fitPill(input);
    input.select();
  });

  input.addEventListener('blur', () => {
    const startText = editStart;
    editStart = null;
    if (startText !== null && input.value !== startText) {
      const parsed = parseNumber(input.value);
      if (parsed !== null) {
        set(clamp ? clamp(parsed) : parsed);
        return;
      }
    }
    sync();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });

  return { el: input, sync };
}

// MARK: - Zeilen

function inputRow(key, { hint = null } = {}) {
  const spec = FIELDS[key];
  const source = (page) => (PARAM_KEYS.has(key) ? page.parameters : page.inputs);
  const get = () => source(currentPage())[key];
  const set = (value) => {
    source(currentPage())[key] = value;
    changed();
  };

  const root = el('div', 'row');
  const head = el('div', 'row-head');
  const labelWrap = el('div', 'label-wrap');
  labelWrap.append(el('span', 'label', spec.label));
  const hintEl = el('span', 'hint');
  labelWrap.append(hintEl);

  const field = numberField({ spec, get, set });
  head.append(labelWrap, field.el);

  const slider = el('input', 'slider');
  slider.type = 'range';
  slider.min = String(spec.min);
  slider.max = String(spec.max);
  slider.step = String(spec.step);
  slider.setAttribute('aria-label', spec.label);
  slider.addEventListener('input', () => set(Number(slider.value)));

  root.append(head, slider);

  return {
    el: root,
    update(result) {
      field.sync();
      const value = get();
      slider.value = String(value);
      slider.style.setProperty('--pos', `${sliderFraction(key, value) * 100}%`);
      setHint(hintEl, hint ? hint(result) : null);
    },
  };
}

function lockedRow(label, { hint, value }) {
  const root = el('div', 'row');
  const head = el('div', 'row-head');
  const labelWrap = el('div', 'label-wrap');
  labelWrap.append(el('span', 'label', label));
  const hintEl = el('span', 'hint');
  labelWrap.append(hintEl);

  const lock = el('div', 'locked');
  lock.innerHTML = LOCK_SVG;
  const valueEl = el('span', 'locked-value');
  lock.append(valueEl);

  head.append(labelWrap, lock);
  root.append(head);

  return {
    el: root,
    update(result) {
      setHint(hintEl, hint(result));
      valueEl.textContent = value(result);
    },
  };
}

// MARK: - Umschalter

function segmented(container, options, getValue, onSelect) {
  const buttons = options.map((option) => {
    const button = el('button', 'seg-btn', option.label);
    button.type = 'button';
    if (option.aria) button.setAttribute('aria-label', option.aria);
    button.addEventListener('click', () => onSelect(option.value));
    container.append(button);
    return { value: option.value, button };
  });
  return function update() {
    const current = getValue();
    for (const { value, button } of buttons) {
      button.setAttribute('aria-pressed', value === current ? 'true' : 'false');
    }
  };
}

// MARK: - Aufbau des Formulars

let rows = [];
let formKey = '';
let cell4 = null;
const formEl = $('form');

function addGroup(title, trailing) {
  const section = el('section', 'group');
  const head = el('div', 'group-head');
  head.append(el('h2', 'group-title', title));
  if (trailing) head.append(trailing);
  section.append(head);
  formEl.append(section);
  return section;
}

function addRow(section, row) {
  rows.push(row);
  section.append(row.el);
}

function buildForm(kind) {
  rows = [];
  formEl.replaceChildren();

  // Kauf: alle Werte für den Ankauf, ohne Button.
  const purchaseGroup = addGroup('Kauf');
  addRow(purchaseGroup, inputRow('livingArea'));
  if (state.settings.closingCostMode === 'euro') {
    addRow(purchaseGroup, inputRow('closingCostsEuro'));
  } else {
    addRow(purchaseGroup, inputRow('closingCostsPercent', { hint: (r) => Fmt.currency(r.closingCosts) }));
  }
  addRow(purchaseGroup, inputRow('renovationCosts', { hint: (r) => Fmt.perSqm(r.renovationPerSqm) }));
  addRow(purchaseGroup, inputRow('otherCosts'));

  // Verkauf mit Standard-Button (setzt die Parameter der Art zurück).
  const standard = el('button', 'std-btn', 'Standard');
  standard.type = 'button';
  standard.addEventListener('click', () => {
    currentPage().parameters = defaultParameters(currentKind());
    changed();
  });
  const salesGroup = addGroup('Verkauf', standard);

  if (kind === 'vermietet') {
    addRow(salesGroup, inputRow('salePricePerSqm', { hint: (r) => Fmt.currency(r.objectSalePrice) }));
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
    addRow(salesGroup, inputRow('rent', { hint: (r) => Fmt.perSqm(r.currentRentPerSqm) }));
    addRow(salesGroup, inputRow('parkingRent'));
  } else if (kind === 'kap') {
    addRow(salesGroup, lockedRow(FIELDS.salePricePerSqm.label, {
      hint: (r) => Fmt.currency(r.objectSalePrice),
      value: (r) => Fmt.perSqm(r.objectSalePricePerSqm),
    }));
    addRow(salesGroup, inputRow('rentPerSqm', { hint: (r) => Fmt.currency(r.monthlyRent) }));
    addRow(salesGroup, inputRow('targetYield'));
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
  } else {
    addRow(salesGroup, inputRow('salePrice', { hint: (r) => Fmt.perSqm(r.objectSalePricePerSqm) }));
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
  }
}

function buildCell4(kind) {
  const cell = $('cell-4');
  cell.replaceChildren();
  const fig = el('div', 'fig fit');
  const sub = el('div', 'sub fit');
  cell.append(el('div', 'cap', CELL4[kind].caption), fig, sub);
  cell4 = { kind, fig, sub };
}

/** Baut Formular und vierte Kopfzelle nur neu, wenn sich Art oder Kostenmodus ändern. */
function ensureForm() {
  const kind = currentKind();
  const key = `${kind}|${state.settings.closingCostMode}`;
  if (key === formKey) return;
  formKey = key;
  buildForm(kind);
  buildCell4(kind);
}

// MARK: - Kopf

const marginField = numberField({
  spec: FIELDS.targetMargin,
  header: true,
  get: () => currentPage().parameters.targetMargin,
  set: (value) => {
    currentPage().parameters.targetMargin = value;
    changed();
  },
  display: (value) => Fmt.percent(value),
  clamp: (value) => clampField('targetMargin', value),
});

function buildMarginSlot() {
  const wrap = el('div', 'margin-field');
  wrap.append(marginField.el);
  wrap.insertAdjacentHTML('beforeend', PENCIL_SVG);
  $('margin-slot').append(wrap);
}

function updateHeader(result) {
  const possible = result.isPurchasePossible;
  const maxEl = $('h-max');
  maxEl.textContent = Fmt.currency(result.maxPurchasePrice);
  maxEl.classList.toggle('warn', !possible);
  $('h-max-sqm').textContent = Fmt.perSqm(result.maxPurchasePricePerSqm);
  $('h-max-warn').hidden = possible;
  $('h-margin-eur').textContent = Fmt.currency(result.marginEuro);
  $('h-gik').textContent = Fmt.currency(result.totalInvestment);
  cell4.fig.textContent = CELL4[cell4.kind].fig(result);
  cell4.sub.textContent = CELL4[cell4.kind].sub(result);
}

// MARK: - Einstellungen

let settingsUpdaters = [];
let modeUpdate = () => {};
let variantUpdate = () => {};

function syncSettings() {
  for (const update of settingsUpdaters) update();
}

function resetAll() {
  state.pages.vermietet = makePage('vermietet');
  state.pages.kap = makePage('kap');
  state.pages.leerstehend = makePage('en');
  changed();
}

// MARK: - Render

function render() {
  ensureForm();
  const kind = currentKind();
  const page = currentPage();
  const result = compute(kind, page.inputs, page.parameters, state.settings);

  updateHeader(result);
  marginField.sync();
  for (const row of rows) row.update(result);

  modeUpdate();
  variantUpdate();
  $('seg-variant').hidden = state.mode !== 'leerstehend';

  for (const node of document.querySelectorAll('.fit')) fitText(node);
}

// MARK: - Start

function tapOutsideBlurs(event) {
  // Tippen auf Text im Formular entfernt den Fokus, wie in der App.
  if (event.target.closest('input, button')) return;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.type === 'text') active.blur();
}

function init() {
  loadState();

  modeUpdate = segmented(
    $('seg-mode'),
    [
      { value: 'vermietet', label: 'Vermietet' },
      { value: 'leerstehend', label: 'Leerstehend' },
    ],
    () => state.mode,
    (value) => {
      state.mode = value;
      changed();
    },
  );

  variantUpdate = segmented(
    $('seg-variant'),
    [
      { value: 'kap', label: 'KAP', aria: 'Kapitalanleger' },
      { value: 'en', label: 'EN', aria: 'Eigennutzer' },
    ],
    () => state.variant,
    (value) => {
      state.variant = value;
      changed();
    },
  );

  settingsUpdaters = [
    segmented(
      $('set-margin'),
      [
        { value: 'salesPrice', label: 'vom Verkaufspreis' },
        { value: 'totalInvestment', label: 'auf GIK' },
      ],
      () => state.settings.marginBasis,
      (value) => {
        state.settings.marginBasis = value;
        changed();
        syncSettings();
      },
    ),
    segmented(
      $('set-closing'),
      [
        { value: 'euro', label: 'in €' },
        { value: 'percent', label: 'in %' },
      ],
      () => state.settings.closingCostMode,
      (value) => {
        state.settings.closingCostMode = value;
        changed();
        syncSettings();
      },
    ),
  ];

  buildMarginSlot();

  $('open-settings').addEventListener('click', () => {
    syncSettings();
    openDialog($('dlg-settings'));
  });
  $('btn-settings-done').addEventListener('click', () => closeDialog($('dlg-settings')));
  $('btn-reset').addEventListener('click', () => openDialog($('dlg-reset')));
  $('btn-reset-cancel').addEventListener('click', () => closeDialog($('dlg-reset')));
  $('btn-reset-confirm').addEventListener('click', () => {
    resetAll();
    closeDialog($('dlg-reset'));
    syncSettings();
  });

  formEl.addEventListener('pointerdown', tapOutsideBlurs);
  window.addEventListener('resize', () => {
    for (const node of document.querySelectorAll('.pill')) fitPill(node);
    for (const node of document.querySelectorAll('.fit')) fitText(node);
  });

  syncSettings();
  render();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ohne Service Worker funktioniert die App weiterhin online.
    });
  });
}
