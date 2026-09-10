import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { dirIcon } from '../lib/rtl';

const BRAND = '#00C29B';

export default function DocumentDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { doc } = route.params;
  const isWarning = doc.statusKey === 'toRenew';
  const isAccepted = doc.statusKey === 'validated' || doc.statusKey === 'validatedM' || doc.statusKey === 'inOrder';

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{doc.label}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.statusCard}>
        <Ionicons name={doc.icon} size={40} color={doc.color} />
        <Text style={[s.statusText, { color: doc.color }]}>{doc.status}</Text>
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
          <Text style={[s.detailValue, { color: doc.color }]}>{doc.status}</Text>
        </View>
      </View>

      {isWarning && (
        <View style={s.warningCard}>
          <Ionicons name="warning" size={22} color="#f5a623" style={{ marginRight: 10 }} />
          <Text style={s.warningText}>{t('renewWarning')}</Text>
        </View>
      )}

      <Pressable style={[s.updateBtn, isAccepted && { opacity: 0.4 }]} disabled={isAccepted}>
        <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.updateTxt}>{t('updateDocument')}</Text>
      </Pressable>
    </ScrollView>
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
