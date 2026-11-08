// Tests für die Rechenlogik. Ausführen mit: node --test tests/calc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compute,
  legacySaleValues,
  applyLegacySaleDefaults,
  migrateLegacyInputs,
  PRICE_MODEL_VERSION,
  Fmt,
  parseNumber,
  clampField,
  DEFAULT_INPUTS,
  DEFAULT_INPUTS_WG,
  DEFAULT_SETTINGS,
  DEFAULT_FINANCING,
  FIELDS,
  fieldDisplay,
  defaultParameters,
  KIND,
} from '../calc.js';

const round2 = (x) => Math.round(x * 100) / 100;

const base = (overrides = {}) => ({ ...DEFAULT_INPUTS, ...overrides });
const SALES = { closingCostMode: 'euro' };
const PERCENT = { closingCostMode: 'percent' };
/** Vermietet-Parameter: Marge 20 %, Vertrieb 0 %, Rendite 4,5 %, Soll-Miete +15 %. */
const RENT_PARAMS = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5, rentSurchargePercent: 15 };
/** Identität N − H = GIK + Marge + F (Standard), bis auf Rundung. */
function assertIdentity(r) {
  const left = r.salePrice - r.salesCommission - r.holdingCosts;
  const right = r.totalInvestment + r.marginEuro + r.financingCosts;
  assert.ok(Math.abs(left - right) < 0.01, `N − H = ${left}, GIK + Marge + F = ${right}`);
}

/**
 * Vorbelegung wie im Standard: €/m² und Stellplatz-Verkaufspreis aus den bisherigen Rendite-Formeln
 * (legacySaleValues). Die Prüfwerte der Tests bleiben dadurch unverändert.
 */
function withLegacySale(inputs, kind, params) {
  const legacy = legacySaleValues(kind, inputs, params);
  return { ...inputs, salePricePerSqm: legacy.objectPricePerSqm, parkingSalePrice: legacy.parkingPrice };
}

// Kontrollwerte Vermietet-Standard (60 m², Miete 600, +15 %, Rendite 4,5 %, KNK 11 %, Sanierung 20.000, Marge 20 %,
// Hausgeld 300, Finanzierung 100 %, Zins 5,5 %, 6 Monate, Gebühr 1 %). Gleich in Swift-Tests.
const CONTROL_INPUTS = base({
  livingArea: 60, rent: 600, parkingRent: 0, closingCostsPercent: 11,
  renovationCosts: 20000, otherCosts: 0, hausgeld: 300, heatingCosts: 0,
});
const CONTROL_PREFILLED = withLegacySale(CONTROL_INPUTS, KIND.VERMIETET, RENT_PARAMS);

test('VPS vermietet: Soll-Miete, Objektpreis, VK, EK und Sanierung/m²', () => {
  const inputs = withLegacySale(
    base({ rent: 1000, livingArea: 100, parkingRent: 50, closingCostsPercent: 10, renovationCosts: 20000, otherCosts: 0 }),
    KIND.VERMIETET, { ...RENT_PARAMS, salesCommission: 10 });
  const r = compute('vermietet', inputs, { ...RENT_PARAMS, salesCommission: 10 }, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0, durationMonths: 0 });

  // Objekt = 1.150 × 12 / 0,045 = 306.666,67; Stellplatz = 50 × 12 / 0,045 = 13.333,33; VK = 320.000
  assert.equal(round2(r.objectSalePrice), 306666.67);
  assert.equal(round2(r.salePrice), 320000);
  assert.equal(round2(r.salesCommission), 32000);
  // N = 288.000 = (1 + 0,2) × GIK → GIK 240.000, Marge 48.000, EK 200.000
  assert.equal(round2(r.maxPurchasePrice), 200000);
  assert.equal(round2(r.totalInvestment), 240000);
  assert.equal(round2(r.marginEuro), 48000);
  assert.equal(round2(r.renovationPerSqm), 200);
  assert.equal(round2(r.targetRent), 1150);
  assertIdentity(r);
});

test('T2 vermietet: Objektpreis 306.666,67, VK 320.000, Marge 53.333,33, EK 240.240,24', () => {
  const inputs = withLegacySale(
    base({ rent: 1000, livingArea: 100, parkingRent: 50, closingCostsPercent: 11, renovationCosts: 0, otherCosts: 0 }),
    KIND.VERMIETET, RENT_PARAMS);
  const r = compute('vermietet', inputs, RENT_PARAMS, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0, durationMonths: 0 });

  assert.equal(round2(r.objectSalePrice), 306666.67);
  assert.equal(round2(r.salePrice), 320000);
  assert.equal(round2(r.marginEuro), 53333.33);
  assert.equal(round2(r.maxPurchasePrice), 240240.24);
  assert.equal(round2(r.totalInvestment), 266666.67);
  assert.equal(round2(r.targetRent), 1150);
  assert.equal(round2(r.targetRentPerSqm), 11.5);
  assertIdentity(r);
});

