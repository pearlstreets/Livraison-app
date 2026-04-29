import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import secureStorage from '../services/secureStorage';
import { deliveryService } from '../services/deliveryService';
import { useAuth } from '../contexts/AuthContext';

const MARGIN_H = 16;
const GAP_TOP = 8;

const FALLBACK_REGION = {
  latitude: 48.8566,
  longitude: 2.3522,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const SYNC_INTERVAL_MS = 5000;
const WS_RECONNECT_MS = 3000;

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || 'https://pythonapi.digiexports.in';
const WS_URL = `${API_BASE.replace(/^http/, 'ws').replace(/\/$/, '')}/ws/delivery/driver/`;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = typeof useHeaderHeight === 'function' ? useHeaderHeight() : 0;
  const bannerTop = (headerHeight > 0 ? 0 : (insets?.top ?? 0)) + GAP_TOP;
  const auth = useAuth() || {};
  const isOnline = auth.isOnline;
  const dutyHydrated = auth.dutyHydrated;

  const [region, setRegion] = useState(FALLBACK_REGION);
  const [permissionStatus, setPermissionStatus] = useState('pending');
  const [wsStatus, setWsStatus] = useState('idle');
  const lastSyncRef = useRef(0);
  const watcherRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Gate the whole tracking pipeline on duty status:
    // - wait until AsyncStorage hydration is done (avoid flicker on cold start)
    // - bail out completely when off-duty (no location watch, no WS connect)
    if (!dutyHydrated || !isOnline) {
      cancelledRef.current = true;
      if (watcherRef.current?.remove) {
        try { watcherRef.current.remove(); } catch {}
        watcherRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      setWsStatus('off-duty');
      return undefined;
    }

    cancelledRef.current = false;

    const connectWs = async () => {
      if (cancelledRef.current) return;
      const token = await secureStorage.getSecure('accessToken').catch(() => null);
      if (!token) {
        setWsStatus('no-token');
        return;
      }
      try {
        const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
        wsRef.current = ws;
        setWsStatus('connecting');
        ws.onopen = () => setWsStatus('open');
        ws.onclose = () => {
          setWsStatus('closed');
          wsRef.current = null;
          if (!cancelledRef.current) {
            reconnectTimerRef.current = setTimeout(connectWs, WS_RECONNECT_MS);
          }
        };
        ws.onerror = () => setWsStatus('error');
      } catch {
        setWsStatus('error');
      }
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelledRef.current) return;
      setPermissionStatus(status);
      if (status !== 'granted') return;

      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelledRef.current) return;
        setRegion({
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.0121,
        });
      } catch {}

      try {
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (loc) => {
            if (cancelledRef.current) return;
            const { latitude, longitude } = loc.coords;
            setRegion((prev) => ({
              latitude,
              longitude,
              latitudeDelta: prev.latitudeDelta,
              longitudeDelta: prev.longitudeDelta,
            }));

            const now = Date.now();
            if (now - lastSyncRef.current < SYNC_INTERVAL_MS) return;
            lastSyncRef.current = now;

            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'location', lat: latitude, lng: longitude }));
                return;
              } catch {}
            }
            deliveryService.updateLocation(latitude, longitude).catch(() => {});
          }
        );
      } catch {}
    })();

    connectWs();

    return () => {
      cancelledRef.current = true;
      if (watcherRef.current?.remove) watcherRef.current.remove();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    };
  }, [isOnline, dutyHydrated]);

  const bannerMessage = !isOnline
    ? 'Hors-service\nActivez-vous depuis l\'écran d\'accueil pour recevoir des courses'
    : permissionStatus === 'denied'
    ? 'Géolocalisation refusée\nActivez-la pour recevoir des courses'
    : permissionStatus === 'granted'
    ? "Aucune commande active\nBoost auto appliqué selon zone"
    : 'Localisation en cours…';

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        region={region}
        showsUserLocation
        showsMyLocationButton
      />

      <View
        pointerEvents="none"
        style={[styles.banner, { top: bannerTop, left: MARGIN_H, right: MARGIN_H }]}
      >
        <Text style={styles.bannerText} numberOfLines={2}>
          {bannerMessage}
        </Text>
        {wsStatus === 'open' ? (
          <Text style={styles.subText}>Sync temps réel actif</Text>
        ) : null}
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
    alignSelf: 'stretch',
  },
  bannerText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  subText: {
    color: '#9bff9b',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
});
