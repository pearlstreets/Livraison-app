/**
 * Données du bandeau « Vous : 12e · record 1 840 » et « TOP 1 : Karim B. · 5 200 ».
 *
 *   const bandeau = useBandeauClassement(jeu, {score, meilleurLocal, enPartie});
 *   <BandeauClassement bandeau={bandeau} />          (components/jeux/BandeauClassement.js)
 *
 * - `score` : score de la partie en cours (mise à jour en direct).
 * - `meilleurLocal` : record local du jeu (null tant que l'écran n'a pas chargé la partie).
 * - `enPartie` : vrai pendant la partie ; au passage à faux, le classement est relu.
 * - Source : deliveryService.getClassementJeux(jeu) (top + moi, routes driver/jeux/<jeu>/classement/), chargé à l'ouverture, relu 2,5 s après
 *   chaque changement de record local (envoi de score) et à la fin d'une partie.
 *   Cache AsyncStorage `USER_JEU_BANDEAU_<JEU>_<idUser|local>` pour l'affichage hors ligne.
 *   Invité : aucun appel, « Pas encore classé » et record local.
 * - Rend {rang, record, top1: {nom, score} | null, classe, annonce: null | 'record' | 'top1', horsLigne, recharger}.
 *   `horsLigne` (livreur) : vrai 3 s quand le classement n'a pas pu être lu faute de réseau ;
 *   BandeauClassement affiche alors « Aucune connexion internet, score gardé » en rouge.
 *   `rang` et `record` suivent la partie en direct : record = max(record, score), rang 1 si le score
 *   dépasse le premier. `annonce` : « Nouveau record ! » ou « Vous êtes TOP 1 », 3 s, au moment du dépassement.
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {deliveryService} from '../../services/deliveryService';
import {entierJeu, useCompteJeu} from './commun';

const DUREE_ANNONCE = 3000;
const DELAI_RELECTURE = 2500;
const DUREE_HORS_LIGNE = 3000;

function cleBandeau(jeu, idUser) {
  return `USER_JEU_BANDEAU_${String(jeu).toUpperCase()}_${idUser != null && idUser !== '' ? String(idUser) : 'local'}`;
}

/** Réduit la réponse de l'API à {rang, record, top1}. */
export function resumerClassement(data) {
  const liste = Array.isArray(data?.classement) ? data.classement.filter(l => l && typeof l === 'object') : [];
  const premier = liste.find(l => Number(l.rang) === 1) || liste[0] || null;
  const moi = data?.moi && typeof data.moi === 'object' ? data.moi : liste.find(l => l.moi) || null;
  return {
    rang: moi && entierJeu(moi.rang) > 0 ? entierJeu(moi.rang) : null,
    record: moi ? entierJeu(moi.score) : 0,
    top1: premier ? {nom: String(premier.nom || ''), score: entierJeu(premier.score)} : null,
  };
}

