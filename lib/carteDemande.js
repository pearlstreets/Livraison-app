// Carte de la demande ouverte au lancement de l'app (04/11/2026, modèle
// Uber Driver). Module pur, sans dépendance : niveaux, couleurs, lieu choisi
// et liens de navigation (mêmes adresses Google Maps, Waze et Apple Plans
// que le reste de l'app). Bonus de demande (04/11/2026, façon Boosts Uber
// Eats) : montant par course renvoyé par le serveur, 0 si coupé.

// Du plus fort au plus faible.
export const NIVEAUX = ['tres_forte', 'forte', 'moyenne', 'faible'];
export const NIVEAUX_FORTS = ['tres_forte', 'forte'];

// Orange à rouge selon la demande ; faible = gris.
export const COULEURS = {
  tres_forte: { pastille: '#E02424', rgb: '224, 36, 36' },
  forte: { pastille: '#F0532A', rgb: '240, 83, 42' },
  moyenne: { pastille: '#FF8A1F', rgb: '255, 138, 31' },
  faible: { pastille: '#8E8E93', rgb: '142, 142, 147' },
};

// Clés de traduction par niveau.
export const CLES_NIVEAU = {
  tres_forte: { titre: 'carteDemandVeryHigh', phrase: 'carteDemandVeryHighText' },
  forte: { titre: 'carteDemandHigh', phrase: 'carteDemandHighText' },
  moyenne: { titre: 'carteDemandMedium', phrase: 'carteDemandMediumText' },
  faible: { titre: 'carteDemandLow', phrase: 'carteDemandLowText' },
};

// Bonus par course (nombre >= 0) ; tout montant illisible vaut 0.
export const bonusValide = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export const niveauConnu = (n) => (NIVEAUX.includes(n) ? n : 'faible');

const rang = (n) => NIVEAUX.indexOf(niveauConnu(n));

// Lieux exploitables (position numérique), au format de la carte.
// Rafraîchissement demandé par le serveur (secondes), entre 30 s et 10 min.
export const delaiRafraichissementMs = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 60 * 1000;
  return Math.min(Math.max(n, 30), 600) * 1000;
};

export const lieuxValides = (liste) =>
  (Array.isArray(liste) ? liste : [])
    .filter((l) => l?.lat != null && l?.lng != null && l.lat !== '' && l.lng !== '')
    .map((l) => ({
      ...l,
      lat: Number(l?.lat),
      lng: Number(l?.lng),
      niveau: niveauConnu(l?.niveau),
      bonus: bonusValide(l?.bonus),
    }))
    .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));

// Lieu montré à l'ouverture : la plus forte demande, puis le plus proche.
export const lieuParDefaut = (lieux) => {
  if (!lieux.length) return null;
  return [...lieux].sort((a, b) => {
    const r = rang(a.niveau) - rang(b.niveau);
    if (r) return r;
    const da = Number.isFinite(a.distance_km) ? a.distance_km : Infinity;
    const db = Number.isFinite(b.distance_km) ? b.distance_km : Infinity;
    return da - db;
  })[0];
};

// Zone colorée autour d'un lieu demandé (rien pour une demande faible).
export const zoneDuLieu = (lieu) => {
  if (lieu.niveau === 'faible') return null;
  const rayon = { tres_forte: 700, forte: 550, moyenne: 400 }[lieu.niveau];
  return {
    key: `zone-${lieu.id}`,
    center: { latitude: lieu.lat, longitude: lieu.lng },
    radius: rayon,
    rgb: COULEURS[lieu.niveau].rgb,
  };
};

export const lienGoogleMaps = (lieu) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lieu.lat},${lieu.lng}`;

export const lienWaze = (lieu) => `https://waze.com/ul?ll=${lieu.lat},${lieu.lng}&navigate=yes`;

// Apple Plans (iOS) : `dest` = « lat,lng » ou adresse déjà encodée.
export const lienApplePlansVers = (dest) => `https://maps.apple.com/?daddr=${dest}&dirflg=d`;

export const lienApplePlans = (lieu) => lienApplePlansVers(`${lieu.lat},${lieu.lng}`);

// Une ouverture de la carte par lancement de l'app.
let dejaMontree = false;
export const aMontrerAuLancement = () => {
  if (dejaMontree) return false;
  dejaMontree = true;
  return true;
};
