import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

const BRAND = '#00C29B';

// Mapping champ backend → clé i18n du label
const DOC_FIELDS = [
  { field: 'id_card_front_url', labelKey: 'idCardFront' },
  { field: 'id_card_back_url', labelKey: 'idCardBack' },
  { field: 'driver_license_url', labelKey: 'driverLicense' },
  { field: 'rc_pro_url', labelKey: 'insurance' },
  { field: 'urssaf_doc_url', labelKey: 'urssaf' },
  { field: 'kbis_doc_url', labelKey: 'kbis' },
  { field: 'iban_doc_url', labelKey: 'ibanDoc' },
];

function buildDocs(user, t) {
  if (!user) return DOC_FIELDS.map(d => ({
    labelKey: d.labelKey,
    field: d.field,
    provided: false,
    icon: 'alert-circle-outline',
    color: '#ccc',
    statusText: t('missing') || 'Manquant',
    url: null,
  }));
  return DOC_FIELDS.map(d => {
    const provided = typeof user[d.field] === 'string' && user[d.field].trim().length > 0;
    return {
      labelKey: d.labelKey,
      field: d.field,
      provided,
      icon: provided ? 'checkmark-circle' : 'alert-circle-outline',
      color: provided ? BRAND : '#f5a623',
      statusText: provided ? (t('provided') || 'Fourni') : (t('missing') || 'Manquant'),
      url: provided ? user[d.field] : null,
    };
  });
}

export default function DocumentsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  const docs = buildDocs(user, t);
  const isVerified = user?.is_verified === true;

  return (
    <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('documentsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Badge vérification global */}
      <View style={[s.verifiedBadge, { backgroundColor: isVerified ? '#e6faf5' : '#fff8e1' }]}>
        <Ionicons
          name={isVerified ? 'shield-checkmark' : 'shield-outline'}
          size={20}
          color={isVerified ? BRAND : '#f5a623'}
          style={{ marginRight: 8 }}
        />
        <Text style={[s.verifiedText, { color: isVerified ? BRAND : '#f5a623' }]}>
          {isVerified ? (t('accountVerified') || 'Compte vérifié') : (t('verificationPending') || 'Vérification en attente')}
        </Text>
      </View>

      <Text style={s.subtitle}>{t('documentsVerified')}</Text>

      {docs.map((doc, i) => (
        <Pressable
          key={i}
          style={s.docRow}
          onPress={() => navigation.navigate('DocumentDetail', {
            doc: { ...doc, label: t(doc.labelKey) || doc.labelKey, status: doc.statusText },
          })}
        >
          <Ionicons name={doc.icon} size={24} color={doc.color} style={{ marginRight: 14 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.docLabel}>{t(doc.labelKey) || doc.labelKey}</Text>
            <Text style={[s.docStatus, { color: doc.color }]}>{doc.statusText}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  verifiedText: { fontWeight: '700', fontSize: 14 },
  subtitle: { color: '#888', fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  docLabel: { fontWeight: '700', fontSize: 15, color: '#111' },
  docStatus: { fontSize: 13, marginTop: 2 },
});
