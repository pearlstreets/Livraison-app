/**
 * Logique pure du mini-jeu « Mémoire du livreur » (screens/JeuMemoireScreen.js).
 *
 * Jeu de paires : niveaux enchaînés, facile au début (2 paires, grille 2x2),
 * puis de plus en plus de cartes et un chrono de plus en plus serré. Dans les
 * niveaux hauts, les cartes cachées se mélangent après une erreur et les
 * motifs se ressemblent (même icône, couleurs différentes).
 *
 * Aucun appel à React ici : tout est testable avec node.
 */

// Paires par niveau ; au-delà du dernier, on reste à 12 paires (24 cartes).
export const PAIRES_PAR_NIVEAU = [2, 3, 4, 6, 8, 10, 12];
export const PAIRES_MAX = 12;

// Chrono : secondes par paire, de moins en moins, avec un plancher.
const SECONDES_PAR_PAIRE_DEPART = 7;
const SECONDES_PAR_PAIRE_PERTE = 0.5;
const SECONDES_PAR_PAIRE_MIN = 3;
const SECONDES_FIXES = 4;

// Points.
export const POINTS_PAIRE_BASE = 10;
export const POINTS_PAIRE_PAR_NIVEAU = 2;
export const POINTS_PAR_SECONDE = 3;
export const POINTS_SANS_ERREUR_PAR_PAIRE = 5;

// Combo : paires trouvées d'affilée sans erreur.
export const POINTS_COMBO = 5; // par paire d'affilée après la première
const COMBO_POINTS_MAX = 5; // plafond du multiplicateur
export const COMBO_TEMPS_DES = 3; // secondes offertes à partir de 3 paires d'affilée
export const SECONDES_COMBO = 2;

// Durées d'affichage (ms).
export const DELAI_ERREUR = 700;
export const DELAI_ERREUR_RAPIDE = 550;

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

/**
 * Paramètres d'un niveau.
 * - duree : secondes du chrono ;
 * - melange : 'aucun', 'echange' (2 cartes cachées échangées après une erreur)
 *   ou 'tout' (toutes les cartes cachées mélangées après une erreur) ;
 * - variantes : couleurs par icône (1 = motifs tous différents, 2 ou 3 =
 *   mêmes icônes en couleurs différentes) ;
 * - delaiErreur : temps pendant lequel une mauvaise paire reste visible.
 */
export function parametresNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const paires = pairesNiveau(n);
  const parPaire = Math.max(SECONDES_PAR_PAIRE_MIN, SECONDES_PAR_PAIRE_DEPART - SECONDES_PAR_PAIRE_PERTE * (n - 1));
  const duree = Math.round(paires * parPaire + SECONDES_FIXES);
  let melange = 'aucun';
  if (n >= 10) melange = 'tout';
  else if (n >= 5) melange = 'echange';
  let variantes = 1;
  if (n >= 9) variantes = 3;
  else if (n >= 6) variantes = 2;
  return { niveau: n, paires, cartes: paires * 2, duree, melange, variantes, delaiErreur: n >= 7 ? DELAI_ERREUR_RAPIDE : DELAI_ERREUR };
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
 * Donne mélangée d'un niveau : [{ id, paire, icone, couleur, trouvee }].
 * Deux cartes de même `paire` forment une paire.
 */
export function creerDonne(niveau, graine) {
  const alea = creerAlea(graine);
  const motifs = motifsNiveau(niveau, alea);
  const cartes = [];
  motifs.forEach((m, paire) => {
    cartes.push({ id: paire * 2, paire, icone: m.icone, couleur: m.couleur, trouvee: false });
    cartes.push({ id: paire * 2 + 1, paire, icone: m.icone, couleur: m.couleur, trouvee: false });
  });
  return melanger(cartes, alea);
}

/** Vrai si les deux cartes forment une paire. */
export function estPaire(a, b) {
  return !!a && !!b && a.id !== b.id && a.paire === b.paire;
}

/**
 * Après une erreur dans les niveaux hauts : les cartes encore cachées
 * changent de place (les cartes trouvées ne bougent pas). Rend une nouvelle
 * liste ; `mode` : 'echange' ou 'tout'.
 */
export function melangerCachees(cartes, mode, alea) {
  if (mode !== 'echange' && mode !== 'tout') return cartes;
  const places = [];
  cartes.forEach((c, i) => { if (!c.trouvee) places.push(i); });
  if (places.length < 3) return cartes;
  const resultat = cartes.slice();
  if (mode === 'echange') {
    const i = Math.floor(alea() * places.length);
    let j = Math.floor(alea() * (places.length - 1));
    if (j >= i) j += 1;
    const a = places[i];
    const b = places[j];
    resultat[a] = cartes[b];
    resultat[b] = cartes[a];
    return resultat;
  }
  const cachees = melanger(places.map((i) => cartes[i]), alea);
  places.forEach((place, k) => { resultat[place] = cachees[k]; });
  return resultat;
}

/** Points gagnés pour une paire trouvée au niveau donné. */
export function pointsPaire(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  return POINTS_PAIRE_BASE + POINTS_PAIRE_PAR_NIVEAU * (n - 1);
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
