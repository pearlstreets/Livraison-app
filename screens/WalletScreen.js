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
import { payoutDateLabel, payoutStatusLabel, payoutTypeLabel } from '../lib/payouts';
import useSecureScreen from '../hooks/useSecureScreen';
import InstantCashoutSheet, { instantBlockedMessage, nextPayoutText } from '../components/InstantCashoutSheet';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';


export default function WalletScreen({ navigation }) {
  const { t } = useLanguage();
  const { currentEarningsCents, wallet, versements, currentIban, refreshEarnings } = useAuth();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // IBAN du compte de versement affiché en clair.
  useSecureScreen('Wallet');
  // Solde illisible : 0 (jamais NaN, et l'encaissement reste bloqué).
  const soldeCents = Number.isFinite(Number(currentEarningsCents)) ? Number(currentEarningsCents) : 0;
  const earn = { earningsCents: soldeCents, earnings: fmtPrice(soldeCents / 100) };
  // Libellé du compte bancaire dérivé du vrai IBAN (au lieu d'un ••••15 en dur).
  const bankTail = ((currentIban || '').match(/(\d{2,4})\s*$/) || [])[1] || '';
  const bankLabel = bankTail ? `••${bankTail}` : t('yourSavedAccount');
  const [encaissModal, setEncaissModal] = useState(false);
  const listeVersements = Array.isArray(versements) ? versements : [];
  const showVersements = listeVersements.slice(0, 3);
  const scrollRef = useRef(null);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Solde, frais et limites relus sur le serveur à chaque affichage.
    refreshEarnings?.();
  }, [refreshEarnings]));

  // Virement instantané : limites lues sur le serveur (3 par jour, minimum, banque).
  const blocked = instantBlockedMessage(wallet, earn.earningsCents, t, fmtPrice);
  function startEncaiss() {
    if (earn.earningsCents <= 0) return;
    if (blocked) {
      Alert.alert(t('instantCashout'), blocked);
      return;
    }
    setEncaissModal(true);
  }

  // Formulaire « Recevoir mes virements » dans l'app (26/10/2026), au lieu
  // de l'écran Stripe ; société et pays sans Stripe y gardent l'ancien parcours.
  function handleStripeConnect() {
    navigation.navigate('PayoutSetup');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle}>{t('wallet')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t('balance')}</Text>
          <View style={s.balanceRow}>
            <Text style={s.balanceAmount}>{fmtPrice((earn.earningsCents || 0) / 100)}</Text>
            <Ionicons name={dirIcon('chevron-forward')} size={22} color="#999" />
          </View>
          <Text style={s.nextPayout}>{nextPayoutText(wallet, t, fmtPrice)}</Text>
          <Pressable style={[s.encaissBtn, (earn.earningsCents <= 0 || blocked) && { opacity: 0.4 }]} onPress={startEncaiss}>
            <Ionicons name="flash" size={16} color={BRAND} />
            <Text style={s.encaissTxt}>{t('cashout')}</Text>
          </Pressable>
          {wallet?.instant?.available && wallet.instant.feeEur != null && wallet.instant.remainingToday != null && (
            <Text style={s.instantInfo}>{t('instantInfo', { fee: fmtPrice(wallet.instant.feeEur), left: wallet.instant.remainingToday })}</Text>
          )}
        </View>

        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('payoutActivity')}</Text>
        </View>

        <Text style={s.subSection}>{t('lastPayouts')}</Text>
        <View style={s.versementsCard}>
          {showVersements.map((v, i) => (
            <Pressable key={v.id ?? i} style={[s.versementRow, i < showVersements.length - 1 && s.versementBorder]} onPress={() => navigation.navigate('VersementDetail', { versement: v })}>
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
        {listeVersements.length > 3 && (
          <Pressable style={s.showAllBtn} onPress={() => navigation.navigate('VersementsList', { mode: 'activity' })}>
            <Text style={s.showAllTxt}>{t('showAll')} ({listeVersements.length})</Text>
          </Pressable>
        )}

        <View style={s.paymentMethodCard}>
          <View style={s.pmHeaderRow}>
            <Ionicons name="business-outline" size={22} color={colors.dark ? colors.textMuted : '#666'} style={{ marginRight: 12 }} />
            <Text style={s.pmTitle}>{t('paymentMethod')}</Text>
          </View>
          <View style={s.pmIbanRow}>
            <View style={s.pmIbanIcon}>
              <Ionicons name="card-outline" size={20} color={BRAND} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.pmIbanLabel}>{t('currentBankAccount')}</Text>
              <Text style={s.pmIbanValue}>{currentIban}</Text>
            </View>
          </View>
          <Pressable style={s.pmEditBtn} onPress={() => navigation.navigate('EditIban')}>
            <Ionicons name="create-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.pmEditTxt}>{t('changeBankAccount')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={s.stripeBtn}
          onPress={handleStripeConnect}
        >
          <Ionicons name="card-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.stripeBtnTxt}>{t('setupPayments')}</Text>
        </Pressable>

        <Pressable style={s.helpRow} onPress={() => navigation.navigate('Help')}>
          <Ionicons name="help-circle-outline" size={22} color={colors.dark ? colors.textMuted : '#666'} style={{ marginRight: 12 }} />
          <Text style={s.helpText}>{t('help')}</Text>
          <Ionicons name={dirIcon('chevron-forward')} size={18} color={colors.chevron} />
        </Pressable>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  balanceCard: { backgroundColor: BRAND, borderRadius: 20, padding: 20, marginHorizontal: 16, marginBottom: 24 },
  balanceLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginVertical: 4 },
  nextPayout: { color: '#fff', fontSize: 13, marginBottom: 12 },
  encaissBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' },
  encaissTxt: { fontWeight: '700', fontSize: 14, color: BRAND },
  instantInfo: { color: '#fff', fontSize: 12, marginTop: 8, fontWeight: '600' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: c.text },
  seeAll: { fontSize: 14, fontWeight: '600', color: BRAND },
  subSection: { fontSize: 14, fontWeight: '600', color: p('#666', c.textMuted), paddingHorizontal: 16, marginBottom: 8 },
  versementsCard: { backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginBottom: 20, overflow: 'hidden' },
  versementRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  versementBorder: { borderBottomWidth: 1, borderBottomColor: p('#f0f0f0', c.border) },
  versementLabel: { fontWeight: '700', fontSize: 15, color: c.text },
  versementDateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  versementDate: { color: p('#888', c.textMuted), fontSize: 13 },
  versementAmount: { fontWeight: '800', fontSize: 16, color: c.text },
  paymentMethodCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12 },
  pmHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pmTitle: { fontWeight: '700', fontSize: 15, color: c.text },
  pmIbanRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: p('#f8f8f8', c.border), borderRadius: 12, padding: 12, marginBottom: 12 },
  pmIbanIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  pmIbanLabel: { fontSize: 12, color: p('#888', c.textMuted), fontWeight: '600' },
  pmIbanValue: { fontSize: 15, fontWeight: '800', color: c.text, marginTop: 2, letterSpacing: 0.5 },
  pmEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingVertical: 12 },
  pmEditTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stripeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6772e5', borderRadius: 12, marginHorizontal: 16, marginBottom: 12, paddingVertical: 14 },
  stripeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  helpRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, marginHorizontal: 16, borderRadius: 16, padding: 16 },
  helpText: { fontWeight: '700', fontSize: 15, color: c.text, flex: 1 },

  // Popup encaissement
  overlay: { flex: 1, backgroundColor: p('rgba(0,0,0,0.5)', c.overlay), justifyContent: 'flex-end' },

  showAllBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, marginHorizontal: 16, marginBottom: 24, paddingVertical: 14, marginTop: -2 },
  showAllTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Historique virements
  sectionTitle2: { fontSize: 18, fontWeight: '900', color: c.text, paddingHorizontal: 16, marginBottom: 10, marginTop: 8 },
  virementsList: { paddingHorizontal: 16, marginBottom: 20 },
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
