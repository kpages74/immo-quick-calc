// Tests für die Rechenlogik. Ausführen mit: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, Fmt, parseNumber, clampField, DEFAULT_INPUTS, FIELDS, fieldDisplay } from '../calc.js';

const round2 = (x) => Math.round(x * 100) / 100;

const base = (overrides = {}) => ({ ...DEFAULT_INPUTS, ...overrides });
const SALES = { marginBasis: 'salesPrice', closingCostMode: 'euro' };
const PERCENT = { marginBasis: 'salesPrice', closingCostMode: 'percent' };
const GIK = { marginBasis: 'totalInvestment', closingCostMode: 'euro' };

test('VPS vermietet: Objektpreis, VK, EK und Sanierung/m²', () => {
  const inputs = base({
    salePricePerSqm: 4000,
    livingArea: 60,
    parkingSalePrice: 10000,
    closingCostsPercent: 10,
    renovationCosts: 20000,
    otherCosts: 0,
  });
  const params = { targetMargin: 20, salesCommission: 10, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('vermietet', inputs, params, PERCENT);

  assert.equal(round2(r.objectSalePrice), 240000);
  assert.equal(round2(r.salePrice), 250000);
  assert.equal(round2(r.salesCommission), 25000);
  assert.equal(round2(r.marginEuro), 50000);
  assert.equal(round2(r.maxPurchasePrice), 140909.09);
  assert.equal(round2(r.renovationPerSqm), 333.33);
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

test('Mietrendite vermietet: 2,94 % brutto', () => {
  const inputs = base({
    livingArea: 50,
    salePricePerSqm: 5000,
    parkingSalePrice: 15000,
    rent: 600,
    parkingRent: 50,
  });
  const params = { targetMargin: 20, salesCommission: 0, rentPerSqm: 12, targetYield: 4.5 };
  const r = compute('vermietet', inputs, params, SALES);

  assert.equal(round2(r.salePrice), 265000);
  assert.equal(round2(r.buyerYield), 2.94);
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
const FIN = { loanPercent: 100, interestPercent: 4.7, repaymentPercent: 1.5, repaymentEnabled: true, durationMonths: 6 };
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
