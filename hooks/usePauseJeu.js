/**
 * Pause automatique d'un mini-jeu : app en arrière-plan, écran quitté ou
 * nouvelle course annoncée (services/sonCourse.js). Jamais de course ratée.
 *
 * const { alerteCourse, fermerAlerte } = usePauseJeu(pause);
 * `pause` peut changer à chaque rendu : la dernière version est appelée.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ecouterNouvelleCourse } from '../services/sonCourse';

export default function usePauseJeu(pause) {
  const pauseRef = useRef(pause);
  pauseRef.current = pause;
  const monte = useRef(true);
  const [alerteCourse, setAlerteCourse] = useState(false);

  useEffect(() => {
    monte.current = true;
    const abonnement = AppState.addEventListener('change', (prochain) => {
      if (prochain !== 'active') pauseRef.current?.();
    });
    const desabonner = ecouterNouvelleCourse(() => {
      pauseRef.current?.();
      if (monte.current) setAlerteCourse(true);
    });
    return () => {
      monte.current = false;
      abonnement?.remove?.();
      desabonner();
      pauseRef.current?.();
    };
  }, []);
  useFocusEffect(useCallback(() => () => pauseRef.current?.(), []));

  const fermerAlerte = useCallback(() => setAlerteCourse(false), []);
  return { alerteCourse, fermerAlerte };
}
