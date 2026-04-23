import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { authService } from '../services/authService';
import { isValidEmail, isStrongPassword } from '../utils/validation';

const BRAND = '#00C29B';

// 3 internal steps: 'email' → send code via email | 'reset' → enter code + new
// password | 'done' → success confirmation. Wired to authService.forgotPassword
// and authService.resetPassword (services/authService.js:154-165).
export default function ForgotPasswordScreen({ onBack }) {
  const { t } = useLanguage();
  const [stage, setStage] = useState('email'); // 'email' | 'reset' | 'done'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const mapHttpError = (err) => {
    const status = err?.response?.status;
    if (status === 404) return t('forgotEmailNotFound');
    if (status === 401) return t('forgotCodeInvalid');
    if (status === 429) return t('forgotRateLimit');
    if (status === 400) return t('forgotBadRequest');
    if (!status) return t('forgotNetworkError');
    return t('forgotUnexpectedError');
  };

  const handleSendCode = async () => {
    setError(''); setInfo('');
    const trimmed = email.trim();
    if (!trimmed) { setError(t('errorNoEmail')); return; }
    if (!isValidEmail(trimmed)) { setError(t('errorInvalidEmail')); return; }
    setLoading(true);
    try {
      await authService.forgotPassword(trimmed);
      setInfo(t('forgotCodeSent'));
      setStage('reset');
    } catch (e) {
      setError(mapHttpError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError(''); setInfo('');
    if (code.trim().length < 4) { setError(t('otpCodeTooShort')); return; }
    if (!isStrongPassword(newPwd)) { setError(t('errorPasswordWeak')); return; }
    if (newPwd !== confirmPwd) { setError(t('errorPasswordMismatch')); return; }
    setLoading(true);
    try {
      await authService.resetPassword({
        email: email.trim(),
        otp: code.trim(),
        new_password: newPwd,
      });
      setStage('done');
    } catch (e) {
      setError(mapHttpError(e));
    } finally {
      setLoading(false);
    }
  };

  // Success screen — confirms reset and returns user to login.
  if (stage === 'done') {
    return (
      <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
        <ScrollView contentContainerStyle={{flexGrow:1, justifyContent:'center', paddingHorizontal:32}}>
          <View style={{alignItems:'center'}}>
            <View style={{width:80, height:80, borderRadius:40, backgroundColor:'#DCFCE7', alignItems:'center', justifyContent:'center', marginBottom:24}}>
              <Ionicons name="checkmark-circle-outline" size={48} color={BRAND} />
            </View>
            <Text style={{fontSize:22, fontWeight:'900', color:'#111', textAlign:'center', marginBottom:12}}>
              {t('forgotSuccessTitle')}
            </Text>
            <Text style={{fontSize:15, color:'#6B7280', textAlign:'center', lineHeight:22, marginBottom:24}}>
              {t('forgotSuccessMsg')}
            </Text>
            <Pressable onPress={onBack}
              style={{height:52, borderRadius:14, backgroundColor:BRAND, alignItems:'center', justifyContent:'center', width:'100%'}}>
              <Text style={{color:'#fff', fontWeight:'700', fontSize:16}}>{t('forgotBackToLogin')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex:1, backgroundColor:'#fff'}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{flex:1}}>
        <TouchableOpacity onPress={onBack} style={{paddingHorizontal:16, paddingTop:12}}>
          <Ionicons name="arrow-back" size={26} color="#111" />
        </TouchableOpacity>

        <View style={{alignItems:'center', paddingTop:16, paddingBottom:8}}>
          <Ionicons name="lock-closed-outline" size={44} color={BRAND} style={{marginBottom:6}} />
          <Text style={{fontSize:20, fontWeight:'900', color:'#111'}}>{t('forgotTitle')}</Text>
        </View>

        <ScrollView contentContainerStyle={{flexGrow:1, justifyContent:'center', paddingHorizontal:24, paddingVertical:20}} keyboardShouldPersistTaps="handled">
          <Text style={{fontSize:13, color:'#6B7280', textAlign:'center', marginBottom:20}}>
            {stage === 'email' ? t('forgotSubtitleEmail') : t('forgotSubtitleReset')}
          </Text>

          {error ? (
            <View style={{backgroundColor:'#FEE2E2', borderRadius:10, padding:12, marginBottom:16, flexDirection:'row', alignItems:'center'}}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={{color:'#EF4444', fontSize:13, marginLeft:8, flex:1}}>{error}</Text>
            </View>
          ) : null}

          {info ? (
            <View style={{backgroundColor:'#DCFCE7', borderRadius:10, padding:12, marginBottom:16, flexDirection:'row', alignItems:'center'}}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <Text style={{color:'#16A34A', fontSize:13, marginLeft:8, flex:1}}>{info}</Text>
            </View>
          ) : null}

          {stage === 'email' && (
            <>
              <Text style={s.label}>{t('forgotEmailLabel')}</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder={t('loginEmail')} placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <Pressable style={[s.btn, loading && { opacity: 0.5 }]} onPress={handleSendCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('forgotSendCode')}</Text>}
              </Pressable>
            </>
          )}

          {stage === 'reset' && (
            <>
              <Text style={s.label}>{t('forgotCodeLabel')}</Text>
              <TextInput
                style={[s.input, {fontSize:22, letterSpacing:8, textAlign:'center'}]}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor="#aaa"
                keyboardType="number-pad"
                maxLength={8}
              />
              <Text style={s.label}>{t('forgotNewPwd')}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, {flex:1, marginBottom:0}]} value={newPwd} onChangeText={setNewPwd} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Text style={s.label}>{t('forgotConfirmNewPwd')}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, {flex:1, marginBottom:0}]} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showConfirm} autoComplete="off" textContentType="oneTimeCode" />
                <Pressable onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Pressable style={[s.btn, loading && { opacity: 0.5 }]} onPress={handleReset} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('forgotResetBtn')}</Text>}
              </Pressable>
              <TouchableOpacity onPress={() => { setStage('email'); setCode(''); setNewPwd(''); setConfirmPwd(''); setError(''); setInfo(''); }} style={{alignItems:'center', paddingVertical:12}}>
                <Text style={{color:BRAND, fontSize:14, fontWeight:'600', textDecorationLine:'underline'}}>
                  {t('forgotChangeEmail')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
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
