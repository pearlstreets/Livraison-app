import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { payoutDateLabel, payoutStatusLabel } from '../lib/payouts';

const BRAND = '#00C29B';

export default function VersementDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { currentIban } = useAuth();
  const { fmtPrice } = useCurrency();
  const insets = useSafeAreaInsets();
  const v = route.params?.versement || {};
  const isExceptionnel = v.label === 'Versement exceptionnel';

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('payoutDetail') || 'Détail du versement'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Type + montant */}
        <View style={s.topCard}>
          <View style={[s.iconCircle, isExceptionnel && { backgroundColor: '#fff3e0' }]}>
            <Ionicons name={isExceptionnel ? 'flash' : 'calendar-outline'} size={28} color={isExceptionnel ? '#f5a623' : BRAND} />
          </View>
          <Text style={s.typeLabel}>{t('payoutLabel')}</Text>
          <Text style={s.amount}>{v.amountEur != null ? fmtPrice(v.amountEur) : v.amount}</Text>
          <View style={s.statusRow}>
            <Ionicons name="checkmark-circle" size={16} color={BRAND} />
            <Text style={s.statusTxt}>{payoutStatusLabel(v.detail?.status, t)}</Text>
          </View>
        </View>

        {/* Détails */}
        <View style={s.detailCard}>
          <Text style={s.detailCardTitle}>{t('informationLabel')}</Text>

          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('dateLabel')}</Text>
            <Text style={s.detailValue}>{payoutDateLabel(v, t)}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('ibanLabel')}</Text>
            <Text style={s.detailValue}>{v.iban || currentIban}</Text>
          </View>
          <View style={s.divider} />

          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('netAmount')}</Text>
            <Text style={s.detailValue}>{v.detail?.netEur != null ? fmtPrice(v.detail.netEur) : (v.detail?.net || v.amount)}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('tips')}</Text>
            <Text style={[s.detailValue, { color: BRAND }]}>{v.detail?.tipsEur != null ? fmtPrice(v.detail.tipsEur) : (v.detail?.tips || fmtPrice(0))}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('courses')}</Text>
            <Text style={s.detailValue}>{v.detail?.courses || '-'}</Text>
          </View>
          <View style={s.divider} />

          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { fontWeight: '800' }]}>{t('totalPaid')}</Text>
            <Text style={[s.detailValue, { fontWeight: '900', fontSize: 18, color: BRAND }]}>{v.amountEur != null ? fmtPrice(v.amountEur) : v.amount}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Fermer */}
      <View style={[s.bottomWrap, { paddingBottom: insets.bottom || 10 }]}>
        <Pressable style={s.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={s.closeBtnTxt}>{t('close')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  topCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 20, alignItems: 'center', marginBottom: 12 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e6faf5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#555', marginBottom: 4 },
  amount: { fontSize: 32, fontWeight: '900', color: '#111', marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusTxt: { fontSize: 14, fontWeight: '700', color: BRAND },

  detailCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 16 },
  detailCardTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  detailLabel: { fontSize: 14, color: '#888' },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 6 },

  bottomWrap: { paddingTop: 6, paddingHorizontal: 16 },
  closeBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 14, paddingVertical: 14 },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