test('T3 vermietet: Rendite 0 blockiert nichts, Rendite Käufer ist nur Anzeige', () => {
  const inputs = withLegacySale(
    base({ rent: 1000, livingArea: 100, parkingRent: 50, renovationCosts: 0, otherCosts: 0 }),
    KIND.VERMIETET, RENT_PARAMS);
  const r = compute('vermietet', inputs, { ...RENT_PARAMS, targetYield: 0 }, PERCENT);
  const ref = compute('vermietet', inputs, RENT_PARAMS, PERCENT);

  assert.equal(round2(r.salePrice), 320000);
  assert.equal(r.maxPurchasePrice, ref.maxPurchasePrice);
  assert.equal(r.buyerYield, ref.buyerYield);
  assert.equal(r.isPurchasePossible, true);
});

test('T4 Standardwerte: Zins 5,5 %, Gebühr 1 %, KNK 11 % in %, Soll-Miete 15 %, Rendite Vermietet 4,5 %', () => {
  assert.equal(DEFAULT_FINANCING.interestPercent, 5.5);
  assert.equal(DEFAULT_FINANCING.processingFeePercent, 1);
  assert.equal(DEFAULT_SETTINGS.closingCostMode, 'percent');
  assert.equal(DEFAULT_INPUTS.closingCostsPercent, 11);
  for (const kind of [KIND.VERMIETET, KIND.KAP, KIND.EN]) {
    assert.equal(defaultParameters(kind).rentSurchargePercent, 15);
  }
  assert.equal(defaultParameters(KIND.VERMIETET).targetYield, 4.5);
  assert.equal(defaultParameters(KIND.VERMIETET).targetMargin, 20);
});

test('Einstellung Marge-Basis und Tilgung sind entfernt', () => {
  assert.equal('marginBasis' in DEFAULT_SETTINGS, false);
  assert.equal('repaymentPercent' in DEFAULT_FINANCING, false);
  assert.equal('repaymentEnabled' in DEFAULT_FINANCING, false);
  assert.equal(FIELDS.repaymentPercent, undefined);
});

test('Kontrollwerte Vermietet-Standard: VK 184.000, EK 118.145,31, GIK 151.141,29, Marge 30.228,26, F 4.430,45, H −1.800', () => {
  const r = compute('vermietet', CONTROL_PREFILLED, RENT_PARAMS, PERCENT, DEFAULT_FINANCING);
  assert.equal(round2(r.salePrice), 184000);
  assert.equal(round2(r.maxPurchasePrice), 118145.31);
  assert.equal(round2(r.totalInvestment), 151141.29);
  assert.equal(round2(r.marginEuro), 30228.26);
  assert.equal(round2(r.marginPercent), 20);
  assert.equal(round2(r.financingCosts), 4430.45);
  assert.equal(round2(r.holdingCosts), -1800);
  assertIdentity(r);
});

test('Kontrollwerte Vermietet, KNK in €: EK 121.050,51, Marge 30.210,10, F 4.539,39', () => {
  const inputs = { ...CONTROL_PREFILLED, closingCostsEuro: 10000 };
  const r = compute('vermietet', inputs, RENT_PARAMS, SALES, DEFAULT_FINANCING);
  assert.equal(round2(r.maxPurchasePrice), 121050.51);
  assert.equal(round2(r.totalInvestment), 151050.51);
  assert.equal(round2(r.marginEuro), 30210.1);
  assert.equal(round2(r.financingCosts), 4539.39);
  assertIdentity(r);
});

test('Verkaufspreis ist Eingabe: €/m² für VK 200.000 ändert EK, die Marge in % bleibt 20 %', () => {
  const std = compute('vermietet', CONTROL_PREFILLED, RENT_PARAMS, PERCENT, DEFAULT_FINANCING);
  const inputs = { ...CONTROL_PREFILLED, salePricePerSqm: 200000 / 60 };
  const r = compute('vermietet', inputs, RENT_PARAMS, PERCENT, DEFAULT_FINANCING);
  assert.equal(round2(r.salePrice), 200000);
  assert.equal(round2(r.marginPercent), 20);
  assert.notEqual(round2(r.maxPurchasePrice), round2(std.maxPurchasePrice));
  assertIdentity(r);
});

test('Marge ist Eingabe: Marge 30 % ergibt Marge € = 30 % × GIK, VK bleibt 184.000', () => {
  const r = compute('vermietet', CONTROL_PREFILLED, { ...RENT_PARAMS, targetMargin: 30 }, PERCENT, DEFAULT_FINANCING);
  assert.equal(round2(r.salePrice), 184000);
  assert.equal(round2(r.marginEuro), round2(0.3 * r.totalInvestment));
  assert.equal(round2(r.marginPercent), 30);
});

