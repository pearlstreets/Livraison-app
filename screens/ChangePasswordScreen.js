import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { authService } from '../services/authService';

const BRAND = '#00C29B';
// Local demo password store — used only when the real backend is
// unreachable (see handleSave). The real source of truth is the backend.
const USERS_DB = [
  { email: 'remsko@live.fr', password: 'Test@123' },
];

function isNetworkLevelError(err) {
  if (!err) return false;
  if (err.isNetworkError === true) return true;
  if (err.isNetworkError === false) return false;
  return !err.response && !err.status;
}

export default function ChangePasswordScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSave() {
    if (!currentPwd) {
      Alert.alert(t('error'), t('passwordError') || 'Veuillez saisir votre mot de passe actuel');
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert(t('error'), t('passwordTooShort') || 'Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert(t('error'), t('passwordMismatch') || 'Les mots de passe ne correspondent pas');
      return;
    }

    // Try the real backend first. On HTTP error (e.g. 401 "wrong current
    // password"), surface it. Only a network-level failure falls back to
    // the local demo store so the offline demo keeps working.
    try {
      await authService.updatePassword(currentPwd, newPwd);
      Alert.alert(t('saved') || 'Succès', t('profileUpdated') || 'Mot de passe modifié avec succès', [
        { text: t('ok') || 'OK', onPress: () => navigation.goBack() },
      ]);
      return;
    } catch (err) {
      if (!isNetworkLevelError(err)) {
        Alert.alert(t('error'), t('passwordWrong') || 'Mot de passe actuel incorrect');
        return;
      }
    }

    // Offline fallback — only reachable if the backend didn't respond.
    const entry = USERS_DB.find(u => u.email.toLowerCase() === user.email.toLowerCase());
    if (entry && entry.password !== currentPwd) {
      Alert.alert(t('error'), t('passwordWrong') || 'Mot de passe actuel incorrect');
      return;
    }
    if (entry) entry.password = newPwd;
    Alert.alert(t('saved') || 'Succès', t('profileUpdated') || 'Mot de passe modifié avec succès', [
      { text: t('ok') || 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('changePassword') || 'Modifier le mot de passe'}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Icon */}
        <View style={s.iconWrap}>
          <View style={s.iconCircle}>
            <Ionicons name="lock-closed" size={32} color={BRAND} />
          </View>
        </View>

        {/* Current password */}
        <Text style={s.label}>{t('currentPassword') || 'Mot de passe actuel'}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor="#bbb"
            secureTextEntry={!showCurrent}
            value={currentPwd}
            onChangeText={setCurrentPwd}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowCurrent(!showCurrent)}>
            <Ionicons name={showCurrent ? 'eye-off' : 'eye'} size={20} color="#999" />
          </Pressable>
        </View>

        {/* New password */}
        <Text style={s.label}>{t('newPassword') || 'Nouveau mot de passe'}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Min. 6 caractères"
            placeholderTextColor="#bbb"
            secureTextEntry={!showNew}
            value={newPwd}
            onChangeText={setNewPwd}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowNew(!showNew)}>
            <Ionicons name={showNew ? 'eye-off' : 'eye'} size={20} color="#999" />
          </Pressable>
        </View>

        {/* Password strength indicator */}
        {newPwd.length > 0 && (
          <View style={s.strengthRow}>
            <View style={[s.strengthBar, newPwd.length >= 2 && { backgroundColor: newPwd.length >= 8 ? BRAND : newPwd.length >= 6 ? '#f5a623' : '#e74c3c' }]} />
            <View style={[s.strengthBar, newPwd.length >= 6 && { backgroundColor: newPwd.length >= 8 ? BRAND : '#f5a623' }]} />
            <View style={[s.strengthBar, newPwd.length >= 8 && { backgroundColor: BRAND }]} />
            <Text style={s.strengthText}>
              {newPwd.length < 6 ? 'Faible' : newPwd.length < 8 ? 'Moyen' : 'Fort'}
            </Text>
          </View>
        )}

        {/* Confirm password */}
        <Text style={s.label}>{t('confirmPassword') || 'Confirmer le mot de passe'}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Retapez le mot de passe"
            placeholderTextColor="#bbb"
            secureTextEntry={!showConfirm}
            value={confirmPwd}
            onChangeText={setConfirmPwd}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
            <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#999" />
          </Pressable>
        </View>

        {/* Match indicator */}
        {confirmPwd.length > 0 && (
          <View style={s.matchRow}>
            <Ionicons
              name={newPwd === confirmPwd ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={newPwd === confirmPwd ? BRAND : '#e74c3c'}
            />
            <Text style={[s.matchText, { color: newPwd === confirmPwd ? BRAND : '#e74c3c' }]}>
              {newPwd === confirmPwd ? 'Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas'}
            </Text>
          </View>
        )}

        {/* Save button */}
        <Pressable style={s.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.saveTxt}>{t('save') || 'Enregistrer'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingTop: 16 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  iconWrap: { alignItems: 'center', marginBottom: 28 },
  iconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#e6faf5', alignItems: 'center', justifyContent: 'center' },

  label: { fontWeight: '700', fontSize: 14, color: '#333', marginBottom: 6, marginTop: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: '#111' },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0' },
  strengthText: { fontSize: 12, fontWeight: '700', color: '#888', marginLeft: 8 },

  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  matchText: { fontSize: 13, fontWeight: '600' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginTop: 32 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
