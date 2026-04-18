import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

// FAQ structure uses topic keys from HelpScreen (helpProblem/helpPayments/…) and
// per-topic Q/A keys (helpProblem_q1/helpProblem_a1 …) that exist in translations.js
// for all 13 languages.
const FAQ_KEYS = {
  helpProblem: [['helpProblem_q1', 'helpProblem_a1'], ['helpProblem_q2', 'helpProblem_a2'], ['helpProblem_q3', 'helpProblem_a3'], ['helpProblem_q4', 'helpProblem_a4']],
  helpPayments: [['helpPayments_q1', 'helpPayments_a1'], ['helpPayments_q2', 'helpPayments_a2'], ['helpPayments_q3', 'helpPayments_a3'], ['helpPayments_q4', 'helpPayments_a4']],
  helpAccount: [['helpAccount_q1', 'helpAccount_a1'], ['helpAccount_q2', 'helpAccount_a2'], ['helpAccount_q3', 'helpAccount_a3']],
  helpDocuments: [['helpDocuments_q1', 'helpDocuments_a1'], ['helpDocuments_q2', 'helpDocuments_a2'], ['helpDocuments_q3', 'helpDocuments_a3']],
  helpVehicle: [['helpVehicle_q1', 'helpVehicle_a1'], ['helpVehicle_q2', 'helpVehicle_a2']],
  helpSecurity: [['helpSecurity_q1', 'helpSecurity_a1'], ['helpSecurity_q2', 'helpSecurity_a2']],
};

export default function HelpDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const params = route?.params || {};

  // Accept either the new `topicKey` or the legacy `topic` (translated label).
  let topicKey = params.topicKey;
  if (!topicKey && typeof params.topic === 'string') {
    // Try matching the translated label for every known topic.
    for (const k of Object.keys(FAQ_KEYS)) {
      if (t(k) === params.topic) { topicKey = k; break; }
    }
  }

  const questions = (topicKey && FAQ_KEYS[topicKey]) || [];
  const title = topicKey ? t(topicKey) : (params.topic || t('helpTitle'));

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        {questions.length === 0 ? (
          <View style={s.faqCard}>
            <Text style={s.answer}>{t('helpSubtitle')}</Text>
          </View>
        ) : (
          questions.map(([qKey, aKey], i) => (
            <View key={i} style={s.faqCard}>
              <Text style={s.question}>{t(qKey)}</Text>
              <Text style={s.answer}>{t(aKey)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[s.contactWrap, { paddingBottom: insets.bottom || 16 }]}>
        <Pressable style={s.contactBtn} onPress={() => navigation.navigate('ContactSupport', { subject: title })}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.contactTxt}>{t('contactSupport')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111', flex: 1, textAlign: 'center' },
  faqCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 10 },
  question: { fontWeight: '800', fontSize: 15, color: '#111', marginBottom: 8 },
  answer: { fontSize: 14, color: '#555', lineHeight: 21 },
  contactWrap: { backgroundColor: '#f5f5f5', paddingHorizontal: 16, paddingTop: 10 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16 },
  contactTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