test('Identität N − H = GIK + Marge + F: Vermietet, KAP, EN, WG', () => {
  assertIdentity(compute('vermietet', CONTROL_PREFILLED, RENT_PARAMS, PERCENT, DEFAULT_FINANCING));
  const kapParams = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };
  assertIdentity(compute('kap', withLegacySale(base({ livingArea: 60, closingCostsEuro: 10000, renovationCosts: 20000, hausgeld: 300 }), KIND.KAP, kapParams),
    kapParams, SALES, DEFAULT_FINANCING));
  assertIdentity(compute('en', base({ salePrice: 250000, parkingSalePrice: 15000, livingArea: 60, closingCostsPercent: 10, renovationCosts: 20000, hausgeld: 300 }),
    { targetMargin: 20, salesCommission: 5, rentPerSqm: 12, targetYield: 4.5 }, PERCENT, DEFAULT_FINANCING));
  const wgParams = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 6.5 };
  assertIdentity(compute('wg', withLegacySale(DEFAULT_INPUTS_WG, KIND.WG, wgParams), wgParams, PERCENT, DEFAULT_FINANCING));
});

test('EN: VK = Objektpreis + Stellplatz; höherer Objektpreis erhöht den EK, Marge in % bleibt 20 %', () => {
  const inputs = base({ salePrice: 250000, parkingSalePrice: 15000, livingArea: 60, closingCostsPercent: 10, renovationCosts: 20000, otherCosts: 0 });
  const params = { targetMargin: 20, salesCommission: 5, rentPerSqm: 12, targetYield: 4.5 };
  const std = compute('en', inputs, params, PERCENT);
  assert.equal(round2(std.maxPurchasePrice), 172537.88);
  assert.equal(round2(std.salePrice), 265000);
  const up = compute('en', { ...inputs, salePrice: 260000 }, params, PERCENT);
  assert.ok(up.maxPurchasePrice > std.maxPurchasePrice);
  assert.equal(round2(up.marginPercent), 20);
});

test('Verkaufspreis je m²: 3.000 €/m² × 60 m² = 180.000 Objekt, + Stellplatz 15.000 = 195.000 VK', () => {
  const inputs = base({ salePricePerSqm: 3000, parkingSalePrice: 15000, livingArea: 60, closingCostsPercent: 0, renovationCosts: 0, otherCosts: 0 });
  const r = compute('vermietet', inputs, { targetMargin: 0, salesCommission: 0 }, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0 });
  assert.equal(round2(r.objectSalePrice), 180000);
  assert.equal(round2(r.salePrice), 195000);
  assert.equal(round2(r.objectSalePricePerSqm), 3000);
});

test('Verkaufspreis je m²: negative Werte werden auf 0 begrenzt, Stellplatz bleibt', () => {
  const inputs = base({ salePricePerSqm: -5, parkingSalePrice: 100, livingArea: 60 });
  const r = compute('vermietet', inputs, { targetMargin: 0, salesCommission: 0 }, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0 });
  assert.equal(r.objectSalePrice, 0);
  assert.equal(round2(r.salePrice), 100);
});

test('Verkaufspreis je m²: Fläche 0 ergibt nur den Stellplatz-Verkaufspreis', () => {
  const inputs = base({ salePricePerSqm: 3000, parkingSalePrice: 15000, livingArea: 0 });
  const r = compute('vermietet', inputs, { targetMargin: 0, salesCommission: 0 }, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0 });
  assert.equal(r.objectSalePrice, 0);
  assert.equal(round2(r.salePrice), 15000);
  assert.equal(r.objectSalePricePerSqm, 3000);
});

test('Marge auf GIK: Marge 30.000, EK 150.000, Marge 20,00 %', () => {
  const inputs = base({ salePrice: 200000, parkingSalePrice: 0, closingCostsEuro: 0, renovationCosts: 0, otherCosts: 0, livingArea: 60 });
  const params = { targetMargin: 20, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('en', inputs, params, SALES);

  assert.equal(round2(r.salesCommission), 20000);
  assert.equal(round2(r.marginEuro), 30000);
  assert.equal(round2(r.maxPurchasePrice), 150000);
  assert.equal(round2(r.totalInvestment), 150000);
  assert.equal(round2(r.marginPercent), 20);
});

test('Kundenbeispiel: VK 100000, Vertrieb 10, Marge 0, Kosten 0 ergibt EK 90000', () => {
  const inputs = base({ salePrice: 100000, parkingSalePrice: 0, closingCostsEuro: 0, renovationCosts: 0, otherCosts: 0 });
  const params = { targetMargin: 0, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('en', inputs, params, SALES);

  assert.equal(round2(r.maxPurchasePrice), 90000);
});

test('KAP1: VK/m², Objektpreis, Marge, EK, Miete p. M. und Rendite Käufer 4,5 %', () => {
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };
  const inputs = withLegacySale(
    base({ livingArea: 60, parkingSalePrice: 0, closingCostsEuro: 10000, renovationCosts: 20000, otherCosts: 0 }),
    KIND.KAP, params);
  const r = compute('kap', inputs, params, SALES);

  assert.equal(round2(r.objectSalePricePerSqm), 3200);
  assert.equal(round2(r.objectSalePrice), 192000);
  // EK = (192.000 − 1,17 × 30.000) / 1,17 = 134.102,56; GIK = EK + 10.000 + 20.000
  assert.equal(round2(r.maxPurchasePrice), 134102.56);
  assert.equal(round2(r.marginEuro), 27897.44);
  assert.equal(round2(r.monthlyRent), 720);
  // Rendite Käufer = 12 × 12 / 3.200 × 100 = 4,50 %
  assert.equal(round2(r.buyerYield), 4.5);
});

test('KAP0: Rendite 0 blockiert nichts, Objektpreis und EK wie in KAP1', () => {
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 0 };
  const inputs = base({ livingArea: 60, salePricePerSqm: 3200, parkingSalePrice: 0, closingCostsEuro: 10000, renovationCosts: 20000, otherCosts: 0 });
  const r = compute('kap', inputs, params, SALES);

  assert.equal(round2(r.objectSalePrice), 192000);
  assert.equal(round2(r.maxPurchasePrice), 134102.56);
  assert.equal(r.isPurchasePossible, true);
  assert.equal(round2(r.buyerYield), 4.5);
});

