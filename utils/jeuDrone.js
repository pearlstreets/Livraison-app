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
 * Réglages selon le nombre de passages déjà franchis. Début inchangé
 * (passage d'environ 3 fois la hauteur du drone), puis de plus en plus dur
 * sur trois étapes : 0-60 passages (environ 1 min 15), 60-150 (environ
 * 2 min 40), 150-350 (environ 5 min 30) ; au-delà, réglages figés au plus dur.
 * Passages plus serrés, plus rapprochés, plus rapides et plus mobiles, la
 * marge verticale restant toujours calculée (ecartAtteignable).
 */
export function reglages(passes) {
  const p = borner(passes / 60, 0, 1);
  const p2 = borner((passes - 60) / 90, 0, 1);
  const p3 = borner((passes - 150) / 200, 0, 1);
  return {
    vitesse: 330 + 90 * p + 40 * p2 + 40 * p3,
    ecart: 290 - 40 * p - 10 * p2 - 10 * p3, // hauteur du passage libre (290 au départ, 230 au plus dur)
    espacement: 480 - 60 * p - 10 * p2 - 20 * p3, // distance entre deux obstacles (480 puis 390)
    probaMouvement: passes < 8 ? 0 : Math.min(0.55, 0.2 + (passes - 8) * 0.01) + 0.15 * p3,
    amplitude: passes < 8 ? 0 : Math.min(40, 18 + (passes - 8) * 0.6) + 15 * p3,
    omega: 1 + 0.3 * p2 + 0.3 * p3, // vitesse de balancement des obstacles mobiles
  };
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
  const x = precedent ? precedent.x + r.espacement : m.largeur + 60;
  const mobile = r.probaMouvement > 0 && aleatoire(m) < r.probaMouvement;
  const amp = mobile ? r.amplitude : 0;
  const { montee, descente } = ecartAtteignable(r.espacement, r.vitesse, r.ecart);
  // Les obstacles mobiles réduisent la marge (le livreur peut attendre le bon moment, d'où 0.6).
  const reserve = 0.6 * (amp + m.dernierAmp);
  const b = bornesCentre(r.ecart, amp);
  const bas = Math.max(b.min, m.dernierCentre - Math.max(20, montee - reserve));
  const haut = Math.min(b.max, m.dernierCentre + Math.max(20, descente - reserve));
  const centre = bas <= haut ? bas + aleatoire(m) * (haut - bas) : borner(m.dernierCentre, b.min, b.max);
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
    omega: (r.omega || 1) * (1.0 + aleatoire(m) * 0.5),
    phi: aleatoire(m) * Math.PI * 2,
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
