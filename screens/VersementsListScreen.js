import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { payoutDateLabel, payoutStatusLabel, payoutTypeLabel } from '../lib/payouts';
import useSecureScreen from '../hooks/useSecureScreen';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

export default function VersementsListScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { versements, currentIban } = useAuth();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // IBAN affiché dans le détail de chaque versement.
  useSecureScreen('VersementsList');
  const mode = route?.params?.mode || 'activity'; // 'activity' or 'history'
  const liste = Array.isArray(versements) ? versements : [];

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{mode === 'history' ? t('transferHistory') : t('payoutActivity')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {mode === 'activity' ? (
          <View style={s.listCard}>
            {liste.map((v, i) => (
              <Pressable key={v.id ?? i} style={[s.versementRow, i < liste.length - 1 && s.versementBorder]} onPress={() => navigation.navigate('VersementDetail', { versement: v })}>
                <Ionicons name="calendar-outline" size={22} color={colors.dark ? colors.textMuted : '#666'} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.versementLabel}>{payoutTypeLabel(v, t)}</Text>
                  <View style={s.versementDateRow}>
                    <Text style={s.versementAmount}>{v.amountEur != null ? fmtPrice(v.amountEur) : v.amount}</Text>
                    <Text style={s.versementDate}>{payoutDateLabel(v, t)} · {payoutStatusLabel(v.status, t)}</Text>
                  </View>
                </View>
                <Ionicons name={dirIcon('chevron-forward')} size={16} color={colors.chevron} style={{ marginLeft: 8 }} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={s.histList}>
            {liste.map((v, i) => (
              <Pressable key={v.id ?? i} style={[s.virementCard, i < liste.length - 1 && { marginBottom: 10 }]} onPress={() => navigation.navigate('VersementDetail', { versement: v })}>
                <View style={s.virementHeader}>
                  <View style={s.virementIconWrap}>
                    <Ionicons name={v.label === 'Versement exceptionnel' ? 'flash' : 'calendar-outline'} size={18} color={v.label === 'Versement exceptionnel' ? '#f5a623' : BRAND} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.virementLabel}>{payoutTypeLabel(v, t)}</Text>
                    <Text style={s.virementDateSmall}>{payoutDateLabel(v, t)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.virementAmountBig}>{v.amountEur != null ? fmtPrice(v.amountEur) : v.amount}</Text>
                    <View style={s.virementStatusBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={BRAND} />
                      <Text style={s.virementStatusTxt}>{payoutStatusLabel(v.detail?.status, t)}</Text>
                    </View>
                  </View>
                </View>
                <View style={s.virementDetails}>
                  <View style={s.virementDetailRow}>
                    <Text style={s.virementDetailLabel}>{t('ibanLabel')}</Text>
                    <Text style={s.virementDetailValue}>{v.iban || currentIban}</Text>
                  </View>
                  <View style={s.virementDetailRow}>
                    <Text style={s.virementDetailLabel}>{t('netAmount')}</Text>
                    <Text style={s.virementDetailValue}>{fmtPrice(Number(v.amountEur) || 0)}</Text>
                  </View>
                  <View style={s.virementDetailRow}>
                    <Text style={s.virementDetailLabel}>{t('courses')}</Text>
                    <Text style={s.virementDetailValue}>{v.detail?.courses ?? '-'}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },

  listCard: { backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden' },
  versementRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  versementBorder: { borderBottomWidth: 1, borderBottomColor: p('#f0f0f0', c.border) },
  versementLabel: { fontWeight: '700', fontSize: 15, color: c.text },
  versementDateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  versementDate: { color: p('#888', c.textMuted), fontSize: 13 },
  versementAmount: { fontWeight: '800', fontSize: 16, color: c.text },

  histList: { paddingHorizontal: 16 },
  virementCard: { backgroundColor: c.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: p('#f0f0f0', c.border) },
  virementHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  virementIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: p('#f5f5f5', c.border), alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  virementLabel: { fontWeight: '700', fontSize: 14, color: c.text },
  virementDateSmall: { fontSize: 12, color: c.textFaint, marginTop: 1 },
  virementAmountBig: { fontWeight: '900', fontSize: 16, color: c.text },
  virementStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  virementStatusTxt: { fontSize: 11, color: BRAND, fontWeight: '700' },
  virementDetails: { backgroundColor: p('#f9f9f9', c.border), borderRadius: 10, padding: 10 },
  virementDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  virementDetailLabel: { fontSize: 13, color: p('#888', c.textMuted) },
  virementDetailValue: { fontSize: 13, fontWeight: '700', color: p('#333', c.textSoft) },
  });
};
