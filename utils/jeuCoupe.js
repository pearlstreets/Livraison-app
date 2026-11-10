/**
 * Logique pure du mini-jeu « Fruits express » (screens/JeuCoupeScreen.js).
 *
 * Les fruits de la commande d'un client (smoothie, primeur) jaillissent du
 * bas de l'écran en arc ; le livreur les tranche en glissant le doigt. Les
 * colis fragiles (verre) ne se tranchent pas : en couper un = fin de partie.
 * Fruit retombé sans être tranché = une vie en moins (3 vies).
 *
 * Monde en unités : la hauteur vaut toujours HAUTEUR (1000), la largeur
 * dépend de l'écran (largeur en pixels / échelle). Même difficulté sur tous
 * les téléphones. Le monde est muté sur place (boucle requestAnimationFrame
 * et gestes du doigt), aucun React ici.
 *
 * Cœur doré : de temps en temps un cœur passe parmi les fruits ; le trancher
 * rend une vie (3 au plus), le rater ne coûte rien. Rare au début, plus
 * fréquent quand la difficulté monte et surtout quand il ne reste qu'une vie.
 * Jamais proposé à pleine vie (il ne servirait à rien).
 *
 * Phases : 'jeu', 'casse' (colis fragile tranché, tout se fige), 'perdu'
 * (dernière vie perdue, courte attente), 'fini'.
 *
 * Difficulté : au début facile, après difficile. Vagues 1 à 3 : un seul
 * fruit, très lent, aucun colis fragile. Ensuite, un fruit de plus toutes
 * les 3 vagues (7 au plus), vols de plus en plus courts, départs plus
 * serrés, colis fragiles à partir de la vague 6, de plus en plus fréquents
 * et nombreux.
 */

export const HAUTEUR = 1000;
export const DT_MAX = 1 / 30; // dt borné : physique identique quel que soit le nombre d'images
export const VIES = 3;

export const RAYON_FRUIT = 62; // fruits bien visibles (46 avant le 09/11)
export const RAYON_FRAGILE = 56; // demi-côté du carton
export const RAYON_COEUR = 58; // cœur doré
export const VAGUES_ENTRE_COEURS = 3; // au moins 3 vagues entre deux cœurs
// Tolérance de la lame : un peu généreuse sur les fruits, indulgente sur les colis.
const MARGE_FRUIT = 1.12;
const MARGE_FRAGILE = 0.8;
const MARGE_COEUR = 1.2; // généreuse : le cœur est une récompense

export const POINTS_FRUIT = 1;
export const FENETRE_COMBO = 0.3; // s entre deux fruits tranchés d'un même geste
export const COMBO_MIN = 2;

export const ATTENTE_CASSE = 0.9; // s figées après un colis fragile tranché
export const ATTENTE_PERDU = 0.7;

// Sortes de fruits : emoji et couleur du jus (éclaboussures).
export const FRUITS = [
  { emoji: '🍎', jus: '#E53935' },
  { emoji: '🍊', jus: '#FB8C00' },
  { emoji: '🍋', jus: '#FDD835' },
  { emoji: '🍉', jus: '#EF5350' },
  { emoji: '🍓', jus: '#E91E63' },
  { emoji: '🍍', jus: '#FBC02D' },
  { emoji: '🥝', jus: '#7CB342' },
  { emoji: '🍑', jus: '#FF8A65' },
  { emoji: '🍇', jus: '#8E24AA' },
  { emoji: '🥭', jus: '#FFA000' },
];

