import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MapScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      {/* Bannière 2 lignes, ne touche pas les bords */}
      <View
        pointerEvents="none"
        style={[
          styles.banner,
          {
            top: (insets?.top ?? 0) + 8,
            left: 16,
            right: 16,
          },
        ]}
      >
        <Text style={styles.bannerText} numberOfLines={2}>
          Aucune commande active{'\n'}Boost auto appliqué selon zone
        </Text>
      </View>

      {/* TODO: place ici ta Map (MapView) */}
      <View style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: '#000000CC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'stretch',
  },
  bannerText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
});
