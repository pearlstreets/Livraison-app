/**
 * Mini-jeu « Pile de colis » : règles, niveaux et sauvegarde.
 *
 * Logique pure (sans React) : l'écran screens/JeuPileScreen.js l'utilise
 * (repris tel quel d'AppUser, src/utils/jeux/pile.js).
 *
 * Un colis glisse de gauche à droite (aller-retour) au-dessus de la pile.
 * Toucher l'écran le lâche : la partie qui dépasse du colis du dessous tombe
 * et la pile rétrécit. Colis entièrement à côté : une vie en moins. Pose
 * parfaite (écart sous toleranceParfait) : bonus et largeur gardée.
 *
 * Difficulté (16/11/2026, jeu encore jugé trop simple et répétitif) : voir
 * reglagesNiveau. Le nombre de colis par niveau et les points ne changent
 * pas : le plafond de score du serveur en dépend.
 *
 * Toujours faisable (15/11/2026) : vitesse plafonnée à 400 (700 rendait les
 * niveaux de 30 colis impossibles, même pour un joueur précis à 15 ms près).
 * Chaque colis a sa propre vitesse (colis.v), jamais au-dessus de ce plafond.
 * La pose parfaite se juge en temps : écart d'au plus 16 ms de trajet (une
 * image à l'écran), jamais moins de 3 unités. À 3 unités fixes, un colis
 * rapide avançait de plus que la tolérance à chaque image : impossible à
 * viser, la pile fondait sans recours.
 *
 * Les positions sont en unités de jeu (piste de LARGEUR unités), l'écran les
 * met à l'échelle : une sauvegarde reste juste quelle que soit la taille du
 * téléphone. La partie est enregistrée (AsyncStorage) après chaque colis
 * posé, à chaque pause et quand l'app passe en arrière-plan : elle reprend
 * en pause au même endroit, même si l'app a été fermée.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {cleSauvegardeJeu, entierJeu} from './commun';

export const LARGEUR = 300; // largeur de la piste, en unités de jeu
export const LARGEUR_PLEINE = 150; // largeur d'un colis au début de chaque niveau
export const TOLERANCE_PARFAIT = 3; // écart minimal toléré (unités) d'une pose parfaite
export const TEMPS_PARFAIT_MS = 16; // écart maximal d'une pose parfaite, en temps de trajet
export const LARGEUR_MINI = 1; // en dessous, le colis est considéré à côté
export const VIES_PAR_NIVEAU = 3;
export const VITESSE_MAX = 400; // plafond de vitesse d'un colis (unités par seconde)
export const VITESSE_MINI = 150; // aucun colis plus lent
export const LARGEUR_DEPART_MINI = 100; // colis de départ jamais plus étroit
export const MAX_PILE = 12; // colis gardés en mémoire (les plus hauts), le reste est hors écran
const VERSION = 1;
const PHASES = ['accueil', 'jeu', 'pause', 'niveauFini', 'perdu'];

/**
 * Réglages d'un niveau (16/11/2026). Courbe raide, pour qu'une bonne partie
 * dure quelques minutes et que chaque niveau change de visage.
 *
 * Vitesse de base : 230 unités par seconde au niveau 1, +50 par niveau,
 * plafonnée à 400 dès le niveau 5 (190 et +40 avant).
 * Largeur du colis de départ : 150 aux niveaux 1 et 2, puis 10 de moins par
 * niveau, jamais sous 100 (atteint au niveau 7).
 * Rythme changeant dès le niveau 2 : chaque colis tire sa propre vitesse
 * autour de la base (10 % d'écart au niveau 2, 20 % au niveau 3, 30 % dès le
 * niveau 4), toujours entre 150 et 400.
 * Accélération dans le niveau dès le niveau 3 : les premiers colis partent
 * plus lents (jusqu'à 25 % de moins dès le niveau 6) et le dernier atteint la
 * pleine vitesse.
 * Base décalée dès le niveau 3 : la pile ne part plus du centre, de plus en
 * plus loin vers un bord au hasard.
 * Départ surprise dès le niveau 4 : le colis apparaît n'importe où sur son
 * trajet et dans un sens au hasard, plus seulement à un bord.
 * Le nombre de colis par niveau ne change pas (plafond de score du serveur).
 */