test('Vermietet: Ist-Miete 600, Soll +15 % = 690, Stellplatzmiete 50, Rendite 4,5 %', () => {
  const inputs = withLegacySale(base({ livingArea: 50, rent: 600, parkingRent: 50 }), KIND.VERMIETET, RENT_PARAMS);
  const r = compute('vermietet', inputs, RENT_PARAMS, SALES);

  // Objekt = 690 × 12 / 0,045 = 184.000; Stellplatz = 50 × 12 / 0,045 = 13.333,33; VK = 197.333,33
  assert.equal(round2(r.targetRent), 690);
  assert.equal(round2(r.objectSalePrice), 184000);
  assert.equal(round2(r.salePrice), 197333.33);
  // Rendite Käufer = (Soll-Miete 690 + Stellplatzmiete 50) × 12 / 197.333,33 = 4,50 %
  assert.equal(round2(r.buyerYield), 4.5);
});

test('Vermietet: Soll-Miete 0 % entspricht der Ist-Miete', () => {
  const params = { ...RENT_PARAMS, rentSurchargePercent: 0 };
  const inputs = withLegacySale(base({ livingArea: 50, rent: 600, parkingRent: 0 }), KIND.VERMIETET, params);
  const r = compute('vermietet', inputs, params, SALES);

  assert.equal(round2(r.targetRent), 600);
  assert.equal(round2(r.objectSalePrice), 160000);
});

test('Parser: deutsche Schreibweise und ungültige Eingaben', () => {
  assert.equal(parseNumber('250.000'), 250000);
  assert.equal(parseNumber('7,25'), 7.25);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('15,5 %'), 15.5);
  assert.equal(parseNumber('200.000 €'), 200000);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('1,2,3'), null);
  assert.equal(parseNumber('-5'), null);
});

test('Formatter: Währung mit Tausenderpunkt und geschütztem Leerzeichen', () => {
  assert.equal(Fmt.currency(1234567.891), '1.234.567,89 €');
  assert.equal(Fmt.percent(20), '20,00 %');
  assert.equal(Fmt.perSqm(1234.5), '1.234,50 €/m²');
  assert.equal(Fmt.currency(null), '–');
});

test('Formatter: Bearbeitungstext ohne Tausenderpunkte', () => {
  assert.equal(Fmt.editingNumber(2500.5), '2500,5');
  assert.equal(Fmt.editingNumber(600), '600');
  assert.equal(Fmt.editingNumber(0.125), '0,13');
  assert.equal(Fmt.fieldNumber(294456, 0), '294.456');
  assert.equal(Fmt.fieldNumber(15, 1), '15,0');
});

test('Marge-Begrenzung: -5 wird 0, 150 wird 100', () => {
  assert.equal(clampField('targetMargin', -5), 0);
  assert.equal(clampField('targetMargin', 150), 100);
  assert.equal(clampField('targetMargin', 20), 20);
});

test('Feldanzeige ohne Fokus mit Einheit und geschütztem Leerzeichen', () => {
  assert.equal(fieldDisplay(FIELDS.salePrice, 250000), '250.000 €');
  assert.equal(fieldDisplay(FIELDS.salePrice, 2000000), '2.000.000 €');
  assert.equal(fieldDisplay(FIELDS.livingArea, 60), '60 m²');
  assert.equal(fieldDisplay(FIELDS.targetYield, 4.5), '4,5 %');
  assert.equal(fieldDisplay(FIELDS.salePricePerSqm, 4000), '4.000 €/m²');
  assert.equal(fieldDisplay(FIELDS.rentPerSqm, 12), '12,00 €/m²');
});

// Finanzierung (Prüfwerte wie in FinancingTests.swift). Ohne Tilgung.
const CASE_INPUTS = base({
  salePrice: 300000, parkingSalePrice: 0, livingArea: 60,
  closingCostsEuro: 10000, closingCostsPercent: 10, renovationCosts: 20000, otherCosts: 0,
});
const CASE_PARAMS = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };

