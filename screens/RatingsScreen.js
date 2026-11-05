import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';

const BRAND = '#FF6A13';

export default function RatingsScreen({ navigation }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const { user, ratingsSummary, refreshRatings } = useAuth();
  const { fmtPrice } = useCurrency();
  const insets = useSafeAreaInsets();

  useEffect(() => { refreshRatings?.(); }, [refreshRatings]);

  const summary = ratingsSummary || {};
  const rawRating = (typeof summary.average === 'number' && summary.average > 0)
    ? summary.average
    : (typeof user?.rating === 'number' ? user.rating : 0);
  const avg = rawRating > 0 ? rawRating.toFixed(1) : '-';
  const avgRounded = rawRating > 0 ? Math.round(rawRating) : 0;
  const dist = summary.distribution || {};
  const count = Number(summary.count) || 0;
  const tips = typeof summary.lifetime_tips === 'number' ? summary.lifetime_tips : null;
  const reviews = Array.isArray(summary.reviews) ? summary.reviews : [];
  const fmtReviewDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('ratingsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Note moyenne réelle */}
      <View style={s.avgCard}>
        <Text style={s.avgScore}>{avg}</Text>
        <View style={s.starsRow}>
          {[1,2,3,4,5].map(i => (
            <Ionicons key={i} name={i <= avgRounded ? 'star' : 'star-outline'} size={28} color="#FF6A13" />
          ))}
        </View>
        <Text style={s.avgLabel}>{count} {t('evaluations')}</Text>
      </View>

      {/* Pourboires reçus (cumulés) — réel */}
      <View style={s.tipsCard}>
        <View style={s.tipsIconWrap}>
          <Ionicons name="gift" size={24} color="#FF6A13" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.tipsTitle}>{t('tipsReceived')}</Text>
          <Text style={s.tipsSub}>{t('tipsReceivedSub')}</Text>
        </View>
        <Text style={[s.tipsTotal, tips != null && tips > 0 && { color: colors.text }]}>
          {tips != null ? fmtPrice(tips) : '-'}
        </Text>
      </View>

      {/* Distribution des étoiles — réelle */}
      <View style={s.distCard}>
        {[5,4,3,2,1].map(star => {
          const c = Number(dist[String(star)] ?? dist[star]) || 0;
          const pct = count > 0 ? Math.round((c / count) * 100) : 0;
          return (
            <View key={star} style={s.distRow}>
              <Text style={s.distStar}>{star}</Text>
              <Ionicons name="star" size={14} color="#FF6A13" />
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
                  <Ionicons key={k} name={k <= (Number(rv?.rating) || 0) ? 'star' : 'star-outline'} size={14} color="#FF6A13" />
                ))}
              </View>
              <Text style={s.reviewDate}>{fmtReviewDate(rv?.created_at)}</Text>
            </View>
            {!!rv?.comment && <Text style={s.reviewComment}>{rv.comment}</Text>}
          </View>
        ))
      ) : (
        <View style={s.emptyCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={36} color={colors.chevron} style={{ marginBottom: 10 }} />
          <Text style={s.emptyText}>{t('noDetailedReviews') || 'Aucun avis pour le moment'}</Text>
        </View>
      )}
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  avgCard: { alignItems: 'center', backgroundColor: c.card, borderRadius: 20, marginHorizontal: 16, padding: 24, marginBottom: 12 },
  avgScore: { fontSize: 48, fontWeight: '900', color: c.text },
  starsRow: { flexDirection: 'row', gap: 4, marginVertical: 8 },
  avgLabel: { color: c.dark ? c.textMuted : '#888', fontSize: 14 },

  tipsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12 },
  tipsIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tipsTitle: { fontWeight: '800', fontSize: 15, color: c.text },
  tipsSub: { fontSize: 12, color: c.dark ? c.textMuted : '#888', marginTop: 2 },
  tipsTotal: { fontWeight: '900', fontSize: 20, color: c.dark ? c.textFaint : '#aaa' },

  distCard: { backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 20 },
  distRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  distStar: { width: 16, fontWeight: '700', fontSize: 14, color: c.text },
  distBarBg: { flex: 1, height: 8, backgroundColor: c.dark ? c.border : '#f0f0f0', borderRadius: 4, marginHorizontal: 8 },
  distBarFill: { height: 8, backgroundColor: BRAND, borderRadius: 4 },
  distCount: { width: 20, textAlign: 'right', fontWeight: '600', fontSize: 13, color: c.dark ? c.textMuted : '#666' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: c.text, paddingHorizontal: 16, marginBottom: 10 },
  emptyCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 14, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: c.dark ? c.borderStrong : '#e8e8e8' },
  emptyText: { color: c.textFaint, fontSize: 14, textAlign: 'center' },
  reviewCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.dark ? c.border : '#eee' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewDate: { color: c.textFaint, fontSize: 12 },
  reviewComment: { color: c.dark ? c.textSoft : '#333', fontSize: 14, marginTop: 8, lineHeight: 20 },
});

// Feuilles de style par thème (clair, sombre), créées une seule fois chacune.
const stylesParTheme = new Map();
function stylesPour(c) {
  if (!stylesParTheme.has(c)) stylesParTheme.set(c, makeStyles(c));
  return stylesParTheme.get(c);
}
