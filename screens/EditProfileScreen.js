import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { uploadService } from '../services/uploadService';

const BRAND = '#00C29B';

function EditableField({ label, value, onChangeText, editing, onEdit, ...inputProps }) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.fieldRow}>
        <TextInput
          style={[s.input, !editing && s.inputDisabled]}
          value={value}
          onChangeText={onChangeText}
          editable={editing}
          {...inputProps}
        />
        <Pressable style={s.editIcon} onPress={onEdit}>
          <Ionicons name={editing ? 'checkmark' : 'pencil'} size={18} color={editing ? BRAND : '#999'} />
        </Pressable>
      </View>
    </View>
  );
}

export default function EditProfileScreen({ navigation }) {
  const { t } = useLanguage();
  const { user, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState(user?.photo || null);
  const [photoSize, setPhotoSize] = useState(null);
  const [pseudo, setPseudo] = useState(user?.pseudo || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const [email, setEmail] = useState(user?.email || '');
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false);

  function toggleEdit(field) {
    setEditingField(prev => prev === field ? null : field);
  }

  async function pickPhoto() {
    // Try/catch : sur iOS, si une clé Info.plist (NSPhotoLibraryUsageDescription)
    // manque ou qu'un provider natif jette, l'appel peut rejeter — on ne laisse
    // JAMAIS l'exception remonter (crash « au tap sur l'icône photo » vu en
    // review Apple). En cas d'échec, message doux, jamais de plantage.
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissionRequired'), t('galleryAccess'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled) {
        setPhoto(result.assets[0].uri);
        setPhotoSize(result.assets[0].fileSize ?? null);
      }
    } catch (e) {
      Alert.alert(t('error'), t('galleryAccess'));
    }
  }

  async function handleSave() {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert(t('error'), t('emailInvalid'));
      return;
    }
    if (!pseudo.trim()) {
      Alert.alert(t('error'), t('pseudoRequired'));
      return;
    }
    setSaving(true);
    try {
      // Photo : si c'est une nouvelle image locale (file://), on l'upload sur S3
      // et on persiste l'URL ; si déjà une URL http, on la garde telle quelle.
      let photoUrl = null;
      if (photo && /^https?:/.test(photo)) {
        photoUrl = photo;
      } else if (photo && /^file:/.test(photo)) {
        // Taille fournie par ImagePicker (asset.fileSize) — pas de dépendance native.
        photoUrl = await uploadService.uploadDriverDoc({ fileUri: photo, slot: 'profile_photo', size: photoSize, contentType: 'image/jpeg' });
      }
      updateUser({
        pseudo: pseudo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(photoUrl ? { profile_photo_url: photoUrl, photo: photoUrl } : {}),
      });
      setSaving(false);
      Alert.alert(t('saved'), t('profileUpdated'), [
        { text: t('ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setSaving(false);
      Alert.alert(t('error'), t('errorUploadFailed') || "Échec de l'envoi de la photo. Réessayez.");
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('account')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Photo */}
        <Pressable style={s.photoWrap} onPress={pickPhoto}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.photo} />
          ) : (
            <View style={s.photoPlaceholder}>
              <Ionicons name="person" size={48} color="#fff" />
            </View>
          )}
          <View style={s.cameraBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </Pressable>
        <Text style={s.photoHint}>{t('editPhoto')}</Text>

        <EditableField label={t('pseudo')} value={pseudo} onChangeText={setPseudo} editing={editingField === 'pseudo'} onEdit={() => toggleEdit('pseudo')} autoCorrect={false} />
        <EditableField label={t('firstName')} value={firstName} onChangeText={setFirstName} editing={editingField === 'firstName'} onEdit={() => toggleEdit('firstName')} />
        <EditableField label={t('lastName')} value={lastName} onChangeText={setLastName} editing={editingField === 'lastName'} onEdit={() => toggleEdit('lastName')} />
        <EditableField label={t('phone')} value={phone} onChangeText={setPhone} editing={editingField === 'phone'} onEdit={() => toggleEdit('phone')} keyboardType="phone-pad" />

        <EditableField label={t('email')} value={email} onChangeText={setEmail} editing={editingField === 'email'} onEdit={() => toggleEdit('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

        {/* Mot de passe */}
        <Pressable style={s.changePwdBtn} onPress={() => navigation.navigate('ChangePassword')}>
          <Ionicons name="lock-closed-outline" size={18} color={BRAND} style={{ marginRight: 8 }} />
          <Text style={s.changePwdTxt}>{t('changePassword')}</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </Pressable>

        <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={s.saveTxt}>{saving ? (t('saving') || 'Enregistrement…') : t('save')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: 16 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  photoWrap: { alignSelf: 'center', marginBottom: 4 },
  photo: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#333', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#f5f5f5' },
  photoHint: { textAlign: 'center', color: BRAND, fontWeight: '600', fontSize: 14, marginBottom: 24 },
  fieldWrap: { marginBottom: 12 },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontWeight: '700', fontSize: 14, color: '#333', marginBottom: 6 },
  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 0,
  },
  inputDisabled: { backgroundColor: '#f0f0f0', color: '#666' },
  editIcon: { padding: 10, marginLeft: 6 },
  changePwdBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#e0e0e0' },
  changePwdTxt: { flex: 1, fontWeight: '700', fontSize: 15, color: '#111' },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
