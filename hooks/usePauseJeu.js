/**
 * Pause automatique d'un mini-jeu : app en arrière-plan, écran quitté ou
 * nouvelle course annoncée (services/sonCourse.js). Jamais de course ratée.
 *
 * const { alerteCourse, fermerAlerte } = usePauseJeu(pause, { navigation, enJeu, estEnJeu });
 * `pause` peut changer à chaque rendu : la dernière version est appelée.
 *
 * Retour pendant une partie en cours (estEnJeu() vrai) : le retour Android et
 * le retour de la navigation ne quittent pas l'écran, la partie se met en
 * pause et la fenêtre de pause s'ouvre (Reprendre, Rejouer, Classement,
 * Quitter). Le geste de retour iOS est coupé tant que `enJeu` est vrai
 * (native-stack ne laisse pas beforeRemove l'arrêter). Hors partie, le retour
 * quitte normalement. Le bouton Quitter appelle pause() avant goBack() :
 * estEnJeu() est alors faux et la sortie passe.
 * Au retour au premier plan, rien ne reprend tout seul : la fenêtre de pause
 * reste affichée.
 * `fermerPanneau()` (facultatif) : appelé d'abord à chaque retour ; s'il rend
 * vrai (classement ouvert depuis la pause, par exemple), il a fermé ce
 * panneau et le retour s'arrête là, la partie reste en pause.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ecouterNouvelleCourse } from '../services/sonCourse';

const RETOURS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

export default function usePauseJeu(pause, options = {}) {
  const { navigation, enJeu = false, estEnJeu, fermerPanneau } = options;
  const pauseRef = useRef(pause);
  pauseRef.current = pause;
  const estEnJeuRef = useRef(estEnJeu);
  estEnJeuRef.current = estEnJeu;
  const fermerPanneauRef = useRef(fermerPanneau);
  fermerPanneauRef.current = fermerPanneau;
  const monte = useRef(true);
  const [alerteCourse, setAlerteCourse] = useState(null);

  useEffect(() => {
    monte.current = true;
    const abonnement = AppState.addEventListener('change', (prochain) => {
      if (prochain !== 'active') pauseRef.current?.();
    });
    // alerteCourse vaut { cle, course } : la fenêtre du jeu montre la vraie
    // fiche de la course (components/AlerteCourseJeu.js).
    const desabonner = ecouterNouvelleCourse((info) => {
      pauseRef.current?.();
      if (monte.current) setAlerteCourse(info || { cle: '', course: null });
    });
    return () => {
      monte.current = false;
      abonnement?.remove?.();
      desabonner();
      pauseRef.current?.();
    };
  }, []);
  useFocusEffect(useCallback(() => () => pauseRef.current?.(), []));

  // Retour Android : pause au lieu de quitter pendant une partie.
  useFocusEffect(useCallback(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fermerPanneauRef.current?.()) return true;
      if (!estEnJeuRef.current?.()) return false;
      pauseRef.current?.();
      return true;
    });
    return () => abonnement?.remove?.();
  }, []));

  // Retour de la navigation (goBack, pop) : même chose. Les autres sorties
  // (réinitialisation à la déconnexion, par exemple) passent, partie en pause.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    return navigation.addListener('beforeRemove', (e) => {
      const type = e?.data?.action?.type;
      if ((!type || RETOURS.has(type)) && fermerPanneauRef.current?.()) {
        e.preventDefault();
        return;
      }
      if (!estEnJeuRef.current?.()) return;
      if (type && !RETOURS.has(type)) {
        pauseRef.current?.();
        return;
      }
      e.preventDefault();
      pauseRef.current?.();
    });
  }, [navigation]);

  // Geste de retour iOS : coupé pendant la partie, rendu ensuite.
  useEffect(() => {
    if (!navigation?.setOptions) return;
    navigation.setOptions({ gestureEnabled: !enJeu });
  }, [navigation, enJeu]);

  const fermerAlerte = useCallback(() => setAlerteCourse(null), []);
  return { alerteCourse, fermerAlerte };
}
