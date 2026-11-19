/**
 * Flèche retour pendant une partie = pause automatique (Slalom, Pile, Tournée).
 *
 * Partie en cours : le retour Android (bouton ou geste) et le retour iOS ne
 * quittent pas l'écran, la partie se met en pause et la fenêtre de pause
 * s'ouvre (Reprendre, Rejouer, Classement, Quitter). Hors partie (accueil,
 * pause, fin), le retour quitte normalement.
 *
 * - iOS : le geste natif de native-stack ne se bloque pas avec beforeRemove,
 *   il est donc coupé (gestureEnabled) tant que la partie tourne.
 * - Android : BackHandler, écran au premier plan seulement.
 * - beforeRemove : tout autre retour (navigation.goBack ailleurs).
 *
 * `enPartie` (état React) règle le geste iOS ; `estEnPartie()` lit les refs de
 * l'écran au moment même du retour : après pause(), le bouton X quitte sans
 * attendre le prochain rendu.
 *
 * Livreur (en plus d'AppUser) : une nouvelle course annoncée (services/sonCourse.js)
 * met la partie en pause et ouvre la vraie fiche de la course. Le hook rend
 * {alerteCourse, fermerAlerte, voirCourse} ; l'écran pose, en dernier enfant :
 *   {!!alerteCourse && (
 *     <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation}
 *       onVoir={voirCourse} onRester={fermerAlerte} />
 *   )}
 * (import AlerteCourseJeu from '../components/AlerteCourseJeu').
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler} from 'react-native';
import {ecouterNouvelleCourse} from '../../services/sonCourse';

/** Vrai si le retour doit mettre la partie en pause plutôt que quitter. */
export function retourMetEnPause(estEnPartie) {
  try {
    return !!estEnPartie?.();
  } catch (e) {
    return false;
  }
}

export default function useRetourPause(navigation, enPartie, estEnPartie, pause) {
  const lireRef = useRef(estEnPartie);
  lireRef.current = estEnPartie;
  const pauseRef = useRef(pause);
  pauseRef.current = pause;
  const [alerteCourse, setAlerteCourse] = useState(null);

  // Nouvelle course annoncée : pause et fiche de la course (jamais de course ratée).
  useEffect(() => {
    let monte = true;
    const desabonner = ecouterNouvelleCourse(info => {
      pauseRef.current?.();
      if (monte) setAlerteCourse(info || {cle: '', course: null});
    });
    return () => {
      monte = false;
      desabonner();
    };
  }, []);

  // Geste retour iOS coupé pendant la partie, rendu après.
  useEffect(() => {
    navigation?.setOptions?.({gestureEnabled: !enPartie});
  }, [navigation, enPartie]);

  // Retour Android.
  useEffect(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation?.isFocused && !navigation.isFocused()) return false;
      if (!retourMetEnPause(lireRef.current)) return false;
      pauseRef.current?.();
      return true;
    });
    return () => abonnement?.remove?.();
  }, [navigation]);

  // Tout autre retour pendant la partie : pause au lieu de quitter.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    return navigation.addListener('beforeRemove', ev => {
      if (!retourMetEnPause(lireRef.current)) return;
      ev.preventDefault();
      pauseRef.current?.();
    });
  }, [navigation]);

  const fermerAlerte = useCallback(() => setAlerteCourse(null), []);
  // « Voir la course » : partie en pause, accueil des courses.
  const voirCourse = useCallback(() => {
    setAlerteCourse(null);
    pauseRef.current?.();
    navigation?.navigate?.('Accueil', {screen: 'OrdersMain'});
  }, [navigation]);

  return {alerteCourse, fermerAlerte, voirCourse};
}
