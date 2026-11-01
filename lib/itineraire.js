// Tracé par les rues de la carte d'une course (01/11/2026), repris du suivi
// de livraison d'AppUser (useItineraire.js). Module pur, sans dépendance.
//
// Le tracé vient du serveur (Apple Plans) ; la carte n'en montre que ce qui
// reste à parcourir, à partir de la position du livreur. Aucun tracé reçu :
// aucun trait, jamais une ligne droite à travers les immeubles.

// Liste [[lat, lng], ...] du serveur en points de carte, ou null.
export const enPoints = (liste) =>
  Array.isArray(liste) && liste.length >= 2
    ? liste
        .filter((p) => Array.isArray(p) && p.length === 2)
        .map(([latitude, longitude]) => ({ latitude, longitude }))
    : null;

// Distance approchée en mètres (petites distances).
export const metres = (a, b) => {
  const k = 111320;
  const dx = (a.longitude - b.longitude) * k * Math.cos((a.latitude * Math.PI) / 180);
  const dy = (a.latitude - b.latitude) * k;
  return Math.sqrt(dx * dx + dy * dy);
};

// Point du segment [a, b] le plus proche de p (projection à plat, valable sur
// quelques centaines de mètres).
export const projeter = (a, b, p) => {
  const c = Math.cos((p.latitude * Math.PI) / 180);
  const bx = (b.longitude - a.longitude) * c;
  const by = b.latitude - a.latitude;
  const px = (p.longitude - a.longitude) * c;
  const py = p.latitude - a.latitude;
  const l2 = bx * bx + by * by;
  const t = l2 ? Math.max(0, Math.min(1, (px * bx + py * by) / l2)) : 0;
  return {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
  };
};

// Distance en mètres entre p et le point du tracé le plus proche.
export const ecartAuTrace = (trace, p) => {
  if (!trace || trace.length < 2 || !p) return Infinity;
  let dMin = Infinity;
  for (let i = 0; i < trace.length - 1; i += 1) {
    const d = metres(projeter(trace[i], trace[i + 1], p), p);
    if (d < dMin) dMin = d;
  }
  return dMin;
};

// Le tracé repart de la position du livreur : la partie déjà parcourue
// disparaît au fil de l'avancée, même au milieu d'une longue rue droite
// (projection sur le segment le plus proche, pas seulement sur ses sommets).
// Écart de plus de 60 m (tracé pas encore relu) : la ligne part du point du
// tracé le plus proche, jamais de raccord en travers des maisons. Bout du
// tracé atteint : null, plus de trait.
export const recoller = (trace, position) => {
  if (!trace || !position) return trace;
  if (trace.length < 2) return null;
  let segment = 0;
  let pied = trace[0];
  let dMin = Infinity;
  for (let i = 0; i < trace.length - 1; i += 1) {
    const q = projeter(trace[i], trace[i + 1], position);
    const d = metres(q, position);
    if (d < dMin) {
      dMin = d;
      segment = i;
      pied = q;
    }
  }
  const reste = trace.slice(segment + 1);
  if (metres(pied, trace[trace.length - 1]) < 1) return null;
  const debut = dMin <= 60 ? [position, pied] : [pied];
  return [...debut, ...reste].filter(
    (p, i, l) => i === 0 || metres(p, l[i - 1]) >= 0.5,
  );
};
