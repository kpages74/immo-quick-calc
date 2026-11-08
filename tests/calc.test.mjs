// Tests für die Rechenlogik. Ausführen mit: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compute,
  applyManualSalePrice,
  salePriceFromManual,
  manualPriceFromPerSqm,
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

// Kontrollwerte Vermietet-Standard (60 m², Miete 600, +15 %, Rendite 4,5 %, KNK 11 %, Sanierung 20.000, Marge 20 %,
// Hausgeld 300, Finanzierung 100 %, Zins 5,5 %, 6 Monate, Gebühr 1 %). Gleich in Swift-Tests.
const CONTROL_INPUTS = base({
  livingArea: 60, rent: 600, parkingRent: 0, closingCostsPercent: 11,
  renovationCosts: 20000, otherCosts: 0, hausgeld: 300, heatingCosts: 0,
});

test('VPS vermietet: Soll-Miete, Objektpreis, VK, EK und Sanierung/m²', () => {
  const inputs = base({ rent: 1000, livingArea: 100, parkingRent: 50, closingCostsPercent: 10, renovationCosts: 20000, otherCosts: 0 });
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
  const inputs = base({ rent: 1000, livingArea: 100, parkingRent: 50, closingCostsPercent: 11, renovationCosts: 0, otherCosts: 0 });
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

test('T3 vermietet: Rendite 0 ergibt nil bei Objektpreis und EK', () => {
  const inputs = base({ rent: 1000, livingArea: 100, parkingRent: 50, renovationCosts: 0, otherCosts: 0 });
  const r = compute('vermietet', inputs, { ...RENT_PARAMS, targetYield: 0 }, PERCENT);

  assert.equal(r.objectSalePrice, null);
  assert.equal(r.salePrice, null);
  assert.equal(r.maxPurchasePrice, null);
  assert.equal(r.isPurchasePossible, false);
  assert.equal(Fmt.currency(r.salePrice), '–');
});

test('T4 Standardwerte: Zins 5,5 %, Gebühr 1 %, KNK 11 % in %, Soll-Miete 15 %, Rendite Vermietet 4,5\u00A0%', () => {
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
  const r = compute('vermietet', CONTROL_INPUTS, RENT_PARAMS, PERCENT, DEFAULT_FINANCING);
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
  const inputs = { ...CONTROL_INPUTS, closingCostsEuro: 10000 };
  const r = compute('vermietet', inputs, RENT_PARAMS, SALES, DEFAULT_FINANCING);
  assert.equal(round2(r.maxPurchasePrice), 121050.51);
  assert.equal(round2(r.totalInvestment), 151050.51);
  assert.equal(round2(r.marginEuro), 30210.1);
  assert.equal(round2(r.financingCosts), 4539.39);
  assertIdentity(r);
});

test('VK-Modus Vermietet: VK 200.000 ergibt Marge 46.228,26 € = 30,59 %, EK bleibt 118.145,31', () => {
  const std = compute('vermietet', CONTROL_INPUTS, RENT_PARAMS, PERCENT, DEFAULT_FINANCING);
  const r = applyManualSalePrice(std, 200000, 0, 60);
  assert.equal(round2(r.salePrice), 200000);
  assert.equal(round2(r.marginEuro), 46228.26);
  assert.equal(round2(r.marginPercent), 30.59);
  assert.equal(round2(r.maxPurchasePrice), 118145.31);
  assert.equal(round2(r.totalInvestment), 151141.29);
});

test('VK-Modus: Marge darf negativ sein (VK 150.000 ergibt −3.771,74 €)', () => {
  const std = compute('vermietet', CONTROL_INPUTS, RENT_PARAMS, PERCENT, DEFAULT_FINANCING);
  const r = applyManualSalePrice(std, 150000, 0, 60);
  assert.equal(round2(r.marginEuro), -3771.74);
  assert.ok(r.marginPercent < 0);
  assert.equal(round2(r.maxPurchasePrice), 118145.31);
});

test('VK-Modus: Vertrieb mindert den VK vor der Marge (N = VK × (1 − 10 %))', () => {
  const params = { ...RENT_PARAMS, salesCommission: 10 };
  const std = compute('vermietet', CONTROL_INPUTS, params, PERCENT, DEFAULT_FINANCING);
  const r = applyManualSalePrice(std, 200000, 10, 60);
  // N = 200.000 − 20.000 = 180.000; Marge = N − H − GIK − F (GIK und F aus dem Standard mit 10 % Vertrieb)
  assert.equal(round2(r.marginEuro), round2(180000 + 1800 - std.totalInvestment - std.financingCosts));
  assert.equal(round2(r.salesCommission), 20000);
});

test('Identität N − H = GIK + Marge + F: Vermietet, KAP, EN, WG', () => {
  assertIdentity(compute('vermietet', CONTROL_INPUTS, RENT_PARAMS, PERCENT, DEFAULT_FINANCING));
  assertIdentity(compute('kap', base({ livingArea: 60, closingCostsEuro: 10000, renovationCosts: 20000, hausgeld: 300 }),
    { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 }, SALES, DEFAULT_FINANCING));
  assertIdentity(compute('en', base({ salePrice: 250000, parkingSalePrice: 15000, livingArea: 60, closingCostsPercent: 10, renovationCosts: 20000, hausgeld: 300 }),
    { targetMargin: 20, salesCommission: 5, rentPerSqm: 12, targetYield: 4.5 }, PERCENT, DEFAULT_FINANCING));
  assertIdentity(compute('wg', DEFAULT_INPUTS_WG, { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 6.5 }, PERCENT, DEFAULT_FINANCING));
});

test('EN-Rückkehr: salePrice = manueller VK − Stellplatz; EK bleibt beim Wechsel erhalten', () => {
  const inputs = base({ salePrice: 250000, parkingSalePrice: 15000, livingArea: 60, closingCostsPercent: 10, renovationCosts: 20000, otherCosts: 0 });
  const params = { targetMargin: 20, salesCommission: 5, rentPerSqm: 12, targetYield: 4.5 };
  const std = compute('en', inputs, params, PERCENT);
  assert.equal(round2(std.maxPurchasePrice), 172537.88);
  // VK-Modus: Basis-VK = salePrice + Stellplatz = 265.000, EK bleibt.
  const manual = applyManualSalePrice(std, 265000, 5, 60);
  assert.equal(round2(manual.maxPurchasePrice), 172537.88);
  // Rückkehr: salePrice = 265.000 − 15.000 = 250.000, EK wie im Standard.
  assert.equal(salePriceFromManual(265000, 15000), 250000);
  const back = compute('en', { ...inputs, salePrice: salePriceFromManual(265000, 15000) }, params, PERCENT);
  assert.equal(round2(back.maxPurchasePrice), 172537.88);
  // Nicht unter 0.
  assert.equal(salePriceFromManual(10000, 15000), 0);
});

test('manualPriceFromPerSqm: 3.000 €/m² × 60 m² = 180.000 ohne Stellplatz', () => {
  assert.equal(manualPriceFromPerSqm(3000, 60, 0), 180000);
});

test('manualPriceFromPerSqm: mit Stellplatzwert 15.000 ergibt 195.000', () => {
  assert.equal(manualPriceFromPerSqm(3000, 60, 15000), 195000);
});

test('manualPriceFromPerSqm: negative €/m² werden auf 0 begrenzt, Stellplatz bleibt', () => {
  assert.equal(manualPriceFromPerSqm(-5, 60, 100), 100);
});

test('manualPriceFromPerSqm: Fläche 0 ergibt nur den Stellplatzwert', () => {
  assert.equal(manualPriceFromPerSqm(3000, 0, 15000), 15000);
  assert.equal(manualPriceFromPerSqm(3000, 0, 0), 0);
  assert.equal(manualPriceFromPerSqm(3000, -60, 15000), 15000);
});

test('Marge auf GIK: Marge 30.000, EK 150.000, Marge 20,00\u00A0%', () => {
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

test('KAP1: VK/m², Objektpreis, Marge, EK und Miete p. M.', () => {
  const inputs = base({ livingArea: 60, parkingSalePrice: 0, closingCostsEuro: 10000, renovationCosts: 20000, otherCosts: 0 });
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('kap', inputs, params, SALES);

  assert.equal(round2(r.objectSalePricePerSqm), 3200);
  assert.equal(round2(r.objectSalePrice), 192000);
  // EK = (192.000 − 1,17 × 30.000) / 1,17 = 134.102,56; GIK = EK + 10.000 + 20.000
  assert.equal(round2(r.maxPurchasePrice), 134102.56);
  assert.equal(round2(r.marginEuro), 27897.44);
  assert.equal(round2(r.monthlyRent), 720);
});

test('KAP0: Rendite 0 ergibt keinen Objektpreis und keinen EK', () => {
  const inputs = base({ livingArea: 60 });
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 0 };
  const r = compute('kap', inputs, params, SALES);

  assert.equal(r.objectSalePrice, null);
  assert.equal(r.maxPurchasePrice, null);
  assert.equal(r.isPurchasePossible, false);
  assert.equal(Fmt.currency(r.maxPurchasePrice), '–');
});

test('Vermietet: Ist-Miete 600, Soll +15 % = 690, Stellplatzmiete 50, Rendite 4,5\u00A0%', () => {
  const inputs = base({ livingArea: 50, parkingSalePrice: 15000, rent: 600, parkingRent: 50 });
  const r = compute('vermietet', inputs, RENT_PARAMS, SALES);

  // Objekt = 690 × 12 / 0,045 = 184.000; Stellplatz = 50 × 12 / 0,045 = 13.333,33; VK = 197.333,33
  assert.equal(round2(r.targetRent), 690);
  assert.equal(round2(r.objectSalePrice), 184000);
  assert.equal(round2(r.salePrice), 197333.33);
  assert.equal(round2(r.buyerYield), 3.95);
});

test('Vermietet: Soll-Miete 0 % entspricht der Ist-Miete', () => {
  const inputs = base({ livingArea: 50, rent: 600, parkingRent: 0 });
  const r = compute('vermietet', inputs, { ...RENT_PARAMS, rentSurchargePercent: 0 }, SALES);

  assert.equal(round2(r.targetRent), 600);
  assert.equal(round2(r.objectSalePrice), 160000);
});

test('Parser: deutsche Schreibweise und ungültige Eingaben', () => {
  assert.equal(parseNumber('250.000'), 250000);
  assert.equal(parseNumber('7,25'), 7.25);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('15,5\u00A0%'), 15.5);
  assert.equal(parseNumber('200.000 €'), 200000);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('1,2,3'), null);
  assert.equal(parseNumber('-5'), null);
});

test('Formatter: Währung mit Tausenderpunkt und geschütztem Leerzeichen', () => {
  assert.equal(Fmt.currency(1234567.891), '1.234.567,89\u00A0€');
  assert.equal(Fmt.percent(20), '20,00\u00A0%');
  assert.equal(Fmt.perSqm(1234.5), '1.234,50\u00A0€/m²');
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
  assert.equal(fieldDisplay(FIELDS.durationMonths, 6), '6\u00A0Monate');
  assert.equal(fieldDisplay(FIELDS.interestPercent, 4.7), '4,7\u00A0%');
  assert.equal(fieldDisplay(FIELDS.loanPercent, 100), '100\u00A0%');
});

test('Feldanzeige Bearbeitungsgebühr, Soll-Miete und Ist-Miete', () => {
  assert.equal(fieldDisplay(FIELDS.processingFeePercent, 1), '1,0\u00A0%');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 15), '+15,0\u00A0%');
  assert.equal(FIELDS.rent.label, 'Ist-Miete p. M.');
});

