import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

export default function LoginScreen() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('error'), t('loginErrorFields'));
      return;
    }
    const ok = login(email.trim(), password);
    if (!ok) Alert.alert(t('error'), t('loginErrorCredentials'));
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.inner}>
        <Ionicons name="bicycle" size={64} color={BRAND} style={{ alignSelf: 'center', marginBottom: 8 }} />
        <Text style={s.logo}>Pearl Delivery</Text>
        <Text style={s.subtitle}>{t('loginTitle')}</Text>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          placeholder={t('loginEmail')}
          placeholderTextColor="#aaa"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <Text style={s.label}>Mot de passe</Text>
        <View style={s.pwdRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            placeholder="••••••••"
            placeholderTextColor="#aaa"
            secureTextEntry={!showPwd}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}>
            <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
          </Pressable>
        </View>

        <Pressable style={s.btn} onPress={handleLogin}>
          <Text style={s.btnTxt}>{t('loginButton')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', justifyContent: 'center' },
  inner: { marginHorizontal: 24 },
  logo: { fontSize: 28, fontWeight: '900', textAlign: 'center', color: '#111' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 32, marginTop: 4 },
  label: { fontWeight: '700', fontSize: 14, color: '#333', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4,
  },
  pwdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eyeBtn: { position: 'absolute', right: 12, padding: 4 },
  btn: {
    backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
