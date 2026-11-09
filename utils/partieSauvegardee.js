/**
 * Sauvegarde / reprise d'une partie en cours, par jeu et par livreur
 * (AsyncStorage, horodatée).
 *
 *   await sauverPartie(jeu, idLivreur, { niveau, score, ...etatDuJeu })
 *     A appeler à la pause, à l'arrière-plan et en quittant (l'état doit être
 *     un objet JSON simple). Ne lève jamais d'erreur.
 *   const p = await chargerPartie(jeu, idLivreur)
 *     Rend l'état sauvegardé (avec `.horodatage`) s'il a moins de 24 h, sinon
 *     null (et l'efface s'il est périmé).
 *   await effacerPartie(jeu, idLivreur)
 *     A appeler à la fin de partie (perdu), à « Recommencer » et après une
 *     reprise réussie si le jeu le souhaite.
 *
 * Règle : jamais de fenêtre « Reprendre » après une partie perdue (effacer
 * dès la fin de partie), et jamais au-delà de 24 h. Voir
 * components/ReprisePartie.js pour la fenêtre.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DUREE_MAX_MS = 24 * 60 * 60 * 1000;
const PREFIXE = 'pearl_jeux_partie_v1';

function cle(jeu, idLivreur) {
  return `${PREFIXE}_${jeu}_${idLivreur != null && idLivreur !== '' ? String(idLivreur) : 'local'}`;
}

export async function sauverPartie(jeu, idLivreur, etat) {
  try {
    await AsyncStorage.setItem(cle(jeu, idLivreur), JSON.stringify({ ...etat, horodatage: Date.now() }));
  } catch {
    // Sans gravité : la partie ne sera simplement pas proposée.
  }
}

export async function effacerPartie(jeu, idLivreur) {
  try { await AsyncStorage.removeItem(cle(jeu, idLivreur)); } catch { /* rien */ }
}

export async function chargerPartie(jeu, idLivreur) {
  try {
    const brut = await AsyncStorage.getItem(cle(jeu, idLivreur));
    if (!brut) return null;
    const d = JSON.parse(brut);
    const age = Date.now() - Number(d?.horodatage);
    if (!d || !Number.isFinite(age) || age < 0 || age > DUREE_MAX_MS) {
      await effacerPartie(jeu, idLivreur);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}
