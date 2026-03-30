import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';

const PROBLEMS = [
  { id: 'client_absent', icon: 'person-outline', labelKey: 'clientAbsent' },
  { id: 'adresse_incorrecte', icon: 'location-outline', labelKey: 'wrongAddress' },
  { id: 'commande_endommagee', icon: 'cube-outline', labelKey: 'damagedOrder' },
  { id: 'retard_restaurant', icon: 'time-outline', labelKey: 'restaurantDelay' },
  { id: 'probleme_paiement', icon: 'card-outline', labelKey: 'paymentIssue' },
  { id: 'accident', icon: 'warning-outline', labelKey: 'accident' },
  { id: 'autre', icon: 'chatbubble-outline', labelKey: 'otherProblem' },
];

export default function ReportProblemScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { markOrderReported, saveTicketMessages } = useAuth();
  const insets = useSafeAreaInsets();
  const order = route.params?.order || {};
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [comment, setComment] = useState('');

  function handleSubmit() {
    if (!selectedProblem) {
      Alert.alert(t('error'), t('selectProblem'));
      return;
    }
    Alert.alert(
      t('reportSent'),
      t('reportSentMsg'),
      [{
        text: t('ok'),
        onPress: () => {
          markOrderReported(order.id);
          // Save the problem as initial message in the ticket
          const problem = PROBLEMS.find(p => p.id === selectedProblem);
          const problemLabel = problem ? t(problem.labelKey) : selectedProblem;
          const now = new Date();
          const initialMsgs = [
            { id: '0', type: 'system', text: `Ticket ouvert pour la commande ${order.id || 'N/A'}` },
            { id: `user-report-${Date.now()}`, type: 'user', text: `Problème signalé : ${problemLabel}${comment ? `\n${comment}` : ''}`, time: now.toISOString() },
            { id: 'admin-0', type: 'admin', text: 'Bonjour ! Merci de nous contacter. Un agent va prendre en charge votre demande.', time: new Date(now.getTime() + 1500).toISOString() },
            { id: 'admin-1', type: 'admin', text: 'Je consulte les détails de votre course. Un instant s\'il vous plaît...', time: new Date(now.getTime() + 4000).toISOString() },
          ];
          saveTicketMessages(order.id, initialMsgs);
          navigation.goBack();
        },
      }]
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.headerRow}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('reportTitle')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Order ref */}
      <View style={s.orderRef}>
        <Ionicons name="receipt-outline" size={14} color="#888" style={{ marginRight: 6 }} />
        <Text style={s.orderRefText}>Commande {order.id} — {order.restaurant}</Text>
      </View>

      <Text style={s.sectionTitle}>{t('problemType')}</Text>

      {/* Problem list line by line */}
      {PROBLEMS.map(p => (
        <Pressable
          key={p.id}
          style={[s.problemRow, selectedProblem === p.id && s.problemRowActive]}
          onPress={() => setSelectedProblem(p.id)}
        >
          <Ionicons name={p.icon} size={16} color={selectedProblem === p.id ? BRAND : '#666'} />
          <Text style={[s.problemRowText, selectedProblem === p.id && { color: BRAND, fontWeight: '800' }]}>{t(p.labelKey)}</Text>
          {selectedProblem === p.id && <Ionicons name="checkmark-circle" size={18} color={BRAND} />}
        </Pressable>
      ))}

      {/* Comment */}
      <TextInput
        style={s.commentInput}
        placeholder={t('describeProblemPlaceholder')}
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        value={comment}
        onChangeText={setComment}
      />

      {/* Submit */}
      <Pressable style={[s.submitBtn, !selectedProblem && { opacity: 0.4 }]} onPress={handleSubmit} disabled={!selectedProblem}>
        <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 6 }} />
        <Text style={s.submitBtnTxt}>{t('sendReport')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111' },

  orderRef: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 8, marginBottom: 8 },
  orderRefText: { fontSize: 12, color: '#666', fontWeight: '600' },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#111', marginBottom: 6 },

  problemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 5, gap: 10, borderWidth: 1.5, borderColor: 'transparent' },
  problemRowActive: { borderColor: BRAND, backgroundColor: BRAND + '10' },
  problemRowText: { flex: 1, fontSize: 13, color: '#333', fontWeight: '600' },

  commentInput: { backgroundColor: '#fff', borderRadius: 12, padding: 12, fontSize: 13, minHeight: 70, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 10 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingVertical: 14 },
  submitBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
