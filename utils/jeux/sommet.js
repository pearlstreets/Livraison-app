/**
 * Mini-jeu « Livraison au sommet » : logique pure (sans React).
 *
 * Le livreur grimpe la façade en rebondissant tout seul sur chaque balcon
 * touché par le dessus. Le joueur ne fait que diriger (gauche, droite).
 * Monde en unités fixes : largeur MONDE_L, axe y vers le HAUT (y = hauteur),
 * l'écran convertit avec une échelle. L'état est muté sur place par
 * `avancer` (appelé à chaque image depuis une ref) pour rester fluide.
 *
 * Garantie de jeu : deux plateformes successives de la « chaîne » ne sont
 * jamais plus espacées que ECART_MAX_RATIO x la hauteur d'un saut normal, et
 * la vitesse latérale permet d'atteindre n'importe quelle abscisse pendant
 * ce saut (vérifiable avec peutAtteindre).
 *
 * Difficulté (demande du 10/11) : elle monte avec la hauteur (écarts,
 * pièges plus fréquents et plus rapides, vent dès le palier 1 et un peu plus
 * fort à chaque palier), puis au-delà du palier 4 une « surcharge » accélère
 * encore pots, pigeons et nacelles, plafonnée pour rester jouable.
 * Durcie le 15/11/2026 (jeu jugé trop facile) : difficulté qui monte plus
 * vite (échelle de 1700 unités au lieu de 2600), écart minimal jusqu'à 0,68
 * saut (0,62 avant), pots dès 600 et pigeons dès 1000 (900 et 1400 avant),
 * pots en rafales dès le palier 2 (3 avant), pièges plus fréquents et plus
 * rapides dès le départ, surcharge de +10 % par palier plafonnée à 50 %
 * (7 % et 35 % avant). La borne ECART_MAX_RATIO ne change pas.
 * Durcie et variée le 16/11/2026 : voir l'en-tête de `difficulte`.
 * Bonus ramassables (un tous les 13 à 22 étages environ, posés au-dessus
 * d'un balcon de la chaîne, donc toujours atteignables) : aimant à colis,
 * casque (protège d'un pot ou d'un pigeon) et filet de sécurité (rattrape
 * une chute). Les anciens bonus restent : matelas, monte-charge, colis.
 *
 * Partie enregistrée dans AsyncStorage par compte livreur
 * (records, phase et course en cours). Une course reprise repart du
 * trottoir en gardant étages, colis et bonus actifs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {cleSauvegardeJeu, entierJeu} from './commun';

export const JEU_SOMMET = 'sommet';

export const MONDE_L = 360;
export const GRAVITE = 2200;
export const V_SAUT = 900;
export const V_TRAMPO = 1350;
export const V_MONTE = 1900;
export const ACC_X = 1900;
export const VX_MAX = 340;
export const ETAGE = 60;
export const POINTS_COLIS = 5;
export const ECART_MAX_RATIO = 0.86;
export const ETAGES_PALIER = 50;
export const VENT_MAX = 520;
export const DUREE_ANNONCE = 4;
export const JOUEUR_L = 34;
export const JOUEUR_H = 46;
export const PIED = 13; // demi-largeur des pieds pour les rebonds
export const PLAT_H = 12;
export const DT_MAX = 1 / 30;
export const RALENTI = 0.7;
const PAS = 1 / 120;

/** Bonus ramassables : durée (secondes de jeu) et hauteur d'apparition. */
export const BONUS = {
  aimant: { duree: 8, des: 600 },
  casque: { duree: 15, des: 900 },
  filet: { duree: 15, des: 1200 },
};
export const TYPES_BONUS = Object.keys(BONUS);
export const RAYON_AIMANT = 150;
export const V_AIMANT = 520;
export const BONUS_ECART_MIN = 800;
export const BONUS_ECART_MAX = 1300;
export const INVULNERABLE = 0.8; // secondes protégées après un coup paré par le casque
// Un pigeon ne blesse qu'après ce temps à l'écran : né au bord, il touchait
// parfois un livreur collé au bord avant d'être visible (temps de jeu, 0,36 s réelle).
export const PIGEON_VU_MIN = 0.25;
export const SURCHARGE_MAX = 0.9;
// Une nacelle ne file jamais plus vite que 80 % de la course du livreur : on la rattrape toujours.
export const V_NACELLE_MAX = 0.8 * VX_MAX;
export const ALERTE_MIN = 0.6; // préavis minimal d'un pot (temps de jeu)
export const ALERTE_RIDEAU = 0.8; // préavis d'un rideau de pots : le temps d'aller jusqu'au trou
export const ECART_MIN_MAX_RATIO = 0.78; // l'écart minimal ne dépasse jamais 0,78 saut
export const DEBUT_POTS = 450;
export const DEBUT_PIGEONS = 800;
export const VENT_BONUS_MAX = 0.3;

export const LARGEURS = { sol: MONDE_L, balcon: 74, nacelle: 70, store: 80, trampo: 74, monte: 84 };

export function hauteurSaut(v = V_SAUT) {
  return (v * v) / (2 * GRAVITE);
}
const H_SAUT = hauteurSaut(V_SAUT);

