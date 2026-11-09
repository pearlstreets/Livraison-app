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

export const LARGEUR_OBSTACLE = 112;
export const MARGE = 80; // morceau d'obstacle toujours visible en haut et en bas
export const TAILLE_BONUS = 52;

export const POINTS_PASSAGE = 1;
export const POINTS_COLIS = 5;
export const POINTS_CLIENT = 3;

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
 * Réglages selon le nombre de passages déjà franchis. Jeu dur dès le départ
 * (passage d'environ 3 fois la hauteur du drone, très peu de marge), puis
 * passages plus serrés, plus rapprochés, plus rapides et mobiles.
 */
export function reglages(passes) {
  const p = borner(passes / 60, 0, 1);
  const p2 = borner((passes - 60) / 90, 0, 1);
  return {
    vitesse: 330 + 90 * p + 40 * p2,
    ecart: 200 - 45 * p - 10 * p2, // hauteur du passage libre (200 au départ, 145 au plus dur)
    espacement: 430 - 80 * p, // distance entre deux obstacles
    probaMouvement: passes < 8 ? 0 : Math.min(0.55, 0.2 + (passes - 8) * 0.01),
    amplitude: passes < 8 ? 0 : Math.min(40, 18 + (passes - 8) * 0.6),
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
  };
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
  const o = {
    id: m.prochainId,
    x,
    largeur: LARGEUR_OBSTACLE,
    centre,
    ecart: r.ecart,
    amp,
    omega: 1.0 + aleatoire(m) * 0.5,
    phi: aleatoire(m) * Math.PI * 2,
    haut: TYPES_HAUT[Math.floor(aleatoire(m) * TYPES_HAUT.length)],
    teinte: Math.floor(aleatoire(m) * 4),
    colis,
    colisPris: false,
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

function toucheColis(d, o, t) {
  const cx = o.x + o.largeur / 2;
  const cy = centreObstacle(o, t);
  return Math.abs(d.x - cx) < DRONE_DX + TAILLE_BONUS / 2 && Math.abs(d.y - cy) < DRONE_DY + TAILLE_BONUS / 2;
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

  let changement = false;
  for (const o of m.obstacles) {
    o.x -= pas;
    if (!o.franchi && d.x > o.x + o.largeur) {
      o.franchi = true;
      m.passes += 1;
      m.score += POINTS_PASSAGE;
      ev.push({ type: 'passage', points: POINTS_PASSAGE });
      if (m.passes % PALIER === 0) {
        const niveau = niveauPalier(m.passes);
        ev.push({ type: 'palier', niveau, medaille: medaille(niveau), decor: decorNiveau(niveau) });
      }
      if (o.client && !o.livre && d.y > centreObstacle(o, m.t)) {
        o.livre = true;
        m.clients += 1;
        m.score += POINTS_CLIENT;
        changement = true;
        ev.push({ type: 'client', points: POINTS_CLIENT, id: o.id });
      }
    }
    if (o.colis && !o.colisPris && toucheColis(d, o, m.t)) {
      o.colisPris = true;
      m.colis += 1;
      m.score += POINTS_COLIS;
      changement = true;
      ev.push({ type: 'colis', points: POINTS_COLIS, id: o.id });
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

  // Collisions : haut, sol, obstacles.
  if (d.y - DRONE_DY <= 0 || d.y + DRONE_DY >= HAUTEUR - SOL) {
    if (d.y - DRONE_DY <= 0) d.y = DRONE_DY;
    crash(m, ev);
    return ev;
  }
  for (const o of m.obstacles) {
    if (toucheObstacle(d, o, m.t)) {
      crash(m, ev);
      return ev;
    }
  }
  return ev;
}
