import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import useSecureScreen from '../hooks/useSecureScreen';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

export default function EditIbanScreen({ navigation }) {
  const { t } = useLanguage();
  const { currentIban, setCurrentIban, updateUser } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // IBAN, BIC et titulaire du compte.
  useSecureScreen('EditIban');
  const [newTitulaire, setNewTitulaire] = useState('');
  const [newIban, setNewIban] = useState('');
  const [newBic, setNewBic] = useState('');
  const envoiEnCours = useRef(false);

  // Enregistre sur le serveur, puis seulement en cas de succès met à jour
  // l'IBAN affiché. Refus du serveur (course en cours, compte en attente de
  // validation...) : son message est affiché et rien ne change.
  async function enregistrer(iban, masked) {
    if (envoiEnCours.current) return;
    envoiEnCours.current = true;
    try {
      const res = await updateUser({ iban, bic: newBic.trim(), iban_holder_name: newTitulaire.trim() });
      if (res?.revalidation_requise) {
        // Compte remis en vérification par le serveur : on affiche son message.
        Alert.alert(t('saved'), res.message || t('newAccountVerifyInfo'), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
        return;
      }
      setCurrentIban(masked);
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('error'), e?.serverMessage || (e?.isNetworkError ? t('errorNetwork') : t('genericError')));
    } finally {
      envoiEnCours.current = false;
    }
  }

  function handleSave() {
    if (!newIban.trim() || !newTitulaire.trim()) return;
    Keyboard.dismiss();
    const iban = newIban.trim().replace(/\s+/g, '');
    const masked = iban.slice(0, 4) + ' •••• •••• •••• •••• •••• ' + iban.slice(-2);
    Alert.alert(t('confirmChange'), t('newAccountDetails', { holder: newTitulaire.trim(), iban: newIban.trim() }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), onPress: () => { enregistrer(iban, masked); } },
    ]);
  }

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{t('paymentMethod')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* IBAN actuel */}
        <View style={s.currentCard}>
          <View style={s.currentIcon}>
            <Ionicons name="card-outline" size={24} color={BRAND} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.currentLabel}>{t('currentBankAccount')}</Text>
            <Text style={s.currentValue}>{currentIban}</Text>
          </View>
          <View style={s.activeBadge}>
            <Text style={s.activeTxt}>{t('active')}</Text>
          </View>
        </View>

        <Text style={s.info}>{t('payoutsWeeklyInfo')}</Text>

        <View style={s.divider} />
        <Text style={s.sectionTitle}>{t('changeBankAccount')}</Text>

        <Text style={s.fieldLabel}>{t('accountHolder')}</Text>
        <TextInput
          style={s.input}
          placeholder={t('accountHolderName')}
          placeholderTextColor={colors.dark ? colors.textFaint : '#bbb'}
          value={newTitulaire}
          onChangeText={setNewTitulaire}
          autoCapitalize="words"
        />

        <Text style={s.fieldLabel}>{t('ibanLabel')}</Text>
        <TextInput
          style={s.input}
          placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
          placeholderTextColor={colors.dark ? colors.textFaint : '#bbb'}
          value={newIban}
          onChangeText={setNewIban}
          autoCapitalize="characters"
          keyboardType="default"
        />

        <Text style={s.fieldLabel}>{t('bicLabel')}</Text>
        <TextInput
          style={s.input}
          placeholder="BNPAFRPPXXX"
          placeholderTextColor={colors.dark ? colors.textFaint : '#bbb'}
          value={newBic}
          onChangeText={setNewBic}
          autoCapitalize="characters"
        />

        <View style={s.warning}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#f5a623" style={{ marginRight: 8 }} />
          <Text style={s.warningTxt}>{t('newAccountVerifyInfo')}</Text>
        </View>
      </ScrollView>

      <View style={s.btnRow}>
        <Pressable
          style={[s.saveBtn, (!newIban.trim() || !newTitulaire.trim()) && { opacity: 0.4 }]}
          onPress={handleSave}
        >
          <Text style={s.saveTxt}>{t('saveNewIban')}</Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: p('#f0f0f0', c.border) },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  body: { padding: 16, paddingBottom: 20 },
  currentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  currentIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  currentLabel: { fontSize: 13, color: p('#888', c.textMuted), fontWeight: '600' },
  currentValue: { fontSize: 16, fontWeight: '800', color: c.text, marginTop: 2, letterSpacing: 0.5 },
  activeBadge: { backgroundColor: c.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, flexShrink: 0 },
  activeTxt: { color: BRAND, fontWeight: '800', fontSize: 12 },
  info: { fontSize: 13, color: p('#888', c.textMuted), paddingHorizontal: 4, marginBottom: 16, lineHeight: 18 },
  divider: { height: 1, backgroundColor: c.borderStrong, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: c.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: p('#555', c.textSoft), marginBottom: 6 },
  input: { backgroundColor: c.input, borderRadius: 12, borderWidth: 1, borderColor: p('#e0e0e0', c.inputBorder), paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: c.text, fontWeight: '600', marginBottom: 14, letterSpacing: 0.5 },
  warning: { flexDirection: 'row', alignItems: 'center', backgroundColor: p('#fff8e6', '#3a2e12'), borderRadius: 10, padding: 12, marginTop: 4 },
  warningTxt: { fontSize: 12, color: p('#b37400', '#f5c26b'), fontWeight: '600', flex: 1, lineHeight: 16 },
  btnRow: { paddingHorizontal: 16, paddingBottom: 20, backgroundColor: c.bg },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
};
