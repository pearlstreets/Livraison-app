import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Keyboard, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { deliveryService } from '../services/deliveryService';
import useSecureScreen from '../hooks/useSecureScreen';
import { contratStripe, creerJetonCompte, dateValide, formaterDate } from '../utils/stripeCompte';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

// « Recevoir mes virements » (26/10/2026) : le strict minimum demandé par
// Stripe pour verser les gains d'un livreur en France, rempli dans l'app.

export default function PayoutSetupScreen({ navigation }) {
  const { t, lang } = useLanguage();
  const { refreshEarnings, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  useSecureScreen('PayoutSetup');
  const [etat, setEtat] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [accepte, setAccepte] = useState(false);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', dob: '', line1: '', postalCode: '', city: '', iban: '' });
  const envoiEnCours = useRef(false);
  const maj = (cle) => (v) => setF((x) => ({ ...x, [cle]: cle === 'dob' ? formaterDate(v) : v }));

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const d = await deliveryService.getPayoutSetup();
      setEtat(d);
      const p = d?.prefill || {};
      setF((x) => ({ ...x, firstName: p.first_name || '', lastName: p.last_name || '', email: p.email || '', line1: p.address_line1 || '' }));
    } catch {
      setEtat(null);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Société ou pays sans Stripe : parcours d'avant, inchangé.
  async function parcoursAvant() {
    try {
      const res = await deliveryService.requestStripeConnect();
      if (res && typeof res.url === 'string' && /^https:\/\//i.test(res.url)) {
        await Linking.openURL(res.url);
      } else if (res && res.payout_method === 'sepa_manual') {
        Alert.alert(t('bankTransferPayouts'), t('noStripeConnectMsg'));
      } else {
        // Réponse sans lien ni mode connu : le livreur est prévenu au lieu d'un bouton sans effet.
        Alert.alert(t('error'), t('stripeSetupError'));
      }
    } catch {
      Alert.alert(t('error'), t('stripeSetupError'));
    }
  }

  const ibanSaisi = f.iban.replace(/\s+/g, '');
  const ibanOk = ibanSaisi.length >= 15 || (!ibanSaisi && !!etat?.prefill?.iban_last4);
  const complet = f.firstName.trim() && f.lastName.trim() && f.dob.length === 10 && f.line1.trim()
    && f.postalCode.trim() && f.city.trim() && ibanOk && accepte;

  async function valider() {
    if (!complet || envoiEnCours.current) return;
    Keyboard.dismiss();
    if (!dateValide(f.dob)) { Alert.alert(t('error'), t('payoutSetupInvalidDob')); return; }
    // Sans clé Stripe du serveur, impossible de créer le jeton : message clair.
    if (!etat?.publishable_key) { Alert.alert(t('error'), t('stripeSetupError')); return; }
    envoiEnCours.current = true;
    setEnvoi(true);
    try {
      const jeton = await creerJetonCompte(etat.publishable_key, f, etat.country || 'FR');
      if (!jeton.id) {
        Alert.alert(t('error'), jeton.erreur || t('stripeSetupError'));
        return;
      }
      const d = await deliveryService.submitPayoutSetup({
        account_token: jeton.id,
        iban: ibanSaisi,
        iban_holder_name: `${f.firstName.trim()} ${f.lastName.trim()}`,
      });
      setEtat((x) => ({ ...x, ...d }));
      // Revenus et profil relus : le portefeuille montre tout de suite le nouvel état.
      Promise.resolve(refreshEarnings?.()).catch(() => {});
      Promise.resolve(refreshProfile?.()).catch(() => {});
      Alert.alert(t('saved'), d?.payouts_enabled ? t('payoutSetupDone') : t('payoutSetupPending'), [
        { text: t('ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      // 400 : IBAN invalide ; 422 : refus de Stripe, son message s'il en donne un.
      const msg = e?.status === 400 ? t('payoutSetupIbanRefused')
        : e?.status === 422 ? (e?.serverMessage || t('payoutSetupIbanRefused'))
          : (e?.isNetworkError ? t('errorNetwork') : t('stripeSetupError'));
      Alert.alert(t('error'), msg);
    } finally {
      envoiEnCours.current = false;
      setEnvoi(false);
    }
  }

  const champ = (label, cle, props = {}) => (
    <>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={colors.dark ? colors.textFaint : '#bbb'} value={f[cle]} onChangeText={maj(cle)} {...props} />
    </>
  );

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{t('payoutSetupTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {chargement ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={BRAND} />
      ) : !etat ? (
        <View style={s.body}>
          <Text style={s.info}>{t('stripeSetupError')}</Text>
          <Pressable style={s.saveBtn} onPress={charger}><Text style={s.saveTxt}>{t('retry')}</Text></Pressable>
        </View>
      ) : etat.mode !== 'form' ? (
        <View style={s.body}>
          <Text style={s.info}>{t('payoutSetupIntro')}</Text>
          <Pressable style={s.saveBtn} onPress={parcoursAvant}><Text style={s.saveTxt}>{t('setupPayments')}</Text></Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {etat.payouts_enabled ? (
              <View style={s.okCard}>
                <Ionicons name="checkmark-circle" size={22} color={BRAND} style={{ marginRight: 10 }} />
                <Text style={s.okTxt}>{t('payoutsActive')}</Text>
              </View>
            ) : null}
            <Text style={s.info}>{t('payoutSetupIntro')}</Text>

            {champ(t('firstName'), 'firstName', { placeholder: t('firstNamePlaceholder'), autoCapitalize: 'words' })}
            {champ(t('lastName'), 'lastName', { placeholder: t('lastNamePlaceholder'), autoCapitalize: 'words' })}
            {champ(t('birthDate'), 'dob', { placeholder: t('birthDatePlaceholder'), keyboardType: 'number-pad', maxLength: 10 })}
            {champ(t('streetAddress'), 'line1', { placeholder: '12 rue de la Paix', autoCapitalize: 'words' })}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>{champ(t('postalCode'), 'postalCode', { placeholder: '75002', keyboardType: 'number-pad', maxLength: 10 })}</View>
              <View style={{ flex: 2 }}>{champ(t('city'), 'city', { placeholder: 'Paris', autoCapitalize: 'words' })}</View>
            </View>
            {champ(t('ibanLabel'), 'iban', { placeholder: 'FR76 XXXX XXXX XXXX XXXX XXXX XXX', autoCapitalize: 'characters', autoCorrect: false })}
            {!ibanSaisi && etat.prefill?.iban_last4 ? (
              <Text style={s.hint}>{t('payoutSetupKeepIban', { last4: etat.prefill.iban_last4 })}</Text>
            ) : null}

            <Pressable style={s.checkRow} onPress={() => setAccepte((v) => !v)}>
              <Ionicons name={accepte ? 'checkbox' : 'square-outline'} size={22} color={accepte ? BRAND : colors.textFaint} style={{ marginRight: 10 }} />
              <Text style={s.checkTxt}>
                {t('stripeTermsAccept')}{' '}
                <Text style={s.link} onPress={() => Linking.openURL(contratStripe(lang)).catch(() => {})}>{t('stripeTermsLink')}</Text>
              </Text>
            </Pressable>
          </ScrollView>

          <View style={s.btnRow}>
            <Pressable style={[s.saveBtn, (!complet || envoi) && { opacity: 0.4 }]} onPress={valider} disabled={!complet || envoi}>
              {envoi ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('payoutSetupSubmit')}</Text>}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// Fond blanc et champs au style de l'app pro (26/10/2026).
// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: p('#fff', c.bg) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: p('#fff', c.card), borderBottomWidth: 1, borderBottomColor: p('#f0f0f0', c.border) },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  body: { padding: 20, paddingBottom: 20 },
  info: { fontSize: 13, color: c.textMuted, marginBottom: 18, lineHeight: 19 },
  okCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.cardAlt, borderRadius: 10, padding: 12, marginBottom: 14 },
  okTxt: { color: BRAND, fontWeight: '700', fontSize: 14, flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: c.text, marginBottom: 5 },
  input: { height: 45, backgroundColor: c.input, borderRadius: 10, borderWidth: 1, borderColor: p('rgba(0,0,0,0.15)', c.inputBorder), paddingHorizontal: 10, fontSize: 13, color: c.text, marginBottom: 14 },
  hint: { fontSize: 12, color: c.textMuted, marginTop: -8, marginBottom: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, marginBottom: 8 },
  checkTxt: { flex: 1, fontSize: 13, color: p('#333', c.textSoft), lineHeight: 19 },
  link: { color: BRAND, fontWeight: '700', textDecorationLine: 'underline' },
  btnRow: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, backgroundColor: p('#fff', c.bg) },
  saveBtn: { height: 46, backgroundColor: BRAND, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  });
};
