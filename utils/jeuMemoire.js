/**
 * Logique pure du mini-jeu « Mémoire du livreur » (screens/JeuMemoireScreen.js).
 *
 * Jeu de paires : niveaux enchaînés, facile au début (2 paires, grille 2x2),
 * puis de plus en plus de cartes (jusqu'à 15 paires) et un chrono de plus en
 * plus serré, sans palier plat. À partir du niveau 5, des cartes cachées
 * changent de place après une erreur (1 échange, 2 dès le niveau 10, 3 dès le 14) ;
 * les motifs se ressemblent de plus en plus (même icône, 2 à 4 couleurs) et
 * une mauvaise paire reste visible de moins en moins longtemps.
 *
 * Paires bonus (cadre doré, dès le niveau 2) : trouver la paire déclenche
 * son effet ; loupe (toutes les cartes visibles un instant), sablier
 * (secondes en plus) ou aimant (une autre paire trouvée d'office).
 *
 * Aucun appel à React ici : tout est testable avec node.
 */

// Paires par niveau ; au-delà du dernier, on reste à 15 paires (30 cartes,
// grille 5x6 : 6 lignes comme les 24 cartes, donc des cartes de même taille).
export const PAIRES_PAR_NIVEAU = [2, 3, 4, 6, 8, 10, 12, 12, 12];
export const PAIRES_MAX = 15;

// Chrono : secondes par paire, de moins en moins. Jusqu'au niveau 9 : -0,5 s
// par niveau (7 s puis 3 s) ; ensuite -0,1 s par niveau jusqu'au plancher.
const SECONDES_PAR_PAIRE_DEPART = 7;
const SECONDES_PAR_PAIRE_PERTE = 0.5;
const NIVEAU_FIN_PERTE_RAPIDE = 9;
const SECONDES_PAR_PAIRE_PERTE_LENTE = 0.1;
const SECONDES_PAR_PAIRE_MIN = 2;
const SECONDES_FIXES = 4;

// Points. Les points d'une paire montent jusqu'au niveau 10 puis restent fixes
// (le serveur plafonne le score de ce jeu).
export const POINTS_PAIRE_BASE = 10;
export const POINTS_PAIRE_PAR_NIVEAU = 2;
const NIVEAU_POINTS_MAX = 10;
export const POINTS_PAR_SECONDE = 3;
export const POINTS_SANS_ERREUR_PAR_PAIRE = 5;
// Plafond serveur du score de ce jeu (Backend DeliveryApp/views_jeux.py) : le score
// affiché et envoyé ne le dépasse pas, sinon le record serait refusé (400).
export const SCORE_MAX_SERVEUR = 10000;

// Combo : paires trouvées d'affilée sans erreur.
export const POINTS_COMBO = 5; // par paire d'affilée après la première
const COMBO_POINTS_MAX = 5; // plafond du multiplicateur
export const COMBO_TEMPS_DES = 3; // secondes offertes à partir de 3 paires d'affilée
export const SECONDES_COMBO = 2;

// Durées d'affichage (ms).
export const DELAI_ERREUR = 700;
export const DELAI_ERREUR_RAPIDE = 550;
export const DELAI_ERREUR_EXPRESS = 450;

// Paires bonus : type, niveau d'apparition, icône du badge.
export const BONUS = {
  loupe: { des: 2, icone: 'search' },
  sablier: { des: 3, icone: 'hourglass' },
  aimant: { des: 4, icone: 'magnet' },
};
export const TYPES_BONUS = ['loupe', 'sablier', 'aimant'];
export const SECONDES_SABLIER = 6;
const LOUPE_DEPART = 1400; // ms
const LOUPE_PERTE = 40; // ms par niveau
const LOUPE_MIN = 1300; // retournement (340 ms) compris : environ 1 s de face sur 30 cartes

