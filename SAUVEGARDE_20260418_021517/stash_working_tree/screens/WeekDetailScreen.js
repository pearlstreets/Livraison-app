import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Extra detail data keyed by week start date
const WEEK_DETAILS = {
  '2026-03-24': { dates: [24,25,26,27,28,29,30], net: 305.20, tips: 7.30, hours: '28 h 15 min', courses: 64, points: '---' },
  '2026-03-17': { dates: [17,18,19,20,21,22,23], net: 440.29, tips: 7.11, hours: '35 h 41 min', courses: 82, points: '---' },
  '2026-03-10': { dates: [10,11,12,13,14,15,16], net: 512.80, tips: 5.40, hours: '40 h 12 min', courses: 95, points: '---' },
  '2026-03-03': { dates: [3,4,5,6,7,8,9], net: 362.17, tips: 7.20, hours: '30 h 05 min', courses: 71, points: '---' },
  '2026-02-24': { dates: [24,25,26,27,28,1,2], net: 268.57, tips: 3.50, hours: '22 h 30 min', courses: 52, points: '---' },
  '2026-02-17': { dates: [17,18,19,20,21,22,23], net: 421.42, tips: 6.50, hours: '34 h 18 min', courses: 78, points: '---' },
  '2026-02-10': { dates: [10,11,12,13,14,15,16], net: 339.01, tips: 4.80, hours: '27 h 45 min', courses: 66, points: '---' },
};

function getDatesForWeek(startStr) {
  const d = new Date(startStr);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.getDate();
  });
}

export default function WeekDetailScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { weeklyEarnings } = useAuth();
  const insets = useSafeAreaInsets();
  const weekIndex = route?.params?.weekIndex ?? 0;
  const [idx, setIdx] = useState(weekIndex);
  const rawWeek = weeklyEarnings[idx] || weeklyEarnings[0];
  const detail = WEEK_DETAILS[rawWeek.start] || {};
  const dates = detail.dates || getDatesForWeek(rawWeek.start);
  const week = { ...rawWeek, dates, net: detail.net || rawWeek.total, tips: detail.tips || 0, hours: detail.hours || '—', courses: detail.courses || '—', points: detail.points || '---' };
  const maxBar = Math.max(...week.bars, 1);
  const maxEur = (maxBar / Math.max(...week.bars) * (week.total / 7) * 2).toFixed(2);

  const canPrev = idx > 0;
  const canNext = idx < weeklyEarnings.length - 1;

  return (
    <View style={s.container}>
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header navigation */}
      <Pressable style={[s.backBtn, { paddingTop: insets.top }]} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#111" />
      </Pressable>

      {/* Week selector */}
      <Text style={s.weekRange}>{week.range}</Text>
      <View style={s.totalRow}>
        <Pressable onPress={() => canPrev && setIdx(idx - 1)} style={{ opacity: canPrev ? 1 : 0.3 }}>
          <Ionicons name="chevron-back" size={28} color="#111" />
        </Pressable>
        <Text style={s.totalAmount}>{week.total.toFixed(2)} €</Text>
        <Pressable onPress={() => canNext && setIdx(idx + 1)} style={{ opacity: canNext ? 1 : 0.3 }}>
          <Ionicons name="chevron-forward" size={28} color="#111" />
        </Pressable>
      </View>

      {/* Bar chart */}
      <View style={s.chartContainer}>
        <Text style={s.maxLabel}>{Number(maxEur).toFixed(2)} €</Text>
        <View style={s.dashedLine} />
        <View style={s.barsRow}>
          {week.bars.map((v, i) => (
            <View key={i} style={s.barCol}>
              <View style={[s.bar, { height: Math.max((v / maxBar) * 120, 3) }]} />
              <Text style={s.barDate}>{week.dates[i]}</Text>
              <Text style={s.barDay}>{DAY_NAMES[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Statistiques */}
      <Text style={s.sectionTitle}>{t('statistics')}</Text>
      <View style={s.statsGrid}>
        <View style={s.statItem}>
          <Text style={s.statLabel}>{t('onlineTime')}</Text>
          <Text style={s.statValue}>{week.hours}</Text>
        </View>
        <View style={s.statItem}>
          <Text style={s.statLabel}>{t('courses')}</Text>
          <Text style={s.statValue}>{week.courses}</Text>
        </View>
      </View>
      <View style={s.statItem}>
        <Text style={s.statLabel}>{t('points')}</Text>
        <Text style={s.statValue}>{week.points}</Text>
      </View>
      <Text style={s.linkText}>{t('howWeCalculate')}</Text>

      <View style={s.divider} />

      {/* Détails */}
      <Text style={s.sectionTitle}>{t('details')}</Text>
      <View style={s.detailRow}>
        <Text style={s.detailLabel}>{t('netPrice')}</Text>
        <Text style={s.detailValue}>{week.net.toFixed(2)} €</Text>
      </View>
      <View style={s.detailRowDashed} />
      <View style={s.detailRow}>
        <Text style={s.detailLabel}>{t('tip')}</Text>
        <Text style={s.detailValue}>{week.tips.toFixed(2)} €</Text>
      </View>
      <View style={s.detailRowDashed} />
      <View style={s.detailRow}>
        <Text style={[s.detailLabel, { fontWeight: '800' }]}>{t('totalEarnings')}</Text>
        <Text style={[s.detailValue, { fontWeight: '900' }]}>{week.total.toFixed(2)} €</Text>
      </View>

    </ScrollView>

    <Pressable style={[s.closeBtn, { marginBottom: insets.bottom || 16 }]} onPress={() => navigation.goBack()}>
      <Text style={s.closeBtnTxt}>{t('close')}</Text>
    </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  backBtn: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  weekRange: { textAlign: 'center', fontSize: 15, color: '#666', marginBottom: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 20 },
  totalAmount: { fontSize: 36, fontWeight: '900', color: '#111' },

  chartContainer: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24 },
  maxLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  dashedLine: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd', marginBottom: 8 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 140, paddingTop: 20 },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: 28, backgroundColor: BRAND, borderRadius: 3, marginBottom: 8 },
  barDate: { fontSize: 13, fontWeight: '700', color: '#111' },
  barDay: { fontSize: 11, color: '#999' },

  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#111', paddingHorizontal: 16, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 32, marginBottom: 8 },
  statItem: { paddingHorizontal: 16, marginBottom: 12 },
  statLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '900', color: '#111', marginTop: 2 },
  linkText: { color: BRAND, fontWeight: '600', fontSize: 14, paddingHorizontal: 16, marginTop: 4, marginBottom: 16, textDecorationLine: 'underline' },

  divider: { height: 1, backgroundColor: '#e0e0e0', marginHorizontal: 16, marginBottom: 16 },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  detailLabel: { fontSize: 15, color: '#333' },
  detailValue: { fontSize: 15, color: '#111' },
  detailRowDashed: { height: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: '#ddd', marginHorizontal: 16 },
  closeBtn: { backgroundColor: '#111', borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginTop: 8, alignItems: 'center' },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
