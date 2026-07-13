import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';

const BRAND = '#00C29B';

const MenuItem = React.memo(({ icon, label, onPress, color = '#111', badge, detail }) => {
  return (
    <Pressable style={s.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} style={{ marginRight: 14 }} />
      <Text style={[s.menuLabel, { color }]}>{label}</Text>
      {detail && <Text style={s.menuDetail}>{detail}</Text>}
      {badge && <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>}
      <Ionicons name="chevron-forward" size={18} color="#ccc" />
    </Pressable>
  );
});

export default function MenuScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout, warnings, accountActive, rating, totalDeliveries, reactivateAccount, weeklyEarnings, isOnline, deliveryHistory, getUnreadTicketCount, getUnreadOpportunitiesCount } = useAuth();
  const { t, lang, setLang, LANGUAGES } = useLanguage();
  const [langModal, setLangModal] = useState(false);
  const [pendingLang, setPendingLang] = useState(lang);
  const scrollRef = useRef(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  const currentLang = LANGUAGES.find(l => l.code === lang);

  const parsePrice = useCallback((p) => { const n = parseFloat(String(p).replace(',', '.').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; }, []);

  // Memoize earnings calculations to avoid recomputation on every render
  const { thisDayTotal, thisWeekTotal, thisMonthTotal } = useMemo(() => {
    const now = new Date();
    const currentWeek = weeklyEarnings.length > 0 ? weeklyEarnings[0] : null;
    const weekTotal = currentWeek ? currentWeek.total : 0;
    const todayStr = `${now.getDate()} ${['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'][now.getMonth()]}`;
    const dayTotal = (deliveryHistory || []).filter(o => o.date === todayStr && o.status !== 'cancelled').reduce((s, o) => s + parsePrice(o.priceText), 0);
    const monthTotal = (deliveryHistory || []).filter(o => {
      if (!o.completedAt && !o.cancelledAt) return false;
      const d = new Date(o.completedAt || o.cancelledAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && o.status !== 'cancelled';
    }).reduce((s, o) => s + parsePrice(o.priceText), 0);
    return { thisDayTotal: dayTotal, thisWeekTotal: weekTotal, thisMonthTotal: monthTotal };
  }, [weeklyEarnings, deliveryHistory, parsePrice]);

  const confirmLogout = useCallback(() => {
    Alert.alert(t('logoutTitle'), t('logoutMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logoutTitle'), style: 'destructive', onPress: logout },
    ]);
  }, [t, logout]);

  return (
    <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: isOnline ? BRAND : '#8e8e93', height: insets.top }} />

      {/* En-tête profil */}
      <View style={[s.profileHeader, !isOnline && { backgroundColor: '#8e8e93' }]}>
        <Pressable style={s.avatarWrap} onPress={() => navigation.navigate('EditProfile')}>
          {user?.photo ? (
            <Image source={{ uri: user.photo }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Ionicons name="person" size={28} color="#fff" />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={s.profileName}>{user?.pseudo?.toUpperCase()}</Text>
            {user?.isVerified && (
              <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 6 }} />
            )}
          </View>
          <Text style={s.profileSub}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ')}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Statut en ligne */}
      <View style={[s.statusBanner, !isOnline && { backgroundColor: '#8e8e93' }]}>
        <View style={[s.statusDot, !isOnline && { backgroundColor: '#e74c3c' }, !accountActive && { backgroundColor: '#111' }]} />
        <Text style={s.statusText}>{!accountActive ? t('deactivatedTitle') : isOnline ? t('youAreOnline') : t('offline')}</Text>
      </View>

      {/* Gains */}
      <View style={{flexDirection:'row', paddingHorizontal:16, marginTop:10, gap:8}}>
        <Pressable style={{flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:2}} onPress={() => navigation.navigate('DeliveryHistory')}>
          <Text style={{fontSize:16, fontWeight:'900', color:'#111'}}>{thisDayTotal.toFixed(2)} €</Text>
          <Text style={{fontSize:11, fontWeight:'600', color:'#6B7280', marginTop:2}}>{t('today') || "Aujourd'hui"}</Text>
        </Pressable>
        <Pressable style={{flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:2}} onPress={() => navigation.navigate('Wallet')}>
          <Text style={{fontSize:16, fontWeight:'900', color:'#111'}}>{thisWeekTotal.toFixed(2)} €</Text>
          <Text style={{fontSize:11, fontWeight:'600', color:'#6B7280', marginTop:2}}>{t('thisWeek')}</Text>
        </Pressable>
        <Pressable style={{flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:2}} onPress={() => navigation.navigate('Wallet')}>
          <Text style={{fontSize:16, fontWeight:'900', color:'#111'}}>{thisMonthTotal.toFixed(2)} €</Text>
          <Text style={{fontSize:11, fontWeight:'600', color:'#6B7280', marginTop:2}}>{t('thisMonth')}</Text>
        </Pressable>
      </View>

      {/* Compte désactivé banner */}
      {!accountActive && (
        <View style={s.deactivatedBanner}>
          <Ionicons name="alert-circle" size={20} color="#e74c3c" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.deactivatedTitle}>{t('deactivatedTitle')}</Text>
            <Text style={s.deactivatedSub}>{t('deactivatedMsg')}</Text>
          </View>
        </View>
      )}
      {!accountActive && (
        <Pressable style={s.revisionBtn} onPress={() => {
          Alert.alert(
            t('revisionRequest'),
            t('revisionMsg'),
            [
              { text: t('cancel'), style: 'cancel' },
              { text: t('send'), onPress: () => navigation.navigate('TicketChat', { order: { id: 'REVISION' } }) },
            ]
          );
        }}>
          <Ionicons name="document-text-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.revisionBtnTxt}>{t('revisionRequest')}</Text>
        </Pressable>
      )}

      {/* État du compte */}
      <View style={s.accountCard}>
        <View style={s.accountRow}>
          <Pressable style={s.accountStat} onPress={() => navigation.navigate('Ratings')}>
            <Ionicons name="star" size={18} color="#f5a623" />
            <Text style={s.accountStatValue}>{rating}</Text>
            <Text style={s.accountStatLabel}>{t('note')}</Text>
          </Pressable>
          <View style={s.accountStatDivider} />
          <Pressable style={s.accountStat} onPress={() => navigation.navigate('DeliveryHistory')}>
            <Ionicons name="bicycle" size={18} color={BRAND} />
            <Text style={s.accountStatValue}>{totalDeliveries}</Text>
            <Text style={s.accountStatLabel}>{t('courses')}</Text>
          </Pressable>
          <View style={s.accountStatDivider} />
          <Pressable style={s.accountStat} onPress={() => navigation.navigate('Warnings')}>
            <Ionicons name="warning" size={18} color={warnings > 0 ? '#e74c3c' : '#ccc'} />
            <Text style={[s.accountStatValue, warnings > 0 && { color: '#e74c3c' }]}>{warnings}/3</Text>
            <Text style={s.accountStatLabel}>{t('warnings')}</Text>
          </Pressable>
        </View>
        {warnings > 0 && warnings < 3 && (
          <View style={s.warningHint}>
            <Ionicons name="information-circle" size={14} color="#f5a623" style={{ marginRight: 6 }} />
            <Text style={s.warningHintText}>{t('attention')} : {3 - warnings} {t('warningRemaining')}</Text>
          </View>
        )}
      </View>

      {/* Section principale */}
      <View style={s.section}>
        <MenuItem icon="time-outline" label={t('deliveryHistory')} onPress={() => navigation.navigate('DeliveryHistory')} />
        <MenuItem icon="flash-outline" label={t('opportunities')} onPress={() => navigation.navigate('Opportunities')} badge={getUnreadOpportunitiesCount(4) > 0 ? String(getUnreadOpportunitiesCount(4)) : null} />
        <MenuItem icon="wallet-outline" label={t('wallet')} onPress={() => navigation.navigate('Wallet')} />
        <MenuItem icon="person-outline" label={t('account')} onPress={() => navigation.navigate('EditProfile')} />
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <MenuItem icon="chatbubbles-outline" label="Tickets" onPress={() => navigation.navigate('TicketsList')} badge={getUnreadTicketCount() > 0 ? String(getUnreadTicketCount()) : null} />
        <MenuItem icon="document-text-outline" label={t('documents')} onPress={() => navigation.navigate('Documents')} />
        <MenuItem icon="car-outline" label={t('vehicle')} onPress={() => navigation.navigate('Vehicle')} detail={user?.vehicle || 'Vélo'} />
        <MenuItem icon="star-outline" label={t('ratings')} onPress={() => navigation.navigate('Ratings')} />
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <MenuItem icon="help-circle-outline" label={t('help')} onPress={() => navigation.navigate('Help')} />
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <Pressable style={s.menuItem} onPress={() => { setPendingLang(lang); setLangModal(true); }}>
          <Ionicons name="language-outline" size={22} color="#111" style={{ marginRight: 14 }} />
          <Text style={[s.menuLabel, { color: '#111' }]}>{t('language')}</Text>
          <Text style={s.langCurrent}>{currentLang.flag} {currentLang.native}</Text>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </Pressable>
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <MenuItem icon="log-out-outline" label={t('logout')} onPress={confirmLogout} color="#e74c3c" />
      </View>

      {/* Modal Langue */}
      <Modal visible={langModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.langModalContainer}>
          <View style={s.langModalHeader}>
            <Pressable onPress={() => setLangModal(false)}>
              <Ionicons name="close" size={28} color="#111" />
            </Pressable>
            <Text style={s.langModalTitle}>{t('chooseLang')}</Text>
            <View style={{ width: 28 }} />
          </View>
          <FlatList
            data={LANGUAGES}
            keyExtractor={item => item.code}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <Pressable
                style={[s.langRow, item.code === pendingLang && s.langRowActive]}
                onPress={() => setPendingLang(item.code)}
              >
                <Text style={s.langFlag}>{item.flag}</Text>
                <View style={s.langTextRow}>
                  <Text style={[s.langLabel, item.code === pendingLang && { color: BRAND, fontWeight: '800' }]}>{item.native}</Text>
                  <Text style={[s.langEnglish, item.code === pendingLang && { color: BRAND }]}>({item.label})</Text>
                </View>
                {item.code === pendingLang && <Ionicons name="checkmark-circle" size={22} color={BRAND} />}
              </Pressable>
            )}
          />
          <Pressable style={s.langConfirmBtn} onPress={() => { setLang(pendingLang); setLangModal(false); }}>
            <Text style={s.langConfirmTxt}>{t('confirm')}</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, backgroundColor: BRAND },
  avatarWrap: { marginRight: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontWeight: '900', fontSize: 18, color: '#fff', letterSpacing: 0.5 },
  profileSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND, paddingHorizontal: 16, paddingBottom: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 8 },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  section: { backgroundColor: '#fff' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  menuDetail: { fontSize: 14, color: '#888', fontWeight: '600', marginRight: 8 },
  badge: { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  divider: { height: 10, backgroundColor: '#f5f5f5' },

  // Earnings bar
  earningsBar: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  earningsItem: { flex: 1, alignItems: 'center' },
  earningsValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  earningsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  earningsDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.3)' },

  // Account status card
  accountCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 14, marginTop: 10, marginBottom: 10 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  accountStat: { alignItems: 'center', gap: 4 },
  accountStatValue: { fontSize: 18, fontWeight: '900', color: '#111' },
  accountStatLabel: { fontSize: 11, color: '#888', fontWeight: '600' },
  accountStatDivider: { width: 1, height: 36, backgroundColor: '#f0f0f0' },
  warningHint: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff8e6', borderRadius: 8, padding: 8, marginTop: 10 },
  warningHintText: { fontSize: 12, color: '#b37400', fontWeight: '600', flex: 1 },

  // Deactivated
  deactivatedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fde8e8', marginHorizontal: 16, borderRadius: 14, padding: 14, marginTop: 10 },
  deactivatedTitle: { fontSize: 14, fontWeight: '800', color: '#e74c3c' },
  deactivatedSub: { fontSize: 12, color: '#666', marginTop: 2 },
  revisionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', borderRadius: 12, paddingVertical: 12, marginHorizontal: 16, marginTop: 8 },
  revisionBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Langue
  langCurrent: { fontSize: 14, color: '#888', fontWeight: '600', marginRight: 8 },
  langModalContainer: { flex: 1, backgroundColor: '#fff' },
  langModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  langModalTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  langRowActive: { backgroundColor: '#e6faf5' },
  langFlag: { fontSize: 24, marginRight: 14 },
  langTextRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  langLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  langEnglish: { fontSize: 14, fontWeight: '400', color: '#888' },
  langConfirmBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginBottom: 20, alignItems: 'center' },
  langConfirmTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