test('Finanzierung a): Euro-KNK 10.000 €, 100 % / 4,7 % / 0 % Gebühr / 6 Monate', () => {
  const fin = { loanPercent: 100, interestPercent: 4.7, durationMonths: 6, processingFeePercent: 0 };
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, fin);
  assert.equal(round2(r.maxPurchasePrice), 215774.42);
  assert.equal(round2(r.financingCosts), 5070.7);
  assert.equal(round2(r.loanAmount), 215774.42);
  // Invariante: EK + KNK + K + Marge + F = VK (300.000, K 20.000)
  assert.equal(round2(r.maxPurchasePrice + 10000 + 20000 + r.marginEuro + r.financingCosts), 300000);
  assertIdentity(r);
});

test('Finanzierung b): Höhe 0 % ergibt den Wert ohne Finanzierung (EK 220.000)', () => {
  const fin = { loanPercent: 0, interestPercent: 4.7, durationMonths: 6, processingFeePercent: 1 };
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, fin);
  const plain = compute('en', CASE_INPUTS, CASE_PARAMS, SALES);
  assert.equal(round2(r.maxPurchasePrice), 220000);
  assert.equal(r.financingCosts, 0);
  assert.equal(r.maxPurchasePrice, plain.maxPurchasePrice);
});

test('Finanzierung c): Prozent-KNK 10 %, Zins 4,7 %, ohne Gebühr', () => {
  const fin = { loanPercent: 100, interestPercent: 4.7, durationMonths: 6, processingFeePercent: 0 };
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, PERCENT, fin);
  assert.equal(round2(r.maxPurchasePrice), 205433.57);
  assert.equal(round2(r.financingCosts), 4827.69);
});

test('Finanzierung d): ohne Parameter (NO_FINANCING) EK 220.000, keine Kosten', () => {
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES);
  assert.equal(round2(r.maxPurchasePrice), 220000);
  assert.equal(r.financingCosts, 0);
});

test('Finanzierung e): Bearbeitungsgebühr 1 %, Zins 5,5 %: EK 213.333,33, F 8.000', () => {
  const fin = { loanPercent: 100, interestPercent: 5.5, durationMonths: 6, processingFeePercent: 1 };
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, fin);
  assert.equal(round2(r.maxPurchasePrice), 213333.33);
  assert.equal(round2(r.financingCosts), 8000);
  assert.equal(round2(r.financingFee), 2133.33);
  assert.equal(round2(r.maxPurchasePrice + 10000 + 20000 + r.marginEuro + r.financingCosts), 300000);
});

test('Feldanzeige Monate und Finanzierungsfelder', () => {
  assert.equal(fieldDisplay(FIELDS.durationMonths, 6), '6 Monate');
  assert.equal(fieldDisplay(FIELDS.interestPercent, 4.7), '4,7 %');
  assert.equal(fieldDisplay(FIELDS.loanPercent, 100), '100 %');
});

test('Feldanzeige Bearbeitungsgebühr, Soll-Miete und Ist-Miete', () => {
  assert.equal(fieldDisplay(FIELDS.processingFeePercent, 1), '1,0 %');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 15), '+15,0 %');
  assert.equal(FIELDS.rent.label, 'Ist-Miete p. M.');
});

test('Soll-Miete Anzeige mit Pluszeichen, bei 0 als „+0,0 %“', () => {
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 15), '+15,0 %');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 0), '+0,0 %');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 12.5), '+12,5 %');
  // Bearbeitungstext ohne Pluszeichen, Eingabe mit Pluszeichen wird akzeptiert.
  assert.equal(Fmt.editingNumber(15), '15');
  assert.equal(parseNumber('+15'), 15);
  assert.equal(parseNumber('+15,5 %'), 15.5);
  assert.equal(parseNumber('+'), null);
  assert.equal(fieldDisplay(FIELDS.targetYield, 4.5), '4,5 %');
});

test('Label „Verkaufspreis“ ohne „Objekt“ für beide Verkaufspreis-Felder', () => {
  assert.equal(FIELDS.salePrice.label, 'Verkaufspreis');
  assert.equal(FIELDS.salePricePerSqm.label, 'Verkaufspreis');
  assert.equal(FIELDS.parkingSalePrice.label, 'Verkaufspreis Stellplatz/Garage');
});

// Seite WG (Prüfwerte wie in CalcKindTests.swift, WGTests)
const WG_PARAMS = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 6.5, rentSurchargePercent: 15 };
const wgInputs = (overrides = {}) => withLegacySale({ ...DEFAULT_INPUTS_WG, ...overrides }, KIND.WG, WG_PARAMS);

test('WG 3 Zimmer × 500 €, 0 Stellplätze, Sanierung 20.000: VK 276.923,08, Marge 46.153,85, EK 189.882,19', () => {
  const r = compute('wg', wgInputs({ wgRenovation: 20000 }), WG_PARAMS, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0 });
  assert.equal(round2(r.salePrice), 276923.08);
  assert.equal(round2(r.marginEuro), 46153.85);
  assert.equal(round2(r.maxPurchasePrice), 189882.19);
  assert.equal(round2(r.monthlyRent), 1500);
  assert.equal(r.isPurchasePossible, true);
  assertIdentity(r);
});