// Motifs métier : clé de l'illustration (components/FacesMemoire.js) et couleur du cadre.
export const MOTIFS = [
  { icone: 'bicycle', couleur: '#FF6A13' },
  { icone: 'car', couleur: '#3D5A80' },
  { icone: 'cube', couleur: '#B07A45' },
  { icone: 'pizza', couleur: '#E63946' },
  { icone: 'restaurant', couleur: '#6D597A' },
  { icone: 'home', couleur: '#2A9D8F' },
  { icone: 'map', couleur: '#4CAF50' },
  { icone: 'navigate', couleur: '#1E88E5' },
  { icone: 'time', couleur: '#8E44AD' },
  { icone: 'wallet', couleur: '#795548' },
  { icone: 'gift', couleur: '#D81B60' },
  { icone: 'cafe', couleur: '#6F4E37' },
  { icone: 'fast-food', couleur: '#F39C12' },
  { icone: 'storefront', couleur: '#00897B' },
  { icone: 'key', couleur: '#C9A227' },
  { icone: 'call', couleur: '#27AE60' },
  { icone: 'bus', couleur: '#C0392B' },
  { icone: 'basket', couleur: '#16A085' },
];

// Couleurs des variantes d'une même icône (niveaux à motifs proches).
export const COULEURS_VARIANTES = ['#E63946', '#1E88E5', '#2E9E5B', '#F2B705'];

/** Nombre de paires du niveau (1, 2, 3...). */
export function pairesNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  return PAIRES_PAR_NIVEAU[n - 1] ?? PAIRES_MAX;
}

/** Secondes du chrono par paire au niveau donné. */
export function secondesParPaire(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  if (n <= NIVEAU_FIN_PERTE_RAPIDE) return SECONDES_PAR_PAIRE_DEPART - SECONDES_PAR_PAIRE_PERTE * (n - 1);
  const base = SECONDES_PAR_PAIRE_DEPART - SECONDES_PAR_PAIRE_PERTE * (NIVEAU_FIN_PERTE_RAPIDE - 1);
  return Math.max(SECONDES_PAR_PAIRE_MIN, base - SECONDES_PAR_PAIRE_PERTE_LENTE * (n - NIVEAU_FIN_PERTE_RAPIDE));
}

/** Nombre de paires bonus du niveau : 0 au niveau 1, 1 aux niveaux 2-4, 2 aux niveaux 5-9, 3 ensuite. */
export function nombreBonus(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  if (n >= 10) return 3;
  if (n >= 5) return 2;
  if (n >= 2) return 1;
  return 0;
}

/**
 * Paramètres d'un niveau.
 * - duree : secondes du chrono ;
 * - melange : 'aucun' ou 'echange' (cartes cachées échangées après une erreur) ;
 * - echanges : nombre d'échanges après une erreur (0, puis 1 à 3) ;
 * - variantes : couleurs par icône (1 = motifs tous différents, 2 à 4 =
 *   mêmes icônes en couleurs différentes) ;
 * - delaiErreur : temps pendant lequel une mauvaise paire reste visible ;
 * - bonus : nombre de paires bonus ; loupe : durée de la loupe (ms).
 */
export function parametresNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const paires = pairesNiveau(n);
  const duree = Math.round(paires * secondesParPaire(n) + SECONDES_FIXES);
  const echanges = n < 5 ? 0 : n < 10 ? 1 : n < 14 ? 2 : 3;
  let variantes = 1;
  if (n >= 13) variantes = 4;
  else if (n >= 9) variantes = 3;
  else if (n >= 6) variantes = 2;
  let delaiErreur = DELAI_ERREUR;
  if (n >= 12) delaiErreur = DELAI_ERREUR_EXPRESS;
  else if (n >= 7) delaiErreur = DELAI_ERREUR_RAPIDE;
  return {
    niveau: n,
    paires,
    cartes: paires * 2,
    duree,
    melange: echanges > 0 ? 'echange' : 'aucun',
    echanges,
    variantes,
    delaiErreur,
    bonus: nombreBonus(n),
    loupe: Math.max(LOUPE_MIN, LOUPE_DEPART - LOUPE_PERTE * n),
  };
}

