import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { mapsAvailable } from '../lib/maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';

const BRAND = '#00C29B';
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// Carte d'itinéraire d'une course : marqueur boutique (récupération) + marqueur
// client (livraison), tracé entre les deux, depuis les VRAIES coordonnées de la
// commande. Boutons de navigation externe (Google Maps / Waze) en secours.
export default function MapScreen({ route, navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const order = route?.params?.order || {};
  const pLat = num(order.pickupLat ?? order.pickup_lat);
  const pLng = num(order.pickupLng ?? order.pickup_lng);
  const dLat = num(order.dropoffLat ?? order.dropoff_lat);
  const dLng = num(order.dropoffLng ?? order.dropoff_lng);
  const hasPickup = pLat != null && pLng != null;
  const hasDrop = dLat != null && dLng != null;
  const mapRef = useRef(null);

  const pts = [];
  if (hasPickup) pts.push({ latitude: pLat, longitude: pLng });
  if (hasDrop) pts.push({ latitude: dLat, longitude: dLng });
  const center = pts.length
    ? { latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
        longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length }
    : { latitude: 48.8566, longitude: 2.3522 };

  useEffect(() => {
    if (mapRef.current && pts.length >= 2) {
      const t = setTimeout(() => {
        try {
          mapRef.current.fitToCoordinates(pts, {
            edgePadding: { top: 90, right: 60, bottom: 240, left: 60 },
            animated: true,
          });
        } catch {}
      }, 500);
      return () => clearTimeout(t);
    }
  }, []);

  const openExternal = (app) => {
    const dest = hasDrop
      ? `${dLat},${dLng}`
      : encodeURIComponent(order.dropoffAddress || order.pickupAddress || '');
    const url = app === 'waze'
      ? (hasDrop ? `https://waze.com/ul?ll=${dLat},${dLng}&navigate=yes` : `https://waze.com/ul?q=${dest}&navigate=yes`)
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={{ flex: 1 }}>
      {mapsAvailable ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{ ...center, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {hasPickup && (
            <Marker coordinate={{ latitude: pLat, longitude: pLng }} title={order.shopName || order.restaurant || t('pickup')} pinColor={BRAND} />
          )}
          {hasDrop && (
            <Marker coordinate={{ latitude: dLat, longitude: dLng }} title={t('delivery')} description={order.dropoffAddress || ''} pinColor="#e74c3c" />
          )}
          {hasPickup && hasDrop && (
            <Polyline coordinates={[{ latitude: pLat, longitude: pLng }, { latitude: dLat, longitude: dLng }]} strokeColor={BRAND} strokeWidth={4} lineDashPattern={[2, 6]} />
          )}
        </MapView>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.noMap]}>
          <Ionicons name="map-outline" size={48} color="#b0b7bf" />
          <Text style={styles.noMapTxt}>{t('mapUnavailable')}</Text>
        </View>
      )}

      <Pressable onPress={() => navigation?.goBack?.()} style={[styles.back, { top: (insets?.top || 0) + 8 }]}>
        <Ionicons name={dirIcon('arrow-back')} size={22} color="#111" />
      </Pressable>

      <View style={[styles.card, { paddingBottom: (insets?.bottom || 0) + 12 }]}>
        {!!(order.shopName || order.restaurant) && (
          <View style={styles.shopRow}>
            <MaterialCommunityIcons name="storefront" size={18} color={BRAND} style={{ marginRight: 8 }} />
            <Text style={styles.shop} numberOfLines={1}>{order.shopName || order.restaurant}</Text>
          </View>
        )}
        {!!order.pickupAddress && (
          <View style={styles.row}><View style={[styles.dot, { backgroundColor: BRAND }]} /><Text style={styles.addr} numberOfLines={1}>{order.pickupAddress}</Text></View>
        )}
        {!!order.dropoffAddress && (
          <View style={styles.row}><View style={[styles.dot, { backgroundColor: '#e74c3c' }]} /><Text style={styles.addr} numberOfLines={1}>{order.dropoffAddress}</Text></View>
        )}
        {!hasDrop && !hasPickup && (
          <Text style={styles.noCoords}>{t('gpsUnavailable')}</Text>
        )}
        <View style={styles.btns}>
          <Pressable style={[styles.btn, { backgroundColor: BRAND }]} onPress={() => openExternal('google')}>
            <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.btnTxt}>Google Maps</Text>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: '#33ccff' }]} onPress={() => openExternal('waze')}>
            <Text style={styles.btnTxt}>Waze</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4, zIndex: 1000 },
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: '#fff', borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  shopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  shop: { fontSize: 16, fontWeight: '800', color: '#111', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  addr: { color: '#333', flexShrink: 1 },
  noCoords: { color: '#888', fontStyle: 'italic', marginBottom: 8 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  noMap: { backgroundColor: '#eef1f4', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 220 },
  noMapTxt: { marginTop: 12, color: '#6b7280', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
