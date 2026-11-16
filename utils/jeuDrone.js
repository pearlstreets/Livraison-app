/**
 * Logique pure du mini-jeu « Drone express » (screens/JeuDroneScreen.js).
 *
 * Monde en unités : la hauteur vaut toujours HAUTEUR (1000), la largeur
 * dépend de l'écran (largeur en pixels / échelle). Même difficulté sur tous
 * les téléphones. Le monde est muté sur place (appelé à chaque image depuis
 * une boucle requestAnimationFrame), aucun React ici.
 *
 * Phases : 'pret' (le drone flotte, attend le premier toucher), 'vol',
 * 'chute' (obstacle touché, le drone pique jusqu'au sol), 'fini'.
 */

export const HAUTEUR = 1000;
export const SOL = 80; // hauteur de la rue en bas
export const GRAVITE = 3200; // unités / s², forte : le drone tombe vite
export const IMPULSION = 640; // impulsion sèche : saut d'environ 64 unités
export const CHUTE_MAX = 1000;
export const DT_MAX = 1 / 30; // dt borné : physique identique quel que soit le nombre d'images

// Boîte de collision du drone (demi-largeur, demi-hauteur), plus petite que
// le dessin pour rester indulgente.
export const DRONE_DX = 30;
export const DRONE_DY = 24;
export const DRONE_DESSIN = 72; // côté du dessin (drone + colis accroché)

export const LARGEUR_OBSTACLE = 70;
export const MARGE = 80; // morceau d'obstacle toujours visible en haut et en bas
export const TAILLE_BONUS = 52;

export const POINTS_PASSAGE = 1;
export const POINTS_COLIS = 5;
export const POINTS_CLIENT = 3;

// Bonus spéciaux (posés au milieu d'un passage, comme les colis) :
// bouclier (encaisse un choc, puis courte invincibilité), aimant (attrape les
// colis du passage et sert les clients quelle que soit la hauteur), points
// doublés. Un bonus au plus tous les BONUS_ECART obstacles, jamais au début.
export const BONUS = ['bouclier', 'aimant', 'double'];
export const DUREE_AIMANT = 8; // s
export const DUREE_DOUBLE = 10; // s
export const DUREE_INVINCIBLE = 1.2; // s après un choc encaissé par le bouclier
export const BONUS_RANG_MIN = 6; // premier bonus possible au 6e obstacle
export const BONUS_ECART = 8; // obstacles au moins entre deux bonus
export const BONUS_PROBA = 0.14; // chance par obstacle une fois l'écart respecté

// Paliers : tous les PALIER passages, médaille (bronze, argent, or, puis or)
// et nouveau décor (4 décors en boucle).
export const PALIER = 10;
export const NB_DECORS = 4;
export const MEDAILLES = ['bronze', 'argent', 'or'];

/** Niveau de palier atteint (0 avant le premier). */
export function niveauPalier(passes) {
  return Math.floor(Math.max(0, passes) / PALIER);
}

/** Médaille du niveau (null au niveau 0). */
export function medaille(niveau) {
  return niveau <= 0 ? null : MEDAILLES[Math.min(niveau, MEDAILLES.length) - 1];
}

/** Indice du décor du niveau. */
export function decorNiveau(niveau) {
  return Math.max(0, niveau) % NB_DECORS;
}

export const TYPES_HAUT = ['grue', 'enseigne', 'cables'];

// Cadence de toucher supposée pour un humain (s entre deux touchers) :
// sert à garantir que chaque passage reste atteignable.
const CADENCE_HUMAINE = 0.25;
/** Vitesse de montée moyenne en touchant toutes les CADENCE_HUMAINE s. */
export const MONTEE_HUMAINE = IMPULSION - (GRAVITE * CADENCE_HUMAINE) / 2;

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
 * Réglages selon le nombre de passages déjà franchis (10 passages par niveau).
 * Courbe raide pour que la partie reste courte : le niveau 1 sert de prise en
 * main mais bouge déjà (obstacles mobiles dès le 2e passage), les niveaux 2 et
 * 3 accélèrent nettement, les niveaux 4 à 6 deviennent durs, les niveaux 7 à
 * 12 approchent du plus dur, puis les niveaux 13 à 24 relèvent encore le
 * plafond (obstacles mobiles plus fréquents). Au-delà, réglages figés au plus
 * dur. Les motifs (voir MOTIFS) changent la forme des séries d'obstacles d'un
 * niveau à l'autre. La marge verticale reste toujours calculée
 * (ecartAtteignable) : chaque passage reste faisable.
 */
