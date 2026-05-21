import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import { ticketService } from '../services/ticketService';

const BRAND = '#00C29B';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return '';
  }
}

function mapTicket(ticket) {
  const isOpen = ticket.status === 'open' || ticket.status === 'in_progress';
  return {
    id: ticket.id,
    displayId: `TK-${ticket.id}`,
    orderId: ticket.assignment_id ? `ORD-${ticket.assignment_id}` : `TK-${ticket.id}`,
    subject: ticket.problem_type || ticket.description?.split('\n')[0] || 'Ticket support',
    date: formatDate(ticket.updated_at || ticket.created_at),
    status: isOpen ? 'open' : 'resolved',
    lastMessage: ticket.description || '',
  };
}

const TicketCard = React.memo(({ ticket, navigation, t }) => {
  const isOpen = ticket.status === 'open';
  return (
    <Pressable
      style={s.ticketCard}
      onPress={() => navigation.navigate('TicketChat', { ticketId: ticket.id, resolved: ticket.status === 'resolved' })}
    >
      <View style={s.ticketHeader}>
        <View style={s.ticketIdRow}>
          <Ionicons name={isOpen ? 'chatbubble-ellipses' : 'checkmark-circle'} size={18} color={isOpen ? '#f5a623' : BRAND} />
          <Text style={s.ticketId}>{ticket.displayId}</Text>
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
        <Text style={s.ticketLastMsg} numberOfLines={1}>{ticket.lastMessage}</Text>
        <Text style={s.ticketDate}>{ticket.date}</Text>
      </View>
    </Pressable>
  );
});

export default function TicketsListScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await ticketService.getTickets();
      const raw = res?.results || res?.data || [];
      setTickets(Array.isArray(raw) ? raw.map(mapTicket) : []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchTickets();
  }, [fetchTickets]));

  const openTickets = tickets.filter(tk => tk.status === 'open');
  const resolvedTickets = tickets.filter(tk => tk.status === 'resolved');

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
          <Text style={s.statValue}>{tickets.length}</Text>
          <Text style={s.statLabel}>{t('total')}</Text>
        </View>
      </View>

      {loading && <ActivityIndicator size="small" color={BRAND} style={{ marginTop: 20 }} />}

      {/* Open tickets */}
      {!loading && openTickets.length > 0 && (
        <>
          <Text style={s.sectionTitle}>{t('inProgress')}</Text>
          {openTickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} navigation={navigation} t={t} />
          ))}
        </>
      )}

      {/* Resolved tickets */}
      {!loading && resolvedTickets.length > 0 && (
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
});