test('WG Wohnfläche 90 m²: Standard, €/m² für EK und Verkaufspreis', () => {
  assert.equal(DEFAULT_INPUTS_WG.livingArea, 90);
  const r = compute('wg', wgInputs({ wgRenovation: 20000 }), WG_PARAMS, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0 });
  assert.equal(round2(r.maxPurchasePricePerSqm), 2109.8);
  assert.equal(round2(r.objectSalePricePerSqm), 3076.92);
  assert.equal(round2(r.renovationPerSqm), 222.22);
  // Standard mit Hausgeld 300 € × 6 Monate (wie Swift): H = 1.800, EK 188.530,84
  const withHausgeld = compute('wg', wgInputs({ wgRenovation: 20000, hausgeld: 300 }), WG_PARAMS, PERCENT, { ...DEFAULT_FINANCING, loanPercent: 0 });
  assert.equal(round2(withHausgeld.maxPurchasePricePerSqm), 2094.79);
});

test('WG 3 Zimmer, 2 Stellplätze à 50 €: VK 295.384,62', () => {
  const r = compute('wg', wgInputs({ wgParkingCount: 2, parkingRent: 50 }), WG_PARAMS, PERCENT);
  assert.equal(round2(r.salePrice), 295384.62);
});

test('WG: Kaufnebenkosten immer in % (auch bei Einstellung in €)', () => {
  const euro = compute('wg', wgInputs(), WG_PARAMS, SALES);
  const percent = compute('wg', wgInputs(), WG_PARAMS, PERCENT);
  assert.equal(euro.maxPurchasePrice, percent.maxPurchasePrice);
});

test('WG Rendite 0 blockiert nichts: VK 276.923,08 und Einkauf möglich', () => {
  const r = compute('wg', wgInputs(), { ...WG_PARAMS, targetYield: 0 }, PERCENT);
  assert.equal(round2(r.salePrice), 276923.08);
  assert.equal(r.isPurchasePossible, true);
});

test('WG Standardwerte: 3 Zimmer, 500 €, 0 Stellplätze, 50 € je Stellplatz, Rendite 6,5 %, Marge 20 %', () => {
  assert.equal(DEFAULT_INPUTS_WG.wgRooms, 3);
  assert.equal(DEFAULT_INPUTS_WG.wgRoomRent, 500);
  assert.equal(DEFAULT_INPUTS_WG.wgParkingCount, 0);
  assert.equal(DEFAULT_INPUTS_WG.parkingRent, 50);
  assert.equal(DEFAULT_INPUTS_WG.renovationCosts, 20000);
  assert.equal(DEFAULT_INPUTS_WG.otherCosts, 0);
  assert.equal(DEFAULT_INPUTS_WG.closingCostsPercent, 11);
  assert.equal(defaultParameters(KIND.WG).targetYield, 6.5);
  assert.equal(defaultParameters(KIND.WG).targetMargin, 20);
});

test('WG Feldanzeige mit Einheit Zimmer/Stk. und Anzeige je Zimmer', () => {
  assert.equal(FIELDS.wgRooms.label, 'Anzahl WG-Zimmer');
  assert.equal(fieldDisplay(FIELDS.wgRooms, 3), '3 Zimmer');
  assert.equal(fieldDisplay(FIELDS.wgParkingCount, 0), '0 Stk.');
  assert.equal(Fmt.perRoom(276923.08, 3), '92.307,69 € je Zimmer');
  assert.equal(Fmt.perRoom(null, 3), '–');
});

// Laufende Kosten während der Projektlaufzeit (Prüfwerte wie in OperatingCostsTests.swift)
test('T-H1 Excel-Abgleich Vermietet mit laufenden Kosten: VK 166.505,60, H −921,16, EK 122.907,20', () => {
  const params = { targetMargin: 6.784676711574065, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5, rentSurchargePercent: 15 };
  const inputs = withLegacySale({ ...DEFAULT_INPUTS, rent: 494.04, livingArea: 69, parkingRent: 56.25, closingCostsPercent: 10.6,
    renovationCosts: 1000, otherCosts: 1000, hausgeld: 320, heatingCosts: 0 }, KIND.VERMIETET, params);
  const fin = { loanPercent: 100, interestPercent: 5.5, durationMonths: 4, processingFeePercent: 1 };
  const r = compute('vermietet', inputs, params, PERCENT, fin);
  assert.equal(round2(r.salePrice), 166505.6);
  assert.equal(round2(r.marginEuro), 9358.47);
  assert.equal(round2(r.rentalIncome), 550.29);
  assert.equal(round2(r.holdingCosts), -921.16);
  assert.equal(round2(r.maxPurchasePrice), 122907.2);
  assert.equal(Fmt.currency(r.holdingCosts), '-921,16 €');
  assertIdentity(r);
});

