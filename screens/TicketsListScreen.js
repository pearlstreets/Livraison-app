import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';

const TicketCard = React.memo(({ ticket, navigation, t }) => {
  const isOpen = ticket.status === 'open';
  const hasUnread = ticket.hasUnread || false;
  return (
    <Pressable
      style={s.ticketCard}
      onPress={() => navigation.navigate('TicketChat', { order: { id: ticket.orderId }, resolved: ticket.status === 'resolved' })}
    >
      <View style={s.ticketHeader}>
        <View style={s.ticketIdRow}>
          <Ionicons name={isOpen ? 'chatbubble-ellipses' : 'checkmark-circle'} size={18} color={isOpen ? '#f5a623' : BRAND} />
          <Text style={s.ticketId}>{ticket.id}</Text>
          {hasUnread && <View style={s.unreadBadge}><Text style={s.unreadBadgeText}>{ticket.unreadCount || ''}</Text></View>}
        </View>
        <View style={[s.statusBadge, isOpen ? s.statusOpen : s.statusResolved]}>
          <Text style={[s.statusText, isOpen ? s.statusOpenText : s.statusResolvedText]}>
            {isOpen ? t('inProgress') : t('resolved')}
          </Text>
        </View>
      </View>
      <Text style={s.ticketSubject}>{ticket.subject}</Text>
      <Text style={s.ticketOrder}>{t('order')} {ticket.orderId}</Text>
      <View style={s.ticketFooter}>
        <Text style={[s.ticketLastMsg, hasUnread && { color: '#111', fontWeight: '700' }]} numberOfLines={1}>{ticket.lastMessage}</Text>
        <Text style={s.ticketDate}>{ticket.date}</Text>
      </View>
    </Pressable>
  );
});

const MOCK_TICKETS = [
  { id: 'TK-3038', orderId: 'ORD-3038', subject: 'Commande endommagée', date: '26 mars 2025', status: 'resolved', lastMessage: 'Votre problème a été traité avec succès.' },
  { id: 'TK-2996', orderId: 'ORD-2996', subject: 'Adresse incorrecte', date: '22 mars 2025', status: 'resolved', lastMessage: 'Nous avons mis à jour l\'adresse. Merci.' },
  { id: 'TK-2981', orderId: 'ORD-2981', subject: 'Retard au restaurant', date: '18 mars 2025', status: 'resolved', lastMessage: 'Une compensation a été ajoutée à votre solde.' },
];

