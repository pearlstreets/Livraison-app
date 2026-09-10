import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { dirIcon } from '../lib/rtl';

const BRAND = '#00C29B';

// Questions par rubrique d'aide, indexées par la CLÉ de la rubrique (et non par
// son titre traduit : hors français, la page restait vide). Chaque entrée donne
// les clés de traduction `<id>Q` (question) et `<id>A` (réponse).
const FAQ = {
  helpProblem: ['faqNoAnswer', 'faqWrongAddress', 'faqAccident', 'faqDamaged'],
  helpPayments: ['faqWhenPaid', 'faqInstantCashout', 'faqPayoutDetails', 'faqPaymentError'],
  helpAccount: ['faqChangeEmail', 'faqChangePassword', 'faqDeleteAccount'],
  helpDocuments: ['faqRequiredDocs', 'faqDocRefused', 'faqRenewDoc'],
  helpVehicle: ['faqChangeVehicle', 'faqMultipleVehicles'],
  helpSecurity: ['faqSecurityIssue', 'faqInsurance'],
};

export default function HelpDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const topicKey = route.params?.topicKey;
  const title = topicKey ? t(topicKey) : '';
  const questions = FAQ[topicKey] || [];
  // Les réponses citent les vrais libellés de l'app (menu, boutons) : ils sont
  // injectés ici pour rester identiques à l'écran dans chaque langue.
  const labels = {
    profile: t('tabProfile'),
    wallet: t('wallet'),
    payoutActivity: t('payoutActivity'),
    account: t('account'),
    changePassword: t('changePassword'),
    deleteAccount: t('deleteAccount'),
    documents: t('documents'),
    updateDocument: t('updateDocument'),
    vehicle: t('vehicle'),
    save: t('save'),
    iHaveProblem: t('iHaveProblem'),
    clientAbsent: t('codePbAbsent'),
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name={dirIcon('arrow-back')} size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        {questions.map((id) => (
          <View key={id} style={s.faqCard}>
            <Text style={s.question}>{t(`${id}Q`)}</Text>
            <Text style={s.answer}>{t(`${id}A`, labels)}</Text>
          </View>
        ))}
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
