import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert, Modal, FlatList, Linking, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useFocusEffect } from '@react-navigation/native';
import { isSameDay } from '../lib/i18nFormat';
import { CONFIDENTIALITE_LIVREUR } from '../utils/stripeCompte';
import { authService } from '../services/authService';
import { ticketService } from '../services/ticketService';

const BRAND = '#FF6A13';
// Valeur backend du véhicule → clé de traduction du libellé.
const VEHICLE_LABEL_KEYS = { bicycle: 'bike', car: 'car', walk: 'walk' };

const MenuItem = React.memo(({ icon, label, onPress, color, badge, detail }) => {
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  // Couleur par défaut : texte principal (noir en clair, clair en sombre).
  color = color || colors.text;
  return (
    <Pressable style={s.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} style={{ marginRight: 14 }} />
      <Text style={[s.menuLabel, { color }]}>{label}</Text>
      {!!detail && <Text style={s.menuDetail} numberOfLines={1}>{detail}</Text>}
      {!!badge && <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>}
      <Ionicons name={dirIcon('chevron-forward')} size={18} color={colors.chevron} />
    </Pressable>
  );
});

export default function MenuScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout, deleteAccount, warnings, accountActive, rating, totalDeliveries, reactivateAccount, weeklyEarnings, isOnline, getUnreadTicketCount, getUnreadOpportunitiesCount, refreshTickets, refreshOpportunities } = useAuth();
  const { mode, cycleMode, dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  const { t, lang, setLang, LANGUAGES } = useLanguage();
  const { fmtPrice } = useCurrency();
  const [langModal, setLangModal] = useState(false);
  const [pendingLang, setPendingLang] = useState(lang);
  const scrollRef = useRef(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Badges Tickets et Opportunités relus sur le serveur à chaque retour au menu.
    refreshTickets?.();
    refreshOpportunities?.();
  }, [refreshTickets, refreshOpportunities]));

  // Langue inconnue de la liste : pas de plantage, la ligne reste affichée.
  const currentLang = (LANGUAGES || []).find(l => l.code === lang);
  const nbWarnings = Number(warnings) || 0;
  const nbOpportunites = getUnreadOpportunitiesCount?.() || 0;
  const nbTickets = getUnreadTicketCount?.() || 0;

  // Aujourd'hui, Cette semaine, Ce mois : une seule source, les gains NETS par
  // jour (adaptEarningsWeek : net de la semaine réparti sur ses jours), comme
  // l'écran Gains et son total.
  const { thisDayTotal, thisWeekTotal, thisMonthTotal } = useMemo(() => {
    const now = new Date();
    let dayTotal = 0;
    let weekTotal = 0;
    let monthTotal = 0;
    const vus = new Set();
    (weeklyEarnings || []).forEach((w) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(w.start || ''));
      if (!m) return;
      const jours = (w.bars || []).map((v, i) => ({ v: Number(v) || 0, d: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + i) }));
      const semaineEnCours = jours.some((j) => isSameDay(j.d, now));
      jours.forEach((j) => {
        const cle = j.d.toDateString();
        if (vus.has(cle)) return;
        vus.add(cle);
        if (isSameDay(j.d, now)) dayTotal += j.v;
        if (semaineEnCours) weekTotal += j.v;
        if (j.d.getMonth() === now.getMonth() && j.d.getFullYear() === now.getFullYear()) monthTotal += j.v;
      });
    });
    return { thisDayTotal: dayTotal, thisWeekTotal: weekTotal, thisMonthTotal: monthTotal };
  }, [weeklyEarnings]);

  // Demande de révision : un VRAI ticket support, puis son fil. Le serveur
  // refuse (403) les tickets d'un compte désactivé : on donne alors l'adresse
  // du support au lieu d'un écran vide.
  const [revisionEnvoi, setRevisionEnvoi] = useState(false);
  const envoyerRevision = useCallback(async () => {
    if (revisionEnvoi) return;
    setRevisionEnvoi(true);
    try {
      const res = await ticketService.createTicket({ problem_type: 'autre', description: t('revisionRequest') });
      const ticketId = res?.data?.id;
      if (ticketId) navigation.navigate('TicketChat', { ticketId });
      else Alert.alert(t('revisionRequest'), t('ticketSentSub'));
    } catch (e) {
      if (e?.isNetworkError) {
        Alert.alert(t('error'), t('errorNetwork'));
      } else {
        Alert.alert(t('error'), t('supportUnreachable'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('writeToSupport'), onPress: () => Linking.openURL('mailto:support@pearlstreets.com').catch(() => {}) },
        ]);
      }
    } finally {
      setRevisionEnvoi(false);
    }
  }, [revisionEnvoi, t, navigation]);

  const confirmLogout = useCallback(() => {
    Alert.alert(t('logoutTitle'), t('logoutMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logoutTitle'), style: 'destructive', onPress: logout },
    ]);
  }, [t, logout]);

  // Suppression de compte in-app (exigence Apple 5.1.1(v)). Double garde :
  // confirmation destructive, puis appel serveur ; en cas d'échec on prévient
  // sans déconnecter (le compte n'a pas été supprimé).
  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(t('deleteAccountTitle'), t('deleteAccountMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteAccountConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
          } catch (e) {
            Alert.alert(t('error'), t('deleteAccountError'));
          }
        },
      },
    ]);
  }, [t, deleteAccount]);

  // RGPD : le livreur récupère ses données (fichier JSON partagé par le
  // menu système : e-mail, Fichiers, AirDrop…).
  const exporterMesDonnees = useCallback(async () => {
    try {
      const donnees = await authService.exporterMesDonnees();
      await Share.share({ title: t('myDataMenu'), message: JSON.stringify(donnees, null, 2) });
    } catch (e) {
      Alert.alert(t('error'), t('myDataError'));
    }
  }, [t]);

  return (
    <>
    <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: isOnline ? BRAND : '#D9A07F', height: insets.top }} />

      {/* En-tête profil */}
      <View style={[s.profileHeader, !isOnline && { backgroundColor: '#D9A07F' }]}>
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
            <Text style={s.profileName} numberOfLines={1}>{user?.pseudo?.toUpperCase()}</Text>
            {user?.isVerified && (
              <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 6 }} />
            )}
          </View>
          <Text style={s.profileSub} numberOfLines={1}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ')}</Text>
        </View>
        {/* Mode d'affichage : Auto (nuit ou téléphone sombre), Clair, Sombre. */}
        <Pressable style={s.themeBtn} onPress={cycleMode} hitSlop={8}>
          <Ionicons name={mode === 'dark' ? 'moon' : mode === 'light' ? 'sunny' : 'contrast'} size={20} color="#fff" />
          <Text style={s.themeTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{mode === 'dark' ? (t('themeDark') || 'Sombre') : mode === 'light' ? (t('themeLight') || 'Clair') : (t('themeAuto') || 'Auto')}</Text>
        </Pressable>
      </View>

      {/* Statut en ligne */}
      <View style={[s.statusBanner, !isOnline && { backgroundColor: '#D9A07F' }]}>
        <View style={[s.statusDot, !isOnline && { backgroundColor: '#e74c3c' }, !accountActive && { backgroundColor: '#111' }]} />
        <Text style={s.statusText} numberOfLines={2}>{!accountActive ? t('deactivatedTitle') : isOnline ? t('youAreOnline') : t('offline')}</Text>
      </View>

      {/* Gains */}
      <View style={{flexDirection:'row', paddingHorizontal:16, marginTop:10, gap:8}}>
        <Pressable style={s.gainCard} onPress={() => navigation.navigate('DeliveryHistory')}>
          <Text style={s.gainValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fmtPrice(thisDayTotal)}</Text>
          <Text style={s.gainLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('today') || "Aujourd'hui"}</Text>
        </Pressable>
        <Pressable style={s.gainCard} onPress={() => navigation.navigate('Wallet')}>
          <Text style={s.gainValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fmtPrice(thisWeekTotal)}</Text>
          <Text style={s.gainLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('thisWeek')}</Text>
        </Pressable>
        <Pressable style={s.gainCard} onPress={() => navigation.navigate('Wallet')}>
          <Text style={s.gainValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fmtPrice(thisMonthTotal)}</Text>
          <Text style={s.gainLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('thisMonth')}</Text>
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
              { text: t('send'), onPress: envoyerRevision },
            ]
          );
        }}>
          <Ionicons name="document-text-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.revisionBtnTxt} numberOfLines={2}>{t('revisionRequest')}</Text>
        </Pressable>
      )}

      {/* État du compte */}
      <View style={s.accountCard}>
        <View style={s.accountRow}>
          <Pressable style={s.accountStat} onPress={() => navigation.navigate('Ratings')}>
            <Ionicons name="star" size={18} color="#f5a623" />
            <Text style={s.accountStatValue}>{Number(rating || 0).toFixed(1)}</Text>
            <Text style={s.accountStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('note')}</Text>
          </Pressable>
          <View style={s.accountStatDivider} />
          <Pressable style={s.accountStat} onPress={() => navigation.navigate('DeliveryHistory')}>
            <Ionicons name="bicycle" size={18} color={BRAND} />
            <Text style={s.accountStatValue}>{totalDeliveries ?? 0}</Text>
            <Text style={s.accountStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('courses')}</Text>
          </Pressable>
          <View style={s.accountStatDivider} />
          <Pressable style={s.accountStat} onPress={() => navigation.navigate('Warnings')}>
            <Ionicons name="warning" size={18} color={nbWarnings > 0 ? '#e74c3c' : colors.chevron} />
            <Text style={[s.accountStatValue, nbWarnings > 0 && { color: '#e74c3c' }]}>{nbWarnings}/3</Text>
            <Text style={s.accountStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('warnings')}</Text>
          </Pressable>
        </View>
        {nbWarnings > 0 && nbWarnings < 3 && (
          <View style={s.warningHint}>
            <Ionicons name="information-circle" size={14} color="#f5a623" style={{ marginRight: 6 }} />
            <Text style={s.warningHintText}>{t('attention')} : {3 - nbWarnings} {t('warningRemaining')}</Text>
          </View>
        )}
      </View>

      {/* Section principale */}
      <View style={s.section}>
        <MenuItem icon="time-outline" label={t('deliveryHistory')} onPress={() => navigation.navigate('DeliveryHistory')} />
        <MenuItem icon="flash-outline" label={t('opportunities')} onPress={() => navigation.navigate('Opportunities')} badge={nbOpportunites > 0 ? String(nbOpportunites) : null} />
        <MenuItem icon="wallet-outline" label={t('wallet')} onPress={() => navigation.navigate('Wallet')} />
        <MenuItem icon="person-outline" label={t('account')} onPress={() => navigation.navigate('EditProfile')} />
        <MenuItem icon="game-controller-outline" label={t('jeuTitre')} onPress={() => navigation.navigate('JeuTri')} />
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <MenuItem icon="chatbubbles-outline" label={t('ticketsTitle')} onPress={() => navigation.navigate('TicketsList')} badge={nbTickets > 0 ? String(nbTickets) : null} />
        <MenuItem icon="document-text-outline" label={t('documents')} onPress={() => navigation.navigate('Documents')} />
        <MenuItem icon="car-outline" label={t('vehicle')} onPress={() => navigation.navigate('Vehicle')} detail={t(VEHICLE_LABEL_KEYS[user?.vehicle] || 'bike')} />
        <MenuItem icon="notifications-outline" label={t('notifReglagesTitre')} onPress={() => navigation.navigate('NotificationsReglages')} />
        <MenuItem icon="star-outline" label={t('ratings')} onPress={() => navigation.navigate('Ratings')} />
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <MenuItem icon="help-circle-outline" label={t('help')} onPress={() => navigation.navigate('Help')} />
        <MenuItem icon="lock-closed-outline" label={t('privacyPolicyMenu')} onPress={() => Linking.openURL(CONFIDENTIALITE_LIVREUR).catch(() => {})} />
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <Pressable style={s.menuItem} onPress={() => { setPendingLang(lang); setLangModal(true); }}>
          <Ionicons name="language-outline" size={22} color={colors.text} style={{ marginRight: 14 }} />
          <Text style={[s.menuLabel, { color: colors.text }]}>{t('language')}</Text>
          <Text style={s.langCurrent} numberOfLines={1}>{currentLang ? `${currentLang.flag} ${currentLang.native}` : lang}</Text>
          <Ionicons name={dirIcon('chevron-forward')} size={18} color={colors.chevron} />
        </Pressable>
      </View>

      <View style={s.divider} />

      <View style={s.section}>
        <MenuItem icon="log-out-outline" label={t('logout')} onPress={confirmLogout} color="#e74c3c" />
        <MenuItem icon="download-outline" label={t('myDataMenu')} onPress={exporterMesDonnees} />
        <MenuItem icon="trash-outline" label={t('deleteAccount')} onPress={confirmDeleteAccount} color="#e74c3c" />
      </View>

      {/* Modal Langue */}
      <Modal visible={langModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLangModal(false)}>
        <View style={s.langModalContainer}>
          <View style={s.langModalHeader}>
            <Pressable onPress={() => setLangModal(false)}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
            <Text style={s.langModalTitle} numberOfLines={1}>{t('chooseLang')}</Text>
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
                  <Text style={[s.langLabel, item.code === pendingLang && { color: BRAND, fontWeight: '800' }]} numberOfLines={1}>{item.native}</Text>
                  <Text style={[s.langEnglish, item.code === pendingLang && { color: BRAND }]} numberOfLines={1}>({item.label})</Text>
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
    <StatusBarShield color={isOnline ? BRAND : '#D9A07F'} />
    </>
  );
}