test('Soll-Miete Anzeige mit Pluszeichen, bei 0 als „+0,0 %“', () => {
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 15), '+15,0 %');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 0), '+0,0 %');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 12.5), '+12,5 %');
  // Bearbeitungstext ohne Pluszeichen, Eingabe mit Pluszeichen wird akzeptiert.
  assert.equal(Fmt.editingNumber(15), '15');
  assert.equal(parseNumber('+15'), 15);
  assert.equal(parseNumber('+15,5\u00A0%'), 15.5);
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
const wgInputs = (overrides = {}) => ({ ...DEFAULT_INPUTS_WG, ...overrides });

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

test('WG Rendite 0 ergibt keinen Einkaufspreis', () => {
  const r = compute('wg', wgInputs(), { ...WG_PARAMS, targetYield: 0 }, PERCENT);
  assert.equal(r.salePrice, null);
  assert.equal(r.isPurchasePossible, false);
});

test('WG Standardwerte: 3 Zimmer, 500 €, 0 Stellplätze, 50 € je Stellplatz, Rendite 6,5 %, Marge 20\u00A0%', () => {
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
  const inputs = { ...DEFAULT_INPUTS, rent: 494.04, livingArea: 69, parkingRent: 56.25, closingCostsPercent: 10.6,
    renovationCosts: 1000, otherCosts: 1000, hausgeld: 320, heatingCosts: 0 };
  const params = { targetMargin: 6.784676711574065, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5, rentSurchargePercent: 15 };
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
