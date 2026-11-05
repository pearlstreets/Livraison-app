import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

// Bandeau FIXE derrière la barre d'état (heure, réseau, batterie). L'app étant
// bord à bord, le contenu d'un écran qui défile passait sous ces icones.
// À placer juste après le ScrollView de l'écran, de la couleur du haut de l'écran.
// Sans couleur donnée : fond d'écran du thème (#f5f5f5 en clair, comme avant).
export default function StatusBarShield({ color }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return <View pointerEvents="none" style={[s.shield, { height: insets.top, backgroundColor: color || colors.bg }]} />;
}

const s = StyleSheet.create({
  shield: { position: 'absolute', top: 0, left: 0, right: 0 },
});
