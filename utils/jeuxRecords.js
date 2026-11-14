/**
 * Records des mini-jeux de l'écran « Jeux » : meilleur score par jeu, gardé sur le téléphone, et
 * envoi au serveur du record pas encore transmis (le serveur garde le max).
 * Classement du mois (14/11/2026) : le meilleur score du mois en cours (heure de Paris) est
 * aussi gardé et envoyé, même s'il ne bat pas le record à vie.
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

const HEURE = 3600000;

function dernierDimanche(annee, mois) {
  const fin = new Date(Date.UTC(annee, mois + 1, 0));
  return fin.getUTCDate() - fin.getUTCDay();
}

/** Mois civil en heure de Paris : 'AAAA-MM' (heure d'été du dernier dimanche de mars à celui d'octobre). */
export function moisParis(date = new Date()) {
  const t = date.getTime();
  const annee = new Date(t).getUTCFullYear();
  const debut = Date.UTC(annee, 2, dernierDimanche(annee, 2), 1);
  const fin = Date.UTC(annee, 9, dernierDimanche(annee, 9), 1);
  const p = new Date(t + (t >= debut && t < fin ? 2 : 1) * HEURE);
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * { meilleur, envoye, moisMeilleur, mois, maxMois, envoyeMois } : record à vie (et son mois),
 * dernier record accepté par le serveur, meilleur score du mois `mois` et ce que le serveur en a.
 */
export async function chargerRecord(jeu, idLivreur) {
  try {
    const texte = await AsyncStorage.getItem(cle(jeu, idLivreur));
    const d = texte ? JSON.parse(texte) : null;
    return {
      meilleur: entier(d?.meilleur), envoye: entier(d?.envoye),
      moisMeilleur: typeof d?.moisMeilleur === 'string' ? d.moisMeilleur : null,
      mois: typeof d?.mois === 'string' ? d.mois : null,
      maxMois: entier(d?.maxMois), envoyeMois: entier(d?.envoyeMois),
    };
  } catch {
    return { meilleur: 0, envoye: 0, moisMeilleur: null, mois: null, maxMois: 0, envoyeMois: 0 };
  }
}

async function ecrire(jeu, idLivreur, record) {
  try { await AsyncStorage.setItem(cle(jeu, idLivreur), JSON.stringify(record)); } catch { /* sans gravité */ }
}

/**
 * Fin de partie : garde le meilleur score (à vie et du mois) puis tente l'envoi au serveur.
 * Rend { meilleur, nouveauRecord }. Ne lève jamais d'erreur (hors ligne = envoi plus tard).
 */
export async function finDePartie(jeu, idLivreur, score) {
  const r = await chargerRecord(jeu, idLivreur);
  const s = entier(score);
  const mois = moisParis();
  const nouveauRecord = s > r.meilleur;
  const memeMois = r.mois === mois;
  const record = {
    ...r,
    meilleur: Math.max(r.meilleur, s),
    moisMeilleur: nouveauRecord ? mois : r.moisMeilleur,
    mois,
    maxMois: Math.max(memeMois ? r.maxMois : 0, s),
    envoyeMois: memeMois ? r.envoyeMois : 0,
  };
  await ecrire(jeu, idLivreur, record);
  envoyerRecordEnAttente(jeu, idLivreur).catch(() => {});
  return { meilleur: record.meilleur, nouveauRecord };
}

/** Envoie le record à vie et le meilleur score du mois s'ils ne sont pas encore connus du serveur. */
export async function envoyerRecordEnAttente(jeu, idLivreur) {
  const r = await chargerRecord(jeu, idLivreur);
  const mois = moisParis();
  if (r.meilleur > 0 && r.meilleur > r.envoye) {
    // Sans mois connu (record d'avant le 14/11/2026), le serveur ne le compte pas dans le mois.
    await deliveryService.envoyerRecordJeux(jeu, r.meilleur, r.moisMeilleur || '2000-01');
    const apres = await chargerRecord(jeu, idLivreur);
    const envoyeMois = r.moisMeilleur === mois && apres.mois === mois
      ? Math.max(apres.envoyeMois, r.meilleur) : apres.envoyeMois;
    await ecrire(jeu, idLivreur, { ...apres, envoye: Math.max(apres.envoye, r.meilleur), envoyeMois });
  }
  const m = await chargerRecord(jeu, idLivreur);
  if (m.mois === mois && m.maxMois > 0 && m.maxMois > m.envoyeMois) {
    await deliveryService.envoyerRecordJeux(jeu, m.maxMois, mois);
    const apres = await chargerRecord(jeu, idLivreur);
    if (apres.mois === mois) {
      await ecrire(jeu, idLivreur, { ...apres, envoyeMois: Math.max(apres.envoyeMois, m.maxMois) });
    }
  }
}
