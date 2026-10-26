import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Keyboard, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { deliveryService } from '../services/deliveryService';
import useSecureScreen from '../hooks/useSecureScreen';

const BRAND = '#00C29B';
// Page publique du contrat Stripe (aucun lien vers un compte ou un onboarding).
const CONTRAT_STRIPE = 'https://stripe.com/fr/legal/connect-account';

// « Recevoir mes virements » (26/10/2026) : le strict minimum demandé par
// Stripe pour verser les gains d'un livreur en France, rempli dans l'app.
// Le jeton de compte est fabriqué ici avec la clé publique (exigence Stripe
// pour une plateforme française), le serveur crée ensuite le compte.
function corpsJeton(f, pays) {
  const [jour, mois, annee] = f.dob.split('/').map((x) => parseInt(x, 10));
  const champs = {
    'account[business_type]': 'individual',
    'account[individual][first_name]': f.firstName.trim(),
    'account[individual][last_name]': f.lastName.trim(),
    'account[individual][dob][day]': String(jour),
    'account[individual][dob][month]': String(mois),
    'account[individual][dob][year]': String(annee),
    'account[individual][address][line1]': f.line1.trim(),
    'account[individual][address][postal_code]': f.postalCode.trim(),
    'account[individual][address][city]': f.city.trim(),
    'account[individual][address][country]': pays,
    'account[tos_shown_and_accepted]': 'true',
  };
  if (f.email) champs['account[individual][email]'] = f.email;
  return Object.entries(champs).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

function dateValide(dob) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim());
  if (!m) return false;
  const [j, mo, a] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  const d = new Date(a, mo - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 18 && age < 100;
}

// Saisie de la date : les barres s'ajoutent seules (JJ/MM/AAAA).
function formaterDate(txt) {
  const c = txt.replace(/\D/g, '').slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

export default function PayoutSetupScreen({ navigation }) {
  const { t } = useLanguage();
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
    envoiEnCours.current = true;
    setEnvoi(true);
    try {
      const rep = await fetch('https://api.stripe.com/v1/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${etat.publishable_key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpsJeton(f, etat.country || 'FR'),
      });
      const jeton = await rep.json();
      if (!rep.ok || !jeton?.id) {
        Alert.alert(t('error'), jeton?.error?.message || t('stripeSetupError'));
        return;
      }
      const d = await deliveryService.submitPayoutSetup({
        account_token: jeton.id,
        iban: ibanSaisi,
        iban_holder_name: `${f.firstName.trim()} ${f.lastName.trim()}`,
      });
      setEtat((x) => ({ ...x, ...d }));
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
      <TextInput style={s.input} placeholderTextColor="#bbb" value={f[cle]} onChangeText={maj(cle)} {...props} />
    </>
  );

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('payoutSetupTitle')}</Text>
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
              <Ionicons name={accepte ? 'checkbox' : 'square-outline'} size={22} color={accepte ? BRAND : '#999'} style={{ marginRight: 10 }} />
              <Text style={s.checkTxt}>
                {t('stripeTermsAccept')}{' '}
                <Text style={s.link} onPress={() => Linking.openURL(CONTRAT_STRIPE)}>{t('stripeTermsLink')}</Text>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  body: { padding: 16, paddingBottom: 20 },
  info: { fontSize: 13, color: '#888', paddingHorizontal: 4, marginBottom: 16, lineHeight: 18 },
  okCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6faf5', borderRadius: 12, padding: 12, marginBottom: 12 },
  okTxt: { color: BRAND, fontWeight: '800', fontSize: 14, flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: '#111', fontWeight: '600', marginBottom: 14, letterSpacing: 0.5 },
  hint: { fontSize: 12, color: '#888', marginTop: -8, marginBottom: 14, paddingHorizontal: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, marginBottom: 8 },
  checkTxt: { flex: 1, fontSize: 13, color: '#333', lineHeight: 19 },
  link: { color: BRAND, fontWeight: '700', textDecorationLine: 'underline' },
  btnRow: { paddingHorizontal: 16, paddingBottom: 20, backgroundColor: '#f5f5f5' },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