/** Types des paires bonus du niveau, tirés parmi ceux déjà débloqués, sans doublon tant que possible. */
export function bonusDuNiveau(niveau, alea) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const dispo = TYPES_BONUS.filter((b) => n >= BONUS[b].des);
  const nb = nombreBonus(n);
  if (!dispo.length || nb <= 0) return [];
  const types = [];
  let sac = [];
  while (types.length < nb) {
    if (!sac.length) sac = melanger(dispo, alea);
    types.push(sac.pop());
  }
  return types;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function creerAlea(graine) {
  let a = (Math.floor(Number(graine)) || 1) >>> 0;
  return function alea() {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mélange de Fisher-Yates, rend une copie. */
export function melanger(liste, alea) {
  const copie = liste.slice();
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(alea() * (i + 1));
    const x = copie[i];
    copie[i] = copie[j];
    copie[j] = x;
  }
  return copie;
}

/** Motifs (icône + couleur) des paires d'un niveau. */
export function motifsNiveau(niveau, alea) {
  const p = parametresNiveau(niveau);
  if (p.variantes <= 1) {
    return melanger(MOTIFS, alea).slice(0, p.paires).map((m) => ({ icone: m.icone, couleur: m.couleur }));
  }
  // Motifs proches : peu d'icônes, chacune déclinée en plusieurs couleurs.
  const nbIcones = Math.ceil(p.paires / p.variantes);
  const icones = melanger(MOTIFS, alea).slice(0, nbIcones);
  const motifs = [];
  for (const m of icones) {
    const couleurs = melanger(COULEURS_VARIANTES, alea).slice(0, p.variantes);
    for (const c of couleurs) motifs.push({ icone: m.icone, couleur: c });
  }
  return melanger(motifs, alea).slice(0, p.paires);
}

/**
 * Donne mélangée d'un niveau : [{ id, paire, icone, couleur, trouvee, bonus }].
 * Deux cartes de même `paire` forment une paire ; `bonus` : type de la paire
 * bonus ('loupe', 'sablier', 'aimant') ou null.
 */
export function creerDonne(niveau, graine) {
  const alea = creerAlea(graine);
  const motifs = motifsNiveau(niveau, alea);
  const types = bonusDuNiveau(niveau, alea);
  const pairesBonus = melanger(motifs.map((_, i) => i), alea).slice(0, types.length);
  const cartes = [];
  motifs.forEach((m, paire) => {
    const k = pairesBonus.indexOf(paire);
    const bonus = k >= 0 ? types[k] : null;
    cartes.push({ id: paire * 2, paire, icone: m.icone, couleur: m.couleur, trouvee: false, bonus });
    cartes.push({ id: paire * 2 + 1, paire, icone: m.icone, couleur: m.couleur, trouvee: false, bonus });
  });
  return melanger(cartes, alea);
}

/**
 * Aimant : numéro d'une paire encore cachée à trouver d'office, de préférence
 * une paire sans bonus (pas d'enchaînement). null s'il n'en reste aucune.
 */
export function paireAimant(cartes, alea) {
  const simples = [];
  const toutes = [];
  cartes.forEach((c) => {
    if (c.trouvee || toutes.includes(c.paire)) return;
    toutes.push(c.paire);
    if (!c.bonus) simples.push(c.paire);
  });
  const liste = simples.length ? simples : toutes;
  if (!liste.length) return null;
  return liste[Math.floor(alea() * liste.length)];
}

/** Vrai si les deux cartes forment une paire. */
export function estPaire(a, b) {
  return !!a && !!b && a.id !== b.id && a.paire === b.paire;
}

/**
 * Après une erreur dans les niveaux hauts : les cartes encore cachées
 * changent de place (les cartes trouvées ne bougent pas). Rend une nouvelle
 * liste ; `mode` : 'echange' (`nombre` échanges de 2 cartes) ou 'tout'.
 */
export function melangerCachees(cartes, mode, alea, nombre = 1) {
  if (mode !== 'echange' && mode !== 'tout') return cartes;
  const places = [];
  cartes.forEach((c, i) => { if (!c.trouvee) places.push(i); });
  if (places.length < 3) return cartes;
  const resultat = cartes.slice();
  if (mode === 'echange') {
    const fois = Math.max(1, Math.min(Math.floor(nombre) || 1, Math.floor(places.length / 2)));
    for (let k = 0; k < fois; k += 1) {
      const i = Math.floor(alea() * places.length);
      let j = Math.floor(alea() * (places.length - 1));
      if (j >= i) j += 1;
      const a = places[i];
      const b = places[j];
      const x = resultat[a];
      resultat[a] = resultat[b];
      resultat[b] = x;
    }
    return resultat;
  }
  const cachees = melanger(places.map((i) => cartes[i]), alea);
  places.forEach((place, k) => { resultat[place] = cachees[k]; });
  return resultat;
}

/** Points gagnés pour une paire trouvée au niveau donné. */
export function pointsPaire(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  return POINTS_PAIRE_BASE + POINTS_PAIRE_PAR_NIVEAU * (Math.min(n, NIVEAU_POINTS_MAX) - 1);
}

/** Bonus de fin de niveau : temps restant et sans erreur. */
export function bonusNiveau(niveau, secondesRestantes, erreurs) {
  const p = parametresNiveau(niveau);
  const temps = Math.max(0, Math.floor(secondesRestantes)) * POINTS_PAR_SECONDE;
  const sansErreur = erreurs === 0 ? p.paires * POINTS_SANS_ERREUR_PAR_PAIRE : 0;
  return { temps, sansErreur, total: temps + sansErreur };
}

/** Points en plus pour la `combo`-ième paire d'affilée (0 pour la première). */
export function bonusCombo(combo) {
  const c = Math.floor(combo) || 0;
  return c >= 2 ? POINTS_COMBO * Math.min(COMBO_POINTS_MAX, c - 1) : 0;
}

/** Secondes offertes pour la `combo`-ième paire d'affilée. */
export function secondesCombo(combo) {
  return (Math.floor(combo) || 0) >= COMBO_TEMPS_DES ? SECONDES_COMBO : 0;
}

/** Étoiles de fin de niveau : 3 sans erreur, 2 avec peu d'erreurs, 1 sinon. */
export function etoilesNiveau(paires, erreurs) {
  const e = Math.max(0, Math.floor(erreurs) || 0);
  if (e === 0) return 3;
  if (e <= Math.ceil(paires / 2)) return 2;
  return 1;
}

/** Score maximal théorique d'un niveau (toutes les paires d'affilée, chrono plein, sans erreur). */
export function scoreMaxNiveau(niveau) {
  const p = parametresNiveau(niveau);
  let combo = 0;
  for (let k = 1; k <= p.paires; k += 1) combo += bonusCombo(k);
  return p.paires * pointsPaire(niveau) + combo + bonusNiveau(niveau, p.duree, 0).total;
}

/**
 * Disposition de la grille : colonnes et lignes qui donnent les plus grandes
 * cartes dans la zone (largeur l, hauteur h), cartes un peu plus hautes que
 * larges (rapport largeur / hauteur `rapport`). Grille pleine, 2 lignes et
 * 2 colonnes au moins (niveau 1 = 2x2).
 */
export function dispositionGrille(nbCartes, l, h, ecart = 10, rapport = 0.8) {
  let meilleure = null;
  for (let colonnes = 2; colonnes <= 6; colonnes += 1) {
    if (nbCartes % colonnes !== 0) continue;
    const lignes = nbCartes / colonnes;
    if (lignes < 2) continue;
    const largeurMax = (l - ecart * (colonnes - 1)) / colonnes;
    const hauteurMax = (h - ecart * (lignes - 1)) / lignes;
    const largeur = Math.max(0, Math.min(largeurMax, hauteurMax * rapport));
    if (!meilleure || largeur > meilleure.largeur) {
      meilleure = { colonnes, lignes, largeur, hauteur: largeur / rapport };
    }
  }
  return meilleure || { colonnes: 2, lignes: Math.ceil(nbCartes / 2), largeur: 0, hauteur: 0 };
}
