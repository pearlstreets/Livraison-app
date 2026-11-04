import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatDayMonth } from '../lib/i18nFormat';
import { ecranDeplie, largeurMoitie } from '../utils/deuxEcrans';

const BRAND = '#FF6A13';

// Virement instantané (04/11/2026, comme Uber Eats) : solde, frais de 0,99 €,
// montant reçu, puis le VRAI résultat du serveur. Partagé par Portefeuille et Gains.

// Motif de refus (serveur) : clé de traduction du message.
const MESSAGE_REFUS = {
  limite_jour: 'cashoutErrLimit',
  minimum: 'cashoutErrMin',
  banque_non_eligible: 'cashoutErrBank',
  compte_absent: 'cashoutErrNoAccount',
  desactive: 'cashoutErrOff',
  echec_virement: 'cashoutErrFailed',
};

// Texte du motif pour lequel le virement instantané n'est pas possible, ou null.
export function instantBlockedMessage(wallet, balanceCents, t, fmtPrice) {
  const i = wallet?.instant;
  if (!i) return null;
  if (!i.available) return t(MESSAGE_REFUS[i.reason] || 'cashoutErrOff');
  if (i.remainingToday <= 0) return t('cashoutErrLimit', { max: i.maxPerDay });
  if (balanceCents / 100 < i.minBalanceEur) return t('cashoutErrMin', { min: fmtPrice(i.minBalanceEur) });
  return null;
}

// Ligne « Prochain virement le 9 nov : 12,00 € » de la carte de solde.
export function nextPayoutText(wallet, t, fmtPrice) {
  if (!wallet) return t('weeklyAutoPayouts');
  if (!wallet.bankReady) return t('addBankToGetPaid');
  if (!wallet.nextPayoutDate) return t('weeklyAutoPayouts');
  return t('nextPayoutLine', { date: formatDayMonth(wallet.nextPayoutDate), amount: fmtPrice(wallet.nextPayoutEur || 0) });
}

export default function InstantCashoutSheet({ visible, onClose, accountLabel }) {
  const { t } = useLanguage();
  const { currentEarningsCents, wallet, cashOut } = useAuth();
  const { fmtPrice } = useCurrency();
  const [step, setStep] = useState('confirm'); // confirm | processing | result
  const [result, setResult] = useState(null);
  // Montants figés à l'ouverture : le solde peut bouger pendant le virement.
  const [snapshot, setSnapshot] = useState({ balance: 0, fee: 0.99 });

  useEffect(() => {
    if (visible) {
      setStep('confirm');
      setResult(null);
      setSnapshot({ balance: currentEarningsCents / 100, fee: wallet?.instant?.feeEur ?? 0.99 });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const receive = Math.max(snapshot.balance - snapshot.fee, 0);

  async function confirm() {
    setStep('processing');
    const r = await cashOut();
    setResult(r);
    setStep('result');
  }

  function close() {
    if (step !== 'processing') onClose();
  }

  let icon = 'checkmark-circle';
  let title = '';
  let desc = '';
  if (step === 'result' && result) {
    const montant = fmtPrice(result.amountEur || receive);
    if (result.code === 'instantane') {
      title = t('cashoutSuccess');
      desc = t('cashoutDoneDesc', { amount: montant, account: accountLabel });
    } else if (result.code === 'standard') {
      icon = 'time-outline';
      title = t('cashoutStandardTitle');
      desc = t('cashoutStandardDesc', { amount: fmtPrice(snapshot.balance) });
    } else if (result.code === 'en_attente') {
      icon = 'time-outline';
      title = t('cashoutPendingTitle');
      desc = t('cashoutPendingDesc');
    } else {
      icon = 'alert-circle';
      title = t('cashoutNotSent');
      const cle = MESSAGE_REFUS[result.code] || 'cashoutErrGeneric';
      desc = t(cle, {
        max: wallet?.instant?.maxPerDay ?? 3,
        min: fmtPrice(wallet?.instant?.minBalanceEur ?? 1.99),
      });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={s.overlay}>
        <View style={[s.popup, ecranDeplie() && { width: largeurMoitie(), alignSelf: 'center' }]}>
          {step === 'confirm' && (
            <>
              <View style={s.iconWrap}>
                <Ionicons name="flash" size={40} color={BRAND} />
              </View>
              <Text style={s.title}>{t('instantCashout')}</Text>
              <View style={s.rows}>
                <View style={s.row}>
                  <Text style={s.rowLabel}>{t('instantBalanceLabel')}</Text>
                  <Text style={s.rowValue}>{fmtPrice(snapshot.balance)}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.rowLabel}>{t('instantFeeLabel')}</Text>
                  <Text style={s.rowValue}>- {fmtPrice(snapshot.fee)}</Text>
                </View>
                <View style={[s.row, s.rowTotal]}>
                  <Text style={[s.rowLabel, s.bold]}>{t('instantYouReceive')}</Text>
                  <Text style={[s.rowValue, s.total]}>{fmtPrice(receive)}</Text>
                </View>
              </View>
              <Text style={s.desc}>{t('instantCashoutDesc', { account: accountLabel })}</Text>
              <Pressable style={s.btnPrimary} onPress={confirm}>
                <Text style={s.btnPrimaryTxt}>{t('confirmCashout')}</Text>
              </Pressable>
              <Pressable style={s.btnCancel} onPress={close}>
                <Text style={s.btnCancelTxt}>{t('cancel')}</Text>
              </Pressable>
            </>
          )}
          {step === 'processing' && (
            <>
              <View style={s.iconWrap}>
                <ActivityIndicator size="large" color={BRAND} />
              </View>
              <Text style={s.title}>{t('processing')}</Text>
              <Text style={s.desc}>{t('processingMsg')}</Text>
            </>
          )}
          {step === 'result' && (
            <>
              <View style={[s.iconWrap, { backgroundColor: BRAND + '20' }]}>
                <Ionicons name={icon} size={48} color={BRAND} />
              </View>
              <Text style={s.title}>{title}</Text>
              <Text style={s.desc}>{desc}</Text>
              <Pressable style={s.btnPrimary} onPress={close}>
                <Text style={s.btnPrimaryTxt}>{t('close')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  popup: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: '#111', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  rows: { width: '100%', backgroundColor: '#f8f8f8', borderRadius: 14, padding: 14, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowTotal: { borderTopWidth: 1, borderTopColor: '#e8e8e8', marginTop: 4, paddingTop: 10 },
  rowLabel: { fontSize: 14, color: '#666' },
  rowValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  bold: { fontWeight: '800', color: '#111' },
  total: { fontSize: 18, fontWeight: '900', color: BRAND },
  btnPrimary: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', width: '100%', marginBottom: 10 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnCancel: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  btnCancelTxt: { color: '#666', fontWeight: '700', fontSize: 15 },
});
