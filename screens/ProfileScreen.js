import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../components/api';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

export default function ProfileScreen({ navigation }) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { fmtPrice } = useCurrency();
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  const [earn, setEarn] = useState({ earningsCents: 0, earnings: '0.00 €' });

  // Relecture du solde : erreur rattrapée, aucune mise à jour après démontage.
  useEffect(() => {
    let actif = true;
    async function refresh() {
      try { const r = await api.getEarnings(); if (actif && r) setEarn(r); } catch (e) {}
    }
    refresh();
    const id = setInterval(refresh, 3000);
    return () => { actif = false; clearInterval(id); };
  }, []);

  function withdraw() { Alert.alert('Demande envoyée', 'Votre demande de virement a été transmise.'); }

  function confirmLogout() {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: logout },
    ]);
  }

  async function testNotification() {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Test Pearl Delivery', body: 'Ceci est une notification locale ✅' },
        trigger: null,
      });
    } catch (e) {}
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: dark ? colors.bg : undefined }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Profil */}
      <View style={s.card}>
        <View style={s.avatarRow}>
          {user?.photo ? (
            <Image source={{ uri: user.photo }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Ionicons name="person" size={32} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.pseudo}>{user?.pseudo}</Text>
            <Text style={s.name}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ')}</Text>
            <Text style={s.email}>{user?.email}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <Ionicons name="call-outline" size={16} color={dark ? colors.textMuted : '#666'} />
          <Text style={s.infoTxt}>{user?.phone}</Text>
        </View>
        <View style={s.infoRow}>
          <Ionicons name="bicycle-outline" size={16} color={dark ? colors.textMuted : '#666'} />
          <Text style={s.infoTxt}>{user?.vehicle}</Text>
        </View>
        <Pressable style={s.editBtn} onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="create-outline" size={18} color={BRAND} />
          <Text style={s.editTxt}>{t('editProfile')}</Text>
        </Pressable>
      </View>

      {/* Solde */}
      <View style={s.card}>
        <Text style={s.title}>{t('balance')}</Text>
        <Text style={s.amount}>{fmtPrice((earn.earningsCents || 0) / 100)}</Text>
        <Pressable style={[s.btn, s.fill]} onPress={withdraw}>
          <Text style={s.btnTxt}>{t('requestPayout')}</Text>
        </Pressable>
      </View>

      {/* Documents */}
      <View style={s.card}>
        <Text style={s.title}>{t('documents')}</Text>
        <Text style={{ color: dark ? colors.textSoft : '#333', marginTop: 6 }}>{t('identityVerified')}</Text>
        <Text style={{ color: dark ? colors.textSoft : '#333', marginTop: 2 }}>{t('insuranceValid')}</Text>
      </View>

      <Pressable style={[s.btn, s.fill]} onPress={testNotification}>
        <Text style={s.btnTxt}>{t('testNotification')}</Text>
      </Pressable>

      {/* Déconnexion */}
      <Pressable style={[s.btn, s.logoutBtn]} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={18} color="#e74c3c" />
        <Text style={s.logoutTxt}>{t('logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}

// Styles selon le mode : en clair, valeurs d'origine à l'identique.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  card: { backgroundColor: k('#fff', c.card), borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  title: { fontWeight: '800', fontSize: 16, ...(dark ? { color: c.text } : {}) },
  amount: { fontWeight: '900', fontSize: 28, marginVertical: 10, ...(dark ? { color: c.text } : {}) },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  fill: { backgroundColor: BRAND },
  btnTxt: { color: '#fff', fontWeight: '800' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  pseudo: { fontWeight: '900', fontSize: 18, color: k('#111', c.text) },
  name: { fontWeight: '600', fontSize: 14, color: k('#444', c.textSoft), marginTop: 1 },
  email: { color: k('#666', c.textMuted), fontSize: 14, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  infoTxt: { color: k('#444', c.textSoft), marginLeft: 8, fontSize: 14 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: k('#eee', c.border) },
  editTxt: { color: BRAND, fontWeight: '700', fontSize: 15 },
  logoutBtn: { backgroundColor: k('#fff', c.card), borderWidth: 1, borderColor: '#e74c3c', flexDirection: 'row', gap: 8, marginTop: 16 },
  logoutTxt: { color: '#e74c3c', fontWeight: '700', fontSize: 15 },
  });
};
