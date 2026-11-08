// Reine Rechenlogik der Immo Quick-Calc Web-App.
// Spiegelt CalcEngine/CalcEngine.swift, Formatting.swift, NumberParser.swift und FieldSpec.swift.
// Keine DOM-Zugriffe. Prozentwerte werden als Prozentzahl gespeichert (20 = 20 %).

export const KIND = Object.freeze({ VERMIETET: 'vermietet', KAP: 'kap', EN: 'en' });
export const MARGIN_BASIS = Object.freeze({ SALES_PRICE: 'salesPrice', TOTAL_INVESTMENT: 'totalInvestment' });
export const CLOSING_MODE = Object.freeze({ EURO: 'euro', PERCENT: 'percent' });

/** Standardwerte der Objektdaten (ObjectInputs in Models.swift). */
export const DEFAULT_INPUTS = Object.freeze({
  salePrice: 250000,
  salePricePerSqm: 4000,
  parkingSalePrice: 0,
  rent: 600,
  livingArea: 60,
  parkingRent: 0,
  closingCostsEuro: 15000,
  closingCostsPercent: 10,
  renovationCosts: 20000,
  otherCosts: 0,
});

/** Standardeinstellungen (CalcSettings in Models.swift). */
export const DEFAULT_SETTINGS = Object.freeze({
  marginBasis: MARGIN_BASIS.SALES_PRICE,
  closingCostMode: CLOSING_MODE.EURO,
});

/** Standardwerte der Finanzierung (FinancingInputs in Models.swift). Prozentwerte als Prozentzahl. */
export const DEFAULT_FINANCING = Object.freeze({
  loanPercent: 100,
  interestPercent: 4.7,
  repaymentPercent: 1.5,
  repaymentEnabled: true,
  durationMonths: 6,
});

/** Ohne Finanzierung: Finanzierungshöhe 0 %. Standard von compute(). */
export const NO_FINANCING = Object.freeze({ ...DEFAULT_FINANCING, loanPercent: 0 });

/** Standardparameter je Kalkulationsart (CalcParameters.defaults(kind:)). */
export function defaultParameters(kind) {
  return {
    targetMargin: kind === KIND.VERMIETET ? 20 : 17,
    salesCommission: 0,
    rentPerSqm: 12,
    targetYield: 4.5,
  };
}

/**
 * Felder mit Bereich, Schrittweite und Nachkommastellen (FieldSpec.swift).
 * Der Schlüssel entspricht dem Feldnamen in inputs bzw. parameters.
 */
export const FIELDS = Object.freeze({
  salePricePerSqm: { label: 'Verkaufspreis Objekt', unit: 'euroPerSqm', min: 0, max: 15000, step: 10, digits: 0 },
  rentPerSqm: { label: 'Miete je m² p. M.', unit: 'euroPerSqm', min: 0, max: 50, step: 0.1, digits: 2 },
  targetYield: { label: 'Rendite Käufer', unit: 'percent', min: 0, max: 10, step: 0.1, digits: 1 },
  salePrice: { label: 'Verkaufspreis Objekt', unit: 'euro', min: 0, max: 2000000, step: 1000, digits: 0 },
  parkingSalePrice: { label: 'Verkaufspreis Stellplatz/Garage', unit: 'euro', min: 0, max: 40000, step: 500, digits: 0 },
  rent: { label: 'Miete Wohnraum p. M.', unit: 'euro', min: 0, max: 3000, step: 10, digits: 0 },
  livingArea: { label: 'Wohnfläche', unit: 'squareMeter', min: 0, max: 600, step: 1, digits: 0 },
  parkingRent: { label: 'Miete Stellplatz/Garage p. M.', unit: 'euro', min: 0, max: 300, step: 5, digits: 0 },
  closingCostsEuro: { label: 'Kaufnebenkosten', unit: 'euro', min: 0, max: 50000, step: 500, digits: 0 },
  closingCostsPercent: { label: 'Kaufnebenkosten', unit: 'percent', min: 0, max: 30, step: 0.5, digits: 1 },
  renovationCosts: { label: 'Sanierungskosten', unit: 'euro', min: 0, max: 200000, step: 500, digits: 0 },
  otherCosts: { label: 'Sonstige Kosten', unit: 'euro', min: 0, max: 100000, step: 100, digits: 0 },
  targetMargin: { label: 'Zielmarge', unit: 'percent', min: 0, max: 100, step: 0.5, digits: 1 },
  salesCommission: { label: 'Vertriebskosten', unit: 'percent', min: 0, max: 20, step: 0.5, digits: 1 },
  loanPercent: { label: 'Finanzierungshöhe', unit: 'percent', min: 0, max: 200, step: 1, digits: 0 },
  interestPercent: { label: 'Zinsen', unit: 'percent', min: 0, max: 15, step: 0.1, digits: 1 },
  repaymentPercent: { label: 'Tilgung', unit: 'percent', min: 0, max: 10, step: 0.1, digits: 1 },
  durationMonths: { label: 'Projektlaufzeit', unit: 'months', min: 1, max: 60, step: 1, digits: 0 },
});

