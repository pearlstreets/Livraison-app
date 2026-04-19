import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';


export default function WalletScreen({ navigation }) {
  const { t } = useLanguage();
  const { currentEarningsCents, cashOut, versements, currentIban } = useAuth();
  const insets = useSafeAreaInsets();
  const earn = { earningsCents: currentEarningsCents, earnings: (currentEarningsCents / 100).toFixed(2) + ' €' };
  const [encaissModal, setEncaissModal] = useState(false);
  const [encaissStep, setEncaissStep] = useState('confirm'); // confirm | processing | done
  const [cashedAmount, setCashedAmount] = useState('');
  const showVersements = versements.slice(0, 3);
  const scrollRef = useRef(null);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  const todayDate = new Date().toLocaleDateString('fr-FR');
  const alreadyCashedToday = versements.some(v => {
    if (!v.cashedAt) return false;
    return new Date(v.cashedAt).toLocaleDateString('fr-FR') === todayDate;
  });

  function startEncaiss() {
    if (earn.earningsCents <= 0) return;
    if (alreadyCashedToday) {
      Alert.alert('Limite atteinte', 'Vous ne pouvez effectuer qu\'un seul encaissement par jour.');
      return;
    }
    setCashedAmount(earn.earnings);
    setEncaissStep('confirm');
    setEncaissModal(true);
  }

  function processEncaiss() {
    setEncaissStep('processing');
    setTimeout(() => {
      cashOut();
      setEncaissStep('done');
    }, 1500);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('wallet')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t('balance')}</Text>
          <View style={s.balanceRow}>
            <Text style={s.balanceAmount}>{earn.earnings}</Text>
            <Ionicons name="chevron-forward" size={22} color="#999" />
          </View>
          <Text style={s.nextPayout}>Versement planifié : 31 mars</Text>
          <Pressable style={[s.encaissBtn, earn.earningsCents <= 0 && { opacity: 0.4 }]} onPress={startEncaiss}>
            <Ionicons name="flash" size={16} color="#111" />
            <Text style={s.encaissTxt}>{t('cashout')}</Text>
          </Pressable>
        </View>

        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('payoutActivity')}</Text>
        </View>

        <Text style={s.subSection}>{t('lastPayouts')}</Text>
        <View style={s.versementsCard}>
          {showVersements.map((v, i) => (
            <Pressable key={i} style={[s.versementRow, i < showVersements.length - 1 && s.versementBorder]} onPress={() => navigation.navigate('VersementDetail', { versement: v })}>
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
        {versements.length > 3 && (
          <Pressable style={s.showAllBtn} onPress={() => navigation.navigate('VersementsList', { mode: 'activity' })}>
            <Text style={s.showAllTxt}>Tout afficher ({versements.length})</Text>
          </Pressable>
        )}

        <View style={s.paymentMethodCard}>
          <View style={s.pmHeaderRow}>
            <Ionicons name="business-outline" size={22} color="#666" style={{ marginRight: 12 }} />
            <Text style={s.pmTitle}>{t('paymentMethod')}</Text>
          </View>
          <View style={s.pmIbanRow}>
            <View style={s.pmIbanIcon}>
              <Ionicons name="card-outline" size={20} color={BRAND} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.pmIbanLabel}>{t('currentBankAccount')}</Text>
              <Text style={s.pmIbanValue}>{currentIban}</Text>
            </View>
          </View>
          <Pressable style={s.pmEditBtn} onPress={() => navigation.navigate('EditIban')}>
            <Ionicons name="create-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.pmEditTxt}>{t('changeBankAccount')}</Text>
          </Pressable>
        </View>

        <Pressable style={s.helpRow} onPress={() => navigation.navigate('Help')}>
          <Ionicons name="help-circle-outline" size={22} color="#666" style={{ marginRight: 12 }} />
          <Text style={s.helpText}>{t('help')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </Pressable>
      </ScrollView>

      {/* Modal Encaissement */}
      <Modal visible={encaissModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.popup}>
            {encaissStep === 'confirm' && (
              <>
                <View style={s.popupIconWrap}>
                  <Ionicons name="flash" size={40} color={BRAND} />
                </View>
                <Text style={s.popupTitle}>{t('instantCashout')}</Text>
                <Text style={s.popupDesc}>Votre solde de {cashedAmount} sera transféré sur votre compte bancaire ••••15 sous 30 minutes.</Text>
                <Text style={s.popupFee}>{t('cashoutFee')}</Text>
                <Pressable style={s.popupBtnPrimary} onPress={processEncaiss}>
                  <Text style={s.popupBtnPrimaryTxt}>{t('confirmCashout')}</Text>
                </Pressable>
                <Pressable style={s.popupBtnCancel} onPress={() => setEncaissModal(false)}>
                  <Text style={s.popupBtnCancelTxt}>{t('cancel')}</Text>
                </Pressable>
              </>
            )}
            {encaissStep === 'processing' && (
              <>
                <View style={s.popupIconWrap}>
                  <Ionicons name="hourglass-outline" size={40} color="#f5a623" />
                </View>
                <Text style={s.popupTitle}>{t('processing')}</Text>
                <Text style={s.popupDesc}>{t('processingMsg')}</Text>
              </>
            )}
            {encaissStep === 'done' && (
              <>
                <View style={[s.popupIconWrap, { backgroundColor: BRAND + '20' }]}>
                  <Ionicons name="checkmark-circle" size={48} color={BRAND} />
                </View>
                <Text style={s.popupTitle}>{t('cashoutSuccess')}</Text>
                <Text style={s.popupDesc}>Le montant de {cashedAmount} sera versé sur votre compte bancaire ••••15 dans les 30 prochaines minutes.</Text>
                <Pressable style={s.popupBtnPrimary} onPress={() => setEncaissModal(false)}>
                  <Text style={s.popupBtnPrimaryTxt}>{t('close')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>



    </View>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  balanceCard: { backgroundColor: '#111', borderRadius: 20, padding: 20, marginHorizontal: 16, marginBottom: 24 },
  balanceLabel: { color: '#999', fontSize: 13, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginVertical: 4 },
  nextPayout: { color: '#aaa', fontSize: 13, marginBottom: 12 },
  encaissBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' },
  encaissTxt: { fontWeight: '700', fontSize: 14, color: '#111' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111' },
  seeAll: { fontSize: 14, fontWeight: '600', color: BRAND },
  subSection: { fontSize: 14, fontWeight: '600', color: '#666', paddingHorizontal: 16, marginBottom: 8 },
  versementsCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 20, overflow: 'hidden' },
  versementRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  versementBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  versementLabel: { fontWeight: '700', fontSize: 15, color: '#111' },
  versementDateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  versementDate: { color: '#888', fontSize: 13 },
  versementAmount: { fontWeight: '800', fontSize: 16, color: '#111' },
  paymentMethodCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12 },
  pmHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pmTitle: { fontWeight: '700', fontSize: 15, color: '#111' },
  pmIbanRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderRadius: 12, padding: 12, marginBottom: 12 },
  pmIbanIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e6faf5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  pmIbanLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  pmIbanValue: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 2, letterSpacing: 0.5 },
  pmEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingVertical: 12 },
  pmEditTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  helpRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 16 },
  helpText: { fontWeight: '700', fontSize: 15, color: '#111', flex: 1 },

  // Popup encaissement
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  popup: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center' },
  popupIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  popupTitle: { fontSize: 22, fontWeight: '900', color: '#111', marginBottom: 8 },
  popupDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  popupFee: { fontSize: 14, color: '#999', marginBottom: 20 },
  popupBtnPrimary: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', width: '100%', marginBottom: 10 },
  popupBtnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  popupBtnCancel: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  popupBtnCancelTxt: { color: '#666', fontWeight: '700', fontSize: 15 },

  showAllBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 12, marginHorizontal: 16, marginBottom: 24, paddingVertical: 14, marginTop: -2 },
  showAllTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Historique virements
  sectionTitle2: { fontSize: 18, fontWeight: '900', color: '#111', paddingHorizontal: 16, marginBottom: 10, marginTop: 8 },
  virementsList: { paddingHorizontal: 16, marginBottom: 20 },
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
