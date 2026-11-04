import React, { useState, useRef, useCallback } from 'react';
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

const BRAND = '#FF6A13';

function MiniChart({ bars }) {
  const max = Math.max(...bars, 1);
  return (
    <View style={s.chartWrap}>
      <View style={s.barsRow}>
        {bars.map((v, i) => (
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
  const { currentEarningsCents, wallet, weeklyEarnings, currentIban } = useAuth();
  const { fmtPrice } = useCurrency();
  const scrollRef = useRef(null);
  const earn = { earningsCents: currentEarningsCents, earnings: fmtPrice(currentEarningsCents / 100) };
  const bankTail = ((currentIban || '').match(/(\d{2,4})\s*$/) || [])[1] || '';
  const bankLabel = bankTail ? `••${bankTail}` : t('yourSavedAccount');
  const [encaissModal, setEncaissModal] = useState(false);
  // Virement instantané : limites lues sur le serveur (3 par jour, minimum, banque).
  const blocked = instantBlockedMessage(wallet, earn.earningsCents, t, fmtPrice);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  function startEncaiss() {
    if (earn.earningsCents <= 0) return;
    if (blocked) {
      Alert.alert(t('instantCashout'), blocked);
      return;
    }
    setEncaissModal(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.header, { paddingTop: insets.top }]}>{t('earnings')}</Text>

        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t('currentBalance')}</Text>
          <Text style={s.balanceAmount}>{earn.earnings}</Text>
          <Text style={s.cashoutLimit}>{nextPayoutText(wallet, t, fmtPrice)}</Text>
          <Pressable style={[s.encaissBtn, (earn.earningsCents <= 0 || blocked) && { opacity: 0.4 }]} onPress={startEncaiss}>
            <Ionicons name="flash" size={16} color={BRAND} />
            <Text style={s.encaissTxt}>{t('cashout')}</Text>
          </Pressable>
          {wallet?.instant?.available && (
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
          <Ionicons name={dirIcon('chevron-forward')} size={16} color="#ccc" />
        </Pressable>

        <Text style={s.sectionHeader}>{t('selectWeek')}</Text>
        <View style={s.tableHeader}>
          <Text style={s.tableHeaderLeft}>{t('weeklyEarnings')}</Text>
          <Text style={s.tableHeaderRight}>{weekdayInitials().join('  ')}</Text>
        </View>

        {weeklyEarnings.map((week, i) => (
          <Pressable key={i} style={s.weekRow} onPress={() => navigation.navigate('WeekDetail', { weekIndex: i })}>
            <View style={{ flex: 1 }}>
              <Text style={s.weekRange}>{formatRange(week.start, week.end) || week.range}</Text>
              <Text style={s.weekTotal}>{fmtPrice(week.total)}</Text>
            </View>
            <MiniChart bars={week.bars} />
          </Pressable>
        ))}
      </ScrollView>
      <StatusBarShield />

      <InstantCashoutSheet visible={encaissModal} onClose={() => setEncaissModal(false)} accountLabel={bankLabel} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontSize: 28, fontWeight: '900', color: '#111', paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  balanceCard: { backgroundColor: BRAND, borderRadius: 20, padding: 20, marginHorizontal: 16, marginBottom: 24 },
  balanceLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginVertical: 6 },
  encaissBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 4 },
  encaissTxt: { fontWeight: '700', fontSize: 14, color: BRAND },
  cashoutLimit: { color: '#fff', fontSize: 12, marginTop: 8, fontWeight: '600' },
  releveRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 24, padding: 14 },
  releveIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF1E8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  releveTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  releveDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  sectionHeader: { fontSize: 22, fontWeight: '900', color: '#111', paddingHorizontal: 16, marginBottom: 12 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', backgroundColor: '#fff' },
  tableHeaderLeft: { fontSize: 13, fontWeight: '600', color: '#666' },
  tableHeaderRight: { fontSize: 13, fontWeight: '600', color: '#666' },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  weekRange: { fontSize: 14, color: '#666', marginBottom: 4 },
  weekTotal: { fontSize: 20, fontWeight: '900', color: '#111' },
  chartWrap: { width: 120, alignItems: 'center' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 50 },
  barCol: { alignItems: 'center', width: 12 },
  bar: { width: 8, backgroundColor: BRAND, borderRadius: 2 },
  daysRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dayLabel: { width: 12, textAlign: 'center', fontSize: 9, color: '#999', fontWeight: '600' },

});
