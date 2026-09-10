import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bandeau FIXE derrière la barre d'état (heure, réseau, batterie). L'app étant
// bord à bord, le contenu d'un écran qui défile passait sous ces icones.
// À placer juste après le ScrollView de l'écran, de la couleur du haut de l'écran.
export default function StatusBarShield({ color = '#f5f5f5' }) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[s.shield, { height: insets.top, backgroundColor: color }]} />;
}

const s = StyleSheet.create({
  shield: { position: 'absolute', top: 0, left: 0, right: 0 },
});
