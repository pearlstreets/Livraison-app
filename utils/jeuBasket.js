/**
 * Logique pure du mini-jeu « Tir parfait » (screens/JeuBasketScreen.js).
 *
 * Monde en mètres, vu de face depuis derrière le ballon : x latéral (droite
 * positive), y hauteur, z profondeur (0 = ballon au départ, le panier est à
 * z = distance). Le ballon part du bas de l'écran, suit une parabole (gravité,
 * vent latéral), rebondit sur le cercle (tore) et sur la planche, puis retombe.
 *
 * Panier : le centre du ballon traverse le plan du cercle en descendant, à
 * l'intérieur du cercle. « Parfait » : panier sans toucher ni le cercle ni la
 * planche. Points : panier 2, parfait 3 x multiplicateur (parfaits d'affilée,
 * x5 au plus) ; un panier normal ou un raté remet la série à zéro. Parfait :
 * +2 s. Ballon « en feu » dès 3 parfaits d'affilée.
 *
 * Aucun appel à React ici : tout est testable (utils/__tests__/jeuBasket.test.mjs).
 */

export const G = 9.81;
export const RAYON_BALLE = 0.105;
export const RAYON_CERCLE = 0.24;
export const TUBE_CERCLE = 0.012;
export const HAUTEUR_CERCLE = 3.05;
export const RETRAIT_PLANCHE = 0.38; // face avant de la planche, derrière le centre du cercle
export const PLANCHE_L = 1.8;
export const PLANCHE_BAS = 2.9;
export const PLANCHE_HAUT = 3.95;
export const DEPART = { x: 0, y: 1.8, z: 0 };
export const ANGLE_TIR = (62 * Math.PI) / 180; // élévation fixe du tir

export const DUREE_NIVEAU = 30; // secondes
export const BONUS_PARFAIT_S = 2;
export const POINTS_PANIER = 2;
export const POINTS_PARFAIT = 3;
export const MULTI_MAX = 5;
export const SERIE_FEU = 3;
export const PALIERS = [20, 50, 100, 200, 400, 800, 1600];

// Rebonds.
const E_CERCLE = 0.55;
const FROT_CERCLE = 0.88;
const E_PLANCHE = 0.5;
const E_SOL = 0.55;
const PAS_PHYSIQUE = 1 / 240;
const DELAI_PANIER = 0.55; // s entre le panier et le ballon suivant
const DELAI_RATE = 0.4;
const DUREE_MAX_VOL = 4.5;

// Vue (pseudo 3D) : œil un peu au-dessus du cercle, derrière le ballon.
export const VUE = { horizon: 0.4, focale: 1.0, recul: 3.0, oeil: 3.3 };

/** Point du monde vers l'écran (pixels) pour un cadre l x h. s = pixels par mètre à cette profondeur. */
export function projeter(x, y, z, l, h) {
  const d = Math.max(1.2, z + VUE.recul);
  const s = (VUE.focale * h) / d;
  return { x: l / 2 + x * s, y: VUE.horizon * h + (VUE.oeil - y) * s, s };
}

/** Diamètre affiché du ballon : un peu agrandi près de l'œil pour rester lisible. */
export function diametreBalle(z, h) {
  const { s } = projeter(0, 0, z, 1, h);
  const loupe = 1 + 0.6 * Math.max(0, 1 - z / 3);
  return RAYON_BALLE * 2 * s * loupe;
}