// Générateur pseudo-aléatoire reproductible (mulberry32).
function aleatoire(m) {
  m.graine = (m.graine + 0x6d2b79f5) | 0;
  let x = m.graine;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function borner(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Réglages d'une vague (numérotées à partir de 1).
 * duree : temps de vol d'un objet (montée + descente jusqu'au bas de l'écran).
 * fruits : nombre de fruits. probaFragile / maxFragiles : colis fragiles.
 * etalement : écart maximal entre deux départs d'une même vague (s).
 * pause : attente entre la fin d'une vague et la suivante (s).
 */
export function reglagesVague(v) {
  const n = Math.max(1, Math.floor(v));
  const p = borner((n - 1) / 30, 0, 1);
  const p2 = borner((n - 31) / 40, 0, 1);
  return {
    duree: 3.4 - 1.5 * p - 0.35 * p2, // 3,4 s au départ, 1,9 s à la vague 31, 1,55 s au plus dur
    fruits: Math.min(7, 1 + Math.floor((n - 1) / 3)),
    probaFragile: n < 6 ? 0 : Math.min(0.85, 0.2 + (n - 6) * 0.035),
    maxFragiles: n < 6 ? 0 : Math.min(3, 1 + Math.floor((n - 6) / 10)),
    etalement: Math.max(0.15, 0.9 - 0.025 * n),
    pause: Math.max(0.35, 1.3 - 0.03 * n),
  };
}

/**
 * Chance qu'un cœur doré se joigne à la vague `v` quand il reste `vies` vies.
 * 0 avant la vague 4 et à pleine vie ; ensuite 6 % qui montent avec la
 * difficulté (jusqu'à 18 %), +5 % à 2 vies, +30 % à 1 vie.
 */
export function probaCoeur(v, vies) {
  const n = Math.max(1, Math.floor(v));
  if (n < 4 || vies >= VIES) return 0;
  const p = borner((n - 1) / 30, 0, 1);
  const urgence = vies <= 1 ? 0.3 : 0.05;
  return Math.min(0.6, 0.06 + 0.12 * p + urgence);
}

export function creerMonde(largeur, graine = Date.now()) {
  return {
    largeur: Math.max(300, largeur || 500),
    graine: graine | 0,
    phase: 'jeu',
    t: 0,
    score: 0,
    vies: VIES,
    vague: 0,
    tranches: 0, // fruits tranchés
    rates: 0, // fruits retombés
    coeurs: 0, // cœurs dorés tranchés
    meilleurCombo: 0,
    objets: [], // fruits et colis fragiles entiers
    morceaux: [], // moitiés de fruits qui retombent
    file: [], // départs prévus de la vague en cours { delai, type }
    tVague: 0,
    vagueCoeur: -99, // dernière vague où un cœur est parti
    attente: 0.8, // avant la première vague
    gravite: 0,
    combo: { n: 0, dernier: 0, x: 0, y: 0 },
    tempsArret: 0,
    prochainId: 1,
  };
}

export function changerLargeur(m, largeur) {
  m.largeur = Math.max(300, largeur || m.largeur);
}

/** Prépare la vague suivante (file de départs). */
export function nouvelleVague(m, ev) {
  m.vague += 1;
  m.tVague = 0;
  m.attente = null;
  const r = reglagesVague(m.vague);
  const types = Array.from({ length: r.fruits }, () => 'fruit');
  if (r.maxFragiles > 0 && aleatoire(m) < r.probaFragile) {
    const nb = 1 + Math.floor(aleatoire(m) * r.maxFragiles);
    for (let i = 0; i < nb; i += 1) types.push('fragile');
  }
  if (
    m.vague - m.vagueCoeur > VAGUES_ENTRE_COEURS
    && !m.objets.some((o) => o.type === 'coeur')
    && aleatoire(m) < probaCoeur(m.vague, m.vies)
  ) {
    types.push('coeur');
    m.vagueCoeur = m.vague;
  }
  // Mélange (le colis peut partir avant, pendant ou après les fruits).
  for (let i = types.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatoire(m) * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  // Salve (tout part presque ensemble) ou départs échelonnés.
  const salve = m.vague > 3 && aleatoire(m) < 0.35;
  let delai = 0;
  m.file = types.map((type, i) => {
    if (i > 0) delai += salve ? aleatoire(m) * 0.08 : 0.08 + aleatoire(m) * r.etalement;
    return { delai, type };
  });
  ev.push({ type: 'vague', n: m.vague });
}

/** Lance un objet du bas de l'écran, en arc, pour retomber dans l'écran. */
export function lancer(m, type) {
  const r = reglagesVague(m.vague);
  const l = m.largeur;
  const debutant = m.vague <= 2;
  const rayon = type === 'fragile' ? RAYON_FRAGILE : type === 'coeur' ? RAYON_COEUR : RAYON_FRUIT;
  // Départ et arrivée bornés : l'objet entier reste dans la largeur de l'écran.
  const bord = Math.min(rayon + 6, l / 2);
  const x0 = borner(l * (debutant ? 0.3 + aleatoire(m) * 0.4 : 0.12 + aleatoire(m) * 0.76), bord, l - bord);
  const xFin = borner(l * (debutant ? 0.35 + aleatoire(m) * 0.3 : 0.1 + aleatoire(m) * 0.8), bord, l - bord);
  // Sommet entre 52 % et 85 % de la hauteur (mesuré depuis le bas).
  const sommet = HAUTEUR * (0.52 + aleatoire(m) * 0.33);
  const duree = r.duree * (0.92 + aleatoire(m) * 0.16);
  const demi = duree / 2;
  const g = (2 * sommet) / (demi * demi);
  const o = {
    id: m.prochainId,
    type,
    sorte: type === 'fruit' ? Math.floor(aleatoire(m) * FRUITS.length) : 0,
    r: rayon,
    x: x0,
    y: HAUTEUR + rayon,
    vx: (xFin - x0) / duree,
    vy: -g * demi,
    g,
    rot: type === 'coeur' ? (aleatoire(m) - 0.5) * 30 : aleatoire(m) * 360,
    vr: (aleatoire(m) - 0.5) * (type === 'fragile' ? 160 : type === 'coeur' ? 90 : 320),
  };
  m.prochainId += 1;
  m.gravite = g;
  m.objets.push(o);
  return o;
}

/** Distance du point (cx, cy) au segment [a, b] inférieure ou égale à r. */
export function segmentTouche(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let u = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  u = borner(u, 0, 1);
  const px = ax + u * dx - cx;
  const py = ay + u * dy - cy;
  return px * px + py * py <= r * r;
}

function couper(m, o, angle, ev) {
  // Normale à la lame : les deux moitiés s'écartent de part et d'autre.
  const rad = (angle * Math.PI) / 180;
  const nx = Math.sin(rad);
  const ny = -Math.cos(rad);
  for (const cote of [-1, 1]) {
    m.morceaux.push({
      id: m.prochainId,
      sorte: o.sorte,
      cote,
      r: o.r,
      x: o.x + cote * nx * o.r * 0.5,
      y: o.y + cote * ny * o.r * 0.5,
      vx: o.vx + cote * nx * 130,
      vy: Math.min(o.vy, 0) * 0.3 + cote * ny * 130,
      g: Math.max(o.g, 900),
      rot: angle - 90,
      vr: cote * (90 + aleatoire(m) * 140),
    });
    m.prochainId += 1;
  }
  m.tranches += 1;
  m.score += POINTS_FRUIT;
  const c = m.combo;
  if (c.n > 0 && m.t - c.dernier <= FENETRE_COMBO) c.n += 1;
  else {
    finirCombo(m, ev);
    c.n = 1;
  }
  c.dernier = m.t;
  c.x = o.x;
  c.y = o.y;
  ev.push({ type: 'tranche', x: o.x, y: o.y, sorte: o.sorte, angle, points: POINTS_FRUIT });
}

/** Clôt le combo en cours : bonus égal au nombre de fruits (2 ou plus). */
export function finirCombo(m, ev) {
  const c = m.combo;
  if (c.n >= COMBO_MIN) {
    const bonus = c.n;
    m.score += bonus;
    m.meilleurCombo = Math.max(m.meilleurCombo, c.n);
    ev.push({ type: 'combo', n: c.n, bonus, x: c.x, y: c.y });
  }
  c.n = 0;
}

/**
 * Passage de la lame du point a au point b (unités). Rend les événements :
 * tranche, combo, casse, liste.
 */
export function lame(m, ax, ay, bx, by) {
  const ev = [];
  if (m.phase !== 'jeu') return ev;
  if (Math.abs(bx - ax) + Math.abs(by - ay) < 2) return ev;
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const restants = [];
  let changement = false;
  for (const o of m.objets) {
    const marge = o.type === 'fragile' ? MARGE_FRAGILE : o.type === 'coeur' ? MARGE_COEUR : MARGE_FRUIT;
    if (m.phase === 'jeu' && segmentTouche(ax, ay, bx, by, o.x, o.y, o.r * marge)) {
      changement = true;
      if (o.type === 'fragile') {
        m.phase = 'casse';
        m.tempsArret = 0;
        finirCombo(m, ev);
        ev.push({ type: 'casse', x: o.x, y: o.y, id: o.id });
        restants.push(o); // le carton reste affiché, fendu
        o.casse = true;
      } else if (o.type === 'coeur') {
        // Cœur doré tranché : une vie de plus (3 au plus), il disparaît.
        m.vies = Math.min(VIES, m.vies + 1);
        m.coeurs += 1;
        ev.push({ type: 'vie', x: o.x, y: o.y, vies: m.vies });
      } else {
        couper(m, o, angle, ev);
      }
    } else {
      restants.push(o);
    }
  }
  m.objets = restants;
  if (changement) ev.push({ type: 'liste' });
  return ev;
}

/** État à sauvegarder (partie en cours, à la pause) : on repart au début de la vague. */
export function etatSauvegarde(m) {
  return { vague: Math.max(1, m.vague, m.vagueReprise || 0), score: m.score, vies: m.vies };
}

/** Monde repris d'une sauvegarde : même score, mêmes vies, la vague recommence. */
export function mondeRepris(largeur, etat, graine = Date.now()) {
  const m = creerMonde(largeur, graine);
  const e = etat || {};
  m.vagueReprise = Math.max(1, Math.floor(Number(e.vague) || 1));
  m.vague = m.vagueReprise - 1;
  m.score = Math.max(0, Math.floor(Number(e.score) || 0));
  m.vies = borner(Math.floor(Number(e.vies) || VIES), 1, VIES);
  return m;
}

/** Doigt levé : le combo du geste est clos. */
export function finGeste(m) {
  const ev = [];
  if (m.phase === 'jeu') finirCombo(m, ev);
  return ev;
}

/**
 * Avance le monde de `dt` secondes (borné à DT_MAX). Rend la liste des
 * événements : vague, liste, rate (vie perdue), combo, fin.
 */
export function avancer(m, dtBrut) {
  const ev = [];
  const dt = borner(Number(dtBrut) || 0, 0, DT_MAX);
  if (m.phase === 'fini') return ev;
  m.t += dt;

  if (m.phase === 'casse' || m.phase === 'perdu') {
    m.tempsArret += dt;
    // Les moitiés finissent de tomber, le reste est figé.
    if (m.phase === 'perdu' && bougerMorceaux(m, dt)) ev.push({ type: 'liste' });
    const casse = m.phase === 'casse';
    if (m.tempsArret >= (casse ? ATTENTE_CASSE : ATTENTE_PERDU)) {
      m.phase = 'fini';
      ev.push({ type: 'fin', raison: casse ? 'casse' : 'vies' });
    }
    return ev;
  }

  // Combo clos si plus rien n'est tranché pendant la fenêtre.
  if (m.combo.n > 0 && m.t - m.combo.dernier > FENETRE_COMBO) finirCombo(m, ev);

  // Vagues : départs prévus, puis attente avant la suivante.
  let changement = false;
  if (m.file.length) {
    m.tVague += dt;
    while (m.file.length && m.file[0].delai <= m.tVague) {
      lancer(m, m.file.shift().type);
      changement = true;
    }
  } else if (m.objets.length === 0) {
    if (m.attente == null) m.attente = reglagesVague(m.vague).pause;
    m.attente -= dt;
    if (m.attente <= 0) nouvelleVague(m, ev);
  }

  // Objets entiers.
  const restants = [];
  for (const o of m.objets) {
    o.vy += o.g * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.rot += o.vr * dt;
    if (o.vy > 0 && o.y - o.r > HAUTEUR) {
      changement = true;
      if (o.type === 'fruit') {
        m.vies = Math.max(0, m.vies - 1);
        m.rates += 1;
        ev.push({ type: 'rate', x: borner(o.x, o.r, m.largeur - o.r), sorte: o.sorte, vies: m.vies });
      }
    } else {
      restants.push(o);
    }
  }
  m.objets = restants;
  if (bougerMorceaux(m, dt)) changement = true;
  if (changement) ev.push({ type: 'liste' });

  if (m.vies <= 0) {
    finirCombo(m, ev);
    m.phase = 'perdu';
    m.tempsArret = 0;
  }
  return ev;
}

function bougerMorceaux(m, dt) {
  const avant = m.morceaux.length;
  for (const p of m.morceaux) {
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  m.morceaux = m.morceaux.filter((p) => p.y - p.r < HAUTEUR + 40);
  return m.morceaux.length !== avant;
}
