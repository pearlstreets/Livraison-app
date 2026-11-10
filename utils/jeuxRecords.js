/**
 * Records des mini-jeux de l'écran « Jeux » : meilleur score par jeu, gardé sur le téléphone, et
 * envoi au serveur du record pas encore transmis (le serveur garde le max).
 *
 * Identifiants de jeu : voir JEUX ci-dessous, mêmes valeurs côté serveur
 * (DeliveryApp/views_jeux.py).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deliveryService } from '../services/deliveryService';

export const JEUX = ['toits', 'sommet', 'drone', 'rush', 'coupe', 'memoire', 'basket'];

const PREFIXE = 'pearl_jeux_record';

function entier(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function cle(jeu, idLivreur) {
  return `${PREFIXE}_${jeu}_${idLivreur != null && idLivreur !== '' ? String(idLivreur) : 'local'}`;
}

/** { meilleur, envoye } : meilleur score local et dernier score accepté par le serveur. */
export async function chargerRecord(jeu, idLivreur) {
  try {
    const texte = await AsyncStorage.getItem(cle(jeu, idLivreur));
    const d = texte ? JSON.parse(texte) : null;
    return { meilleur: entier(d?.meilleur), envoye: entier(d?.envoye) };
  } catch {
    return { meilleur: 0, envoye: 0 };
  }
}

async function ecrire(jeu, idLivreur, record) {
  try { await AsyncStorage.setItem(cle(jeu, idLivreur), JSON.stringify(record)); } catch { /* sans gravité */ }
}

/**
 * Fin de partie : garde le meilleur score puis tente l'envoi au serveur.
 * Rend { meilleur, nouveauRecord }. Ne lève jamais d'erreur (hors ligne = envoi plus tard).
 */
export async function finDePartie(jeu, idLivreur, score) {
  const r = await chargerRecord(jeu, idLivreur);
  const s = entier(score);
  const nouveauRecord = s > r.meilleur;
  const record = { ...r, meilleur: Math.max(r.meilleur, s) };
  await ecrire(jeu, idLivreur, record);
  envoyerRecordEnAttente(jeu, idLivreur).catch(() => {});
  return { meilleur: record.meilleur, nouveauRecord };
}

/** Envoie le record s'il n'est pas encore connu du serveur. */
export async function envoyerRecordEnAttente(jeu, idLivreur) {
  const r = await chargerRecord(jeu, idLivreur);
  if (r.meilleur <= 0 || r.meilleur <= r.envoye) return;
  await deliveryService.envoyerRecordJeux(jeu, r.meilleur);
  const apres = await chargerRecord(jeu, idLivreur);
  await ecrire(jeu, idLivreur, { ...apres, envoye: Math.max(apres.envoye, r.meilleur) });
}
