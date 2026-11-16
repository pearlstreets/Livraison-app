/**
 * Mini-jeu « Tournée des toits » : logique pure (sans React), testable sous node.
 * Même logique que l'app client (AppUser, src/utils/jeux/toits.js), sans la
 * sauvegarde (ici : utils/partieSauvegardee.js, côté écran).
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
 *
 * Terrains (`TERRAINS`) : un terrain différent à chaque niveau (ruelles,
 * chantier, canal, terrasses, usine, tours, balcons, docks), chacun avec ses
 * passages : ascenseurs de chantier (montent et descendent, s'arrêtent en bas
 * et en haut), bassins, fontaines et canaux (on y nage : on flotte, on avance
 * moins vite, un geste vers le haut fait remonter ou sortir), gouttières (on
 * y grimpe à coups de gestes vers le haut), bouches d'aération (glisser vers
 * le bas dessus : on passe dans le conduit et on ressort plus loin), conduits
 * et balcons en hauteur. Difficulté (`reglagesNiveau`) : douce mais nette dès
 * le niveau 1, en hausse à chaque niveau, plafonnée (jamais impossible).
 */

export const JEU_TOITS = 'toits';

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
// Ressort posé sur un toit : il renvoie le livreur bien plus haut qu'un saut (geste tenu : encore plus haut).
export const RESSORT = 960;
export const RESSORT_TENU = 1060;
export const TAILLE_RESSORT = { w: 24, h: 14 };
// Étages : passerelles empilées au-dessus d'un toit, une marche franchissable d'un saut entre deux.
export const MARCHE_ETAGE = 70;
const CHUTE_VOL = 110;
const PLAFOND_VOL = 330;

// Nage : dans l'eau, le livreur flotte (poussée), avance moins vite ; un geste
// vers le haut le fait remonter (brasse) ou sortir de l'eau (tête dehors).
export const NAGE = {
  vitesse: 0.55, gravite: 520, poussee: 980, trainee: 2.4, plongeeMax: 110, brasse: 300, sortie: 560, plongee: 700,
};
export const GRIMPE = 420; // geste vers le haut contre une gouttière : le livreur grimpe
const GLISSE = 60; // contre une gouttière, il glisse lentement au lieu de tomber
export const PASSAGE = { duree: 0.7, sortie: 380 }; // bouche d'aération : durée du conduit, élan à la sortie

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
export const LARGEUR_MIN_GENEUR = 160;

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
 * `env` (facultatif) : { eaux, gouttieres } du niveau. Sans `env`, tout est sec
 * (les simulations de saut de la génération).
 */
