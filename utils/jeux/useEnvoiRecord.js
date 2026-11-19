/**
 * Envoi du record d'un mini-jeu au classement des livreurs, et du meilleur
 * score du mois au classement du mois (tous jeux). Copie d'AppUser
 * (src/utils/jeux/useEnvoiRecord.js), même signature ; stockage et envoi
 * passent par utils/jeuxRecords.js (routes driver/jeux/<jeu>/score/,
 * {score, mois}) : les records déjà gardés par les livreurs restent valables.
 *
 *   const {envoyer, connecte} = useEnvoiRecord(jeu, meilleurScore, meilleurNiveau, enChute, scorePartie, niveauPartie);
 *
 * - Garde le score déjà reçu par le serveur (utils/jeuxRecords.js,
 *   `pearl_jeux_record_<jeu>_<idUser>`) : rien n'est renvoyé deux fois.
 * - Classement du mois : `scorePartie` (score de la partie en cours,
 *   facultatif) fait monter le meilleur score du mois même sans record à vie.
 *   Seul un score plus haut que celui déjà reçu part (le serveur garde le
 *   maximum). `meilleurNiveau` et `niveauPartie` : acceptés pour garder la
 *   signature d'AppUser, le serveur livreur ne garde pas le niveau.
 * - N'envoie jamais quand `enChute` est vrai (action de jeu en cours).
 * - Retente au retour au premier plan et à chaque changement de record ou de
 *   pause (après un échec réseau : pas avant 20 s, sauf retour au premier plan).
 *   Jamais d'erreur affichée, jamais bloquant. Sans compte : ne fait rien.
 * - `envoyer()` : Promise qui ne rejette jamais (avant d'ouvrir le classement).
 * - `lireMaxMois()` : Promise du meilleur score du mois de ce jeu connu ici
 *   (null en invité), lu au début d'une partie pour le récap de fin.
 *
 * Aussi exportés : moisParis(date) ('AAAA-MM' en heure de Paris) et
 * finMoisParis(date) (horodatage ms de la fin du mois de Paris).
 */
import {useCallback, useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {chargerRecord, envoiEnAttente, envoyerRecordEnAttente, noterScore} from '../jeuxRecords';
import {useCompteJeu, entierJeu} from './commun';

const HEURE = 3600000;

/** Dernier dimanche d'un mois (jour du mois), en UTC. */
function dernierDimanche(annee, mois) {
  const fin = new Date(Date.UTC(annee, mois + 1, 0));
  return fin.getUTCDate() - fin.getUTCDay();
}

/** Décalage de Paris en heures (2 en heure d'été, 1 sinon), sans Intl. */
function decalageParis(t) {
  const annee = new Date(t).getUTCFullYear();
  const debut = Date.UTC(annee, 2, dernierDimanche(annee, 2), 1);
  const fin = Date.UTC(annee, 9, dernierDimanche(annee, 9), 1);
  return t >= debut && t < fin ? 2 : 1;
}

/** Mois civil en heure de Paris : 'AAAA-MM'. */
export function moisParis(date = new Date()) {
  const t = date.getTime();
  const p = new Date(t + decalageParis(t) * HEURE);
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Fin du mois en cours à Paris (minuit du 1er du mois suivant), en ms. */
export function finMoisParis(date = new Date()) {
  const t = date.getTime();
  const p = new Date(t + decalageParis(t) * HEURE);
  const minuit = Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 1);
  return minuit - decalageParis(minuit - 2 * HEURE) * HEURE;
}

const PAUSE_APRES_ECHEC_MS = 20000;

export default function useEnvoiRecord(jeu, meilleurScore, meilleurNiveau, enChute, scorePartie = 0, niveauPartie = 1) {
  const {idUser, connecte} = useCompteJeu();
  const valeurs = useRef({});
  valeurs.current = {
    jeu, idUser, connecte,
    score: entierJeu(meilleurScore),
    partie: entierJeu(scorePartie),
    enChute: !!enChute,
  };
  const enCours = useRef(null);
  const attenteJusqua = useRef(0);

  const envoyer = useCallback((force = false) => {
    if (enCours.current) return enCours.current;
    const v = valeurs.current;
    if (!v.connecte || v.enChute) return Promise.resolve();
    if (!force && Date.now() < attenteJusqua.current) {
      // Échec réseau récent : on garde le score, il partira plus tard.
      return noterScore(v.jeu, v.idUser, {record: v.score, partie: v.partie}).then(() => {}, () => {});
    }
    let reussi = false;
    const promesse = (async () => {
      await noterScore(v.jeu, v.idUser, {record: v.score, partie: v.partie});
      if (!(await envoiEnAttente(v.jeu, v.idUser))) return;
      try {
        await envoyerRecordEnAttente(v.jeu, v.idUser);
        reussi = true;
        attenteJusqua.current = 0;
      } catch (e) {
        attenteJusqua.current = Date.now() + PAUSE_APRES_ECHEC_MS;
      }
    })()
      .catch(() => {})
      .finally(() => {
        enCours.current = null;
        // Record ou score du mois battu pendant l'envoi : il part juste après.
        const n = valeurs.current;
        if (!reussi || !n.connecte || n.enChute) return;
        envoiEnAttente(n.jeu, n.idUser)
          .then(reste => {
            if (reste) setTimeout(() => envoyerRef.current?.(), 0);
          })
          .catch(() => {});
      });
    enCours.current = promesse;
    return promesse;
  }, []);
  const envoyerRef = useRef(envoyer);
  envoyerRef.current = envoyer;

  // Nouveau record, score de partie, fin d'une chute, changement de compte.
  const partie = entierJeu(scorePartie);
  useEffect(() => {
    if (!enChute) envoyerRef.current();
  }, [meilleurScore, partie, enChute, jeu, idUser, connecte]);

  // Retour au premier plan : nouvel essai.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', etat => {
      if (etat === 'active') envoyerRef.current(true);
    });
    return () => abonnement?.remove?.();
  }, []);

  // `envoyer()` public : avant d'ouvrir le classement, essai immédiat.
  const envoyerMaintenant = useCallback(() => envoyerRef.current(true), []);

  const lireMaxMois = useCallback(async () => {
    const v = valeurs.current;
    if (!v.connecte) return null;
    try {
      const r = await chargerRecord(v.jeu, v.idUser);
      return r.mois === moisParis() ? entierJeu(r.maxMois) : 0;
    } catch (e) {
      return null;
    }
  }, []);

  return {envoyer: envoyerMaintenant, connecte, lireMaxMois};
}
