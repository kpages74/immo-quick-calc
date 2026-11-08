import {
  compute,
  applyLegacySaleDefaults,
  migrateLegacyInputs,
  PRICE_MODEL_VERSION,
  defaultParameters,
  DEFAULT_INPUTS,
  DEFAULT_INPUTS_WG,
  DEFAULT_SETTINGS,
  DEFAULT_FINANCING,
  FIELDS,
  Fmt,
  parseNumber,
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
  financing: 'iqc.financing',
  rentSurchargeUnlocked: 'iqc.rentSurcharge.unlocked',
  wg: 'iqc.page.wg',
};

// Felder, die in parameters statt in inputs liegen.
const PARAM_KEYS = new Set(['targetMargin', 'salesCommission', 'rentPerSqm', 'targetYield', 'rentSurchargePercent']);

// Feldname im Formular -> Schlüssel in inputs/parameters, wenn beide verschieden heißen.
const DATA_KEY = {
  rentSurcharge: 'rentSurchargePercent',
  wgRenovation: 'renovationCosts',
  wgOther: 'otherCosts',
  wgParkingRent: 'parkingRent',
  wgYield: 'targetYield',
};

// Felder der Finanzierung (global, nicht je Seite). Tilgung entfällt.
const FINANCING_KEYS = new Set(['loanPercent', 'interestPercent', 'durationMonths', 'processingFeePercent']);

// Datensatz je Kalkulationsart.
const PAGE_KEY = { vermietet: 'vermietet', kap: 'kap', en: 'leerstehend', wg: 'wg' };

const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const LOCK_OPEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V7.5a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>';

// MARK: - Zustand

function makePage(kind) {
  // Seiten-Standard: Hausgeld 300 € (laufende Kosten). Die Verkaufswerte der Arten vermietet, KAP und WG
  // werden aus den bisherigen Renditewerten vorbelegt, damit die Standardergebnisse gleich bleiben.
  const parameters = defaultParameters(kind);
  const base = { ...(kind === 'wg' ? DEFAULT_INPUTS_WG : DEFAULT_INPUTS), hausgeld: 300 };
  return {
    inputs: applyLegacySaleDefaults(kind, base, parameters),
    parameters,
    priceModelVersion: PRICE_MODEL_VERSION,
  };
}

const state = {
  mode: 'vermietet',
  variant: 'en',
  settings: { ...DEFAULT_SETTINGS },
  pages: {
    vermietet: makePage('vermietet'),
    kap: makePage('kap'),
    leerstehend: makePage('en'),
    wg: makePage('wg'),
  },
  financing: { ...DEFAULT_FINANCING },
  // Soll-Miete ist standardmäßig gesperrt (fehlt der Wert im Speicher, gilt „gesperrt“).
  rentSurchargeUnlocked: false,
};

