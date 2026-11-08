// Tests für die Rechenlogik. Ausführen mit: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compute,
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
const SALES = { marginBasis: 'salesPrice', closingCostMode: 'euro' };
const PERCENT = { marginBasis: 'salesPrice', closingCostMode: 'percent' };
const GIK = { marginBasis: 'totalInvestment', closingCostMode: 'euro' };
/** Vermietet-Parameter: Marge 20 %, Vertrieb 0 %, Rendite 4,5 %, Soll-Miete +15 %. */
const RENT_PARAMS = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5, rentSurchargePercent: 15 };

test('VPS vermietet: Soll-Miete, Objektpreis, VK, EK und Sanierung/m²', () => {
  const inputs = base({
    rent: 1000,
    livingArea: 100,
    parkingRent: 50,
    closingCostsPercent: 10,
    renovationCosts: 20000,
    otherCosts: 0,
  });
  const params = { ...RENT_PARAMS, salesCommission: 10 };
  const r = compute('vermietet', inputs, params, PERCENT);

  // Objekt = 1.150 × 12 / 0,045 = 306.666,67; Stellplatz = 50 × 12 / 0,045 = 13.333,33; VK = 320.000
  assert.equal(round2(r.objectSalePrice), 306666.67);
  assert.equal(round2(r.salePrice), 320000);
  assert.equal(round2(r.salesCommission), 32000);
  assert.equal(round2(r.marginEuro), 64000);
  assert.equal(round2(r.maxPurchasePrice), 185454.55);
  assert.equal(round2(r.renovationPerSqm), 200);
  assert.equal(round2(r.targetRent), 1150);
});