export function physiqueJoueur(j, plateformes, boites, cmd, dt, env) {
  const eau = env ? eauSous(j, env.eaux) : null;
  const gout = env && !j.sol && !eau ? gouttiereContre(j, env.gouttieres) : null;
  j.dansEau = !!eau;
  j.grimpe = false;
  const dir = (cmd.droite ? 1 : 0) - (cmd.gauche ? 1 : 0);
  if (j.recul > 0) j.recul -= dt;
  if (dir && j.recul <= 0) {
    const acc = j.sol ? ACCEL_SOL : ACCEL_AIR;
    // Demi-tour : freinage plus vif, plus nerveux.
    const bonus = Math.sign(j.vx) === -dir ? 1.6 : 1;
    let vmax = j.accroupi ? VITESSE * FREIN_ACCROUPI : VITESSE;
    if (eau) vmax = VITESSE * NAGE.vitesse;
    j.vx = borner(j.vx + dir * acc * bonus * dt, -vmax, vmax);
    j.dir = dir;
  } else {
    const frein = (j.sol ? FREIN_SOL : FREIN_AIR * (eau ? 2 : 1)) * dt;
    j.vx = Math.abs(j.vx) <= frein ? 0 : j.vx - Math.sign(j.vx) * frein;
  }
  if (eau) j.vx = borner(j.vx, -VITESSE * NAGE.vitesse, VITESSE * NAGE.vitesse); // l'eau absorbe l'élan

  // Saut (avec tolérance au bord et à l'appui anticipé).
  if (j.sol) j.coyote = COYOTE; else j.coyote -= dt;
  if (j.tampon > 0) j.tampon -= dt;
  if (eau && j.tampon > 0) {
    // Dans l'eau : tête dehors, on sort d'un vrai saut ; sous l'eau, une brasse fait remonter.
    const tete = j.y + HAUTEUR > eau.eau + 4;
    j.vy = tete ? NAGE.sortie : Math.max(j.vy, NAGE.brasse);
    j.enSaut = tete;
    j.tenue = 0;
    j.coyote = 0;
    j.tampon = 0;
    j.sol = null;
  } else if (gout && j.tampon > 0) {
    // Contre une gouttière : chaque geste vers le haut fait grimper.
    j.vy = Math.max(j.vy, GRIMPE);
    j.enSaut = true;
    j.tenue = 0;
    j.coyote = 0;
    j.tampon = 0;
    j.grimpe = true;
  } else if (j.tampon > 0 && (j.coyote > 0 || j.vol)) {
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
  if (eau && !(j.enSaut && j.vy > 0)) {
    // Flottaison : la poussée grandit avec la part du livreur sous l'eau ; glisser vers le bas : il plonge.
    const im = borner((eau.eau - j.y) / HAUTEUR, 0, 1);
    j.vy += (NAGE.poussee * im - NAGE.gravite) * dt;
    if (cmd.bas) j.vy -= NAGE.plongee * dt;
    j.vy -= j.vy * NAGE.trainee * dt;
    j.vy = Math.max(-NAGE.plongeeMax, j.vy);
  } else {
    j.vy = Math.max(j.vol ? -CHUTE_VOL : -CHUTE_MAX, j.vy - g * dt);
    if (gout && j.vy < -GLISSE) j.vy = -GLISSE;
  }

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

/** Bassin dans lequel le livreur nage (centre au-dessus, pieds sous la surface), sinon null. */
export function eauSous(j, eaux) {
  if (!eaux || !eaux.length) return null;
  const cx = j.x + LARGEUR / 2;
  for (let i = 0; i < eaux.length; i += 1) {
    const e = eaux[i];
    if (cx > e.x && cx < e.x + e.w && j.y < e.eau && j.y > e.y - 2) return e;
  }
  return null;
}

/** Gouttière contre laquelle le livreur se tient (face gauche d'un immeuble), sinon null. */
export function gouttiereContre(j, gouttieres) {
  if (!gouttieres || !gouttieres.length) return null;
  for (let i = 0; i < gouttieres.length; i += 1) {
    const g = gouttieres[i];
    if (Math.abs(j.x + LARGEUR - g.x) < 3 && j.y < g.haut && j.y + HAUTEUR > g.bas) return g;
  }
  return null;
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
  let declencheur = a.x + a.w - LARGEUR * 0.6 - avance;
  // Mur juste devant (marche collée, sortie de bassin) : on saute avant de le toucher.
  if (!b.flottante && b.y > hautDe(a)) declencheur = Math.min(declencheur, b.x - LARGEUR - 0.5 - avance);
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

/**
 * Montée vers une passerelle au-dessus (étages) : départ arrêté sur `a`, juste
 * avant le bord gauche de `b`, saut maintenu vers la droite. Vrai si on se pose sur `b`.
 */
export function peutMonter(a, b) {
  const j = nouveauJoueur(Math.max(a.x + 2, b.x - LARGEUR - 10), hautDe(a));
  j.sol = a;
  demanderSaut(j);
  const cmd = { gauche: false, droite: true, sautTenu: true };
  for (let t = 0; t < 3; t += PAS_MAX) {
    const centre = b.x + b.w / 2 - LARGEUR / 2;
    if (j.vy < 0 && j.x >= centre - 4) {
      cmd.droite = false;
      cmd.gauche = j.vx > 0;
    }
    physiqueJoueur(j, [a, b], [], cmd, PAS_MAX);
    if (j.sol === b) return true;
    if (t > 0.05 && j.sol === a) return false;
    if (j.y < LIMITE_CHUTE) return false;
  }
  return false;
}

/**
 * Gouttière : `b` (immeuble plus haut, collé à `a`) porte une gouttière sur sa
 * face gauche. On avance vers la droite et on fait un geste vers le haut toutes
 * les 0,4 s. Vrai si on se pose sur le toit de `b`.
 */
export function peutGrimper(a, b) {
  const j = nouveauJoueur(Math.max(a.x + 2, b.x - LARGEUR - 40), hautDe(a));
  j.sol = a;
  const env = { eaux: [], gouttieres: [{ x: b.x, bas: hautDe(a), haut: b.y }] };
  const cmd = { gauche: false, droite: true, sautTenu: true };
  let geste = -1;
  for (let t = 0; t < 6; t += PAS_MAX) {
    if (t - geste >= 0.4) {
      demanderSaut(j);
      geste = t;
    }
    cmd.sautTenu = t - geste < 0.3;
    physiqueJoueur(j, [a, b], [], cmd, PAS_MAX, env);
    if (j.sol === b) return true;
    if (j.y < LIMITE_CHUTE) return false;
  }
  return false;
}

// ---- Génération des niveaux ----
function entre(rng, min, max) {
  return min + rng() * Math.max(0, max - min);
}

/**
 * Mondes : NIVEAUX_PAR_MONDE niveaux par monde, puis on passe au suivant (et on
 * recommence le tour après le dernier). Chaque monde : ambiance de base
 * (`decor` : jour, soir, nuit, pluie, lue par la palette du décor), motifs des
 * toits (un par niveau du monde), couleurs propres (ciel, immeubles, toits) et
 * éléments de fond (`elements` : dessinés au loin ; `particules` : à l'écran).
 */
export const NIVEAUX_PAR_MONDE = 2;
export const MONDES = [
  { id: 'ville', decor: 'jour', motifs: ['tuiles', 'terrasse'], couleurs: {}, elements: [], particules: null },
  {
    id: 'port', decor: 'soir', motifs: ['briques', 'tuiles'],
    couleurs: { horizon: '#FBD0A6', loin: '#C98B7F', mer: '#3E6E8E', merClair: '#F6B07A' },
    elements: ['bateau'], particules: null,
  },
  {
    id: 'neons', decor: 'nuit', motifs: ['ardoise', 'terrasse'],
    couleurs: {
      ciel: '#170F33', cielHaut: '#110A28', horizon: '#3B2470', fond: '#24184A', fondHaut: '#2F2160',
      loin: '#2A1D55', fenetre: '#FF6FD8', nuage: '#2E2258',
    },
    elements: ['enseigne'], particules: null,
  },
  { id: 'pluie', decor: 'pluie', motifs: ['terrasse', 'ardoise'], couleurs: {}, elements: ['antenne'], particules: 'pluie' },
  {
    id: 'hiver', decor: 'jour', motifs: ['ardoise', 'tuiles'],
    couleurs: {
      ciel: '#DCE8F2', cielHaut: '#B8CEE2', horizon: '#F2F6FA', fond: '#B9C9D8', fondHaut: '#EEF4F9',
      loin: '#D3DFE9', toitBord: '#F4F8FB', trottoir: '#C6D0D9', bordure: '#FFFFFF', astre: '#FFE9A8', nuage: '#FFFFFF',
    },
    elements: ['sapin'], particules: 'neige',
  },
  {
    id: 'chantier', decor: 'jour', motifs: ['briques', 'terrasse'],
    couleurs: {
      ciel: '#E8D6B0', cielHaut: '#D9BE8C', horizon: '#F6EAD0', fond: '#B9A88C', fondHaut: '#A8957A',
      loin: '#CDBFA6', planche: '#E8A33D', poteau: '#C98A1B', nuage: '#FBF3E2',
    },
    elements: ['grue'], particules: null,
  },
  {
    id: 'marche', decor: 'soir', motifs: ['tuiles', 'briques'],
    couleurs: {
      ciel: '#E9A15B', cielHaut: '#C9703F', horizon: '#F7D3A6', fond: '#9C5B3E', fondHaut: '#86472F',
      loin: '#C99474', toit: '#9E3D22', nuage: '#FFE2C4',
    },
    elements: ['arbre'], particules: 'feuilles', lampions: true,
  },
];

/** Monde, ambiance et motif des toits d'un niveau : le décor change à chaque niveau et à chaque monde. */
export function decorNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const rang = Math.floor((n - 1) / NIVEAUX_PAR_MONDE);
  const monde = MONDES[rang % MONDES.length];
  const k = (n - 1) % NIVEAUX_PAR_MONDE;
  return {
    decor: monde.decor,
    motif: monde.motifs[k % monde.motifs.length],
    monde: monde.id,
    numeroMonde: rang + 1,
    niveauDansMonde: k + 1,
  };
}

/** Monde (couleurs, éléments de fond, particules) d'après son id ; repli : la ville. */
export function mondeParId(id) {
  return MONDES.find((x) => x.id === id) || MONDES[0];
}

/**
 * Terrains : chaque niveau a son terrain (8, puis on recommence le tour), et
 * dès le niveau 4 un ou deux passages obligés d'un second terrain s'y ajoutent. `poids` :
 * part de chaque passage dans le tirage ; `obligatoires` : passages posés à
 * coup sûr dans le niveau ; `gue` : pierres de gué du terrain ; `eau` : genre
 * de bassin ; `hautMax` : hauteur maximale des immeubles.
 */
export const TERRAINS = [
  {
    id: 'ruelles', poids: { enchaine: 0.5, gue: 0.5, benne: 0.5, eau: 0.5, bouche: 0.4 },
    obligatoires: ['eau', 'etage'], gue: ['auvent', 'balcon'], eau: 'fontaine', hautMax: 150,
  },
  {
    id: 'chantier', poids: { gue: 0.6, nacelle: 0.6, ascenseur: 0.8, benne: 0.6, fragile: 0.6 },
    obligatoires: ['ascenseur', 'etage'], gue: ['echafaudage'], eau: 'bassin', hautMax: 200,
  },
  {
    id: 'canal', poids: { eau: 1.4, gue: 0.5, enchaine: 0.5, nacelle: 0.5 },
    obligatoires: ['eau', 'eau', 'gouttiere'], gue: ['auvent', 'conduit'], eau: 'canal', hautMax: 170,
  },
  {
    id: 'terrasses', poids: { eau: 0.8, enchaine: 0.6, fragile: 0.6, gue: 0.5 },
    obligatoires: ['eau', 'bouche', 'etage'], gue: ['auvent'], eau: 'bassin', hautMax: 200,
  },
  {
    id: 'usine', poids: { gouttiere: 0.9, bouche: 0.8, gue: 0.6, fragile: 0.6 },
    obligatoires: ['gouttiere', 'bouche'], gue: ['conduit'], eau: 'inonde', hautMax: 230,
  },
  {
    id: 'tours', poids: { ascenseur: 0.9, gouttiere: 0.8, enchaine: 0.6 },
    obligatoires: ['ascenseur', 'gouttiere', 'etage'], gue: ['balcon', 'echafaudage'], eau: 'bassin', hautMax: 280,
  },
  {
    id: 'balcons', poids: { gue: 1.6, gouttiere: 0.7, fragile: 0.6, nacelle: 0.6 },
    obligatoires: ['gouttiere', 'etage'], gue: ['balcon'], eau: 'inonde', hautMax: 240,
  },
  {
    id: 'docks', poids: { eau: 0.9, nacelle: 0.7, ascenseur: 0.7, benne: 0.6 },
    obligatoires: ['eau', 'ascenseur'], gue: ['conduit', 'auvent'], eau: 'canal', hautMax: 180,
  },
];

/**
 * Terrain d'un niveau et passages obligés. Un passage d'un second terrain
 * s'y ajoute dès le niveau 4 (deux dès le niveau 9), pris dans un terrain qui
 * change à chaque tour de 8 niveaux : les combinaisons ne se répètent pas.
 */
export function terrainNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const k = (n - 1) % TERRAINS.length;
  const terrain = TERRAINS[k];
  const obligatoires = terrain.obligatoires.slice();
  if (n >= 4) {
    const tour = Math.floor((n - 1) / TERRAINS.length);
    // Décalage impair : jamais le terrain du niveau lui-même.
    const autre = TERRAINS[(k + 3 + 2 * tour) % TERRAINS.length];
    // Un passage de cet autre terrain (deux dès le niveau 9), pris à tour de rôle : le niveau reste court.
    const extras = autre.obligatoires.filter((o) => o !== 'etage' && !obligatoires.includes(o));
    const nb = Math.min(extras.length, n >= 9 ? 2 : 1);
    for (let i = 0; i < nb; i += 1) obligatoires.push(extras[(n + i) % extras.length]);
  }
  return { terrain, obligatoires };
}

/**
 * Difficulté raide et variée, jamais impossible. `diff` monte de 0,5 (niveau 1)
 * à 1 (niveau 8) : le niveau 1 est une prise en main courte mais déjà pas
 * triviale, dès les niveaux 3 et 4 le parcours devient dur, un joueur moyen
 * s'arrête vers les niveaux 5 à 8. Ensuite `plus` ajoute une pente jusqu'au
 * niveau 20, et c'est le plafond. Chaque niveau est plus dur que le précédent :
 * trous plus larges, toits plus étroits, gêneurs plus nombreux et plus rapides,
 * plus de nacelles, de toits fragiles (qui cèdent plus vite) et de sauts
 * enchaînés, plus de défis combinés (enchaînements mêlés, toits gardés, deux
 * nacelles de suite), chrono plus serré. Les niveaux sont plus courts qu'avant :
 * une bonne partie dure quelques minutes. Trous et marches restent sous les
 * bornes mesurées (RATIO_MAX, MONTEE_MAX, portée réelle du saut) : chaque
 * niveau reste faisable, mais exigeant.
 */
export function reglagesNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const k = Math.min(1, (n - 1) / 7);
  const diff = 0.5 + 0.5 * (1 - (1 - k) ** 2);
  const plus = Math.min(1, Math.max(0, (n - 8) / 12));
  const longueur = Math.min(4300, 1700 + (n - 1) * 220);
  const facteur = 2.3 - 0.55 * diff - 0.25 * plus;
  return {
    n,
    diff,
    dur: plus,
    longueur,
    // Trous en part de la portée réelle du saut, jamais plus de RATIO_MAX.
    ratioMin: 0.3 + 0.3 * diff + 0.04 * plus,
    ratioMax: Math.min(RATIO_MAX, 0.54 + 0.16 * diff + 0.02 * plus),
    // Marches (montée ou descente) entre deux plateformes.
    marche: Math.round(MONTEE_MAX * (0.65 + 0.35 * diff)),
    // Largeur des toits : de plus en plus étroits.
    largeurMin: Math.max(110, 190 - 75 * diff - 5 * plus),
    largeurMax: Math.max(190, 330 - 110 * diff),
    probMobile: 0.1 + 0.15 * diff + 0.05 * plus,
    probFragile: 0.1 + 0.15 * diff + 0.05 * plus,
    probEnchaine: 0.18 + 0.18 * diff + 0.05 * plus,
    probGeneur: Math.min(0.92, 0.45 + 0.35 * diff + 0.12 * plus),
    // Sections à étages (passerelles empilées et ressort) : une par niveau au moins, plus souvent ensuite.
    probEtage: 0.1 + 0.08 * diff,
    etagesMax: n >= 3 ? 3 : 2,
    vitesseGeneurs: 1 + 0.35 * diff + 0.2 * plus,
    // Toits fragiles : répit après la traversée, de plus en plus court.
    repitFragile: Math.round((0.9 - 0.25 * diff - 0.05 * plus) * 100) / 100,
    probCaisse: PROB_CAISSE,
    types: ['chien', ...(n >= 2 ? ['pigeon'] : []), ...(n >= 3 ? ['trottinette'] : [])],
    // Défis tirés au hasard en plus des passages obligés du terrain (combinaisons, voir genererNiveau).
    defis: n >= 2 ? Math.min(4, 1 + Math.floor((n - 1) / 3)) : 0,
    // Chrono : le temps de course sans faute, fois un facteur qui se resserre
    // (genererNiveau ajoute le temps des ascenseurs, bassins et gouttières).
    limite: (longueur / VITESSE) * facteur + 15,
    facteur,
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
  // Ascenseur : on y monte en bas, on en descend en haut.
  if (mo.ascenseur) return [{ ...c, x: mo.x0, y: mo.y0 - mo.amp }];
  return [{ ...c, x: mo.x0, y: mo.y0 - mo.amp }, { ...c, x: mo.x0, y: mo.y0 + mo.amp }];
}
export function etatsSortie(c) {
  const mo = c.mobile;
  if (!mo) return [c];
  if (mo.axe === 'x') return [{ ...c, x: mo.x0 + mo.amp, y: mo.y0 }];
  if (mo.ascenseur) return [{ ...c, x: mo.x0, y: mo.y0 + mo.amp }];
  return [{ ...c, x: mo.x0, y: mo.y0 - mo.amp }, { ...c, x: mo.x0, y: mo.y0 + mo.amp }];
}

/** Position d'une plateforme mobile à l'instant t (secondes de jeu). */
export function positionMobile(p, t) {
  const mo = p.mobile;
  // L'ascenseur marque un arrêt en bas et en haut (sinus écrêté).
  const o = mo.ascenseur
    ? borner(1.5 * Math.sin(t * mo.vit + mo.phase), -1, 1) * mo.amp
    : Math.sin(t * mo.vit + mo.phase) * mo.amp;
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
  const solides = m.plateformes.filter((p) => !p.flottante && !p.mobile && !p.fragile && p.type !== 'benne' && p.type !== 'bassin');
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
  // Jamais sur un ressort : il renverrait le livreur en l'air pendant l'attente.
  (m.ressorts || []).forEach((r) => interdits.push([r.x - BORD_SUR, r.x + r.w + BORD_SUR]));
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
  const { n, diff, longueur } = r;
  const { terrain, obligatoires } = terrainNiveau(n);
  const P = terrain.poids;
  const rng = alea(graine != null ? graine : n * 7919 + 13);
  const plateformes = [];
  const sections = [];
  const segments = [];
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
    const ascenseur = !!(cand.mobile && cand.mobile.ascenseur);
    const faisable = () => {
      const entrees = etatsEntree(cand);
      return sources.every((a) => entrees.every((b) => {
        // Gouttière : on grimpe (plus haut qu'un saut), et on en redescend.
        if (cand.gouttiere) return peutGrimper(a, b) && peutRevenir(a, b);
        if (b.y - hautDe(a) > MONTEE_MAX || hautDe(a) - b.y > MONTEE_MAX) return false;
        if (b.x - (a.x + a.w) > ECART_MAX) return false;
        if (!peutSauter(a, b)) return false;
        // Entre deux colonnes fixes, le retour doit aussi passer.
        if (!a.flottante && !b.flottante && !a.mobile && !b.mobile && !peutRevenir(a, b)) return false;
        return true;
      }));
    };
    const placer = () => {
      if (cand.gouttiere) {
        // Gouttière : de MONTEE_MAX + 20 à 170 au-dessus du toit de départ.
        cand.y = borner(cand.y, srcMax + MONTEE_MAX + 20, srcMin + 170);
      } else if (ascenseur) {
        // Ascenseur : `cand.y` est sa position basse, à portée du toit de départ.
        cand.y = Math.max(24, borner(cand.y, srcMax - MONTEE_MAX, srcMin + MONTEE_MAX));
      } else {
        // Marche bornée : montée comme descente, sous MONTEE_MAX.
        const amp = cand.mobile && cand.mobile.axe === 'y' ? cand.mobile.amp : 0;
        cand.y = borner(cand.y, srcMax - MONTEE_MAX + amp, srcMin + MONTEE_MAX - amp);
        if (cand.mobile && cand.mobile.axe === 'y') cand.y = Math.max(cand.y, cand.mobile.amp + 28);
      }
      if (!cand.flottante) cand.y = Math.max(cand.type === 'bassin' ? -40 : 0, cand.y);
      cand.x = Math.round(prec.x + prec.w + cand.ecart);
      cand.y = Math.round(cand.y);
      if (cand.mobile) {
        cand.mobile.x0 = cand.mobile.axe === 'x' ? cand.x + cand.mobile.amp : cand.x;
        cand.mobile.y0 = ascenseur ? cand.y + cand.mobile.amp : cand.y;
      }
    };
    if (cand.ratio != null) {
      // Trou voulu : une part de la portée réelle du saut vers cette plateforme.
      cand.w = Math.round(cand.w);
      let lim = Infinity;
      cand.ecart = 0;
      placer();
      sources.forEach((a) => etatsEntree(cand).forEach((b) => { lim = Math.min(lim, portee(a, b)); }));
      cand.ecart = Math.min(ECART_MAX, Math.max(0, lim * Math.min(cand.ratio, RATIO_MAX)));
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
      delete cand.gouttiere;
      if (cand.type === 'nacelle' || cand.type === 'ascenseur') cand.type = 'echafaudage';
      if (cand.type === 'bassin') {
        delete cand.type;
        delete cand.variante;
      }
      cand.ecart = 18;
      // Un toit fragile reste au-dessus de la rue pour garder son effondrement.
      if (cand.flottante) cand.y = prec.y;
      else cand.y = cand.fragile ? Math.max(30, prec.y) : Math.max(0, prec.y);
      placer();
      if (!faisable()) {
        cand.ecart = 0;
        placer();
      }
    }
    if (!cand.flottante && cand.type !== 'benne' && cand.type !== 'bassin') cand.type = typeColonne(cand.y);
    if (cand.fragile) {
      if (cand.flottante || cand.y <= 0) {
        delete cand.fragile;
      } else {
        // Temps de traverser, plus une bonne seconde de répit.
        cand.retard = Math.round((cand.w / VITESSE + r.repitFragile) * 100) / 100;
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
    w: entre(rng, r.largeurMin, r.largeurMax),
    y: borner(prec.y + entre(rng, -r.marche, r.marche), 0, terrain.hautMax),
    ratio: ratio(),
    ...extra,
  });
  // Petit toit d'un enchaînement, toit fragile, pierre de gué et nacelle : les briques des passages.
  const petit = () => colonne({
    w: entre(rng, 78 - 8 * diff, 104 - 12 * diff),
    y: borner(prec.y + entre(rng, -30 - 25 * diff, 30 + 25 * diff), 0, Math.min(170, terrain.hautMax)),
  });
  const cedant = () => colonne({ fragile: true, w: entre(rng, 90 - 10 * diff, 120 - 10 * diff), y: borner(prec.y + entre(rng, -25, 30 + 15 * diff), 25, Math.min(170, terrain.hautMax)) });
  const pierre = () => ajouter({
    flottante: true,
    type: terrain.gue[Math.floor(rng() * terrain.gue.length)],
    w: entre(rng, 80, 110 - diff * 16),
    y: borner(prec.y + entre(rng, -25, 35), 50, Math.max(185, terrain.hautMax)),
    ratio: ratio(),
  });
  const poserNacelle = (part) => {
    const axe = rng() < 0.6 ? 'x' : 'y';
    const amp = axe === 'x' ? entre(rng, 35, 60 + 10 * diff) : entre(rng, 20, 26);
    return ajouter({
      flottante: true,
      type: 'nacelle',
      mobile: { axe, amp, vit: entre(rng, 1, 1.3 + diff * 0.6), phase: rng() * 6.28, x0: 0, y0: 0 },
      w: entre(rng, 76 - 6 * diff, 96 - 8 * diff),
      y: borner(prec.y + entre(rng, -10, 30), 40, 150),
      ratio: ratio() * part,
    });
  };
  // Toit de départ simple et sûr pour les passages spéciaux.
  const fixe = (p) => !p.flottante && !p.mobile && !p.sorties && !p.fragile && p.type !== 'benne' && p.type !== 'bassin';
  const aide = (extra) => colonne({ w: entre(rng, 180, 240), ...extra });

  // Passages : chacun rend vrai s'il est posé, faux s'il a d'abord posé un toit d'aide.
  const passages = {
    enchaine() {
      // Sauts enchaînés : petits toits rapprochés, plus nombreux, plus étroits et plus décalés au fil des niveaux.
      const k = 2 + Math.floor(rng() * (1 + diff * 2.5));
      for (let i = 0; i < k; i += 1) petit();
      colonne({ w: entre(rng, 180, 260) });
      return true;
    },
    nacelle() {
      // Nacelle : plateforme mobile, horizontale ou verticale.
      const p = poserNacelle(0.85);
      colonne({ w: entre(rng, 170, 250), y: prec.y });
      return !!p.mobile;
    },
    nacelles() {
      // Deux nacelles de suite : on attend la seconde debout sur la première.
      const a = poserNacelle(0.8);
      const b = poserNacelle(0.75);
      colonne({ w: entre(rng, 170, 250), y: prec.y });
      return !!(a.mobile || b.mobile);
    },
    fragile() {
      // Toits fragiles : ils s'effondrent un peu après qu'on s'y est posé (jusqu'à trois de suite).
      const k = 1 + (diff > 0.5 && rng() < 0.5 + 0.3 * diff ? 1 : 0) + (diff > 0.85 && rng() < 0.4 ? 1 : 0);
      for (let i = 0; i < k; i += 1) cedant();
      colonne({ w: entre(rng, 170, 240) });
      return true;
    },
    mixte() {
      // Enchaînement sans répit : petits toits, toits fragiles, pierres de gué et nacelles mêlés,
      // dans un ordre tiré au hasard (jamais une nacelle juste après un toit fragile : on ne peut pas l'attendre).
      const k = 3 + Math.floor(rng() * (1 + diff * 2));
      let avant = null;
      for (let i = 0; i < k; i += 1) {
        const choix = ['petit', 'fragile', 'pierre', ...(n >= 3 && avant !== 'fragile' ? ['nacelle'] : [])].filter((c) => c !== avant);
        const c = choix[Math.floor(rng() * choix.length)];
        if (c === 'petit') petit();
        else if (c === 'fragile') cedant();
        else if (c === 'pierre') pierre();
        else poserNacelle(0.8);
        avant = c;
      }
      colonne({ w: entre(rng, 180, 250) });
      return true;
    },
    gardes() {
      // Toit gardé : deux gêneurs (trois dès le niveau 7) qui patrouillent côte à côte, puis des sauts enchaînés.
      colonne({ w: n >= 7 ? entre(rng, 345, 365) : entre(rng, 280, 345), garde: true });
      const k = 1 + Math.floor(rng() * (1 + diff * 1.5));
      for (let i = 0; i < k; i += 1) petit();
      colonne({ w: entre(rng, 180, 250) });
      return true;
    },
    gue() {
      // Pierres de gué au-dessus d'un trou : auvents, échafaudages, balcons, conduits.
      const k = 1 + Math.floor(rng() * (1 + diff * 2));
      for (let i = 0; i < k; i += 1) pierre();
      colonne({ w: entre(rng, 180, 280) });
      return true;
    },
    benne() {
      // Benne sur le trottoir : on monte dessus, on redescend.
      if (!fixe(prec) || prec.w < 120) return false;
      const base = prec.y;
      const benne = ajouter({ flottante: false, type: 'benne', base, w: entre(rng, 56, 78), y: base + 34, ecart: 0 });
      if (benne.y - base < 10) benne.type = typeColonne(benne.y);
      ajouter({ flottante: false, w: entre(rng, 170, 270), y: base, ecart: 0 });
      return true;
    },
    ascenseur() {
      // Ascenseur de chantier : il monte et descend, on le prend en bas, on descend en haut.
      if (!fixe(prec)) { aide(); return false; }
      const amp = entre(rng, 45, 70);
      if (prec.y + 2 * amp > terrain.hautMax + 60) { aide({ y: prec.y - r.marche }); return false; }
      const l = ajouter({
        flottante: true,
        type: 'ascenseur',
        mobile: { axe: 'y', amp, vit: entre(rng, 0.85, 1.05 + 0.25 * diff), phase: rng() * 6.28, x0: 0, y0: 0, ascenseur: true },
        w: entre(rng, 70, 84),
        y: prec.y + entre(rng, -20, 20),
        ratio: ratio() * 0.7,
      });
      colonne({ w: entre(rng, 180, 250), y: prec.y });
      return !!l.mobile;
    },
    eau() {
      // Bassin : fontaine ou canal dans la rue, bassin ou terrasse inondée sur les toits. On y nage.
      const v = terrain.eau || 'bassin';
      const rue = v === 'fontaine' || v === 'canal';
      if (!fixe(prec) || prec.w < 120) { aide(); return false; }
      if (rue && prec.y > 40) { aide({ y: Math.max(0, prec.y - r.marche) }); return false; }
      if (!rue && prec.y < 50) { aide({ y: prec.y + r.marche }); return false; }
      const bord = prec.y;
      const largeur = { fontaine: [110, 140], bassin: [150, 220], inonde: [160, 240], canal: [220, 320] }[v];
      const fond = Math.max(-36, bord - entre(rng, 50, MONTEE_MAX - 4));
      const b = ajouter({ flottante: false, type: 'bassin', variante: v, w: entre(rng, largeur[0], largeur[1]), y: fond, ecart: 0 });
      if (b.type !== 'bassin') return false;
      if (bord - b.y < 30) {
        b.type = typeColonne(b.y);
        delete b.variante;
        return false;
      }
      b.eau = bord - 8;
      ajouter({ flottante: false, w: entre(rng, 170, 250), y: bord, ecart: 0 });
      return true;
    },
    gouttiere() {
      // Gouttière : immeuble plus haut qu'un saut, on grimpe le long du tuyau.
      if (!fixe(prec) || prec.w < 150) { aide(); return false; }
      if (terrain.hautMax - prec.y < MONTEE_MAX + 20) { aide({ y: prec.y - r.marche }); return false; }
      const montee = entre(rng, MONTEE_MAX + 20, Math.min(170, terrain.hautMax - prec.y));
      const b = ajouter({ flottante: false, gouttiere: true, w: entre(rng, 170, 240), y: prec.y + montee, ecart: 0 });
      return !!b.gouttiere;
    },
    bouche() {
      // Bouche d'aération : glisser vers le bas dessus, le conduit mène quelques toits plus loin.
      if (!fixe(prec)) { aide(); return false; }
      const entree = colonne({ w: entre(rng, 230, 290) });
      const k = 2 + (rng() < 0.5 ? 1 : 0);
      for (let i = 0; i < k; i += 1) colonne({ w: entre(rng, 100, 150) });
      const sortie = colonne({ w: entre(rng, 200, 260) });
      entree.calme = true;
      sortie.calme = true;
      sortie.sortieConduit = true;
      entree.bouche = { x: Math.round(entree.x + entree.w * 0.55), w: 30, vers: { x: sortie.x + 50, y: sortie.y } };
      return true;
    },
  };
  const tenter = (nom) => {
    const ok = passages[nom]();
    if (ok) segments.push(nom);
    return ok;
  };
  const compte = (nom) => segments.filter((s) => s === nom).length;
  const table = [
    ['enchaine', r.probEnchaine * 4 * (P.enchaine ?? 0.5)],
    ['nacelle', r.probMobile * 5 * (P.nacelle ?? 0.4)],
    ['fragile', r.probFragile * 5 * (P.fragile ?? 0.4)],
    ['gue', (0.3 + 0.2 * diff) * 3 * (P.gue ?? 0.5)],
    ['benne', 0.25 * (P.benne ?? 0.3)],
    ['ascenseur', 0.4 * (P.ascenseur || 0)],
    ['eau', 0.5 * (P.eau || 0)],
    ['gouttiere', 0.4 * (P.gouttiere || 0)],
    ['bouche', 0.3 * (P.bouche || 0)],
    // Combinaisons : enchaînement mêlé, toit gardé, deux nacelles de suite.
    ['mixte', n >= 2 ? 0.2 + 0.6 * diff : 0],
    ['gardes', n >= 3 ? 0.15 + 0.5 * diff : 0],
    ['nacelles', n >= 5 ? 0.1 + 0.4 * diff : 0],
  ];
  // Couleur du niveau : un passage mis en avant, un autre presque absent, tirés au hasard,
  // pour que deux niveaux (ou deux parties) ne se ressemblent pas.
  const accents = ['enchaine', 'nacelle', 'fragile', 'gue', 'benne', 'ascenseur', 'gouttiere', 'mixte', 'gardes'];
  const vedette = accents[Math.floor(rng() * accents.length)];
  const discret = accents[Math.floor(rng() * accents.length)];
  table.forEach((t) => {
    if (t[0] === vedette) t[1] *= 2.5;
    else if (t[0] === discret) t[1] *= 0.3;
  });
  // Toits simples de moins en moins fréquents.
  const simple = Math.max(0.6, 1.6 - 2 * (diff - 0.5));
  const total = simple + table.reduce((s, [, w]) => s + w, 0);
  const probEtage = r.probEtage * (terrain.obligatoires.includes('etage') ? 2 : 1);
  // Passages obligés, répartis sur le niveau.
  const obliges = obligatoires.filter((o) => o !== 'etage');
  // Dès le niveau 2, un toit fragile par niveau ; dès le 3, une nacelle.
  if (n >= 2 && !obliges.includes('fragile')) obliges.splice(Math.ceil(obliges.length / 2), 0, 'fragile');
  if (n >= 3 && !obliges.includes('nacelle')) obliges.splice(1, 0, 'nacelle');
  // Défis tirés au hasard (un dès le niveau 2, jusqu'à quatre) : la combinaison change à chaque niveau.
  // Ils s'intercalent un coup sur deux, les passages obligés restent tous posés (le niveau s'allonge si besoin).
  const defis = [];
  const reserve = [
    'enchaine', 'fragile', 'gue', 'mixte',
    ...(n >= 3 ? ['gardes', 'nacelle'] : []),
    ...(n >= 5 ? ['nacelles', 'mixte'] : []),
    ...(n >= 7 ? ['gardes'] : []),
  ];
  for (let i = 0; i < r.defis && reserve.length; i += 1) {
    const nom = reserve.splice(Math.floor(rng() * reserve.length), 1)[0];
    if (!defis.includes(nom)) defis.push(nom);
  }
  let apresDefi = false;
  const aPoser = obliges.map((nom, i) => ({ nom, x: longueur * (0.15 + (0.7 * (i + 0.5)) / obliges.length) }));

  // Les passages obligés encore à poser prolongent un peu le niveau si besoin.
  while (prec.x + prec.w < longueur || (aPoser.length && prec.x + prec.w < longueur * 4)) {
    // Section à étages : au moins une par niveau (dès le premier quart), puis au hasard.
    const forcerEtage = sections.length === 0 && prec.x > longueur * 0.22;
    const du = aPoser.length && prec.x + prec.w >= aPoser[0].x;
    if (fixe(prec) && (forcerEtage || (!du && sections.length < 3 && rng() < probEtage))) {
      const nb = Math.min(r.etagesMax, 2 + (r.etagesMax > 2 && rng() < 0.5 + diff * 0.3 ? 1 : 0));
      const toit = colonne({
        w: nb === 3 ? entre(rng, 700, 740) : entre(rng, 620, 660),
        y: borner(prec.y + entre(rng, -r.marche, r.marche), 0, 110),
      });
      toit.etage = true;
      sections.push({ toit, nb });
      segments.push('etage');
      colonne({ w: entre(rng, 170, 240) });
      continue;
    }
    if (forcerEtage) {
      colonne();
      continue;
    }
    // Défi encore à poser : il passe une fois sur deux, entre deux passages obligés
    // comme entre deux tirages (jamais deux fois de suite le même passage) ; les obligés restent tous posés.
    const kd = defis.findIndex((d) => d !== segments[segments.length - 1]);
    if (kd >= 0 && !apresDefi && prec.x + prec.w < longueur * 1.5) {
      apresDefi = true;
      tenter(defis.splice(kd, 1)[0]);
      continue;
    }
    apresDefi = false;
    if (du) {
      if (tenter(aPoser[0].nom)) aPoser.shift();
      continue;
    }
    let tirage = rng() * total - simple;
    let choix = null;
    for (let i = 0; i < table.length && tirage >= 0; i += 1) {
      if (tirage < table[i][1]) choix = table[i][0];
      tirage -= table[i][1];
    }
    // Pas plus de 3 passages spéciaux du même genre en plus des obligés.
    if (choix && compte(choix) < 3 + (choix === 'enchaine' || choix === 'gue' ? 3 : 0)) {
      if (!tenter(choix) && choix === 'benne') colonne();
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

  // Étages : passerelles en escalier au-dessus du toit, ressort sur le toit
  // (assez loin des bords pour que le rebond retombe toujours sur ce toit ou
  // sur une passerelle), colis en récompense en haut. Le chemin du bas reste libre.
  const etages = [];
  const ressorts = [];
  const colisEtages = [];
  sections.forEach(({ toit, nb }) => {
    let x = toit.x + 300;
    for (let k = 0; k < nb; k += 1) {
      const w = k === nb - 1 ? 130 : 120;
      etages.push({
        id: 1000 + etages.length, x: Math.round(x), w, y: toit.y + MARCHE_ETAGE * (k + 1),
        flottante: true, type: 'passerelle', etage: k + 1, appui: toit.y,
      });
      x += 70;
    }
    const haut = etages[etages.length - 1];
    const nbColis = nb === 3 ? 3 : 2;
    for (let k = 0; k < nbColis; k += 1) {
      colisEtages.push({ x: haut.x + haut.w / 2 - (nbColis * 28) / 2 + k * 28, y: haut.y + 40 });
    }
    const milieu = etages[etages.length - 2];
    colisEtages.push({ x: milieu.x + 20, y: milieu.y + 40 });
    ressorts.push({ id: ressorts.length, x: toit.x + 230, y: toit.y, ...TAILLE_RESSORT, comp: 0 });
  });

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
    if (p.type === 'bassin') {
      // Bassin : colis sous l'eau, à mi-profondeur.
      if (rng() < 0.7) colis.push({ x: p.x + p.w / 2 - C / 2, y: p.y + (p.eau - p.y) / 2 - C / 2 });
    } else if (p.flottante) {
      if (rng() < 0.5) colis.push({ x: p.x + p.w / 2 - C / 2, y: p.y + 34 });
    } else if (p.etage) {
      // Toit à étages : colis au départ, ni gêneur ni boîte (le ressort et les passerelles y sont).
      colis.push({ x: p.x + 60, y: p.y + 40 }, { x: p.x + 88, y: p.y + 40 });
    } else if (p.type !== 'benne' && !p.arrivee && !p.fragile) {
      if (largeurUtile >= 110 && rng() < 0.65) {
        const nb = largeurUtile >= 220 ? 3 : 2;
        const x0 = debut + largeurUtile / 2 - (nb * 28) / 2;
        for (let k = 0; k < nb; k += 1) colis.push({ x: x0 + k * 28, y: p.y + 40 });
      }
      let geneurPose = false;
      // Gêneurs : jamais sur les DEGAGEMENT_ATTERRISSAGE premières unités (on y atterrit).
      if (i > 0 && suivante && !p.calme && p.w >= LARGEUR_MIN_GENEUR && (p.garde || rng() < r.probGeneur)) {
        // Toit gardé : deux gêneurs, trois dès le niveau 7.
        const nb = p.garde ? (n >= 7 && p.w >= 345 ? 3 : 2) : p.w >= 380 && n >= 4 ? 3 : p.w >= 250 && n >= 2 ? 2 : 1;
        const zx1 = p.x + DEGAGEMENT_ATTERRISSAGE;
        const zx2 = p.x + p.w - 30;
        for (let k = 0; k < nb; k += 1) {
          const type = r.types[Math.floor(rng() * r.types.length)];
          const t = TAILLES[type];
          // Allure propre à chaque gêneur : jamais deux patrouilles au même rythme.
          const allure = r.vitesseGeneurs * entre(rng, 0.85, 1.15);
          const x1 = zx1 + (k * (zx2 - zx1)) / nb;
          const x2 = zx1 + ((k + 1) * (zx2 - zx1)) / nb - t.w - (k < nb - 1 ? 8 : 0);
          if (x2 - x1 < 30) continue;
          const x = x1 + rng() * (x2 - x1);
          geneurPose = true;
          if (type === 'pigeon') {
            const haut = 46 - Math.min(12, diff * 16);
            geneurs.push({
              type, x, y: p.y + haut, base: p.y + haut, cx: (x1 + x2) / 2, amp: (x2 - x1) / 2,
              vitesse: (1.1 + diff * 0.8) * allure, phase: rng() * 6.28, w: t.w, h: t.h, dir: -1,
            });
          } else {
            const v = (type === 'chien' ? 45 + diff * 45 : 90 + diff * 50) * allure;
            geneurs.push({ type, x, y: p.y, x1, x2, vx: -v, w: t.w, h: t.h, dir: -1 });
          }
        }
      }
      // Caisse bonus ou boîte aux lettres, au milieu du toit, loin des bords.
      if (p.calme) {
        // Bouche d'aération et sortie du conduit : ni caisse ni boîte.
      } else if (i > 0 && suivante && !geneurPose && p.w >= 170 && rng() < r.probCaisse) {
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
  colis.push(...colisEtages);
  colis.forEach((c, k) => { c.id = k; c.pris = false; });
  boites.forEach((b, k) => { b.id = k; b.choc = 0; });
  geneurs.forEach((g, k) => { g.id = k; g.actif = true; g.ecarte = 0; g.temps = 0; });

  // Gouttières (face gauche de l'immeuble haut) et bassins, lus par la physique et le décor.
  const gouttieres = [];
  plateformes.forEach((p, i) => {
    if (p.gouttiere) gouttieres.push({ x: p.x, bas: hautDe(plateformes[i - 1]), haut: p.y, id: p.id });
  });
  const eaux = plateformes.filter((p) => p.type === 'bassin').map((p) => ({ x: p.x, w: p.w, y: p.y, eau: p.eau, variante: p.variante, id: p.id }));
  const bouches = plateformes.filter((p) => p.bouche).map((p) => ({ ...p.bouche, y: p.y, sol: p.id }));
  // Chrono : du temps en plus pour attendre l'ascenseur, nager et grimper.
  const nbAsc = plateformes.filter((p) => p.mobile && p.mobile.ascenseur).length;
  const course = Math.round(((fin.x + fin.w) / VITESSE) * r.facteur + 15);
  const limite = Math.round(Math.max(r.limite, course)) + 6 * nbAsc + 3 * eaux.length + 3 * gouttieres.length;

  const { decor, motif, monde } = decorNiveau(n);
  return {
    niveau: n,
    longueur: fin.x + fin.w,
    plateformes,
    etages,
    ressorts,
    boites,
    colis,
    geneurs,
    porte,
    depart: { x: 20, y: 0 },
    decor,
    motif,
    monde,
    limite,
    tempsCible: limite,
    terrain: terrain.id,
    segments,
    gouttieres,
    eaux,
    bouches,
  };
}

// ---- Partie ----
/** Monde d'un niveau. `report` : { score, vies, pieces, grand } de la partie en cours. */
export function creerMonde(niveau, report = {}, graine) {
  const niv = genererNiveau(niveau, graine);
  return {
    ...niv,
    // Physique : chaîne du niveau et passerelles des étages ; décor fixe : la chaîne seule.
    plateformes: niv.plateformes.concat(niv.etages),
    plateformesDecor: niv.plateformes,
    env: { eaux: niv.eaux, gouttieres: niv.gouttieres },
    passage: null,
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

// Annonce en haut de la scène, sous le score : clé de texte (sous jeuToits.), durée 1,8 s.
const ANNONCES = {
  vie: { cle: 'bonusVie', icone: 'heart', couleur: '#E74C3C' },
  aimant: { cle: 'bonusAimant', icone: 'magnet', couleur: '#8E44AD', n: DUREES.aimant },
  taille: { cle: 'bonusTaille', icone: 'shield-star', couleur: '#0A9A78' },
  vol: { cle: 'bonusVol', icone: 'quadcopter', couleur: '#2D7FD3', n: DUREES.vol },
  etoile: { cle: 'bonusEtoile', icone: 'star', couleur: '#E0A100', n: DUREES.etoile },
  chrono: { cle: 'bonusChrono', icone: 'timer-plus-outline', couleur: '#16A34A', n: BONUS_CHRONO },
  double: { cle: 'bonusDouble', icone: 'numeric-2-circle', couleur: '#E8650F', n: DUREES.double },
  encaisse: { cle: 'coupEncaisse', icone: 'shield-check', couleur: '#0A9A78' },
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
 * touche, chute, temps, livre, reprise, plouf, grimpe, conduit, sortieConduit.
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

  // Dans le conduit d'une bouche d'aération : le livreur file sous les toits, à l'abri.
  if (m.passage) {
    const ps = m.passage;
    ps.t += dt;
    const u = Math.min(1, ps.t / ps.duree);
    j.x = ps.de.x + (ps.vers.x - ps.de.x) * u;
    j.y = ps.de.y + (ps.vers.y - ps.de.y) * u;
    j.vx = 0;
    j.vy = 0;
    if (u >= 1) {
      m.passage = null;
      j.y = ps.vers.y;
      j.vy = PASSAGE.sortie;
      j.sol = null;
      j.enSaut = false;
      j.accroupi = false;
      m.invul = Math.max(m.invul, 0.6);
      evenements.push({ type: 'sortieConduit' });
    }
    return;
  }

  // Accroupi : seulement au sol, jamais en plein saut.
  const etaitAccroupi = j.accroupi;
  j.accroupi = !!(cmd.bas && j.sol && !(j.tampon > 0));
  if (j.accroupi && !etaitAccroupi) evenements.push({ type: 'accroupi' });
  if (m.attente) cmd = CMD_VIDE;
  const etaitDansEau = !!j.dansEau;
  const frappee = physiqueJoueur(j, m.plateformes, m.boites, cmd, dt, m.env);
  if (j.dansEau && !etaitDansEau) evenements.push({ type: 'plouf' });
  if (j.grimpe) evenements.push({ type: 'grimpe' });
  // Glisser vers le bas sur une bouche d'aération : on entre dans le conduit.
  const bouche = j.sol && j.sol.bouche;
  if (bouche && cmd.bas && !m.attente && Math.abs(j.x + LARGEUR / 2 - (bouche.x + bouche.w / 2)) < bouche.w / 2 + 6) {
    m.passage = { t: 0, duree: PASSAGE.duree, de: { x: j.x, y: j.y }, vers: { x: bouche.vers.x, y: bouche.vers.y } };
    j.accroupi = true;
    evenements.push({ type: 'conduit' });
  }
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
  // Ressort : posé dessus, le livreur est renvoyé très haut (jamais pendant l'attente de reprise).
  const ressorts = m.ressorts || [];
  for (let i = 0; i < ressorts.length; i += 1) {
    const r = ressorts[i];
    if (r.comp > 0) r.comp = Math.max(0, r.comp - dt * 3);
    if (!m.attente && j.sol && j.vy <= 0 && Math.abs(j.y - r.y) < 0.5 && j.x + LARGEUR > r.x + 2 && j.x < r.x + r.w - 2) {
      j.vy = cmd.sautTenu ? RESSORT_TENU : RESSORT;
      j.sol = null;
      j.enSaut = false;
      j.coyote = 0;
      j.tampon = 0;
      r.comp = 1;
      evenements.push({ type: 'ressort' });
    }
  }
  if (j.sol && !j.sol.flottante && !j.sol.boite && !j.sol.fragile && !j.sol.mobile && j.sol.type !== 'benne' && j.sol.type !== 'bassin') m.dernierSol = j.sol;

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

/**
 * Éléments de fond propres au monde du niveau (grues, bateaux, enseignes,
 * sapins...), au loin : positions calculées une fois par niveau, reproductibles.
 */
export function genererElementsMonde(niveau, longueur) {
  const { monde } = decorNiveau(niveau);
  const types = mondeParId(monde).elements;
  if (!types.length) return [];
  const rng = alea(niveau * 7349 + 3);
  const liste = [];
  let x = -200 + rng() * 120;
  while (x < longueur * 0.2 + 900) {
    liste.push({ id: liste.length, type: types[Math.floor(rng() * types.length)], x: Math.round(x), w: 60, h: 40 + Math.round(rng() * 50), v: rng() });
    x += 170 + rng() * 160;
  }
  return liste;
}
