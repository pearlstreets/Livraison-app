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

export default function VersementDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { currentIban } = useAuth();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // IBAN du versement.
  useSecureScreen('VersementDetail');
  const v = route?.params?.versement || {};
  const isExceptionnel = v.label === 'Versement exceptionnel';

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{t('payoutDetail') || 'Détail du versement'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Type + montant */}
        <View style={s.topCard}>
          <View style={[s.iconCircle, isExceptionnel && { backgroundColor: colors.dark ? colors.cardAlt : '#fff3e0' }]}>
            <Ionicons name={isExceptionnel ? 'flash' : 'calendar-outline'} size={28} color={isExceptionnel ? '#f5a623' : BRAND} />
          </View>
          <Text style={s.typeLabel}>{payoutTypeLabel(v, t)}</Text>
          <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{v.amountEur != null ? fmtPrice(v.amountEur) : v.amount}</Text>
          <View style={s.statusRow}>
            <Ionicons name={v.detail?.status === 'failed' ? 'close-circle' : (v.detail?.status === 'paid' ? 'checkmark-circle' : 'time-outline')} size={16} color={BRAND} />
            <Text style={s.statusTxt}>{payoutStatusLabel(v.detail?.status, t)}</Text>
          </View>
          {v.detail?.status === 'failed' && <Text style={s.noteTxt}>{t('payoutFailedNote')}</Text>}
          {v.detail?.status === 'standard' && <Text style={s.noteTxt}>{t('payoutStandardNote')}</Text>}
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

          {/* Total des courses = BRUT du serveur (avant retenues) ; ligne masquée s'il ne le donne pas. */}
          {v.detail?.grossEur != null ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('payoutGross')}</Text>
              <Text style={s.detailValue}>{fmtPrice(v.detail.grossEur)}</Text>
            </View>
          ) : null}
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('tips')}</Text>
            <Text style={[s.detailValue, { color: BRAND }]}>{v.detail?.tipsEur != null ? fmtPrice(v.detail.tipsEur) : (v.detail?.tips || fmtPrice(0))}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('courses')}</Text>
            <Text style={s.detailValue}>{v.detail?.courses ?? '-'}</Text>
          </View>
          {v.kind === 'instant' && v.detail?.feeEur > 0 && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('instantFeeLabel')}</Text>
              <Text style={s.detailValue}>{v.detail.feeRefunded ? t('feeRefunded') : `- ${fmtPrice(v.detail.feeEur)}`}</Text>
            </View>
          )}
          {v.detail?.commissionEur > 0 && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('payoutCommission')}</Text>
              <Text style={s.detailValue}>- {fmtPrice(v.detail.commissionEur)}</Text>
            </View>
          )}
          {v.detail?.urssafEur > 0 && (
            <>
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { flex: 1, paddingRight: 8 }]}>
                  {t('payoutUrssaf')}{v.detail.urssafRate > 0 ? ` (${(v.detail.urssafRate * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} %)` : ''}
                </Text>
                <Text style={s.detailValue}>- {fmtPrice(v.detail.urssafEur)}</Text>
              </View>
              <Text style={s.note}>{t('payoutUrssafNote')}</Text>
            </>
          )}
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

// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },

  topCard: { backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, padding: 20, alignItems: 'center', marginBottom: 12 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: p('#555', c.textSoft), marginBottom: 4 },
  amount: { fontSize: 32, fontWeight: '900', color: c.text, marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusTxt: { fontSize: 14, fontWeight: '700', color: BRAND, flexShrink: 1 },
  noteTxt: { fontSize: 13, color: p('#666', c.textMuted), textAlign: 'center', marginTop: 8, paddingHorizontal: 16, lineHeight: 18 },

  detailCard: { backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, padding: 16 },
  detailCardTitle: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  detailLabel: { fontSize: 14, color: p('#888', c.textMuted), flexShrink: 1 },
  // Valeur longue (IBAN, date) : passe à la ligne à droite au lieu de toucher le libellé.
  detailValue: { fontSize: 14, fontWeight: '700', color: c.text, marginLeft: 12, flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12, color: p('#888', c.textMuted), lineHeight: 17, marginTop: 2, marginBottom: 4 },
  divider: { height: 1, backgroundColor: p('#f0f0f0', c.border), marginVertical: 6 },

  bottomWrap: { paddingTop: 6, paddingHorizontal: 16 },
  closeBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14 },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
};
