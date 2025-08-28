import seed from './meaux.seed.json';
export const MEAUX_SEED = seed;
export function getMeauxSeed() {
  return seed.map((o, idx) => ({
    ...o,
    id: o.id || o.code || `MX-${idx}-${Math.random().toString(36).slice(2,8)}`,
    distanceText: (typeof o.distanceKm === 'number' ? `${o.distanceKm.toFixed(1)} km` : o.distanceKm),
    etaText: (typeof o.etaMin === 'number' ? `${o.etaMin} min` : o.etaMin),
    priceText: (typeof o.priceEuro === 'number' ? `${o.priceEuro.toFixed(2)} €` : o.priceEuro),
    dropoffLat: o.lat,
    dropoffLng: o.lng,
    dropoffAddress: o.address,
    restaurant: o.merchant,
    category: o.category
  }));
}
