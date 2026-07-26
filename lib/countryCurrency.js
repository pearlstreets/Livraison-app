// Pays (ISO 3166-1 alpha-2) → devise (ISO 4217).
//
// Sert à choisir la devise d'AFFICHAGE par défaut du livreur à partir du pays de
// son profil : un livreur au Mexique voit ses gains en pesos. Les montants
// restent stockés et versés en EUR côté plateforme ; seule la présentation
// change (cf. contexts/CurrencyContext.js).
//
// Table alignée sur celle du monorepo Marketplace (AppUser/AppPro/WebsiteUser
// et Backend UserApp/currency_utils.py) pour que le même livreur voie la même
// devise partout.

export const COUNTRY_TO_CURRENCY = {
  AD: 'EUR', AE: 'AED', AF: 'AFN', AG: 'XCD', AI: 'XCD', AL: 'ALL',
  AM: 'AMD', AO: 'AOA', AR: 'ARS', AS: 'USD', AT: 'EUR', AU: 'AUD',
  AZ: 'AZN', BA: 'BAM', BB: 'BBD', BD: 'BDT', BE: 'EUR', BF: 'XOF',
  BG: 'EUR', BH: 'BHD', BI: 'BIF', BJ: 'XOF', BM: 'BMD', BN: 'BND',
  BO: 'BOB', BR: 'BRL', BS: 'BSD', BT: 'BTN', BW: 'BWP', BY: 'BYN',
  BZ: 'BZD', CA: 'CAD', CD: 'CDF', CF: 'XAF', CG: 'XAF', CH: 'CHF',
  CI: 'XOF', CK: 'NZD', CL: 'CLP', CM: 'XAF', CN: 'CNY', CO: 'COP',
  CR: 'CRC', CU: 'CUP', CV: 'CVE', CY: 'EUR', CZ: 'CZK', DE: 'EUR',
  DJ: 'DJF', DK: 'DKK', DM: 'XCD', DO: 'DOP', DZ: 'DZD', EC: 'USD',
  EE: 'EUR', EG: 'EGP', EH: 'MAD', ER: 'ERN', ES: 'EUR', ET: 'ETB',
  FI: 'EUR', FJ: 'FJD', FM: 'USD', FO: 'DKK', FR: 'EUR', GA: 'XAF',
  GB: 'GBP', GD: 'XCD', GE: 'GEL', GG: 'GBP', GH: 'GHS', GI: 'GIP',
  GL: 'DKK', GM: 'GMD', GN: 'GNF', GQ: 'XAF', GR: 'EUR', GT: 'GTQ',
  GU: 'USD', GW: 'XOF', GY: 'GYD', HK: 'HKD', HN: 'HNL', HR: 'EUR',
  HT: 'HTG', HU: 'HUF', ID: 'IDR', IE: 'EUR', IL: 'ILS', IM: 'GBP',
  IN: 'INR', IQ: 'IQD', IR: 'IRR', IS: 'ISK', IT: 'EUR', JE: 'GBP',
  JM: 'JMD', JO: 'JOD', JP: 'JPY', KE: 'KES', KG: 'KGS', KH: 'KHR',
  KI: 'AUD', KM: 'KMF', KN: 'XCD', KP: 'KPW', KR: 'KRW', KW: 'KWD',
  KY: 'KYD', KZ: 'KZT', LA: 'LAK', LB: 'LBP', LC: 'XCD', LI: 'CHF',
  LK: 'LKR', LR: 'LRD', LS: 'LSL', LT: 'EUR', LU: 'EUR', LV: 'EUR',
  LY: 'LYD', MA: 'MAD', MC: 'EUR', MD: 'MDL', ME: 'EUR', MG: 'MGA',
  MH: 'USD', MK: 'MKD', ML: 'XOF', MM: 'MMK', MN: 'MNT', MO: 'MOP',
  MP: 'USD', MQ: 'EUR', MR: 'MRU', MS: 'XCD', MT: 'EUR', MU: 'MUR',
  MV: 'MVR', MW: 'MWK', MX: 'MXN', MY: 'MYR', MZ: 'MZN', NA: 'NAD',
  NC: 'XPF', NE: 'XOF', NF: 'AUD', NG: 'NGN', NI: 'NIO', NL: 'EUR',
  NO: 'NOK', NP: 'NPR', NR: 'AUD', NU: 'NZD', NZ: 'NZD', OM: 'OMR',
  PA: 'PAB', PE: 'PEN', PF: 'XPF', PG: 'PGK', PH: 'PHP', PK: 'PKR',
  PL: 'PLN', PR: 'USD', PS: 'ILS', PT: 'EUR', PW: 'USD', PY: 'PYG',
  QA: 'QAR', RE: 'EUR', RO: 'RON', RS: 'RSD', RU: 'RUB', RW: 'RWF',
  SA: 'SAR', SB: 'SBD', SC: 'SCR', SD: 'SDG', SE: 'SEK', SG: 'SGD',
  SH: 'SHP', SI: 'EUR', SK: 'EUR', SL: 'SLE', SM: 'EUR', SN: 'XOF',
  SO: 'SOS', SR: 'SRD', SS: 'SSP', ST: 'STN', SV: 'USD', SX: 'XCG',
  SY: 'SYP', SZ: 'SZL', TC: 'USD', TD: 'XAF', TG: 'XOF', TH: 'THB',
  TJ: 'TJS', TL: 'USD', TM: 'TMT', TN: 'TND', TO: 'TOP', TR: 'TRY',
  TT: 'TTD', TV: 'AUD', TW: 'TWD', TZ: 'TZS', UA: 'UAH', UG: 'UGX',
  US: 'USD', UY: 'UYU', UZ: 'UZS', VA: 'EUR', VC: 'XCD', VE: 'VES',
  VG: 'USD', VI: 'USD', VN: 'VND', VU: 'VUV', WF: 'XPF', WS: 'WST',
  XK: 'EUR', YE: 'YER', YT: 'EUR', ZA: 'ZAR', ZM: 'ZMW', ZW: 'ZWG',
};

