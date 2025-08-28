import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';

const MARGIN_H = 16;   // marge gauche/droite de la box
const OFFSET_TOP = 8;  // distance sous la safe-area (même hauteur que la maquette)

export default function MapScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.015,
          longitudeDelta: 0.0121
        }}
        showsUserLocation
      >
        <Marker coordinate={{ latitude: 37.78825, longitude: -122.4324 }} />
      </MapView>

      {/* Bannière 2 lignes, même marge haut que les côtés (8 px sous la safe-area) */}
      <View
        pointerEvents="none"
        style={[
          styles.banner,
          {
            top: (insets?.top ?? 0) + OFFSET_TOP,
            left: MARGIN_H,
            right: MARGIN_H
          }
        ]}
      >
        <Text style={styles.bannerText} numberOfLines={2}>
          Aucune commande active{'\n'}Boost auto appliqué selon zone
        </Text>
      </View>
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
    alignSelf: 'stretch'
  },
  bannerText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center'
  }
});
