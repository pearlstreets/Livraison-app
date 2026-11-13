import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { formatDayMonth, formatTime } from '../lib/i18nFormat';
import { ticketService } from '../services/ticketService';

const BRAND = '#FF6A13';
const parseNum = (v) => { if (!v) return 0; const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };

export default function DeliveryDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { deliveryHistory } = useAuth();
  const { fmtPrice } = useCurrency();
  const insets = useSafeAreaInsets();
  const { colors, dark } = useTheme();
  // Couleurs du thème : en mode clair, valeurs identiques à l'écran d'origine.
  const s = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const order = route?.params?.order || {};

  // Ticket de cette course, retrouvé sur le serveur par son affectation :
  // signalement, état résolu et vrai identifiant du fil du support.
  const assignmentNum = Number(order.assignmentId ?? order._assignmentId);
  const assignmentId = Number.isInteger(assignmentNum) && assignmentNum > 0 ? assignmentNum : null;
  const [ticket, setTicket] = useState(null);
  useFocusEffect(useCallback(() => {
    if (!assignmentId) return undefined;
    let actif = true;
    ticketService.getAllTickets()
      .then((liste) => {
        // Liste du serveur triée du plus récent au plus ancien.
        const trouve = (Array.isArray(liste) ? liste : []).find((tk) => Number(tk?.assignment_id) === assignmentId);
        if (actif && trouve) setTicket(trouve);
      })
      .catch(() => {});
    return () => { actif = false; };
  }, [assignmentId]));

  const liveOrder = (Array.isArray(deliveryHistory) ? deliveryHistory : []).find(o => o?.id === order.id);
  const reported = !!ticket || order.reported || (liveOrder && liveOrder.reported) || false;
  const resolved = ticket ? (ticket.status === 'resolved' || ticket.status === 'closed') : false;
  // Sans ticket retrouvé (pas encore relu), la liste des tickets.
  const ouvrirTicket = () => (ticket
    ? navigation.navigate('TicketChat', { ticketId: ticket.id, resolved })
    : navigation.navigate('TicketsList'));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 10 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1}>{t('deliveryDetail')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Status */}
        <View style={s.statusCard}>
          <Ionicons name="checkmark-circle" size={28} color={BRAND} />
          <View style={{ flex: 1 }}>
            <Text style={s.statusText}>{t('delivered')}</Text>
            <Text style={s.statusSub}>{t('dateAtTime', { date: formatDayMonth(order.completedAt || order.cancelledAt) || order.date, time: formatTime(order.completedAt || order.cancelledAt) || order.time })}</Text>
          </View>
        </View>

        {/* Route */}
        <View style={s.routeCard}>
          <View style={s.routeRow}>
            <View style={s.dotGreen} />
            <View style={{ flex: 1 }}>
              <Text style={s.routeLabel}>{t('pickup')}</Text>
              <Text style={s.routeAddr}>{order.restaurant}</Text>
            </View>
          </View>
          <View style={s.routeLine} />
          <View style={s.routeRow}>
            <View style={s.dotRed} />
            <View style={{ flex: 1 }}>
              <Text style={s.routeLabel}>{t('delivery')}</Text>
              <Text style={s.routeAddr}>{order.address}</Text>
            </View>
          </View>
        </View>

        {/* Détails financiers */}
        <View style={s.detailCard}>
          <Text style={s.detailHeader}>{t('courseDetails')}</Text>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('order')}</Text>
            <Text style={s.detailValue}>{order.id}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('distance')}</Text>
            <Text style={s.detailValue}>{order.distanceText || order.distance}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('courseGain')}</Text>
            <Text style={s.detailValue}>{order.priceEur != null ? fmtPrice(Number(order.priceEur) || 0) : (order.priceText || order.price)}</Text>
          </View>
          {!!order.tip && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('tip')}</Text>
              <Text style={[s.detailValue, { color: BRAND }]}>{order.tipEur != null ? fmtPrice(Number(order.tipEur) || 0) : order.tip}</Text>
            </View>
          )}
          {Number(order.bonusEur) > 0 && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('demandBonus')}</Text>
              <Text style={[s.detailValue, { color: '#00A86B' }]}>{fmtPrice(Number(order.bonusEur))}</Text>
            </View>
          )}
          <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={[s.detailLabel, { fontWeight: '800' }]}>{t('total')}</Text>
            <Text style={[s.detailValue, { fontWeight: '900', fontSize: 18, color: BRAND }]}>
              {fmtPrice((order.priceEur != null ? (Number(order.priceEur) || 0) : parseNum(order.priceText || order.price))
                + (order.tipEur != null ? (Number(order.tipEur) || 0) : parseNum(order.tip))
                + (Number(order.bonusEur) || 0))}
            </Text>
          </View>
        </View>

        {/* Signalement */}
        {reported ? (
          <>
            <View style={[s.reportedCard, resolved && { backgroundColor: dark ? '#3a2414' : '#FFF1E8' }]}>
              <Ionicons name="checkmark-circle" size={20} color={resolved ? BRAND : '#f5a623'} style={{ marginRight: 8 }} />
              <Text style={s.reportedTitle}>{resolved ? t('problemResolved') : t('problemReported')}</Text>
              {!resolved && <View style={s.pendingDot} />}
            </View>
            <Pressable style={s.ticketBtnSmall} onPress={ouvrirTicket}>
              <Ionicons name="chatbubbles-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={s.ticketBtnSmallTxt}>{t('openTicket')}</Text>
              <Ionicons name={dirIcon('chevron-forward')} size={14} color={colors.chevron} />
            </Pressable>
          </>
        ) : (
          <Pressable style={s.reportBtn} onPress={() => navigation.navigate('ReportProblem', { order })}>
            <Ionicons name="flag-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
            <Text style={s.reportBtnTxt}>{t('reportProblem')}</Text>
          </Pressable>
        )}

      </ScrollView>
      <StatusBarShield {...(dark ? { color: colors.bg } : {})} />

      {/* Fermer - fixé en bas */}
      <View style={s.closeBtnWrap}>
        <Pressable style={s.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={s.closeBtnTxt}>{t('close')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c, dark) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },

  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, marginHorizontal: 16, padding: 12, marginBottom: 8 },
  statusText: { fontSize: 17, fontWeight: '900', color: BRAND, marginLeft: 10 },
  statusSub: { fontSize: 13, color: dark ? c.textMuted : '#888', marginLeft: 10 },

  routeCard: { backgroundColor: c.card, borderRadius: 14, marginHorizontal: 16, padding: 12, marginBottom: 8 },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND, marginRight: 10 },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger, marginRight: 10 },
  routeLine: { width: 2, height: 14, backgroundColor: c.borderStrong, marginLeft: 4, marginVertical: 2 },
  routeLabel: { fontSize: 11, color: dark ? c.textMuted : '#888', fontWeight: '600' },
  routeAddr: { fontSize: 14, fontWeight: '700', color: c.text, marginTop: 1 },

  detailCard: { backgroundColor: c.card, borderRadius: 14, marginHorizontal: 16, padding: 12, marginBottom: 8 },
  detailHeader: { fontSize: 15, fontWeight: '800', color: c.text, marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: dark ? c.border : '#f0f0f0' },
  detailLabel: { fontSize: 13, color: dark ? c.textMuted : '#888', flexShrink: 1 },
  detailValue: { fontSize: 14, fontWeight: '700', color: c.text, marginLeft: 12, flexShrink: 1, textAlign: 'right' },

  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderRadius: 14, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: c.danger },
  reportBtnTxt: { color: c.danger, fontWeight: '700', fontSize: 14, flexShrink: 1 },

  reportedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: dark ? '#3a2f14' : '#fff8e6', borderRadius: 14, padding: 12, marginHorizontal: 16, marginBottom: 6 },
  reportedTitle: { flex: 1, fontWeight: '800', fontSize: 14, color: c.text },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f5a623' },

  ticketBtnSmall: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 8 },
  ticketBtnSmallTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: BRAND },
  helpRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 16 },
  helpText: { flex: 1, fontSize: 14, fontWeight: '600', color: dark ? c.textMuted : '#666' },

  closeBtnWrap: { backgroundColor: c.bg, paddingTop: 4, paddingBottom: 10, paddingHorizontal: 16 },
  closeBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14 },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
