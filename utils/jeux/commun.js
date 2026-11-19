/**
 * Socle commun des mini-jeux du livreur (copie d'AppUser src/utils/jeux/commun.js).
 *
 * - COULEURS_JEUX : palette des jeux (l'app est dessinée en clair seulement).
 *   Fond orange (marque) = texte blanc, jamais de fond noir.
 * - useCompteJeu() : compte du livreur (useAuth), {idUser, connecte}.
 * - cleSauvegardeJeu(jeu, idUser) : clé AsyncStorage de la partie d'un jeu,
 *   une partie par compte (`local` sans compte). La sauvegarde est un objet
 *   JSON qui porte au moins `meilleurScore` (lu par l'écran Mini-jeux).
 * - lireMeilleurScore(jeu, idUser) : record local d'un jeu, 0 si rien ou abîmé
 *   (inclut le record des anciennes versions du livreur, utils/jeuxRecords.js).
 * - JEUX : liste des jeux pour le hub (route, icône Ionicons, couleur).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuth} from '../../contexts/AuthContext';
import {chargerRecord} from '../jeuxRecords';

export const COULEURS_JEUX = {
  fond: '#FFFFFF',
  surface: '#F6F5F6',
  bordure: '#E3E5EC',
  bordureForte: '#C5C6C7',
  texte: '#30334F',
  texteDoux: '#5B6080',
  texteDiscret: '#868EAE',
  marque: '#F28C28', // orange du classement, texte blanc dessus
  marqueClair: '#FFF1E3',
  danger: '#ff623d',
  succes: '#00B894',
  or: '#F2B705',
  voile: 'rgba(48, 51, 79, 0.55)',
  blanc: '#FFFFFF',
};

export const JEUX = [
  {jeu: 'toits', image: require('../../assets/images/jeux/toits.webp'), route: 'JeuToits', prefixe: 'jeuxToits', icone: 'home', couleur: '#B8613A'},
  {jeu: 'slalom', image: require('../../assets/images/jeux/slalom.webp'), route: 'JeuSlalom', prefixe: 'jeuxSlalom', icone: 'bicycle', couleur: '#2F80ED'},
  {jeu: 'drone', image: require('../../assets/images/jeux/drone.webp'), route: 'JeuDrone', prefixe: 'jeuxDrone', icone: 'airplane', couleur: '#2D7FF9'},
  // « Colis express » (basket) retiré de la liste le 15/11 à la demande du user.
  {jeu: 'pile', image: require('../../assets/images/jeux/pile.webp'), route: 'JeuPile', prefixe: 'jeuxPile', icone: 'layers', couleur: '#8E44AD'},
  {jeu: 'sommet', image: require('../../assets/images/jeux/sommet.webp'), route: 'JeuSommet', prefixe: 'jeuxSommet', icone: 'business', couleur: '#2F80ED'},
  {jeu: 'coupe', image: require('../../assets/images/jeux/coupe.webp'), route: 'JeuCoupe', prefixe: 'jeuxCoupe', icone: 'cut', couleur: '#E74C3C'},
  {jeu: 'memoire', image: require('../../assets/images/jeux/memoire.webp'), route: 'JeuMemoire', prefixe: 'jeuxMemoire', icone: 'albums', couleur: '#8E44AD'},
];

/** Compte du livreur : id (null sans compte) et connecté ou non. */
export function useCompteJeu() {
  const auth = useAuth();
  const id = auth?.user?.id;
  const idUser = id != null && id !== '' ? String(id) : null;
  return {idUser, connecte: idUser != null};
}

/** Clé de sauvegarde d'un jeu : USER_JEU_<JEU>_V1_<idUser|local>. */
export function cleSauvegardeJeu(jeu, idUser) {
  const suffixe = idUser != null && idUser !== '' ? String(idUser) : 'local';
  return `USER_JEU_${String(jeu).toUpperCase()}_V1_${suffixe}`;
}

/** Entier positif sûr (0 si la valeur est abîmée). */
export function entierJeu(x, min = 0) {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n >= min ? n : min;
}

/** Record local d'un jeu (0 si pas encore joué ou sauvegarde abîmée), record des anciennes versions compris. */
export async function lireMeilleurScore(jeu, idUser) {
  let local = 0;
  try {
    const texte = await AsyncStorage.getItem(cleSauvegardeJeu(jeu, idUser));
    const brut = texte ? JSON.parse(texte) : null;
    local = entierJeu(brut?.meilleurScore);
  } catch (e) {
    local = 0;
  }
  let ancien = 0;
  try {
    ancien = entierJeu((await chargerRecord(jeu, idUser)).meilleur);
  } catch (e) {
    ancien = 0;
  }
  return Math.max(local, ancien);
}

/**
 * Reporte le record de l'ancienne version des jeux (utils/jeuxRecords) dans la
 * sauvegarde USER_JEU_<JEU>_V1_<id>, pour que le livreur garde son meilleur score.
 * À appeler avant de charger la partie ou les records du jeu. Ne lève jamais d'erreur.
 */
export async function reprendreAncienRecord(jeu, idUser) {
  try {
    const ancien = entierJeu((await chargerRecord(jeu, idUser)).meilleur);
    if (ancien <= 0) return;
    const cle = cleSauvegardeJeu(jeu, idUser);
    const texte = await AsyncStorage.getItem(cle);
    let brut = null;
    try {
      brut = texte ? JSON.parse(texte) : null;
    } catch (e) {
      brut = null;
    }
    const base = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
    if (entierJeu(base.meilleurScore) >= ancien) return;
    await AsyncStorage.setItem(cle, JSON.stringify({...base, meilleurScore: ancien}));
  } catch (e) {
    // Sans gravité : le record serveur reste intact.
  }
}
