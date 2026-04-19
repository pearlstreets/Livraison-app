import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';

export default function EditIbanScreen({ navigation }) {
  const { t } = useLanguage();
  const { currentIban, setCurrentIban } = useAuth();
  const insets = useSafeAreaInsets();
  const [newTitulaire, setNewTitulaire] = useState('');
  const [newIban, setNewIban] = useState('');
  const [newBic, setNewBic] = useState('');

  function handleSave() {
    if (!newIban.trim() || !newTitulaire.trim()) return;
    Keyboard.dismiss();
    const masked = newIban.trim().slice(0, 4) + ' •••• •••• •••• •••• •••• ' + newIban.trim().slice(-2);
    Alert.alert(t('confirmChange'), `Nouveau compte :\n${newTitulaire.trim()}\n${newIban.trim()}`, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), onPress: () => { setCurrentIban(masked); navigation.goBack(); } },
    ]);
  }

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('paymentMethod')}</Text>
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

        <Text style={s.info}>Les versements sont effectués chaque semaine sur ce compte bancaire.</Text>

        <View style={s.divider} />
        <Text style={s.sectionTitle}>{t('changeBankAccount')}</Text>

        <Text style={s.fieldLabel}>{t('accountHolder')}</Text>
        <TextInput
          style={s.input}
          placeholder="Nom et prénom du titulaire"
          placeholderTextColor="#bbb"
          value={newTitulaire}
          onChangeText={setNewTitulaire}
          autoCapitalize="words"
        />

        <Text style={s.fieldLabel}>IBAN</Text>
        <TextInput
          style={s.input}
          placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
          placeholderTextColor="#bbb"
          value={newIban}
          onChangeText={setNewIban}
          autoCapitalize="characters"
          keyboardType="default"
        />

        <Text style={s.fieldLabel}>BIC / SWIFT</Text>
        <TextInput
          style={s.input}
          placeholder="BNPAFRPPXXX"
          placeholderTextColor="#bbb"
          value={newBic}
          onChangeText={setNewBic}
          autoCapitalize="characters"
        />

        <View style={s.warning}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#f5a623" style={{ marginRight: 8 }} />
          <Text style={s.warningTxt}>Le nouveau compte sera vérifié sous 24-48h avant activation.</Text>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  body: { padding: 16, paddingBottom: 20 },
  currentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  currentIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e6faf5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  currentLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  currentValue: { fontSize: 16, fontWeight: '800', color: '#111', marginTop: 2, letterSpacing: 0.5 },
  activeBadge: { backgroundColor: '#e6faf5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  activeTxt: { color: BRAND, fontWeight: '800', fontSize: 12 },
  info: { fontSize: 13, color: '#888', paddingHorizontal: 4, marginBottom: 16, lineHeight: 18 },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: '#111', fontWeight: '600', marginBottom: 14, letterSpacing: 0.5 },
  warning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff8e6', borderRadius: 10, padding: 12, marginTop: 4 },
  warningTxt: { fontSize: 12, color: '#b37400', fontWeight: '600', flex: 1, lineHeight: 16 },
  btnRow: { paddingHorizontal: 16, paddingBottom: 20, backgroundColor: '#f5f5f5' },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
