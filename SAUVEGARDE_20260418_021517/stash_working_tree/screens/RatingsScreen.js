import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

const REVIEWS = [
  { stars: 5, comment: 'Livraison rapide et soignée !', date: 'il y a 2 jours', tip: '2.00 €' },
  { stars: 5, comment: 'Très professionnel.', date: 'il y a 3 jours', tip: '1.50 €' },
  { stars: 4, comment: 'Bon service.', date: 'il y a 5 jours', tip: null },
  { stars: 5, comment: 'Excellent, merci !', date: 'il y a 1 semaine', tip: '3.00 €' },
  { stars: 4, comment: 'Rapide mais emballage un peu abîmé.', date: 'il y a 1 semaine', tip: null },
  { stars: 5, comment: 'Au top !', date: 'il y a 2 semaines', tip: '1.00 €' },
  { stars: 5, comment: 'Super livreur, très aimable.', date: 'il y a 2 semaines', tip: '2.50 €' },
  { stars: 3, comment: 'Un peu en retard mais correct.', date: 'il y a 3 semaines', tip: null },
  { stars: 5, comment: 'Parfait comme d\'habitude !', date: 'il y a 3 semaines', tip: '1.00 €' },
];

export default function RatingsScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const avg = (REVIEWS.reduce((s, r) => s + r.stars, 0) / REVIEWS.length).toFixed(1);
  const totalTips = REVIEWS.reduce((s, r) => s + (r.tip ? parseFloat(r.tip) : 0), 0);
  const tipsCount = REVIEWS.filter(r => r.tip).length;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('ratingsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Note moyenne */}
      <View style={s.avgCard}>
        <Text style={s.avgScore}>{avg}</Text>
        <View style={s.starsRow}>
          {[1,2,3,4,5].map(i => (
            <Ionicons key={i} name={i <= Math.round(avg) ? 'star' : 'star-outline'} size={28} color="#00C29B" />
          ))}
        </View>
        <Text style={s.avgLabel}>{REVIEWS.length} {t('evaluations')}</Text>
      </View>

      {/* Pourboires */}
      <View style={s.tipsCard}>
        <View style={s.tipsIconWrap}>
          <Ionicons name="gift" size={24} color="#00C29B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.tipsTitle}>{t('tipsReceived')}</Text>
          <Text style={s.tipsSub}>{t('tipsReceivedSub')}</Text>
        </View>
        <Text style={s.tipsTotal}>{totalTips.toFixed(2)} €</Text>
      </View>

      {/* Distribution */}
      <View style={s.distCard}>
        {[5,4,3,2,1].map(star => {
          const count = REVIEWS.filter(r => r.stars === star).length;
          const pct = REVIEWS.length > 0 ? (count / REVIEWS.length) * 100 : 0;
          return (
            <View key={star} style={s.distRow}>
              <Text style={s.distStar}>{star}</Text>
              <Ionicons name="star" size={14} color="#00C29B" />
              <View style={s.distBarBg}>
                <View style={[s.distBarFill, { width: `${pct}%` }]} />
              </View>
              <Text style={s.distCount}>{count}</Text>
            </View>
          );
        })}
      </View>

      {/* Derniers avis */}
      <Text style={s.sectionTitle}>{t('latestReviews')}</Text>
      {REVIEWS.map((r, i) => (
        <View key={i} style={s.reviewCard}>
          <View style={s.reviewHeader}>
            <View style={{ flexDirection: 'row' }}>
              {[1,2,3,4,5].map(j => (
                <Ionicons key={j} name={j <= r.stars ? 'star' : 'star-outline'} size={16} color="#00C29B" />
              ))}
            </View>
            <Text style={s.reviewDate}>{r.date}</Text>
          </View>
          <Text style={s.reviewComment}>{r.comment}</Text>
          {r.tip && (
            <View style={s.tipBadge}>
              <Ionicons name="gift-outline" size={14} color="#00C29B" />
              <Text style={s.tipBadgeText}>Pourboire : {r.tip}</Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  avgCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, padding: 24, marginBottom: 12 },
  avgScore: { fontSize: 48, fontWeight: '900', color: '#111' },
  starsRow: { flexDirection: 'row', gap: 4, marginVertical: 8 },
  avgLabel: { color: '#888', fontSize: 14 },

  tipsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12 },
  tipsIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e6faf5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tipsTitle: { fontWeight: '800', fontSize: 15, color: '#111' },
  tipsSub: { fontSize: 12, color: '#888', marginTop: 2 },
  tipsTotal: { fontWeight: '900', fontSize: 20, color: '#00C29B' },

  distCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 20 },
  distRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  distStar: { width: 16, fontWeight: '700', fontSize: 14, color: '#111' },
  distBarBg: { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 8 },
  distBarFill: { height: 8, backgroundColor: BRAND, borderRadius: 4 },
  distCount: { width: 20, textAlign: 'right', fontWeight: '600', fontSize: 13, color: '#666' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111', paddingHorizontal: 16, marginBottom: 10 },
  reviewCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e8e8e8' },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  reviewDate: { color: '#999', fontSize: 12 },
  reviewComment: { color: '#333', fontSize: 14, lineHeight: 20 },
  tipBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#e6faf5', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-start' },
  tipBadgeText: { fontSize: 13, fontWeight: '700', color: '#00C29B' },
});
