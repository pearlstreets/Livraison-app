/**
 * Logique pure du mini-jeu « Mémoire du livreur » (clé 'memoire', écran
 * screens/JeuMemoireScreen.js), identique à AppUser (utils/jeux/memoire.js).
 *
 * Jeu de paires : niveaux enchaînés et vite durs, pour qu'une bonne partie
 * dure quelques minutes (durci le 16/11/2026, jeu encore jugé trop simple et
 * trop répétitif). Les cartes ne changent jamais de place (échanges après une
 * erreur supprimés le 15/11/2026). Voir parametresNiveau pour la courbe.
 *
 * Paires bonus (cadre doré, dès le niveau 2) : trouver la paire déclenche
 * son effet ; loupe (toutes les cartes visibles un instant), sablier
 * (secondes en plus) ou aimant (une autre paire trouvée d'office).
 *
 * Records (meilleur score, meilleur niveau) gardés sur le téléphone sous
 * USER_JEU_MEMOIRE_V1_<idUser|local> (lu par l'écran Mini-jeux).
 * Aucun appel à React ici : tout est testable avec node
 * (utils/__tests__/jeuMemoire.test.mjs).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {cleSauvegardeJeu, entierJeu} from './commun';

export const JEU_MEMOIRE = 'memoire';

// Paires par niveau ; au-delà du dernier, on reste à 18 paires (36 cartes,
// grille 6x6, cartes encore assez grandes sur un petit téléphone).
export const PAIRES_PAR_NIVEAU = [3, 6, 8, 10, 12, 15, 15, 18];
export const PAIRES_MAX = 18;

// Chrono : secondes par paire, de moins en moins. Valeurs des premiers
// niveaux, puis -0,03 s par niveau jusqu'au plancher (calé pour qu'un joueur
// rapide à la mémoire parfaite finisse toujours le niveau).
const SECONDES_PAR_PAIRE = [4.5, 3.5, 2.9, 2.6, 2.4, 2.25, 2.15, 2.1];
const SECONDES_PAR_PAIRE_PERTE_LENTE = 0.02;
const SECONDES_PAR_PAIRE_MIN = 2;
const SECONDES_FIXES = 2;

// Points. Les points d'une paire montent jusqu'au niveau 10 puis restent fixes
// (le serveur plafonne le score de ce jeu).
export const POINTS_PAIRE_BASE = 10;
export const POINTS_PAIRE_PAR_NIVEAU = 2;
const NIVEAU_POINTS_MAX = 10;
export const POINTS_PAR_SECONDE = 3;
export const POINTS_SANS_ERREUR_PAR_PAIRE = 5;
// Plafond serveur du score de ce jeu (Backend DeliveryApp/views_jeux.py, 50 000
// pour 'memoire', comme côté AppUser) : le score
// affiché et envoyé ne le dépasse pas, sinon le record serait refusé (400).
export const SCORE_MAX_SERVEUR = 50000;

// Combo : paires trouvées d'affilée sans erreur.
export const POINTS_COMBO = 5; // par paire d'affilée après la première
const COMBO_POINTS_MAX = 5; // plafond du multiplicateur
export const COMBO_TEMPS_DES = 3; // secondes offertes à partir de 3 paires d'affilée
export const SECONDES_COMBO = 2;

// Durées d'affichage (ms).
export const DELAI_ERREUR = 600;
export const DELAI_ERREUR_RAPIDE = 480;
export const DELAI_ERREUR_EXPRESS = 400;

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

// Motifs métier : clé de l'illustration (components/jeux/DecorMemoire.js) et couleur du cadre.
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

// Couleurs des variantes d'une même icône (niveaux à motifs proches), aussi
// fond commun de plusieurs icônes différentes (piège « teintes »).
export const COULEURS_VARIANTES = ['#E63946', '#1E88E5', '#2E9E5B', '#F2B705'];

// Pièges de la donne, du plus doux au plus dur :
// - 'distincts' : icônes toutes différentes, chacune avec sa couleur ;
// - 'sosies' : mêmes icônes déclinées en plusieurs couleurs ;
// - 'teintes' : icônes toutes différentes mais sur quelques couleurs
//   communes, la couleur ne sert plus de repère ;
// - 'mixte' : sosies et teintes mêlés, sur les mêmes couleurs.
export const PIEGES = ['distincts', 'sosies', 'teintes', 'mixte'];
// Piège et nombre de couleurs des niveaux 1 à 9 (ensuite : tirage par niveau).
const PIEGES_DEBUT = [
  ['distincts', 1],
  ['distincts', 1],
  ['sosies', 2],
  ['teintes', 4],
  ['sosies', 3],
  ['mixte', 4],
  ['teintes', 3],
  ['sosies', 4],
  ['mixte', 3],
];
const PIEGES_HAUTS = [['sosies', 4], ['teintes', 2], ['mixte', 3], ['teintes', 3], ['mixte', 2]];

/** Nombre de paires du niveau (1, 2, 3...). */
export function pairesNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  return PAIRES_PAR_NIVEAU[n - 1] ?? PAIRES_MAX;
}

