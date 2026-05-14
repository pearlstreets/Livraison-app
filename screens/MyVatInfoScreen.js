import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { vatService, deriveVatRegime, COUNTRIES } from '../services/vatService';

const BRAND = '#00C29B';

export default function MyVatInfoScreen({ navigation }) {
  const { t, lang } = useLanguage();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [country, setCountry] = useState('FR');
  const [vatNumber, setVatNumber] = useState('');
  const [siret, setSiret] = useState('');
  const [legalName, setLegalName] = useState('');
  const [legalAddress, setLegalAddress] = useState('');

  const [countryModal, setCountryModal] = useState(false);

  const isRTL = lang === 'ar';

  const regime = useMemo(() => deriveVatRegime(country, vatNumber), [country, vatNumber]);
  const regimeLabelKey = `vatInfo.regime.${regime}`;
  const showSiret = country === 'FR';

  const selectedCountry = useMemo(
    () => COUNTRIES.find(c => c.code === country) || { code: country, name: country },
    [country]
  );

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await vatService.getDriverMe();
      // The backend returns the driver fields either at the root or wrapped.
      const d = data?.driver || data || {};
      setCountry(String(d.country || 'FR').toUpperCase());
      setVatNumber(d.vat_number || '');
      setSiret(d.siret || '');
      setLegalName(d.legal_name || '');
      setLegalAddress(d.legal_address || '');
    } catch (e) {
      setErrorMsg(e?.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      await vatService.updateVatInfo({
        country,
        vat_number: vatNumber,
        siret: showSiret ? siret : '',
        legal_name: legalName,
        legal_address: legalAddress,
      });
      Alert.alert(t('vatInfo.savedSuccess') || 'Saved', '', [
        { text: t('ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      if (e?.code === 'VAT_PATCH_NOT_DEPLOYED') {
        Alert.alert(t('error'), t('vatInfo.patchNotDeployed') || 'Update endpoint not yet available. Please retry later.');
      } else {
        Alert.alert(t('error'), e?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }, [country, vatNumber, siret, showSiret, legalName, legalAddress, navigation, t]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, isRTL && s.rtl]}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('vatInfo.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={BRAND} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
          >
            {errorMsg && (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" style={{ marginRight: 8 }} />
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Pays */}
            <Text style={s.fieldLabel}>{t('vatInfo.country')}</Text>
            <Pressable style={s.pickerRow} onPress={() => setCountryModal(true)}>
              <Text style={s.pickerValue}>{selectedCountry.name} ({selectedCountry.code})</Text>
              <Ionicons name="chevron-down" size={18} color="#888" />
            </Pressable>

            {/* Numéro de TVA */}
            <Text style={s.fieldLabel}>{t('vatInfo.vatNumber')}</Text>
            <TextInput
              style={s.input}
              value={vatNumber}
              onChangeText={setVatNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="FR12345678901"
              placeholderTextColor="#bbb"
            />

            {/* SIRET — France only */}
            {showSiret && (
              <>
                <Text style={s.fieldLabel}>{t('vatInfo.siret')}</Text>
                <TextInput
                  style={s.input}
                  value={siret}
                  onChangeText={setSiret}
                  keyboardType="number-pad"
                  autoCorrect={false}
                  placeholder="12345678901234"
                  placeholderTextColor="#bbb"
                  maxLength={14}
                />
              </>
            )}

            {/* Raison sociale */}
            <Text style={s.fieldLabel}>{t('vatInfo.legalName')}</Text>
            <TextInput
              style={s.input}
              value={legalName}
              onChangeText={setLegalName}
              autoCapitalize="words"
              placeholder=""
              placeholderTextColor="#bbb"
            />

            {/* Adresse légale */}
            <Text style={s.fieldLabel}>{t('vatInfo.legalAddress')}</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={legalAddress}
              onChangeText={setLegalAddress}
              multiline
              numberOfLines={3}
              placeholder=""
              placeholderTextColor="#bbb"
            />

            {/* Régime calculé */}
            <View style={s.regimeCard}>
              <Ionicons name="information-circle-outline" size={18} color={BRAND} style={{ marginRight: 8 }} />
              <Text style={s.regimeText}>{t(regimeLabelKey)}</Text>
            </View>
          </ScrollView>
        )}

        <View style={s.btnRow}>
          <Pressable
            style={[s.saveBtn, (saving || loading) && { opacity: 0.5 }]}
            onPress={onSave}
            disabled={saving || loading}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.saveTxt}>{t('vatInfo.save')}</Text>
            )}
          </Pressable>
        </View>

        {/* Country picker modal */}
        <Modal visible={countryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCountryModal(false)}>
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Pressable onPress={() => setCountryModal(false)} hitSlop={8}>
                <Ionicons name="close" size={28} color="#111" />
              </Pressable>
              <Text style={s.modalTitle}>{t('vatInfo.country')}</Text>
              <View style={{ width: 28 }} />
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={item => item.code}
              renderItem={({ item }) => {
                const active = item.code === country;
                return (
                  <Pressable
                    style={[s.countryRow, active && s.countryRowActive]}
                    onPress={() => { setCountry(item.code); setCountryModal(false); }}
                  >
                    <Text style={[s.countryName, active && { color: BRAND, fontWeight: '800' }]}>{item.name}</Text>
                    <Text style={s.countryCode}>{item.code}</Text>
                    {active && <Ionicons name="checkmark-circle" size={20} color={BRAND} style={{ marginLeft: 8 }} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  rtl: { direction: 'rtl' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111', textAlign: 'center', flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 24 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { color: '#b91c1c', fontSize: 13, fontWeight: '600', flex: 1 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0',
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: '#111', fontWeight: '600',
    marginBottom: 14,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0',
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14,
  },
  pickerValue: { fontSize: 15, color: '#111', fontWeight: '600' },

  regimeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#e6faf5', borderRadius: 12, padding: 12, marginTop: 4,
  },
  regimeText: { color: '#054', fontSize: 13, fontWeight: '700', flex: 1 },

  btnRow: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8, backgroundColor: '#f5f5f5' },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  countryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  countryRowActive: { backgroundColor: '#e6faf5' },
  countryName: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1 },
  countryCode: { fontSize: 13, fontWeight: '700', color: '#888' },
});
