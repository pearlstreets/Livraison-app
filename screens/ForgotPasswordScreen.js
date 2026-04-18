import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { authService } from '../services/authService';
import { isValidEmail } from '../utils/validation';

const BRAND = '#00C29B';

// Three-step flow:
//   'email'    → collect email, POST /forgot-password/ to send an OTP
//   'reset'    → collect OTP + new password, POST /reset-password/
//   'done'     → success, navigate back to login
export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      Alert.alert(t('error'), t('errorInvalidEmail'));
      return;
    }
    setLoading(true);
    try {
      await authService.forgotPassword(cleanEmail);
      setStep('reset');
    } catch {
      // Backend always returns success-looking messages for security (to
      // avoid leaking which emails are registered), so we just move on.
      setStep('reset');
    } finally {
      setLoading(false);
    }
  }

  async function submitReset() {
    if (!otp.trim() || otp.trim().length < 4) {
      Alert.alert(t('error'), t('forgotOtpRequired'));
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert(t('error'), t('errorPasswordLength'));
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert(t('error'), t('errorPasswordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword({
        email: email.trim(),
        otp: otp.trim(),
        password: newPwd,
      });
      setStep('done');
    } catch (err) {
      Alert.alert(t('error'), t('forgotResetFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('forgotTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {step === 'email' && (
          <>
            <Text style={s.subtitle}>{t('forgotSubtitle')}</Text>
            <Text style={s.label}>{t('email')}</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('loginEmail')}
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={[s.btn, loading && { opacity: 0.6 }]} onPress={sendOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('forgotSendOtp')}</Text>}
            </Pressable>
          </>
        )}

        {step === 'reset' && (
          <>
            <Text style={s.subtitle}>{t('forgotOtpSent')}</Text>
            <Text style={s.label}>{t('forgotOtpLabel')}</Text>
            <TextInput
              style={s.input}
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              maxLength={8}
            />
            <Text style={s.label}>{t('newPassword')}</Text>
            <View style={s.pwdRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="••••••••"
                placeholderTextColor="#aaa"
                secureTextEntry={!showNew}
                autoComplete="off"
                textContentType="oneTimeCode"
              />
              <Pressable onPress={() => setShowNew(v => !v)} style={s.eyeBtn}>
                <Ionicons name={showNew ? 'eye-off' : 'eye'} size={22} color="#888" />
              </Pressable>
            </View>
            <Text style={s.label}>{t('confirmPassword')}</Text>
            <TextInput
              style={s.input}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              placeholder="••••••••"
              placeholderTextColor="#aaa"
              secureTextEntry={!showNew}
              autoComplete="off"
              textContentType="oneTimeCode"
            />
            <Pressable style={[s.btn, loading && { opacity: 0.6 }]} onPress={submitReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('forgotResetBtn')}</Text>}
            </Pressable>
            <Pressable onPress={() => setStep('email')} style={s.linkBtn}>
              <Text style={s.linkTxt}>{t('forgotResendOtp')}</Text>
            </Pressable>
          </>
        )}

        {step === 'done' && (
          <View style={s.doneWrap}>
            <Ionicons name="checkmark-circle" size={64} color={BRAND} />
            <Text style={s.doneTitle}>{t('forgotDoneTitle')}</Text>
            <Text style={s.doneSubtitle}>{t('forgotDoneMsg')}</Text>
            <Pressable style={s.btn} onPress={() => navigation.goBack()}>
              <Text style={s.btnTxt}>{t('pendingBackLogin')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  subtitle: { color: '#6B7280', fontSize: 14, marginBottom: 20, lineHeight: 20 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', marginBottom: 4 },
  pwdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eyeBtn: { paddingHorizontal: 10, paddingVertical: 10, marginLeft: 6 },
  btn: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  linkBtn: { alignItems: 'center', paddingVertical: 14 },
  linkTxt: { color: BRAND, fontWeight: '700', fontSize: 14 },
  doneWrap: { alignItems: 'center', paddingTop: 48 },
  doneTitle: { fontSize: 22, fontWeight: '900', color: '#111', marginTop: 16, marginBottom: 8 },
  doneSubtitle: { color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
});
