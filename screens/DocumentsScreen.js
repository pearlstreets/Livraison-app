import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';

const BRAND = '#00C29B';

const DOCS = [
  { labelKey: 'idCard', statusKey: 'validated', icon: 'checkmark-circle', color: BRAND },
  { labelKey: 'driverLicense', statusKey: 'validatedM', icon: 'checkmark-circle', color: BRAND },
  { labelKey: 'insurance', statusKey: 'inOrder', icon: 'checkmark-circle', color: BRAND },
  { labelKey: 'addressProof', statusKey: 'validatedM', icon: 'checkmark-circle', color: BRAND },
  { labelKey: 'urssaf', statusKey: 'toRenew', icon: 'alert-circle', color: '#f5a623' },
  { labelKey: 'kbis', statusKey: 'validatedM', icon: 'checkmark-circle', color: BRAND },
];

export default function DocumentsScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  return (
    <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('documentsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.subtitle}>{t('documentsVerified')}</Text>

      {DOCS.map((doc, i) => (
        <Pressable key={i} style={s.docRow} onPress={() => navigation.navigate('DocumentDetail', { doc: { ...doc, label: t(doc.labelKey), status: t(doc.statusKey) } })}>
          <Ionicons name={doc.icon} size={24} color={doc.color} style={{ marginRight: 14 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.docLabel}>{t(doc.labelKey)}</Text>
            <Text style={[s.docStatus, { color: doc.color }]}>{t(doc.statusKey)}</Text>
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
  subtitle: { color: '#888', fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  docLabel: { fontWeight: '700', fontSize: 15, color: '#111' },
  docStatus: { fontSize: 13, marginTop: 2 },
});