/** Begrenzt einen Wert auf den Bereich des Feldes (z. B. Zielmarge 0…100). */
export function clampField(key, value) {
  const f = FIELDS[key];
  return Math.min(Math.max(value, f.min), f.max);
}

/** Position des Reglers 0…1, Werte außerhalb des Bereichs stehen am Anschlag. */
export function sliderFraction(key, value) {
  const f = FIELDS[key];
  const span = f.max - f.min;
  if (span <= 0) return 0;
  return Math.min(Math.max((value - f.min) / span, 0), 1);
}

const nonNegative = (x) => (x < 0 ? 0 : x);
const perSqm = (value, area) => (area > 0 ? value / area : null);

function emptyResult(extra) {
  return {
    salePrice: null,
    salePricePerSqm: null,
    objectSalePrice: null,
    objectSalePricePerSqm: null,
    marginEuro: null,
    marginPercent: null,
    maxPurchasePrice: null,
    maxPurchasePricePerSqm: null,
    loanAmount: null,
    financingInterest: null,
    financingRepayment: null,
    financingCosts: null,
    closingCosts: null,
    totalInvestment: null,
    totalInvestmentPerSqm: null,
    currentRentPerSqm: null,
    buyerYield: null,
    salesCommission: null,
    renovationPerSqm: null,
    monthlyRent: null,
    isPurchasePossible: false,
    ...extra,
  };
}

/**
 * Rechnung wie CalcEngine.compute(kind:inputs:parameters:settings:).
 * kind: 'vermietet' | 'kap' | 'en'. Ergebnisse sind null, wenn nicht berechenbar („–“).
 * financing: Finanzierung (global). Mit loanPercent 0 wird ohne Finanzierung gerechnet.
 */