// Petit hachage entier, pour un sens de vent stable par niveau.
function hachage(n) {
  let x = Math.imul(n ^ 0x5bd1e995, 0x2c1b3c6d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 12;
  return x >>> 0;
}

/**
 * Réglages d'un niveau (n >= 1), sans fin :
 * 1 à 3 : le panier recule (3,5 m, 4,5 m, 5,5 m) ;
 * 4 à 6 : panier à 4,5 m qui se déplace de gauche à droite ;
 * 7 et plus : vent (flèche et force) et panier mobile plus vite, de plus en plus loin.
 * Objectif de paniers en 30 s : 5, puis +1 tous les deux niveaux (12 au plus).
 * `aide` : part du tir ramenée vers le tir idéal (gestes approximatifs), de moins en moins.
 */
export function reglagesNiveau(n) {
  const niv = Math.max(1, Math.floor(Number(n) || 1));
  let distance;
  if (niv <= 3) distance = 3.5 + (niv - 1);
  else if (niv <= 6) distance = 4.5;
  else distance = Math.min(6.5, 5 + 0.25 * (niv - 7));

  let amplitude = 0;
  let periode = 0;
  if (niv >= 4 && niv <= 6) {
    amplitude = 0.5 + 0.15 * (niv - 4);
    periode = 5 - 0.5 * (niv - 4);
  } else if (niv >= 7) {
    amplitude = Math.min(1.2, 0.8 + 0.05 * (niv - 7));
    periode = Math.max(2.2, 3.5 - 0.15 * (niv - 7));
  }

  let ventForce = 0;
  let ventSens = 0;
  if (niv >= 7) {
    ventForce = Math.min(8, 2 + Math.floor((niv - 7) / 2));
    ventSens = hachage(niv) % 2 === 0 ? 1 : -1;
  }

  return {
    niveau: niv,
    distance,
    amplitude,
    periode,
    ventForce,
    ventSens,
    vent: ventForce * 0.18 * ventSens, // accélération latérale en m/s²
    objectif: Math.min(12, 5 + Math.floor((niv - 1) / 2)),
    duree: DUREE_NIVEAU,
    aide: Math.max(0.25, 0.6 - 0.04 * (niv - 1)),
  };
}

/** Position latérale du panier pour une phase de mouvement (0 à 1). */
export function xPanier(reglages, phase) {
  if (!reglages.amplitude) return 0;
  return reglages.amplitude * Math.sin(2 * Math.PI * phase);
}

/** Vitesse de lancer qui fait passer le centre du ballon au centre du cercle (sans vent). */
export function vitesseIdeale(distance, hauteur = HAUTEUR_CERCLE - DEPART.y, angle = ANGLE_TIR) {
  const c = Math.cos(angle);
  const denom = 2 * c * c * (distance * Math.tan(angle) - hauteur);
  if (denom <= 0) return 20;
  return Math.sqrt((G * distance * distance) / denom);
}

// Geste : longueur du glissement vers le haut (en part de la hauteur d'écran) vers la vitesse.
export const GESTE_MIN = 0.05;
export const GESTE_MAX = 0.8;
export const LONGUEUR_REF = 0.25;
export const VITESSE_REF = vitesseIdeale(3.5);
export const PENTE_VITESSE = 6; // m/s par hauteur d'écran
const FENETRE_AIDE_V = 0.18; // aide seulement à moins de 18 % du tir idéal
const FENETRE_AIDE_ANGLE = 0.12; // rad

/** Longueur de glissement qui donne une vitesse donnée (aide à l'écran et aux tests). */
export function longueurPourVitesse(v) {
  return LONGUEUR_REF + (v - VITESSE_REF) / PENTE_VITESSE;
}

/**
 * Glissement vers le tir. geste = { dx, dy } en part de la hauteur de l'écran
 * (dy négatif vers le haut). hx : position du panier au lâcher. Rend
 * { vx, vy, vz } ou null si le geste ne monte pas assez.
 * La direction du glissement vise : un glissement vers le panier à l'écran
 * part vers le panier dans le monde.
 */
export function tirDepuisGeste(geste, reglages, hx = 0) {
  const monte = -(Number(geste?.dy) || 0);
  if (!(monte >= GESTE_MIN)) return null;
  const dx = Number(geste?.dx) || 0;
  const L = Math.min(monte, GESTE_MAX);
  const D = reglages.distance;

  const vBrute = VITESSE_REF + PENTE_VITESSE * (L - LONGUEUR_REF);
  // Écart vertical à l'écran entre le ballon et le cercle (en hauteurs d'écran).
  const yBalle = projeter(DEPART.x, DEPART.y, DEPART.z, 1, 1).y;
  const yCercle = projeter(0, HAUTEUR_CERCLE, D, 1, 1).y;
  const sD = VUE.focale / (D + VUE.recul);
  const xVise = ((dx / monte) * (yBalle - yCercle)) / sD;
  const phiBrut = Math.atan2(xVise, D);

  const phiIdeal = Math.atan2(hx, D);
  const vIdeale = vitesseIdeale(Math.hypot(D, hx));
  const aide = reglages.aide || 0;
  let v = vBrute;
  if (Math.abs(vBrute - vIdeale) <= FENETRE_AIDE_V * vIdeale) v = vBrute + (vIdeale - vBrute) * aide;
  let phi = phiBrut;
  // Panier mobile ou vent : le bon angle n'est plus celui du panier au lâcher, pas d'aide d'angle.
  const aideAngle = !reglages.amplitude && !reglages.vent;
  if (aideAngle && Math.abs(phiBrut - phiIdeal) <= FENETRE_AIDE_ANGLE) phi = phiBrut + (phiIdeal - phiBrut) * aide;
  v = Math.max(3, Math.min(14, v));

  const vh = v * Math.cos(ANGLE_TIR);
  return { vx: vh * Math.sin(phi), vy: v * Math.sin(ANGLE_TIR), vz: vh * Math.cos(phi) };
}

/** Ballon au repos, prêt à être lancé. */
export function creerBalle() {
  return {
    x: DEPART.x, y: DEPART.y, z: DEPART.z, vx: 0, vy: 0, vz: 0,
    t: 0, etat: 'repos', issue: null, tIssue: 0, cercle: false, planche: false, dernierChoc: -1,
  };
}

export function lancer(balle, v) {
  Object.assign(balle, creerBalle(), { vx: v.vx, vy: v.vy, vz: v.vz, etat: 'vol' });
  return balle;
}

/**
 * Avance le ballon de dt secondes (sous-pas de 1/240 s). ctx = { reglages, hx }.
 * Rend la liste des événements : { type: 'cercle' | 'planche' | 'sol' | 'panier' | 'rate' | 'fini', ... }.
 */
export function pasPhysique(balle, dt, ctx) {
  const ev = [];
  if (balle.etat !== 'vol') return ev;
  const r = ctx.reglages;
  const D = r.distance;
  const hx = ctx.hx || 0;
  const zb = D + RETRAIT_PLANCHE;
  const ventA = r.vent || 0;
  const total = Math.min(Math.max(0, dt), 0.05);
  const n = Math.max(1, Math.ceil(total / PAS_PHYSIQUE));
  const h = total / n;

  for (let i = 0; i < n; i += 1) {
    const avantY = balle.y;
    const avantZ = balle.z;
    balle.t += h;
    balle.vx += ventA * h;
    balle.vy -= G * h;
    balle.x += balle.vx * h;
    balle.y += balle.vy * h;
    balle.z += balle.vz * h;

    // Cercle : point du cercle le plus proche du centre du ballon.
    const dxr = balle.x - hx;
    const dzr = balle.z - D;
    const dh = Math.hypot(dxr, dzr);
    const ux = dh > 1e-6 ? dxr / dh : 0;
    const uz = dh > 1e-6 ? dzr / dh : 1;
    const px = hx + RAYON_CERCLE * ux;
    const pz = D + RAYON_CERCLE * uz;
    let nx = balle.x - px;
    let ny = balle.y - HAUTEUR_CERCLE;
    let nz = balle.z - pz;
    const dist = Math.hypot(nx, ny, nz);
    const lim = RAYON_BALLE + TUBE_CERCLE;
    if (dist < lim && dist > 1e-9) {
      nx /= dist; ny /= dist; nz /= dist;
      balle.x = px + nx * lim;
      balle.y = HAUTEUR_CERCLE + ny * lim;
      balle.z = pz + nz * lim;
      const vn = balle.vx * nx + balle.vy * ny + balle.vz * nz;
      if (vn < 0) {
        const tx = balle.vx - vn * nx;
        const ty = balle.vy - vn * ny;
        const tz = balle.vz - vn * nz;
        balle.vx = tx * FROT_CERCLE - vn * E_CERCLE * nx;
        balle.vy = ty * FROT_CERCLE - vn * E_CERCLE * ny;
        balle.vz = tz * FROT_CERCLE - vn * E_CERCLE * nz;
        if (!balle.issue) balle.cercle = true;
        if (balle.t - balle.dernierChoc > 0.08) ev.push({ type: 'cercle', force: -vn });
        balle.dernierChoc = balle.t;
      }
    }

    // Planche : face avant, traversée vers l'arrière.
    if (balle.vz > 0 && avantZ + RAYON_BALLE < zb && balle.z + RAYON_BALLE >= zb
      && Math.abs(balle.x - hx) <= PLANCHE_L / 2 + RAYON_BALLE * 0.5
      && balle.y >= PLANCHE_BAS - RAYON_BALLE * 0.5 && balle.y <= PLANCHE_HAUT + RAYON_BALLE * 0.5) {
      balle.z = zb - RAYON_BALLE;
      balle.vz = -balle.vz * E_PLANCHE;
      balle.vx *= 0.9;
      balle.vy *= 0.9;
      if (!balle.issue) balle.planche = true;
      ev.push({ type: 'planche' });
    }

    // Panier : le centre traverse le plan du cercle en descendant, dans le cercle.
    if (!balle.issue && avantY > HAUTEUR_CERCLE && balle.y <= HAUTEUR_CERCLE
      && Math.hypot(balle.x - hx, balle.z - D) < RAYON_CERCLE) {
      const parfait = !balle.cercle && !balle.planche;
      balle.issue = parfait ? 'parfait' : 'panier';
      balle.tIssue = balle.t;
      // Le filet freine le ballon.
      balle.vx *= 0.3;
      balle.vz *= 0.3;
      balle.vy *= 0.55;
      ev.push({ type: 'panier', parfait });
    }

    // Sol.
    if (balle.y - RAYON_BALLE <= 0 && balle.vy < 0) {
      const choc = -balle.vy;
      balle.y = RAYON_BALLE;
      balle.vy = choc * E_SOL;
      balle.vx *= 0.75;
      balle.vz *= 0.75;
      if (choc > 1) ev.push({ type: 'sol', force: choc });
      if (!balle.issue) {
        balle.issue = 'rate';
        balle.tIssue = balle.t;
        ev.push({ type: 'rate' });
      }
    }

    // Hors du terrain ou trop long.
    if (!balle.issue && (balle.z > D + 2.5 || balle.z < -1.2 || Math.abs(balle.x) > 4 || balle.t > DUREE_MAX_VOL)) {
      balle.issue = 'rate';
      balle.tIssue = balle.t;
      ev.push({ type: 'rate' });
    }

    if (balle.issue && balle.t - balle.tIssue >= (balle.issue === 'rate' ? DELAI_RATE : DELAI_PANIER)) {
      balle.etat = 'fini';
      ev.push({ type: 'fini', issue: balle.issue });
      break;
    }
  }
  return ev;
}

/**
 * Plan d'affichage du ballon par rapport au panier :
 * 'derriere' (derrière la planche), 'milieu' (entre la planche et l'avant du
 * cercle et du filet), 'devant'.
 */
export function couche(balle, hx, distance) {
  if (balle.z > distance + RETRAIT_PLANCHE) return 'derriere';
  if (balle.z > distance - RAYON_CERCLE && balle.y < HAUTEUR_CERCLE + 2 * RAYON_BALLE
    && Math.abs(balle.x - hx) < RAYON_CERCLE + 0.3) return 'milieu';
  return 'devant';
}

/** Simulation complète d'un tir (tests, réglages) : { issue, cercle, planche, x }. */
export function simulerTir(v, reglages, hx = 0) {
  const b = lancer(creerBalle(), v);
  for (let i = 0; i < 600 && b.etat === 'vol'; i += 1) pasPhysique(b, 1 / 60, { reglages, hx });
  return { issue: b.issue, cercle: b.cercle, planche: b.planche, x: b.x };
}

/** Tir idéal (sans vent) vers un panier en hx. */
export function tirIdeal(reglages, hx = 0) {
  const D = reglages.distance;
  const v = vitesseIdeale(Math.hypot(D, hx));
  const phi = Math.atan2(hx, D);
  const vh = v * Math.cos(ANGLE_TIR);
  return { vx: vh * Math.sin(phi), vy: v * Math.sin(ANGLE_TIR), vz: vh * Math.cos(phi) };
}

// ---- Partie : score, série, niveaux ----

export function multiplicateur(serie) {
  return Math.max(1, Math.min(MULTI_MAX, Math.floor(serie) || 0));
}

export function enFeu(serie) {
  return serie >= SERIE_FEU;
}

export function creerPartie(niveau = 1) {
  return {
    niveau: Math.max(1, Math.floor(niveau) || 1), score: 0, paniersNiveau: 0, paniers: 0,
    parfaits: 0, tirs: 0, serie: 0, meilleureSerie: 0,
  };
}

/**
 * Compte un tir terminé ('parfait' | 'panier' | 'rate').
 * Rend { points, multiplicateur, bonusTemps, serie, feu }.
 */
export function enregistrerTir(partie, issue) {
  partie.tirs += 1;
  let points = 0;
  let mult = 1;
  let bonusTemps = 0;
  if (issue === 'parfait') {
    partie.serie += 1;
    mult = multiplicateur(partie.serie);
    points = POINTS_PARFAIT * mult;
    bonusTemps = BONUS_PARFAIT_S;
    partie.parfaits += 1;
    partie.paniers += 1;
    partie.paniersNiveau += 1;
  } else if (issue === 'panier') {
    partie.serie = 0;
    points = POINTS_PANIER;
    partie.paniers += 1;
    partie.paniersNiveau += 1;
  } else {
    partie.serie = 0;
  }
  partie.score += points;
  partie.meilleureSerie = Math.max(partie.meilleureSerie, partie.serie);
  return { points, multiplicateur: mult, bonusTemps, serie: partie.serie, feu: enFeu(partie.serie) };
}

export function niveauReussi(partie) {
  return partie.paniersNiveau >= reglagesNiveau(partie.niveau).objectif;
}

export function passerNiveau(partie) {
  partie.niveau += 1;
  partie.paniersNiveau = 0;
  return partie;
}

/** État JSON simple pour utils/partieSauvegardee.js. */
export function etatSauvegarde(partie, tempsRestant) {
  return {
    niveau: partie.niveau, score: partie.score, paniersNiveau: partie.paniersNiveau, paniers: partie.paniers,
    parfaits: partie.parfaits, tirs: partie.tirs, serie: partie.serie, meilleureSerie: partie.meilleureSerie,
    temps: Math.max(0, Math.round(Number(tempsRestant) || 0)),
  };
}

function entier(v, min = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : min;
}

/** Partie reprise depuis la sauvegarde : { partie, tempsRestant } (ms). */
export function partieReprise(etat) {
  const p = creerPartie(entier(etat?.niveau, 1));
  p.score = entier(etat?.score);
  p.paniersNiveau = entier(etat?.paniersNiveau);
  p.paniers = entier(etat?.paniers);
  p.parfaits = entier(etat?.parfaits);
  p.tirs = entier(etat?.tirs);
  p.serie = entier(etat?.serie);
  p.meilleureSerie = Math.max(entier(etat?.meilleureSerie), p.serie);
  const temps = entier(etat?.temps);
  const tempsRestant = temps > 0 ? Math.min(temps, (DUREE_NIVEAU + 60) * 1000) : DUREE_NIVEAU * 1000;
  return { partie: p, tempsRestant };
}
