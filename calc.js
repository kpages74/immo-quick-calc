// Reine Rechenlogik der Immo Quick-Calc Web-App.
// Spiegelt CalcEngine/CalcEngine.swift, Formatting.swift, NumberParser.swift und FieldSpec.swift.
// Keine DOM-Zugriffe. Prozentwerte werden als Prozentzahl gespeichert (20 = 20 %).

export const KIND = Object.freeze({ VERMIETET: 'vermietet', KAP: 'kap', EN: 'en', WG: 'wg' });
export const CLOSING_MODE = Object.freeze({ EURO: 'euro', PERCENT: 'percent' });

/** Standardwerte der Objektdaten (ObjectInputs in Models.swift). */
export const DEFAULT_INPUTS = Object.freeze({
  salePrice: 250000,
  // Verkaufspreis je m² (Arten vermietet, KAP, WG). Seiten-Standard: applyLegacySaleDefaults.
  salePricePerSqm: 4000,
  parkingSalePrice: 0,
  rent: 600,
  livingArea: 60,
  parkingRent: 0,
  closingCostsEuro: 15000,
  closingCostsPercent: 11,
  renovationCosts: 20000,
  otherCosts: 0,
  // WG (Seite WG): Zimmer, Kaltmiete je Zimmer, Stellplatzanzahl. Stellplatzmiete steht in parkingRent.
  wgRooms: 3,
  wgRoomRent: 500,
  wgParkingCount: 0,
  // Laufende Kosten während der Projektlaufzeit (Standard Hausgeld 300 €; Strom/Heizung 0 €).
  // Neutrale Eingabe in compute: fehlt das Feld, gilt 0. Der Seiten-Standard steht in makePage (app.js).
  hausgeld: 0,
  heatingCosts: 0,
});

/** Standardwerte der Seite WG: Miete je Stellplatz 50 €. */
export const DEFAULT_INPUTS_WG = Object.freeze({ ...DEFAULT_INPUTS, parkingRent: 50, livingArea: 90 });

/** Standardeinstellungen (CalcSettings in Models.swift). */
export const DEFAULT_SETTINGS = Object.freeze({
  closingCostMode: CLOSING_MODE.PERCENT,
});

/** Standardwerte der Finanzierung (FinancingInputs in Models.swift). Prozentwerte als Prozentzahl. */
export const DEFAULT_FINANCING = Object.freeze({
  loanPercent: 100,
  interestPercent: 5.5,
  durationMonths: 6,
  processingFeePercent: 1,
});

/** Ohne Finanzierung: Finanzierungshöhe 0 %. Standard von compute(). */
export const NO_FINANCING = Object.freeze({ ...DEFAULT_FINANCING, loanPercent: 0 });

/** Standardparameter je Kalkulationsart (CalcParameters.defaults(kind:)). */
export function defaultParameters(kind) {
  return {
    targetMargin: kind === KIND.VERMIETET || kind === KIND.WG ? 20 : 17,
    salesCommission: 0,
    rentPerSqm: 12,
    targetYield: kind === KIND.WG ? 6.5 : 4.5,
    rentSurchargePercent: 15,
  };
}

/**
 * Felder mit Bereich, Schrittweite und Nachkommastellen (FieldSpec.swift).
 * Der Schlüssel entspricht dem Feldnamen in inputs bzw. parameters.
 */