export function reglages(passes) {
  const p1 = borner(passes / 10, 0, 1);
  const p2 = borner((passes - 10) / 20, 0, 1);
  const p3 = borner((passes - 30) / 30, 0, 1);
  const p4 = borner((passes - 60) / 60, 0, 1);
  const p5 = borner((passes - 120) / 120, 0, 1);
  return {
    vitesse: 370 + 70 * p1 + 60 * p2 + 50 * p3 + 40 * p4, // 370 au départ, 590 au plus dur
    ecart: 225 - 15 * p1 - 15 * p2 - 10 * p3 - 10 * p4, // hauteur du passage libre (225 puis 175)
    espacement: 460 - 25 * p1 - 20 * p2 - 20 * p3 - 15 * p4, // distance entre deux obstacles (460 puis 380)
    // Part minimale du plus grand écart de hauteur atteignable entre deux passages.
    franc: 0.55 + 0.05 * p1 + 0.05 * p2 + 0.05 * p3 + 0.05 * p4,
    probaMouvement: passes < 2 ? 0 : 0.3 + 0.1 * p2 + 0.1 * p3 + 0.05 * p4 + 0.05 * p5, // 0,3 au 2e passage, 0,6 au plus dur
    amplitude: passes < 2 ? 0 : 24 + 8 * p2 + 8 * p3 + 6 * p4, // 24 puis 46
    omega: 1.1 + 0.2 * p2 + 0.15 * p3 + 0.05 * p4, // vitesse de balancement des obstacles mobiles
  };
}

/**
 * Motifs : séries de 3 à 6 obstacles qui changent la forme du parcours, tirés
 * au hasard parmi ceux débloqués (rang du premier obstacle), jamais deux fois
 * de suite le même. Mêmes immeubles qu'avant, assemblés autrement :
 * - libre : hauteurs franches, le plus souvent en alternance ;
 * - zigzag : toujours à l'opposé, au plus grand écart atteignable ;
 * - escalier : passages fixes toujours dans le même sens (montée ou
 *   descente en marches), jusqu'au bord de l'écran ;
 * - vague : obstacles mobiles à la suite, balancements décalés en vague ;
 * - serre : immeubles rapprochés, passages fixes, marches plus petites,
 *   rythme plus rapide ;
 * - large : immeubles espacés mais tous mobiles et plus amples.
 */
export const MOTIFS = {
  libre: 0,
  zigzag: 0,
  escalier: 8,
  vague: 12,
  serre: 20,
  large: 40,
};
const SERRE = 0.85; // part de l'espacement normal dans le motif serre
const LARGE = 1.2; // part de l'espacement normal dans le motif large
const AMPLE = 1.25; // amplitude des obstacles du motif large (bornée à 46)

function tirerMotif(m, rang) {
  const ouverts = Object.keys(MOTIFS).filter((k) => rang >= MOTIFS[k] && k !== m.motif);
  m.motif = ouverts[Math.floor(aleatoire(m) * ouverts.length)] || 'libre';
  m.motifReste = 3 + Math.floor(aleatoire(m) * 4);
}

/** Abscisse fixe du drone (unités). */
export function positionDrone(largeur) {
  return Math.round(Math.max(110, largeur * 0.28));
}