export default function TicketsListScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { getTicketMessages, getUnreadTicketCount } = useAuth();

  // Build dynamic tickets from AuthContext
  const { ticketMessages = {}, ticketReadCounts = {} } = useAuth();

  const dynamicTickets = Object.keys(ticketMessages).map(orderId => {
    const msgs = ticketMessages[orderId] || [];
    if (msgs.length === 0) return null;
    const readCount = ticketReadCounts[orderId] || 0;
    const hasUnread = msgs.length > readCount;
    const lastMsg = [...msgs].reverse().find(m => m.type === 'admin' || m.type === 'user');
    const firstUserMsg = msgs.find(m => m.type === 'user');
    const subject = firstUserMsg ? firstUserMsg.text.split('\n')[0] : 'Ticket support';
    const lastTime = lastMsg?.time ? new Date(lastMsg.time) : new Date();
    const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    const dateStr = `${lastTime.getDate()} ${months[lastTime.getMonth()]} ${lastTime.getFullYear()}`;
    return {
      id: `TK-${orderId.replace('ORD-', '')}`,
      orderId,
      subject: subject.length > 60 ? subject.substring(0, 60) + '...' : subject,
      date: dateStr,
      status: 'open',
      lastMessage: lastMsg?.text || '',
      hasUnread,
      unreadCount: hasUnread ? msgs.length - readCount : 0,
      dynamic: true,
    };
  }).filter(Boolean);

  // MOCK_TICKETS = fallback offline seulement. En production, dynamicTickets
  // vient du context (alimenté par /api/v1/delivery/tickets/).
  // Ne jamais mélanger mocks + vrais tickets côté driver.
  const allTickets = dynamicTickets.length > 0 ? dynamicTickets : MOCK_TICKETS;

  // Memoize ticket filtering to avoid recomputation on every render
  const { openTickets, resolvedTickets } = useMemo(() => ({
    openTickets: allTickets.filter(tk => tk.status === 'open'),
    resolvedTickets: allTickets.filter(tk => tk.status === 'resolved'),
  }), [allTickets]);

  function renderTicket(ticket) {
    const isOpen = ticket.status === 'open';
    const hasUnread = ticket.hasUnread || false;
    return (
      <Pressable
        key={ticket.id}
        style={s.ticketCard}
        onPress={() => navigation.navigate('TicketChat', { order: { id: ticket.orderId }, resolved: ticket.status === 'resolved' })}
      >
        <View style={s.ticketHeader}>
          <View style={s.ticketIdRow}>
            <Ionicons name={isOpen ? 'chatbubble-ellipses' : 'checkmark-circle'} size={18} color={isOpen ? '#f5a623' : BRAND} />
            <Text style={s.ticketId}>{ticket.id}</Text>
            {hasUnread && <View style={s.unreadBadge}><Text style={s.unreadBadgeText}>{ticket.unreadCount || ''}</Text></View>}
          </View>
          <View style={[s.statusBadge, isOpen ? s.statusOpen : s.statusResolved]}>
            <Text style={[s.statusText, isOpen ? s.statusOpenText : s.statusResolvedText]}>
              {isOpen ? t('inProgress') : t('resolved')}
            </Text>
          </View>
        </View>
        <Text style={s.ticketSubject}>{ticket.subject}</Text>
        <Text style={s.ticketOrder}>{t('order')} {ticket.orderId}</Text>
        <View style={s.ticketFooter}>
          <Text style={[s.ticketLastMsg, hasUnread && { color: '#111', fontWeight: '700' }]} numberOfLines={1}>{ticket.lastMessage}</Text>
          <Text style={s.ticketDate}>{ticket.date}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>Tickets</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statValue}>{openTickets.length}</Text>
          <Text style={s.statLabel}>{t('inProgress')}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statValue, { color: BRAND }]}>{resolvedTickets.length}</Text>
          <Text style={s.statLabel}>{t('resolved')}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statValue}>{allTickets.length}</Text>
          <Text style={s.statLabel}>{t('total')}</Text>
        </View>
      </View>

      {/* Open tickets */}
      {openTickets.length > 0 && (
        <>
          <Text style={s.sectionTitle}>{t('inProgress')}</Text>
          {openTickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} navigation={navigation} t={t} />
          ))}
        </>
      )}

      {/* Resolved tickets */}
      {resolvedTickets.length > 0 && (
        <>
          <Text style={s.sectionTitle}>{t('resolved')}</Text>
          {resolvedTickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} navigation={navigation} t={t} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: '#111' },
  statLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111', paddingHorizontal: 16, marginBottom: 10, marginTop: 4 },

  ticketCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e8e8e8' },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ticketId: { fontSize: 15, fontWeight: '800', color: '#111' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusOpen: { backgroundColor: '#fff8e6' },
  statusResolved: { backgroundColor: '#e6faf5' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusOpenText: { color: '#f5a623' },
  statusResolvedText: { color: BRAND },
  ticketSubject: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 4 },
  ticketOrder: { fontSize: 13, color: '#888', marginBottom: 8 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8 },
  ticketLastMsg: { flex: 1, fontSize: 13, color: '#999', marginRight: 8 },
  ticketDate: { fontSize: 12, color: '#bbb', fontWeight: '600' },
  unreadBadge: { backgroundColor: '#e74c3c', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 6 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
