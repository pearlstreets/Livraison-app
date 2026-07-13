import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';
import { deliveryService } from '../services/deliveryService';

const BRAND = '#00C29B';
const FILTERS = [
  { key: 'Tout', tKey: 'all' },
  { key: 'Messages', tKey: 'messages' },
  { key: 'Alertes', tKey: 'alerts' },
  { key: 'Nouveautés', tKey: 'news' },
];

export default function InboxScreen() {
  const { t } = useLanguage();
  const scrollRef = useRef(null);
  const [filter, setFilter] = useState('Tout');
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [readIds, setReadIds] = useState([]);
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

  const filtered = filter === 'Tout' ? notifs : notifs.filter(n => n.type === FILTERS.find(f => f.key === filter)?.key);

  const sections = {};
  filtered.forEach(n => {
    if (!sections[n.section]) sections[n.section] = [];
    sections[n.section].push(n);
  });

  function openNotif(notif) {
    setSelectedNotif(notif);
    if (!readIds.includes(notif.id)) setReadIds(prev => [...prev, notif.id]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={s.header}>{t('inbox')}</Text>

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
            {items.map(item => (
              <Pressable key={item.id} style={[s.notifRow, !readIds.includes(item.id) && s.notifUnread]} onPress={() => openNotif(item)}>
                <View style={[s.notifIcon, { backgroundColor: item.color + '20' }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.notifTitle, !readIds.includes(item.id) && { fontWeight: '900' }]} numberOfLines={2}>{item.title}</Text>
                  <Text style={s.notifSub} numberOfLines={1}>{item.subtitle}</Text>
                  <Text style={s.notifTime}>{item.time}</Text>
                </View>
                {!readIds.includes(item.id) && <View style={s.unreadDot} />}
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Modal détail message */}
      <Modal visible={!!selectedNotif} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setSelectedNotif(null)}>
              <Ionicons name="close" size={28} color="#111" />
            </Pressable>
            <Text style={s.modalHeaderTitle}>{t('message')}</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            {selectedNotif && (
              <>
                <View style={[s.modalIcon, { backgroundColor: selectedNotif.color + '20' }]}>
                  <Ionicons name={selectedNotif.icon} size={32} color={selectedNotif.color} />
                </View>
                <Text style={s.modalTitle}>{selectedNotif.title}</Text>
                <Text style={s.modalTime}>{selectedNotif.time}</Text>
                <View style={s.modalDivider} />
                <Text style={s.modalBody}>{selectedNotif.detail}</Text>
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

const s = StyleSheet.create({
  header: { fontSize: 28, fontWeight: '900', color: '#111', paddingHorizontal: 16, paddingTop: 16, marginBottom: 12 },
  filtersRow: { paddingHorizontal: 16, marginBottom: 16, flexGrow: 0 },
  filterChip: { backgroundColor: '#e8e8e8', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  filterChipActive: { backgroundColor: '#111' },
  filterText: { fontWeight: '700', fontSize: 14, color: '#333' },
  filterTextActive: { color: '#fff' },
  empty: { color: '#888', paddingHorizontal: 16, paddingVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111', paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  notifUnread: { backgroundColor: '#f0faf7' },
  notifIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notifTitle: { fontWeight: '700', fontSize: 15, color: '#111', marginBottom: 2 },
  notifSub: { color: '#666', fontSize: 13 },
  notifTime: { color: '#999', fontSize: 12, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, marginRight: 8 },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  modalContent: { padding: 24, alignItems: 'center' },
  modalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 8 },
  modalTime: { color: '#999', fontSize: 14, marginBottom: 16 },
  modalDivider: { height: 1, backgroundColor: '#f0f0f0', alignSelf: 'stretch', marginBottom: 16 },
  modalBody: { fontSize: 16, color: '#333', lineHeight: 24, alignSelf: 'stretch' },
  modalFooter: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  closeBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