test('T2 vermietet: Objektpreis 306.666,67, VK 320.000, M 64.000, EK 230.630,63', () => {
  const inputs = base({
    rent: 1000,
    livingArea: 100,
    parkingRent: 50,
    closingCostsPercent: 11,
    renovationCosts: 0,
    otherCosts: 0,
  });
  const r = compute('vermietet', inputs, RENT_PARAMS, PERCENT);

  assert.equal(round2(r.objectSalePrice), 306666.67);
  assert.equal(round2(r.salePrice), 320000);
  assert.equal(round2(r.marginEuro), 64000);
  assert.equal(round2(r.maxPurchasePrice), 230630.63);
  assert.equal(round2(r.targetRent), 1150);
  assert.equal(round2(r.targetRentPerSqm), 11.5);
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

test('T4 Standardwerte: Zins 5,5 %, Gebühr 1 %, KNK 11 % in %, Soll-Miete 15 %, Rendite Vermietet 4,5 %', () => {
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

test('V1 Leerstehend EN mit Prozent-Kaufnebenkosten', () => {
  const inputs = base({
    salePrice: 250000,
    parkingSalePrice: 15000,
    livingArea: 60,
    closingCostsPercent: 10,
    renovationCosts: 20000,
    otherCosts: 0,
  });
  const params = { targetMargin: 20, salesCommission: 5, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('en', inputs, params, PERCENT);

  assert.equal(round2(r.salePrice), 265000);
  assert.equal(round2(r.salesCommission), 13250);
  assert.equal(round2(r.marginEuro), 53000);
  assert.equal(round2(r.maxPurchasePrice), 162500);
  assert.equal(round2(r.closingCosts), 16250);
  assert.equal(round2(r.totalInvestment), 198750);
  assert.equal(round2(r.marginPercent), 20);
  assert.equal(round2(r.objectSalePricePerSqm), 4166.67);
  assert.equal(round2(r.maxPurchasePricePerSqm), 2708.33);
  // Invariante: GIK + Marge + Vertriebskosten = VK
  assert.equal(round2(r.totalInvestment + r.marginEuro + r.salesCommission), round2(r.salePrice));
});

test('KAP1: VK/m², Objektpreis, Marge, EK und Miete p. M.', () => {
  const inputs = base({
    livingArea: 60,
    parkingSalePrice: 0,
    closingCostsEuro: 10000,
    renovationCosts: 20000,
    otherCosts: 0,
  });
  const params = { targetMargin: 17, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('kap', inputs, params, SALES);

  assert.equal(round2(r.objectSalePricePerSqm), 3200);
  assert.equal(round2(r.objectSalePrice), 192000);
  assert.equal(round2(r.marginEuro), 32640);
  assert.equal(round2(r.maxPurchasePrice), 129360);
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

test('Basis GIK: Marge 30000, EK 150000, Marge 20,00 %', () => {
  const inputs = base({
    salePrice: 200000,
    parkingSalePrice: 0,
    closingCostsEuro: 0,
    renovationCosts: 0,
    otherCosts: 0,
    livingArea: 60,
  });
  const params = { targetMargin: 20, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('en', inputs, params, GIK);

  assert.equal(round2(r.salesCommission), 20000);
  assert.equal(round2(r.marginEuro), 30000);
  assert.equal(round2(r.maxPurchasePrice), 150000);
  assert.equal(round2(r.totalInvestment), 150000);
  assert.equal(round2(r.marginPercent), 20);
});

test('Kundenbeispiel: VK 100000, Vertrieb 10, Marge 0, Kosten 0 ergibt EK 90000', () => {
  const inputs = base({
    salePrice: 100000,
    parkingSalePrice: 0,
    closingCostsEuro: 0,
    renovationCosts: 0,
    otherCosts: 0,
  });
  const params = { targetMargin: 0, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('en', inputs, params, SALES);

  assert.equal(round2(r.maxPurchasePrice), 90000);
});

test('Vermietet: Ist-Miete 600, Soll +15 % = 690, Stellplatzmiete 50, Rendite 4,5 %', () => {
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
  assert.equal(parseNumber('15,5 %'), 15.5);
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
  assert.equal(fieldDisplay(FIELDS.salePrice, 250000), '250.000\u00A0€');
  assert.equal(fieldDisplay(FIELDS.salePrice, 2000000), '2.000.000\u00A0€');
  assert.equal(fieldDisplay(FIELDS.livingArea, 60), '60\u00A0m²');
  assert.equal(fieldDisplay(FIELDS.targetYield, 4.5), '4,5\u00A0%');
  assert.equal(fieldDisplay(FIELDS.salePricePerSqm, 4000), '4.000\u00A0€/m²');
  assert.equal(fieldDisplay(FIELDS.rentPerSqm, 12), '12,00\u00A0€/m²');
});

// Finanzierung (Prüfwerte wie in den Swift-Tests, FinancingTests.swift)
// Altwerte ohne Bearbeitungsgebühr (0 %), damit die bisherigen Sollwerte unverändert gelten.
const FIN = { loanPercent: 100, interestPercent: 4.7, repaymentPercent: 1.5, repaymentEnabled: true, durationMonths: 6, processingFeePercent: 0 };
const CASE_INPUTS = base({
  salePrice: 300000,
  parkingSalePrice: 0,
  livingArea: 60,
  closingCostsEuro: 10000,
  closingCostsPercent: 10,
  renovationCosts: 20000,
  otherCosts: 0,
});
const CASE_PARAMS = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };

test('Finanzierung a): Euro-KNK 10.000 €, 100 % / 4,7 % / 1,5 % an / 6 Monate', () => {
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, FIN);
  assert.equal(round2(r.maxPurchasePrice), 203685.74);
  assert.equal(round2(r.financingCosts), 6314.26);
  assert.equal(round2(r.loanAmount), 203685.74);
  assert.equal(round2(r.financingInterest), 4786.61);
  assert.equal(round2(r.financingRepayment), 1527.64);
  // Invariante: EK + KNK + K + M + F = N (VK 300.000, Marge 60.000, K 20.000)
  assert.equal(round2(r.maxPurchasePrice + 10000 + 20000 + 60000 + r.financingCosts), 300000);
});

test('Finanzierung b): Tilgung aus, Tilgung 0 €', () => {
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, { ...FIN, repaymentEnabled: false });
  assert.equal(round2(r.maxPurchasePrice), 205178.31);
  assert.equal(round2(r.financingCosts), 4821.69);
  assert.equal(round2(r.financingRepayment), 0);
});

test('Finanzierung c): Prozent-KNK 10 %', () => {
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, PERCENT, FIN);
  assert.equal(round2(r.maxPurchasePrice), 194518.13);
});

test('Finanzierung d): Höhe 0 % ergibt den Wert ohne Finanzierung', () => {
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, { ...FIN, loanPercent: 0 });
  const plain = compute('en', CASE_INPUTS, CASE_PARAMS, SALES);
  assert.equal(round2(r.maxPurchasePrice), 210000);
  assert.equal(r.financingCosts, 0);
  assert.equal(r.maxPurchasePrice, plain.maxPurchasePrice);
});

test('Finanzierung: ohne Parameter wie bisher (kein Einfluss)', () => {
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES);
  assert.equal(round2(r.maxPurchasePrice), 210000);
  assert.equal(r.financingCosts, 0);
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
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 15), '+15,0\u00A0%');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 0), '+0,0\u00A0%');
  assert.equal(fieldDisplay(FIELDS.rentSurcharge, 12.5), '+12,5\u00A0%');
  // Bearbeitungstext ohne Pluszeichen, Eingabe mit Pluszeichen wird akzeptiert.
  assert.equal(Fmt.editingNumber(15), '15');
  assert.equal(parseNumber('+15'), 15);
  assert.equal(parseNumber('+15,5 %'), 15.5);
  assert.equal(parseNumber('+'), null);
  // Andere Felder ohne Vorzeichen.
  assert.equal(fieldDisplay(FIELDS.targetYield, 4.5), '4,5\u00A0%');
});

