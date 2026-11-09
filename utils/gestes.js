/**
 * Balayages au doigt pour les mini-jeux : gauche, droite, haut, bas, appui.
 *
 *   const pan = useBalayage({
 *     onGauche, onDroite, onHaut, onBas, onAppui,   // tous facultatifs
 *     seuil: 28,        // distance en points avant de déclencher (défaut 28)
 *     actif: true,      // faux = ignoré (pause, accueil)
 *   });
 *   <View {...pan.panHandlers} style={StyleSheet.absoluteFill} />
 *
 * Un glissé déclenche UNE action, puis la référence repart du doigt : un long
 * glissé peut enchaîner plusieurs actions (deux voies de suite). Un appui
 * court sans déplacement déclenche onAppui. Les rappels peuvent changer à
 * chaque rendu (la dernière version est appelée). Glisser en diagonale : le
 * sens dominant gagne.
 *
 * directionBalayage(dx, dy, seuil) : fonction pure, rend 'gauche' | 'droite'
 * | 'haut' | 'bas' ou null.
 */
import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

export function directionBalayage(dx, dy, seuil = 28) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < seuil) return null;
  if (ax >= ay) return dx < 0 ? 'gauche' : 'droite';
  return dy < 0 ? 'haut' : 'bas';
}

const RAPPELS = { gauche: 'onGauche', droite: 'onDroite', haut: 'onHaut', bas: 'onBas' };

export function useBalayage(options) {
  const optRef = useRef(options);
  optRef.current = options;
  return useMemo(() => {
    const etat = { x: 0, y: 0, debut: 0, declenche: false };
    const actif = () => optRef.current?.actif !== false;
    return PanResponder.create({
      onStartShouldSetPanResponder: actif,
      onMoveShouldSetPanResponder: actif,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        etat.x = 0; etat.y = 0; etat.debut = Date.now(); etat.declenche = false;
      },
      onPanResponderMove: (_e, g) => {
        const o = optRef.current || {};
        if (o.actif === false) return;
        const sens = directionBalayage(g.dx - etat.x, g.dy - etat.y, o.seuil || 28);
        if (!sens) return;
        etat.x = g.dx; etat.y = g.dy; etat.declenche = true;
        o[RAPPELS[sens]]?.();
      },
      onPanResponderRelease: (_e, g) => {
        const o = optRef.current || {};
        if (o.actif === false || etat.declenche) return;
        if (Math.abs(g.dx) < 12 && Math.abs(g.dy) < 12 && Date.now() - etat.debut < 400) o.onAppui?.();
      },
    });
  }, []);
}
