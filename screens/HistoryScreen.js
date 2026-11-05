import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image } from 'react-native';
import { listHistory } from '../components/api';
import { useCurrency } from '../contexts/CurrencyContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

// Montant en centimes sûr (0 si absent ou non numérique).
const cents = (v) => (Number(v) || 0) / 100;

export default function HistoryScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const { fmtPrice } = useCurrency();
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    // Lecture protégée : une erreur garde la liste affichée, rien après démontage.
    const load = async () => {
      try {
        const res = await listHistory();
        if (alive) setItems(Array.isArray(res) ? res : []);
      } catch (_) {}
    };
    load();
    const minuteur = setInterval(load, 3000);
    return () => { alive = false; clearInterval(minuteur); };
  }, []);
  const carte = colors.dark ? { backgroundColor: colors.card } : null;
  const texte = colors.dark ? { color: colors.textSoft } : null;
  return (
    <View style={[{ flex: 1, padding: 16 }, colors.dark && { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(x, i) => `${x?.id ?? i}-${String(x?.finishedAt ?? '')}`}
        ListEmptyComponent={<Text style={{ color: colors.dark ? colors.textMuted : '#666' }}>{t('historyEmpty')}</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, carte]}>
            <Text style={[styles.id, colors.dark && { color: colors.text }]}>{item.id}</Text>
            <Text style={[styles.line, texte]}>Prise: {item.pickup?.label || ''}</Text>
            <Text style={[styles.line, texte]}>Livraison: {item.dropoff?.label || ''}</Text>
            <Text style={[styles.line, texte]}>Base: {fmtPrice(cents(item.amountCents))}  ·  Boost x{Number.isFinite(Number(item.surgeBoost)) ? Number(item.surgeBoost).toFixed(2) : '1.00'}</Text>
            <Text style={[styles.line, texte]}>Pourboire: {fmtPrice(cents(item.tipCents))}</Text>
            <Text style={[styles.line, texte, { fontWeight:'800' }]}>Payé: {fmtPrice(cents(item.paidCents))}</Text>
            {item.proofPhotoUri ? <Image source={{ uri: item.proofPhotoUri }} style={{ width:'100%', height: 160, borderRadius: 10, marginTop: 8 }} /> : null}
          </View>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({ card:{ backgroundColor:'#fff', borderRadius:12, padding:12, marginBottom:10, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:6, elevation:2 }, id:{ fontWeight:'800', fontSize:16, marginBottom:6 }, line:{ color:'#222', marginTop:2 } });
