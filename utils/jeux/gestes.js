/**
 * Balayages (gauche, droite, haut, bas) et appui pour les écrans de jeu.
 *
 *   const {panHandlers} = useBalayage({surGauche, surDroite, surHaut, surBas, surAppui, actif});
 *   <View {...panHandlers} style={StyleSheet.absoluteFill}>...</View>
 *
 * - Un balayage se déclenche DÈS que le doigt a parcouru `seuil` px (24 par défaut), sans attendre
 *   qu'il se lève. UN SEUL balayage par contact, comme dans les jeux de course : un long glissé
 *   ne change que d'une voie, il faut lever le doigt pour la suivante. L'axe dominant décide.
 * - Un appui (doigt levé après moins de 10 px de mouvement) appelle surAppui({x, y}).
 * - `actif` faux : tous les gestes sont ignorés (pause, fenêtres ouvertes).
 * - Les rappels sont lus au moment du geste (jamais périmés), pas besoin de les mémoriser.
 *
 * Aussi exporté : directionBalayage(dx, dy, seuil) rend 'gauche' | 'droite' | 'haut' | 'bas' | null.
 */
import {useMemo, useRef} from 'react';
import {PanResponder} from 'react-native';

const SEUIL_APPUI = 10;

export function directionBalayage(dx, dy, seuil = 24) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < seuil) return null;
  if (ax >= ay) return dx < 0 ? 'gauche' : 'droite';
  return dy < 0 ? 'haut' : 'bas';
}

export default function useBalayage({surGauche, surDroite, surHaut, surBas, surAppui, actif = true, seuil = 24} = {}) {
  const rappels = useRef({});
  rappels.current = {gauche: surGauche, droite: surDroite, haut: surHaut, bas: surBas, appui: surAppui, actif, seuil};
  const suivi = useRef({ox: 0, oy: 0, aBouge: false, parti: false});

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => rappels.current.actif,
        onMoveShouldSetPanResponder: () => rappels.current.actif,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          suivi.current = {ox: 0, oy: 0, aBouge: false, parti: false};
        },
        onPanResponderMove: (_, g) => {
          const r = rappels.current;
          if (!r.actif) return;
          const s = suivi.current;
          const dx = g.dx - s.ox;
          const dy = g.dy - s.oy;
          if (Math.abs(g.dx) > SEUIL_APPUI || Math.abs(g.dy) > SEUIL_APPUI) s.aBouge = true;
          if (s.parti) return;
          const dir = directionBalayage(dx, dy, r.seuil);
          if (!dir) return;
          s.parti = true;
          s.ox = g.dx;
          s.oy = g.dy;
          try {
            r[dir]?.();
          } catch (e) {
            // Un rappel défaillant ne coupe pas le geste.
          }
        },
        onPanResponderRelease: (ev, g) => {
          const r = rappels.current;
          const s = suivi.current;
          if (!r.actif || s.parti || s.aBouge) return;
          try {
            r.appui?.({x: ev?.nativeEvent?.locationX ?? g.x0, y: ev?.nativeEvent?.locationY ?? g.y0});
          } catch (e) {
            // Idem.
          }
        },
      }),
    [],
  );

  return {panHandlers: panResponder.panHandlers};
}