export function creerMonde(largeur, graine = Date.now()) {
  const l = Math.max(400, largeur || 600);
  const yDepart = (HAUTEUR - SOL) * 0.45;
  return {
    largeur: l,
    graine: graine | 0,
    phase: 'pret',
    t: 0,
    decor: 0, // distance parcourue, pour la parallaxe
    score: 0,
    passes: 0, // obstacles franchis
    colis: 0,
    clients: 0,
    yDepart,
    drone: { x: positionDrone(l), y: yDepart, vy: 0, angle: 0 },
    obstacles: [],
    prochainId: 1,
    dernierCentre: yDepart,
    dernierAmp: 0,
    tempsChute: 0,
    // Bonus spéciaux (sauvegardés avec le monde).
    bouclier: false,
    aimant: 0, // secondes restantes
    double: 0, // secondes restantes
    invincible: 0, // secondes restantes après un choc encaissé
    bonusPris: 0,
    dernierBonus: -99, // rang du dernier obstacle portant un bonus
    motif: 'libre', // forme de la série d'obstacles en cours (voir MOTIFS)
    motifReste: 3, // obstacles restants dans le motif en cours
    dernierPhi: 0, // balancement du dernier obstacle (motif vague)
  };
}

/** Multiplicateur de points en cours (bonus points doublés). */
export function multiplicateur(m) {
  return (m.double || 0) > 0 ? 2 : 1;
}

/** Bonus actifs, pour le HUD : { id, ratio } (ratio de temps restant, 1 pour le bouclier). */
export function bonusActifs(m) {
  const l = [];
  if (m.bouclier) l.push({ id: 'bouclier', ratio: 1 });
  if ((m.aimant || 0) > 0) l.push({ id: 'aimant', ratio: m.aimant / DUREE_AIMANT });
  if ((m.double || 0) > 0) l.push({ id: 'double', ratio: m.double / DUREE_DOUBLE });
  return l;
}

export function changerLargeur(m, largeur) {
  m.largeur = Math.max(400, largeur || m.largeur);
  m.drone.x = positionDrone(m.largeur);
}

/** Centre actuel du passage (les obstacles mobiles montent et descendent). */
export function centreObstacle(o, t) {
  return o.amp ? o.centre + o.amp * Math.sin(o.phi + t * o.omega) : o.centre;
}

/**
 * Plus grand écart vertical franchissable entre deux passages dont les bords
 * gauches sont espacés de `distance`, à la vitesse `vitesse`, pour un passage
 * de hauteur `ecart`. Temps utile : entre la sortie du premier obstacle et
 * l'entrée dans le second, plus un quart de la marge libre dans chaque
 * passage. Montée : 60 % de la montée humaine. Descente : plus large (la
 * gravité aide) mais bornée pour rester contrôlable.
 */
export function ecartAtteignable(distance, vitesse, ecart) {
  const duree = Math.max(0.2, (distance - LARGEUR_OBSTACLE - 2 * DRONE_DX) / vitesse);
  const jeu = 0.25 * Math.max(0, ecart - 2 * DRONE_DY);
  return {
    montee: 0.6 * MONTEE_HUMAINE * duree + jeu,
    descente: 0.9 * MONTEE_HUMAINE * duree + jeu,
  };
}

/** Bornes du centre d'un passage pour garder MARGE en haut et en bas. */
export function bornesCentre(ecart, amp) {
  return {
    min: MARGE + ecart / 2 + amp,
    max: HAUTEUR - SOL - MARGE - ecart / 2 - amp,
  };
}

