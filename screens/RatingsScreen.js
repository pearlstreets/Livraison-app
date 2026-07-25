import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';

const BRAND = '#00C29B';

export default function RatingsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user, ratingsSummary, refreshRatings } = useAuth();
  const { fmtPrice } = useCurrency();
  const insets = useSafeAreaInsets();

  useEffect(() => { refreshRatings?.(); }, [refreshRatings]);

  const summary = ratingsSummary || {};
  const rawRating = (typeof summary.average === 'number' && summary.average > 0)
    ? summary.average
    : (typeof user?.rating === 'number' ? user.rating : 0);
  const totalDeliveries = summary.total_deliveries ?? (typeof user?.total_deliveries === 'number' ? user.total_deliveries : 0);
  const avg = rawRating > 0 ? rawRating.toFixed(1) : '–';
  const avgRounded = rawRating > 0 ? Math.round(rawRating) : 0;
  const dist = summary.distribution || {};
  const count = summary.count || 0;
  const tips = typeof summary.lifetime_tips === 'number' ? summary.lifetime_tips : null;
  const reviews = Array.isArray(summary.reviews) ? summary.reviews : [];
  const fmtReviewDate = (iso) => { try { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; } catch { return ''; } };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('ratingsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Note moyenne réelle */}
      <View style={s.avgCard}>
        <Text style={s.avgScore}>{avg}</Text>
        <View style={s.starsRow}>
          {[1,2,3,4,5].map(i => (
            <Ionicons key={i} name={i <= avgRounded ? 'star' : 'star-outline'} size={28} color="#00C29B" />
          ))}
        </View>
        <Text style={s.avgLabel}>{totalDeliveries} {t('evaluations') || 'livraisons'}</Text>
      </View>

      {/* Pourboires reçus (cumulés) — réel */}
      <View style={s.tipsCard}>
        <View style={s.tipsIconWrap}>
          <Ionicons name="gift" size={24} color="#00C29B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.tipsTitle}>{t('tipsReceived')}</Text>
          <Text style={s.tipsSub}>{t('tipsReceivedSub')}</Text>
        </View>
        <Text style={[s.tipsTotal, tips != null && tips > 0 && { color: '#111' }]}>
          {tips != null ? fmtPrice(tips) : '–'}
        </Text>
      </View>

      {/* Distribution des étoiles — réelle */}
      <View style={s.distCard}>
        {[5,4,3,2,1].map(star => {
          const c = dist[String(star)] ?? dist[star] ?? 0;
          const pct = count > 0 ? Math.round((c / count) * 100) : 0;
          return (
            <View key={star} style={s.distRow}>
              <Text style={s.distStar}>{star}</Text>
              <Ionicons name="star" size={14} color="#00C29B" />
              <View style={s.distBarBg}>
                <View style={[s.distBarFill, { width: `${pct}%` }]} />
              </View>
              <Text style={s.distCount}>{c}</Text>
            </View>
          );
        })}
      </View>

      {/* Derniers avis — réels (DriverRating + notes courses) */}
      <Text style={s.sectionTitle}>{t('latestReviews')}</Text>
      {reviews.length > 0 ? (
        reviews.map((rv, i) => (
          <View key={i} style={s.reviewCard}>
            <View style={s.reviewHead}>
              <View style={{ flexDirection: 'row' }}>
                {[1,2,3,4,5].map(k => (
                  <Ionicons key={k} name={k <= (rv.rating || 0) ? 'star' : 'star-outline'} size={14} color="#00C29B" />
                ))}
              </View>
              <Text style={s.reviewDate}>{fmtReviewDate(rv.created_at)}</Text>
            </View>
            {!!rv.comment && <Text style={s.reviewComment}>{rv.comment}</Text>}
          </View>
        ))
      ) : (
        <View style={s.emptyCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={36} color="#ccc" style={{ marginBottom: 10 }} />
          <Text style={s.emptyText}>{t('noDetailedReviews') || 'Aucun avis pour le moment'}</Text>
        </View>
      )}
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
  tipsTotal: { fontWeight: '900', fontSize: 20, color: '#aaa' },

  distCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 20 },
  distRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  distStar: { width: 16, fontWeight: '700', fontSize: 14, color: '#111' },
  distBarBg: { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 8 },
  distBarFill: { height: 8, backgroundColor: BRAND, borderRadius: 4 },
  distCount: { width: 20, textAlign: 'right', fontWeight: '600', fontSize: 13, color: '#666' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111', paddingHorizontal: 16, marginBottom: 10 },
  emptyCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#e8e8e8' },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center' },
  reviewCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewDate: { color: '#999', fontSize: 12 },
  reviewComment: { color: '#333', fontSize: 14, marginTop: 8, lineHeight: 20 },
});
