import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatDayMonth } from '../lib/i18nFormat';
import { ecranDeplie, largeurMoitie } from '../utils/deuxEcrans';
import { useTheme } from '../contexts/ThemeContext';

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
  maximum: 'cashoutErrMax',
  stripe_indisponible: 'cashoutErrStripe',
  erreur: 'cashoutErrGeneric',
};

// Texte du motif pour lequel le virement instantané n'est pas possible, ou null.
export function instantBlockedMessage(wallet, balanceCents, t, fmtPrice) {
  const i = wallet?.instant;
  if (!i) return null;
  if (!i.available) return t(MESSAGE_REFUS[i.reason] || 'cashoutErrOff');
  // Limites du serveur seulement : une valeur absente ne bloque rien ici (le
  // serveur tranchera et donnera son motif).
  if (i.remainingToday != null && i.remainingToday <= 0) {
    return i.maxPerDay != null ? t('cashoutErrLimit', { max: i.maxPerDay }) : t('cashoutErrGeneric');
  }
  if (i.minBalanceEur != null && balanceCents / 100 < i.minBalanceEur) return t('cashoutErrMin', { min: fmtPrice(i.minBalanceEur) });
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
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState('confirm'); // confirm | processing | result
  const [result, setResult] = useState(null);
  // Montants figés à l'ouverture : le solde peut bouger pendant le virement.
  const [snapshot, setSnapshot] = useState({ balance: 0, fee: null });

  useEffect(() => {
    if (visible) {
      setStep('confirm');
      setResult(null);
      // Solde illisible : 0 plutôt que NaN.
      setSnapshot({ balance: Number.isFinite(Number(currentEarningsCents)) ? Number(currentEarningsCents) / 100 : 0, fee: wallet?.instant?.feeEur ?? null });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frais inconnus (non fournis par le serveur) : lignes frais et montant reçu masquées.
  const feeKnown = snapshot.fee != null;
  const receive = Math.max(snapshot.balance - (snapshot.fee || 0), 0);

  // Un seul virement par appui, même si le bouton est touché deux fois très vite.
  const envoiEnCours = useRef(false);
  // Écran quitté pendant le virement : plus de mise à jour d'état.
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);
  async function confirm() {
    if (envoiEnCours.current) return;
    envoiEnCours.current = true;
    setStep('processing');
    let r;
    try {
      r = await cashOut();
    } catch {
      // Exception sans réponse lisible : le virement a pu partir, on invite à
      // vérifier les versements au lieu d'affirmer « non envoyé ».
      r = { ok: false, code: 'reseau' };
    } finally {
      envoiEnCours.current = false;
    }
    if (!monte.current) return;
    setResult(r || { ok: false, code: 'reseau' });
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
    } else if (result.code === 'reseau') {
      // Réponse perdue (réseau, délai) : le virement a pu partir, on ne dit
      // pas « non envoyé » mais on invite à vérifier les versements.
      icon = 'time-outline';
      title = t('cashoutCheckTitle');
      desc = t('cashoutCheckDesc');
    } else {
      icon = 'alert-circle';
      title = t('cashoutNotSent');
      // Limite et minimum réels (réponse du refus, sinon portefeuille) ; sans
      // valeur connue, message générique plutôt qu'un chiffre inventé.
      const max = result.max ?? wallet?.instant?.maxPerDay ?? null;
      const min = result.min ?? wallet?.instant?.minBalanceEur ?? null;
      let cle = MESSAGE_REFUS[result.code] || 'cashoutErrGeneric';
      const maxMontant = result.maxAmount ?? null;
      if ((cle === 'cashoutErrLimit' && max == null) || (cle === 'cashoutErrMin' && min == null)
        || (cle === 'cashoutErrMax' && maxMontant == null)) cle = 'cashoutErrGeneric';
      desc = t(cle, {
        max: cle === 'cashoutErrMax' ? fmtPrice(maxMontant) : max,
        min: min != null ? fmtPrice(min) : null,
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
                {feeKnown && (
                  <View style={s.row}>
                    <Text style={s.rowLabel}>{t('instantFeeLabel')}</Text>
                    <Text style={s.rowValue}>- {fmtPrice(snapshot.fee)}</Text>
                  </View>
                )}
                {feeKnown && (
                  <View style={[s.row, s.rowTotal]}>
                    <Text style={[s.rowLabel, s.bold]}>{t('instantYouReceive')}</Text>
                    <Text style={[s.rowValue, s.total]}>{fmtPrice(receive)}</Text>
                  </View>
                )}
              </View>
              <Text style={s.desc}>{t('instantCashoutDesc', { account: accountLabel })}</Text>
              <Pressable style={s.btnPrimary} onPress={confirm} disabled={step !== 'confirm'}>
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

// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  overlay: { flex: 1, backgroundColor: p('rgba(0,0,0,0.5)', c.overlay), justifyContent: 'flex-end' },
  popup: { backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: p('#f0f0f0', c.border), alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: c.text, marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 15, color: p('#666', c.textMuted), textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  rows: { width: '100%', backgroundColor: p('#f8f8f8', c.border), borderRadius: 14, padding: 14, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowTotal: { borderTopWidth: 1, borderTopColor: p('#e8e8e8', c.borderStrong), marginTop: 4, paddingTop: 10 },
  rowLabel: { fontSize: 14, color: p('#666', c.textMuted), flex: 1 },
  rowValue: { fontSize: 15, fontWeight: '700', color: c.text, flexShrink: 0, marginLeft: 12 },
  bold: { fontWeight: '800', color: c.text },
  total: { fontSize: 18, fontWeight: '900', color: BRAND },
  btnPrimary: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', width: '100%', marginBottom: 10 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnCancel: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  btnCancelTxt: { color: p('#666', c.textMuted), fontWeight: '700', fontSize: 15 },
  });
};
