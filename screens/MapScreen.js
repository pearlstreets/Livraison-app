import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { listSurgeAreas, getActiveOrder, applySurgeForPosition, BRAND } from '../components/api';
import TopNotice from '../components/TopNotice';

const NOTICE_LINES = ['Aucune commande active', 'Boost auto appliqué selon zone'];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [loc, setLoc] = useState(null);
  const [order, setOrder] = useState(null);
  const [surges, setSurges] = useState([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const here = await Location.getCurrentPositionAsync({});
      setLoc(here.coords);
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
        async pos => { 
          setLoc(pos.coords);
          await applySurgeForPosition(pos.coords.latitude, pos.coords.longitude);
        }
      );
      setSurges(await listSurgeAreas());
    })();
    const t = setInterval(async () => { setOrder(await getActiveOrder()); }, 2000);
    return () => clearInterval(t);
  }, []);

  if (!loc) return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></View>;
  const region = { latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  return (
      {/* Bannière carte (2 lignes, safe-area, marges latérales) */}
      <View style={{ position:'absolute', left:0, right:0, zIndex:1000, paddingHorizontal:16, top: (insets?.top ?? 0) + 8 }} pointerEvents="none">
        <TopNotice lines={NOTICE_LINES} />
      </View>
    <View style={{ flex: 1 }}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={region} region={region}>
        {surges.map(s => (
          <Circle
            key={s.id}
            center={{ latitude: s.center.lat, longitude: s.center.lng }}
            radius={s.radiusM}
            strokeColor="rgba(255,128,0,0.8)"
            fillColor="rgba(255,128,0,0.15)"
          />
        ))}
        <Marker coordinate={{ latitude: loc.latitude, longitude: loc.longitude }} title="Moi" description="Position actuelle" pinColor={BRAND} />
        {order && (
          <>
            <Marker coordinate={{ latitude: order.pickup.lat, longitude: order.pickup.lng }} title="Collecte" description={order.pickup.label} />
            <Marker coordinate={{ latitude: order.dropoff.lat, longitude: order.dropoff.lng }} title="Livraison" description={order.dropoff.label} />
          </>
        )}
      </MapView>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          {order ? `Commande ${order.id} en cours` : 'Aucune commande active'} · Boost auto appliqué selon zone
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({ banner: { position:'absolute', top:16, alignSelf:'center', backgroundColor:'#000000AA', paddingHorizontal:12, paddingVertical:8, borderRadius:12 }, bannerText: { color:'#fff', fontWeight:'700' }});
