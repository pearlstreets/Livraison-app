import api from './api';

// EU country codes — used to derive `vat_regime` client-side.
// Mirrors the backend allow-list. France ('FR') is treated separately.
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
];

// Reduced list of countries shown in the picker. The driver can still hold
// a non-EU country — backend stores anything, regime defaults to OUTSIDE_EU.
export const COUNTRIES = [
  { code: 'FR', flag: 'FR', name: 'France' },
  { code: 'BE', flag: 'BE', name: 'Belgique' },
  { code: 'DE', flag: 'DE', name: 'Allemagne' },
  { code: 'ES', flag: 'ES', name: 'Espagne' },
  { code: 'IT', flag: 'IT', name: 'Italie' },
  { code: 'NL', flag: 'NL', name: 'Pays-Bas' },
  { code: 'PT', flag: 'PT', name: 'Portugal' },
  { code: 'IE', flag: 'IE', name: 'Irlande' },
  { code: 'LU', flag: 'LU', name: 'Luxembourg' },
  { code: 'AT', flag: 'AT', name: 'Autriche' },
  { code: 'PL', flag: 'PL', name: 'Pologne' },
  { code: 'SE', flag: 'SE', name: 'Suède' },
  { code: 'DK', flag: 'DK', name: 'Danemark' },
  { code: 'FI', flag: 'FI', name: 'Finlande' },
  { code: 'GR', flag: 'GR', name: 'Grèce' },
  { code: 'CZ', flag: 'CZ', name: 'République tchèque' },
  { code: 'HU', flag: 'HU', name: 'Hongrie' },
  { code: 'RO', flag: 'RO', name: 'Roumanie' },
  { code: 'BG', flag: 'BG', name: 'Bulgarie' },
  { code: 'HR', flag: 'HR', name: 'Croatie' },
  { code: 'SI', flag: 'SI', name: 'Slovénie' },
  { code: 'SK', flag: 'SK', name: 'Slovaquie' },
  { code: 'EE', flag: 'EE', name: 'Estonie' },
  { code: 'LV', flag: 'LV', name: 'Lettonie' },
  { code: 'LT', flag: 'LT', name: 'Lituanie' },
  { code: 'CY', flag: 'CY', name: 'Chypre' },
  { code: 'MT', flag: 'MT', name: 'Malte' },
  { code: 'CH', flag: 'CH', name: 'Suisse' },
  { code: 'GB', flag: 'GB', name: 'Royaume-Uni' },
  { code: 'NO', flag: 'NO', name: 'Norvège' },
  { code: 'US', flag: 'US', name: 'États-Unis' },
  { code: 'CA', flag: 'CA', name: 'Canada' },
];

/**
 * Derive the VAT regime from country + vat_number. Mirrors the backend rule:
 *   FR              -> 'FR'
 *   EU + has VAT    -> 'EU_VAT'    (autoliquidation/reverse charge)
 *   EU + no VAT     -> 'EU_NO_VAT' (we apply 20%)
 *   non-EU          -> 'OUTSIDE_EU'
 */
export function deriveVatRegime(country, vatNumber) {
  const c = String(country || '').toUpperCase().trim();
  const v = String(vatNumber || '').trim();
  if (!c) return 'OUTSIDE_EU';
  if (c === 'FR') return 'FR';
  if (EU_COUNTRIES.includes(c)) return v ? 'EU_VAT' : 'EU_NO_VAT';
  return 'OUTSIDE_EU';
}

/**
 * Format a Date or YYYY-MM-DD string into an ISO YYYY-MM-DD.
 * Returns null if input is invalid.
 */
export function toIsoDate(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = new Date(`${s}T00:00:00Z`);
    return isNaN(t.getTime()) ? null : s;
  }
  return null;
}

export function defaultMonthRange(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(Date.UTC(y, m, 1));
  // last day of current month
  const to = new Date(Date.UTC(y, m + 1, 0));
  return {
    from: toIsoDate(from),
    to: toIsoDate(to),
  };
}

export const vatService = {
  /**
   * Fetch the driver profile (incl. country, vat_regime, vat_number, siret,
   * legal_name, legal_address) via the existing `/me/` endpoint.
   * Returns the parsed driver payload, or throws.
   */
  async getDriverMe() {
    const { data } = await api.get('/api/v1/delivery/driver/me/');
    return data;
  },

  /**
   * Patch the driver VAT info. If the backend route is not yet deployed
   * (404) we surface a typed error so the UI can show a graceful message
   * instead of a cryptic stack trace.
   */
  async updateVatInfo({ country, vat_number, siret, legal_name, legal_address }) {
    const payload = {
      country: String(country || '').toUpperCase().trim(),
      vat_number: String(vat_number || '').trim(),
      siret: String(siret || '').trim(),
      legal_name: String(legal_name || '').trim(),
      legal_address: String(legal_address || '').trim(),
    };
    try {
      const { data } = await api.patch('/api/v1/delivery/driver/me/', payload);
      return data;
    } catch (e) {
      if (e?.status === 404) {
        const err = new Error('VAT_PATCH_NOT_DEPLOYED');
        err.code = 'VAT_PATCH_NOT_DEPLOYED';
        err.original = e;
        throw err;
      }
      throw e;
    }
  },

  /**
   * VAT/earnings summary for the period [date_from, date_to].
   * Defaults to the current calendar month if dates are missing.
   */
  async getVatSummary({ date_from, date_to } = {}) {
    const params = {};
    if (date_from) params.date_from = date_from;
    if (date_to) params.date_to = date_to;
    const { data } = await api.get('/api/v1/delivery/driver/vat/summary/', { params });
    return data;
  },
};

export default vatService;
