import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { authService } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import useSecureScreen from '../hooks/useSecureScreen';

const BRAND = '#FF6A13';

// Raison du refus, dans la langue du livreur quand elle est connue.
function messageErreur(err, t) {
  if (err?.isNetworkError) return t('errorNetwork');
  if (err?.status === 429) return t('errorTooManyRequests');
  const m = err?.serverMessage || '';
  if (/current password is incorrect/i.test(m)) return t('passwordWrong');
  if (/at least 10 characters/i.test(m)) return t('passwordTooShort');
  return m || t('passwordChangeError');
}

export default function ChangePasswordScreen({ navigation }) {
  const { t } = useLanguage();
  const { reconnecterApresMotDePasse, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  // Mots de passe actuel et nouveau.
  useSecureScreen('ChangePassword');

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!currentPwd) {
      Alert.alert(t('error'), t('passwordError'));
      return;
    }
    if (newPwd.length < 10) {
      Alert.alert(t('error'), t('passwordTooShort') || 'Le nouveau mot de passe doit contenir au moins 10 caractères');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert(t('error'), t('passwordMismatch') || 'Les mots de passe ne correspondent pas');
      return;
    }
    setSaving(true);
    try {
      await authService.updatePassword(currentPwd, newPwd);
    } catch (err) {
      Alert.alert(t('error'), messageErreur(err, t));
      setSaving(false);
      return;
    }
    try {
      // Le serveur refuse désormais les jetons d'avant le changement : on se
      // reconnecte aussitôt avec le nouveau mot de passe.
      const reconnecte = await reconnecterApresMotDePasse(newPwd);
      if (reconnecte) {
        Alert.alert(t('success'), t('passwordChanged'), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert(t('success'), t('passwordChangedReconnect'), [
          { text: t('ok'), onPress: () => { logout(); } },
        ]);
      }
    } catch (e) {
      // Mot de passe bien changé mais reconnexion en échec : on le dit, puis
      // déconnexion pour se reconnecter avec le nouveau mot de passe.
      Alert.alert(t('success'), t('passwordChangedReconnect'), [
        { text: t('ok'), onPress: () => { logout(); } },
      ]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('changePassword') || 'Modifier le mot de passe'}</Text>
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
            placeholderTextColor={dark ? colors.textFaint : '#bbb'}
            secureTextEntry={!showCurrent}
            value={currentPwd}
            onChangeText={setCurrentPwd}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowCurrent(!showCurrent)}>
            <Ionicons name={showCurrent ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} />
          </Pressable>
        </View>

        {/* New password */}
        <Text style={s.label}>{t('newPassword') || 'Nouveau mot de passe'}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder={t('pwdMin6')}
            placeholderTextColor={dark ? colors.textFaint : '#bbb'}
            secureTextEntry={!showNew}
            value={newPwd}
            onChangeText={setNewPwd}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowNew(!showNew)}>
            <Ionicons name={showNew ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} />
          </Pressable>
        </View>

        {/* Password strength indicator */}
        {newPwd.length > 0 && (
          <View style={s.strengthRow}>
            <View style={[s.strengthBar, newPwd.length >= 2 && { backgroundColor: newPwd.length >= 12 ? BRAND : newPwd.length >= 10 ? '#f5a623' : '#e74c3c' }]} />
            <View style={[s.strengthBar, newPwd.length >= 10 && { backgroundColor: newPwd.length >= 12 ? BRAND : '#f5a623' }]} />
            <View style={[s.strengthBar, newPwd.length >= 12 && { backgroundColor: BRAND }]} />
            <Text style={s.strengthText}>
              {newPwd.length < 10 ? t('pwdStrengthWeak') : newPwd.length < 12 ? t('pwdStrengthMedium') : t('pwdStrengthStrong')}
            </Text>
          </View>
        )}

        {/* Confirm password */}
        <Text style={s.label}>{t('confirmPassword') || 'Confirmer le mot de passe'}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder={t('pwdRetype')}
            placeholderTextColor={dark ? colors.textFaint : '#bbb'}
            secureTextEntry={!showConfirm}
            value={confirmPwd}
            onChangeText={setConfirmPwd}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
            <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} />
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
              {newPwd === confirmPwd ? t('passwordsMatch') : t('passwordMismatch')}
            </Text>
          </View>
        )}

        {/* Save button */}
        <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.saveTxt}>{t('save') || 'Enregistrer'}</Text>
              </>
          }
        </Pressable>
      </ScrollView>
      <StatusBarShield />
    </KeyboardAvoidingView>
  );
}

// Styles selon le mode : en clair, valeurs d'origine à l'identique.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: k('#f5f5f5', c.bg) },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingTop: 16 },
  headerTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 18, fontWeight: '800', color: k('#111', c.text) },

  iconWrap: { alignItems: 'center', marginBottom: 28 },
  iconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: k('#FFF1E8', c.cardAlt), alignItems: 'center', justifyContent: 'center' },

  label: { fontWeight: '700', fontSize: 14, color: k('#333', c.textSoft), marginBottom: 6, marginTop: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: k('#fff', c.input), borderRadius: 12, borderWidth: 1, borderColor: k('#e0e0e0', c.inputBorder) },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: k('#111', c.text) },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: k('#e0e0e0', c.borderStrong) },
  strengthText: { fontSize: 12, fontWeight: '700', color: k('#888', c.textFaint), marginLeft: 8, flexShrink: 1 },

  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  matchText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginTop: 32 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16, flexShrink: 1 },
  });
};
