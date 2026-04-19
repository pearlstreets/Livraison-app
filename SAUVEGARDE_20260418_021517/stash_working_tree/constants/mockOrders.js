import filters from './filters.json';
const cfg = require('./driver-config.json');
const seed = require('./meaux.seed.json'); // déjà créé

export const MEAUX_CENTER = { lat: cfg.fallbackCenter.lat, lng: cfg.fallbackCenter.lng };

export function haversineKm(a, b){
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLng = (b.lng - a.lng) * Math.PI/180;
  const la1 = a.lat * Math.PI/180, la2 = b.lat * Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function parseEuro(x){
  if (typeof x === 'number') return x;
  const s = String(x).replace('€','').replace(',','.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function toOrder(o){
  const distanceText = (o.distanceKm!=null) ? `${Number(o.distanceKm).toFixed(1)} km` : undefined;
  const eta = (o.distanceKm!=null) ? Math.max(1, Math.round(o.distanceKm*cfg.etaMinutesPerKm)) : undefined;
  return {
    code: o.code, category: o.category,
    restaurant: o.merchant ?? o.restaurant,
    address: o.address,
    lat: o.lat, lng: o.lng, dropoffLat: o.lat, dropoffLng: o.lng,
    distanceText: distanceText ?? '',
    etaText: eta ? `${eta} min` : '',
    priceText: `${parseEuro(o.priceEuro).toFixed(2)} €`,
    itemsCount: o.itemsCount ?? (Math.floor(Math.random() * 5) + 1),
    status: 'available'
  };
}

export function getMeauxSeed(){
  return seed.map(toOrder);
}

/** Score mixte selon filtre (distance/€) */
export function score(order, driver, filterId='smart'){
  const f = filters.find(x=>x.id===filterId) || filters[0];
  const price = parseEuro(order.priceText);
  const dist  = order._distanceKm ?? 0;
  // Normalisations simples
  const nd = Math.min(1, dist / Math.max(1, cfg.geofenceKm));   // 0..1 (0=proche)
  const np = Math.min(1, price / 20);                           // 0..1 (cap à 20€)
  // On veut gros score = bon : inverse la distance (1-nd)
  return (1-nd)*f.nearWeight + np*f.payWeight;
}

/** Trie selon le filtre et injecte _distanceKm */
export function applyFilter(list, driver, filterId='smart'){
  const drv = driver?.latitude ? {lat:driver.latitude, lng:driver.longitude} : MEAUX_CENTER;
  const within = (Array.isArray(list)?list:[]).map(o=>{
    const lat = o.dropoffLat ?? o.lat, lng = o.dropoffLng ?? o.lng;
    const d = (lat!=null && lng!=null) ? haversineKm(drv, {lat,lng}) : 999;
    return {...o, _distanceKm: d};
  }).filter(o => o._distanceKm <= cfg.geofenceKm);

  if (filterId === 'nearest'){
    within.sort((a,b)=>a._distanceKm - b._distanceKm);
  } else if (filterId === 'highpay'){
    within.sort((a,b)=>parseEuro(b.priceText) - parseEuro(a.priceText));
  } else {
    within.sort((a,b)=>score(b, drv, filterId) - score(a, drv, filterId));
  }
  // met à jour les chips distance/eta
  return within.map(o=>{
    const eta = Math.max(1, Math.round(o._distanceKm*cfg.etaMinutesPerKm));
    return {...o,
      distanceText: `${o._distanceKm.toFixed(1)} km`,
      etaText: `${eta} min`
    };
  });
}

/** Flux mock qui ajoute des ordres autour de Meaux */
export function startMeauxFeed(setAvailable, intervalMs=cfg.feedIntervalMs){
  const base = getMeauxSeed();
  let i = 0;
  const id = setInterval(()=>{
    const it = base[i % base.length]; i++;
    setAvailable(prev => [it, ...(Array.isArray(prev)?prev:[])].slice(0,50));
  }, intervalMs);
  return ()=> clearInterval(id);
}