/**
 * Difficulté 0 (début) vers 1, progressive à l'intérieur d'une course.
 *
 * Refonte du 16/11/2026 (jeu jugé trop simple et toujours pareil, même au
 * niveau 9). La difficulté se règle maintenant surtout par niveau (palier de
 * 50 étages) et chaque niveau a son propre mélange de pièges :
 * - Niveau 1 : prise en main courte, mais pots dès 450 de haut et pigeons
 *   dès 800 ; la difficulté de base monte plus vite (échelle 1100 au lieu de 1700).
 * - Dès le niveau 2, une « surcharge » accélère pots, pigeons et nacelles de
 *   15 % par niveau, jusqu'à +90 % au niveau 8 (avant : rien avant le niveau 6,
 *   plafond à +50 %). Pots par deux dès le niveau 3, par trois dès le niveau 6 ;
 *   pigeons par deux dès le niveau 3, par trois dès le niveau 7.
 * - Chaque niveau tire un ou plusieurs « accents » (un aux niveaux 2 et 3,
 *   deux aux niveaux 4 à 6, trois ensuite), dans un ordre mélangé à chaque
 *   course, jamais le même ensemble deux niveaux de suite : rideau de pots
 *   avec un seul trou, pots qui visent le livreur, nuées de pigeons des deux
 *   côtés à la fois, pigeons qui ondulent, chaîne de nacelles rapides, chaîne
 *   de stores qui se déchirent, balcons en zigzag d'un bord à l'autre,
 *   balcons et stores plus étroits. Les premiers accents reviennent aussi en
 *   petite dose aux niveaux suivants.
 * - Plus haut : écarts minimaux plus grands, moins de matelas, plus de
 *   nacelles et de stores dans la chaîne.
 * Ce qui reste garanti, à tous les niveaux : écart de la chaîne au plus
 * ECART_MAX_RATIO saut, préavis d'un pot au moins ALERTE_MIN (ALERTE_RIDEAU
 * pour un rideau, dont le trou laisse toujours passer le livreur), nacelles
 * plus lentes que le livreur (V_NACELLE_MAX), intervalles entre pièges
 * bornés par SURCHARGE_MAX. Une course reprise garde la difficulté de son
 * niveau (hauteur de base ajoutée), avec le même répit au départ.
 */
export function difficulte(hauteur) {
  return 1 - Math.exp(-Math.max(0, hauteur) / 1100);
}

/** Accélération des pièges dès le niveau 2 : +15 % par niveau, plafonnée. */
export function surcharge(palier) {
  return Math.min(SURCHARGE_MAX, Math.max(0, palier) * 0.15);
}

/** Accents possibles d'un niveau (tous dessinés avec le décor existant). */
export const ACCENTS = ['rideau', 'visee', 'nuee', 'vague', 'nacelles', 'fragile', 'zigzag', 'etroit'];

/** Ordre des accents mélangé pour une course. */
export function ordreAccents(hasard = Math.random) {
  const o = ACCENTS.slice();
  for (let i = o.length - 1; i > 0; i -= 1) {
    const k = Math.floor(hasard() * (i + 1));
    [o[i], o[k]] = [o[k], o[i]];
  }
  return o;
}

/** Accents d'un niveau : aucun au niveau 1, puis 1, 2 ou 3, jamais le même ensemble deux niveaux de suite. */
export function accentsNiveau(palier, ordre = ACCENTS) {
  if (palier < 1) return [];
  const n = ordre.length;
  const nb = palier < 3 ? 1 : palier < 6 ? 2 : 3;
  const depart = palier < 3 ? palier - 1 : palier < 6 ? 2 + (palier - 3) * 2 : palier * 3;
  const out = [];
  for (let i = 0; i < nb; i += 1) out.push(ordre[(depart + i) % n]);
  return out;
}

// Accents qui reviennent en petite dose : [palier d'arrivée, dose de fond, dose en accent].
const DOSES = {
  visee: [2, 0.25, 0.7],
  vague: [3, 0.25, 0.8],
  zigzag: [3, 0.25, 0.8],
  rideau: [4, 0.12, 0.4],
  nuee: [5, 0.2, 0.6],
  nacelles: [99, 0, 1],
  fragile: [99, 0, 1],
  etroit: [99, 0, 1],
};

/** Probabilité qu'un accent joue à ce palier, avec la liste d'accents du niveau. */
export function dose(accent, palier, accents = []) {
  const [des, fond, fort] = DOSES[accent];
  if (accents.includes(accent)) return fort;
  return palier >= des ? fond : 0;
}

/** Largeur d'une plateforme : balcons et stores plus étroits avec l'accent « etroit ». */
export function largeurPlateforme(type, accents = []) {
  if (accents.includes('etroit')) {
    if (type === 'balcon') return 58;
    if (type === 'store') return 64;
  }
  return LARGEURS[type];
}

/** Nombre de pots par chute et de pigeons par vol selon le palier. */
export function nbPots(palier) {
  return palier >= 5 ? 3 : palier >= 2 ? 2 : 1;
}
export function nbPigeons(palier) {
  return palier >= 6 ? 3 : palier >= 2 ? 2 : 1;
}

/** Force maximale du vent selon le palier : nulle au palier 0, +6 % par palier, plafonnée. */
export function ventMax(palier) {
  if (palier < 1) return 0;
  return VENT_MAX * (1 + Math.min(VENT_BONUS_MAX, (palier - 1) * 0.06));
}

