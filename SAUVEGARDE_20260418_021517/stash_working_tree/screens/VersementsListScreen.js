import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

export default function VersementsListScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { versements, currentIban } = useAuth();
  const insets = useSafeAreaInsets();
  const mode = route.params?.mode || 'activity'; // 'activity' or 'history'

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{mode === 'history' ? 'Historique des virements' : t('payoutActivity')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {mode === 'activity' ? (
          <View style={s.listCard}>
            {versements.map((v, i) => (
              <Pressable key={i} style={[s.versementRow, i < versements.length - 1 && s.versementBorder]} onPress={() => navigation.navigate('VersementDetail', { versement: v })}>
                <Ionicons name="calendar-outline" size={22} color="#666" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.versementLabel}>{v.label}</Text>
                  <View style={s.versementDateRow}>
                    <Text style={s.versementAmount}>{v.amount}</Text>
                    <Text style={s.versementDate}>{v.date}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ccc" style={{ marginLeft: 8 }} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={s.histList}>
            {versements.map((v, i) => (
              <Pressable key={i} style={[s.virementCard, i < versements.length - 1 && { marginBottom: 10 }]} onPress={() => navigation.navigate('VersementDetail', { versement: v })}>
                <View style={s.virementHeader}>
                  <View style={s.virementIconWrap}>
                    <Ionicons name={v.label === 'Versement exceptionnel' ? 'flash' : 'calendar-outline'} size={18} color={v.label === 'Versement exceptionnel' ? '#f5a623' : BRAND} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.virementLabel}>{v.label}</Text>
                    <Text style={s.virementDateSmall}>{v.date}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.virementAmountBig}>{v.amount}</Text>
                    <View style={s.virementStatusBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={BRAND} />
                      <Text style={s.virementStatusTxt}>{v.detail?.status || 'Versé'}</Text>
                    </View>
                  </View>
                </View>
                <View style={s.virementDetails}>
                  <View style={s.virementDetailRow}>
                    <Text style={s.virementDetailLabel}>IBAN</Text>
                    <Text style={s.virementDetailValue}>{v.iban || currentIban}</Text>
                  </View>
                  <View style={s.virementDetailRow}>
                    <Text style={s.virementDetailLabel}>Montant net</Text>
                    <Text style={s.virementDetailValue}>{v.detail?.net || v.amount}</Text>
                  </View>
                  <View style={s.virementDetailRow}>
                    <Text style={s.virementDetailLabel}>Courses</Text>
                    <Text style={s.virementDetailValue}>{v.detail?.courses || '-'}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  listCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, overflow: 'hidden' },
  versementRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  versementBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  versementLabel: { fontWeight: '700', fontSize: 15, color: '#111' },
  versementDateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  versementDate: { color: '#888', fontSize: 13 },
  versementAmount: { fontWeight: '800', fontSize: 16, color: '#111' },

  histList: { paddingHorizontal: 16 },
  virementCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#f0f0f0' },
  virementHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  virementIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  virementLabel: { fontWeight: '700', fontSize: 14, color: '#111' },
  virementDateSmall: { fontSize: 12, color: '#999', marginTop: 1 },
  virementAmountBig: { fontWeight: '900', fontSize: 16, color: '#111' },
  virementStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  virementStatusTxt: { fontSize: 11, color: BRAND, fontWeight: '700' },
  virementDetails: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 10 },
  virementDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  virementDetailLabel: { fontSize: 13, color: '#888' },
  virementDetailValue: { fontSize: 13, fontWeight: '700', color: '#333' },
});
