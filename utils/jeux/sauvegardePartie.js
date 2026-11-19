/**
 * Sauvegarde et reprise d'une partie en cours, par jeu et par compte.
 *
 * Utilitaire (sans interface) :
 *   enregistrerReprise(jeu, idUser, etat, {niveau, score})  Promise ; à la pause, en arrière-plan, en quittant
 *   lireReprise(jeu, idUser)  Promise {etat, niveau, score, ts} ou null (null et effacée au-delà de 24 h)
 *   examinerReprise(jeu, idUser)  Promise {reprise, expiree} (expiree : vraie si la sauvegarde avait plus de 24 h)
 *   effacerReprise(jeu, idUser)  Promise ; fin de partie (perdu), Recommencer
 *   REPRISE_MAX_MS  durée de validité (24 h)
 *
 * Hook pour l'écran :
 *   const {proposition, enregistrer, effacer, reprendre, recommencer, verifier} = useReprise(jeu, {surReprendre, surRecommencer});
 *   - verifier() : à appeler une fois la partie chargée ; ouvre `proposition` ({etat, niveau, score, ts}) si une
 *     sauvegarde de moins de 24 h existe.
 *   - reprendre() : ferme la proposition, appelle surReprendre(etat).
 *   - recommencer() : efface la sauvegarde, ferme la proposition, appelle surRecommencer().
 *   - enregistrer(etat, {niveau, score}) / effacer() : pour l'écran.
 *   Jamais de proposition après une partie perdue : l'écran appelle effacer() au passage en phase « perdu ».
 *
 * Fenêtre prête à l'emploi : components/jeux/FenetreReprise.js.
 */
import {useCallback, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {entierJeu, useCompteJeu} from './commun';

export const REPRISE_MAX_MS = 24 * 3600 * 1000;

function cleReprise(jeu, idUser) {
  const suffixe = idUser != null && idUser !== '' ? String(idUser) : 'local';
  return `USER_JEU_REPRISE_${String(jeu).toUpperCase()}_V1_${suffixe}`;
}

export async function enregistrerReprise(jeu, idUser, etat, {niveau, score} = {}) {
  try {
    await AsyncStorage.setItem(
      cleReprise(jeu, idUser),
      JSON.stringify({etat, niveau: Math.max(1, entierJeu(niveau, 1)), score: entierJeu(score), ts: Date.now()}),
    );
  } catch (e) {
    // Mémoire indisponible : la partie continue sans reprise.
  }
}

export async function effacerReprise(jeu, idUser) {
  try {
    await AsyncStorage.removeItem(cleReprise(jeu, idUser));
  } catch (e) {
    // Rien à effacer.
  }
}

/** Comme lireReprise, avec l'indication « expirée » : {reprise, expiree}. */
export async function examinerReprise(jeu, idUser, maintenant = Date.now()) {
  try {
    const texte = await AsyncStorage.getItem(cleReprise(jeu, idUser));
    if (!texte) return {reprise: null, expiree: false};
    const brut = JSON.parse(texte);
    const ts = Number(brut?.ts);
    if (!brut || typeof brut !== 'object' || !brut.etat || !Number.isFinite(ts) || ts > maintenant + 60000) {
      await effacerReprise(jeu, idUser);
      return {reprise: null, expiree: false};
    }
    if (maintenant - ts > REPRISE_MAX_MS) {
      await effacerReprise(jeu, idUser);
      return {reprise: null, expiree: true};
    }
    return {reprise: {etat: brut.etat, niveau: Math.max(1, entierJeu(brut.niveau, 1)), score: entierJeu(brut.score), ts}, expiree: false};
  } catch (e) {
    await effacerReprise(jeu, idUser);
    return {reprise: null, expiree: false};
  }
}

export async function lireReprise(jeu, idUser, maintenant = Date.now()) {
  return (await examinerReprise(jeu, idUser, maintenant)).reprise;
}

export default function useReprise(jeu, {surReprendre, surRecommencer} = {}) {
  const {idUser} = useCompteJeu();
  const [proposition, setProposition] = useState(null);
  const cb = useRef({});
  cb.current = {surReprendre, surRecommencer};
  const courante = useRef(null);

  const enregistrer = useCallback((etat, infos) => enregistrerReprise(jeu, idUser, etat, infos), [jeu, idUser]);
  const effacer = useCallback(() => effacerReprise(jeu, idUser), [jeu, idUser]);

  const verifier = useCallback(async () => {
    const {reprise: p, expiree} = await examinerReprise(jeu, idUser);
    courante.current = p;
    setProposition(p);
    return {proposition: p, expiree};
  }, [jeu, idUser]);

  const reprendre = useCallback(() => {
    const p = courante.current;
    courante.current = null;
    setProposition(null);
    if (p) cb.current.surReprendre?.(p.etat);
  }, []);

  const recommencer = useCallback(() => {
    effacerReprise(jeu, idUser);
    courante.current = null;
    setProposition(null);
    cb.current.surRecommencer?.();
  }, [jeu, idUser]);

  return {proposition, verifier, enregistrer, effacer, reprendre, recommencer};
}
