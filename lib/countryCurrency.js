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
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FR: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR',
  MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR', AD: 'EUR', MC: 'EUR',
  SM: 'EUR', VA: 'EUR', XK: 'EUR', ME: 'EUR', HR: 'EUR',
  GB: 'GBP', CH: 'CHF', LI: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'EUR', IS: 'ISK',
  RS: 'RSD', AL: 'ALL', BA: 'BAM', MK: 'MKD', MD: 'MDL', UA: 'UAH',
  BY: 'BYN', RU: 'RUB', TR: 'TRY',
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP',
  CO: 'COP', PE: 'PEN', UY: 'UYU', BO: 'BOB', PY: 'PYG', CR: 'CRC',
  GT: 'GTQ', HN: 'HNL', NI: 'NIO', DO: 'DOP', JM: 'JMD', TT: 'TTD',
  BB: 'BBD', BS: 'BSD', PA: 'PAB', EC: 'USD', SV: 'USD',
  JP: 'JPY', CN: 'CNY', IN: 'INR', AU: 'AUD', NZ: 'NZD', KR: 'KRW',
  SG: 'SGD', HK: 'HKD', TW: 'TWD', TH: 'THB', VN: 'VND', PH: 'PHP',
  ID: 'IDR', MY: 'MYR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  KH: 'KHR', LA: 'LAK', MM: 'MMK', BN: 'BND', MO: 'MOP',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  JO: 'JOD', LB: 'LBP', IL: 'ILS', EG: 'EGP', IR: 'IRR', IQ: 'IQD',
  YE: 'YER', SY: 'SYP',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', TZ: 'TZS', UG: 'UGX',
  MA: 'MAD', DZ: 'DZD', TN: 'TND', LY: 'LYD', SD: 'SDG', ET: 'ETB',
  RW: 'RWF', MG: 'MGA', MU: 'MUR', DJ: 'DJF',
  CI: 'XOF', SN: 'XOF', BF: 'XOF', ML: 'XOF', BJ: 'XOF', TG: 'XOF',
  NE: 'XOF', GW: 'XOF',
  CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF',
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