export function reglagesNiveau(niveau) {
  const n = Math.max(1, Math.floor(niveau) || 1);
  const largeur = n <= 2 ? LARGEUR_PLEINE : Math.max(LARGEUR_DEPART_MINI, LARGEUR_PLEINE - 10 * (n - 2));
  return {
    colis: Math.min(30, 6 + 2 * n),
    vitesse: Math.min(VITESSE_MAX, 230 + (n - 1) * 50),
    largeur,
    ecartVitesse: n <= 1 ? 0 : Math.min(0.3, 0.1 * (n - 1)),
    acceleration: n <= 2 ? 0 : Math.min(0.25, 0.05 * (n - 1)),
    decalageBase: n <= 2 ? 0 : Math.min((LARGEUR - largeur) / 2, 25 * (n - 2)),
    departHasard: n >= 4,
  };
}

/** Vitesse la plus basse et la plus haute qu'un colis peut tirer au niveau donné. */
export function bornesVitesse(niveau) {
  const r = reglagesNiveau(niveau);
  const bas = r.vitesse * (1 - r.acceleration) * (1 - r.ecartVitesse);
  const haut = r.vitesse * (1 + r.ecartVitesse);
  return {min: Math.max(VITESSE_MINI, Math.min(VITESSE_MAX, bas)), max: Math.max(VITESSE_MINI, Math.min(VITESSE_MAX, haut))};
}

/** Vitesse d'un colis : base du niveau, accélération selon les colis déjà posés, écart au hasard. */
export function vitesseColis(niveau, poses = 0, hasard = Math.random) {
  const r = reglagesNiveau(niveau);
  const avance = r.colis > 1 ? Math.min(1, Math.max(0, Number(poses) || 0) / (r.colis - 1)) : 1;
  const rampe = 1 - r.acceleration * (1 - avance);
  const ecart = r.ecartVitesse ? 1 + r.ecartVitesse * (2 * hasard() - 1) : 1;
  const b = bornesVitesse(niveau);
  return Math.min(b.max, Math.max(b.min, r.vitesse * rampe * ecart));
}

/** Vitesse d'un colis relue (sauvegarde ancienne ou abîmée : base du niveau). */
function vitesseSure(niveau, v) {
  const b = bornesVitesse(niveau);
  const x = Number(v);
  if (!Number.isFinite(x)) return Math.min(b.max, Math.max(b.min, reglagesNiveau(niveau).vitesse));
  return Math.min(b.max, Math.max(b.min, x));
}

/** Écart maximal (unités) d'une pose parfaite : 16 ms de trajet du colis, 3 unités au moins. */
export function toleranceParfait(niveau, vitesse) {
  const v = vitesse === undefined ? reglagesNiveau(niveau).vitesse : vitesseSure(niveau, vitesse);
  return Math.max(TOLERANCE_PARFAIT, (v * TEMPS_PARFAIT_MS) / 1000);
}

/** Points d'un colis posé (doublés pour une pose parfaite). */
export function pointsPose(niveau, parfait) {
  return 10 * Math.max(1, Math.floor(niveau) || 1) * (parfait ? 2 : 1);
}

/**
 * Trajet du colis qui glisse : il dépasse des bords de la piste (aux trois
 * quarts de sa largeur), pour qu'un colis puisse tomber entièrement à côté.
 */
export function xMinColis(l) {
  return -0.75 * l;
}
export function courseColis(l) {
  return Math.max(1, LARGEUR + 0.5 * l);
}

/** Durée (ms) d'un trajet d'un bout à l'autre pour un colis de largeur l (vitesse v du colis, sinon celle du niveau). */
export function demiPeriodeMs(niveau, l, v) {
  const vitesse = v === undefined ? reglagesNiveau(niveau).vitesse : vitesseSure(niveau, v);
  return Math.max(120, (courseColis(l) / vitesse) * 1000);
}

/** Phase de l'aller-retour ramenée dans [0, 2) : 0 à 1 aller, 1 à 2 retour. */
export function normaliserP(p) {
  const x = Number(p);
  if (!Number.isFinite(x)) return 0;
  const m = x % 2;
  return m < 0 ? m + 2 : m;
}

/** Phase après `ecouleMs` millisecondes (calcul sur l'horloge). */
export function avancerP(p, ecouleMs, demiPeriode) {
  const d = Number(demiPeriode) > 0 ? Number(demiPeriode) : 1;
  return normaliserP(normaliserP(p) + Math.max(0, Number(ecouleMs) || 0) / d);
}

/** Bord gauche du colis (unités) pour une phase p. */
export function xDeP(p, l) {
  const q = normaliserP(p);
  const aller = q <= 1 ? q : 2 - q;
  return xMinColis(l) + aller * courseColis(l);
}

