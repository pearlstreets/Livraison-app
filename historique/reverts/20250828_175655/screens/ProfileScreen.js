import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import api from '../components/api';
import * as Notifications from 'expo-notifications';

const BRAND = '#00C29B';
export default function ProfileScreen() {
  const [earn, setEarn] = useState({ earningsCents: 0, earnings: '0.00 €' });
  async function refresh(){ setEarn(await api.getEarnings()); }
  useEffect(()=>{ refresh(); const t=setInterval(refresh,3000); return ()=>clearInterval(t); },[]);
  function withdraw(){ Alert.alert('Demande envoyée','Votre demande de virement a été transmise.'); }

  async function testNotification() {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Test Pearl Delivery', body: 'Ceci est une notification locale ✅' },
      trigger: null,
    });
  }

  return (
    <View style={{ flex:1, padding:16 }}>
      <View style={styles.card}>
        <Text style={styles.title}>Solde</Text>
        <Text style={styles.amount}>{earn.earnings}</Text>
        <Pressable style={[styles.btn, styles.fill]} onPress={withdraw}>
          <Text style={styles.btnTxt}>Demander virement</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Documents</Text>
        <Text style={{ color:'#333', marginTop:6 }}>Identité validée</Text>
        <Text style={{ color:'#333', marginTop:2 }}>Assurance en règle</Text>
      </View>
      <Pressable style={[styles.btn, styles.fill]} onPress={testNotification}>
        <Text style={styles.btnTxt}>Tester notification</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card:{ backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:12, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:2 },
  title:{ fontWeight:'800', fontSize:16 },
  amount:{ fontWeight:'900', fontSize:28, marginVertical:10 },
  btn:{ paddingVertical:14, borderRadius:14, alignItems:'center', justifyContent:'center', marginTop:10 },
  fill:{ backgroundColor:BRAND },
  btnTxt:{ color:'#fff', fontWeight:'800' }
});
