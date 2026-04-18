import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import MapView, { Marker } from 'react-native-maps';
import { useLanguage } from '../contexts/LanguageContext';

const MARGIN_H = 16;   // marge gauche/droite
const GAP_TOP  = 8;    // écart souhaité en haut

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const headerHeight = typeof useHeaderHeight === 'function' ? useHeaderHeight() : 0;

  // Si header > 0, on n’ajoute PAS la safe-area (car le contenu est déjà sous le header)
  const bannerTop = (headerHeight > 0 ? 0 : (insets?.top ?? 0)) + GAP_TOP;

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

      {/* Bannière 2 lignes alignée à 8 px du haut visible */}
      <View
        pointerEvents="none"
        style={[
          styles.banner,
          { top: bannerTop, left: MARGIN_H, right: MARGIN_H }
        ]}
      >
        <Text style={styles.bannerText} numberOfLines={2}>
          {t('noOrderActive')}{'\n'}{t('boostAutoAppliedMsg')}
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
