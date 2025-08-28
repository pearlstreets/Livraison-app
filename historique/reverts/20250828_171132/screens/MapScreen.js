import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';

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

      <View
        pointerEvents="none"
        style={[
          styles.banner,
          { top: (insets?.top ?? 0) + 2, left: 16, right: 16 }
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
