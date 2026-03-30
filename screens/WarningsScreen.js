import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';

export default function WarningsScreen({ navigation }) {
  const { t } = useLanguage();
  const { warnings, warningsList, accountActive } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('warnings')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Jauge */}
      <View style={s.gaugeCard}>
        <View style={s.gaugeRow}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[s.gaugeBlock, i < warnings && s.gaugeBlockActive, i >= warnings && s.gaugeBlockInactive]} />
          ))}
        </View>
        <Text style={s.gaugeText}>{warnings}/3 {t('warnings')}</Text>
        {warnings === 0 && (
          <Text style={s.gaugeGood}>{t('noWarnings') || 'Aucun avertissement'}</Text>
        )}
        {warnings > 0 && warnings < 3 && (
          <Text style={s.gaugeWarn}>{3 - warnings} {t('warningRemaining')}</Text>
        )}
        {warnings >= 3 && (
          <Text style={s.gaugeAlert}>{t('deactivatedMsg')}</Text>
        )}
      </View>

      {/* Explication */}
      <View style={s.infoCard}>
        <Ionicons name="information-circle" size={20} color={BRAND} style={{ marginRight: 10 }} />
        <Text style={s.infoText}>
          Les avertissements sont attribués en cas de non-respect des règles de la plateforme. Au bout de 3 avertissements, votre compte est désactivé.
        </Text>
      </View>

      {/* Historique */}
      <Text style={s.sectionTitle}>{t('history')}</Text>
      {warningsList.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="checkmark-circle" size={32} color={BRAND} />
          <Text style={s.emptyText}>Aucun avertissement pour le moment</Text>
        </View>
      ) : (
        warningsList.map((w, i) => (
          <View key={w.id} style={s.warningCard}>
            <View style={s.warningHeader}>
              <View style={s.warningIconWrap}>
                <Ionicons name="warning" size={18} color="#e74c3c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.warningNum}>Avertissement #{warningsList.length - i}</Text>
                <Text style={s.warningDate}>{w.date} à {w.time}</Text>
              </View>
            </View>
            <View style={s.warningReasonWrap}>
              <Text style={s.warningReasonLabel}>Motif :</Text>
              <Text style={s.warningReason}>{w.reason}</Text>
            </View>
          </View>
        ))
      )}

      {/* Causes possibles */}
      <Text style={s.sectionTitle}>Causes possibles</Text>
      <View style={s.causesCard}>
        {[
          { icon: 'close-circle-outline', text: 'Trop d\'annulations de commandes (> 5/semaine)', color: '#e74c3c' },
          { icon: 'time-outline', text: 'Retards répétés aux points de récupération', color: '#f5a623' },
          { icon: 'alert-circle-outline', text: 'Signalements clients (comportement, état du colis)', color: '#f5a623' },
          { icon: 'document-text-outline', text: 'Documents expirés ou non conformes', color: '#e74c3c' },
          { icon: 'ban-outline', text: 'Non-respect des conditions de livraison', color: '#e74c3c' },
        ].map((cause, i) => (
          <View key={i} style={[s.causeRow, i < 4 && s.causeBorder]}>
            <Ionicons name={cause.icon} size={18} color={cause.color} style={{ marginRight: 12 }} />
            <Text style={s.causeText}>{cause.text}</Text>
          </View>
        ))}
      </View>

      {/* Contestation */}
      {warnings > 0 && (
        <Pressable style={s.contestBtn} onPress={() => navigation.navigate('ContactSupport')}>
          <Ionicons name="chatbubbles-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.contestTxt}>Contester un avertissement</Text>
        </Pressable>
      )}

      {/* Fermer */}
      <Pressable style={s.closeBtn} onPress={() => navigation.goBack()}>
        <Text style={s.closeBtnTxt}>{t('close') || 'Fermer'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  gaugeCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 20, alignItems: 'center', marginBottom: 12 },
  gaugeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  gaugeBlock: { width: 80, height: 10, borderRadius: 5 },
  gaugeBlockActive: { backgroundColor: '#e74c3c' },
  gaugeBlockInactive: { backgroundColor: '#e8e8e8' },
  gaugeText: { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 4 },
  gaugeGood: { fontSize: 14, color: BRAND, fontWeight: '600' },
  gaugeWarn: { fontSize: 14, color: '#f5a623', fontWeight: '600' },
  gaugeAlert: { fontSize: 14, color: '#e74c3c', fontWeight: '600', textAlign: 'center' },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#e6faf5', borderRadius: 14, marginHorizontal: 16, padding: 14, marginBottom: 20 },
  infoText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 19 },

  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111', paddingHorizontal: 16, marginBottom: 10 },

  causesCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 20, overflow: 'hidden' },
  causeRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  causeBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  causeText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 19 },

  emptyCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, color: '#888', fontWeight: '600', marginTop: 8 },

  warningCard: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#e74c3c' },
  warningHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  warningIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fde8e8', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  warningNum: { fontSize: 15, fontWeight: '800', color: '#111' },
  warningDate: { fontSize: 12, color: '#999', marginTop: 1 },
  warningReasonWrap: { backgroundColor: '#fef5f5', borderRadius: 10, padding: 10 },
  warningReasonLabel: { fontSize: 12, color: '#999', fontWeight: '700', marginBottom: 2 },
  warningReason: { fontSize: 14, color: '#333', lineHeight: 19 },

  contestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginTop: 10 },
  contestTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  closeBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginTop: 16 },
  closeBtnTxt: { color: '#666', fontWeight: '800', fontSize: 15 },
});
