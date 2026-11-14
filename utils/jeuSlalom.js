/**
 * Mini-jeu « Slalom urbain » en 3D : parcours, physique, collisions, police,
 * boosters, reprise de la course.
 *
 * Logique pure (sans React) : l'écran screens/JeuSlalomScreen.js l'utilise,
 * le rendu en perspective est dans components/SceneSlalom3D.js.
 *
 * Course sans fin dans une rue commerçante : le livreur court sur 3 voies, la
 * caméra est derrière lui. Glisser à gauche ou à droite change de voie, vers
 * le haut il saute, vers le bas il se baisse (en l'air : il redescend vite).
 *
 * Unités : mètres et secondes. `d` = distance parcourue. Chaque objet a une
 * position `z` sur la route ; sa distance devant le coureur est
 * zRelatif = (z - d) * (1 + r), où `r` vaut 0 pour un objet arrêté et
 * r > 0 pour un véhicule qui arrive en face (il croise le coureur quand
 * d = z). Tout ne dépend donc que de `d` : le rendu se calcule à partir de
 * la seule distance, et la reprise retrouve exactement le même parcours.
 *
 * Obstacles qui traversent la rue (mamies, passants, voitures de gauche à
 * droite ou de droite à gauche) : leur position latérale ne dépend aussi que
 * de `d`, par le temps de jeu tempsPour(d) (voir xMobile). Un passant part du
 * trottoir au moment voulu pour croiser le coureur dans sa voie.
 *
 * Choc et police : le premier choc ne termine pas la course. Le coureur
 * trébuche (ralenti un instant), l'obstacle s'écarte et un policier le
 * poursuit pendant 10 secondes. Un second choc pendant ces 10 secondes met
 * fin à la partie (arrêté par la police). Sans nouveau choc, le policier
 * s'essouffle et disparaît. Le casque absorbe un choc sans police.
 *
 * Boosters (jauge de temps) : turbo, super saut, points doublés, aimant,
 * casque. Objets à ramasser : sacs d'achat (5 points) et étoiles (25 points).
 *
 * Score = mètres parcourus + points d'objets (doublés avec le x2). Niveau =
 * 1 + un par tranche de 500 m. Le score reste sous 500 x niveau x 21 : la
 * fréquence des objets est réglée pour rester très en dessous de 21 points
 * par mètre (voir pointsMaxObjets), même plafond que le jeu de l'app client.
 * L'état de course est modifié sur place (boucle à 60 images par seconde).
 */
export const VERSION = 3;
export const VOIES = 3;
export const LARGEUR_VOIE = 2.2; // m
export const VUE = 80; // m visibles devant le coureur
export const GENERE_DEVANT = VUE + 25; // m générés devant le coureur
export const DERRIERE = 9; // m gardés derrière le coureur (la caméra est à 7 m)
export const DEMI_JOUEUR = 0.4; // demi-longueur du coureur (m)
export const DEMI_LARGE_JOUEUR = 0.35; // demi-largeur du coureur (m)
export const H_DEBOUT = 1.75;
export const H_ACCROUPI = 0.8;
export const HAUTEUR_SAUT = 2.0;
export const FACTEUR_SUPER_SAUT = 1.8;
export const DUREE_SAUT = 0.74; // s, au départ (le saut raccourcit quand on va vite)
export const VITESSE_PLONGEON = 26; // m/s vers le bas (glisser vers le bas en l'air)
export const DUREE_ACCROUPI = 0.62; // s
export const VITESSE_VOIE = 6; // voies par seconde
export const MARCHE = 0.45; // m : hauteur qu'on gravit sans sauter (rampe, bord d'un toit)
export const PAS_MAX = 0.25; // m par sous-pas (aucun obstacle fin n'est traversé)
export const POINTS_SAC = 5;
export const POINTS_ETOILE = 25;
export const MAX_PAR_METRE = 21; // limite du serveur : score <= 500 x niveau x 21
export const LONGUEUR_NIVEAU = 500; // m
export const DUREE_POLICE = 10; // s de poursuite après le premier choc
export const DUREE_TREBUCHE = 0.55; // s
export const FREIN_TREBUCHE = 0.55; // la vitesse tombe à ce facteur pendant le trébuchement
export const INVINCIBLE_CHOC = 1.1; // s après un choc (le temps de dépasser le groupe d'obstacles)
export const INVINCIBLE_REPRISE = 0.6; // s
export const DUREES_BONUS = {turbo: 6, superSaut: 12, double: 12, aimant: 10, casque: 15};
export const FACTEUR_TURBO = 1.35;
export const PORTEE_AIMANT = 14; // m (rendu : les objets glissent vers le coureur)
export const BONUS = ['turbo', 'superSaut', 'double', 'aimant', 'casque'];
const DEPART = 45; // premiers mètres sans obstacle
const PROBA_ETOILE = 0.3; // part des files d'objets qui contiennent une étoile (une seule par file)

