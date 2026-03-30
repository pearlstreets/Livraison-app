import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import MapView, { Heatmap, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';
const { width, height } = Dimensions.get('window');

// Meaux center
const MEAUX = { latitude: 48.9536, longitude: 2.8788 };

// Hot zones - simulated demand points around Meaux
const HEATMAP_POINTS = [
  // Centre-ville Meaux (zone tres chaude)
  { latitude: 48.9536, longitude: 2.8788, weight: 10 },
  { latitude: 48.9540, longitude: 2.8800, weight: 9 },
  { latitude: 48.9530, longitude: 2.8775, weight: 8 },
  { latitude: 48.9545, longitude: 2.8810, weight: 9 },
  { latitude: 48.9525, longitude: 2.8760, weight: 7 },
  { latitude: 48.9550, longitude: 2.8795, weight: 8 },
  { latitude: 48.9535, longitude: 2.8820, weight: 7 },
  { latitude: 48.9520, longitude: 2.8790, weight: 6 },
  { latitude: 48.9555, longitude: 2.8770, weight: 5 },
  { latitude: 48.9528, longitude: 2.8830, weight: 6 },

  // Zone gare (chaude)
  { latitude: 48.9580, longitude: 2.8750, weight: 8 },
  { latitude: 48.9575, longitude: 2.8740, weight: 7 },
  { latitude: 48.9585, longitude: 2.8760, weight: 6 },
  { latitude: 48.9590, longitude: 2.8735, weight: 5 },

  // Zone commerciale sud (chaude)
  { latitude: 48.9480, longitude: 2.8850, weight: 7 },
  { latitude: 48.9475, longitude: 2.8860, weight: 8 },
  { latitude: 48.9470, longitude: 2.8840, weight: 6 },
  { latitude: 48.9485, longitude: 2.8870, weight: 7 },
  { latitude: 48.9465, longitude: 2.8855, weight: 5 },

  // Mareuil-les-Meaux (moyenne)
  { latitude: 48.9450, longitude: 2.8650, weight: 5 },
  { latitude: 48.9445, longitude: 2.8640, weight: 4 },
  { latitude: 48.9455, longitude: 2.8660, weight: 4 },
  { latitude: 48.9440, longitude: 2.8635, weight: 3 },

  // Villenoy (moyenne)
  { latitude: 48.9600, longitude: 2.8600, weight: 4 },
  { latitude: 48.9610, longitude: 2.8590, weight: 3 },
  { latitude: 48.9605, longitude: 2.8610, weight: 4 },

  // Zones peripheriques (froides)
  { latitude: 48.9650, longitude: 2.8900, weight: 2 },
  { latitude: 48.9400, longitude: 2.8500, weight: 2 },
  { latitude: 48.9700, longitude: 2.8700, weight: 1 },
  { latitude: 48.9380, longitude: 2.8950, weight: 2 },
  { latitude: 48.9620, longitude: 2.9000, weight: 3 },
  { latitude: 48.9500, longitude: 2.8450, weight: 2 },

  // Quelques points supplementaires centre
  { latitude: 48.9538, longitude: 2.8805, weight: 8 },
  { latitude: 48.9542, longitude: 2.8780, weight: 7 },
  { latitude: 48.9532, longitude: 2.8815, weight: 6 },
  { latitude: 48.9548, longitude: 2.8770, weight: 5 },
];

export default function HeatmapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { currentEarningsCents, isOnline } = useAuth();
  const { t } = useLanguage();
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const earningsDisplay = (currentEarningsCents / 100).toFixed(2).replace('.', ',') + ' \u20ac';

  function recenter() {
    mapRef.current?.animateToRegion({
      ...MEAUX,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    }, 500);
  }

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...MEAUX,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        userInterfaceStyle="dark"
        onMapReady={() => setMapReady(true)}
      >
        {mapReady && (
          <Heatmap
            points={HEATMAP_POINTS}
            radius={40}
            opacity={0.7}
            gradient={{
              colors: ['#0000ff', '#00ff00', '#ffff00', '#ff8800', '#ff0000'],
              startPoints: [0.01, 0.1, 0.3, 0.6, 1.0],
              colorMapSize: 256,
            }}
          />
        )}
      </MapView>

      {/* Overlay UI */}
      {/* Home button */}
      <Pressable style={[s.homeBtn, { top: insets.top + 10 }]} onPress={() => navigation.goBack()}>
        <Ionicons name="home" size={22} color="#fff" />
      </Pressable>

      {/* Earnings badge */}
      <View style={[s.earningsBadge, { top: insets.top + 12 }]}>
        <Text style={s.earningsText}>{earningsDisplay}</Text>
      </View>

      {/* Right controls */}
      <View style={[s.rightControls, { bottom: insets.bottom + 80 }]}>
        <Pressable style={s.controlBtn} onPress={() => navigation.navigate('EarningsMain')}>
          <Ionicons name="bar-chart" size={22} color="#fff" />
        </Pressable>
        <Pressable style={s.controlBtn} onPress={recenter}>
          <Ionicons name="locate" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Bottom bar */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={s.bottomIconWrap} onPress={() => navigation.goBack()}>
          <Ionicons name="list" size={22} color="#fff" />
        </Pressable>
        <View style={s.statusWrap}>
          <View style={[s.statusDot, !isOnline && { backgroundColor: '#999' }]} />
          <Text style={s.statusText}>{isOnline ? (t('youAreOnline') || 'Vous \u00eates en ligne') : (t('offline') || 'Hors ligne')}</Text>
        </View>
        <Pressable style={s.bottomIconWrap} onPress={() => {}}>
          <Ionicons name="options" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Legend */}
      <View style={[s.legend, { top: insets.top + 60 }]}>
        <View style={s.legendRow}>
          <View style={[s.legendDot, { backgroundColor: '#ff0000' }]} />
          <Text style={s.legendText}>Forte demande</Text>
        </View>
        <View style={s.legendRow}>
          <View style={[s.legendDot, { backgroundColor: '#ffaa00' }]} />
          <Text style={s.legendText}>Moyenne</Text>
        </View>
        <View style={s.legendRow}>
          <View style={[s.legendDot, { backgroundColor: '#00aaff' }]} />
          <Text style={s.legendText}>Faible</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  map: { ...StyleSheet.absoluteFillObject },

  homeBtn: { position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(30,30,30,0.85)', alignItems: 'center', justifyContent: 'center' },

  earningsBadge: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(30,30,30,0.9)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  earningsText: { color: '#fff', fontWeight: '900', fontSize: 18 },

  rightControls: { position: 'absolute', right: 16, gap: 10 },
  controlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(30,30,30,0.85)', alignItems: 'center', justifyContent: 'center' },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(20,20,20,0.95)', paddingTop: 14, paddingHorizontal: 16 },
  bottomIconWrap: { width: 40, alignItems: 'center' },
  statusWrap: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, marginRight: 8 },
  statusText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  legend: { position: 'absolute', right: 16, backgroundColor: 'rgba(30,30,30,0.85)', borderRadius: 12, padding: 10, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#ccc', fontSize: 12, fontWeight: '600' },
});
