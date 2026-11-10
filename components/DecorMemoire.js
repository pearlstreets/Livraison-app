/**
 * Décor lumineux de « Mémoire du livreur » (screens/JeuMemoireScreen.js),
 * dessiné en code : ciel du matin, soleil, nuages qui dérivent, immeubles
 * pastel, trottoir, et le panneau Pearl Streets sur pieds en bas de l'écran
 * (même place et même taille que dans FondJeu 'ville', donc la zone réservée
 * reserveBasVille(l, bas) reste exacte).
 *
 * Toujours clair (jamais de fond sombre), ne capte jamais le toucher.
 * Les nuages tournent en pilote natif et s'arrêtent au démontage, quand
 * l'app passe en arrière-plan, quand l'écran n'est plus affiché et quand
 * `actif` vaut false (pause), pour économiser la batterie.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, StyleSheet, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { EnseignePearl } from './FondJeu';

const CIEL = ['#8FD6FF', '#A3DDFF', '#B8E5FF', '#CDEDFF', '#E1F4FF', '#F1F9FF', '#FFF6DC', '#FFEFC8'];
const PASTEL = ['#F7C9A3', '#BDE4D2', '#F4D5E6', '#C9D9F6', '#FBE3A6', '#D8CBF0'];
const IMMEUBLES = [
  [0.0, 0.15, 0.62], [0.14, 0.12, 1], [0.25, 0.16, 0.7], [0.4, 0.13, 0.9], [0.52, 0.16, 0.66],
  [0.67, 0.12, 1], [0.78, 0.14, 0.74], [0.9, 0.12, 0.95],
];
const NUAGES = [[0.06, 0.2, 1], [0.6, 0.08, 0.85], [0.36, 0.34, 0.6]];

function Nuage({ x, y, echelle, derive }) {
  const w = 74 * echelle;
  const dx = derive.interpolate({ inputRange: [0, 1], outputRange: [-14 * echelle, 22 * echelle] });
  return (
    <Animated.View style={{ position: 'absolute', left: x, top: y, width: w, height: w * 0.5, transform: [{ translateX: dx }] }}>
      <View style={[styles.bosse, { left: 0, bottom: 0, width: w * 0.5, height: w * 0.32 }]} />
      <View style={[styles.bosse, { left: w * 0.18, bottom: w * 0.08, width: w * 0.46, height: w * 0.42 }]} />
      <View style={[styles.bosse, { left: w * 0.46, bottom: 0, width: w * 0.54, height: w * 0.34 }]} />
    </Animated.View>
  );
}

function DecorMemoire({ l, h, bas = 0, largeurEnseigne, piedsEnseigne, actif = true }) {
  const derive = useRef(new Animated.Value(0)).current;
  const affiche = useIsFocused();
  const [premierPlan, setPremierPlan] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const abo = AppState.addEventListener('change', (etat) => setPremierPlan(etat === 'active'));
    return () => abo.remove();
  }, []);
  const anime = actif && affiche && premierPlan;
  useEffect(() => {
    if (!anime) return undefined;
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(derive, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(derive, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    boucle.start();
    return () => boucle.stop();
  }, [anime, derive]);

  if (!l || !h) return null;
  const sol = Math.max(70, bas + 4 + piedsEnseigne + 70);
  const horizon = h - sol;
  const bande = Math.ceil(horizon / CIEL.length);
  const hImmeuble = Math.min(200, h * 0.26);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fond]}>
      {CIEL.map((c, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * bande, height: bande + 1, backgroundColor: c }} />
      ))}
      <View style={[styles.halo, { left: l * 0.8 - 46, top: 70, width: 92, height: 92, borderRadius: 46, opacity: 0.35 }]} />
      <View style={[styles.soleil, { left: l * 0.8 - 24, top: 92 }]} />
      {NUAGES.map(([x, y, e], i) => (
        <Nuage key={i} x={x * l} y={80 + y * Math.max(60, horizon * 0.5)} echelle={e} derive={derive} />
      ))}
      {IMMEUBLES.map(([x, w, hh], i) => {
        const hauteur = hImmeuble * hh;
        return (
          <View
            key={i}
            style={{
              position: 'absolute', left: x * l, top: horizon - hauteur, width: w * l + 1, height: hauteur,
              backgroundColor: PASTEL[i % PASTEL.length], borderTopLeftRadius: 4, borderTopRightRadius: 4,
              flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingTop: 10, gap: 7, overflow: 'hidden',
            }}
          >
            {Array.from({ length: 8 }).map((_, j) => (
              <View key={j} style={{ width: 7, height: 10, borderRadius: 1.5, backgroundColor: '#FFFFFFAA' }} />
            ))}
          </View>
        );
      })}
      <View style={[styles.trottoir, { top: horizon, bottom: 0 }]} />
      <View style={[styles.bordure, { top: horizon }]} />
      <EnseignePearl
        largeur={largeurEnseigne}
        compacte
        pieds={piedsEnseigne}
        couleurSupport="#8A97AA"
        style={{ position: 'absolute', left: (l - largeurEnseigne) / 2, bottom: bas + 4 }}
      />
    </View>
  );
}

export default memo(DecorMemoire);

const styles = StyleSheet.create({
  fond: { overflow: 'hidden', backgroundColor: '#F4E7CC' },
  halo: { position: 'absolute', backgroundColor: '#FFE9A0' },
  soleil: { position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFD54A' },
  bosse: { position: 'absolute', borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.92)' },
  trottoir: { position: 'absolute', left: 0, right: 0, backgroundColor: '#F2E4C6' },
  bordure: { position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: '#D9C8A3' },
});