/** Secondes du chrono par paire au niveau donné. */
export function secondesParPaire(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  if (n <= SECONDES_PAR_PAIRE.length) return SECONDES_PAR_PAIRE[n - 1];
  const base = SECONDES_PAR_PAIRE[SECONDES_PAR_PAIRE.length - 1];
  return Math.max(SECONDES_PAR_PAIRE_MIN, base - SECONDES_PAR_PAIRE_PERTE_LENTE * (n - SECONDES_PAR_PAIRE.length));
}

/** Nombre de paires bonus du niveau : 0 au niveau 1, 1 aux niveaux 2 à 5, 2 ensuite. */
export function nombreBonus(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  if (n >= 6) return 2;
  if (n >= 2) return 1;
  return 0;
}

/** Piège du niveau : [nom, couleurs]. Jamais deux fois le même d'affilée. */
export function piegeNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  if (n <= PIEGES_DEBUT.length) return PIEGES_DEBUT[n - 1];
  // Tirage reproductible par niveau, différent du niveau précédent.
  const precedent = piegeNiveau(n - 1);
  const alea = creerAlea(n * 7919 + 17);
  for (let essai = 0; essai < 8; essai += 1) {
    const choix = PIEGES_HAUTS[Math.floor(alea() * PIEGES_HAUTS.length)];
    if (choix[0] !== precedent[0]) return choix;
  }
  return PIEGES_HAUTS.find((c) => c[0] !== precedent[0]);
}

/**
 * Paramètres d'un niveau. Courbe durcie le 16/11/2026 :
 * - Niveau 1 : 3 paires toutes différentes, 4,5 s par paire.
 * - Niveau 2 : 6 paires, 3,5 s par paire, première paire bonus.
 * - Niveau 3 : 8 paires, 2,9 s par paire et premier piège (mêmes icônes en
 *   2 couleurs).
 * - Niveaux 4 à 8 : 10, 12, 15, 15 puis 18 paires, chrono de 2,6 s à 2,1 s
 *   par paire, et un piège différent à chaque niveau (sosies, teintes, mixte).
 * - Au-delà : 18 paires, chrono qui baisse encore jusqu'au plancher de 2 s
 *   par paire, piège tiré par niveau, jamais le même deux fois de suite.
 * Le chrono compte 2 s de plus en tout, en plus des secondes par paire.
 * Une mauvaise paire reste visible 600 ms, 480 ms dès le niveau 3, 400 ms
 * dès le 6. Chaque niveau reste faisable par un joueur rapide à la mémoire
 * parfaite (vérifié par les tests).
 * Champs rendus :
 * - duree : secondes du chrono ;
 * - melange : toujours 'aucun' (les cartes ne changent plus de place) ;
 * - echanges : toujours 0 (gardé pour les parties et écrans existants) ;
 * - piege : 'distincts', 'sosies', 'teintes' ou 'mixte' ;
 * - variantes : couleurs utilisées par le piège (1 = motifs tous différents) ;
 * - delaiErreur : temps pendant lequel une mauvaise paire reste visible ;
 * - bonus : nombre de paires bonus ; loupe : durée de la loupe (ms).
 */
