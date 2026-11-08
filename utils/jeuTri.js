/**
 * Mini-jeu « Tri express » : règles, niveaux et sauvegarde.
 *
 * Logique pure (sans React) : l'écran screens/JeuTriScreen.js l'utilise.
 * La partie est enregistrée sur le téléphone (AsyncStorage) après chaque
 * colis, à chaque pause et quand l'app passe en arrière-plan : fermer l'app
 * ne fait rien perdre, la partie reprend en pause au même endroit.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Destinations des colis : couleur ET icône (lisible aussi pour les daltoniens).
export const ZONES = [
  { cle: 'maison', icone: 'home', couleur: '#FF6A13' },
  { cle: 'resto', icone: 'restaurant', couleur: '#2E9E5B' },
  { cle: 'boutique', icone: 'storefront', couleur: '#2F80ED' },
  { cle: 'bureau', icone: 'business', couleur: '#8E44AD' },
];

export const VIES_PAR_NIVEAU = 3;
const VERSION = 1;
const PREFIXE_CLE = 'DRIVER_JEU_TRI_V1';

/** Réglages d'un niveau : de plus en plus de zones, de colis et de vitesse, sans fin. */
export function reglagesNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  return {
    zones: n <= 2 ? 2 : n <= 5 ? 3 : 4,
    colis: Math.min(30, 8 + 2 * n),
    // Temps de chute d'un colis (ms) : 4,2 s au niveau 1, jamais sous 1,1 s.
    duree: Math.max(1100, 4200 - (n - 1) * 220),
    // Colis express (points doubles, plus rapides) à partir du niveau 4.
    partExpress: n < 4 ? 0 : Math.min(0.35, 0.1 + (n - 4) * 0.03),
  };
}

/** Points d'un colis bien trié. */
export function pointsColis(niveau, express) {
  return 10 * Math.max(1, niveau) * (express ? 2 : 1);
}

/** Nouveau colis du niveau, jamais deux fois de suite la même destination si possible. */
export function nouveauColis(niveau, zonePrecedente = -1, hasard = Math.random) {
  const r = reglagesNiveau(niveau);
  let zone = Math.floor(hasard() * r.zones);
  if (zone === zonePrecedente && r.zones > 1 && hasard() < 0.6) zone = (zone + 1) % r.zones;
  const express = hasard() < r.partExpress;
  return { zone, express, p: 0 };
}

/** Partie neuve (records gardés). */
export function partieNeuve(records = {}) {
  return {
    v: VERSION,
    niveau: 1,
    score: 0,
    scoreDebutNiveau: 0,
    tries: 0,
    vies: VIES_PAR_NIVEAU,
    phase: 'accueil', // accueil | jeu | pause | niveauFini | perdu
    colis: null,
    meilleurScore: entier(records.meilleurScore),
    meilleurNiveau: Math.max(1, entier(records.meilleurNiveau)),
  };
}

function entier(x, min = 0) {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n >= min ? n : min;
}

/**
 * Relit une sauvegarde : toute valeur abîmée est remplacée par une valeur
 * sûre, jamais de plantage. Une partie en cours revient en pause.
 */
export function nettoyerSauvegarde(brut) {
  if (!brut || typeof brut !== 'object') return partieNeuve();
  const base = partieNeuve(brut);
  const niveau = Math.max(1, entier(brut.niveau, 1));
  const r = reglagesNiveau(niveau);
  const score = entier(brut.score);
  const phases = ['accueil', 'jeu', 'pause', 'niveauFini', 'perdu'];
  let phase = phases.includes(brut.phase) ? brut.phase : 'accueil';
  if (phase === 'jeu') phase = 'pause';
  let colis = null;
  if (brut.colis && typeof brut.colis === 'object') {
    const zone = entier(brut.colis.zone);
    const p = Number(brut.colis.p);
    colis = {
      zone: zone < r.zones ? zone : 0,
      express: brut.colis.express === true,
      p: Number.isFinite(p) && p >= 0 && p < 1 ? Math.min(0.98, p) : 0,
    };
  }
  if (phase === 'pause' && !colis) colis = nouveauColis(niveau);
  return {
    ...base,
    niveau,
    score,
    scoreDebutNiveau: Math.min(score, entier(brut.scoreDebutNiveau)),
    tries: Math.min(r.colis, entier(brut.tries)),
    vies: Math.min(VIES_PAR_NIVEAU, Math.max(1, entier(brut.vies, 1))),
    phase,
    colis,
    meilleurScore: Math.max(base.meilleurScore, score),
    meilleurNiveau: Math.max(base.meilleurNiveau, niveau),
  };
}

/** Une partie par compte livreur sur le téléphone. */
export function cleSauvegarde(idLivreur) {
  return `${PREFIXE_CLE}_${idLivreur != null && idLivreur !== '' ? String(idLivreur) : 'local'}`;
}

export async function chargerPartie(cle) {
  try {
    const texte = await AsyncStorage.getItem(cle);
    return nettoyerSauvegarde(texte ? JSON.parse(texte) : null);
  } catch {
    return partieNeuve();
  }
}

export async function enregistrerPartie(cle, etat) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(etat));
  } catch {
    // Mémoire pleine ou indisponible : la partie continue, nouvel essai au colis suivant.
  }
}

/** Colis bien trié : score, avancée du niveau, records. */
export function apresBonTri(etat, express) {
  const r = reglagesNiveau(etat.niveau);
  const score = etat.score + pointsColis(etat.niveau, express);
  const tries = etat.tries + 1;
  const fini = tries >= r.colis;
  return {
    ...etat,
    score,
    tries,
    phase: fini ? 'niveauFini' : etat.phase,
    colis: fini ? null : etat.colis,
    meilleurScore: Math.max(etat.meilleurScore, score),
    meilleurNiveau: Math.max(etat.meilleurNiveau, fini ? etat.niveau + 1 : etat.niveau),
  };
}

/** Mauvaise zone ou colis tombé : une vie en moins. */
export function apresErreur(etat) {
  const vies = etat.vies - 1;
  if (vies <= 0) return { ...etat, vies: 0, phase: 'perdu', colis: null };
  return { ...etat, vies };
}

/** Niveau suivant. */
export function niveauSuivant(etat) {
  const niveau = etat.niveau + 1;
  return {
    ...etat,
    niveau,
    scoreDebutNiveau: etat.score,
    tries: 0,
    vies: VIES_PAR_NIVEAU,
    phase: 'jeu',
    colis: nouveauColis(niveau),
  };
}

/** Niveau raté : on le recommence (le score revient à celui du début du niveau). */
export function recommencerNiveau(etat) {
  return {
    ...etat,
    score: etat.scoreDebutNiveau,
    tries: 0,
    vies: VIES_PAR_NIVEAU,
    phase: 'jeu',
    colis: nouveauColis(etat.niveau),
  };
}

/** Repartir du niveau 1 (records gardés). */
export function nouvellePartie(etat) {
  return { ...partieNeuve(etat), phase: 'jeu', colis: nouveauColis(1) };
}
