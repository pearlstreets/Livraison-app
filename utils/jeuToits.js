/**
 * Mini-jeu « Tournée des toits » : logique pure (sans React), testable sous node.
 *
 * Monde en unités de jeu : x vers la droite, y vers le HAUT, y = 0 au niveau
 * du trottoir. Le livreur est une boîte (x, y) = coin bas gauche, LARGEUR x HAUTEUR.
 *
 * Plateformes :
 *  - colonnes (`flottante: false`) : trottoir, toit, benne. Pleines du sol
 *    jusqu'à leur dessus : on se pose dessus, on bute sur leurs côtés.
 *  - flottantes (`flottante: true`) : échafaudage, auvent. On les traverse
 *    par-dessous, on se pose dessus par le haut.
 * Boîtes aux lettres et caisses bonus : blocs pleins, à frapper par-dessous
 * (une fois). La boîte donne un colis, la caisse une amélioration (grand
 * livreur, drone qui soulève le livreur, étoile, chrono, points doublés).
 *
 * Toujours faisable : la portée et la hauteur réelles du saut sont mesurées
 * avec la physique du jeu (`mesurerSaut`). Chaque trou reste sous
 * ECART_MAX, chaque marche sous MONTEE_MAX (montée comme descente, pour
 * pouvoir revenir), et chaque saut est rejoué (`simulerSaut`) avec une marge
 * pour un saut déclenché trop tôt. Aucun gêneur à l'atterrissage.
 *
 * Reprise sûre (`pointDeReprise`) : après une chute ou un coup, le livreur
 * revient un peu en arrière, sur un sol plein, loin des bords et des gêneurs,
 * et reste immobile (invincible) jusqu'au prochain geste.
 */

// ---- Physique (unités par seconde) ----
export const LARGEUR = 20;
export const HAUTEUR = 30;
export const HAUTEUR_ACCROUPI = 16; // accroupi : on passe sous les pigeons bas
export const FREIN_ACCROUPI = 0.55; // et on avance plus lentement
export const VITESSE = 165;
const ACCEL_SOL = 1500;
const ACCEL_AIR = 1000;
const FREIN_SOL = 1900;
const FREIN_AIR = 260;
const GRAVITE = 1900;
const GRAVITE_TENUE = 950; // saut maintenu : montée plus longue
const TENUE_MAX = 0.24;
const SAUT = 560;
const COUPE_SAUT = 220; // saut relâché tôt : petit saut
const CHUTE_MAX = 820;
const COYOTE = 0.09; // saut accepté juste après le bord
const TAMPON = 0.12; // saut demandé juste avant de toucher le sol
const REBOND = 420;
const REBOND_TENU = 560;
const PAS_MAX = 1 / 120;
// Drone (caisse bonus) : il soulève le livreur, chaque geste vers le haut relance, descente planée.
const GRAVITE_VOL = 700;
const CHUTE_VOL = 110;
const PLAFOND_VOL = 330;

export const SOL_ECRAN = 40; // marge sous le trottoir à l'écran
export const LIMITE_CHUTE = -70; // en dessous : vie perdue
export const VIES = 3;
const RESERVE_TEMPS = 12; // secondes rendues après un chrono épuisé
export const MARGE_SAUT = 24; // saut faisable même déclenché 24 unités trop tôt

export const PALIER_PIECES = 10; // tous les 10 colis : une vie, sinon un aimant
export const INVUL_REPRISE = 2; // secondes d'invincibilité après la reprise
export const DUREES = { aimant: 8, vol: 5, etoile: 6, double: 10 };
export const BONUS_CAISSE = ['taille', 'vol', 'etoile', 'chrono', 'double'];
export const BONUS_CHRONO = 10; // secondes ajoutées au chrono par la caisse « chrono »
export const PROB_CAISSE = 0.38; // chance d'une caisse bonus sur un toit libre et assez large
const RAYON_AIMANT = 120;

// Reprise sûre et placement des gêneurs.
export const BORD_SUR = 36; // jamais à moins de 36 unités d'un bord
export const DISTANCE_SURE = 45; // aucun gêneur à moins de 45 unités
export const DEGAGEMENT_ATTERRISSAGE = 110; // début de toit sans gêneur
export const LARGEUR_MIN_GENEUR = 180;

export const POINTS = {
  colis: 10,
  boite: 50,
  caisse: 100,
  chien: 100,
  pigeon: 120,
  trottinette: 150,
  livraison: 500,
  seconde: 20,
};

export const TAILLES = {
  chien: { w: 26, h: 20 },
  pigeon: { w: 22, h: 16 },
  trottinette: { w: 28, h: 24 },
  colis: 18,
  boite: 22,
  porte: { w: 34, h: 50 },
};

