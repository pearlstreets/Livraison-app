import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

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
        {DAYS.map((d, i) => <Text key={i} style={s.dayLabel}>{d}</Text>)}
      </View>
    </View>
  );
}

export default function EarningsScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { currentEarningsCents, cashOut, weeklyEarnings, fetchEarnings } = useAuth();
  const scrollRef = useRef(null);
  const earn = { earningsCents: currentEarningsCents, earnings: (currentEarningsCents / 100).toFixed(2) + ' €' };
  const [encaissModal, setEncaissModal] = useState(false);
  const [encaissStep, setEncaissStep] = useState('confirm');
  const [cashedAmount, setCashedAmount] = useState('');
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setLoadingEarnings(true);
    fetchEarnings().finally(() => setLoadingEarnings(false));
  }, [fetchEarnings]));

  function startEncaiss() {
    if (earn.earningsCents <= 0) return;
    setCashedAmount(earn.earnings);
    setEncaissStep('confirm');
    setEncaissModal(true);
  }

  async function processEncaiss() {
    setEncaissStep('processing');
    const result = await cashOut();
    if (result?.reason === 'already_today') {
      setEncaissStep('error_today');
      return;
    }
    setEncaissStep(result?.success ? 'done' : 'error');
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.header, { paddingTop: insets.top }]}>{t('earnings')}</Text>

        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t('currentBalance')}</Text>
          <Text style={s.balanceAmount}>{earn.earnings}</Text>
          <Pressable style={[s.encaissBtn, earn.earningsCents <= 0 && { opacity: 0.4 }]} onPress={startEncaiss}>
            <Ionicons name="flash" size={16} color="#111" />
            <Text style={s.encaissTxt}>{t('cashout')}</Text>
          </Pressable>
          <Text style={s.cashoutLimit}>1 encaissement par jour</Text>
        </View>

        <Text style={s.sectionHeader}>{t('selectWeek')}</Text>
        <View style={s.tableHeader}>
          <Text style={s.tableHeaderLeft}>{t('weeklyEarnings')}</Text>
          <Text style={s.tableHeaderRight}>{DAYS.join('  ')}</Text>
        </View>

        {weeklyEarnings.map((week, i) => (
          <Pressable key={i} style={s.weekRow} onPress={() => navigation.navigate('WeekDetail', { weekIndex: i })}>
            <View style={{ flex: 1 }}>
              <Text style={s.weekRange}>{week.range}</Text>
              <Text style={s.weekTotal}>{week.total.toFixed(2)} €</Text>
            </View>
            <MiniChart bars={week.bars} />
          </Pressable>
        ))}
      </ScrollView>

      {/* Modal Encaissement */}
      <Modal visible={encaissModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.popup}>
            {encaissStep === 'confirm' && (
              <>
                <View style={s.popupIconWrap}>
                  <Ionicons name="flash" size={40} color={BRAND} />
                </View>
                <Text style={s.popupTitle}>{t('instantCashout')}</Text>
                <Text style={s.popupDesc}>Votre solde de {cashedAmount} sera transféré sur votre compte bancaire ••••15 sous 30 minutes.</Text>
                <Text style={s.popupFee}>{t('cashoutFee')}</Text>
                <Pressable style={s.popupBtnPrimary} onPress={processEncaiss}>
                  <Text style={s.popupBtnPrimaryTxt}>{t('confirmCashout')}</Text>
                </Pressable>
                <Pressable style={s.popupBtnCancel} onPress={() => setEncaissModal(false)}>
                  <Text style={s.popupBtnCancelTxt}>{t('cancel')}</Text>
                </Pressable>
              </>
            )}
            {encaissStep === 'processing' && (
              <>
                <View style={s.popupIconWrap}>
                  <Ionicons name="hourglass-outline" size={40} color="#f5a623" />
                </View>
                <Text style={s.popupTitle}>{t('processing')}</Text>
                <Text style={s.popupDesc}>{t('processingMsg')}</Text>
              </>
            )}
            {encaissStep === 'done' && (
              <>
                <View style={[s.popupIconWrap, { backgroundColor: BRAND + '20' }]}>
                  <Ionicons name="checkmark-circle" size={48} color={BRAND} />
                </View>
                <Text style={s.popupTitle}>{t('cashoutSuccess')}</Text>
                <Text style={s.popupDesc}>Le montant de {cashedAmount} sera versé sur votre compte bancaire ••••15 dans les 30 prochaines minutes.</Text>
                <Pressable style={s.popupBtnPrimary} onPress={() => setEncaissModal(false)}>
                  <Text style={s.popupBtnPrimaryTxt}>{t('close')}</Text>
                </Pressable>
              </>
            )}
            {encaissStep === 'error_today' && (
              <Text style={{ color: '#dc2626', textAlign: 'center', padding: 16 }}>
                Vous avez déjà encaissé aujourd'hui. Réessayez demain.
              </Text>
            )}
            {encaissStep === 'error' && (
              <Text style={{ color: '#dc2626', textAlign: 'center', padding: 16 }}>
                Erreur lors de l'encaissement. Réessayez.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontSize: 28, fontWeight: '900', color: '#111', paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  balanceCard: { backgroundColor: '#111', borderRadius: 20, padding: 20, marginHorizontal: 16, marginBottom: 24 },
  balanceLabel: { color: '#999', fontSize: 13, fontWeight: '600' },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginVertical: 6 },
  encaissBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 4 },
  encaissTxt: { fontWeight: '700', fontSize: 14, color: '#111' },
  cashoutLimit: { color: '#aaa', fontSize: 12, marginTop: 8, fontWeight: '600' },
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

  // Popup
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  popup: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center' },
  popupIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  popupTitle: { fontSize: 22, fontWeight: '900', color: '#111', marginBottom: 8 },
  popupDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  popupFee: { fontSize: 14, color: '#999', marginBottom: 20 },
  popupBtnPrimary: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', width: '100%', marginBottom: 10 },
  popupBtnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  popupBtnCancel: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  popupBtnCancelTxt: { color: '#666', fontWeight: '700', fontSize: 15 },
});