/** Base de la pile au début d'un niveau : centrée, puis décalée au hasard dès le niveau 3. */
export function pileDeBase(niveau = 1, hasard = Math.random) {
  const r = reglagesNiveau(niveau);
  const centre = (LARGEUR - r.largeur) / 2;
  const decalage = r.decalageBase ? r.decalageBase * (2 * hasard() - 1) : 0;
  const x = Math.min(LARGEUR - r.largeur, Math.max(0, centre + decalage));
  return [{x, l: r.largeur}];
}

/** Colis du dessus de la pile. */
export function dessus(pile) {
  return Array.isArray(pile) && pile.length ? pile[pile.length - 1] : pileDeBase()[0];
}

/**
 * Nouveau colis mobile, de la largeur du dessus : parti d'un bord au hasard
 * (n'importe où sur son trajet dès le niveau 4), avec sa propre vitesse.
 */
export function nouveauColis(pile, hasard = Math.random, niveau = 1, poses = 0) {
  const r = reglagesNiveau(niveau);
  const p = r.departHasard ? normaliserP(2 * hasard()) : hasard() < 0.5 ? 0 : 1;
  return {l: dessus(pile).l, p, v: vitesseColis(niveau, poses, hasard)};
}

/**
 * Découpe d'un colis lâché à x (bord gauche, largeur l) sur le colis du dessous.
 * Rend { issue: 'parfait' | 'coupe' | 'rate', bloc, tombe } :
 * - bloc : colis qui reste sur la pile (null si raté) ;
 * - tombe : morceaux qui tombent (pour l'animation).
 */
export function decouper(dessous, x, l, tolerance = TOLERANCE_PARFAIT) {
  const gauche = Math.max(x, dessous.x);
  const droite = Math.min(x + l, dessous.x + dessous.l);
  const recouvrement = droite - gauche;
  if (!(recouvrement >= LARGEUR_MINI)) {
    return {issue: 'rate', bloc: null, tombe: [{x, l}]};
  }
  if (Math.abs(x - dessous.x) <= tolerance) {
    // Pose parfaite : calé sur le colis du dessous, largeur gardée.
    return {issue: 'parfait', bloc: {x: dessous.x, l: Math.min(l, dessous.l)}, tombe: []};
  }
  const tombe = [];
  if (x < gauche) tombe.push({x, l: gauche - x});
  if (x + l > droite) tombe.push({x: droite, l: x + l - droite});
  return {issue: 'coupe', bloc: {x: gauche, l: recouvrement}, tombe};
}

/** Partie neuve (records gardés). */
export function partieNeuve(records = {}) {
  const pile = pileDeBase();
  return {
    v: VERSION,
    niveau: 1,
    score: 0,
    scoreDebutNiveau: 0,
    poses: 0, // colis posés dans le niveau
    hauteur: 1, // colis de la pile depuis la base du niveau (base comprise)
    vies: VIES_PAR_NIVEAU,
    phase: 'accueil', // accueil | jeu | pause | niveauFini | perdu
    pile,
    colis: null,
    meilleurScore: entierJeu(records?.meilleurScore),
    meilleurNiveau: Math.max(1, entierJeu(records?.meilleurNiveau)),
  };
}

function blocSur(b) {
  if (!b || typeof b !== 'object') return null;
  const x = Number(b.x);
  const l = Number(b.l);
  if (!Number.isFinite(x) || !Number.isFinite(l)) return null;
  if (l < LARGEUR_MINI || l > LARGEUR_PLEINE) return null;
  if (x < -0.01 || x + l > LARGEUR + 0.01) return null;
  return {x: Math.max(0, x), l};
}

/**
 * Relit une sauvegarde : toute valeur abîmée est remplacée par une valeur
 * sûre, jamais de plantage. Une partie en cours revient en pause.
 */
export function nettoyerSauvegarde(brut) {
  try {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return partieNeuve();
    const base = partieNeuve(brut);
    const niveau = Math.max(1, entierJeu(brut.niveau, 1));
    const r = reglagesNiveau(niveau);
    const score = entierJeu(brut.score);
    let phase = PHASES.includes(brut.phase) ? brut.phase : 'accueil';
    if (phase === 'jeu') phase = 'pause';

    // Pile : un seul bloc abîmé et on repart de la base du niveau.
    let pile = Array.isArray(brut.pile) ? brut.pile.slice(-MAX_PILE).map(blocSur) : [];
    if (!pile.length || pile.some(b => !b)) pile = pileDeBase(niveau);
    let poses = Math.min(r.colis, entierJeu(brut.poses));
    if (phase !== 'niveauFini' && poses >= r.colis) poses = r.colis - 1;
    const hauteur = Math.max(pile.length, entierJeu(brut.hauteur, 1));

    let colis = null;
    if (phase === 'pause' || phase === 'jeu') {
      const p = Number(brut.colis?.p);
      colis = {l: dessus(pile).l, p: Number.isFinite(p) ? normaliserP(p) : 0, v: vitesseSure(niveau, brut.colis?.v)};
    }
    let vies = Math.min(VIES_PAR_NIVEAU, entierJeu(brut.vies, 0));
    if (phase === 'perdu') vies = 0;
    else if (vies < 1) vies = 1;

    return {
      ...base,
      niveau,
      score,
      scoreDebutNiveau: Math.min(score, entierJeu(brut.scoreDebutNiveau)),
      poses,
      hauteur,
      vies,
      phase,
      pile,
      colis,
      meilleurScore: Math.max(base.meilleurScore, score),
      meilleurNiveau: Math.max(base.meilleurNiveau, niveau),
    };
  } catch (e) {
    return partieNeuve();
  }
}