test('T-H2 EN: Hausgeld 300 + Strom 100, 6 Monate → H 2.400; EK sinkt um 2.400 / 1,17 / 1,11', () => {
  const base0 = { ...DEFAULT_INPUTS, salePrice: 300000, livingArea: 60, closingCostsPercent: 11, renovationCosts: 20000, otherCosts: 0, hausgeld: 0, heatingCosts: 0 };
  const withCosts = { ...base0, hausgeld: 300, heatingCosts: 100 };
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5, rentSurchargePercent: 15 };
  const fin = { ...DEFAULT_FINANCING, loanPercent: 0, durationMonths: 6 };
  const without = compute('en', base0, params, PERCENT, fin);
  const r = compute('en', withCosts, params, PERCENT, fin);
  assert.equal(round2(r.holdingCosts), 2400);
  assert.equal(round2(r.rentalIncome), 0);
  // ΔEK = H / ((1 + m)(1 + p)) = 2.400 / (1,17 × 1,11) = 1.848,00
  assert.equal(round2(without.maxPurchasePrice - r.maxPurchasePrice), 1848);
});

test('T-H3 Laufende Kosten: Grenzen, Schritt und Anzeige; Standard Hausgeld 300 €, Strom 0 €', () => {
  assert.equal(FIELDS.hausgeld.min, 0);
  assert.equal(FIELDS.hausgeld.max, 2000);
  assert.equal(FIELDS.hausgeld.step, 10);
  assert.equal(FIELDS.heatingCosts.max, 1000);
  assert.equal(fieldDisplay(FIELDS.hausgeld, 300), '300 €');
  assert.equal(fieldDisplay(FIELDS.heatingCosts, 0), '0 €');
  assert.equal(FIELDS.hausgeld.label, 'Hausgeld p. M.');
  assert.equal(FIELDS.heatingCosts.label, 'Strom + Heizung p. M.');
});

// MARK: - Preismodell 2 (Prüfwerte wie in PriceModelTests, CalcEngineTests.swift)

/** Finanzierung Standard: 100 %, Zins 5,5 %, 6 Monate, Gebühr 1 %. */
const STD_FIN = DEFAULT_FINANCING;

/** Art KAP: 60 m², €/m² 2.800, Miete je m² 13 €, Sanierung 16.000, KNK 11 %, Vertrieb 0 %, Stellplatz 0, Hausgeld 300 €. */
function kapCase({ pricePerSqm = 2800, rentPerSqm = 13, margin = 20 } = {}) {
  const inputs = base({
    salePricePerSqm: pricePerSqm, parkingSalePrice: 0, livingArea: 60, closingCostsPercent: 11,
    renovationCosts: 16000, otherCosts: 0, hausgeld: 300, heatingCosts: 0,
  });
  const params = { targetMargin: margin, salesCommission: 0, rentPerSqm, targetYield: 4.5, rentSurchargePercent: 15 };
  return { inputs, params };
}

test('a) KAP-Kennzahlen: VK 168.000, EK 107.338,44, GIK 135.145,67, Marge 27.029,13, Rendite Käufer 5,5714 %', () => {
  const { inputs, params } = kapCase();
  const r = compute('kap', inputs, params, PERCENT, STD_FIN);
  assert.equal(round2(r.salePrice), 168000);
  assert.ok(Math.abs(r.maxPurchasePrice - 107338.44) < 0.01, `EK ${r.maxPurchasePrice}`);
  assert.ok(Math.abs(r.totalInvestment - 135145.67) < 0.01, `GIK ${r.totalInvestment}`);
  assert.ok(Math.abs(r.marginEuro - 27029.13) < 0.01, `Marge ${r.marginEuro}`);
  assert.ok(Math.abs(r.buyerYield - 5.5714) < 0.0001, `Rendite ${r.buyerYield}`);
  assertIdentity(r);
});

test('b) Vermietet Standardwerte aus defaults: VK 184.000, EK 118.145,31 (±0,01)', () => {
  const params = defaultParameters(KIND.VERMIETET);
  const inputs = applyLegacySaleDefaults(KIND.VERMIETET, { ...DEFAULT_INPUTS, hausgeld: 300 }, params);
  const r = compute('vermietet', inputs, params, PERCENT, DEFAULT_FINANCING);
  assert.equal(round2(r.salePrice), 184000);
  assert.ok(Math.abs(r.maxPurchasePrice - 118145.31) < 0.01, `EK ${r.maxPurchasePrice}`);
});

test('c) KAP: Miete je m² ändern ändert EK und VK nicht, nur die Rendite Käufer', () => {
  const a = kapCase();
  const b = kapCase({ rentPerSqm: 15 });
  const before = compute('kap', a.inputs, a.params, PERCENT, STD_FIN);
  const after = compute('kap', b.inputs, b.params, PERCENT, STD_FIN);
  assert.equal(after.maxPurchasePrice, before.maxPurchasePrice);
  assert.equal(after.salePrice, before.salePrice);
  assert.notEqual(after.buyerYield, before.buyerYield);
  assert.equal(round2(after.buyerYield), 6.43);
});