/** Ajoute un obstacle à droite du dernier (ou juste hors écran s'il n'y en a aucun). */
export function nouvelObstacle(m) {
  const r = reglages(m.passes + m.obstacles.filter((o) => !o.franchi).length);
  const precedent = m.obstacles[m.obstacles.length - 1];
  const rangObs = m.passes + m.obstacles.length;
  if (!(m.motifReste > 0) || !Object.prototype.hasOwnProperty.call(MOTIFS, m.motif)) {
    tirerMotif(m, rangObs);
  }
  const motif = m.motif;
  m.motifReste -= 1;
  // Serre : seulement derrière un passage fixe (sortir d'un obstacle mobile
  // demande le temps normal).
  const serre = motif === 'serre' && !(precedent && precedent.amp);
  const espace = r.espacement * (serre ? SERRE : motif === 'large' ? LARGE : 1);
  const x = precedent ? precedent.x + espace : m.largeur + 60;
  const mobile =
    r.probaMouvement > 0 &&
    motif !== 'serre' &&
    motif !== 'escalier' &&
    (motif === 'vague' || motif === 'large' || aleatoire(m) < r.probaMouvement);
  const amp = mobile ? (motif === 'large' ? Math.min(46, r.amplitude * AMPLE) : r.amplitude) : 0;
  const { montee, descente } = ecartAtteignable(espace, r.vitesse, r.ecart);
  // Les obstacles mobiles réduisent la marge de toute leur amplitude (pire moment du balancement).
  const reserve = amp + (m.dernierAmp || 0);
  const limMontee = Math.max(20, montee - reserve);
  const limDescente = Math.max(20, descente - reserve);
  const b = bornesCentre(r.ecart, amp);
  const depart = borner(Number.isFinite(m.dernierCentre) ? m.dernierCentre : m.yDepart, b.min, b.max);
  // Hauteurs franches : le plus souvent à l'opposé du passage précédent
  // (en haut puis en bas), d'au moins `franc` fois le plus grand écart atteignable.
  const place = (sens) => (sens < 0 ? Math.min(limMontee, depart - b.min) : Math.min(limDescente, b.max - depart));
  const tirageSens = aleatoire(m);
  const garder = motif === 'escalier' ? 1 : motif === 'zigzag' ? 0 : 0.2; // chance de garder le sens
  let sens = m.dernierSens ? (tirageSens < garder ? m.dernierSens : -m.dernierSens) : tirageSens < 0.5 ? -1 : 1;
  // L'escalier tourne plus tôt, loin des bords (on n'arrive pas collé au toit).
  const assez = motif === 'escalier' ? 1 : 0.5;
  if (place(sens) < assez * (sens < 0 ? limMontee : limDescente)) {
    sens = -sens;
    if (motif === 'escalier') m.motifReste = 0; // bout de l'escalier : motif suivant
  }
  const maxi = Math.max(0, place(sens));
  const franc = motif === 'zigzag' ? Math.max(r.franc, 0.85) : r.franc;
  // Serre : marches plus petites (couloir sinueux). Escalier : marches
  // régulières, plus de la moitié de l'écart atteignable.
  const tiragePart = aleatoire(m);
  const part =
    motif === 'serre'
      ? 0.3 + 0.3 * tiragePart
      : motif === 'escalier'
        ? 0.5 + 0.3 * tiragePart
        : franc + (1 - franc) * tiragePart;
  const centre = depart + sens * maxi * part;
  const rang = m.passes + m.obstacles.length;
  const tirage = aleatoire(m);
  const client = rang >= 4 && tirage < 0.13;
  const colis = !client && rang >= 2 && tirage > 0.8;
  // Bonus spécial : jamais avec un colis, au plus un tous les BONUS_ECART obstacles.
  let bonus = null;
  const dernierBonus = m.dernierBonus ?? -99;
  if (!colis && rang >= BONUS_RANG_MIN && rang - dernierBonus >= BONUS_ECART && aleatoire(m) < BONUS_PROBA) {
    const b = aleatoire(m);
    bonus = b < 0.36 ? 'bouclier' : b < 0.7 ? 'aimant' : 'double';
    m.dernierBonus = rang;
  }
  const o = {
    id: m.prochainId,
    x,
    largeur: LARGEUR_OBSTACLE,
    centre,
    ecart: r.ecart,
    amp,
    omega:
      motif === 'vague'
        ? (r.omega || 1) * 1.25 // même cadence pour toute la vague
        : (r.omega || 1) * (1.0 + aleatoire(m) * 0.5),
    phi: motif === 'vague' ? (Number(m.dernierPhi) || 0) + 0.9 + aleatoire(m) * 0.4 : aleatoire(m) * Math.PI * 2,
    haut: TYPES_HAUT[Math.floor(aleatoire(m) * TYPES_HAUT.length)],
    teinte: Math.floor(aleatoire(m) * 4),
    colis,
    colisPris: false,
    bonus,
    bonusPris: false,
    client,
    livre: false,
    franchi: false,
  };
  m.prochainId += 1;
  m.dernierCentre = centre;
  m.dernierAmp = amp;
  m.dernierSens = sens;
  m.dernierPhi = o.phi;
  m.obstacles.push(o);
  return o;
}