export function parametresNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const paires = pairesNiveau(n);
  const duree = Math.round(paires * secondesParPaire(n) + SECONDES_FIXES);
  // Cartes qui changent de place après une erreur : supprimé le 15/11/2026
  // (jugé anormal par les joueurs), aucune carte ne bouge à aucun niveau.
  const echanges = 0;
  const [piege, variantes] = piegeNiveau(n);
  let delaiErreur = DELAI_ERREUR;
  if (n >= 6) delaiErreur = DELAI_ERREUR_EXPRESS;
  else if (n >= 3) delaiErreur = DELAI_ERREUR_RAPIDE;
  return {
    niveau: n,
    paires,
    cartes: paires * 2,
    duree,
    melange: echanges > 0 ? 'echange' : 'aucun',
    echanges,
    piege,
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

// Sosies : peu d'icônes, chacune déclinée en `k` couleurs (celles de `palette` si donnée).
function motifsSosies(icones, nb, k, alea, palette = null) {
  const motifs = [];
  for (const m of icones.slice(0, Math.ceil(nb / k))) {
    const couleurs = palette || melanger(COULEURS_VARIANTES, alea).slice(0, k);
    for (const c of couleurs) motifs.push({ icone: m.icone, couleur: c });
  }
  return melanger(motifs, alea).slice(0, nb);
}

// Teintes : icônes toutes différentes, couleurs prises parmi `k` couleurs communes.
function motifsTeintes(icones, nb, k, alea, palette = null) {
  const couleurs = palette || melanger(COULEURS_VARIANTES, alea).slice(0, k);
  return icones.slice(0, nb).map((m, i) => ({ icone: m.icone, couleur: couleurs[i % k] }));
}

/** Motifs (icône + couleur) des paires d'un niveau, tous différents deux à deux. */
export function motifsNiveau(niveau, alea) {
  const p = parametresNiveau(niveau);
  const icones = melanger(MOTIFS, alea);
  const k = Math.max(1, Math.min(COULEURS_VARIANTES.length, p.variantes));
  let motifs;
  if (p.piege === 'sosies') motifs = motifsSosies(icones, p.paires, k, alea);
  else if (p.piege === 'teintes') motifs = motifsTeintes(icones, p.paires, k, alea);
  else if (p.piege === 'mixte') {
    // Moitié sosies, moitié teintes, sur des icônes différentes.
    const nbSosies = Math.floor(p.paires / 2);
    const nbIconesSosies = Math.ceil(nbSosies / k);
    const palette = melanger(COULEURS_VARIANTES, alea).slice(0, k);
    motifs = motifsSosies(icones, nbSosies, k, alea, palette).concat(
      motifsTeintes(icones.slice(nbIconesSosies), p.paires - nbSosies, k, alea, palette),
    );
  } else {
    motifs = icones.slice(0, p.paires).map((m) => ({ icone: m.icone, couleur: m.couleur }));
  }
  return melanger(motifs, alea);
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

/** Records du jeu sur le téléphone : USER_JEU_MEMOIRE_V1_<idUser|local>. */
export function cleSauvegarde(idUser) {
  return cleSauvegardeJeu(JEU_MEMOIRE, idUser);
}

/** Relit les records : toute valeur abîmée est remplacée par une valeur sûre. */
export function nettoyerRecords(brut) {
  const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  return {
    meilleurScore: Math.min(SCORE_MAX_SERVEUR, entierJeu(b.meilleurScore)),
    meilleurNiveau: Math.max(1, entierJeu(b.meilleurNiveau, 1)),
  };
}

/** Records après une partie (score atteint, dernier niveau joué). */
export function majRecords(records, score, niveau) {
  const r = nettoyerRecords(records);
  return {
    meilleurScore: Math.max(r.meilleurScore, Math.min(SCORE_MAX_SERVEUR, entierJeu(score))),
    meilleurNiveau: Math.max(r.meilleurNiveau, Math.max(1, entierJeu(niveau, 1))),
  };
}

export async function chargerRecords(cle) {
  try {
    const texte = await AsyncStorage.getItem(cle);
    return nettoyerRecords(texte ? JSON.parse(texte) : null);
  } catch (e) {
    return nettoyerRecords(null);
  }
}

export async function enregistrerRecords(cle, records) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(nettoyerRecords(records)));
  } catch (e) {
    // Mémoire indisponible : nouvel essai à la partie suivante.
  }
}