// Quelques noms pleins courants : `profile.country` peut arriver en ISO-2
// ("MX") ou en toutes lettres selon la source. On accepte les deux plutôt que
// de retomber silencieusement sur l'euro.
const NAME_TO_ISO2 = {
  france: 'FR', mexico: 'MX', mexique: 'MX', spain: 'ES', espagne: 'ES',
  italy: 'IT', italie: 'IT', germany: 'DE', allemagne: 'DE', portugal: 'PT',
  belgium: 'BE', belgique: 'BE', netherlands: 'NL', 'pays-bas': 'NL',
  'united kingdom': 'GB', 'royaume-uni': 'GB', 'united states': 'US',
  'etats-unis': 'US', 'états-unis': 'US', usa: 'US', switzerland: 'CH',
  suisse: 'CH', canada: 'CA', brazil: 'BR', bresil: 'BR', brésil: 'BR',
  morocco: 'MA', maroc: 'MA', senegal: 'SN', sénégal: 'SN', tunisia: 'TN',
  tunisie: 'TN', algeria: 'DZ', algerie: 'DZ', algérie: 'DZ',
};

/**
 * Devise ISO-4217 d'un pays, ou 'EUR' par défaut.
 * Accepte un code ISO-2 ("MX") ou un nom plein ("Mexico"). Ne lève jamais.
 */
export function currencyForCountry(country) {
  if (!country || typeof country !== 'string') return 'EUR';
  const raw = country.trim();
  if (!raw) return 'EUR';
  const iso = /^[A-Za-z]{2}$/.test(raw)
    ? raw.toUpperCase()
    : NAME_TO_ISO2[raw.toLowerCase()];
  if (!iso) return 'EUR';
  return COUNTRY_TO_CURRENCY[iso] || 'EUR';
}

export default currencyForCountry;
