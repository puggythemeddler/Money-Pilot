/**
 * Currency registry.
 *
 * MoneyPilot is currency-universal: every African ISO 4217 currency is
 * supported out of the box, so a user anywhere in Africa can track money in
 * their local currency. Western currencies (USD, GBP, EUR) are included for
 * international accounts. Monetary values are always stored as integer
 * minor units with a currency code; never as floating point numbers.
 */
export interface CurrencyInfo {
  /** ISO 4217 code, e.g. "KES". */
  code: string;
  /** Human readable name, e.g. "Kenyan Shilling". */
  name: string;
  /** Symbol used for display, e.g. "KSh". */
  symbol: string;
  /** Number of decimal places in the minor unit (2 = cents). */
  minorUnitDigits: number;
  /** Locale used for grouping/formatting when available. */
  locale?: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  // --- East Africa ---
  KES: {
    code: "KES",
    name: "Kenyan Shilling",
    symbol: "KSh",
    minorUnitDigits: 2,
    locale: "en-KE",
  },
  UGX: {
    code: "UGX",
    name: "Ugandan Shilling",
    symbol: "USh",
    minorUnitDigits: 0,
    locale: "en-UG",
  },
  TZS: {
    code: "TZS",
    name: "Tanzanian Shilling",
    symbol: "TSh",
    minorUnitDigits: 0,
    locale: "en-TZ",
  },
  RWF: {
    code: "RWF",
    name: "Rwandan Franc",
    symbol: "FRw",
    minorUnitDigits: 0,
    locale: "fr-RW",
  },
  BIF: {
    code: "BIF",
    name: "Burundian Franc",
    symbol: "FBu",
    minorUnitDigits: 0,
    locale: "fr-BI",
  },
  DJF: {
    code: "DJF",
    name: "Djiboutian Franc",
    symbol: "Fdj",
    minorUnitDigits: 0,
    locale: "fr-DJ",
  },
  ETB: {
    code: "ETB",
    name: "Ethiopian Birr",
    symbol: "Br",
    minorUnitDigits: 2,
    locale: "en-ET",
  },
  ERN: {
    code: "ERN",
    name: "Eritrean Nakfa",
    symbol: "Nfk",
    minorUnitDigits: 2,
    locale: "en-ER",
  },
  SOS: {
    code: "SOS",
    name: "Somali Shilling",
    symbol: "Sh",
    minorUnitDigits: 2,
    locale: "en-SO",
  },
  KMF: {
    code: "KMF",
    name: "Comorian Franc",
    symbol: "CF",
    minorUnitDigits: 0,
    locale: "fr-KM",
  },
  MGA: {
    code: "MGA",
    name: "Malagasy Ariary",
    symbol: "Ar",
    minorUnitDigits: 2,
    locale: "fr-MG",
  },
  MUR: {
    code: "MUR",
    name: "Mauritian Rupee",
    symbol: "Rs",
    minorUnitDigits: 2,
    locale: "en-MU",
  },
  SCR: {
    code: "SCR",
    name: "Seychellois Rupee",
    symbol: "SR",
    minorUnitDigits: 2,
    locale: "en-SC",
  },
  MWK: {
    code: "MWK",
    name: "Malawian Kwacha",
    symbol: "MK",
    minorUnitDigits: 2,
    locale: "en-MW",
  },
  MZN: {
    code: "MZN",
    name: "Mozambican Metical",
    symbol: "MT",
    minorUnitDigits: 2,
    locale: "pt-MZ",
  },
  ZMW: {
    code: "ZMW",
    name: "Zambian Kwacha",
    symbol: "ZK",
    minorUnitDigits: 2,
    locale: "en-ZM",
  },
  ZWG: {
    code: "ZWG",
    name: "Zimbabwe Gold",
    symbol: "ZiG",
    minorUnitDigits: 2,
    locale: "en-ZW",
  },
  // --- West Africa ---
  NGN: {
    code: "NGN",
    name: "Nigerian Naira",
    symbol: "\u20A6",
    minorUnitDigits: 2,
    locale: "en-NG",
  },
  XOF: {
    code: "XOF",
    name: "West African CFA Franc",
    symbol: "CFA",
    minorUnitDigits: 0,
    locale: "fr-CI",
  },
  GHS: {
    code: "GHS",
    name: "Ghanaian Cedi",
    symbol: "GH\u20B5",
    minorUnitDigits: 2,
    locale: "en-GH",
  },
  GMD: {
    code: "GMD",
    name: "Gambian Dalasi",
    symbol: "D",
    minorUnitDigits: 2,
    locale: "en-GM",
  },
  GNF: {
    code: "GNF",
    name: "Guinean Franc",
    symbol: "FG",
    minorUnitDigits: 0,
    locale: "fr-GN",
  },
  LRD: {
    code: "LRD",
    name: "Liberian Dollar",
    symbol: "L$",
    minorUnitDigits: 2,
    locale: "en-LR",
  },
  MRU: {
    code: "MRU",
    name: "Mauritanian Ouguiya",
    symbol: "UM",
    minorUnitDigits: 2,
    locale: "fr-MR",
  },
  SLE: {
    code: "SLE",
    name: "Sierra Leonean Leone",
    symbol: "Le",
    minorUnitDigits: 2,
    locale: "en-SL",
  },
  CVE: {
    code: "CVE",
    name: "Cape Verdean Escudo",
    symbol: "Esc",
    minorUnitDigits: 2,
    locale: "pt-CV",
  },
  // --- Central Africa ---
  XAF: {
    code: "XAF",
    name: "Central African CFA Franc",
    symbol: "FCFA",
    minorUnitDigits: 0,
    locale: "fr-CM",
  },
  CDF: {
    code: "CDF",
    name: "Congolese Franc",
    symbol: "FC",
    minorUnitDigits: 2,
    locale: "fr-CD",
  },
  AOA: {
    code: "AOA",
    name: "Angolan Kwanza",
    symbol: "Kz",
    minorUnitDigits: 2,
    locale: "pt-AO",
  },
  STN: {
    code: "STN",
    name: "S\u00E3o Tom\u00E9 and Pr\u00EDncipe Dobra",
    symbol: "Db",
    minorUnitDigits: 2,
    locale: "pt-ST",
  },
  // --- Southern Africa ---
  ZAR: {
    code: "ZAR",
    name: "South African Rand",
    symbol: "R",
    minorUnitDigits: 2,
    locale: "en-ZA",
  },
  BWP: {
    code: "BWP",
    name: "Botswana Pula",
    symbol: "P",
    minorUnitDigits: 2,
    locale: "en-BW",
  },
  NAD: {
    code: "NAD",
    name: "Namibian Dollar",
    symbol: "N$",
    minorUnitDigits: 2,
    locale: "en-NA",
  },
  SZL: {
    code: "SZL",
    name: "Swazi Lilangeni",
    symbol: "L",
    minorUnitDigits: 2,
    locale: "en-SZ",
  },
  LSL: {
    code: "LSL",
    name: "Lesotho Loti",
    symbol: "L",
    minorUnitDigits: 2,
    locale: "en-LS",
  },
  // --- North Africa ---
  DZD: {
    code: "DZD",
    name: "Algerian Dinar",
    symbol: "DA",
    minorUnitDigits: 2,
    locale: "en-DZ",
  },
  EGP: {
    code: "EGP",
    name: "Egyptian Pound",
    symbol: "E\u00A3",
    minorUnitDigits: 2,
    locale: "en-EG",
  },
  LYD: {
    code: "LYD",
    name: "Libyan Dinar",
    symbol: "LD",
    minorUnitDigits: 3,
    locale: "en-LY",
  },
  MAD: {
    code: "MAD",
    name: "Moroccan Dirham",
    symbol: "DH",
    minorUnitDigits: 2,
    locale: "en-MA",
  },
  SDG: {
    code: "SDG",
    name: "Sudanese Pound",
    symbol: "SDG",
    minorUnitDigits: 2,
    locale: "en-SD",
  },
  TND: {
    code: "TND",
    name: "Tunisian Dinar",
    symbol: "DT",
    minorUnitDigits: 3,
    locale: "en-TN",
  },
  SSP: {
    code: "SSP",
    name: "South Sudanese Pound",
    symbol: "SSP",
    minorUnitDigits: 2,
    locale: "en-SS",
  },
  // --- Western universals (for international accounts) ---
  USD: {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    minorUnitDigits: 2,
    locale: "en-US",
  },
  GBP: {
    code: "GBP",
    name: "British Pound",
    symbol: "\u00A3",
    minorUnitDigits: 2,
    locale: "en-GB",
  },
  EUR: {
    code: "EUR",
    name: "Euro",
    symbol: "\u20AC",
    minorUnitDigits: 2,
    locale: "en-IE",
  },
};

export const DEFAULT_CURRENCY = "KES";

const SUPPORTED_CODES = new Set(Object.keys(CURRENCIES));

/** Look up a currency, ignoring case. Returns undefined when unsupported. */
export function getCurrency(code: string): CurrencyInfo | undefined {
  return CURRENCIES[code.toUpperCase()];
}

/** Returns true when the code is a supported currency. */
export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CODES.has(code.toUpperCase());
}

/** Convenience: always returns a CurrencyInfo, falling back to KES. */
export function requireCurrency(code: string): CurrencyInfo {
  return getCurrency(code) ?? CURRENCIES[DEFAULT_CURRENCY]!;
}