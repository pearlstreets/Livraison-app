import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const BRAND = '#00C29B';
const parseNum = (v) => { if (!v) return 0; const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };

export default function DeliveryDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { deliveryHistory } = useAuth();
  const insets = useSafeAreaInsets();
  const order = route.params?.order || {};

  // Read reported status from AuthContext (persisted)
  const liveOrder = deliveryHistory.find(o => o.id === order.id);
  const reported = order.reported || (liveOrder && liveOrder.reported) || false;
  const resolved = false;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 10 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('deliveryDetail')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Status */}
        <View style={s.statusCard}>
          <Ionicons name="checkmark-circle" size={28} color={BRAND} />
          <View>
            <Text style={s.statusText}>{t('delivered')}</Text>
            <Text style={s.statusSub}>{order.date} à {order.time}</Text>
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
              <Text style={s.routeAddr}>{
                (order?.user_address && [
                  order.user_address.house_building || order.user_address.address1,
                  order.user_address.road_area_colony || order.user_address.address2,
                  order.user_address.pincode || order.user_address.postalCode,
                  order.user_address.city,
                  order.user_address.country,
                ].filter(Boolean).join(', '))
                || order.address
              }</Text>
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
            <Text style={s.detailValue}>{order.priceText || order.price}</Text>
          </View>
          {order.tip && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('tip')}</Text>
              <Text style={[s.detailValue, { color: BRAND }]}>{order.tip}</Text>
            </View>
          )}
          <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={[s.detailLabel, { fontWeight: '800' }]}>{t('total')}</Text>
            <Text style={[s.detailValue, { fontWeight: '900', fontSize: 18, color: BRAND }]}>
              {(parseNum(order.priceText || order.price) + parseNum(order.tip)).toFixed(2)} €
            </Text>
          </View>
        </View>

        {/* Signalement */}
        {reported ? (
          <>
            <View style={[s.reportedCard, resolved && { backgroundColor: '#e6f7ee' }]}>
              <Ionicons name="checkmark-circle" size={20} color={resolved ? BRAND : '#f5a623'} style={{ marginRight: 8 }} />
              <Text style={s.reportedTitle}>{resolved ? t('problemResolved') : t('problemReported')}</Text>
              {!resolved && <View style={s.pendingDot} />}
            </View>
            <Pressable style={s.ticketBtnSmall} onPress={() => navigation.navigate('TicketChat', { order })}>
              <Ionicons name="chatbubbles-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={s.ticketBtnSmallTxt}>{t('openTicket')}</Text>
              <Ionicons name="chevron-forward" size={14} color="#ccc" />
            </Pressable>
          </>
        ) : (
          <Pressable style={s.reportBtn} onPress={() => navigation.navigate('ReportProblem', { order })}>
            <Ionicons name="flag-outline" size={18} color="#e74c3c" style={{ marginRight: 8 }} />
            <Text style={s.reportBtnTxt}>{t('reportProblem')}</Text>
          </Pressable>
        )}

      </ScrollView>

      {/* Fermer - fixé en bas */}
      <View style={s.closeBtnWrap}>
        <Pressable style={s.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={s.closeBtnTxt}>Fermer</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, padding: 12, marginBottom: 8 },
  statusText: { fontSize: 17, fontWeight: '900', color: BRAND, marginLeft: 10 },
  statusSub: { fontSize: 13, color: '#888', marginLeft: 10 },

  routeCard: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, padding: 12, marginBottom: 8 },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND, marginRight: 10 },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e74c3c', marginRight: 10 },
  routeLine: { width: 2, height: 14, backgroundColor: '#e0e0e0', marginLeft: 4, marginVertical: 2 },
  routeLabel: { fontSize: 11, color: '#888', fontWeight: '600' },
  routeAddr: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 1 },

  detailCard: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, padding: 12, marginBottom: 8 },
  detailHeader: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailLabel: { fontSize: 13, color: '#888' },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#111' },

  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: '#e74c3c' },
  reportBtnTxt: { color: '#e74c3c', fontWeight: '700', fontSize: 14 },

  reportedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff8e6', borderRadius: 14, padding: 12, marginHorizontal: 16, marginBottom: 6 },
  reportedTitle: { flex: 1, fontWeight: '800', fontSize: 14, color: '#111' },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f5a623' },

  ticketBtnSmall: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 8 },
  ticketBtnSmallTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: BRAND },
  helpRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 16 },
  helpText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#666' },

  closeBtnWrap: { backgroundColor: '#f5f5f5', paddingTop: 4, paddingBottom: 10, paddingHorizontal: 16 },
  closeBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 14, paddingVertical: 14 },
  closeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
