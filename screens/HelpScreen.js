import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';

const BRAND = '#00C29B';

const TOPICS = [
  { icon: 'bicycle-outline', labelKey: 'helpProblem', descKey: 'helpProblemSub' },
  { icon: 'card-outline', labelKey: 'helpPayments', descKey: 'helpPaymentsSub' },
  { icon: 'person-outline', labelKey: 'helpAccount', descKey: 'helpAccountSub' },
  { icon: 'document-text-outline', labelKey: 'helpDocuments', descKey: 'helpDocumentsSub' },
  { icon: 'car-outline', labelKey: 'helpVehicle', descKey: 'helpVehicleSub' },
  { icon: 'shield-outline', labelKey: 'helpSecurity', descKey: 'helpSecuritySub' },
];

export default function HelpScreen({ navigation }) {
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
        <Text style={s.headerTitle}>{t('helpTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.sectionTitle}>{t('helpSubtitle')}</Text>

      {TOPICS.map((topic, i) => (
        <Pressable key={i} style={s.topicRow} onPress={() => navigation.navigate('HelpDetail', { topic: t(topic.labelKey) })}>
          <Ionicons name={topic.icon} size={22} color={BRAND} style={{ marginRight: 14 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.topicLabel}>{t(topic.labelKey)}</Text>
            <Text style={s.topicDesc}>{t(topic.descKey)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </Pressable>
      ))}

      <View style={s.divider} />

      <Pressable style={s.contactBtn} onPress={() => navigation.navigate('ContactSupport')}>
        <Ionicons name="mail-outline" size={20} color="#fff" />
        <Text style={s.contactTxt}>{t('contactSupport')}</Text>
      </Pressable>

      <Text style={s.version}>Pearl Delivery v1.0.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111', paddingHorizontal: 16, marginBottom: 16 },
  topicRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  topicLabel: { fontWeight: '700', fontSize: 15, color: '#111' },
  topicDesc: { color: '#888', fontSize: 13, marginTop: 2 },
  divider: { height: 20 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16 },
  contactTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  version: { textAlign: 'center', color: '#ccc', fontSize: 12, marginTop: 20 },
});
