import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatRange, weekdayInitials } from '../lib/i18nFormat';
import InstantCashoutSheet, { instantBlockedMessage, nextPayoutText } from '../components/InstantCashoutSheet';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

function MiniChart({ bars, s }) {
  // Barres absentes ou mal formées : 7 jours à zéro plutôt qu'un plantage.
  const vals = Array.isArray(bars) ? bars.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)) : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...vals, 1);
  return (
    <View style={s.chartWrap}>
      <View style={s.barsRow}>
        {vals.map((v, i) => (
          <View key={i} style={s.barCol}>
            <View style={[s.bar, { height: Math.max((v / max) * 50, 2) }]} />
          </View>
        ))}
      </View>
      <View style={s.daysRow}>
        {weekdayInitials().map((d, i) => <Text key={i} style={s.dayLabel}>{d}</Text>)}
      </View>
    </View>
  );
}

export default function EarningsScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { currentEarningsCents, wallet, weeklyEarnings, currentIban, refreshEarnings } = useAuth();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef(null);
  // Solde illisible : 0 (jamais NaN, et l'encaissement reste bloqué).
  const soldeCents = Number.isFinite(Number(currentEarningsCents)) ? Number(currentEarningsCents) : 0;
  const earn = { earningsCents: soldeCents, earnings: fmtPrice(soldeCents / 100) };
  const semaines = Array.isArray(weeklyEarnings) ? weeklyEarnings : [];
  const bankTail = ((currentIban || '').match(/(\d{2,4})\s*$/) || [])[1] || '';
  const bankLabel = bankTail ? `••${bankTail}` : t('yourSavedAccount');
  const [encaissModal, setEncaissModal] = useState(false);
  // Virement instantané : limites lues sur le serveur (3 par jour, minimum, banque).
  const blocked = instantBlockedMessage(wallet, earn.earningsCents, t, fmtPrice);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Solde, frais et limites relus sur le serveur à chaque affichage.
    refreshEarnings?.();
  }, [refreshEarnings]));

  function startEncaiss() {
    if (earn.earningsCents <= 0) return;
    if (blocked) {
      Alert.alert(t('instantCashout'), blocked);
      return;
    }
    setEncaissModal(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.header, { paddingTop: insets.top }]}>{t('earnings')}</Text>

        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t('currentBalance')}</Text>
          <Text style={s.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{earn.earnings}</Text>
          <Text style={s.cashoutLimit}>{nextPayoutText(wallet, t, fmtPrice)}</Text>
          <Pressable style={[s.encaissBtn, (earn.earningsCents <= 0 || blocked) && { opacity: 0.4 }]} onPress={startEncaiss}>
            <Ionicons name="flash" size={16} color={BRAND} />
            <Text style={s.encaissTxt}>{t('cashout')}</Text>
          </Pressable>
          {wallet?.instant?.available && wallet.instant.feeEur != null && wallet.instant.remainingToday != null && (
            <Text style={s.cashoutLimit}>{t('instantInfo', { fee: fmtPrice(wallet.instant.feeEur), left: wallet.instant.remainingToday })}</Text>
          )}
        </View>

        <Pressable style={s.releveRow} onPress={() => navigation.navigate('ReleveComptable')}>
          <View style={s.releveIcon}>
            <Ionicons name="document-text-outline" size={20} color={BRAND} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.releveTitle}>{t('releveComptable')}</Text>
            <Text style={s.releveDesc}>{t('releveComptableDesc')}</Text>
          </View>
          <Ionicons name={dirIcon('chevron-forward')} size={16} color={colors.chevron} />
        </Pressable>

        <Text style={s.sectionHeader}>{t('selectWeek')}</Text>
        <View style={s.tableHeader}>
          <Text style={s.tableHeaderLeft}>{t('weeklyEarnings')}</Text>
          <Text style={s.tableHeaderRight}>{weekdayInitials().join('  ')}</Text>
        </View>

        {semaines.map((week, i) => (
          <Pressable key={week?.start || i} style={s.weekRow} onPress={() => navigation.navigate('WeekDetail', { weekIndex: i })}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.weekRange}>{formatRange(week.start, week.end) || week.range}</Text>
              <Text style={s.weekTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fmtPrice(week.total)}</Text>
            </View>
            <MiniChart bars={week.bars} s={s} />
          </Pressable>
        ))}
      </ScrollView>
      <StatusBarShield />

      <InstantCashoutSheet visible={encaissModal} onClose={() => setEncaissModal(false)} accountLabel={bankLabel} />
    </View>
  );
}

// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  header: { fontSize: 28, fontWeight: '900', color: c.text, paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  balanceCard: { backgroundColor: BRAND, borderRadius: 20, padding: 20, marginHorizontal: 16, marginBottom: 24 },
  balanceLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginVertical: 6 },
  encaissBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 4 },
  encaissTxt: { fontWeight: '700', fontSize: 14, color: BRAND, flexShrink: 1 },
  cashoutLimit: { color: '#fff', fontSize: 12, marginTop: 8, fontWeight: '600' },
  releveRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginBottom: 24, padding: 14 },
  releveIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  releveTitle: { fontSize: 15, fontWeight: '800', color: c.text },
  releveDesc: { fontSize: 13, color: p('#888', c.textMuted), marginTop: 2 },
  sectionHeader: { fontSize: 22, fontWeight: '900', color: c.text, paddingHorizontal: 16, marginBottom: 12 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderStrong, backgroundColor: c.card },
  tableHeaderLeft: { fontSize: 13, fontWeight: '600', color: p('#666', c.textMuted), flexShrink: 1 },
  tableHeaderRight: { fontSize: 13, fontWeight: '600', color: p('#666', c.textMuted), marginLeft: 12, flexShrink: 0 },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: p('#f0f0f0', c.border) },
  weekRange: { fontSize: 14, color: p('#666', c.textMuted), marginBottom: 4 },
  weekTotal: { fontSize: 20, fontWeight: '900', color: c.text },
  chartWrap: { width: 120, alignItems: 'center' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 50 },
  barCol: { alignItems: 'center', width: 12 },
  bar: { width: 8, backgroundColor: BRAND, borderRadius: 2 },
  daysRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dayLabel: { width: 12, textAlign: 'center', fontSize: 9, color: c.textFaint, fontWeight: '600' },

  });
};
