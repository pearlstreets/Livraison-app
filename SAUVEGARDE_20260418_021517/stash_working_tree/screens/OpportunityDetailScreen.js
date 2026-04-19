import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

export default function OpportunityDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const promo = route.params?.promo || {};

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('opportunitiesTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Icon hero */}
        <View style={s.heroWrap}>
          <View style={[s.heroCircle, { backgroundColor: (promo.color || BRAND) + '20' }]}>
            <Ionicons name={promo.icon || 'flash'} size={48} color={promo.color || BRAND} />
          </View>
        </View>

        <Text style={s.title}>{promo.title}</Text>
        <View style={[s.periodBadge, { backgroundColor: (promo.color || BRAND) + '15' }]}>
          <Ionicons name="time-outline" size={14} color={promo.color || BRAND} />
          <Text style={[s.periodText, { color: promo.color || BRAND }]}>{promo.period}</Text>
        </View>

        <View style={s.descCard}>
          <Text style={s.descTitle}>Description</Text>
          <Text style={s.descText}>{promo.desc}</Text>
        </View>

        {/* Conditions */}
        <View style={s.descCard}>
          <Text style={s.descTitle}>Conditions</Text>
          {promo.conditions ? (
            promo.conditions.map((c, i) => (
              <View key={i} style={s.condRow}>
                <Ionicons name="checkmark-circle" size={16} color={BRAND} />
                <Text style={s.condText}>{c}</Text>
              </View>
            ))
          ) : (
            <>
              <View style={s.condRow}>
                <Ionicons name="checkmark-circle" size={16} color={BRAND} />
                <Text style={s.condText}>Disponible dans votre zone de livraison</Text>
              </View>
              <View style={s.condRow}>
                <Ionicons name="checkmark-circle" size={16} color={BRAND} />
                <Text style={s.condText}>Compte actif et en règle</Text>
              </View>
              <View style={s.condRow}>
                <Ionicons name="checkmark-circle" size={16} color={BRAND} />
                <Text style={s.condText}>Applicable automatiquement</Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: '#f5f5f5' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  heroWrap: { alignItems: 'center', marginTop: 20, marginBottom: 16 },
  heroCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },

  title: { fontSize: 22, fontWeight: '900', color: '#111', textAlign: 'center', paddingHorizontal: 24, marginBottom: 10 },

  periodBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, gap: 6, marginBottom: 20 },
  periodText: { fontSize: 13, fontWeight: '700' },

  descCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 12 },
  descTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 8 },
  descText: { fontSize: 14, color: '#555', lineHeight: 21 },

  condRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  condText: { fontSize: 14, color: '#555', flex: 1 },
});
