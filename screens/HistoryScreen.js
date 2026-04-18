import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image } from 'react-native';
import { listHistory } from '../components/api';
import { useLanguage } from '../contexts/LanguageContext';

export default function HistoryScreen() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  useEffect(() => {
    const load = async () => {
      try {
        const data = await listHistory();
        if (Array.isArray(data)) setItems(data);
      } catch { /* keep previous items on failure */ }
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={items}
        keyExtractor={x => x.id + String(x.finishedAt)}
        ListEmptyComponent={<Text style={{ color: '#666' }}>{t('historyEmpty')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.id}>{item.id}</Text>
            <Text style={styles.line}>{t('pickup')}: {item.pickup?.label ?? '—'}</Text>
            <Text style={styles.line}>{t('delivery')}: {item.dropoff?.label ?? '—'}</Text>
            <Text style={styles.line}>{t('baseAmountLabel')}: {((item.amountCents ?? 0)/100).toFixed(2)} €  ·  {t('boostLabel')} x{Number(item.surgeBoost ?? 1).toFixed(2)}</Text>
            <Text style={styles.line}>{t('tip')}: {((item.tipCents ?? 0)/100).toFixed(2)} €</Text>
            <Text style={[styles.line, { fontWeight:'800' }]}>{t('paid')}: {((item.paidCents ?? 0)/100).toFixed(2)} €</Text>
            {item.proofPhotoUri ? <Image source={{ uri: item.proofPhotoUri }} style={{ width:'100%', height: 160, borderRadius: 10, marginTop: 8 }} /> : null}
          </View>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({ card:{ backgroundColor:'#fff', borderRadius:12, padding:12, marginBottom:10, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:6, elevation:2 }, id:{ fontWeight:'800', fontSize:16, marginBottom:6 }, line:{ color:'#222', marginTop:2 } });