// ---- Hasard reproductible ----
export function alea(graine) {
  let a = (Math.floor(graine) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function borner(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---- Joueur ----
export function nouveauJoueur(x, y) {
  return {
    x, y, vx: 0, vy: 0, dir: 1, sol: null, coyote: 0, tampon: 0, tenue: 0,
    enSaut: false, recul: 0, course: 0, accroupi: false, vol: false,
  };
}

function recouvreX(j, s, marge) {
  return j.x + LARGEUR > s.x + marge && j.x < s.x + s.w - marge;
}

export function hautDe(s) {
  return s.boite ? s.y + s.h : s.y;
}

/**
 * Un pas de physique du livreur. `cmd` : { gauche, droite, sautTenu }.
 * Le saut demandé se pose avant via `j.tampon = TAMPON` (voir demanderSaut).
 * `j.vol` vrai : saut permis en l'air et descente planée.
 * Rend la boîte frappée par-dessous, sinon null.
 */
export function physiqueJoueur(j, plateformes, boites, cmd, dt) {
  const dir = (cmd.droite ? 1 : 0) - (cmd.gauche ? 1 : 0);
  if (j.recul > 0) j.recul -= dt;
  if (dir && j.recul <= 0) {
    const acc = j.sol ? ACCEL_SOL : ACCEL_AIR;
    // Demi-tour : freinage plus vif, plus nerveux.
    const bonus = Math.sign(j.vx) === -dir ? 1.6 : 1;
    const vmax = j.accroupi ? VITESSE * FREIN_ACCROUPI : VITESSE;
    j.vx = borner(j.vx + dir * acc * bonus * dt, -vmax, vmax);
    j.dir = dir;
  } else {
    const frein = (j.sol ? FREIN_SOL : FREIN_AIR) * dt;
    j.vx = Math.abs(j.vx) <= frein ? 0 : j.vx - Math.sign(j.vx) * frein;
  }

  // Saut (avec tolérance au bord et à l'appui anticipé).
  if (j.sol) j.coyote = COYOTE; else j.coyote -= dt;
  if (j.tampon > 0) j.tampon -= dt;
  if (j.tampon > 0 && (j.coyote > 0 || j.vol)) {
    j.vy = j.vol && !j.sol ? Math.max(j.vy, SAUT * 0.8) : SAUT;
    j.tenue = 0;
    j.coyote = 0;
    j.tampon = 0;
    j.sol = null;
    j.enSaut = true;
  }
  let g = GRAVITE;
  if (j.enSaut && j.vy > 0) {
    if (cmd.sautTenu && j.tenue < TENUE_MAX) {
      g = GRAVITE_TENUE;
      j.tenue += dt;
    } else if (!cmd.sautTenu) {
      j.vy = Math.min(j.vy, COUPE_SAUT);
      j.enSaut = false;
    }
  }
  if (j.vol && j.vy < 0) g = GRAVITE_VOL;
  j.vy = Math.max(j.vol ? -CHUTE_VOL : -CHUTE_MAX, j.vy - g * dt);

  // Horizontal : on bute sur les côtés des colonnes et des boîtes.
  j.x += j.vx * dt;
  for (let i = 0; i < plateformes.length; i += 1) {
    const s = plateformes[i];
    if (s.flottante || s.effondre) continue;
    if (j.y < s.y - 0.01 && recouvreX(j, s, 0)) {
      if (j.x + LARGEUR / 2 < s.x + s.w / 2) j.x = s.x - LARGEUR; else j.x = s.x + s.w;
      j.vx = 0;
    }
  }
  for (let i = 0; i < boites.length; i += 1) {
    const b = boites[i];
    if (j.y < b.y + b.h - 0.01 && j.y + HAUTEUR > b.y + 0.01 && recouvreX(j, b, 0)) {
      if (j.x + LARGEUR / 2 < b.x + b.w / 2) j.x = b.x - LARGEUR; else j.x = b.x + b.w;
      j.vx = 0;
    }
  }

  // Vertical : on se pose par le haut, on frappe les boîtes par-dessous.
  const avant = j.y;
  j.y += j.vy * dt;
  if (j.vol && j.y > PLAFOND_VOL) {
    j.y = PLAFOND_VOL;
    j.vy = Math.min(0, j.vy);
  }
  j.sol = null;
  let frappee = null;
  if (j.vy <= 0) {
    let meilleur = null;
    const tester = (s) => {
      if (s.effondre) return;
      const haut = hautDe(s);
      if (recouvreX(j, s, 2) && avant >= haut - 0.01 && j.y <= haut && (!meilleur || haut > hautDe(meilleur))) {
        meilleur = s;
      }
    };
    plateformes.forEach(tester);
    boites.forEach(tester);
    if (meilleur) {
      j.y = hautDe(meilleur);
      j.vy = 0;
      j.sol = meilleur;
      j.enSaut = false;
    }
  } else {
    for (let i = 0; i < boites.length; i += 1) {
      const b = boites[i];
      if (recouvreX(j, b, 3) && avant + HAUTEUR <= b.y + 0.01 && j.y + HAUTEUR > b.y) {
        j.y = b.y - HAUTEUR;
        j.vy = 0;
        j.enSaut = false;
        frappee = b;
        break;
      }
    }
  }
  if (j.sol && Math.abs(j.vx) > 1) j.course += Math.abs(j.vx) * dt; else if (j.sol) j.course = 0;
  return frappee;
}

export function demanderSaut(j) {
  j.tampon = TAMPON;
}

/**
 * Saut le plus long sur sol plat, élan pris, saut maintenu (le geste vers le
 * haut maintient le saut 0,3 s, plus que TENUE_MAX) : hauteur max atteinte
 * et distance parcourue avant de retomber à la même hauteur.
 */
export function mesurerSaut() {
  const sol = { x: -1e6, w: 2e6, y: 0 };
  const j = nouveauJoueur(0, 0);
  j.sol = sol;
  j.vx = VITESSE;
  demanderSaut(j);
  const cmd = { gauche: false, droite: true, sautTenu: true };
  let hauteur = 0;
  let duree = 0;
  for (let t = 0; t < 3; t += PAS_MAX) {
    physiqueJoueur(j, [sol], [], cmd, PAS_MAX);
    hauteur = Math.max(hauteur, j.y);
    if (t > 0.05 && j.sol) {
      duree = t;
      break;
    }
  }
  return { hauteur, portee: j.x, duree };
}

export const SAUT_MESURE = mesurerSaut();
// Bornes du niveau, avec marge : 72 % de la portée, 60 % de la hauteur.
export const ECART_MAX = Math.floor(SAUT_MESURE.portee * 0.72);
export const MONTEE_MAX = Math.floor(SAUT_MESURE.hauteur * 0.6);
export const RATIO_MAX = 0.72;

/**
 * Saut réel de `a` vers `b` : élan depuis `a`, droite maintenue, saut maintenu,
 * déclenché `avance` unités avant le dernier moment. Vrai si on se pose sur `b`.
 */
export function simulerSaut(a, b, avance = 0, plateformes = null, boites = []) {
  const liste = plateformes || [a, b];
  const j = nouveauJoueur(Math.max(a.x + 2, a.x + a.w - LARGEUR - 60), hautDe(a));
  j.sol = a;
  const declencheur = a.x + a.w - LARGEUR * 0.6 - avance;
  const cmd = { gauche: false, droite: true, sautTenu: true };
  let saute = false;
  const dt = PAS_MAX;
  for (let t = 0; t < 4; t += dt) {
    if (!saute && j.sol && j.x >= declencheur) {
      demanderSaut(j);
      saute = true;
    }
    // En descente au-dessus de `b` : on freine pour ne pas le dépasser.
    const centre = b.x + b.w / 2 - LARGEUR / 2;
    if (saute && j.vy < 0 && j.x >= centre - 4) {
      cmd.droite = false;
      cmd.gauche = j.vx > 0;
    } else {
      cmd.droite = true;
      cmd.gauche = false;
    }
    physiqueJoueur(j, liste, boites, cmd, dt);
    if (j.sol === b) return true;
    // Posé sur une boîte au-dessus de `b` : on est bien arrivé (on en redescend sur `b`).
    if (j.sol && j.sol.boite && j.sol.x >= b.x && j.sol.x + j.sol.w <= b.x + b.w) return true;
    if (saute && j.sol && j.sol !== a && j.sol !== b) return false;
    if (j.y < LIMITE_CHUTE) return false;
    // Coincé contre un mur sans avancer.
    if (saute && j.sol === a && j.vx === 0) return false;
  }
  return false;
}

export function peutSauter(a, b) {
  return simulerSaut(a, b, MARGE_SAUT) && simulerSaut(a, b, 0);
}

// Même trou vu dans l'autre sens (retour vers la gauche).
function miroir(p) {
  return { ...p, x: -(p.x + p.w) };
}
export function peutRevenir(a, b) {
  return peutSauter(miroir(b), miroir(a));
}

// ---- Génération des niveaux ----
function entre(rng, min, max) {
  return min + rng() * Math.max(0, max - min);
}

const DECORS = ['jour', 'soir', 'nuit', 'pluie'];
const MOTIFS = ['tuiles', 'briques', 'ardoise', 'terrasse'];

/** Décor (ambiance) et motif des toits d'un niveau : ils tournent pour varier. */
export function decorNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  return {
    decor: DECORS[(n - 1) % DECORS.length],
    motif: MOTIFS[(n - 1 + Math.floor((n - 1) / DECORS.length)) % MOTIFS.length],
  };
}

/**
 * Difficulté progressive, sans plafond brutal : tout monte doucement jusqu'au
 * niveau 10 (`diff`), puis une seconde vague jusqu'au niveau 22 (`dur`),
 * puis une pente très douce jusqu'au niveau 40 (`plus`) :
 * chrono plus serré, gêneurs plus nombreux et plus rapides, plus de nacelles,
 * de toits fragiles et de sauts enchaînés. Les trous et les marches restent
 * sous les bornes mesurées : chaque niveau reste faisable.
 */
export function reglagesNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const diff = Math.min(1, (n - 1) / 9);
  const dur = Math.min(1, Math.max(0, (n - 10) / 12));
  const plus = Math.min(1, Math.max(0, (n - 22) / 18));
  const longueur = Math.min(6400, 1600 + (n - 1) * 360);
  const facteur = n <= 10 ? Math.max(2.1, 3 - 0.1 * (n - 1)) : 2.1 - 0.3 * dur - 0.05 * plus;
  return {
    n,
    diff,
    dur,
    longueur,
    // Trous en part de la portée réelle du saut, jamais plus de RATIO_MAX.
    ratioMin: 0.22 + 0.26 * diff,
    ratioMax: Math.min(RATIO_MAX, 0.42 + 0.28 * diff),
    // Marches (montée ou descente) entre deux plateformes.
    marche: Math.round(MONTEE_MAX * (0.45 + 0.55 * diff)),
    probMobile: n >= 4 ? Math.min(0.14, 0.06 + 0.02 * (n - 4)) + 0.06 * dur : 0,
    probFragile: n >= 3 ? Math.min(0.14, 0.06 + 0.02 * (n - 3)) + 0.06 * dur : 0,
    probEnchaine: n >= 2 ? Math.min(0.2, 0.08 + 0.03 * (n - 2)) + 0.06 * dur : 0,
    probGeneur: Math.min(0.6, 0.25 + diff * 0.35) + 0.12 * dur + 0.08 * plus,
    // Gêneurs plus rapides dans la seconde vague (jusqu'à +35 %), puis +50 % au niveau 40.
    vitesseGeneurs: 1 + 0.35 * dur + 0.15 * plus,
    probCaisse: PROB_CAISSE,
    types: ['chien', ...(n >= 2 ? ['pigeon'] : []), ...(n >= 3 ? ['trottinette'] : [])],
    // Chrono large : le temps de course sans faute, fois un facteur confortable.
    limite: Math.round((longueur / VITESSE) * facteur + 15),
  };
}

// ---- Portée maximale d'un saut (physique réelle), mise en cache ----
const cachePortee = new Map();
function portee(a, b) {
  const dy = b.y - a.y;
  const cle = `${Math.round(a.w / 20)}_${Math.round(b.w / 20)}_${Math.round(dy / 6)}_${a.flottante ? 1 : 0}${b.flottante ? 1 : 0}`;
  if (cachePortee.has(cle)) return cachePortee.get(cle);
  const A = { x: 0, w: a.w, y: Math.max(0, -dy), flottante: !!a.flottante };
  let lo = 0;
  let hi = 175;
  const ok = (g) => peutSauter(A, { x: A.w + g, w: b.w, y: Math.max(0, dy), flottante: !!b.flottante });
  if (!ok(0)) {
    cachePortee.set(cle, 0);
    return 0;
  }
  for (let i = 0; i < 9; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  cachePortee.set(cle, lo);
  return lo;
}

// Positions extrêmes d'une plateforme mobile (sinon : elle-même).
export function etatsEntree(c) {
  const mo = c.mobile;
  if (!mo) return [c];
  if (mo.axe === 'x') return [{ ...c, x: mo.x0 - mo.amp, y: mo.y0 }];
  return [{ ...c, x: mo.x0, y: mo.y0 - mo.amp }, { ...c, x: mo.x0, y: mo.y0 + mo.amp }];
}
export function etatsSortie(c) {
  const mo = c.mobile;
  if (!mo) return [c];
  if (mo.axe === 'x') return [{ ...c, x: mo.x0 + mo.amp, y: mo.y0 }];
  return [{ ...c, x: mo.x0, y: mo.y0 - mo.amp }, { ...c, x: mo.x0, y: mo.y0 + mo.amp }];
}

/** Position d'une plateforme mobile à l'instant t (secondes de jeu). */
export function positionMobile(p, t) {
  const mo = p.mobile;
  const o = Math.sin(t * mo.vit + mo.phase) * mo.amp;
  return mo.axe === 'x' ? { x: mo.x0 + o, y: mo.y0 } : { x: mo.x0, y: mo.y0 + o };
}

/** Zone [debut, fin] balayée par un gêneur (sa patrouille complète). */
export function zoneGeneur(g) {
  if (g.type === 'pigeon') return [g.cx - g.amp, g.cx + g.amp + g.w];
  return [g.x1, g.x2 + g.w];
}

/**
 * Point de reprise sûr : sur la dernière colonne pleine touchée (ou avant),
 * x le plus à droite qui reste à BORD_SUR des bords et à DISTANCE_SURE de
 * toute patrouille de gêneur encore active, sans dépasser `xMort`.
 * Repli : le trottoir de départ, toujours sans gêneur.
 */
export function pointDeReprise(m, xMort) {
  const solides = m.plateformes.filter((p) => !p.flottante && !p.mobile && !p.fragile && p.type !== 'benne');
  let k = solides.indexOf(m.dernierSol);
  if (k < 0) {
    k = 0;
    solides.forEach((p, i) => { if (p.x <= xMort) k = i; });
  }
  const interdits = m.geneurs
    .filter((g) => g.actif && !(g.ecarte > 0))
    .map((g) => {
      const [a, b] = zoneGeneur(g);
      return [a - DISTANCE_SURE, b + DISTANCE_SURE];
    });
  for (let i = k; i >= 0; i -= 1) {
    const p = solides[i];
    const lo = p.x + BORD_SUR;
    let hi = p.x + p.w - BORD_SUR - LARGEUR;
    if (xMort != null && i === k) hi = Math.min(hi, xMort - 10);
    for (let x = Math.floor(hi); x >= lo; x -= 2) {
      if (!interdits.some(([a, b]) => x + LARGEUR > a && x < b)) return { p, x };
    }
  }
  return { p: m.plateformes[0], x: m.depart.x };
}

/** Niveau complet, reproductible pour un même (niveau, graine). */
export function genererNiveau(niveau, graine) {
  const r = reglagesNiveau(niveau);
  const { n, diff, dur, longueur } = r;
  const rng = alea(graine != null ? graine : n * 7919 + 13);
  const plateformes = [];
  let id = 0;
  const depart = { id: id++, x: -240, w: 520, y: 0, type: 'sol', flottante: false };
  plateformes.push(depart);
  let prec = depart;

  const typeColonne = (y) => (y <= 0 ? 'sol' : 'toit');
  const ratio = () => entre(rng, r.ratioMin, r.ratioMax);
  const ajouter = (p) => {
    const cand = { ...p };
    const sources = prec.sorties || [prec];
    const srcMin = Math.min(...sources.map(hautDe));
    const srcMax = Math.max(...sources.map(hautDe));
    const faisable = () => {
      const entrees = etatsEntree(cand);
      return sources.every((a) => entrees.every((b) => {
        if (b.y - hautDe(a) > MONTEE_MAX || hautDe(a) - b.y > MONTEE_MAX) return false;
        if (b.x - (a.x + a.w) > ECART_MAX) return false;
        if (!peutSauter(a, b)) return false;
        // Entre deux colonnes fixes, le retour doit aussi passer.
        if (!a.flottante && !b.flottante && !a.mobile && !b.mobile && !peutRevenir(a, b)) return false;
        return true;
      }));
    };
    const placer = () => {
      // Marche bornée : montée comme descente, sous MONTEE_MAX.
      const amp = cand.mobile && cand.mobile.axe === 'y' ? cand.mobile.amp : 0;
      cand.y = borner(cand.y, srcMax - MONTEE_MAX + amp, srcMin + MONTEE_MAX - amp);
      if (cand.mobile && cand.mobile.axe === 'y') cand.y = Math.max(cand.y, cand.mobile.amp + 28);
      if (!cand.flottante) cand.y = Math.max(0, cand.y);
      cand.x = Math.round(prec.x + prec.w + cand.ecart);
      cand.y = Math.round(cand.y);
      if (cand.mobile) {
        cand.mobile.x0 = cand.mobile.axe === 'x' ? cand.x + cand.mobile.amp : cand.x;
        cand.mobile.y0 = cand.y;
      }
    };
    if (cand.ratio != null) {
      // Trou voulu : une part de la portée réelle du saut vers cette plateforme.
      cand.w = Math.round(cand.w);
      let lim = Infinity;
      cand.ecart = 0;
      placer();
      sources.forEach((a) => etatsEntree(cand).forEach((b) => { lim = Math.min(lim, portee(a, b)); }));
      cand.ecart = Math.min(ECART_MAX - (cand.mobile && cand.mobile.axe === 'x' ? 0 : 0), Math.max(0, lim * Math.min(cand.ratio, RATIO_MAX)));
      delete cand.ratio;
    }
    let ok = false;
    for (let i = 0; i < 10 && !ok; i += 1) {
      placer();
      ok = faisable();
      if (!ok) {
        cand.ecart = Math.max(0, cand.ecart * 0.75 - 4);
        cand.y = prec.y + (cand.y - prec.y) * 0.65;
      }
    }
    if (!ok) {
      // Repli toujours faisable : plateforme fixe, même hauteur, petit trou.
      delete cand.mobile;
      if (cand.type === 'nacelle') cand.type = 'echafaudage';
      cand.ecart = 18;
      cand.y = cand.flottante ? prec.y : Math.max(0, prec.y);
      placer();
      if (!faisable()) {
        cand.ecart = 0;
        placer();
      }
    }
    if (!cand.flottante && cand.type !== 'benne') cand.type = typeColonne(cand.y);
    if (cand.fragile) {
      if (cand.flottante || cand.y <= 0) {
        delete cand.fragile;
      } else {
        // Temps de traverser, plus une bonne seconde de répit.
        cand.retard = Math.round((cand.w / VITESSE + 0.9) * 100) / 100;
        cand.tombe = 0;
        cand.effondre = false;
        cand.chute = 0;
        cand.reforme = 0;
      }
    }
    cand.w = Math.round(cand.w);
    delete cand.ecart;
    cand.id = id++;
    if (cand.mobile) {
      const pm = positionMobile(cand, 0);
      cand.x = Math.round(pm.x);
      cand.y = Math.round(pm.y);
      plateformes.push(cand);
      // La suite se place depuis la position de sortie de la plateforme mobile.
      prec = { ...etatsSortie(cand)[0], sorties: etatsSortie(cand) };
      return cand;
    }
    plateformes.push(cand);
    prec = cand;
    return cand;
  };

  const colonne = (extra) => ajouter({
    flottante: false,
    w: entre(rng, Math.max(130, 190 - diff * 60), Math.max(200, 340 - diff * 120)),
    y: borner(prec.y + entre(rng, -r.marche, r.marche), 0, 175),
    ratio: ratio(),
    ...extra,
  });

  while (prec.x + prec.w < longueur) {
    let tirage = rng();
    const pM = r.probMobile;
    const pF = pM + r.probFragile;
    // Dès le niveau 4, une nacelle par niveau ; dès le 3, un toit fragile.
    if (n >= 4 && prec.x > longueur * 0.35 && !plateformes.some((q) => q.mobile)) tirage = 0;
    else if (n >= 3 && prec.x > longueur * 0.55 && !plateformes.some((q) => q.fragile)) tirage = pM + 0.0001;
    const pE = pF + r.probEnchaine;
    if (tirage < pM) {
      // Nacelle : plateforme mobile, horizontale ou verticale.
      const axe = rng() < 0.6 ? 'x' : 'y';
      const amp = axe === 'x' ? entre(rng, 35, 60) : entre(rng, 20, 26);
      ajouter({
        flottante: true,
        type: 'nacelle',
        mobile: { axe, amp, vit: entre(rng, 1, 1.3 + diff * 0.3 + dur * 0.3), phase: rng() * 6.28, x0: 0, y0: 0 },
        w: entre(rng, 76, 96),
        y: borner(prec.y + entre(rng, -10, 30), 40, 150),
        ratio: ratio() * 0.85,
      });
      colonne({ w: entre(rng, 170, 250), y: prec.y });
    } else if (tirage < pF) {
      // Toits fragiles : ils s'effondrent un peu après qu'on s'y est posé.
      const k = 1 + (diff > 0.5 && rng() < 0.5 ? 1 : 0);
      for (let i = 0; i < k; i += 1) {
        colonne({
          fragile: true,
          w: entre(rng, 90, 120),
          y: borner(prec.y + entre(rng, -25, 30), 25, 170),
          ratio: ratio(),
        });
      }
      colonne({ w: entre(rng, 170, 240) });
    } else if (tirage < pE) {
      // Sauts enchaînés : petits toits rapprochés.
      const k = 2 + Math.floor(rng() * (1 + diff * 1.5));
      for (let i = 0; i < k; i += 1) {
        colonne({
          w: entre(rng, 80, 104),
          y: borner(prec.y + entre(rng, -30, 30), 0, 170),
          ratio: ratio(),
        });
      }
      colonne({ w: entre(rng, 180, 260) });
    } else if (rng() < 0.18 + diff * 0.12) {
      // Pierres de gué : échafaudages et auvents au-dessus d'un trou.
      const k = 1 + Math.floor(rng() * (1 + diff * 1.5));
      for (let i = 0; i < k; i += 1) {
        ajouter({
          flottante: true,
          type: rng() < 0.5 ? 'echafaudage' : 'auvent',
          w: entre(rng, 80, 110 - diff * 16),
          y: borner(prec.y + entre(rng, -25, 35), 50, 185),
          ratio: ratio(),
        });
      }
      colonne({ w: entre(rng, 180, 280) });
    } else if (rng() < 0.2 && !prec.flottante && !prec.fragile && prec.w >= 120) {
      // Benne sur le trottoir : on monte dessus, on redescend.
      const base = prec.y;
      const benne = ajouter({ flottante: false, type: 'benne', base, w: entre(rng, 56, 78), y: base + 34, ecart: 0 });
      if (benne.y - base < 10) benne.type = typeColonne(benne.y);
      ajouter({ flottante: false, w: entre(rng, 170, 270), y: base, ecart: 0 });
    } else {
      colonne();
    }
  }
  // Arrivée : le trottoir devant la porte du client.
  const fin = ajouter({
    flottante: false,
    w: 380,
    y: prec.y,
    ratio: Math.min(ratio(), 0.6),
  });
  delete fin.fragile;
  fin.arrivee = true;
  const porte = { x: fin.x + fin.w - 110, y: fin.y, ...TAILLES.porte };

  // Objets : colis, boîtes aux lettres, caisses bonus, gêneurs.
  const colis = [];
  const boites = [];
  const geneurs = [];
  const C = TAILLES.colis;
  const B = TAILLES.boite;
  let nbCaisses = 0;
  const caisse = (x, y) => {
    boites.push({ x: Math.round(x), y, w: B, h: B, boite: true, frappee: false, bonus: BONUS_CAISSE[(n + nbCaisses) % BONUS_CAISSE.length] });
    nbCaisses += 1;
  };
  // Une caisse bonus sur le trottoir de départ, à chaque niveau.
  caisse(130, 66);
  for (let i = 0; i < plateformes.length; i += 1) {
    const p = plateformes[i];
    const suivante = plateformes[i + 1];
    const debut = Math.max(p.x, -120);
    const largeurUtile = p.x + p.w - debut;
    if (p.mobile) continue;
    if (p.flottante) {
      if (rng() < 0.5) colis.push({ x: p.x + p.w / 2 - C / 2, y: p.y + 34 });
    } else if (p.type !== 'benne' && !p.arrivee && !p.fragile) {
      if (largeurUtile >= 110 && rng() < 0.65) {
        const nb = largeurUtile >= 220 ? 3 : 2;
        const x0 = debut + largeurUtile / 2 - (nb * 28) / 2;
        for (let k = 0; k < nb; k += 1) colis.push({ x: x0 + k * 28, y: p.y + 40 });
      }
      let geneurPose = false;
      // Gêneurs : jamais sur les DEGAGEMENT_ATTERRISSAGE premières unités (on y atterrit).
      if (i > 0 && suivante && p.w >= LARGEUR_MIN_GENEUR && rng() < r.probGeneur) {
        const nb = p.w >= 300 && n >= 3 ? 2 : 1;
        const zx1 = p.x + DEGAGEMENT_ATTERRISSAGE;
        const zx2 = p.x + p.w - 30;
        for (let k = 0; k < nb; k += 1) {
          const type = r.types[Math.floor(rng() * r.types.length)];
          const t = TAILLES[type];
          const x1 = zx1 + (k * (zx2 - zx1)) / nb;
          const x2 = zx1 + ((k + 1) * (zx2 - zx1)) / nb - t.w - (k < nb - 1 ? 8 : 0);
          if (x2 - x1 < 30) continue;
          const x = x1 + rng() * (x2 - x1);
          geneurPose = true;
          if (type === 'pigeon') {
            const haut = 46 - Math.min(12, diff * 16);
            geneurs.push({
              type, x, y: p.y + haut, base: p.y + haut, cx: (x1 + x2) / 2, amp: (x2 - x1) / 2,
              vitesse: (1.1 + diff * 0.8) * r.vitesseGeneurs, phase: rng() * 6.28, w: t.w, h: t.h, dir: -1,
            });
          } else {
            const v = (type === 'chien' ? 45 + diff * 45 : 90 + diff * 50) * r.vitesseGeneurs;
            geneurs.push({ type, x, y: p.y, x1, x2, vx: -v, w: t.w, h: t.h, dir: -1 });
          }
        }
      }
      // Caisse bonus ou boîte aux lettres, au milieu du toit, loin des bords.
      if (i > 0 && suivante && !geneurPose && p.w >= 170 && rng() < r.probCaisse) {
        caisse(p.x + p.w / 2 - B / 2, p.y + 66);
      } else if (i > 0 && suivante && largeurUtile >= 250 && rng() < 0.5) {
        const bx = debut + 140 + rng() * (largeurUtile - 220 - B);
        boites.push({ x: Math.round(bx), y: p.y + 66, w: B, h: B, boite: true, frappee: false });
      }
    }
    // Colis sur la trajectoire d'un saut.
    if (suivante && !suivante.mobile && suivante.x - (p.x + p.w) >= 40 && rng() < 0.45) {
      colis.push({ x: (p.x + p.w + suivante.x) / 2 - C / 2, y: Math.max(hautDe(p), suivante.y) + 52 });
    }
  }
  colis.forEach((c, k) => { c.id = k; c.pris = false; });
  boites.forEach((b, k) => { b.id = k; b.choc = 0; });
  geneurs.forEach((g, k) => { g.id = k; g.actif = true; g.ecarte = 0; g.temps = 0; });

  const { decor, motif } = decorNiveau(n);
  return {
    niveau: n,
    longueur: fin.x + fin.w,
    plateformes,
    boites,
    colis,
    geneurs,
    porte,
    depart: { x: 20, y: 0 },
    decor,
    motif,
    limite: r.limite,
    tempsCible: r.limite,
  };
}

// ---- Partie ----
/** Monde d'un niveau. `report` : { score, vies, pieces, grand } de la partie en cours. */
export function creerMonde(niveau, report = {}, graine) {
  const niv = genererNiveau(niveau, graine);
  return {
    ...niv,
    joueur: nouveauJoueur(niv.depart.x, niv.depart.y),
    vies: report.vies != null ? report.vies : VIES,
    score: report.score || 0,
    pieces: Math.max(0, Math.floor(Number(report.pieces) || 0)),
    grand: !!report.grand,
    colisNiveau: 0,
    ecartesNiveau: 0,
    temps: 0,
    invul: 0,
    attente: false,
    attenteArmee: false,
    vol: 0,
    etoile: 0,
    aimant: 0,
    double: 0,
    etat: 'jeu', // jeu | livre | perdu
    bonusTemps: 0,
    dernierSol: niv.plateformes[0],
    reste: niv.limite,
    cause: null,
    popups: [],
    sorties: [],
    annonce: null,
    horloge: 0,
  };
}

function popup(m, x, y, texte) {
  m.popups.push({ x, y, texte, age: 0, id: `${m.horloge.toFixed(3)}_${m.popups.length}` });
  if (m.popups.length > 8) m.popups.shift();
}

// Annonce en haut de la scène, sous le score : clé de texte traduite, durée 1,8 s.
const ANNONCES = {
  vie: { cle: 'jeuxToitsBonusVie', icone: 'heart', couleur: '#E74C3C' },
  aimant: { cle: 'jeuxToitsBonusAimant', icone: 'magnet', couleur: '#8E44AD', n: DUREES.aimant },
  taille: { cle: 'jeuxToitsBonusTaille', icone: 'shield-star', couleur: '#0A9A78' },
  vol: { cle: 'jeuxToitsBonusVol', icone: 'quadcopter', couleur: '#2D7FD3', n: DUREES.vol },
  etoile: { cle: 'jeuxToitsBonusEtoile', icone: 'star', couleur: '#E0A100', n: DUREES.etoile },
  chrono: { cle: 'jeuxToitsBonusChrono', icone: 'timer-plus-outline', couleur: '#16A34A', n: BONUS_CHRONO },
  double: { cle: 'jeuxToitsBonusDouble', icone: 'numeric-2-circle', couleur: '#E8650F', n: DUREES.double },
  encaisse: { cle: 'jeuxToitsCoupEncaisse', icone: 'shield-check', couleur: '#0A9A78' },
};
function annoncer(m, type) {
  m.annonce = { ...ANNONCES[type], type, age: 0, id: `${type}_${m.horloge.toFixed(3)}` };
}

// Un colis de plus : tous les PALIER_PIECES, une vie (si il en manque), sinon un aimant.
function gagnerPiece(m, evenements) {
  m.pieces += 1;
  if (m.pieces % PALIER_PIECES !== 0) return;
  if (m.vies < VIES) {
    m.vies += 1;
    annoncer(m, 'vie');
  } else {
    m.aimant = DUREES.aimant;
    annoncer(m, 'aimant');
  }
  evenements.push({ type: 'bonus' });
}

function appliquerCaisse(m, b, evenements) {
  const type = b.bonus;
  if (type === 'taille') m.grand = true;
  else if (type === 'vol') m.vol = DUREES.vol;
  else if (type === 'etoile') m.etoile = DUREES.etoile;
  else if (type === 'chrono') m.reste += BONUS_CHRONO;
  else if (type === 'double') m.double = DUREES.double;
  m.score += POINTS.caisse;
  m.sorties.push({ type, x: b.x + b.w / 2, y: b.y + b.h, age: 0, id: `s${b.id}` });
  annoncer(m, type);
  evenements.push({ type: 'bonus' });
}

// Points d'un objet ramassé ou d'un gêneur écarté : doublés pendant le bonus « double ».
function points(m, base) {
  return m.double > 0 ? base * 2 : base;
}

function chevauche(j, e, marge) {
  const h = j.accroupi ? HAUTEUR_ACCROUPI : HAUTEUR;
  return j.x + LARGEUR - marge > e.x && j.x + marge < e.x + e.w
    && j.y + h - marge > e.y && j.y + marge < e.y + e.h;
}

function perdreVie(m, evenements, cause) {
  m.vies -= 1;
  evenements.push({ type: cause });
  if (m.vies <= 0) {
    m.vies = 0;
    m.etat = 'perdu';
  }
}

/**
 * Reprise sûre après une chute ou un coup : point sûr (pointDeReprise),
 * livreur immobile et invincible jusqu'au prochain geste, puis encore
 * INVUL_REPRISE secondes.
 */
export function reapparaitre(m, xMort) {
  m.plateformes.forEach((p) => {
    if (p.fragile) {
      p.tombe = 0;
      p.effondre = false;
      p.chute = 0;
      p.reforme = 0;
    }
  });
  const { p, x } = pointDeReprise(m, xMort);
  m.joueur = nouveauJoueur(x, hautDe(p));
  m.joueur.sol = p;
  m.dernierSol = p;
  m.attente = true;
  m.attenteArmee = false;
  m.invul = INVUL_REPRISE;
  m.vol = 0;
}

const CMD_VIDE = { gauche: false, droite: false, sautTenu: false, sautAppui: false, bas: false };

/**
 * Avance le monde de `dt` secondes (borné, découpé en petits pas).
 * `cmd` : { gauche, droite, sautTenu, sautAppui, bas, geste } (sautAppui :
 * appui neuf, bas : accroupi demandé, geste : nouveau geste gauche, droite ou
 * haut ce tour-ci, il relance le livreur après une reprise).
 * Rend la liste des événements : colis, boite, bonus, ecarte, encaisse,
 * touche, chute, temps, livre, reprise.
 */
export function pas(m, dtBrut, cmd) {
  const evenements = [];
  if (m.etat !== 'jeu') return evenements;
  const dtTotal = borner(dtBrut || 0, 0, 0.05);
  if (m.attente && m.attenteArmee && (cmd.geste || cmd.sautAppui)) {
    m.attente = false;
    m.invul = INVUL_REPRISE;
    evenements.push({ type: 'reprise' });
  }
  if (cmd.sautAppui && !m.attente) demanderSaut(m.joueur);
  const n = Math.max(1, Math.ceil(dtTotal / PAS_MAX));
  const dt = dtTotal / n;
  for (let k = 0; k < n && m.etat === 'jeu'; k += 1) sousPas(m, dt, m.attente ? CMD_VIDE : cmd, evenements);
  if (m.attente) m.attenteArmee = true;
  for (let i = m.popups.length - 1; i >= 0; i -= 1) {
    m.popups[i].age += dtTotal;
    if (m.popups[i].age > 0.9) m.popups.splice(i, 1);
  }
  for (let i = m.sorties.length - 1; i >= 0; i -= 1) {
    m.sorties[i].age += dtTotal;
    if (m.sorties[i].age > 0.9) m.sorties.splice(i, 1);
  }
  if (m.annonce) {
    m.annonce.age += dtTotal;
    if (m.annonce.age > 1.8) m.annonce = null;
  }
  return evenements;
}

function sousPas(m, dtPas, cmdBrut, evenements) {
  const dt = dtPas;
  let cmd = cmdBrut;
  const j = m.joueur;
  m.temps += dt;
  m.horloge += dt;
  if (m.invul > 0 && !m.attente) m.invul -= dt;
  if (m.vol > 0) m.vol = Math.max(0, m.vol - dt);
  if (m.etoile > 0) m.etoile = Math.max(0, m.etoile - dt);
  if (m.aimant > 0) m.aimant = Math.max(0, m.aimant - dt);
  if (m.double > 0 && !m.attente) m.double = Math.max(0, m.double - dt);
  j.vol = m.vol > 0;
  const avantY = j.y;

  // Plateformes mobiles (elles emportent le livreur) et toits qui s'effondrent.
  for (let i = 0; i < m.plateformes.length; i += 1) {
    const p = m.plateformes[i];
    if (p.mobile) {
      const np = positionMobile(p, m.horloge);
      if (j.sol === p) {
        j.x += np.x - p.x;
        j.y = np.y;
      }
      p.x = np.x;
      p.y = np.y;
    } else if (p.fragile) {
      if (p.effondre) {
        p.chute += (160 + p.chute * 2) * dt;
        // Le toit se reforme : on n'est jamais bloqué devant un trou devenu trop grand.
        p.reforme += dt;
        if (p.reforme > 3.5 && !(j.x + LARGEUR > p.x && j.x < p.x + p.w)) {
          p.effondre = false;
          p.tombe = 0;
          p.chute = 0;
          p.reforme = 0;
        }
      } else if (p.tombe > 0) {
        p.tombe += dt;
        if (p.tombe >= p.retard) p.effondre = true;
      }
    }
  }
  if (j.sol && j.sol.fragile && !j.sol.effondre && !(j.sol.tombe > 0)) j.sol.tombe = 0.0001;

  // Chrono (arrêté pendant l'attente de reprise) : à zéro, une vie est perdue.
  if (!m.attente) m.reste -= dt;
  if (m.reste <= 0) {
    m.reste = RESERVE_TEMPS;
    m.invul = INVUL_REPRISE;
    perdreVie(m, evenements, 'temps');
    if (m.etat !== 'jeu') return;
  }

  // Accroupi : seulement au sol, jamais en plein saut.
  const etaitAccroupi = j.accroupi;
  j.accroupi = !!(cmd.bas && j.sol && !(j.tampon > 0));
  if (j.accroupi && !etaitAccroupi) evenements.push({ type: 'accroupi' });
  if (m.attente) cmd = CMD_VIDE;
  const frappee = physiqueJoueur(j, m.plateformes, m.boites, cmd, dt);
  if (frappee && !frappee.frappee) {
    frappee.frappee = true;
    frappee.choc = 0.25;
    if (frappee.bonus) {
      appliquerCaisse(m, frappee, evenements);
    } else {
      const pts = points(m, POINTS.boite);
      m.score += pts;
      m.colisNiveau += 1;
      popup(m, frappee.x + frappee.w / 2, frappee.y + frappee.h + 6, `+${pts}`);
      evenements.push({ type: 'boite' });
      gagnerPiece(m, evenements);
    }
  } else if (frappee) {
    frappee.choc = 0.15;
  }
  m.boites.forEach((b) => { if (b.choc > 0) b.choc -= dt; });
  if (j.sol && !j.sol.flottante && !j.sol.boite && !j.sol.fragile && !j.sol.mobile && j.sol.type !== 'benne') m.dernierSol = j.sol;

  // Colis (attirés par l'aimant).
  const C = TAILLES.colis;
  for (let i = 0; i < m.colis.length; i += 1) {
    const c = m.colis[i];
    if (c.pris) continue;
    if (m.aimant > 0) {
      const dx = j.x + LARGEUR / 2 - (c.x + C / 2);
      const dy = j.y + HAUTEUR / 2 - (c.y + C / 2);
      const d = Math.hypot(dx, dy);
      if (d < RAYON_AIMANT && d > 1) {
        const v = Math.min(d, 320 * dt);
        c.x += (dx / d) * v;
        c.y += (dy / d) * v;
      }
    }
    if (Math.abs(c.x - j.x) > 60) continue;
    if (chevauche(j, { x: c.x, y: c.y, w: C, h: C }, 1)) {
      c.pris = true;
      const pts = points(m, POINTS.colis);
      m.score += pts;
      m.colisNiveau += 1;
      popup(m, c.x + C / 2, c.y + C, `+${pts}`);
      evenements.push({ type: 'colis' });
      gagnerPiece(m, evenements);
    }
  }

  // Gêneurs.
  for (let i = 0; i < m.geneurs.length; i += 1) {
    const e = m.geneurs[i];
    if (!e.actif) continue;
    e.temps += dt;
    if (e.ecarte > 0) {
      e.ecarte += dt;
      e.y += 120 * dt;
      e.x += 90 * dt * (e.dir || 1);
      if (e.ecarte > 0.7) e.actif = false;
      continue;
    }
    if (e.type === 'pigeon') {
      const nx = e.cx + Math.sin(e.temps * e.vitesse + e.phase) * e.amp;
      e.dir = nx >= e.x ? 1 : -1;
      e.x = nx;
      e.y = e.base + Math.sin(e.temps * 2.3 + e.phase) * 6;
    } else {
      e.x += e.vx * dt;
      if (e.x < e.x1) { e.x = e.x1; e.vx = Math.abs(e.vx); }
      if (e.x > e.x2) { e.x = e.x2; e.vx = -Math.abs(e.vx); }
      e.dir = e.vx >= 0 ? 1 : -1;
    }
    if (m.joueur !== j || Math.abs(e.x - j.x) > 80 || !chevauche(j, e, 3)) continue;
    const parDessus = j.vy < 0 && avantY >= e.y + e.h - 10;
    if (parDessus || m.etoile > 0) {
      // Par-dessus (ou avec l'étoile) : le gêneur est écarté.
      e.ecarte = 0.001;
      if (parDessus) {
        j.vy = cmd.sautTenu ? REBOND_TENU : REBOND;
        j.enSaut = !!cmd.sautTenu;
        j.tenue = TENUE_MAX;
      }
      const pts = points(m, POINTS[e.type] || 100);
      m.score += pts;
      m.ecartesNiveau += 1;
      popup(m, e.x + e.w / 2, e.y + e.h, `+${pts}`);
      evenements.push({ type: 'ecarte' });
    } else if (m.invul <= 0) {
      if (m.grand) {
        // Grand livreur : il perd sa taille au lieu d'une vie, et reste en place.
        m.grand = false;
        m.invul = INVUL_REPRISE;
        annoncer(m, 'encaisse');
        evenements.push({ type: 'encaisse' });
        continue;
      }
      perdreVie(m, evenements, 'touche');
      if (m.etat !== 'jeu') return;
      reapparaitre(m, j.x);
      return;
    }
  }

  // Chute dans un trou.
  if (j.y < LIMITE_CHUTE) {
    perdreVie(m, evenements, 'chute');
    if (m.etat !== 'jeu') return;
    reapparaitre(m, j.x);
    return;
  }

  // Porte du client.
  if (j.sol && j.sol.arrivee && j.x + LARGEUR >= m.porte.x + 10) {
    m.etat = 'livre';
    const restant = Math.max(0, Math.floor(m.reste));
    m.bonusTemps = restant * POINTS.seconde;
    m.score += POINTS.livraison + m.bonusTemps;
    evenements.push({ type: 'livre' });
  }
}

/** Avancée dans le niveau, de 0 à 1. */
export function avancee(m) {
  const debut = m.depart.x;
  return borner((m.joueur.x - debut) / Math.max(1, m.porte.x - debut), 0, 1);
}

/** Éléments dont l'étendue [x, x + w] croise la fenêtre [x1, x2]. */
export function visibles(liste, x1, x2) {
  const r = [];
  for (let i = 0; i < liste.length; i += 1) {
    const o = liste[i];
    const w = o.w || TAILLES.colis;
    if (o.x + w >= x1 && o.x <= x2) r.push(o);
  }
  return r;
}

/** Immeubles du fond (décor, défilement plus lent). */
export function genererFond(niveau, longueur) {
  const rng = alea(niveau * 104729 + 7);
  const fond = [];
  let x = -400;
  while (x < longueur * 0.6 + 800) {
    const w = 50 + rng() * 70;
    fond.push({ id: fond.length, x, w, h: 90 + rng() * 150 });
    x += w + 4 + rng() * 20;
  }
  return fond;
}
