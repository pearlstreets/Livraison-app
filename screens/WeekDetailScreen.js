import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatRange, weekdayShortNames } from '../lib/i18nFormat';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

function getDatesForWeek(startStr) {
  const d = new Date(startStr);
  // Date de début absente ou illisible : numéros des jours laissés vides (pas de « NaN »).
  if (!startStr || Number.isNaN(d.getTime())) return Array(7).fill('');
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.getDate();
  });
}

const EMPTY_WEEK = { start: '', range: '', total: 0, bars: [0, 0, 0, 0, 0, 0, 0], net: 0, tips: 0, courses: 0 };

export default function WeekDetailScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { weeklyEarnings } = useAuth();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const semaines = Array.isArray(weeklyEarnings) ? weeklyEarnings : [];
  const weekIndex = route?.params?.weekIndex ?? 0;
  const [idx, setIdx] = useState(weekIndex);
  const rawWeek = semaines[idx] || semaines[0] || EMPTY_WEEK;
  // 100% données réelles (adaptEarningsWeek : total/net/tips/courses/bars).
  // Barres en NET (net de la semaine réparti au prorata du brut de chaque jour,
  // le serveur ne donnant pas de net par jour) : même base que l'écran Gains.
  // Temps en ligne et points : non suivis par le serveur, donc non affichés.
  const bars = Array.isArray(rawWeek.bars) && rawWeek.bars.length === 7 ? rawWeek.bars.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)) : [0, 0, 0, 0, 0, 0, 0];
  const week = {
    ...rawWeek,
    bars,
    dates: getDatesForWeek(rawWeek.start),
    net: typeof rawWeek.net === 'number' ? rawWeek.net : (rawWeek.total || 0),
    tips: typeof rawWeek.tips === 'number' ? rawWeek.tips : 0,
    courses: typeof rawWeek.courses === 'number' ? rawWeek.courses : '-',
  };
  const maxBar = Math.max(...bars, 1);
  const maxEur = Math.max(...bars, 0).toFixed(2);

  const canPrev = idx > 0;
  const canNext = idx < semaines.length - 1;
  const nomsJours = weekdayShortNames();

  return (
    <View style={s.container}>
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header navigation */}
      <Pressable style={[s.backBtn, { paddingTop: insets.top }]} onPress={() => navigation.goBack()}>
        <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
      </Pressable>

      {/* Week selector */}
      <Text style={s.weekRange}>{formatRange(week.start, week.end) || week.range}</Text>
      <View style={s.totalRow}>
        <Pressable onPress={() => canPrev && setIdx(idx - 1)} style={{ opacity: canPrev ? 1 : 0.3 }}>
          <Ionicons name={dirIcon('chevron-back')} size={28} color={colors.text} />
        </Pressable>
        <Text style={s.totalAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fmtPrice(week.total)}</Text>
        <Pressable onPress={() => canNext && setIdx(idx + 1)} style={{ opacity: canNext ? 1 : 0.3 }}>
          <Ionicons name={dirIcon('chevron-forward')} size={28} color={colors.text} />
        </Pressable>
      </View>

      {/* Bar chart */}
      <View style={s.chartContainer}>
        <Text style={s.maxLabel}>{fmtPrice(Number(maxEur))}</Text>
        <View style={s.dashedLine} />
        <View style={s.barsRow}>
          {week.bars.map((v, i) => (
            <View key={i} style={s.barCol}>
              <View style={[s.bar, { height: Math.max((v / maxBar) * 120, 3) }]} />
              <Text style={s.barDate}>{week.dates[i]}</Text>
              <Text style={s.barDay} numberOfLines={1}>{nomsJours[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Statistiques */}
      <Text style={s.sectionTitle}>{t('statistics')}</Text>
      <View style={s.statsGrid}>
        <View style={s.statItem}>
          <Text style={s.statLabel}>{t('courses')}</Text>
          <Text style={s.statValue}>{week.courses}</Text>
        </View>
      </View>
      <Text style={s.linkText}>{t('howWeCalculate')}</Text>

      <View style={s.divider} />

      {/* Détails */}
      <Text style={s.sectionTitle}>{t('details')}</Text>
      <View style={s.detailRow}>
        <Text style={s.detailLabel}>{t('netPrice')}</Text>
        <Text style={s.detailValue}>{fmtPrice(week.net)}</Text>
      </View>
      <View style={s.detailRowDashed} />
      <View style={s.detailRow}>
        <Text style={s.detailLabel}>{t('tip')}</Text>
        <Text style={s.detailValue}>{fmtPrice(week.tips)}</Text>
      </View>
      <View style={s.detailRowDashed} />
      {week.bonus > 0 && (
        <>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('demandBonus')}</Text>
            <Text style={s.detailValue}>{fmtPrice(week.bonus)}</Text>
          </View>
          <View style={s.detailRowDashed} />
        </>
      )}
      <View style={s.detailRow}>
        <Text style={[s.detailLabel, { fontWeight: '800' }]}>{t('totalEarnings')}</Text>
        <Text style={[s.detailValue, { fontWeight: '900' }]}>{fmtPrice(week.total)}</Text>
      </View>

    </ScrollView>
    <StatusBarShield />

    <Pressable style={[s.closeBtn, { marginBottom: insets.bottom || 16 }]} onPress={() => navigation.goBack()}>
      <Text style={s.closeBtnTxt}>{t('close')}</Text>
    </Pressable>
    </View>
  );
}

// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  backBtn: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  weekRange: { textAlign: 'center', fontSize: 15, color: p('#666', c.textMuted), marginBottom: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 20 },
  totalAmount: { fontSize: 36, fontWeight: '900', color: c.text, flexShrink: 1 },

  chartContainer: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 24 },
  maxLabel: { fontSize: 12, color: c.textFaint, marginBottom: 4 },
  dashedLine: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: p('#ddd', c.borderStrong), marginBottom: 8 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 140, paddingTop: 20 },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: 28, backgroundColor: BRAND, borderRadius: 3, marginBottom: 8 },
  barDate: { fontSize: 13, fontWeight: '700', color: c.text },
  barDay: { fontSize: 11, color: c.textFaint },

  sectionTitle: { fontSize: 22, fontWeight: '900', color: c.text, paddingHorizontal: 16, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 32, marginBottom: 8 },
  statItem: { paddingHorizontal: 16, marginBottom: 12 },
  statLabel: { fontSize: 14, color: p('#666', c.textMuted), fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '900', color: c.text, marginTop: 2 },
  linkText: { color: BRAND, fontWeight: '600', fontSize: 14, paddingHorizontal: 16, marginTop: 4, marginBottom: 16, textDecorationLine: 'underline' },

  divider: { height: 1, backgroundColor: c.borderStrong, marginHorizontal: 16, marginBottom: 16 },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  detailLabel: { fontSize: 15, color: p('#333', c.textSoft), flexShrink: 1 },
  detailValue: { fontSize: 15, color: c.text, marginLeft: 12, flexShrink: 0 },
  detailRowDashed: { height: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: p('#ddd', c.borderStrong), marginHorizontal: 16 },
  closeBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginTop: 8, alignItems: 'center' },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
};