/** Réglages des pièges à une hauteur donnée (sert au jeu et aux tests). */
export function reglagesPieges(hauteur) {
  const d = difficulte(hauteur);
  const pal = palierDe(hauteur);
  const k = surcharge(pal);
  return {
    d,
    palier: pal,
    ecarts: ecarts(d, pal),
    intervallePot: lerp(4.5, 1.9, d) / (1 + k),
    vitessePot: lerp(340, 560, d) * (1 + k * 0.5),
    alertePot: Math.max(ALERTE_MIN, lerp(0.9, 0.6, d)),
    intervallePigeon: lerp(6, 2.4, d) / (1 + k),
    vitessePigeon: lerp(150, 270, d) * (1 + k * 0.4),
    vitesseNacelle: Math.min(V_NACELLE_MAX, lerp(80, 190, d) * (pal >= 4 ? 1.25 : 1) * (1 + k * 0.5)),
    nbPots: nbPots(pal),
    nbPigeons: nbPigeons(pal),
    vent: ventMax(pal),
  };
}

/** Palier atteint (tous les ETAGES_PALIER étages) : 0, 1, 2... */
export function palierDe(hauteur) {
  return Math.floor(Math.max(0, hauteur) / (ETAGE * ETAGES_PALIER));
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

/** Écart vertical entre deux plateformes de la chaîne, selon la difficulté et le palier. */
export function ecarts(d, palier = 0) {
  const haut = Math.min(ECART_MIN_MAX_RATIO, 0.68 + 0.02 * Math.max(0, palier));
  return {
    min: lerp(48, haut * H_SAUT, d),
    max: Math.min(ECART_MAX_RATIO * H_SAUT, lerp(84, ECART_MAX_RATIO * H_SAUT, d)),
  };
}

/** Hasard reproductible (tests). */
export function hasardGraine(graine = 1) {
  let a = graine >>> 0;
  return function hasard() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance horizontale en tenant compte du passage d'un bord à l'autre. */
export function dxBoucle(a, b) {
  const d = Math.abs(a - b) % MONDE_L;
  return Math.min(d, MONDE_L - d);
}

/** Probabilités des types de la chaîne (sert au jeu et aux tests). */
export function probasTypes(d, hauteur, accents = []) {
  const pal = palierDe(hauteur);
  const pMonte = hauteur > 1500 ? 0.01 : 0;
  const pTrampo = hauteur > 400 ? Math.max(0.015, 0.04 - 0.005 * pal) : 0;
  let pStore = hauteur > 300 ? Math.min(0.45, lerp(0.08, 0.36, d) + 0.03 * pal) : 0;
  let pNacelle = hauteur > 200 ? Math.min(0.45, lerp(0.08, 0.34, d) + 0.03 * pal) : 0;
  if (accents.includes('fragile')) pStore = Math.max(pStore, 0.6);
  if (accents.includes('nacelles')) pNacelle = Math.max(pNacelle, 0.6);
  const reste = 0.92 - pMonte - pTrampo;
  if (pStore + pNacelle > reste) {
    const f = reste / (pStore + pNacelle);
    pStore *= f;
    pNacelle *= f;
  }
  return { pMonte, pTrampo, pStore, pNacelle };
}

function choisirType(d, hauteur, r, accents) {
  const x = r();
  const { pMonte, pTrampo, pStore, pNacelle } = probasTypes(d, hauteur, accents);
  if (x < pMonte) return 'monte';
  if (x < pMonte + pTrampo) return 'trampo';
  if (x < pMonte + pTrampo + pStore) return 'store';
  if (x < pMonte + pTrampo + pStore + pNacelle) return 'nacelle';
  return 'balcon';
}

/** Accents du niveau à une hauteur (base de reprise comprise). */
function accentsA(e, hEff) {
  return accentsNiveau(palierDe(hEff), e.ordre || ACCENTS);
}

function creerPlateforme(e, type, x, y, chaine, hEff = y, accents = [], l = LARGEURS[type]) {
  const p = { id: e.idSuivant++, type, x, y, l, chaine, dechire: false, vy: 0, rot: 0 };
  if (type === 'nacelle') {
    const d = difficulte(hEff);
    const fort = accents.includes('nacelles');
    const amplitude = (fort ? lerp(100, 170, d) : lerp(60, 130, d)) + e.hasard() * 30;
    p.xMin = Math.max(0, x - amplitude);
    p.xMax = Math.min(MONDE_L - l, x + amplitude);
    const v = Math.min(V_NACELLE_MAX, reglagesPieges(hEff).vitesseNacelle * (fort ? 1.15 : 1));
    p.vx = (e.hasard() < 0.5 ? -1 : 1) * v;
  }
  e.plateformes.push(p);
  return p;
}

/** Ajoute des plateformes jusqu'à la hauteur yMax. */
export function genererJusqua(e, yMax) {
  const r = e.hasard;
  while (e.prochainY < yMax) {
    const y = e.prochainY;
    const hEff = y + (e.hBase || 0);
    const d = difficulte(hEff);
    const pal = palierDe(hEff);
    const acc = accentsA(e, hEff);
    // Bonus attendu : balcon fixe d'office, pour garder un bonus tous les 13 à 22 étages.
    const bonusDu = y >= e.prochainBonus && TYPES_BONUS.some((k) => y >= BONUS[k].des && k !== e.dernierBonus);
    const tire = choisirType(d, hEff, r, acc);
    const type = bonusDu ? 'balcon' : tire;
    const l = largeurPlateforme(type, acc);
    let x = r() * (MONDE_L - l);
    // Zigzag : la plateforme suivante part loin de l'autre côté (toujours atteignable, la façade boucle).
    const pZig = dose('zigzag', pal, acc);
    if (pZig > 0 && e.dernierCentre != null && r() < pZig) {
      const decal = (110 + r() * 70) * (r() < 0.5 ? -1 : 1);
      const centre = (((e.dernierCentre + decal) % MONDE_L) + MONDE_L) % MONDE_L;
      x = Math.max(0, Math.min(MONDE_L - l, centre - l / 2));
    }
    const p = creerPlateforme(e, type, x, y, true, hEff, acc, l);
    e.dernierCentre = x + l / 2;
    const dispo = type === 'balcon' && y >= e.prochainBonus
      ? TYPES_BONUS.filter((k) => y >= BONUS[k].des && k !== e.dernierBonus)
      : [];
    if (dispo.length) {
      // Bonus posé au-dessus d'un balcon fixe de la chaîne : toujours atteignable.
      const genre = dispo[Math.floor(r() * dispo.length)];
      e.bonusListe.push({ id: e.idSuivant++, type: genre, x: p.x + l / 2, y: y + 40, pris: false });
      e.dernierBonus = genre;
      e.prochainBonus = y + lerp(BONUS_ECART_MIN, BONUS_ECART_MAX, r());
    } else if ((type === 'balcon' || type === 'nacelle') && r() < 0.12) {
      e.colisListe.push({ id: e.idSuivant++, x: p.x + l / 2, y: y + 34, pris: false });
    }
    const { min, max } = ecarts(d, pal);
    const ecart = lerp(min, max, r());
    // Leurre ou appui de plus entre deux plateformes de la chaîne (que des stores avec « fragile »).
    if (ecart > 55 && r() < lerp(0.3, 0.6, d)) {
      const leurre = r() < lerp(0.4, 0.85, d) || acc.includes('fragile') ? 'store' : 'balcon';
      const ll = largeurPlateforme(leurre, acc);
      let lx = r() * (MONDE_L - ll);
      if (Math.abs(lx - x) < ll + 12) lx = (x + MONDE_L / 2) % (MONDE_L - ll);
      const ly = y + ecart * lerp(0.35, 0.65, r());
      creerPlateforme(e, leurre, lx, ly, false, ly + (e.hBase || 0), acc, ll);
    }
    // Colis isolé en l'air, à aller chercher.
    if (y > 500 && r() < 0.05) {
      e.colisListe.push({ id: e.idSuivant++, x: 30 + r() * (MONDE_L - 60), y: y + ecart * 0.5, pris: false });
    }
    e.prochainY = y + ecart;
  }
}

/**
 * Partie neuve : le livreur part du trottoir. `visibleH` : hauteur d'écran en unités.
 * `hBase` : hauteur déjà montée avant une reprise (garde la difficulté du niveau).
 */
export function partieNeuve(visibleH = 640, hasard = Math.random, hBase = 0) {
  const e = {
    hBase: Math.max(0, Number(hBase) || 0),
    ordre: ordreAccents(hasard),
    dernierCentre: null,
    phase: 'jeu', // jeu | chute | fin
    joueur: { x: MONDE_L / 2, y: 0, vx: 0, vy: V_SAUT, regard: 1, rot: 0 },
    cam: 0,
    visibleH,
    hautMax: 0,
    colis: 0,
    score: 0,
    etage: 0,
    etageBase: 0, // étages déjà gagnés avant une reprise de partie
    plateformes: [],
    colisListe: [],
    pots: [],
    pigeons: [],
    bonusListe: [],
    prochainBonus: 650,
    dernierBonus: null,
    aimant: 0, // secondes restantes de chaque bonus
    casque: 0,
    filet: 0,
    invuln: 0,
    hasard,
    idSuivant: 1,
    prochainY: 70,
    minPot: 4,
    minPigeon: 6,
    palier: 0,
    annonce: 0,
    vent: 0,
    cause: null,
    t: 0,
  };
  e.plateformes.push({ id: e.idSuivant++, type: 'sol', x: 0, y: 0, l: MONDE_L, chaine: true, dechire: false, vy: 0, rot: 0 });
  genererJusqua(e, visibleH * 2);
  return e;
}

/** Un pas de physique du livreur seul (servira aussi aux tests). */
export function pasJoueur(j, dir, dt, vent = 0) {
  if (dir !== 0) {
    const inverse = j.vx * dir < 0;
    j.vx += dir * ACC_X * (inverse ? 1.6 : 1) * dt;
    j.regard = dir;
  } else {
    j.vx *= Math.exp(-7 * dt);
  }
  j.vx += vent * dt;
  if (j.vx > VX_MAX) j.vx = VX_MAX;
  if (j.vx < -VX_MAX) j.vx = -VX_MAX;
  j.x += j.vx * dt;
  if (j.x < 0) j.x += MONDE_L;
  if (j.x >= MONDE_L) j.x -= MONDE_L;
  j.vy -= GRAVITE * dt;
  j.y += j.vy * dt;
}

/**
 * Le livreur, parti d'un rebond normal, peut-il se poser sur une plateforme
 * `ecart` plus haut, décalée de `dx` (après passage de bord), de largeur `l` ?
 */
export function peutAtteindre(ecart, dx, l = LARGEURS.nacelle, vent = 0) {
  const j = { x: 0, y: 0, vx: 0, vy: V_SAUT, regard: 1 };
  const cible = dx;
  for (let i = 0; i < 2000; i += 1) {
    const avant = j.y;
    const reste = ((cible - j.x + 1.5 * MONDE_L) % MONDE_L) - MONDE_L / 2;
    const dir = Math.abs(reste) < (vent ? 0.5 : 2) ? 0 : Math.sign(reste);
    pasJoueur(j, dir, PAS, vent);
    if (j.vy < 0 && avant >= ecart && j.y <= ecart && dxBoucle(j.x, cible) <= l / 2 + PIED) return true;
    if (j.vy < 0 && j.y < ecart) return false;
  }
  return false;
}

/** Casque : pare un coup (pot ou pigeon) puis laisse un court répit. */
function proteger(e, evts) {
  if (e.invuln > 0) return true;
  if (e.casque <= 0) return false;
  e.casque = 0;
  e.invuln = INVULNERABLE;
  evts.push('protege');
  return true;
}

/** Aimant : un colis proche glisse vers le livreur (passage de bord compris). */
function attirer(c, j, h) {
  const dx = ((j.x - c.x + 1.5 * MONDE_L) % MONDE_L) - MONDE_L / 2;
  const dy = j.y + JOUEUR_H / 2 - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist > RAYON_AIMANT || dist < 1) return;
  const pas = Math.min(dist, V_AIMANT * h);
  c.x += (dx / dist) * pas;
  c.y += (dy / dist) * pas;
  if (c.x < 0) c.x += MONDE_L;
  if (c.x >= MONDE_L) c.x -= MONDE_L;
}

/** Bonus restants à sauvegarder (pause, sortie) et à restaurer (reprise). */
export function bonusActifs(e) {
  const out = {};
  for (const k of TYPES_BONUS) out[k] = Math.max(0, Math.round((e[k] || 0) * 10) / 10);
  return out;
}
export function restaurerBonus(e, sauves) {
  if (!sauves || typeof sauves !== 'object') return e;
  for (const k of TYPES_BONUS) {
    const v = Number(sauves[k]);
    e[k] = Number.isFinite(v) ? Math.max(0, Math.min(BONUS[k].duree, v)) : 0;
  }
  return e;
}

function rebondir(e, v) {
  e.joueur.vy = v;
}

function toucheCorps(j, cx, cy, demiL, demiH) {
  return Math.abs(j.x - cx) < JOUEUR_L / 2 + demiL - 4
    && j.y < cy + demiH && j.y + JOUEUR_H > cy - demiH;
}

/**
 * Avance la partie de dt secondes (borné). `dir` : -1 gauche, 0, 1 droite.
 * Rend la liste des événements de l'image : 'rebond', 'trampo', 'monte',
 * 'store', 'colis', 'pigeon', 'palier', 'touche', 'fin', plus les bonus
 * 'aimant', 'casque', 'filet' (ramassés), 'protege' (coup paré par le
 * casque) et 'sauve' (chute rattrapée par le filet).
 */
export function avancer(e, dtBrut, dir) {
  const evts = [];
  if (e.phase === 'fin') return evts;
  // Jeu ralenti : tout le monde avance à 70 % du temps réel.
  let dt = Math.min(DT_MAX, Math.max(0, dtBrut || 0)) * RALENTI;
  const r = e.hasard;
  const j = e.joueur;
  while (dt > 1e-6) {
    const h = Math.min(PAS, dt);
    dt -= h;
    e.t += h;

    // Plateformes mobiles et stores déchirés.
    for (const p of e.plateformes) {
      if (p.type === 'nacelle') {
        p.x += p.vx * h;
        if (p.x < p.xMin) { p.x = p.xMin; p.vx = Math.abs(p.vx); }
        if (p.x > p.xMax) { p.x = p.xMax; p.vx = -Math.abs(p.vx); }
      }
      if (p.dechire) {
        p.vy -= GRAVITE * 0.7 * h;
        p.y += p.vy * h;
        p.rot += 160 * h;
      }
    }

    const piedsAvant = j.y;
    e.vent = Math.sin(e.t * 0.7) * ventMax(e.palier);
    if (e.aimant > 0) e.aimant = Math.max(0, e.aimant - h);
    if (e.casque > 0) e.casque = Math.max(0, e.casque - h);
    if (e.filet > 0) e.filet = Math.max(0, e.filet - h);
    if (e.invuln > 0) e.invuln = Math.max(0, e.invuln - h);
    // Vent retiré du livreur (15/11/2026) : invisible, il le faisait glisser
    // tout seul plusieurs secondes d'un côté dès que le doigt s'arrêtait.
    pasJoueur(j, e.phase === 'jeu' ? dir : 0, h, 0);
    if (e.annonce > 0) e.annonce -= h;
    if (e.phase === 'chute') j.rot += 500 * h;

    if (e.phase === 'jeu') {
      // Rebond sur une plateforme, seulement en descendant et par le dessus.
      if (j.vy < 0) {
        for (const p of e.plateformes) {
          if (p.dechire) continue;
          if (piedsAvant >= p.y && j.y <= p.y && dxBoucle(j.x, p.x + p.l / 2) <= p.l / 2 + PIED) {
            j.y = p.y;
            if (p.type === 'trampo') { rebondir(e, V_TRAMPO); evts.push('trampo'); }
            else if (p.type === 'monte') { rebondir(e, V_MONTE); evts.push('monte'); }
            else { rebondir(e, V_SAUT); evts.push('rebond'); }
            if (p.type === 'store') { p.dechire = true; p.vy = 0; evts.push('store'); }
            break;
          }
        }
      }

      // Colis (attirés par l'aimant quand il est actif).
      for (const c of e.colisListe) {
        if (!c.pris && e.aimant > 0) attirer(c, j, h);
        if (!c.pris && dxBoucle(j.x, c.x) < JOUEUR_L / 2 + 12 && j.y < c.y + 14 && j.y + JOUEUR_H > c.y - 14) {
          c.pris = true;
          e.colis += 1;
          evts.push('colis');
        }
      }

      // Bonus.
      for (const b of e.bonusListe) {
        if (!b.pris && dxBoucle(j.x, b.x) < JOUEUR_L / 2 + 14 && j.y < b.y + 16 && j.y + JOUEUR_H > b.y - 16) {
          b.pris = true;
          e[b.type] = BONUS[b.type].duree;
          evts.push(b.type);
        }
      }

      // Pigeons : rebond par le dessus, sinon fin (sauf casque).
      for (const g of e.pigeons) {
        if (g.mort) continue;
        if (j.vy < 0 && piedsAvant >= g.y && j.y <= g.y + 10 && Math.abs(j.x - g.x) < 17 + PIED) {
          g.mort = true;
          j.y = Math.max(j.y, g.y);
          rebondir(e, V_SAUT);
          evts.push('pigeon');
        } else if ((g.vu ?? PIGEON_VU_MIN) >= PIGEON_VU_MIN && toucheCorps(j, g.x, g.y, 16, 9)) {
          if (proteger(e, evts)) { g.mort = true; g.vyMort = 0; continue; }
          e.phase = 'chute';
          e.cause = 'pigeon';
          j.vy = Math.min(j.vy, 200);
          evts.push('touche');
        }
      }

      // Pots de fleurs.
      for (const pot of e.pots) {
        if (pot.alerte <= 0 && !pot.casse && toucheCorps(j, pot.x, pot.y, 12, 13)) {
          if (proteger(e, evts)) { pot.casse = true; continue; }
          e.phase = 'chute';
          e.cause = 'pot';
          j.vy = Math.min(j.vy, 0);
          evts.push('touche');
        }
      }

      // Caméra : monte seulement.
      if (e.phase === 'jeu') {
        const visee = j.y - e.visibleH * 0.45;
        if (visee > e.cam) e.cam = visee;
        if (j.y > e.hautMax) e.hautMax = j.y;
        const pal = palierDe(e.hautMax);
        if (pal > e.palier) {
          e.palier = pal;
          e.annonce = DUREE_ANNONCE;
          evts.push('palier');
        }
      }
    }

    // Gêneurs.
    const haut = e.cam + e.visibleH;
    for (const pot of e.pots) {
      if (pot.alerte > 0) {
        pot.alerte -= h;
        pot.y = haut + 30;
      } else {
        pot.y += pot.vy * h;
      }
    }
    for (const g of e.pigeons) {
      if (g.mort) { g.vyMort -= GRAVITE * h; g.y += g.vyMort * h; }
      else {
        g.x += g.vx * h;
        // Pigeon qui ondule (accent « vague »).
        if (g.amp) g.y = g.y0 + g.amp * Math.sin(g.w * e.t + g.phase);
        if (g.vu !== undefined && g.x >= 0 && g.x <= MONDE_L) g.vu += h;
      }
    }
    if (e.phase === 'jeu') {
      // Réglages selon la hauteur réelle du niveau (base de reprise comprise) ;
      // le répit du départ, lui, se compte depuis le trottoir.
      const hEff = e.hautMax + (e.hBase || 0);
      const reg = reglagesPieges(hEff);
      const acc = accentsA(e, hEff);
      if (e.hautMax > DEBUT_POTS) {
        e.minPot -= h;
        if (e.minPot <= 0) {
          e.minPot = reg.intervallePot * (0.7 + r() * 0.6);
          const pRideau = dose('rideau', reg.palier, acc);
          if (pRideau > 0 && r() < pRideau) {
            // Rideau : 8 pots en ligne, deux voisins manquent, le trou laisse passer le livreur.
            const trou = Math.floor(r() * 8);
            for (let k = 0; k < 8; k += 1) {
              if (k === trou || k === (trou + 1) % 8) continue;
              e.pots.push({ id: e.idSuivant++, x: 22.5 + 45 * k, y: haut + 30, vy: -reg.vitessePot, alerte: Math.max(ALERTE_RIDEAU, reg.alertePot), casse: false });
            }
            e.minPot *= 1.3;
          } else {
            const pVisee = dose('visee', reg.palier, acc);
            for (let k = 0; k < reg.nbPots; k += 1) {
              const vise = k === 0 && pVisee > 0 && r() < pVisee;
              const x = vise
                ? Math.max(24, Math.min(MONDE_L - 24, j.x + (r() - 0.5) * 50))
                : 24 + r() * (MONDE_L - 48);
              e.pots.push({ id: e.idSuivant++, x, y: haut + 30, vy: -reg.vitessePot, alerte: reg.alertePot, casse: false });
            }
          }
        }
      }
      if (e.hautMax > DEBUT_PIGEONS) {
        e.minPigeon -= h;
        if (e.minPigeon <= 0) {
          e.minPigeon = reg.intervallePigeon * (0.7 + r() * 0.6);
          const pNuee = dose('nuee', reg.palier, acc);
          const pVague = dose('vague', reg.palier, acc);
          const nuee = pNuee > 0 && r() < pNuee;
          const gaucheD = r() < 0.5;
          // Nuée : un vol de chaque côté à la fois, à deux hauteurs bien séparées.
          const vols = nuee ? [gaucheD, !gaucheD] : [gaucheD];
          const nb = nuee ? Math.max(1, reg.nbPigeons - 1) : reg.nbPigeons;
          vols.forEach((gauche, v) => {
            const yv = e.cam + e.visibleH * (nuee ? (v === 0 ? lerp(0.5, 0.6, r()) : lerp(0.75, 0.85, r())) : lerp(0.5, 0.85, r()));
            const vague = pVague > 0 && r() < pVague;
            for (let k = 0; k < nb; k += 1) {
              const g = {
                id: e.idSuivant++,
                x: (gauche ? -30 : MONDE_L + 30) + (gauche ? -1 : 1) * k * 70,
                y: yv,
                vx: (gauche ? 1 : -1) * reg.vitessePigeon,
                regard: gauche ? 1 : -1,
                mort: false,
                vyMort: 0,
                vu: 0,
              };
              if (vague) {
                g.y0 = yv;
                g.amp = 35 + r() * 25;
                g.w = 2 + r();
                g.phase = k * 1.2;
              }
              e.pigeons.push(g);
            }
          });
        }
      }
    }

    // Fin : sous le bas de l'écran.
    if (j.y + JOUEUR_H < e.cam - 20) {
      if (e.phase === 'jeu' && e.filet > 0) {
        // Filet de sécurité : il rattrape le livreur une fois et le relance très haut.
        e.filet = 0;
        j.y = e.cam - 10;
        j.vy = V_MONTE;
        evts.push('sauve');
        continue;
      }
      e.phase = 'fin';
      if (!e.cause) e.cause = 'chute';
      evts.push('fin');
      break;
    }
  }

  // Recyclage : ce qui est passé sous l'écran disparaît, la suite est générée.
  const bas = e.cam - 120;
  e.plateformes = e.plateformes.filter((p) => p.y > bas);
  e.colisListe = e.colisListe.filter((c) => !c.pris && c.y > bas);
  e.pots = e.pots.filter((p) => p.y > bas);
  e.bonusListe = e.bonusListe.filter((b) => !b.pris && b.y > bas);
  e.pigeons = e.pigeons.filter((g) => g.y > bas && g.x > -160 && g.x < MONDE_L + 160);
  genererJusqua(e, e.cam + e.visibleH * 1.6);

  e.etage = Math.floor(e.hautMax / ETAGE) + (e.etageBase || 0);
  e.score = e.etage + e.colis * POINTS_COLIS;
  return evts;
}

// ---------------------------------------------------------------------------
// Enregistrement de la partie
// ---------------------------------------------------------------------------

const PHASES = ['accueil', 'jeu', 'pause', 'fin'];
/** Plafond de vraisemblance : 50 étages et au plus ~130 colis par niveau. */
export const SCORE_MAX_PAR_NIVEAU = 700;

/** Niveau affiché : un niveau par palier de 50 étages, à partir de 1. */
export function niveauSommet(etage) {
  return Math.floor(Math.max(0, Number(etage) || 0) / ETAGES_PALIER) + 1;
}

/** Ce qu'il faut garder d'une course pour la reprendre plus tard. */
export function instantaneCourse(e) {
  if (!e) return null;
  return {etage: entierJeu(e.etage), colis: entierJeu(e.colis), score: entierJeu(e.score), bonus: bonusActifs(e)};
}

/** Reprise : le livreur repart du trottoir avec ses étages, colis et bonus. */
export function reprendreCourse(sauvee, visibleH = 640, hasard = Math.random) {
  const base = sauvee && typeof sauvee === 'object' ? entierJeu(sauvee.etage) * ETAGE : 0;
  const e = partieNeuve(visibleH, hasard, base);
  if (sauvee && typeof sauvee === 'object') {
    e.etageBase = entierJeu(sauvee.etage);
    e.colis = entierJeu(sauvee.colis);
    e.etage = e.etageBase;
    e.score = e.etageBase + e.colis * POINTS_COLIS;
    restaurerBonus(e, sauvee.bonus);
  }
  return e;
}

/** Sauvegarde neuve (écran d'accueil), records gardés. */
export function sauvegardeNeuve(records = {}) {
  return {
    phase: 'accueil',
    course: null,
    meilleurScore: entierJeu(records.meilleurScore),
    meilleurNiveau: Math.max(1, entierJeu(records.meilleurNiveau, 1)),
  };
}

/**
 * Relit une sauvegarde : toute valeur abîmée est remplacée par une valeur
 * sûre, jamais de plantage. Une partie en cours revient en pause.
 */
export function nettoyerSauvegarde(brut) {
  try {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return sauvegardeNeuve();
    const base = sauvegardeNeuve(brut);
    let phase = PHASES.includes(brut.phase) ? brut.phase : 'accueil';
    if (phase === 'jeu') phase = 'pause';
    let course = null;
    const c = brut.course;
    if ((phase === 'pause') && c && typeof c === 'object') {
      const etage = entierJeu(c.etage);
      const niveau = niveauSommet(etage);
      const colis = Math.min(entierJeu(c.colis), Math.floor((SCORE_MAX_PAR_NIVEAU * niveau - etage) / POINTS_COLIS));
      const bonus = {};
      for (const k of TYPES_BONUS) {
        const v = Number(c.bonus?.[k]);
        bonus[k] = Number.isFinite(v) ? Math.max(0, Math.min(BONUS[k].duree, v)) : 0;
      }
      course = {etage, colis: Math.max(0, colis), score: etage + Math.max(0, colis) * POINTS_COLIS, bonus};
    }
    if (phase === 'pause' && !course) phase = 'accueil';
    const score = course ? course.score : 0;
    return {
      ...base,
      phase,
      course,
      meilleurScore: Math.max(base.meilleurScore, score),
      meilleurNiveau: Math.max(base.meilleurNiveau, course ? niveauSommet(course.etage) : 1),
    };
  } catch (e) {
    return sauvegardeNeuve();
  }
}

/** Une partie par compte livreur sur le téléphone (clé de utils/jeux/commun.js). */
export function cleSauvegarde(idUser) {
  return cleSauvegardeJeu(JEU_SOMMET, idUser);
}

export async function chargerPartie(cle) {
  try {
    const texte = await AsyncStorage.getItem(cle);
    if (!texte) return sauvegardeNeuve();
    let brut = null;
    try {
      brut = JSON.parse(texte);
    } catch (e) {
      brut = null;
    }
    const propre = nettoyerSauvegarde(brut);
    if (!brut || typeof brut !== 'object') enregistrerPartie(cle, propre);
    return propre;
  } catch (e) {
    return sauvegardeNeuve();
  }
}

export async function enregistrerPartie(cle, etat) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(etat));
  } catch (e) {
    // Mémoire pleine ou indisponible : la partie continue, nouvel essai plus tard.
  }
}