export function compute(kind, inputs, params, settings, financing = NO_FINANCING) {
  const area = nonNegative(inputs.livingArea);
  const parkingPrice = nonNegative(inputs.parkingSalePrice);
  const rent = nonNegative(inputs.rent);
  const parking = nonNegative(inputs.parkingRent);
  const closingEuro = nonNegative(inputs.closingCostsEuro);
  const closingPercent = nonNegative(inputs.closingCostsPercent);
  const renovation = nonNegative(inputs.renovationCosts);
  const k = renovation + nonNegative(inputs.otherCosts);
  const m = nonNegative(params.targetMargin) / 100;
  const v = nonNegative(params.salesCommission) / 100;

  // 0. Objektpreis je Art.
  let objectPrice = null;
  let objectPricePerSqm = null;
  let currentRentPerSqm = null;
  let monthlyRent = null;

  if (kind === KIND.VERMIETET) {
    const pricePerSqm = nonNegative(inputs.salePricePerSqm);
    objectPricePerSqm = pricePerSqm;
    objectPrice = pricePerSqm * area;
    currentRentPerSqm = perSqm(rent, area);
  } else if (kind === KIND.KAP) {
    const rentPerSqm = nonNegative(params.rentPerSqm);
    const yieldFraction = nonNegative(params.targetYield) / 100;
    monthlyRent = rentPerSqm * area;
    currentRentPerSqm = rentPerSqm;
    if (yieldFraction > 0) {
      // VK je m² = Miete je m² × 12 / Rendite
      const pricePerSqmKap = (rentPerSqm * 12) / yieldFraction;
      objectPricePerSqm = pricePerSqmKap;
      objectPrice = pricePerSqmKap * area;
    }
    // Rendite 0: kein Objektpreis, alle abhängigen Ergebnisse bleiben „–“.
  } else {
    const price = nonNegative(inputs.salePrice);
    objectPrice = price;
    objectPricePerSqm = perSqm(price, area);
    currentRentPerSqm = perSqm(rent, area);
  }

  const renovationPerSqm = perSqm(renovation, area);

  if (objectPrice === null) {
    return emptyResult({ currentRentPerSqm, renovationPerSqm, monthlyRent });
  }

  const percentMode = settings.closingCostMode === 'percent';
  const totalBasis = settings.marginBasis === 'totalInvestment';

  // 1. Verkaufspreis gesamt (Objekt + Stellplatz/Garage)
  const vk = objectPrice + parkingPrice;

  // 2. Vertriebskosten V und Netto N
  const commission = vk * v;
  const netto = vk - commission;

  // 3. Marge in Euro
  const marginEuro = totalBasis ? netto - netto / (1 + m) : vk * m;

  // 4. Finanzierung: f = Höhe, r = (Zins + Tilgung) × T / 12. Tilgung 0, wenn der Schalter aus ist.
  const f = nonNegative(financing.loanPercent) / 100;
  const z = nonNegative(financing.interestPercent) / 100;
  const t = financing.repaymentEnabled ? nonNegative(financing.repaymentPercent) / 100 : 0;
  const months = nonNegative(financing.durationMonths);
  const rate = ((z + t) * months) / 12;
  const financingFactor = f * rate;

  // 5. Maximaler Einkaufspreis (EK). Finanzierung mindert den EK, die Zielmarge bleibt.
  //    Zähler <= 0: wie ohne Finanzierung, Finanzierungskosten 0.
  let maxPurchase;
  let financed;
  if (percentMode) {
    const numerator = netto - marginEuro - k;
    const p = closingPercent / 100;
    financed = numerator > 0;
    maxPurchase = financed ? numerator / (1 + p + financingFactor) : numerator / (1 + p);
  } else {
    const numerator = netto - marginEuro - closingEuro - k;
    financed = numerator > 0;
    maxPurchase = financed ? numerator / (1 + financingFactor) : numerator;
  }

  // 6. Darlehen und Finanzierungskosten (Zinsen + Tilgung über die Laufzeit)
  const loanAmount = financed ? f * maxPurchase : 0;
  const financingInterest = (loanAmount * z * months) / 12;
  const financingRepayment = (loanAmount * t * months) / 12;
  const financingCosts = financingInterest + financingRepayment;

  // 7. Kaufnebenkosten in Euro
  const closingCosts = percentMode ? (maxPurchase * closingPercent) / 100 : closingEuro;

  // 8. Gesamtinvestition (GIK), ohne Finanzierung
  const totalInvestment = maxPurchase + closingCosts + k;

  // 9. Marge in Prozent (null, wenn der Nenner <= 0 ist)
  let marginPercent;
  if (totalBasis) {
    marginPercent = totalInvestment > 0 ? (marginEuro / totalInvestment) * 100 : null;
  } else {
    marginPercent = vk > 0 ? (marginEuro / vk) * 100 : null;
  }

  // 10. Quadratmeterwerte (null bei Fläche 0)
  const maxPurchasePricePerSqm = perSqm(maxPurchase, area);
  const totalInvestmentPerSqm = perSqm(totalInvestment, area);

  // 11. Bruttomietrendite Käufer (nur Art vermietet, auf Basis des VK)
  let buyerYield = null;
  if (kind === KIND.VERMIETET && vk > 0) {
    buyerYield = ((rent + parking) * 12) / vk * 100;
  }

  return {
    salePrice: vk,
    salePricePerSqm: objectPricePerSqm,
    objectSalePrice: objectPrice,
    objectSalePricePerSqm: objectPricePerSqm,
    marginEuro,
    marginPercent,
    maxPurchasePrice: maxPurchase,
    maxPurchasePricePerSqm,
    loanAmount,
    financingInterest,
    financingRepayment,
    financingCosts,
    closingCosts,
    totalInvestment,
    totalInvestmentPerSqm,
    currentRentPerSqm,
    buyerYield,
    salesCommission: commission,
    renovationPerSqm,
    monthlyRent,
    isPurchasePossible: maxPurchase > 0,
  };
}

// MARK: - Formatierung (de-DE, kaufmännisch gerundet)

const DASH = '–';
const NBSP = ' ';