function currentKind() {
  if (state.mode === 'vermietet') return 'vermietet';
  if (state.mode === 'wg') return 'wg';
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

function sanitizeFinancing(raw) {
  const financing = { ...DEFAULT_FINANCING };
  if (!raw || typeof raw !== 'object') return financing;
  for (const key of FINANCING_KEYS) {
    if (isFiniteNumber(raw[key])) financing[key] = raw[key];
  }
  return financing;
}

function sanitizePage(raw, kind) {
  const page = makePage(kind);
  if (!raw || typeof raw !== 'object') return page;
  for (const key of Object.keys(page.inputs)) {
    if (isFiniteNumber(raw.inputs?.[key])) page.inputs[key] = raw.inputs[key];
  }
  for (const key of Object.keys(page.parameters)) {
    if (isFiniteNumber(raw.parameters?.[key])) page.parameters[key] = raw.parameters[key];
  }
  // Stände ohne Preismodell 2 (alter VK-Modus mit manuellem Verkaufspreis) werden migriert.
  const version = isFiniteNumber(raw.priceModelVersion) ? raw.priceModelVersion : 0;
  if (version < PRICE_MODEL_VERSION) {
    page.inputs = migrateLegacyInputs(kind, page.inputs, page.parameters, {
      vkMode: raw.vkMode === true,
      manualSalePrice: isFiniteNumber(raw.manualSalePrice) ? raw.manualSalePrice : 0,
    });
  }
  page.priceModelVersion = PRICE_MODEL_VERSION;
  return page;
}

function loadState() {
  const mode = readJSON(STORAGE_KEYS.mode);
  if (mode === 'vermietet' || mode === 'leerstehend' || mode === 'wg') state.mode = mode;

  const variant = readJSON(STORAGE_KEYS.variant);
  if (variant === 'kap' || variant === 'en') state.variant = variant;

  const settings = readJSON(STORAGE_KEYS.settings);
  if (settings && typeof settings === 'object') {
    if (settings.closingCostMode === 'euro' || settings.closingCostMode === 'percent') {
      state.settings.closingCostMode = settings.closingCostMode;
    }
  }

  state.pages.vermietet = sanitizePage(readJSON(STORAGE_KEYS.vermietet), 'vermietet');
  state.pages.kap = sanitizePage(readJSON(STORAGE_KEYS.kap), 'kap');
  state.pages.leerstehend = sanitizePage(readJSON(STORAGE_KEYS.leerstehend), 'en');
  state.pages.wg = sanitizePage(readJSON(STORAGE_KEYS.wg), 'wg');
  state.financing = sanitizeFinancing(readJSON(STORAGE_KEYS.financing));
  state.rentSurchargeUnlocked = readJSON(STORAGE_KEYS.rentSurchargeUnlocked) === true;
}

function saveState() {
  writeJSON(STORAGE_KEYS.mode, state.mode);
  writeJSON(STORAGE_KEYS.variant, state.variant);
  writeJSON(STORAGE_KEYS.settings, state.settings);
  writeJSON(STORAGE_KEYS.vermietet, state.pages.vermietet);
  writeJSON(STORAGE_KEYS.kap, state.pages.kap);
  writeJSON(STORAGE_KEYS.leerstehend, state.pages.leerstehend);
  writeJSON(STORAGE_KEYS.wg, state.pages.wg);
  writeJSON(STORAGE_KEYS.financing, state.financing);
  writeJSON(STORAGE_KEYS.rentSurchargeUnlocked, state.rentSurchargeUnlocked);
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
    const min = base * 0.6;
    let size = Math.max(min, (base * width) / needed);
    node.style.fontSize = `${size}px`;
    // Die Textbreite ist nicht exakt proportional zur Schrift: bei Überhang in kleinen Schritten nachverkleinern, nie unter 60 %.
    while (node.scrollWidth > width + 1 && size > min) {
      size = Math.max(min, size - 0.25);
      node.style.fontSize = `${size}px`;
    }
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
  input.setAttribute('data-number-field', '');

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

/** Objekt, in dem der Wert eines Feldes liegt: Seite (Eingaben oder Parameter) oder Finanzierung. */
function holderOf(key) {
  if (FINANCING_KEYS.has(key)) return state.financing;
  if (PARAM_KEYS.has(key)) return currentPage().parameters;
  return currentPage().inputs;
}

/**
 * Zeile mit Zahlenfeld und Regler. lock: Schloss-Knopf links neben der Pill (Soll-Miete).
 * Gesperrt sind Regler und Pill (gedimmt), der Info-Text bleibt aktiv.
 */
function inputRow(key, { hint = null, lock = false } = {}) {
  const spec = FIELDS[key];
  const dataKey = DATA_KEY[key] ?? key;
  const get = () => holderOf(dataKey)[dataKey];
  const set = (value) => {
    holderOf(dataKey)[dataKey] = value;
    changed();
  };

  const root = el('div', 'row');
  const head = el('div', 'row-head');
  const labelWrap = el('div', 'label-wrap');
  labelWrap.append(el('span', 'label', spec.label));
  const hintEl = el('span', 'hint');
  labelWrap.append(hintEl);

  const field = numberField({ spec, get, set });

  let lockBtn = null;
  if (lock) {
    lockBtn = el('button', 'lock-btn');
    lockBtn.type = 'button';
    lockBtn.addEventListener('click', () => {
      state.rentSurchargeUnlocked = !state.rentSurchargeUnlocked;
      changed();
    });
    head.append(labelWrap, lockBtn, field.el);
  } else {
    head.append(labelWrap, field.el);
  }

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
      if (lockBtn) {
        const locked = !state.rentSurchargeUnlocked;
        root.classList.toggle('is-locked', locked);
        field.el.disabled = locked;
        slider.disabled = locked;
        lockBtn.innerHTML = locked ? LOCK_SVG : LOCK_OPEN_SVG;
        const label = locked ? `${spec.label} entsperren` : `${spec.label} sperren`;
        lockBtn.setAttribute('aria-label', label);
        lockBtn.title = label;
      }
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

/** Gesperrte Anzeige „Rendite Käufer“ (nur Anzeige, nicht bearbeitbar). */
function buyerYieldRow() {
  return lockedRow('Rendite Käufer', { hint: () => null, value: (r) => Fmt.percent(r.buyerYield) });
}

/** Button „Standard“ im Abschnitt Verkauf: Parameter der Art und Verkaufswerte der Art auf Standard. */
function resetSaleDefaults() {
  const kind = currentKind();
  const page = currentPage();
  page.parameters = defaultParameters(kind);
  if (kind === 'en') {
    page.inputs.salePrice = DEFAULT_INPUTS.salePrice;
  } else {
    const defaults = makePage(kind).inputs;
    page.inputs.salePricePerSqm = defaults.salePricePerSqm;
    page.inputs.parkingSalePrice = defaults.parkingSalePrice;
  }
}

/** Reihenfolge: Kauf → Laufende Kosten → Verkauf → Finanzierung (Finanzierung zuletzt). */
function buildForm(kind) {
  rows = [];
  formEl.replaceChildren();

  // 1. Kauf. WG: Wohnfläche zuerst, damit €/m² berechenbar ist; Kaufnebenkosten immer in %.
  const purchaseGroup = addGroup('Kauf');
  if (kind === 'wg') {
    addRow(purchaseGroup, inputRow('livingArea'));
    addRow(purchaseGroup, inputRow('closingCostsPercent', { hint: (r) => Fmt.currency(r.closingCosts) }));
    addRow(purchaseGroup, inputRow('wgRenovation', { hint: (r) => Fmt.perSqm(r.renovationPerSqm) }));
    addRow(purchaseGroup, inputRow('wgOther'));
  } else {
    addRow(purchaseGroup, inputRow('livingArea'));
    if (state.settings.closingCostMode === 'euro') {
      addRow(purchaseGroup, inputRow('closingCostsEuro'));
    } else {
      addRow(purchaseGroup, inputRow('closingCostsPercent', { hint: (r) => Fmt.currency(r.closingCosts) }));
    }
    addRow(purchaseGroup, inputRow('renovationCosts', { hint: (r) => Fmt.perSqm(r.renovationPerSqm) }));
    addRow(purchaseGroup, inputRow('otherCosts'));
  }

  // 2. Laufende Kosten während der Projektlaufzeit (alle Seiten). Mit Button „Standard“: Hausgeld 300 €, Strom/Heizung 0 €.
  const operatingStandard = el('button', 'std-btn', 'Standard');
  operatingStandard.type = 'button';
  operatingStandard.addEventListener('click', () => {
    currentPage().inputs.hausgeld = 300;
    currentPage().inputs.heatingCosts = 0;
    changed();
  });
  const operatingGroup = addGroup('Laufende Kosten', operatingStandard);
  addRow(operatingGroup, inputRow('hausgeld'));
  addRow(operatingGroup, inputRow('heatingCosts'));
  if (kind === 'vermietet') {
    addRow(operatingGroup, lockedRow('Mieteinnahmen p. M.', {
      hint: () => null,
      value: (r) => Fmt.currency(r.rentalIncome),
    }));
  }
  addRow(operatingGroup, lockedRow('Laufende Kosten gesamt', {
    hint: () => `für ${Fmt.fieldNumber(state.financing.durationMonths, 0)} Monate`,
    value: (r) => Fmt.currency(r.holdingCosts),
  }));

  // 3. Verkauf mit Standard-Button: setzt Parameter und Verkaufswerte der Art zurück.
  const standard = el('button', 'std-btn', 'Standard');
  standard.type = 'button';
  standard.addEventListener('click', () => {
    resetSaleDefaults();
    changed();
  });
  const salesGroup = addGroup('Verkauf', standard);

  if (kind === 'vermietet') {
    addRow(salesGroup, inputRow('rent', { hint: (r) => Fmt.perSqm(r.currentRentPerSqm) }));
    addRow(salesGroup, inputRow('rentSurcharge', {
      hint: (r) => `${Fmt.currency(r.targetRent)} · ${Fmt.perSqm(r.targetRentPerSqm)}`,
      lock: true,
    }));
    addRow(salesGroup, inputRow('parkingRent'));
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, buyerYieldRow());
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
  } else if (kind === 'kap') {
    addRow(salesGroup, inputRow('rentPerSqm', { hint: (r) => Fmt.currency(r.monthlyRent) }));
    addRow(salesGroup, buyerYieldRow());
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
  } else if (kind === 'wg') {
    // Verkaufspreis je m² steht im Kopf. Hier: Zimmer, Mieten, Stellplätze, Stellplatz-Verkaufspreis.
    addRow(salesGroup, inputRow('wgRooms'));
    addRow(salesGroup, inputRow('wgRoomRent', { hint: (r) => Fmt.currency(r.monthlyRent) }));
    addRow(salesGroup, inputRow('wgParkingCount'));
    addRow(salesGroup, inputRow('wgParkingRent'));
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, buyerYieldRow());
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
  } else {
    // Leerstehend EN: Objektpreis steht im Kopf. Hier nur Stellplatz und Vertriebskosten.
    addRow(salesGroup, inputRow('parkingSalePrice'));
    addRow(salesGroup, inputRow('salesCommission', { hint: (r) => Fmt.currency(r.salesCommission) }));
  }

  // 4. Finanzierung: global für alle Seiten, letzte Gruppe. Tilgung entfällt. Mit Button „Standard“.
  const financingStandard = el('button', 'std-btn', 'Standard');
  financingStandard.type = 'button';
  financingStandard.addEventListener('click', () => {
    state.financing = { ...DEFAULT_FINANCING };
    changed();
  });
  const financingGroup = addGroup('Finanzierung', financingStandard);
  addRow(financingGroup, inputRow('loanPercent', { hint: (r) => Fmt.currency(r.loanAmount) }));
  addRow(financingGroup, inputRow('interestPercent', { hint: (r) => Fmt.currency(r.financingInterest) }));
  addRow(financingGroup, inputRow('durationMonths'));
  addRow(financingGroup, inputRow('processingFeePercent', { hint: (r) => Fmt.currency(r.financingFee) }));
  addRow(financingGroup, lockedRow('Finanzierungskosten', {
    hint: () => null,
    value: (r) => Fmt.currency(r.financingCosts),
  }));
}

/** Baut Formular nur neu, wenn sich Art oder Kostenmodus ändern. */
function ensureForm() {
  const kind = currentKind();
  const key = `${kind}|${state.settings.closingCostMode}`;
  if (key === formKey) return;
  formKey = key;
  buildForm(kind);
}

// MARK: - Kopf

// Marge (GIK): immer bearbeitbar.
const marginField = numberField({
  spec: FIELDS.targetMargin,
  header: true,
  get: () => currentPage().parameters.targetMargin,
  set: (value) => {
    currentPage().parameters.targetMargin = value;
    changed();
  },
  display: (value) => Fmt.percent(value),
  clamp: (value) => Math.max(0, value),
});

// Verkaufspreis je m² (Arten vermietet, KAP, WG): Objektpreis ohne Stellplatz, immer bearbeitbar.
const vkSqmField = numberField({
  spec: FIELDS.salePricePerSqm,
  header: true,
  get: () => currentPage().inputs.salePricePerSqm,
  set: (value) => {
    currentPage().inputs.salePricePerSqm = value;
    changed();
  },
  display: (value) => Fmt.perSqm(value),
  clamp: (value) => Math.max(0, value),
});

// Verkaufspreis EN: Objektpreis gesamt in € (ohne Stellplatz), immer bearbeitbar.
const vkField = numberField({
  spec: FIELDS.salePrice,
  header: true,
  get: () => currentPage().inputs.salePrice,
  set: (value) => {
    currentPage().inputs.salePrice = value;
    changed();
  },
  display: (value) => Fmt.currency(value),
  clamp: (value) => Math.max(0, value),
});

let headSqm = null;

/** Kasten mit Stift: bearbeitbar. */
function editableHeadBox(inputEl) {
  const box = el('div', 'head-box');
  box.append(inputEl);
  box.insertAdjacentHTML('beforeend', PENCIL_SVG);
  return box;
}

/** Kopffelder nur neu bauen, wenn sich die Art des Verkaufspreises ändert (der Fokus bleibt sonst erhalten). */
function buildHeadSlots(sqm) {
  $('margin-slot').replaceChildren(editableHeadBox(marginField.el));
  $('vk-slot').replaceChildren(editableHeadBox(sqm ? vkSqmField.el : vkField.el));
}

/** Zweite Zeile unter dem Verkaufspreis: „+ … Verkaufspreis Stellplatz“, nur bei Stellplatz > 0 (sonst leer und ausgeblendet). */
function parkingSalesInfo(result, parkingSalePrice) {
  return parkingSalePrice > 0 ? `+ ${Fmt.currency(result.parkingValue)} Verkaufspreis Stellplatz` : '';
}

/** Infotext unter der Marge: Betrag, mit Stellplatz zusätzlich die Marge in % (inkl. Stellplatz). */
function marginInfo(result, parkingSalePrice) {
  const euro = Fmt.currency(result.marginEuro);
  if (!(parkingSalePrice > 0) || result.marginPercent === null) return euro;
  return `${euro} · ${Fmt.percent(result.marginPercent)} inkl. Stellplatz`;
}

function updateHeader(result, page) {
  const possible = result.isPurchasePossible;
  const maxEl = $('h-max');
  maxEl.textContent = Fmt.currency(result.maxPurchasePrice);
  maxEl.classList.toggle('warn', !possible);
  // Eine Zeile unter dem EK: €/m² bei möglichem Ankauf, sonst der Hinweis. Gleiche Höhe, keine Lücke.
  const sqmEl = $('h-max-sqm');
  sqmEl.textContent = possible
    ? Fmt.perSqm(result.maxPurchasePricePerSqm)
    : 'Kein Ankauf möglich';
  sqmEl.classList.toggle('warn', !possible);

  // Nicht EN: große Zahl im Verkaufspreis ist €/m², darunter der Gesamtbetrag. EN: Objektpreis in €.
  const sqm = currentKind() !== 'en';
  if (headSqm !== sqm) {
    headSqm = sqm;
    buildHeadSlots(sqm);
  }
  marginField.sync();
  (sqm ? vkSqmField : vkField).sync();
  $('h-margin-eur').textContent = marginInfo(result, page.inputs.parkingSalePrice);
  // Erste Zeile: Objektpreis in € (nicht EN) bzw. €/m² (EN). Zweite Zeile: Stellplatz, falls vorhanden.
  $('h-vk-sqm').textContent = sqm ? Fmt.currency(result.objectSalePrice) : Fmt.perSqm(result.objectSalePricePerSqm);
  setHint($('h-vk-parking'), parkingSalesInfo(result, page.inputs.parkingSalePrice));
  $('h-gik').textContent = Fmt.currency(result.totalInvestment);
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
  state.pages.wg = makePage('wg');
  state.financing = { ...DEFAULT_FINANCING };
  changed();
}

// MARK: - Render

function render() {
  ensureForm();
  const page = currentPage();
  const result = compute(currentKind(), page.inputs, page.parameters, state.settings, state.financing);

  updateHeader(result, page);
  for (const row of rows) row.update(result);

  modeUpdate();
  variantUpdate();
  $('seg-variant').hidden = state.mode !== 'leerstehend';

  for (const node of document.querySelectorAll('.fit')) fitText(node);
}

// MARK: - Scrollposition bei Zahlenfeldern

// Die Seite scrollt über das Fenster. Beim Antippen eines Zahlenfeldes schiebt iOS Safari das Feld
// über der Tastatur in die Sicht. Die Position davor wird gemerkt und nach dem Verlassen des Feldes
// sowie nach dem Schließen der Tastatur wiederhergestellt, außer der Nutzer hat selbst gescrollt.
const KEEP_TIMEOUT_MS = 800;
const scrollKeep = { saved: null, userScrolled: false, pending: false, timer: null };

function isNumberField(node) {
  return node instanceof HTMLInputElement && node.hasAttribute('data-number-field');
}

function keepScrollStart() {
  if (scrollKeep.saved !== null) return;
  scrollKeep.saved = window.scrollY;
  scrollKeep.userScrolled = false;
}

function keepScrollRestore() {
  if (scrollKeep.saved === null || scrollKeep.userScrolled) return;
  window.scrollTo(0, scrollKeep.saved);
}

function keepScrollCancelPending() {
  clearTimeout(scrollKeep.timer);
  scrollKeep.timer = null;
  scrollKeep.pending = false;
}

function keepScrollFinish() {
  if (scrollKeep.saved === null) return;
  keepScrollRestore();
  keepScrollCancelPending();
  scrollKeep.pending = true;
  scrollKeep.timer = setTimeout(keepScrollDone, KEEP_TIMEOUT_MS);
}

function keepScrollDone() {
  keepScrollRestore();
  keepScrollCancelPending();
  scrollKeep.saved = null;
  scrollKeep.userScrolled = false;
}

function installScrollKeeper() {
  document.addEventListener('pointerdown', (event) => {
    if (isNumberField(event.target)) keepScrollStart();
  }, true);

  document.addEventListener('focusin', (event) => {
    if (!isNumberField(event.target)) return;
    keepScrollStart();
    keepScrollCancelPending();
  });

  // Wechsel zu einem anderen Zahlenfeld: der zuerst gemerkte Wert bleibt.
  document.addEventListener('focusout', (event) => {
    if (!isNumberField(event.target) || isNumberField(event.relatedTarget)) return;
    keepScrollFinish();
  });

  // Zieht der Nutzer selbst, wird nicht zurückgesetzt.
  window.addEventListener('touchmove', () => {
    if (scrollKeep.saved === null) return;
    if (isNumberField(document.activeElement) || scrollKeep.pending) scrollKeep.userScrolled = true;
  }, { passive: true });

  // Nach dem Schließen der Tastatur (Größe des sichtbaren Bereichs ändert sich), mit Sicherheits-Timeout.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (scrollKeep.pending) keepScrollRestore();
    });
  }
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
      { value: 'wg', label: 'WG' },
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
  installScrollKeeper();
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
