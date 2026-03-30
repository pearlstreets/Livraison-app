import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#00C29B';

const DOC_DETAILS = {
  'Pièce d\'identité': { type: 'Carte nationale d\'identité', number: '****4521', expiry: '15/08/2030', submitted: '12/01/2025' },
  'Permis de conduire': { type: 'Permis B', number: '****7832', expiry: '20/03/2028', submitted: '12/01/2025' },
  'Assurance RC Pro': { type: 'Responsabilité civile professionnelle', number: 'RC-2025-4412', expiry: '01/01/2026', submitted: '15/01/2025' },
  'Justificatif de domicile': { type: 'Facture EDF', number: '—', expiry: '—', submitted: '12/01/2025' },
  'Attestation URSSAF': { type: 'Attestation de vigilance', number: '—', expiry: '31/03/2025', submitted: '05/01/2025' },
  'Extrait Kbis / SIRENE': { type: 'Extrait Kbis', number: 'SIREN ****891', expiry: '—', submitted: '12/01/2025' },
};

export default function DocumentDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { doc } = route.params;
  const detail = DOC_DETAILS[doc.label] || {};
  const isWarning = doc.status === 'À renouveler';
  const isAccepted = doc.statusKey === 'validated' || doc.statusKey === 'validatedM' || doc.statusKey === 'inOrder';

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{doc.label}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.statusCard}>
        <Ionicons name={doc.icon} size={40} color={doc.color} />
        <Text style={[s.statusText, { color: doc.color }]}>{doc.status}</Text>
      </View>

      <View style={s.detailCard}>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Type</Text>
          <Text style={s.detailValue}>{detail.type}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Numéro</Text>
          <Text style={s.detailValue}>{detail.number}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Expiration</Text>
          <Text style={[s.detailValue, isWarning && { color: '#f5a623', fontWeight: '800' }]}>{detail.expiry}</Text>
        </View>
        <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
          <Text style={s.detailLabel}>Soumis le</Text>
          <Text style={s.detailValue}>{detail.submitted}</Text>
        </View>
      </View>

      {isWarning && (
        <View style={s.warningCard}>
          <Ionicons name="warning" size={22} color="#f5a623" style={{ marginRight: 10 }} />
          <Text style={s.warningText}>Ce document arrive à expiration. Veuillez le renouveler pour continuer à livrer.</Text>
        </View>
      )}

      <Pressable style={[s.updateBtn, isAccepted && { opacity: 0.4 }]} disabled={isAccepted}>
        <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.updateTxt}>Mettre à jour le document</Text>
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