/** Toucher de l'écran. Rend true si le toucher a fait quelque chose. */
export function impulsion(m) {
  if (m.phase === 'pret') {
    m.phase = 'vol';
    m.dernierCentre = m.drone.y;
    nouvelObstacle(m);
  }
  if (m.phase !== 'vol') return false;
  m.drone.vy = -IMPULSION;
  return true;
}

function toucheObstacle(d, o, t) {
  if (d.x + DRONE_DX <= o.x || d.x - DRONE_DX >= o.x + o.largeur) return false;
  const c = centreObstacle(o, t);
  return d.y - DRONE_DY < c - o.ecart / 2 || d.y + DRONE_DY > c + o.ecart / 2;
}

function toucheColis(d, o, t, aimant = false) {
  const cx = o.x + o.largeur / 2;
  if (Math.abs(d.x - cx) >= DRONE_DX + TAILLE_BONUS / 2) return false;
  if (aimant) return true; // l'aimant attrape le colis à toute hauteur
  const cy = centreObstacle(o, t);
  return Math.abs(d.y - cy) < DRONE_DY + TAILLE_BONUS / 2;
}

function prendreBonus(m, type, ev) {
  if (type === 'bouclier') m.bouclier = true;
  else if (type === 'aimant') m.aimant = DUREE_AIMANT;
  else if (type === 'double') m.double = DUREE_DOUBLE;
  m.bonusPris = (m.bonusPris || 0) + 1;
  ev.push({ type: 'bonus', bonus: type });
}

// Choc encaissé par le bouclier : il disparaît, courte invincibilité.
function encaisser(m, ev) {
  m.bouclier = false;
  m.invincible = DUREE_INVINCIBLE;
  ev.push({ type: 'bouclierPerdu' });
}

function crash(m, ev) {
  m.phase = 'chute';
  m.tempsChute = 0;
  m.drone.vy = Math.min(m.drone.vy, -260); // petit sursaut avant de piquer
  ev.push({ type: 'crash' });
}

/**
 * Avance le monde de `dt` secondes (borné à DT_MAX). Rend la liste des
 * événements : passage, colis, client (avec points), liste (obstacles
 * ajoutés ou retirés), crash, sol (fin de la chute).
 */