export const FIELDS = Object.freeze({
  salePricePerSqm: { label: 'Verkaufspreis', unit: 'euroPerSqm', min: 0, max: 15000, step: 10, digits: 0 },
  rentPerSqm: { label: 'Miete je m² p. M.', unit: 'euroPerSqm', min: 0, max: 50, step: 0.1, digits: 2 },
  targetYield: { label: 'Rendite Käufer', unit: 'percent', min: 0, max: 10, step: 0.1, digits: 1 },
  salePrice: { label: 'Verkaufspreis', unit: 'euro', min: 0, max: 2000000, step: 1000, digits: 0 },
  parkingSalePrice: { label: 'Verkaufspreis Stellplatz/Garage', unit: 'euro', min: 0, max: 40000, step: 500, digits: 0 },
  rent: { label: 'Ist-Miete p. M.', unit: 'euro', min: 0, max: 3000, step: 10, digits: 0 },
  // signed: Anzeige mit Pluszeichen („+15,0 %“), Bearbeitungstext ohne Zeichen.
  rentSurcharge: { label: 'Soll-Miete', unit: 'percent', min: 0, max: 50, step: 0.5, digits: 1, signed: true },
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
  durationMonths: { label: 'Projektlaufzeit', unit: 'months', min: 1, max: 60, step: 1, digits: 0 },
  processingFeePercent: { label: 'Bearbeitungsgebühr', unit: 'percent', min: 0, max: 5, step: 0.1, digits: 1 },
  // Seite WG: eigene Bereiche und Einheiten.
  wgRooms: { label: 'Anzahl WG-Zimmer', unit: 'rooms', min: 1, max: 10, step: 1, digits: 0 },
  wgRoomRent: { label: 'Durchschn. Kaltmiete je Zimmer', unit: 'euro', min: 0, max: 1500, step: 10, digits: 0 },
  wgParkingCount: { label: 'Anzahl Stellplätze', unit: 'pieces', min: 0, max: 10, step: 1, digits: 0 },
  wgParkingRent: { label: 'Miete je Stellplatz p. M.', unit: 'euro', min: 0, max: 300, step: 5, digits: 0 },
  wgRenovation: { label: 'Sanierungskosten', unit: 'euro', min: 0, max: 100000, step: 500, digits: 0 },
  wgOther: { label: 'Sonstige Kosten', unit: 'euro', min: 0, max: 100000, step: 500, digits: 0 },
  wgYield: { label: 'Rendite Käufer', unit: 'percent', min: 1, max: 15, step: 0.1, digits: 1 },
  // Laufende Kosten (je Monat, Projektlaufzeit).
  hausgeld: { label: 'Hausgeld p. M.', unit: 'euro', min: 0, max: 2000, step: 10, digits: 0 },
  heatingCosts: { label: 'Strom + Heizung p. M.', unit: 'euro', min: 0, max: 1000, step: 10, digits: 0 },
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

/** Version des Preismodells. 2 = Verkaufspreis je Art eigenständig (€/m² bzw. Objektpreis, Stellplatz in €). */
export const PRICE_MODEL_VERSION = 2;

/**
 * Alte Verkaufswerte nach der bisherigen Rendite-Formel (CalcEngine.legacySaleValues).
 * Nur für Standardwerte und Migration. Liefert €/m² des Objekts (ohne Stellplatz) und den Stellplatz-Verkaufspreis in €.
 * Bei Rendite 0 oder Fläche 0 bleiben die Eingaben salePricePerSqm und parkingSalePrice erhalten.
 */
export function legacySaleValues(kind, inputs, params) {
  const fallback = {
    objectPricePerSqm: nonNegative(inputs.salePricePerSqm),
    parkingPrice: nonNegative(inputs.parkingSalePrice),
  };
  const yieldFraction = nonNegative(params.targetYield) / 100;
  const area = nonNegative(inputs.livingArea);
  if (kind === KIND.EN || yieldFraction <= 0 || area <= 0) return fallback;
  const factor = 12 / yieldFraction;
  if (kind === KIND.VERMIETET) {
    const surcharge = nonNegative(params.rentSurchargePercent) / 100;
    const sollRent = nonNegative(inputs.rent) * (1 + surcharge);
    return {
      objectPricePerSqm: (sollRent * factor) / area,
      parkingPrice: nonNegative(inputs.parkingRent) * factor,
    };
  }
  if (kind === KIND.KAP) {
    return {
      objectPricePerSqm: nonNegative(params.rentPerSqm) * factor,
      parkingPrice: nonNegative(inputs.parkingSalePrice),
    };
  }
  // WG
  const roomRentTotal = nonNegative(inputs.wgRooms) * nonNegative(inputs.wgRoomRent);
  return {
    objectPricePerSqm: (roomRentTotal * factor) / area,
    parkingPrice: nonNegative(inputs.wgParkingCount) * nonNegative(inputs.parkingRent) * factor,
  };
}

/**
 * Standardwerte der Verkaufswerte je Art (Preismodell 2): nicht EN €/m² und Stellplatz-Verkaufspreis aus den
 * bisherigen Renditewerten, EN unverändert. Gibt eine neue Eingabe-Kopie zurück.
 */
export function applyLegacySaleDefaults(kind, inputs, params) {
  if (kind === KIND.EN) return { ...inputs };
  const legacy = legacySaleValues(kind, inputs, params);
  return { ...inputs, salePricePerSqm: legacy.objectPricePerSqm, parkingSalePrice: legacy.parkingPrice };
}

/**
 * Migration eines Standes ohne priceModelVersion 2 (wie PageState.migrated in CalcStore.swift).
 * legacy: { vkMode, manualSalePrice } aus dem alten Stand.
 * - Alter VK-Modus mit manuellem Verkaufspreis M (inkl. Stellplatz): nicht EN: Stellplatz aus den alten Werten,
 *   €/m² = max(0, M − Stellplatz) / Fläche (bei Fläche 0 der alte €/m²-Wert). EN: Objektpreis = max(0, M − Stellplatz).
 * - Sonst: nicht EN: €/m² und Stellplatz aus den alten Werten. EN bleibt unverändert.
 */
export function migrateLegacyInputs(kind, inputs, params, legacy) {
  const out = { ...inputs };
  const old = legacySaleValues(kind, inputs, params);
  const manual = nonNegative(legacy.manualSalePrice ?? 0);
  const area = nonNegative(inputs.livingArea);
  if (legacy.vkMode === true) {
    if (kind === KIND.EN) {
      out.salePrice = Math.max(0, manual - nonNegative(inputs.parkingSalePrice));
    } else {
      out.parkingSalePrice = old.parkingPrice;
      out.salePricePerSqm = area > 0 ? Math.max(0, manual - old.parkingPrice) / area : old.objectPricePerSqm;
    }
  } else if (kind !== KIND.EN) {
    out.salePricePerSqm = old.objectPricePerSqm;
    out.parkingSalePrice = old.parkingPrice;
  }
  return out;
}

/**
 * Rechnung wie CalcEngine.compute(kind:inputs:parameters:settings:).
 * kind: 'vermietet' | 'kap' | 'wg' | 'en'. Ergebnisse sind null, wenn nicht berechenbar („–“).
 * Der Verkaufspreis ist eine Eingabe (€/m² bzw. Objektpreis gesamt bei EN, Stellplatz in €). Die Rendite Käufer
 * ist nur Anzeige. Der Max. Einkaufspreis ist das einzige berechnete Ergebnis.
 * financing: Finanzierung (global). Mit loanPercent 0 wird ohne Finanzierung gerechnet.
 */
export function compute(kind, inputs, params, settings, financing = NO_FINANCING) {
  const area = nonNegative(inputs.livingArea);
  const rent = nonNegative(inputs.rent);
  const parking = nonNegative(inputs.parkingRent);
  const closingEuro = nonNegative(inputs.closingCostsEuro);
  const closingPercent = nonNegative(inputs.closingCostsPercent);
  const renovation = nonNegative(inputs.renovationCosts);
  const k = renovation + nonNegative(inputs.otherCosts);
  const m = nonNegative(params.targetMargin) / 100;
  const v = nonNegative(params.salesCommission) / 100;
  const parkingPriceValue = nonNegative(inputs.parkingSalePrice);
  const inputPricePerSqm = nonNegative(inputs.salePricePerSqm);

  // 0. Objektpreis je Art.
  //    Vermietet, KAP, WG: €/m² ist die Eingabe, Objektpreis = €/m² × Fläche. EN: Objektpreis gesamt.
  let objectPrice;
  let objectPricePerSqm;
  let currentRentPerSqm = null;
  let monthlyRent = null;
  let targetRent = null;
  let targetRentPerSqm = null;
  let roomRentTotal = 0;

  if (kind === KIND.VERMIETET) {
    const surcharge = nonNegative(params.rentSurchargePercent) / 100;
    const sollRent = rent * (1 + surcharge);
    targetRent = sollRent;
    targetRentPerSqm = perSqm(sollRent, area);
    currentRentPerSqm = perSqm(rent, area);
    objectPricePerSqm = inputPricePerSqm;
    objectPrice = inputPricePerSqm * area;
  } else if (kind === KIND.WG) {
    // Kaltmiete aller Zimmer je Monat. Der Objektpreis steht in €/m².
    roomRentTotal = nonNegative(inputs.wgRooms) * nonNegative(inputs.wgRoomRent);
    monthlyRent = roomRentTotal;
    objectPricePerSqm = inputPricePerSqm;
    objectPrice = inputPricePerSqm * area;
  } else if (kind === KIND.KAP) {
    const rentPerSqm = nonNegative(params.rentPerSqm);
    monthlyRent = rentPerSqm * area;
    currentRentPerSqm = rentPerSqm;
    objectPricePerSqm = inputPricePerSqm;
    objectPrice = inputPricePerSqm * area;
  } else {
    const price = nonNegative(inputs.salePrice);
    objectPrice = price;
    objectPricePerSqm = perSqm(price, area);
    currentRentPerSqm = perSqm(rent, area);
  }

  const renovationPerSqm = perSqm(renovation, area);

  // WG rechnet die Kaufnebenkosten immer in Prozent.
  const percentMode = kind === KIND.WG || settings.closingCostMode === 'percent';

  // 1. Verkaufspreis gesamt (Objekt + Stellplatz/Garage)
  const vk = objectPrice + parkingPriceValue;

  // 2. Vertriebskosten V = VK × v (fallen auf den ganzen Verkauf an). Für den EK zählt nur der Objektpreis netto:
  //    N_Objekt = Objektpreis × (1 − v). Der Stellplatz ändert den EK nicht.
  const commission = vk * v;
  const objectNetto = objectPrice * (1 - v);

  // 3. Finanzierung: f = Höhe, z = Zins, b = Bearbeitungsgebühr, T = Laufzeit in Monaten.
  //    F = f × (z × T / 12 + b) × EK (Tilgung entfällt).
  const f = nonNegative(financing.loanPercent) / 100;
  const z = nonNegative(financing.interestPercent) / 100;
  const b = nonNegative(financing.processingFeePercent) / 100;
  const months = nonNegative(financing.durationMonths);
  const financingFactor = f * ((z * months) / 12 + b);

  // 4. Laufende Kosten während der Projektlaufzeit: H = (Hausgeld + Strom/Heizung − Mieteinnahmen) × Monate.
  //    Mieteinnahmen gibt es nur bei Vermietet (Ist-Miete + Stellplatzmiete), sonst 0.
  const rentalIncome = kind === KIND.VERMIETET ? rent + parking : 0;
  const holdingCosts = (nonNegative(inputs.hausgeld) + nonNegative(inputs.heatingCosts) - rentalIncome) * months;

  // 5. Maximaler Einkaufspreis EK, N = Objektpreis netto. Mit GIK = EK + KNK + K und N − H = (1 + m) × GIK + F gilt:
  //    KNK in %: EK = (N − H − (1+m) K) / ((1+m)(1+p) + f(r+b))
  //    KNK in €: EK = (N − H − (1+m)(KNK + K)) / ((1+m) + f(r+b))
  //    Zähler <= 0: ohne Finanzierung rechnen, Finanzierungskosten 0.
  let maxPurchase;
  let financed;
  let closingPercentFraction = 0;
  if (percentMode) {
    closingPercentFraction = closingPercent / 100;
    const numerator = objectNetto - holdingCosts - (1 + m) * k;
    const denominator = (1 + m) * (1 + closingPercentFraction);
    financed = numerator > 0;
    maxPurchase = numerator / (denominator + (financed ? financingFactor : 0));
  } else {
    const numerator = objectNetto - holdingCosts - (1 + m) * (closingEuro + k);
    const denominator = 1 + m;
    financed = numerator > 0;
    maxPurchase = numerator / (denominator + (financed ? financingFactor : 0));
  }

  // 6. Darlehen und Finanzierungskosten (Zinsen über die Laufzeit und einmalige Bearbeitungsgebühr)
  const loanAmount = financed ? f * maxPurchase : 0;
  const financingInterest = (loanAmount * z * months) / 12;
  const financingFee = loanAmount * b;
  const financingCosts = financingInterest + financingFee;

  // 7. Kaufnebenkosten in Euro
  const closingCosts = percentMode ? maxPurchase * closingPercentFraction : closingEuro;

  // 8. Gesamtinvestition GIK = EK + KNK + K (ohne Finanzierung)
  const totalInvestment = maxPurchase + closingCosts + k;

  // 9. Marge immer auf GIK-Basis: Marge € = m × GIK + Stellplatz × (1 − v), Marge % = Marge € / GIK × 100 (null ohne GIK).
  //    Der Stellplatz ist Extra-Gewinn; auf ihn fallen Vertriebskosten an, daher nur × (1 − v).
  const marginEuro = m * totalInvestment + parkingPriceValue * (1 - v);
  const marginPercent = totalInvestment > 0 ? (marginEuro / totalInvestment) * 100 : null;

  // 10. Quadratmeterwerte (null bei Fläche 0)
  const maxPurchasePricePerSqm = perSqm(maxPurchase, area);
  const totalInvestmentPerSqm = perSqm(totalInvestment, area);

  // 11. Rendite Käufer (nur Anzeige, nicht in der Rechnung). null bei VK bzw. Objektpreis 0 und bei EN.
  //     Vermietet: (Soll-Miete + Stellplatzmiete) × 12 / VK
  //     KAP: Miete je m² × 12 / (Objektpreis je m² + Stellplatzpreis je m²), der Stellplatz geht in den Kaufpreis ein
  //     WG: (Zimmer × Kaltmiete + Stellplätze × Stellplatzmiete) × 12 / VK
  let buyerYield = null;
  if (kind === KIND.VERMIETET) {
    if (vk > 0 && objectPrice > 0) buyerYield = ((targetRent + parking) * 12) / vk * 100;
  } else if (kind === KIND.KAP) {
    if (objectPricePerSqm > 0) {
      buyerYield = (nonNegative(params.rentPerSqm) * 12) / (objectPricePerSqm + (area > 0 ? parkingPriceValue / area : 0)) * 100;
    }
  } else if (kind === KIND.WG) {
    if (vk > 0 && objectPrice > 0) {
      buyerYield = ((roomRentTotal + nonNegative(inputs.wgParkingCount) * parking) * 12) / vk * 100;
    }
  }

  return {
    salePrice: vk,
    salePricePerSqm: objectPricePerSqm,
    objectSalePrice: objectPrice,
    objectSalePricePerSqm: objectPricePerSqm,
    parkingValue: parkingPriceValue,
    marginEuro,
    marginPercent,
    maxPurchasePrice: maxPurchase,
    maxPurchasePricePerSqm,
    loanAmount,
    financingInterest,
    financingFee,
    financingCosts,
    targetRent,
    targetRentPerSqm,
    closingCosts,
    totalInvestment,
    totalInvestmentPerSqm,
    currentRentPerSqm,
    buyerYield,
    salesCommission: commission,
    renovationPerSqm,
    monthlyRent,
    isPurchasePossible: maxPurchase > 0,
    rentalIncome,
    holdingCosts,
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
  /** „92.307,69 € je Zimmer“: Wert geteilt durch die Zimmerzahl. „–“ ohne Wert oder bei 0 Zimmern. */
  perRoom: (value, rooms) => (typeof value === 'number' && Number.isFinite(value) && rooms > 0
    ? withUnit(value / rooms, 2, '€') + ' je Zimmer'
    : DASH),
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
 * „250.000 €“, „60 m²“, „10,0 %“, „4.000 €/m²“, Soll-Miete „+15,0 %“. Geschütztes Leerzeichen vor der Einheit.
 */
const FIELD_SUFFIX = Object.freeze({ euro: '€', euroPerSqm: '€/m²', squareMeter: 'm²', percent: '%', months: 'Monate', rooms: 'Zimmer', pieces: 'Stk.' });
export function fieldDisplay(spec, value) {
  const sign = spec.signed && value >= 0 ? '+' : '';
  return sign + Fmt.fieldNumber(value, spec.digits) + NBSP + FIELD_SUFFIX[spec.unit];
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
  // Ein führendes Pluszeichen ist erlaubt („+15“ bei Soll-Miete).
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
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