// Styles selon le mode : en clair, valeurs d'origine à l'identique ; en sombre, palette du thème.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: k('#f5f5f5', c.bg) },
  gainCard: { flex: 1, backgroundColor: k('#fff', c.card), borderRadius: 12, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  gainValue: { fontSize: 16, fontWeight: '900', color: k('#111', c.text) },
  gainLabel: { fontSize: 11, fontWeight: '600', color: k('#6B7280', c.textMuted), marginTop: 2 },
  themeBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', minWidth: 54, maxWidth: 96, marginLeft: 10 },
  themeTxt: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, backgroundColor: BRAND },
  avatarWrap: { marginRight: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontWeight: '900', fontSize: 18, color: '#fff', letterSpacing: 0.5, flexShrink: 1 },
  profileSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND, paddingHorizontal: 16, paddingBottom: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C29B', marginRight: 8 },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 14, flexShrink: 1 },
  section: { backgroundColor: k('#fff', c.card) },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: k('#f0f0f0', c.border) },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 4 },
  menuDetail: { fontSize: 14, color: k('#888', c.textFaint), fontWeight: '600', marginRight: 8, marginLeft: 8, flexShrink: 1, maxWidth: '45%' },
  badge: { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  divider: { height: 10, backgroundColor: k('#f5f5f5', c.bg) },

  // Earnings bar
  earningsBar: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  earningsItem: { flex: 1, alignItems: 'center' },
  earningsValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  earningsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  earningsDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.3)' },

  // Account status card
  accountCard: { backgroundColor: k('#fff', c.card), marginHorizontal: 16, borderRadius: 14, padding: 14, marginTop: 10, marginBottom: 10 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  accountStat: { alignItems: 'center', gap: 4, flexShrink: 1, paddingHorizontal: 4 },
  accountStatValue: { fontSize: 18, fontWeight: '900', color: k('#111', c.text) },
  accountStatLabel: { fontSize: 11, color: k('#888', c.textFaint), fontWeight: '600' },
  accountStatDivider: { width: 1, height: 36, backgroundColor: k('#f0f0f0', c.border) },
  warningHint: { flexDirection: 'row', alignItems: 'center', backgroundColor: k('#fff8e6', '#3a2e14'), borderRadius: 8, padding: 8, marginTop: 10 },
  warningHintText: { fontSize: 12, color: k('#b37400', '#f5c46b'), fontWeight: '600', flex: 1 },

  // Deactivated
  deactivatedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: k('#fde8e8', '#3a1d1d'), marginHorizontal: 16, borderRadius: 14, padding: 14, marginTop: 10 },
  deactivatedTitle: { fontSize: 14, fontWeight: '800', color: '#e74c3c' },
  deactivatedSub: { fontSize: 12, color: k('#666', c.textMuted), marginTop: 2 },
  revisionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', borderRadius: 12, paddingVertical: 12, marginHorizontal: 16, marginTop: 8 },
  revisionBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14, flexShrink: 1, textAlign: 'center' },

  // Langue
  langCurrent: { fontSize: 14, color: k('#888', c.textFaint), fontWeight: '600', marginRight: 8, marginLeft: 8, flexShrink: 1, maxWidth: '45%' },
  langModalContainer: { flex: 1, backgroundColor: k('#fff', c.card) },
  langModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: k('#f0f0f0', c.border) },
  langModalTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 17, fontWeight: '800', color: k('#111', c.text) },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: k('#f5f5f5', c.border) },
  langRowActive: { backgroundColor: k('#FFF1E8', c.cardAlt) },
  langFlag: { fontSize: 24, marginRight: 14 },
  langTextRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginRight: 8 },
  langLabel: { fontSize: 16, fontWeight: '600', color: k('#111', c.text), flexShrink: 1 },
  langEnglish: { fontSize: 14, fontWeight: '400', color: k('#888', c.textFaint), marginLeft: 8, flexShrink: 1 },
  langConfirmBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginBottom: 20, alignItems: 'center' },
  langConfirmTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
};
