import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { uploadService } from '../services/uploadService';
import { dirIcon } from '../lib/rtl';

const BRAND = '#00C29B';

export default function DocumentDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { updateDocument } = useAuth();
  const insets = useSafeAreaInsets();
  const { doc } = route.params;
  const [uploading, setUploading] = useState(false);
  const [provided, setProvided] = useState(!!doc.provided);
  const isWarning = doc.statusKey === 'toRenew';
  const isAccepted = doc.statusKey === 'validated' || doc.statusKey === 'validatedM' || doc.statusKey === 'inOrder';

  const statusColor = provided ? BRAND : doc.color;
  const statusText = provided ? t('provided') : doc.status;
  const statusIcon = provided ? 'checkmark-circle' : doc.icon;

  // Même sélection qu'à l'inscription : photo (galerie) ou fichier (PDF ou image).
  async function pick(source) {
    if (source === 'file') {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return null;
      const asset = result.assets[0];
      return { uri: asset.uri, size: asset.size ?? null, type: asset.mimeType ?? 'application/octet-stream' };
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return { uri: asset.uri, size: asset.fileSize ?? null, type: asset.mimeType ?? 'image/jpeg' };
  }

  async function replaceWith(source) {
    const file = await pick(source);
    if (!file || !doc.field) return;
    setUploading(true);
    try {
      const url = await uploadService.uploadDriverDoc({
        fileUri: file.uri,
        slot: doc.field.replace(/_url$/, ''),
        size: file.size,
        contentType: file.type,
      });
      await updateDocument(doc.field, url);
      setProvided(true);
      Alert.alert(doc.label, t('docUpdated'), [{ text: t('ok'), onPress: () => navigation.goBack() }]);
    } catch {
      Alert.alert(t('error'), t('docUploadError'));
    } finally {
      setUploading(false);
    }
  }

  function onUpdatePress() {
    Alert.alert(t('updateDocument'), doc.label, [
      { text: t('docPickPhoto'), onPress: () => replaceWith('photo') },
      { text: t('docPickFile'), onPress: () => replaceWith('file') },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{doc.label}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.statusCard}>
        <Ionicons name={statusIcon} size={40} color={statusColor} />
        <Text style={[s.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>

      {/* On n'affiche que ce qui est réel : le type (libellé traduit du document)
          et le statut. Les numéros/dates OCR ne sont pas fournis par le backend
          → pas de fausses métadonnées inventées. */}
      <View style={s.detailCard}>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>{t('type')}</Text>
          <Text style={s.detailValue}>{doc.label}</Text>
        </View>
        <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
          <Text style={s.detailLabel}>{t('status')}</Text>
          <Text style={[s.detailValue, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>

      {isWarning && (
        <View style={s.warningCard}>
          <Ionicons name="warning" size={22} color="#f5a623" style={{ marginRight: 10 }} />
          <Text style={s.warningText}>{t('renewWarning')}</Text>
        </View>
      )}

      <Pressable
        style={[s.updateBtn, (isAccepted || uploading) && { opacity: 0.4 }]}
        disabled={isAccepted || uploading || !doc.field}
        onPress={onUpdatePress}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
        ) : (
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        )}
        <Text style={s.updateTxt}>{uploading ? t('sending') : t('updateDocument')}</Text>
      </Pressable>
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  statusCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, padding: 24, marginBottom: 12 },
  statusText: { fontSize: 18, fontWeight: '800', marginTop: 10 },
  detailCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailLabel: { fontSize: 14, color: '#888' },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  warningCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef9e7', borderRadius: 14, marginHorizontal: 16, padding: 16, marginBottom: 12 },
  warningText: { flex: 1, fontSize: 14, color: '#856404', lineHeight: 20 },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginTop: 8 },
  updateTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
