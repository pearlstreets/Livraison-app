import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { ticketService } from '../services/ticketService';
import { useAuth } from '../contexts/AuthContext';

import { formatDayMonth } from '../lib/i18nFormat';

const BRAND = '#FF6A13';

// Clés de traduction des types de problème backend (cf. ReportProblemScreen).
const PROBLEM_LABEL_KEYS = {
  client_absent: 'clientAbsent',
  adresse_incorrecte: 'wrongAddress',
  commande_endommagee: 'damagedOrder',
  retard_restaurant: 'restaurantDelay',
  probleme_paiement: 'paymentIssue',
  accident: 'accident',
  autre: 'otherProblem',
};

function mapTicket(ticket) {
  const isOpen = ticket.status === 'open' || ticket.status === 'in_progress';
  return {
    id: ticket.id,
    displayId: `TK-${ticket.id}`,
    // Vraie référence de commande (`order_id`), sinon numéro de course.
    orderId: ticket.order_id || null,
    assignmentId: ticket.assignment_id || null,
    problemType: ticket.problem_type || '',
    subject: String(ticket.description || '').split('\n')[0],
    dateRaw: ticket.updated_at || ticket.created_at || null,
    status: isOpen ? 'open' : 'resolved',
    lastMessage: String(ticket.description || ''),
  };
}

const TicketCard = React.memo(({ ticket, navigation, t }) => {
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const isOpen = ticket.status === 'open';
  return (
    <Pressable
      style={s.ticketCard}
      onPress={() => navigation.navigate('TicketChat', { ticketId: ticket.id, resolved: ticket.status === 'resolved' })}
    >
      <View style={s.ticketHeader}>
        <View style={s.ticketIdRow}>
          <Ionicons name={isOpen ? 'chatbubble-ellipses' : 'checkmark-circle'} size={18} color={isOpen ? '#f5a623' : BRAND} />
          <Text style={s.ticketId} numberOfLines={1}>{ticket.displayId}</Text>
        </View>
        <View style={[s.statusBadge, isOpen ? s.statusOpen : s.statusResolved]}>
          <Text style={[s.statusText, isOpen ? s.statusOpenText : s.statusResolvedText]} numberOfLines={1}>
            {isOpen ? t('inProgress') : t('resolved')}
          </Text>
        </View>
      </View>
      <Text style={s.ticketSubject}>{PROBLEM_LABEL_KEYS[ticket.problemType] ? t(PROBLEM_LABEL_KEYS[ticket.problemType]) : (ticket.problemType || ticket.subject || t('ticketTitle'))}</Text>
      {ticket.orderId ? (
        <Text style={s.ticketOrder}>{t('order')} #{ticket.orderId}</Text>
      ) : ticket.assignmentId ? (
        <Text style={s.ticketOrder}>{t('deliveryRef', { id: ticket.assignmentId })}</Text>
      ) : null}
      <View style={s.ticketFooter}>
        <Text style={s.ticketLastMsg} numberOfLines={1}>{ticket.lastMessage}</Text>
        <Text style={s.ticketDate}>{formatDayMonth(ticket.dateRaw, { year: true })}</Text>
      </View>
    </Pressable>
  );
});
TicketCard.displayName = 'TicketCard';

export default function TicketsListScreen({ navigation }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const { refreshTickets } = useAuth();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      // Toutes les pages (le serveur en renvoie 10 par défaut).
      const raw = await ticketService.getAllTickets();
      setTickets(Array.isArray(raw) ? raw.map(mapTicket) : []);
    } catch {
      // Échec réseau : message et bouton réessayer, la liste déjà lue reste.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchTickets();
    // En quittant l'écran : badge Tickets du menu remis à jour.
    return () => { refreshTickets?.(); };
  }, [fetchTickets, refreshTickets]));

  const openTickets = tickets.filter(tk => tk.status === 'open');
  const resolvedTickets = tickets.filter(tk => tk.status === 'resolved');

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('ticketsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statValue}>{openTickets.length}</Text>
          <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('inProgress')}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statValue, { color: BRAND }]}>{resolvedTickets.length}</Text>
          <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('resolved')}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statValue}>{tickets.length}</Text>
          <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('total')}</Text>
        </View>
      </View>

      {loading && <ActivityIndicator size="small" color={BRAND} style={{ marginTop: 20 }} />}

      {!loading && loadError && (
        <View style={s.errorCard}>
          <Ionicons name="cloud-offline-outline" size={22} color="#e74c3c" />
          <Text style={s.errorText}>{t('ticketsLoadError')}</Text>
          <Pressable style={s.retryBtn} onPress={fetchTickets}>
            <Text style={s.retryTxt}>{t('retry')}</Text>
          </Pressable>
        </View>
      )}

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
    <StatusBarShield />
    </>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 18, fontWeight: '800', color: c.text },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: c.card, borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: c.text },
  statLabel: { fontSize: 12, color: c.dark ? c.textMuted : '#888', fontWeight: '600', marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text, paddingHorizontal: 16, marginBottom: 10, marginTop: 4 },

  ticketCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.dark ? c.borderStrong : '#e8e8e8' },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, marginRight: 10 },
  ticketId: { fontSize: 15, fontWeight: '800', color: c.text, flexShrink: 1 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, flexShrink: 0, maxWidth: '55%' },
  statusOpen: { backgroundColor: c.dark ? 'rgba(245,166,35,0.18)' : '#fff8e6' },
  statusResolved: { backgroundColor: c.cardAlt },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusOpenText: { color: '#f5a623' },
  statusResolvedText: { color: BRAND },
  ticketSubject: { fontSize: 14, fontWeight: '700', color: c.dark ? c.textSoft : '#333', marginBottom: 4 },
  ticketOrder: { fontSize: 13, color: c.dark ? c.textMuted : '#888', marginBottom: 8 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.dark ? c.border : '#f0f0f0', paddingTop: 8 },
  ticketLastMsg: { flex: 1, fontSize: 13, color: c.textFaint, marginRight: 8 },
  ticketDate: { fontSize: 12, color: c.dark ? c.textFaint : '#bbb', fontWeight: '600', flexShrink: 0 },

  errorCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center', gap: 10 },
  errorText: { fontSize: 14, color: c.dark ? c.textSoft : '#333', fontWeight: '600', textAlign: 'center' },
  retryBtn: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24 },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

// Feuilles de style par thème (clair, sombre), créées une seule fois chacune.
const stylesParTheme = new Map();
function stylesPour(c) {
  if (!stylesParTheme.has(c)) stylesParTheme.set(c, makeStyles(c));
  return stylesParTheme.get(c);
}
