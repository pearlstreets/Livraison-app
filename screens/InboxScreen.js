import React, { useState, useRef, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { deliveryService } from '../services/deliveryService';
import { CLE_NOTIFICATIONS_LUES } from '../contexts/AuthContext';

const BRAND = '#FF6A13';
const FILTERS = [
  { key: 'Tout', tKey: 'all' },
  { key: 'Messages', tKey: 'messages' },
  { key: 'Alertes', tKey: 'alerts' },
  { key: 'Nouveautés', tKey: 'news' },
];

export default function InboxScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [filter, setFilter] = useState('Tout');
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [readIds, setReadIds] = useState([]);
  // Le serveur n'a pas d'état « lu » : les notifications ouvertes sont gardées
  // sur le téléphone, pour ne pas revenir en non lues à chaque ouverture.
  const lusChargesRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(CLE_NOTIFICATIONS_LUES)
      .then((v) => {
        const lus = v ? JSON.parse(v) : [];
        if (Array.isArray(lus)) setReadIds((prev) => Array.from(new Set([...lus, ...prev])));
      })
      .catch(() => {})
      .finally(() => { lusChargesRef.current = true; });
  }, []);
  useEffect(() => {
    if (!lusChargesRef.current) return;
    AsyncStorage.setItem(CLE_NOTIFICATIONS_LUES, JSON.stringify(readIds)).catch(() => {});
  }, [readIds]);
  const [notifs, setNotifs] = useState([]);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await deliveryService.getNotifications();
      const list = Array.isArray(res?.data) ? res.data : [];
      setNotifs(list);
    } catch (_) {
      // Conserve la liste existante en cas d'erreur réseau.
    }
  }, []);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    fetchNotifs();
  }, [fetchNotifs]));

  // Couleur et icône de secours : une notification sans couleur donnait « undefined20 » (couleur invalide).
  const couleurDe = (n) => (typeof n?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : BRAND);
  const iconeDe = (n) => n?.icon || 'notifications-outline';

  const filtered = filter === 'Tout' ? notifs : notifs.filter(n => n.type === FILTERS.find(f => f.key === filter)?.key);

  const sections = {};
  filtered.forEach(n => {
    const cle = n.section || '';
    if (!sections[cle]) sections[cle] = [];
    sections[cle].push(n);
  });

  function openNotif(notif) {
    setSelectedNotif(notif);
    if (!readIds.includes(notif.id)) setReadIds(prev => [...prev, notif.id]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.header, { paddingTop: insets.top + 16 }]}>{t('inbox')}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersRow} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map(f => (
            <Pressable key={f.key} style={[s.filterChip, filter === f.key && s.filterChipActive]} onPress={() => setFilter(f.key)}>
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{t(f.tKey)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {Object.keys(sections).length === 0 && (
          <Text style={s.empty}>{t('noMessages')}</Text>
        )}

        {Object.entries(sections).map(([section, items]) => (
          <View key={section}>
            <Text style={s.sectionTitle}>{section === "Aujourd'hui" ? t('today') : section === 'Plus anciens' ? t('older') : section}</Text>
            {items.map((item, idx) => (
              <Pressable key={item.id != null ? String(item.id) : `notif-${idx}`} style={[s.notifRow, !readIds.includes(item.id) && s.notifUnread]} onPress={() => openNotif(item)}>
                <View style={[s.notifIcon, { backgroundColor: couleurDe(item) + '20' }]}>
                  <Ionicons name={iconeDe(item)} size={20} color={couleurDe(item)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.notifTitle, !readIds.includes(item.id) && { fontWeight: '900' }]} numberOfLines={2}>{item.title}</Text>
                  <Text style={s.notifSub} numberOfLines={1}>{item.subtitle}</Text>
                  <Text style={s.notifTime}>{item.time}</Text>
                </View>
                {!readIds.includes(item.id) && <View style={s.unreadDot} />}
                <Ionicons name={dirIcon('chevron-forward')} size={16} color={colors.chevron} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      <StatusBarShield />

      {/* Modal détail message */}
      <Modal visible={!!selectedNotif} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedNotif(null)}>
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setSelectedNotif(null)}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
            <Text style={s.modalHeaderTitle} numberOfLines={1}>{t('message')}</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            {selectedNotif && (
              <>
                <View style={[s.modalIcon, { backgroundColor: couleurDe(selectedNotif) + '20' }]}>
                  <Ionicons name={iconeDe(selectedNotif)} size={32} color={couleurDe(selectedNotif)} />
                </View>
                <Text style={s.modalTitle}>{selectedNotif.title}</Text>
                <Text style={s.modalTime}>{selectedNotif.time}</Text>
                <View style={s.modalDivider} />
                <Text style={s.modalBody}>{selectedNotif.detail || selectedNotif.subtitle || ''}</Text>
              </>
            )}
          </ScrollView>
          <View style={s.modalFooter}>
            <Pressable style={s.closeBtn} onPress={() => setSelectedNotif(null)}>
              <Text style={s.closeBtnTxt}>{t('close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  header: { fontSize: 28, fontWeight: '900', color: c.text, paddingHorizontal: 16, paddingTop: 16, marginBottom: 12 },
  filtersRow: { paddingHorizontal: 16, marginBottom: 16, flexGrow: 0 },
  filterChip: { backgroundColor: c.dark ? c.borderStrong : '#e8e8e8', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  filterChipActive: { backgroundColor: BRAND },
  filterText: { fontWeight: '700', fontSize: 14, color: c.dark ? c.textSoft : '#333' },
  filterTextActive: { color: '#fff' },
  empty: { color: c.dark ? c.textMuted : '#888', paddingHorizontal: 16, paddingVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: c.text, paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.dark ? c.border : '#f0f0f0' },
  notifUnread: { backgroundColor: c.dark ? c.cardAlt : '#f0faf7' },
  notifIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notifTitle: { fontWeight: '700', fontSize: 15, color: c.text, marginBottom: 2 },
  notifSub: { color: c.dark ? c.textMuted : '#666', fontSize: 13 },
  notifTime: { color: c.textFaint, fontSize: 12, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, marginRight: 8 },

  modalContainer: { flex: 1, backgroundColor: c.card },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.dark ? c.border : '#f0f0f0' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: c.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  modalContent: { padding: 24, alignItems: 'center' },
  modalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: c.text, textAlign: 'center', marginBottom: 8 },
  modalTime: { color: c.textFaint, fontSize: 14, marginBottom: 16 },
  modalDivider: { height: 1, backgroundColor: c.dark ? c.border : '#f0f0f0', alignSelf: 'stretch', marginBottom: 16 },
  modalBody: { fontSize: 16, color: c.dark ? c.textSoft : '#333', lineHeight: 24, alignSelf: 'stretch' },
  modalFooter: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, borderTopWidth: 1, borderTopColor: c.dark ? c.border : '#f0f0f0' },
  closeBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

// Feuilles de style par thème (clair, sombre), créées une seule fois chacune.
const stylesParTheme = new Map();
function stylesPour(c) {
  if (!stylesParTheme.has(c)) stylesParTheme.set(c, makeStyles(c));
  return stylesParTheme.get(c);
}