export function avancer(m, dtBrut) {
  const ev = [];
  const dt = borner(Number(dtBrut) || 0, 0, DT_MAX);
  const d = m.drone;
  m.t += dt;

  if (m.phase === 'pret') {
    d.y = m.yDepart + Math.sin(m.t * 3) * 14;
    d.vy = 0;
    d.angle = Math.sin(m.t * 3 + 1) * 3;
    m.decor += 80 * dt;
    return ev;
  }
  if (m.phase === 'fini') return ev;

  if (m.phase === 'chute') {
    m.tempsChute += dt;
    d.vy = Math.min(CHUTE_MAX * 1.2, d.vy + GRAVITE * 1.2 * dt);
    d.y += d.vy * dt;
    d.angle += (110 - d.angle) * Math.min(1, dt * 6);
    if (d.y + DRONE_DY >= HAUTEUR - SOL) {
      d.y = HAUTEUR - SOL - DRONE_DY;
      m.phase = 'fini';
      ev.push({ type: 'sol' });
    }
    return ev;
  }

  // Vol
  const r = reglages(m.passes);
  d.vy = Math.min(CHUTE_MAX, d.vy + GRAVITE * dt);
  d.y += d.vy * dt;
  const cible = d.vy < 0 ? -18 : Math.min(70, d.vy * 0.075);
  d.angle += (cible - d.angle) * Math.min(1, dt * 12);
  const pas = r.vitesse * dt;
  m.decor += pas;

  // Minuteurs des bonus (points doublés, aimant, invincibilité).
  const mult = multiplicateur(m);
  const aimant = (m.aimant || 0) > 0;
  if (m.double > 0) {
    m.double = Math.max(0, m.double - dt);
    if (m.double === 0) ev.push({ type: 'finBonus', bonus: 'double' });
  }
  if (m.aimant > 0) {
    m.aimant = Math.max(0, m.aimant - dt);
    if (m.aimant === 0) ev.push({ type: 'finBonus', bonus: 'aimant' });
  }

  let changement = false;
  for (const o of m.obstacles) {
    o.x -= pas;
    if (!o.franchi && d.x > o.x + o.largeur) {
      o.franchi = true;
      m.passes += 1;
      m.score += POINTS_PASSAGE * mult;
      ev.push({ type: 'passage', points: POINTS_PASSAGE * mult });
      if (m.passes % PALIER === 0) {
        const niveau = niveauPalier(m.passes);
        ev.push({ type: 'palier', niveau, medaille: medaille(niveau), decor: decorNiveau(niveau) });
      }
      if (o.client && !o.livre && (aimant || d.y > centreObstacle(o, m.t))) {
        o.livre = true;
        m.clients += 1;
        m.score += POINTS_CLIENT * mult;
        changement = true;
        ev.push({ type: 'client', points: POINTS_CLIENT * mult, id: o.id });
      }
    }
    if (o.colis && !o.colisPris && toucheColis(d, o, m.t, aimant)) {
      o.colisPris = true;
      m.colis += 1;
      m.score += POINTS_COLIS * mult;
      changement = true;
      ev.push({ type: 'colis', points: POINTS_COLIS * mult, id: o.id });
    }
    if (o.bonus && !o.bonusPris && toucheColis(d, o, m.t, aimant)) {
      o.bonusPris = true;
      changement = true;
      prendreBonus(m, o.bonus, ev);
    }
  }

  // Recyclage : on retire ce qui est sorti à gauche, on ajoute à droite.
  const avant = m.obstacles.length;
  m.obstacles = m.obstacles.filter((o) => o.x + o.largeur > -40);
  if (m.obstacles.length !== avant) changement = true;
  let dernier = m.obstacles[m.obstacles.length - 1];
  while (!dernier || dernier.x < m.largeur + 140) {
    dernier = nouvelObstacle(m);
    changement = true;
  }
  if (changement) ev.push({ type: 'liste' });

  // Collisions : haut, sol, obstacles. Bouclier : le choc est encaissé ;
  // invincible : le drone rebondit sur le haut et le sol et traverse les obstacles.
  const dedans = m.obstacles.some((o) => toucheObstacle(d, o, m.t));
  const bord = d.y - DRONE_DY <= 0 || d.y + DRONE_DY >= HAUTEUR - SOL;
  if ((dedans || bord) && !(m.invincible > 0) && m.bouclier) encaisser(m, ev);
  if (m.invincible > 0) {
    if (d.y - DRONE_DY <= 0) {
      d.y = DRONE_DY;
      d.vy = Math.max(0, d.vy);
    } else if (d.y + DRONE_DY >= HAUTEUR - SOL) {
      d.y = HAUTEUR - SOL - DRONE_DY;
      d.vy = -IMPULSION;
    }
    // L'invincibilité ne finit jamais au milieu d'un obstacle.
    m.invincible = dedans ? Math.max(m.invincible - dt, 0.05) : Math.max(0, m.invincible - dt);
    return ev;
  }
  if (bord) {
    if (d.y - DRONE_DY <= 0) d.y = DRONE_DY;
    crash(m, ev);
    return ev;
  }
  if (dedans) crash(m, ev);
  return ev;
}