function groupThousands(intText) {
  return intText.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Festkommazahl mit deutschem Format. Rundung kaufmännisch (halbe Werte von der Null weg).
 * Rundet über eine dezimale Zwischendarstellung, damit z. B. 1,005 als „1,01“ erscheint.
 */
function formatFixed(value, digits, grouped = true) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  const factor = 10 ** digits;
  const scaled = Math.round(Number((Math.abs(value) * factor).toPrecision(12)));
  const intPart = Math.floor(scaled / factor);
  const fracPart = scaled - intPart * factor;
  const sign = value < 0 && scaled !== 0 ? '-' : '';
  const intText = grouped ? groupThousands(String(intPart)) : String(intPart);
  if (digits === 0) return sign + intText;
  return `${sign}${intText},${String(fracPart).padStart(digits, '0')}`;
}

function withUnit(value, digits, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  return formatFixed(value, digits) + NBSP + unit;
}

export const Fmt = Object.freeze({
  /** „137.723,40 €“ */
  currency: (value) => withUnit(value, 2, '€'),
  /** „53,23 %“ */
  percent: (value) => withUnit(value, 2, '%'),
  /** „1.995,99 €/m²“ */
  perSqm: (value) => withUnit(value, 2, '€/m²'),
  /** Anzeige im Eingabefeld mit fester Stellenzahl: „294.456“, „15,0“ */
  fieldNumber: (value, digits) => formatFixed(value, digits),
  /** Bearbeitungstext: ohne Tausenderpunkte, bis 2 Nachkommastellen, ohne überflüssige Nullen. */
  editingNumber: (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
    const text = formatFixed(value, 2, false);
    if (!text.includes(',')) return text;
    return text.replace(/0+$/, '').replace(/,$/, '');
  },
});

/**
 * Anzeige eines Zahlenfeldes ohne Fokus mit Einheit, wie FieldSpec.displayText in der App:
 * „250.000 €“, „60 m²“, „10,0 %“, „4.000 €/m²“. Geschütztes Leerzeichen vor der Einheit.
 */
const FIELD_SUFFIX = Object.freeze({ euro: '€', euroPerSqm: '€/m²', squareMeter: 'm²', percent: '%', months: 'Monate' });
export function fieldDisplay(spec, value) {
  return Fmt.fieldNumber(value, spec.digits) + NBSP + FIELD_SUFFIX[spec.unit];
}

// MARK: - Zahleneingabe (NumberParser.swift)

/**
 * Liest Zahlen in deutscher Schreibweise („1.234,56“, „15,5 %“, „200.000 €“).
 * Gibt null zurück bei leerer Eingabe, Buchstaben, mehreren Kommas oder negativen Werten.
 */
export function parseNumber(text) {
  let cleaned = '';
  for (const ch of String(text)) {
    if (/\s/.test(ch) || ch === ' ' || ch === ' ' || ch === '€' || ch === '%') continue;
    cleaned += ch;
  }
  if (cleaned === '') return null;
  if (!/^[0-9.,]+$/.test(cleaned)) return null;

  const commaCount = (cleaned.match(/,/g) || []).length;
  if (commaCount > 1) return null;

  let normalized;
  if (commaCount === 1) {
    // Komma ist der Dezimaltrenner, Punkte sind Tausendertrenner.
    const idx = cleaned.indexOf(',');
    const integerPart = cleaned.slice(0, idx).replace(/\./g, '');
    const fractionPart = cleaned.slice(idx + 1);
    if (!/^[0-9]*$/.test(fractionPart)) return null;
    if (integerPart === '' && fractionPart === '') return null;
    const integerText = integerPart === '' ? '0' : integerPart;
    normalized = fractionPart === '' ? integerText : `${integerText}.${fractionPart}`;
  } else {
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount === 1) {
      // Ein einzelner Punkt mit 1–2 Ziffern dahinter gilt als Dezimalpunkt.
      const digitsAfter = cleaned.length - cleaned.indexOf('.') - 1;
      normalized = digitsAfter >= 1 && digitsAfter <= 2 ? cleaned : cleaned.replace(/\./g, '');
    } else {
      // Mehrere Punkte oder Gruppen zu drei Ziffern: Tausendertrenner.
      normalized = cleaned.replace(/\./g, '');
    }
  }

  if (!/[0-9]/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
