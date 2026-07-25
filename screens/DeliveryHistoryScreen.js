import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';

const BRAND = '#00C29B';

const HistoryOrderItem = React.memo(({ order, navigation, t }) => {
  const isCancelled = order.status === 'cancelled';
  const isReported = order.reported;
  const price = order.priceText || order.price || '';
  const distance = order.distanceText || order.distance || '';
  const iconColor = isCancelled ? '#e74c3c' : isReported ? '#e74c3c' : BRAND;
  const borderColor = isCancelled ? '#e74c3c' : isReported ? '#e74c3c' : BRAND;
  return (
    <Pressable style={[s.orderCard, { borderLeftColor: borderColor }, isCancelled && { opacity: 0.7 }]} onPress={() => !isCancelled && navigation.navigate('DeliveryDetail', { order })} disabled={isCancelled}>
      <View style={s.orderHeader}>
        <View style={s.checkWrap}>
          <Ionicons name={isCancelled ? 'close-circle' : isReported ? 'hourglass' : 'checkmark-circle'} size={20} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.orderId}>{order.id}</Text>
            <Text style={[s.orderPrice, isCancelled && { color: '#999' }]}>{isCancelled ? '0,00 \u20ac' : price}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[s.orderTime, isCancelled && { color: '#e74c3c' }]}>
              {isCancelled ? `${t('cancelledAt')} ${order.time}` : order.time}
            </Text>
            {!isCancelled && order.tip && <Text style={s.orderTip}>+ {order.tip} {t('tip')}</Text>}
          </View>
        </View>
      </View>
      <View style={s.orderDetails}>
        <View style={s.detailRow}>
          <Ionicons name="storefront-outline" size={14} color="#888" />
          <Text style={s.detailText} numberOfLines={1}>{order.restaurant}</Text>
        </View>
        <View style={s.detailRow}>
          <Ionicons name="location-outline" size={14} color="#888" />
          <Text style={s.detailText} numberOfLines={1}>{order.address}</Text>
        </View>
        {!!distance && (
          <View style={s.detailRow}>
            <Ionicons name="navigate-outline" size={14} color="#888" />
            <Text style={s.detailText}>{distance}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function DeliveryHistoryScreen({ navigation }) {
  const { t } = useLanguage();
  const { deliveryHistory } = useAuth();
  const { fmtPrice } = useCurrency();
  const insets = useSafeAreaInsets();

  const parsePrice = useCallback((p) => { const n = parseFloat(String(p).replace(',', '.')); return isNaN(n) ? 0 : n; }, []);

  // Memoize stats to avoid recomputation
  const { totalEarnings, totalTips, totalOrders } = useMemo(() => ({
    totalEarnings: deliveryHistory.filter(o => o.status !== 'cancelled').reduce((s, o) => s + parsePrice(o.priceText), 0),
    totalTips: deliveryHistory.reduce((s, o) => s + (o.tip ? parsePrice(o.tip) : 0), 0),
    totalOrders: deliveryHistory.length,
  }), [deliveryHistory, parsePrice]);

  // Memoize date grouping for SectionList
  const sections = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getDate()} ${['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'][now.getMonth()]}`;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = `${yesterday.getDate()} ${['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'][yesterday.getMonth()]}`;

    const getDateLabel = (order) => {
      const d = order.date || '';
      if (d === todayStr) return t('today');
      if (d === yesterdayStr) return t('yesterday');
      return d;
    };

    const groups = [];
    let currentDate = null;
    deliveryHistory.forEach(o => {
      const label = getDateLabel(o);
      if (label !== currentDate) {
        currentDate = label;
        groups.push({ title: label, data: [] });
      }
      groups[groups.length - 1].data.push(o);
    });
    return groups;
  }, [deliveryHistory, t]);

  const renderItem = useCallback(({ item }) => (
    <HistoryOrderItem order={item} navigation={navigation} t={t} />
  ), [navigation, t]);

  const renderSectionHeader = useCallback(({ section }) => (
    <Text style={s.dateHeader}>{section.title}</Text>
  ), []);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <View style={s.container}>
      {/* Header + Stats fixés en haut */}
      <View style={{ backgroundColor: '#f5f5f5' }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('historyTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{totalOrders}</Text>
            <Text style={s.statLabel}>{t('courses')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: BRAND }]}>{fmtPrice(totalEarnings)}</Text>
            <Text style={s.statLabel}>{t('gains')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: '#00C29B' }]}>{fmtPrice(totalTips)}</Text>
            <Text style={s.statLabel}>{t('tips')}</Text>
          </View>
        </View>
      </View>

      {/* Liste scrollable - SectionList for windowed rendering */}
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '900', color: '#111' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },

  dateHeader: { fontSize: 16, fontWeight: '800', color: '#111', paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },

  orderCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12, padding: 10, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: BRAND },
  orderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  checkWrap: { marginRight: 10 },
  orderId: { fontWeight: '800', fontSize: 14, color: '#111' },
  orderTime: { fontSize: 11, color: '#999', marginTop: 1 },
  orderPrice: { fontWeight: '900', fontSize: 15, color: BRAND },
  orderTip: { fontSize: 11, color: '#00C29B', fontWeight: '700', marginTop: 1 },
  orderTotal: { fontSize: 12, fontWeight: '900', color: '#111', marginTop: 1 },

  orderDetails: { marginLeft: 30 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  detailText: { fontSize: 12, color: '#666', flexShrink: 1 },
});