test('c) Marge ändern ändert den VK nicht', () => {
  const a = kapCase();
  const b = kapCase({ margin: 25 });
  const before = compute('kap', a.inputs, a.params, PERCENT, STD_FIN);
  const after = compute('kap', b.inputs, b.params, PERCENT, STD_FIN);
  assert.equal(after.salePrice, before.salePrice);
  assert.notEqual(after.maxPurchasePrice, before.maxPurchasePrice);
  assert.equal(round2(after.marginPercent), 25);
});

test('c) €/m² ändern ändert die Marge in % nicht', () => {
  const low = kapCase({ pricePerSqm: 2800 });
  const high = kapCase({ pricePerSqm: 3000 });
  const rLow = compute('kap', low.inputs, low.params, PERCENT, STD_FIN);
  const rHigh = compute('kap', high.inputs, high.params, PERCENT, STD_FIN);
  assert.equal(round2(rLow.marginPercent), 20);
  assert.equal(round2(rHigh.marginPercent), 20);
  assert.notEqual(rLow.maxPurchasePrice, rHigh.maxPurchasePrice);
});

test('c) WG: Kaltmiete ändern ändert den EK nicht, nur die Rendite Käufer', () => {
  const params = defaultParameters(KIND.WG);
  const inputs = applyLegacySaleDefaults(KIND.WG, DEFAULT_INPUTS_WG, params);
  const before = compute('wg', inputs, params, PERCENT, STD_FIN);
  const after = compute('wg', { ...inputs, wgRoomRent: 600 }, params, PERCENT, STD_FIN);
  assert.equal(after.maxPurchasePrice, before.maxPurchasePrice);
  assert.equal(after.salePrice, before.salePrice);
  assert.notEqual(after.buyerYield, before.buyerYield);
});

test('d) Migration Vermietet mit altem VK-Modus M = 200.000: Stellplatz 13.333,33, €/m² 3.111,11, VK 200.000', () => {
  const params = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5, rentSurchargePercent: 15 };
  const inputs = { ...DEFAULT_INPUTS, rent: 600, livingArea: 60, parkingRent: 50, closingCostsPercent: 11,
    renovationCosts: 20000, otherCosts: 0, hausgeld: 300, heatingCosts: 0 };
  const migrated = migrateLegacyInputs(KIND.VERMIETET, inputs, params, { vkMode: true, manualSalePrice: 200000 });
  assert.equal(round2(migrated.parkingSalePrice), 13333.33);
  assert.equal(round2(migrated.salePricePerSqm), 3111.11);
  const r = compute('vermietet', migrated, params, PERCENT);
  assert.equal(round2(r.salePrice), 200000);
});

test('d) Migration KAP ohne VK-Modus: €/m² 13 × 12 / 5 % = 3.120, Stellplatz bleibt 5.000 €', () => {
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 13, targetYield: 5, rentSurchargePercent: 15 };
  const inputs = { ...DEFAULT_INPUTS, livingArea: 60, parkingSalePrice: 5000, renovationCosts: 16000, hausgeld: 300 };
  const migrated = migrateLegacyInputs(KIND.KAP, inputs, params, { vkMode: false, manualSalePrice: 0 });
  assert.equal(round2(migrated.salePricePerSqm), 3120);
  assert.equal(migrated.parkingSalePrice, 5000);
  const r = compute('kap', migrated, params, PERCENT);
  assert.equal(round2(r.salePrice), 192200);
});

test('d) Migration EN mit altem VK-Modus: Objektpreis = M − Stellplatz = 260.000 − 10.000 = 250.000', () => {
  const inputs = { ...DEFAULT_INPUTS, salePrice: 300000, parkingSalePrice: 10000, livingArea: 60 };
  const migrated = migrateLegacyInputs(KIND.EN, inputs, defaultParameters(KIND.EN), { vkMode: true, manualSalePrice: 260000 });
  assert.equal(migrated.salePrice, 250000);
  assert.equal(migrated.parkingSalePrice, 10000);
});

test('Preismodell: Version 2, EN bleibt bei Standardwerten unverändert, Rendite 0 lässt Eingaben stehen', () => {
  assert.equal(PRICE_MODEL_VERSION, 2);
  const en = { ...DEFAULT_INPUTS, salePrice: 250000 };
  assert.deepEqual(applyLegacySaleDefaults(KIND.EN, en, defaultParameters(KIND.EN)), en);
  const zeroYield = legacySaleValues(KIND.VERMIETET, { ...DEFAULT_INPUTS, salePricePerSqm: 3000, parkingSalePrice: 700 },
    { ...RENT_PARAMS, targetYield: 0 });
  assert.equal(zeroYield.objectPricePerSqm, 3000);
  assert.equal(zeroYield.parkingPrice, 700);
});
