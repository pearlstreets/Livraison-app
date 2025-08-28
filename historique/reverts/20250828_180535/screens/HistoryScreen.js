import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image } from 'react-native';
import { listHistory } from '../components/api';

export default function HistoryScreen() {
  const [items, setItems] = useState([]);
  useEffect(() => { const load = async () => setItems(await listHistory()); load(); const t=setInterval(load,3000); return ()=>clearInterval(t); }, []);
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={items}
        keyExtractor={x => x.id + String(x.finishedAt)}
        ListEmptyComponent={<Text style={{ color: '#666' }}>Historique vide</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.id}>{item.id}</Text>
            <Text style={styles.line}>Prise: {item.pickup.label}</Text>
            <Text style={styles.line}>Livraison: {item.dropoff.label}</Text>
            <Text style={styles.line}>Base: {(item.amountCents/100).toFixed(2)} €  ·  Boost x{item.surgeBoost?.toFixed(2) || '1.00'}</Text>
            <Text style={styles.line}>Pourboire: {(item.tipCents/100).toFixed(2)} €</Text>
            <Text style={[styles.line, { fontWeight:'800' }]}>Payé: {(item.paidCents/100).toFixed(2)} €</Text>
            {item.proofPhotoUri ? <Image source={{ uri: item.proofPhotoUri }} style={{ width:'100%', height: 160, borderRadius: 10, marginTop: 8 }} /> : null}
          </View>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({ card:{ backgroundColor:'#fff', borderRadius:12, padding:12, marginBottom:10, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:6, elevation:2 }, id:{ fontWeight:'800', fontSize:16, marginBottom:6 }, line:{ color:'#222', marginTop:2 } });