const V0 = 10;
const KV = 0.32;
const VMAX = 27;

/** Vitesse de base (m/s) selon la distance : 10 au départ, 27 au plus. */
export function vitessePour(d) {
  return Math.min(VMAX, V0 + KV * Math.sqrt(Math.max(0, d)));
}

/**
 * Temps de jeu (s) pour atteindre la distance d à la vitesse de base :
 * intégrale de dd / vitessePour(dd). Les passants se déplacent selon ce
 * temps, donc selon la seule distance.
 */
export function tempsPour(d) {
  const dd = d > 0 ? d : 0;
  const ucap = (VMAX - V0) / KV;
  const u = Math.sqrt(dd);
  const integrale = U => (2 / KV) * (U - (V0 / KV) * Math.log(1 + (KV * U) / V0));
  if (u <= ucap) return integrale(u);
  return integrale(ucap) + (dd - ucap * ucap) / VMAX;
}

/**
 * Obstacles. `h` : hauteur pleine depuis le sol (sauter par-dessus) ;
 * `bas`/`haut` : bande suspendue (se baisser, ou sauter) ; `toit` : on peut
 * monter dessus ; `pente` : rampe. `mobile` : traverse la rue (vx en voies
 * par seconde, depart = distance de départ au-delà du bord, en voies,
 * demi = demi-largeur en mètres).
 */
export const OBSTACLES = {
  plot: {h: 0.75, longueur: 0.5},
  barriere: {h: 1.0, longueur: 0.4},
  barrierePied: {bas: 0.95, haut: 1.55, longueur: 0.4},
  echafaudage: {bas: 1.05, haut: 4.2, longueur: 1.2},
  voiture: {toit: true, h: 1.35, longueur: 4.5},
  camionnette: {toit: true, h: 2.6, longueur: 8.0},
  rampe: {toit: true, pente: true, h: 2.6, longueur: 4.0},
  ouvrier: {h: 1.95, longueur: 0.7},
  mamie: {mobile: true, h: 1.55, longueur: 0.5, demi: 0.3, vx: 0.42, depart: 1.4},
  passant: {mobile: true, h: 1.8, longueur: 0.5, demi: 0.3, vx: 0.95, depart: 1.4},
  voitureTraverse: {mobile: true, toit: true, h: 1.35, longueur: 1.9, demi: 2.25, vx: 2.6, depart: 2.9},
};

// Motifs de rangée : [difficulté minimale, poids, voies]. Les camionnettes
// sans rampe bloquent leur voie, tout le reste se franchit.
const MOTIFS = [
  [0, 3, ['plot', 'libre', 'libre']],
  [0, 3, ['barriere', 'libre', 'libre']],
  [0, 3, ['voiture', 'libre', 'libre']],
  [0, 3, ['mamie', 'libre', 'libre']],
  [0.02, 2, ['convoi', 'libre', 'libre']],
  [0.02, 2, ['passant', 'libre', 'libre']],
  [0.03, 2, ['barrierePied', 'libre', 'libre']],
  [0.03, 2, ['ouvrier', 'plot', 'libre']],
  [0.04, 2, ['echafaudage', 'libre', 'libre']],
  [0.05, 2, ['voitureTraverse', 'libre', 'libre']],
  [0.06, 2, ['voiture', 'voiture', 'libre']],
  [0.08, 2, ['camionnetteRampe', 'libre', 'libre']],
  [0.08, 2, ['mamie', 'passant', 'libre']],
  [0.1, 2, ['barriere', 'barriere', 'libre']],
  [0.12, 2, ['voiture', 'plot', 'barriere']],
  [0.12, 2, ['ouvrier', 'barriere', 'plot']],
  [0.14, 2, ['voitureMobile', 'libre', 'libre']],
  [0.15, 2, ['passant', 'passant', 'libre']],
  [0.16, 2, ['echafaudage', 'barrierePied', 'libre']],
  [0.18, 2, ['convoi', 'voiture', 'barriere']],
  [0.2, 2, ['camionnette', 'camionnetteRampe', 'libre']],
  [0.2, 2, ['passant', 'mamie', 'barriere']],
  [0.22, 2, ['barriere', 'barrierePied', 'barriere']],
  [0.25, 2, ['voitureMobile', 'voiture', 'libre']],
  [0.25, 2, ['voitureTraverse', 'libre', 'libre']],
  [0.28, 2, ['camionnette', 'echafaudage', 'camionnette']],
  [0.3, 2, ['camionnetteMobile', 'voiture', 'barriere']],
  [0.3, 2, ['ouvrier', 'ouvrier', 'barrierePied']],
  [0.32, 2, ['echafaudage', 'echafaudage', 'barriere']],
  [0.35, 2, ['camionnette', 'camionnetteRampe', 'camionnette']],
  [0.4, 2, ['voitureMobile', 'voitureMobile', 'barrierePied']],
  [0.4, 2, ['mamie', 'passant', 'ouvrier']],
  [0.45, 2, ['camionnetteMobile', 'camionnette', 'camionnetteRampe']],
  [0.5, 2, ['barriere', 'echafaudage', 'barrierePied']],
  [0.55, 2, ['voitureMobile', 'camionnetteMobile', 'echafaudage']],
];
const BLOQUANTS = ['camionnette', 'camionnetteMobile'];
// Pas d'objets à ramasser dans une voie où passe un véhicule ou un piéton.
const SANS_OBJETS = ['camionnette', 'camionnetteMobile', 'voitureMobile', 'mamie', 'passant', 'voitureTraverse', 'ouvrier'];

