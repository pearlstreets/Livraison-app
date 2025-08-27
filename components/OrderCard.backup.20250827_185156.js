import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const BRAND = '#00C29B';
export default function OrderCard({ order, onAccept, onDecline, onOpen }) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.id}>{order.id}</Text>
        <Text style={styles.category}>{order.category}</Text>
      </View>
      <View style={styles.row}><Ionicons name="storefront-outline" size={18} color="#111" /><Text style={styles.address}>{order.pickup.label}</Text></View>
      <View style={styles.row}><Ionicons name="home-outline" size={18} color="#111" /><Text style={styles.address}>{order.dropoff.label}</Text></View>
      <View style={styles.badges}>
        <Text style={styles.badge}>{order.distanceKm.toFixed(1)} km</Text>
        <Text style={styles.badge}>{order.etaMin} min</Text>
        <Text style={[styles.badge, { backgroundColor: BRAND, color: '#fff' }]}>{(order.amountCents/100).toFixed(2)} €</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnOutline]} onPress={onDecline}><Text style={[styles.btnText, { color: '#111' }]}>Refuser</Text></Pressable>
        <Pressable style={[styles.btn, styles.btnFill]} onPress={onAccept}><Text style={[styles.btnText, { color: '#fff' }]}>Accepter</Text></Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onOpen}><Text style={styles.linkText}>Détails</Text></Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginVertical: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  id: { fontWeight: '700', fontSize: 16 },
  category: { fontWeight: '600', color: BRAND },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  address: { marginLeft: 8, flex: 1, color: '#333' },
  badges: { flexDirection: 'row', marginTop: 10 },
  badge: { backgroundColor: '#f2f2f7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontWeight: '600', marginRight: 8 },
  actions: { flexDirection: 'row', marginTop: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  btnOutline: { backgroundColor: '#f2f2f7' },
  btnFill: { backgroundColor: BRAND },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5ea', marginRight: 0 },
  btnText: { fontWeight: '700' },
  linkText: { color: BRAND, fontWeight: '700' }
});
