import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../components/api';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [earn, setEarn] = useState({ earningsCents: 0, earnings: '0.00 €' });

  async function refresh() { setEarn(await api.getEarnings()); }
  useEffect(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); }, []);

  function withdraw() { Alert.alert('Demande envoyée', 'Votre demande de virement a été transmise.'); }

  function confirmLogout() {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: logout },
    ]);
  }

  async function testNotification() {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Test Pearl Delivery', body: 'Ceci est une notification locale ✅' },
      trigger: null,
    });
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
          <Ionicons name="call-outline" size={16} color="#666" />
          <Text style={s.infoTxt}>{user?.phone}</Text>
        </View>
        <View style={s.infoRow}>
          <Ionicons name="bicycle-outline" size={16} color="#666" />
          <Text style={s.infoTxt}>{user?.vehicle}</Text>
        </View>
        <Pressable style={s.editBtn} onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="create-outline" size={18} color={BRAND} />
          <Text style={s.editTxt}>Modifier le profil</Text>
        </Pressable>
      </View>

      {/* Solde */}
      <View style={s.card}>
        <Text style={s.title}>Solde</Text>
        <Text style={s.amount}>{earn.earnings}</Text>
        <Pressable style={[s.btn, s.fill]} onPress={withdraw}>
          <Text style={s.btnTxt}>Demander virement</Text>
        </Pressable>
      </View>

      {/* Documents */}
      <View style={s.card}>
        <Text style={s.title}>Documents</Text>
        <Text style={{ color: '#333', marginTop: 6 }}>Identité validée</Text>
        <Text style={{ color: '#333', marginTop: 2 }}>Assurance en règle</Text>
      </View>

      <Pressable style={[s.btn, s.fill]} onPress={testNotification}>
        <Text style={s.btnTxt}>Tester notification</Text>
      </Pressable>

      {/* Déconnexion */}
      <Pressable style={[s.btn, s.logoutBtn]} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={18} color="#e74c3c" />
        <Text style={s.logoutTxt}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  title: { fontWeight: '800', fontSize: 16 },
  amount: { fontWeight: '900', fontSize: 28, marginVertical: 10 },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  fill: { backgroundColor: BRAND },
  btnTxt: { color: '#fff', fontWeight: '800' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  pseudo: { fontWeight: '900', fontSize: 18, color: '#111' },
  name: { fontWeight: '600', fontSize: 14, color: '#444', marginTop: 1 },
  email: { color: '#666', fontSize: 14, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  infoTxt: { color: '#444', marginLeft: 8, fontSize: 14 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  editTxt: { color: BRAND, fontWeight: '700', fontSize: 15 },
  logoutBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e74c3c', flexDirection: 'row', gap: 8, marginTop: 16 },
  logoutTxt: { color: '#e74c3c', fontWeight: '700', fontSize: 15 },
});