/**
 * Commande au doigt. Doigt posé sur la moitié gauche de l'écran (`cote` -1)
 * ou droite (1) : le livreur part aussitôt de ce côté, tant que le doigt reste
 * posé ; doigt levé, tout droit. Un balayage à gauche ou à droite lance un grand écart :
 * le livreur part de ce côté pendant au moins `ELAN_DOIGT` secondes, même si
 * le doigt se lève aussitôt. Tant que le doigt glisse, il continue de ce
 * côté ; une fois l'élan fini, doigt levé OU doigt arrêté plus de
 * `IMMOBILE_DOIGT` secondes (ou simple appui), il repart tout droit.
 * Le point d'ancrage suit le doigt à `SEUIL_DOIGT` points : revenir un peu en
 * arrière redresse, revenir plus franchement change de côté (nouvel élan).
 *
 *   const d = doigtPose(0, cote);   // au contact, cote -1, 0 ou 1
 *   doigtGlisse(d, g.dx);           // à chaque mouvement, rend -1, 0 ou 1
 *   doigtLeve(d);                   // au relâché
 *   doigtAvance(d, dt);             // à chaque image : direction à appliquer
 */
// 30 (15 points pour partir) : à 18, un frôlement de 9 points au premier
// appui lançait déjà le grand écart (15/11/2026).
export const SEUIL_DOIGT = 30;
export const ELAN_DOIGT = 0.35;
export const IMMOBILE_DOIGT = 0.15;