/** Durée d'un saut (s) : 0,74 au départ, plus vif à grande vitesse. */
export function dureeSaut(v) {
  return Math.max(0.44, DUREE_SAUT * Math.sqrt(10 / Math.max(10, v)));
}

/** Hauteur d'un saut (m) : 2 m, 3,6 m avec le super saut. */
export function hauteurSaut(e) {
  return HAUTEUR_SAUT * (e && e.superSaut > 0 ? FACTEUR_SUPER_SAUT : 1);
}

/** Pesanteur (m/s²) pour un saut de la hauteur voulue dans la durée voulue. */
export function gravitePour(v, hauteur = HAUTEUR_SAUT) {
  const t = dureeSaut(v);
  return (8 * hauteur) / (t * t);
}

/** Difficulté de 0 à 1 selon la distance (au maximum vers 2,4 km). */
export function difficulte(d) {
  return Math.max(0, Math.min(1, (d - DEPART) / 2400));
}

/** Niveau atteint (1 au départ, +1 tous les 500 m). */
export function niveauPour(d) {
  return 1 + Math.floor(Math.max(0, d) / LONGUEUR_NIVEAU);
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function hasardGraine(graine) {
  let a = (Math.floor(Number(graine)) || 1) >>> 0;
  return function hasard() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function nouvelleGraine(hasard = Math.random) {
  return 1 + Math.floor(hasard() * 2147483646);
}

function melanger(liste, hasard) {
  const l = liste.slice();
  for (let i = l.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

function choisir(liste, hasard) {
  return liste[Math.min(liste.length - 1, Math.floor(hasard() * liste.length))];
}

/** Motif d'une rangée (3 voies), tiré selon la difficulté. */
export function motifPour(diff, hasard) {
  const possibles = MOTIFS.filter(m => diff >= m[0]);
  const poids = possibles.map(m => m[1] * (m[0] === 0 ? Math.max(0.25, 1 - diff) : 1));
  const total = poids.reduce((s, p) => s + p, 0);
  let tirage = hasard() * total;
  let motif = possibles[0][2];
  for (let i = 0; i < possibles.length; i += 1) {
    tirage -= poids[i];
    if (tirage <= 0) {
      motif = possibles[i][2];
      break;
    }
  }
  return melanger(motif, hasard);
}

/** Vrai si au moins une voie de la rangée se franchit. */
export function rangeeFranchissable(motif) {
  return motif.some(m => !BLOQUANTS.includes(m));
}

export function creerGenerateur(graine) {
  return {hasard: hasardGraine(graine), z: DEPART, rangee: 0, reserve: [0, 0, 0], prochainBonus: 260, dernier: null};
}

function obstacle(id, type, voie, z, r, variante) {
  return {id, genre: 'obstacle', type, voie, z, r, variante, ...OBSTACLES[type]};
}

/**
 * Obstacle qui traverse la rue. Il part du trottoir (`x0`, en voies) au
 * moment où il faut pour être dans la voie visée quand le coureur arrive :
 * `tau` est l'instant (temps de jeu) du départ.
 */
function mobile(id, type, voie, z, variante, hasard) {
  const def = OBSTACLES[type];
  const sens = hasard() < 0.5 ? 1 : -1;
  // La voiture croise en laissant libre la voie d'où elle vient (elle s'en éloigne).
  const xi = type === 'voitureTraverse' ? (sens > 0 ? 1.85 : 0.15) : voie;
  const x0 = sens > 0 ? -def.depart : 2 + def.depart;
  const vx = def.vx * sens;
  const duree = (xi - x0) / vx;
  return {
    ...obstacle(id, type, voie, z, 0, variante),
    sens,
    vx,
    x0,
    tau: tempsPour(z) - duree,
  };
}

/** Position latérale (en voies, 1 = milieu) d'un obstacle qui traverse. */
export function xMobile(o, d) {
  const dt = tempsPour(d) - o.tau;
  const x = o.x0 + o.vx * (dt > 0 ? dt : 0);
  const fin = 2 - o.x0;
  return o.vx > 0 ? Math.min(x, fin) : Math.max(x, fin);
}

/** Hauteur d'un saut parfait centré sur l'obstacle, à la distance o du centre. */
function arcSaut(o, v) {
  const demi = (v * dureeSaut(v)) / 2;
  const k = Math.max(0, 1 - (o / demi) * (o / demi));
  return HAUTEUR_SAUT * k;
}

/**
 * Ajoute à `sortie` les objets de la rangée suivante (obstacles, sacs,
 * étoiles, boosters) et avance le générateur. Identifiants : rangée * 32 + n.
 */
export function genererRangee(gen, sortie) {
  const hasard = gen.hasard;
  const z = gen.z;
  const diff = difficulte(z);
  const v = vitessePour(z);
  const base = gen.rangee * 32;
  let motif = motifPour(diff, hasard);
  // Voie réservée (un véhicule en face la remonte) : rien dedans.
  motif = motif.map((m, voie) => (gen.reserve[voie] > z ? 'libre' : m));
  // La voiture qui traverse occupe toute la rue : le reste de la rangée est libre.
  if (motif.includes('voitureTraverse')) motif = motif.map(m => (m === 'voitureTraverse' ? m : 'libre'));
  if (!rangeeFranchissable(motif)) motif = motif.map(m => (m === 'camionnetteMobile' ? 'libre' : m));
  // Pas de véhicule en face dans la seule voie ouverte de la rangée d'avant.
  const avant = gen.dernier || ['libre', 'libre', 'libre'];
  const ouvertes = [0, 1, 2].filter(voie => !BLOQUANTS.includes(avant[voie]));
  motif = motif.map((m, voie) => {
    if ((m !== 'voitureMobile' && m !== 'camionnetteMobile') || ouvertes.length !== 1 || ouvertes[0] !== voie) return m;
    return m === 'voitureMobile' ? 'voiture' : 'libre';
  });
  gen.dernier = motif;
  const ratio = 0.35 + 0.45 * diff + hasard() * 0.15;
  let longueurMax = 0;
  let n = 0;
  motif.forEach((m, voie) => {
    const variante = Math.floor(hasard() * 4);
    if (m === 'libre') return;
    if (m === 'camionnetteRampe') {
      sortie.push(obstacle(base + n, 'rampe', voie, z, 0, variante));
      sortie.push(obstacle(base + n + 1, 'camionnette', voie, z + OBSTACLES.rampe.longueur, 0, variante));
      n += 2;
      longueurMax = Math.max(longueurMax, OBSTACLES.rampe.longueur + OBSTACLES.camionnette.longueur);
      return;
    }
    if (m === 'convoi') {
      // Deux voitures garées pare-chocs contre pare-chocs : un long toit.
      sortie.push(obstacle(base + n, 'voiture', voie, z, 0, variante));
      sortie.push(obstacle(base + n + 1, 'voiture', voie, z + OBSTACLES.voiture.longueur + 0.1, 0, (variante + 1) % 4));
      n += 2;
      longueurMax = Math.max(longueurMax, 2 * OBSTACLES.voiture.longueur + 0.1);
      return;
    }
    if (m === 'voitureMobile' || m === 'camionnetteMobile') {
      const type = m === 'voitureMobile' ? 'voiture' : 'camionnette';
      sortie.push(obstacle(base + n, type, voie, z, ratio, variante));
      n += 1;
      // Le véhicule remonte la voie : les rangées suivantes la laissent vide
      // tant qu'il y passerait au milieu d'elles.
      gen.reserve[voie] = Math.max(gen.reserve[voie], z + (VUE * ratio) / (1 + ratio) + 12);
      longueurMax = Math.max(longueurMax, OBSTACLES[type].longueur / (1 + ratio));
      return;
    }
    if (OBSTACLES[m].mobile) {
      sortie.push(mobile(base + n, m, voie, z, variante, hasard));
      n += 1;
      longueurMax = Math.max(longueurMax, OBSTACLES[m].longueur);
      return;
    }
    sortie.push(obstacle(base + n, m, voie, z, 0, variante));
    n += 1;
    longueurMax = Math.max(longueurMax, OBSTACLES[m].longueur);
  });

  // Écart jusqu'à la rangée suivante : serré en combinaison quand c'est dur.
  const combo = diff > 0.3 && hasard() < 0.35 * diff;
  const tempsEcart = combo ? 0.62 : (1.35 - 0.6 * diff) * (0.9 + hasard() * 0.3);
  const espace = longueurMax + v * tempsEcart;

  // Sacs d'achat : une file dans une voie franchissable, au sol, en arc
  // au-dessus d'un obstacle à sauter, sous un échafaudage ou sur un toit.
  // Une file porte au plus une étoile (25 points) : voir pointsMaxObjets.
  const voiesObjets = [0, 1, 2].filter(voie => gen.reserve[voie] <= z && !SANS_OBJETS.includes(motif[voie]));
  const file = [];
  if (voiesObjets.length && hasard() < 0.82 - 0.25 * diff) {
    const voie = choisir(voiesObjets, hasard);
    const m = motif[voie];
    if (m === 'libre') {
      for (let k = 0; k < 6 && 2.6 * k < espace - 3; k += 1) file.push({z: z + 2.6 * k, y: 0.55});
    } else if (m === 'plot' || m === 'barriere' || m === 'barrierePied') {
      const demi = (v * dureeSaut(v)) / 2;
      [-0.6, -0.3, 0, 0.3, 0.6].forEach(f => file.push({z: z + f * demi, y: 0.6 + arcSaut(f * demi, v)}));
    } else if (m === 'echafaudage') {
      [-2.6, 0, 2.6].forEach(o => file.push({z: z + 0.6 + o, y: 0.4}));
    } else if (m === 'voiture' || m === 'convoi') {
      const lv = m === 'convoi' ? 2 * OBSTACLES.voiture.longueur : OBSTACLES.voiture.longueur;
      for (let o = 1.2; o < lv - 0.4; o += 1.6) {
        file.push({z: z + o, y: OBSTACLES.voiture.h + 0.55});
      }
    } else if (m === 'camionnetteRampe') {
      const lr = OBSTACLES.rampe.longueur;
      for (let o = 0.6; o < lr; o += 1.5) file.push({z: z + o, y: (OBSTACLES.rampe.h * o) / lr + 0.55});
      for (let o = 0.6; o < OBSTACLES.camionnette.longueur - 0.4; o += 1.6) {
        file.push({z: z + lr + o, y: OBSTACLES.camionnette.h + 0.55});
      }
    }
    const bonus = z >= gen.prochainBonus && file.length > 0;
    const milieu = Math.floor(file.length / 2);
    // Étoile : au milieu d'un arc, sinon en bout de file (jamais sur le booster).
    const avecEtoile = file.length > 0 && hasard() < PROBA_ETOILE;
    let iEtoile = -1;
    if (avecEtoile) {
      iEtoile = m === 'plot' || m === 'barriere' || m === 'barrierePied' ? milieu : file.length - 1;
      if (bonus && iEtoile === milieu) iEtoile = Math.max(0, milieu - 1);
    }
    file.forEach((c, k) => {
      const estBonus = bonus && k === milieu;
      const estEtoile = !estBonus && k === iEtoile;
      sortie.push({
        id: base + 8 + k,
        genre: estBonus ? 'bonus' : estEtoile ? 'etoile' : 'sac',
        type: estBonus ? choisir(BONUS, hasard) : estEtoile ? 'etoile' : 'sac',
        voie,
        z: c.z,
        y: c.y,
        r: 0,
      });
    });
    if (bonus) gen.prochainBonus = z + 380 + hasard() * 320;
  }

  gen.rangee += 1;
  gen.z = z + espace;
}

/** Distance (m) entre le coureur et l'avant de l'objet. */
export function zRelatif(o, d) {
  return (o.z - d) * (1 + (o.r || 0));
}

/** Hauteur du dessus d'un objet « toit » sous l'avant du coureur. */
export function hautToit(o, zf) {
  if (!o.pente) return o.h;
  const dans = Math.max(0, Math.min(o.longueur, DEMI_JOUEUR - zf));
  return (o.h * dans) / o.longueur;
}

/** Course neuve, coureur au milieu, parcours tiré de la graine. */
export function nouvelleCourse(graine = 1) {
  const e = {
    graine: Math.max(1, Math.floor(Number(graine)) || 1),
    gen: null,
    d: 0,
    t: 0,
    voie: 1,
    voieDepart: 1,
    x: 1, // position latérale en voies (0 à 2)
    y: 0, // hauteur des pieds (m)
    vy: 0,
    auSol: true,
    plongeon: false,
    acc: 0, // temps restant baissé (s)
    turbo: 0,
    superSaut: 0,
    double: 0,
    aimant: 0,
    casque: 0,
    police: 0, // secondes de poursuite restantes (0 : pas de police)
    trebuche: 0,
    xPolice: 1, // voie du policier (il suit avec un léger retard)
    chocs: 0,
    invincible: 0,
    sacs: 0,
    etoiles: 0,
    pointsObjets: 0,
    objets: [],
    pris: new Map(), // id -> z (sacs, étoiles et boosters ramassés)
    detruits: new Map(), // id -> z (obstacles écartés par un choc)
    sol: 0,
    fini: false,
    cause: null,
  };
  e.gen = creerGenerateur(e.graine);
  remplir(e);
  return e;
}

/**
 * Génère devant, retire derrière. Renvoie vrai si la liste d'objets a changé
 * (l'écran redessine alors la scène).
 */
export function remplir(e) {
  let change = false;
  const nouveaux = [];
  while (e.gen.z <= e.d + GENERE_DEVANT) genererRangee(e.gen, nouveaux);
  nouveaux.forEach(o => {
    if (!e.pris.has(o.id) && !e.detruits.has(o.id)) {
      e.objets.push(o);
      change = true;
    }
  });
  const avant = e.objets.length;
  e.objets = e.objets.filter(o => zRelatif(o, e.d) + (o.longueur || 0) > -DERRIERE);
  if (e.objets.length !== avant) change = true;
  const limite = e.d - DERRIERE - 5;
  [e.pris, e.detruits].forEach(m => m.forEach((z, id) => z < limite && m.delete(id)));
  return change;
}

/** Score de la course. */
export function scoreCourse(e) {
  return Math.floor(e.d) + e.pointsObjets;
}

function hauteurJoueur(e) {
  return e.acc > 0 ? H_ACCROUPI : H_DEBOUT;
}

/** Vrai si l'obstacle (fixe ou qui traverse) est dans la voie du coureur. */
function memeVoie(e, o, voie) {
  if (o.mobile) {
    const ecart = Math.abs(xMobile(o, e.d) - e.x) * LARGEUR_VOIE;
    return ecart < o.demi + DEMI_LARGE_JOUEUR;
  }
  return o.voie === voie;
}

/**
 * Sol sous le coureur et obstacle percuté. { sol, choc: objet | null }
 */
export function collisions(e) {
  const voie = Math.round(e.x);
  const hj = hauteurJoueur(e);
  let sol = 0;
  let choc = null;
  for (let i = 0; i < e.objets.length; i += 1) {
    const o = e.objets[i];
    if (o.genre !== 'obstacle' || o.ej) continue;
    const zf = zRelatif(o, e.d);
    if (zf >= DEMI_JOUEUR || zf + o.longueur <= -DEMI_JOUEUR) continue;
    if (!memeVoie(e, o, voie)) continue;
    if (o.toit) {
      const haut = hautToit(o, zf);
      if (e.y >= haut - MARCHE) sol = Math.max(sol, haut);
      else choc = o;
    } else if (o.bas != null) {
      if (e.y < o.haut && e.y + hj > o.bas) choc = o;
    } else if (e.y < o.h) {
      choc = o;
    }
  }
  return {sol, choc};
}

const GAINS = {sac: POINTS_SAC, etoile: POINTS_ETOILE};

function ramasser(e, ev) {
  const hj = hauteurJoueur(e);
  let change = false;
  for (let i = 0; i < e.objets.length; i += 1) {
    const c = e.objets[i];
    if (c.genre === 'obstacle') continue;
    const zr = c.z - e.d;
    if (zr > 0.6 || zr < -0.6) continue;
    const attire = e.aimant > 0 && c.genre !== 'bonus';
    const aCote = Math.abs(c.voie - e.x) < 0.55;
    const aHauteur = c.y >= e.y - 0.35 && c.y <= e.y + hj + 0.35;
    if (!attire && !(aCote && aHauteur)) continue;
    e.pris.set(c.id, c.z);
    change = true;
    if (c.genre === 'bonus') {
      ev.bonus = c.type;
      e[c.type] = DUREES_BONUS[c.type];
    } else {
      const points = GAINS[c.genre] * (e.double > 0 ? 2 : 1);
      if (c.genre === 'etoile') {
        e.etoiles += 1;
        ev.etoiles += 1;
      } else {
        e.sacs += 1;
        ev.sacs += 1;
      }
      e.pointsObjets += points;
      ev.points += points;
    }
  }
  if (change) {
    e.objets = e.objets.filter(o => !e.pris.has(o.id));
    ev.change = true;
  }
}

/** L'obstacle percuté s'écarte : il reste dessiné, glisse de côté et ne gêne plus. */
function ecarter(e, choc) {
  const i = e.objets.indexOf(choc);
  if (i < 0) return;
  let sens = (choc.mobile ? xMobile(choc, e.d) : choc.voie) <= e.x ? -1 : 1;
  if (!choc.mobile && choc.voie === 2) sens = 1;
  if (!choc.mobile && choc.voie === 0) sens = -1;
  e.objets[i] = {...choc, ej: {t0: e.t, sens}};
}

/**
 * Un choc. Casque : absorbé, sans police. Police déjà là : arrêté, fin de
 * partie. Sinon : trébuchement, l'obstacle s'écarte, la police arrive.
 */
function choquer(e, choc, ev) {
  ecarter(e, choc);
  ev.change = true;
  if (e.casque > 0) {
    e.casque = 0;
    e.invincible = INVINCIBLE_CHOC;
    ev.casqueAbsorbe = true;
    return;
  }
  if (e.police > 0) {
    e.fini = true;
    e.cause = 'police';
    ev.fin = true;
    ev.arrete = true;
    return;
  }
  e.chocs += 1;
  e.police = DUREE_POLICE;
  e.trebuche = DUREE_TREBUCHE;
  e.xPolice = e.x;
  e.invincible = INVINCIBLE_CHOC;
  ev.choc = true;
}

/** Un sous-pas de simulation (h secondes à la vitesse v). */
function pas(e, h, v, ev) {
  e.d += v * h;
  e.t += h;
  // Changement de voie.
  const ecart = e.voie - e.x;
  const m = VITESSE_VOIE * h;
  if (Math.abs(ecart) <= m) {
    e.x = e.voie;
    e.voieDepart = e.voie;
  } else {
    e.x += Math.sign(ecart) * m;
  }
  e.xPolice += (e.x - e.xPolice) * Math.min(1, 5 * h);
  if (e.acc > 0 && e.auSol) e.acc = Math.max(0, e.acc - h);
  BONUS.forEach(b => {
    e[b] = Math.max(0, e[b] - h);
  });
  e.trebuche = Math.max(0, e.trebuche - h);
  if (e.police > 0) {
    e.police = Math.max(0, e.police - h);
    if (e.police === 0) ev.policePart = true;
  }
  e.invincible = Math.max(0, e.invincible - h);
  if (!e.auSol) {
    e.vy -= gravitePour(v, hauteurSaut(e)) * h;
    e.y += e.vy * h;
  }
  const {sol, choc} = collisions(e);
  if (choc && e.invincible <= 0) {
    if (Math.round(e.x) !== e.voieDepart) {
      // Choc de côté pendant un changement de voie : retour dans l'ancienne voie.
      e.voie = e.voieDepart;
      ev.bosse = true;
    }
    choquer(e, choc, ev);
    if (e.fini) return;
  }
  if (e.y <= sol) {
    const atterrit = !e.auSol;
    e.y = sol;
    e.vy = 0;
    e.auSol = true;
    if (atterrit && e.plongeon) e.acc = DUREE_ACCROUPI;
    if (atterrit) ev.atterri = true;
    e.plongeon = false;
  } else if (e.auSol) {
    // Bout du toit : il tombe.
    e.auSol = false;
    e.vy = 0;
  }
  e.sol = sol;
  ramasser(e, ev);
}

/** Vitesse réelle (m/s) : turbo, trébuchement. */
export function vitesseCourse(e) {
  let v = vitessePour(e.d);
  if (e.turbo > 0) v *= FACTEUR_TURBO;
  if (e.trebuche > 0) v *= FREIN_TREBUCHE;
  return v;
}

/**
 * Avance la course de dt secondes. Renvoie les événements de l'image :
 * { sacs, etoiles, points, bonus, choc, casqueAbsorbe, arrete, policePart,
 * bosse, atterri, fin, change, niveau }.
 */
export function avancer(e, dt) {
  const ev = {
    sacs: 0,
    etoiles: 0,
    points: 0,
    bonus: null,
    choc: false,
    casqueAbsorbe: false,
    arrete: false,
    policePart: false,
    bosse: false,
    atterri: false,
    fin: false,
    change: false,
    niveau: 0,
  };
  if (!e || e.fini) return ev;
  const t = Math.min(0.05, Math.max(0, Number(dt) || 0));
  if (t <= 0) return ev;
  const v = vitesseCourse(e);
  const n = Math.max(1, Math.ceil((v * t) / PAS_MAX));
  const niveauAvant = niveauPour(e.d);
  for (let i = 0; i < n && !e.fini; i += 1) pas(e, t / n, v, ev);
  if (remplir(e)) ev.change = true;
  const niveau = niveauPour(e.d);
  if (niveau > niveauAvant) ev.niveau = niveau;
  return ev;
}

/** Glissé à gauche (-1) ou à droite (+1). */
export function changerVoie(e, sens) {
  if (!e || e.fini) return false;
  const voie = Math.max(0, Math.min(VOIES - 1, e.voie + (sens < 0 ? -1 : 1)));
  if (voie === e.voie) return false;
  e.voieDepart = Math.round(e.x);
  e.voie = voie;
  return true;
}

/** Glissé vers le haut : saut (seulement au sol ou sur un toit). */
export function sauter(e) {
  if (!e || e.fini || !e.auSol) return false;
  const v = vitesseCourse(e);
  e.vy = (gravitePour(v, hauteurSaut(e)) * dureeSaut(v)) / 2;
  e.auSol = false;
  e.acc = 0;
  e.plongeon = false;
  return true;
}

/** Glissé vers le bas : se baisser, ou redescendre vite en l'air. */
export function baisser(e) {
  if (!e || e.fini) return false;
  if (e.auSol) e.acc = DUREE_ACCROUPI;
  else {
    e.vy = Math.min(e.vy, -VITESSE_PLONGEON);
    e.plongeon = true;
  }
  return true;
}

/** Boosters actifs pour le HUD : [{cle, reste: 0 à 1}]. */
export function boostersActifs(e) {
  if (!e) return [];
  return BONUS.filter(b => e[b] > 0).map(b => ({cle: b, reste: Math.min(1, e[b] / DUREES_BONUS[b])}));
}

/**
 * Points maximum que peuvent donner les objets générés jusqu'à la distance
 * d, avec le x2 actif en permanence. Sert à vérifier la limite du serveur :
 * d + pointsMaxObjets(objets, d) <= 500 x niveau x 21.
 */
export function pointsMaxObjets(objets, d) {
  return objets.reduce((s, o) => (o.z <= d && GAINS[o.genre] ? s + 2 * GAINS[o.genre] : s), 0);
}

// Sauvegarde ------------------------------------------------------------

function entier(x, min = 0) {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n >= min ? n : min;
}

function borne(x, min, max, defaut) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defaut;
}

/** Ce qu'on garde d'une course pour la reprendre plus tard. */
export function instantaneCourse(e) {
  return {
    graine: e.graine,
    d: e.d,
    voie: e.voie,
    y: e.y,
    vy: e.vy,
    auSol: e.auSol,
    plongeon: e.plongeon,
    acc: e.acc,
    turbo: e.turbo,
    superSaut: e.superSaut,
    double: e.double,
    aimant: e.aimant,
    casque: e.casque,
    police: e.police,
    chocs: e.chocs,
    sacs: e.sacs,
    etoiles: e.etoiles,
    pointsObjets: e.pointsObjets,
    pris: [...e.pris.keys()],
    detruits: [...e.detruits.keys()],
  };
}

function idsPropres(l) {
  if (!Array.isArray(l)) return [];
  const ids = l.map(x => Math.floor(Number(x))).filter(i => Number.isInteger(i) && i >= 0);
  return [...new Set(ids)].slice(0, 2000);
}

function nettoyerCourse(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  return {
    graine: entier(c.graine, 1) % 2147483647 || 1,
    d: borne(c.d, 0, 1000000, 0),
    voie: Math.min(VOIES - 1, entier(c.voie)),
    y: borne(c.y, 0, 12, 0),
    vy: borne(c.vy, -60, 60, 0),
    auSol: c.auSol !== false,
    plongeon: c.plongeon === true,
    acc: borne(c.acc, 0, DUREE_ACCROUPI, 0),
    turbo: borne(c.turbo, 0, DUREES_BONUS.turbo, 0),
    superSaut: borne(c.superSaut, 0, DUREES_BONUS.superSaut, 0),
    double: borne(c.double, 0, DUREES_BONUS.double, 0),
    aimant: borne(c.aimant, 0, DUREES_BONUS.aimant, 0),
    casque: borne(c.casque, 0, DUREES_BONUS.casque, 0),
    police: borne(c.police, 0, DUREE_POLICE, 0),
    chocs: entier(c.chocs),
    sacs: entier(c.sacs),
    etoiles: entier(c.etoiles),
    pointsObjets: entier(c.pointsObjets),
    pris: idsPropres(c.pris),
    detruits: idsPropres(c.detruits),
  };
}

/** Reprend une course enregistrée : même parcours, même position. */
export function reprendreCourse(c) {
  const s = nettoyerCourse(c);
  if (!s) return nouvelleCourse(1);
  const e = nouvelleCourse(s.graine);
  Object.assign(e, {
    d: s.d,
    voie: s.voie,
    voieDepart: s.voie,
    x: s.voie,
    xPolice: s.voie,
    y: s.y,
    vy: s.vy,
    auSol: s.auSol,
    plongeon: s.plongeon,
    acc: s.acc,
    turbo: s.turbo,
    superSaut: s.superSaut,
    double: s.double,
    aimant: s.aimant,
    casque: s.casque,
    police: s.police,
    chocs: s.chocs,
    sacs: s.sacs,
    etoiles: s.etoiles,
    pointsObjets: s.pointsObjets,
    invincible: INVINCIBLE_REPRISE,
  });
  // Même parcours rejoué depuis le début, jusqu'au point de reprise.
  e.gen = creerGenerateur(e.graine);
  e.objets = [];
  e.pris = new Map(s.pris.map(id => [id, s.d]));
  e.detruits = new Map(s.detruits.map(id => [id, s.d]));
  remplir(e);
  e.sol = collisions(e).sol;
  if (e.auSol) e.y = Math.max(e.y, e.sol);
  return e;
}
