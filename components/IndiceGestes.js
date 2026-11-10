/**
 * Petit indice animé des gestes, affiché au début de la PREMIÈRE partie d'un
 * jeu puis mémorisé (AsyncStorage, par jeu). Disparaît au toucher ou après 4,5 s.
 *
 *   <IndiceGestes jeu="rush" actif={phase === 'jeu'} gestes={['gauche', 'droite', 'haut', 'bas']}
 *                 t={t} colors={colors} />
 *
 * Props :
 *   jeu     identifiant du jeu (une mémorisation par jeu)
 *   actif   vrai quand la partie vient de démarrer (affiche l'indice si jamais vu)
 *   gestes  parmi 'gauche', 'droite', 'haut', 'bas', 'appui'
 *   t, colors
 * Ne capte pas le jeu : l'indice laisse passer les touchers (pointerEvents none).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRAND } from '../contexts/ThemeContext';

const CLE = 'pearl_jeux_gestes_vus_v1';
const ICONES = { gauche: 'hand-left', droite: 'hand-right', haut: 'rocket', bas: 'body', appui: 'finger-print' };
const TEXTES = {
  gauche: 'jeuxGesteGauche', droite: 'jeuxGesteDroite', haut: 'jeuxGesteHaut', bas: 'jeuxGesteBas', appui: 'jeuxGesteAppui',
};
const DEPLACEMENT = { gauche: [0, -14], droite: [0, 14], haut: [1, -14], bas: [1, 14], appui: [1, 6] };

export default function IndiceGestes({ jeu, actif, gestes = ['gauche', 'droite', 'haut', 'bas'], t, colors }) {
  const [visible, setVisible] = useState(false);
  const vu = useRef(null);
  const anim = useRef(new Animated.Value(0)).current;
  const opacite = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!actif || visible) return undefined;
    let vivant = true;
    (async () => {
      try {
        if (vu.current == null) {
          const brut = await AsyncStorage.getItem(CLE);
          vu.current = brut ? JSON.parse(brut) : {};
        }
      } catch { vu.current = {}; }
      if (!vivant || vu.current[jeu]) return;
      vu.current[jeu] = true;
      AsyncStorage.setItem(CLE, JSON.stringify(vu.current)).catch(() => {});
      setVisible(true);
    })();
    return () => { vivant = false; };
  }, [actif, jeu, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    Animated.timing(opacite, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    boucle.start();
    const fin = setTimeout(() => {
      Animated.timing(opacite, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setVisible(false));
    }, 4500);
    return () => { clearTimeout(fin); boucle.stop(); };
  }, [visible, anim, opacite]);

  if (!visible) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.bloc, { opacity: opacite, backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rangee}>
        {gestes.map((g) => {
          const [axe, d] = DEPLACEMENT[g] || [0, 0];
          const mouvement = anim.interpolate({ inputRange: [0, 1], outputRange: [0, d] });
          return (
            <View key={g} style={styles.colonne}>
              <View style={styles.rond}>
                <Animated.View style={{ transform: [axe === 0 ? { translateX: mouvement } : { translateY: mouvement }] }}>
                  <Ionicons name={ICONES[g] || 'hand-left'} size={24} color="#fff" />
                </Animated.View>
              </View>
              <Text style={[styles.legende, { color: colors.text }]} numberOfLines={3}>{t(TEXTES[g])}</Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bloc: {
    position: 'absolute', left: 16, right: 16, bottom: 110, borderRadius: 20, borderWidth: 1, paddingVertical: 12,
    paddingHorizontal: 8, zIndex: 20, elevation: 6,
  },
  rangee: { flexDirection: 'row', justifyContent: 'space-around' },
  colonne: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  rond: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  legende: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 6 },
});
