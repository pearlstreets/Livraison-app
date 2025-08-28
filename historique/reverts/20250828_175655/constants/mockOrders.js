export const MEAUX_CENTER = { lat: 48.9575, lng: 2.8795 };
// Metro supporte require() pour JSON
const seed = require('./meaux.seed.json');

function toChip(v, unit, digits=1){ return typeof v==='number' ? `${v.toFixed(digits)} ${unit}` : String(v); }

export function getMeauxSeed(){
  return seed.map(s => ({
    code: s.code,
    category: s.category,
    restaurant: s.merchant,
    merchant: s.merchant,
    address: s.address,
    dropoffAddress: s.address,
    lat: s.lat, lng: s.lng,
    dropoffLat: s.lat, dropoffLng: s.lng,
    distanceText: toChip(s.distanceKm,'km'),
    etaText: `${Math.round(s.etaMin)} min`,
    priceText: `${Number(s.priceEuro).toFixed(2)} €`,
    status: 'available'
  }));
}

/** Push cyclique d'ordres Meaux dans setAvailable */
export function startMeauxFeed(setAvailable, intervalMs=4500){
  const list = getMeauxSeed();
  let i = 0;
  const id = setInterval(() => {
    const it = list[i % list.length]; i++;
    try{
      setAvailable(prev => [it, ...(Array.isArray(prev)?prev:[])].slice(0,30));
    }catch{}
  }, intervalMs);
  return () => clearInterval(id);
}
