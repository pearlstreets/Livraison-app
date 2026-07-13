import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { deliveryService } from '../services/deliveryService';

const BRAND = '#00C29B';

export default function OpportunitiesScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { readOpportunities, markOpportunityRead } = useAuth();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await deliveryService.getOpportunities();
        const list = (r && (r.data || r.results)) || [];
        if (alive) setPromos(list.map((o) => ({
          id: String(o.id),
          title: o.title || '',
          desc: o.description || '',
          period: o.period_label || '',
          icon: o.icon || 'flash',
          color: o.color || BRAND,
        })));
      } catch (e) { /* garde la liste vide */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  function openPromo(promo) {
    markOpportunityRead(promo.id);
    navigation.navigate('OpportunityDetail', { promo });
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('opportunitiesTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.subtitle}>{t('opportunitiesSub')}</Text>

      {loading && (
        <ActivityIndicator color={BRAND} style={{ marginTop: 24 }} />
      )}
      {!loading && promos.length === 0 && (
        <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 32 }}>
          <Ionicons name="sparkles-outline" size={36} color="#ccc" style={{ marginBottom: 10 }} />
          <Text style={{ color: '#999', textAlign: 'center' }}>{t('noOpportunities') || 'Aucune opportunité pour le moment'}</Text>
        </View>
      )}

      {promos.map((promo) => {
        const isRead = readOpportunities.includes(promo.id);
        return (
          <Pressable key={promo.id} style={s.card} onPress={() => openPromo(promo)}>
            <View style={[s.iconCircle, { backgroundColor: promo.color + '20' }]}>
              <Ionicons name={promo.icon} size={24} color={promo.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.cardTitle}>{promo.title}</Text>
                {!isRead && <View style={s.unreadDot} />}
              </View>
              <Text style={s.cardDesc}>{promo.desc}</Text>
              <Text style={[s.cardPeriod, { color: promo.color }]}>{promo.period}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  subtitle: { color: '#888', fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardTitle: { fontWeight: '800', fontSize: 16, color: '#111', marginBottom: 4 },
  cardDesc: { color: '#555', fontSize: 13, marginBottom: 6 },
  cardPeriod: { fontWeight: '700', fontSize: 13 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e74c3c', marginLeft: 6 },
});