export function doigtPose(x = 0, cote = 0) {
  return { ancre: x, dir: cote, cote, pose: true, elan: 0, dernierX: x, immobile: 0 };
}

export function doigtGlisse(d, x, seuil = SEUIL_DOIGT) {
  // Appui sur un côté : un petit tremblement ne change rien, un vrai glissé prend la main.
  if (d.cote) {
    if (Math.abs(x - d.ancre) < seuil) return d.dir;
    d.cote = 0;
    d.dir = 0; // le glissé lance son propre grand écart, même du côté de l'appui
  }
  if (Math.abs(x - d.dernierX) >= 2) {
    d.dernierX = x;
    d.immobile = 0;
  }
  if (x - d.ancre > seuil) d.ancre = x - seuil;
  else if (d.ancre - x > seuil) d.ancre = x + seuil;
  const ecart = x - d.ancre;
  const dir = ecart >= seuil / 2 ? 1 : ecart <= -seuil / 2 ? -1 : 0;
  if (dir !== 0 && dir !== d.dir) d.elan = ELAN_DOIGT;
  d.dir = dir;
  return d.dir;
}

export function doigtLeve(d) {
  if (!d) return 0;
  d.pose = false;
  if (d.cote || d.elan <= 0) d.dir = 0;
  return d.dir;
}

export function doigtAvance(d, dt) {
  if (!d) return 0;
  if (d.cote) return d.pose ? d.dir : 0;
  if (d.elan > 0) d.elan -= dt;
  d.immobile += dt;
  if (d.elan <= 0 && (!d.pose || d.immobile > IMMOBILE_DOIGT)) d.dir = 0;
  return d.dir;
}