test('Label „Verkaufspreis“ ohne „Objekt“ für beide Verkaufspreis-Felder', () => {
  assert.equal(FIELDS.salePrice.label, 'Verkaufspreis');
  assert.equal(FIELDS.salePricePerSqm.label, 'Verkaufspreis');
  assert.equal(FIELDS.parkingSalePrice.label, 'Verkaufspreis Stellplatz/Garage');
});

test('T1 EN Finanzierung mit Bearbeitungsgebühr 1 %: EK 200.956,94, F 9.043,06', () => {
  const fin = { loanPercent: 100, interestPercent: 5.5, repaymentPercent: 1.5, repaymentEnabled: true, durationMonths: 6, processingFeePercent: 1 };
  const r = compute('en', CASE_INPUTS, CASE_PARAMS, SALES, fin);
  assert.equal(round2(r.maxPurchasePrice), 200956.94);
  assert.equal(round2(r.financingCosts), 9043.06);
  assert.equal(round2(r.financingFee), 2009.57);
  // Invariante: EK + KNK + K + M + F = N (VK 300.000, Marge 60.000, K 20.000, KNK 10.000)
  assert.equal(round2(r.maxPurchasePrice + 10000 + 20000 + 60000 + r.financingCosts), 300000);
});

// Seite WG (Prüfwerte wie in CalcKindTests.swift, WGTests)
const WG_PARAMS = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 6.5, rentSurchargePercent: 15 };
const WG_PERCENT = { marginBasis: 'salesPrice', closingCostMode: 'percent' };
const wgInputs = (overrides = {}) => ({ ...DEFAULT_INPUTS_WG, ...overrides });

test('WG 3 Zimmer × 500 €, 0 Stellplätze: VK 276.923,08, Marge 55.384,62, EK 181.566,18', () => {
  // VK = 1.500 × 12 / 0,065; Marge 20 % vom VK; EK = (VK − Marge − 20.000) / 1,11 (ohne Finanzierung)
  const r = compute('wg', wgInputs(), WG_PARAMS, WG_PERCENT);
  assert.equal(round2(r.salePrice), 276923.08);
  assert.equal(round2(r.marginEuro), 55384.62);
  assert.equal(round2(r.maxPurchasePrice), 181566.18);
  assert.equal(round2(r.monthlyRent), 1500);
  assert.equal(r.isPurchasePossible, true);
  // Invariante: EK + KNK + Sanierung + Marge = VK
  assert.equal(round2(r.maxPurchasePrice + r.closingCosts + 20000 + r.marginEuro), 276923.08);
});

test('WG 3 Zimmer, 2 Stellplätze à 50 €: VK 295.384,62', () => {
  const r = compute('wg', wgInputs({ wgParkingCount: 2, parkingRent: 50 }), WG_PARAMS, WG_PERCENT);
  assert.equal(round2(r.salePrice), 295384.62);
});

test('WG: Kaufnebenkosten immer in % (auch bei Einstellung in €)', () => {
  const euro = compute('wg', wgInputs(), WG_PARAMS, { marginBasis: 'salesPrice', closingCostMode: 'euro' });
  const percent = compute('wg', wgInputs(), WG_PARAMS, WG_PERCENT);
  assert.equal(euro.maxPurchasePrice, percent.maxPurchasePrice);
});

test('WG Rendite 0 ergibt keinen Einkaufspreis', () => {
  const r = compute('wg', wgInputs(), { ...WG_PARAMS, targetYield: 0 }, WG_PERCENT);
  assert.equal(r.salePrice, null);
  assert.equal(r.isPurchasePossible, false);
});

test('WG Standardwerte: 3 Zimmer, 500 €, 0 Stellplätze, 50 € je Stellplatz, Rendite 6,5 %, Marge 20 %', () => {
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
  assert.equal(fieldDisplay(FIELDS.wgRooms, 3), '3\u00A0Zimmer');
  assert.equal(fieldDisplay(FIELDS.wgParkingCount, 0), '0\u00A0Stk.');
  assert.equal(Fmt.perRoom(276923.08, 3), '92.307,69\u00A0€ je Zimmer');
  assert.equal(Fmt.perRoom(null, 3), '–');
});