export default function useBandeauClassement(jeu, {score = 0, meilleurLocal = null, enPartie = false} = {}) {
  const {idUser, connecte} = useCompteJeu();
  const [base, setBase] = useState({rang: null, record: 0, top1: null});
  const [annonce, setAnnonce] = useState(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const demande = useRef(0);
  const monte = useRef(true);
  const minuteurs = useRef({annonce: null, relecture: null, horsLigne: null});
  const depart = useRef(null); // record et premier au début de la partie : seuils des annonces
  const dejaAnnonce = useRef({record: false, top1: false});

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
      clearTimeout(minuteurs.current.annonce);
      clearTimeout(minuteurs.current.relecture);
      clearTimeout(minuteurs.current.horsLigne);
    };
  }, []);

  // Cache d'abord (affichage hors ligne), puis le serveur.
  const recharger = useCallback(async () => {
    const n = ++demande.current;
    const cle = cleBandeau(jeu, idUser);
    if (n === 1 || !connecte) {
      try {
        const texte = await AsyncStorage.getItem(cle);
        const c = texte ? JSON.parse(texte) : null;
        if (c && monte.current && n === demande.current) setBase(c);
      } catch (e) {
        // Cache abîmé : ignoré.
      }
    }
    if (!connecte) return;
    try {
      const resume = resumerClassement(await deliveryService.getClassementJeux(jeu));
      if (!monte.current || n !== demande.current) return;
      setBase(resume);
      AsyncStorage.setItem(cle, JSON.stringify(resume)).catch(() => {});
    } catch (e) {
      // Hors ligne : on garde le cache, bandeau rouge 3 s (le score reste gardé
      // sur le téléphone et part plus tard, utils/jeuxRecords.js).
      if (e?.isNetworkError && monte.current && n === demande.current) {
        setHorsLigne(true);
        clearTimeout(minuteurs.current.horsLigne);
        minuteurs.current.horsLigne = setTimeout(() => monte.current && setHorsLigne(false), DUREE_HORS_LIGNE);
      }
    }
  }, [jeu, idUser, connecte]);
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;

  useEffect(() => {
    recharger();
  }, [recharger]);

  // Relecture après un envoi de score (record local changé) et en fin de partie.
  const relireBientot = useCallback(() => {
    clearTimeout(minuteurs.current.relecture);
    minuteurs.current.relecture = setTimeout(() => rechargerRef.current(), DELAI_RELECTURE);
  }, []);
  const dernierLocal = useRef(meilleurLocal);
  useEffect(() => {
    if (dernierLocal.current !== null && meilleurLocal !== null && meilleurLocal !== dernierLocal.current) relireBientot();
    dernierLocal.current = meilleurLocal;
  }, [meilleurLocal, relireBientot]);
  const etaitEnPartie = useRef(enPartie);
  useEffect(() => {
    if (etaitEnPartie.current && !enPartie) relireBientot();
    etaitEnPartie.current = enPartie;
  }, [enPartie, relireBientot]);

  const partie = entierJeu(score);
  const recordSeuil = Math.max(base.record, entierJeu(meilleurLocal));
  const top1Seuil = base.top1 ? base.top1.score : 0;

  // Seuils figés au début de chaque partie (score à zéro), pour ne pas se dépasser soi-même.
  useEffect(() => {
    if (meilleurLocal === null) return;
    if (!depart.current || partie === 0) {
      depart.current = {record: recordSeuil, top1: top1Seuil};
      dejaAnnonce.current = {record: false, top1: false};
    } else {
      depart.current = {record: Math.max(depart.current.record, base.record), top1: Math.max(depart.current.top1, top1Seuil)};
    }
  }, [partie, meilleurLocal, recordSeuil, top1Seuil, base.record]);

  useEffect(() => {
    const d = depart.current;
    if (!d || partie <= 0) return;
    let quoi = null;
    if (d.top1 > 0 && partie > d.top1 && !dejaAnnonce.current.top1) {
      dejaAnnonce.current.top1 = true;
      dejaAnnonce.current.record = true;
      quoi = 'top1';
    } else if (d.record > 0 && partie > d.record && !dejaAnnonce.current.record) {
      dejaAnnonce.current.record = true;
      quoi = 'record';
    }
    if (!quoi) return;
    setAnnonce(quoi);
    clearTimeout(minuteurs.current.annonce);
    minuteurs.current.annonce = setTimeout(() => monte.current && setAnnonce(null), DUREE_ANNONCE);
  }, [partie]);

  const record = Math.max(recordSeuil, partie);
  const premierScore = top1Seuil;
  const devantTous = base.top1 ? partie > premierScore : false;
  const rang = devantTous ? 1 : base.rang;
  const classe = rang != null || record > 0;
  const top1 = base.top1 && !devantTous ? base.top1 : devantTous ? {nom: null, score: partie} : base.top1;

  return {rang, record, top1, classe, annonce, horsLigne, recharger};
}
