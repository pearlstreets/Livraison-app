import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import MapView, { Heatmap, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { deliveryService } from '../services/deliveryService';

const BRAND = '#00C29B';
const { width, height } = Dimensions.get('window');

// Meaux center
const MEAUX = { latitude: 48.9536, longitude: 2.8788 };

export default function HeatmapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { currentEarningsCents, isOnline } = useAuth();
  const { t } = useLanguage();
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState([]);

  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await deliveryService.getHeatmap();
      const zones = Array.isArray(res?.data) ? res.data : [];
      const points = zones
        .filter(z => z.lat != null && z.lng != null)
        .map(z => ({
          latitude: z.lat,
          longitude: z.lng,
          weight: z.intensity != null ? z.intensity : (z.estimated_demand != null ? z.estimated_demand : 1),
        }));
      setHeatmapPoints(points);
    } catch (_) {
      // Keep existing points on error
    }
  }, []);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  useFocusEffect(
    useCallback(() => {
      fetchHeatmap();
    }, [fetchHeatmap])
  );

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
        {mapReady && heatmapPoints.length > 0 && (
          <Heatmap
            points={heatmapPoints}
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