/** Une partie par compte livreur sur le téléphone : USER_JEU_PILE_V1_<idUser|local>. */
export function cleSauvegarde(idUser) {
  return cleSauvegardeJeu('pile', idUser);
}

export async function chargerPartie(cle) {
  try {
    const texte = await AsyncStorage.getItem(cle);
    if (!texte) return partieNeuve();
    let brut = null;
    try {
      brut = JSON.parse(texte);
    } catch (e) {
      brut = null;
    }
    const propre = nettoyerSauvegarde(brut);
    // Sauvegarde illisible : remplacée tout de suite par la version réparée.
    if (!brut || typeof brut !== 'object') enregistrerPartie(cle, propre);
    return propre;
  } catch (e) {
    return partieNeuve();
  }
}

export async function enregistrerPartie(cle, etat) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(etat));
  } catch (e) {
    // Mémoire pleine ou indisponible : la partie continue, nouvel essai au colis suivant.
  }
}

/**
 * Colis lâché au bord gauche x : découpe, score, vies, avancée du niveau.
 * Rend { etat, issue, tombe, points }.
 */
export function poser(etat, x, hasard = Math.random) {
  const haut = dessus(etat.pile);
  const l = etat.colis?.l || haut.l;
  const d = decouper(haut, x, l, toleranceParfait(etat.niveau, etat.colis?.v));
  if (d.issue === 'rate') {
    const vies = etat.vies - 1;
    if (vies <= 0) {
      return {etat: {...etat, vies: 0, phase: 'perdu', colis: null}, issue: 'rate', tombe: d.tombe, points: 0};
    }
    return {etat: {...etat, vies, colis: nouveauColis(etat.pile, hasard, etat.niveau, etat.poses)}, issue: 'rate', tombe: d.tombe, points: 0};
  }
  const parfait = d.issue === 'parfait';
  const points = pointsPose(etat.niveau, parfait);
  const r = reglagesNiveau(etat.niveau);
  const score = etat.score + points;
  const poses = etat.poses + 1;
  const pile = [...etat.pile, d.bloc].slice(-MAX_PILE);
  const fini = poses >= r.colis;
  return {
    etat: {
      ...etat,
      score,
      poses,
      hauteur: etat.hauteur + 1,
      pile,
      phase: fini ? 'niveauFini' : etat.phase,
      colis: fini ? null : nouveauColis(pile, hasard, etat.niveau, poses),
      meilleurScore: Math.max(etat.meilleurScore, score),
      meilleurNiveau: Math.max(etat.meilleurNiveau, fini ? etat.niveau + 1 : etat.niveau),
    },
    issue: d.issue,
    tombe: d.tombe,
    points,
  };
}

function departNiveau(etat, niveau, score, hasard = Math.random) {
  const pile = pileDeBase(niveau, hasard);
  return {
    ...etat,
    niveau,
    score,
    scoreDebutNiveau: score,
    poses: 0,
    hauteur: 1,
    vies: VIES_PAR_NIVEAU,
    phase: 'jeu',
    pile,
    colis: nouveauColis(pile, hasard, niveau, 0),
  };
}

/** Niveau suivant : plus de colis, plus vite, colis de départ plus étroit, nouveaux pièges. */
export function niveauSuivant(etat, hasard = Math.random) {
  return departNiveau(etat, etat.niveau + 1, etat.score, hasard);
}

/** Niveau raté : on le recommence (le score revient à celui du début du niveau). */
export function recommencerNiveau(etat) {
  return departNiveau(etat, etat.niveau, etat.scoreDebutNiveau);
}

/** Repartir du niveau 1 (records gardés). */
export function nouvellePartie(etat) {
  return departNiveau(partieNeuve(etat), 1, 0);
}
