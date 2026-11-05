import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatDayMonth, isSameDay } from '../lib/i18nFormat';

const BRAND = '#FF6A13';

const HistoryOrderItem = React.memo(({ order, navigation, t, fmtPrice }) => {
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const isCancelled = order.status === 'cancelled';
  const isReported = order.reported;
  // Montants en devise du livreur (fmtPrice), depuis les valeurs en euros.
  const price = fmtPrice(Number(order.priceEur) || 0);
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
            <Text style={[s.orderPrice, isCancelled && { color: colors.textFaint }]}>{isCancelled ? fmtPrice(0) : price}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[s.orderTime, isCancelled && { color: '#e74c3c' }]}>
              {isCancelled ? `${t('cancelledAt')} ${order.time}` : order.time}
            </Text>
            {!isCancelled && Number(order.tipEur) > 0 && <Text style={s.orderTip}>+ {fmtPrice(Number(order.tipEur))} {t('tip')}</Text>}
          </View>
          {!isCancelled && Number(order.bonusEur) > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Text style={s.orderBonus}>+ {fmtPrice(Number(order.bonusEur))} {t('bonusShort')}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={s.orderDetails}>
        <View style={s.detailRow}>
          <Ionicons name="storefront-outline" size={14} color={colors.dark ? colors.textMuted : '#888'} />
          <Text style={s.detailText} numberOfLines={1}>{order.restaurant}</Text>
        </View>
        <View style={s.detailRow}>
          <Ionicons name="location-outline" size={14} color={colors.dark ? colors.textMuted : '#888'} />
          <Text style={s.detailText} numberOfLines={1}>{order.address}</Text>
        </View>
        {!!distance && (
          <View style={s.detailRow}>
            <Ionicons name="navigate-outline" size={14} color={colors.dark ? colors.textMuted : '#888'} />
            <Text style={s.detailText}>{distance}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function DeliveryHistoryScreen({ navigation }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const { deliveryHistory: historiqueBrut } = useAuth();
  // Liste toujours exploitable, même si le contexte n'en fournit pas encore.
  const deliveryHistory = Array.isArray(historiqueBrut) ? historiqueBrut : [];
  const { fmtPrice } = useCurrency();
  const insets = useSafeAreaInsets();

  // Totaux sur les livraisons effectuées seulement (annulées exclues).
  const { totalEarnings, totalTips, totalOrders } = useMemo(() => {
    const livrees = deliveryHistory.filter(o => o.status !== 'cancelled');
    return {
      totalEarnings: livrees.reduce((s, o) => s + (Number(o.priceEur) || 0) + (Number(o.bonusEur) || 0), 0),
      totalTips: livrees.reduce((s, o) => s + (Number(o.tipEur) || 0), 0),
      totalOrders: livrees.length,
    };
  }, [historiqueBrut]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoize date grouping for SectionList
  const sections = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);

    // Regroupement par vraie date (et non par libellé français « 3 sept »).
    const getDateLabel = (order) => {
      const when = order.completedAt || order.cancelledAt;
      if (isSameDay(when, now)) return t('today');
      if (isSameDay(when, yesterday)) return t('yesterday');
      return formatDayMonth(when) || order.date || '';
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
  }, [historiqueBrut, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderItem = useCallback(({ item }) => (
    <HistoryOrderItem order={item} navigation={navigation} t={t} fmtPrice={fmtPrice} />
  ), [navigation, t, fmtPrice]);

  const renderSectionHeader = useCallback(({ section }) => (
    <Text style={s.dateHeader}>{section.title}</Text>
  ), [s]);

  // Clé de secours si une course n'a pas d'identifiant (évite clés vides ou en double).
  const keyExtractor = useCallback((item, index) => (item?.id != null ? String(item.id) : `course-${index}`), []);

  return (
    <View style={s.container}>
      {/* Header + Stats fixés en haut */}
      <View style={{ backgroundColor: colors.bg }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
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
            <Text style={[s.statValue, { color: '#FF6A13' }]}>{fmtPrice(totalTips)}</Text>
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

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: c.card, borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '900', color: c.text },
  statLabel: { fontSize: 12, color: c.dark ? c.textMuted : '#888', marginTop: 4 },

  dateHeader: { fontSize: 16, fontWeight: '800', color: c.text, paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },

  orderCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 12, padding: 10, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: BRAND },
  orderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  checkWrap: { marginRight: 10 },
  orderId: { fontWeight: '800', fontSize: 14, color: c.text },
  orderTime: { fontSize: 11, color: c.textFaint, marginTop: 1 },
  orderPrice: { fontWeight: '900', fontSize: 15, color: BRAND },
  orderTip: { fontSize: 11, color: '#FF6A13', fontWeight: '700', marginTop: 1 },
  orderBonus: { fontSize: 11, color: '#00A86B', fontWeight: '700', marginTop: 1 },
  orderTotal: { fontSize: 12, fontWeight: '900', color: c.text, marginTop: 1 },

  orderDetails: { marginLeft: 30 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  detailText: { fontSize: 12, color: c.dark ? c.textMuted : '#666', flexShrink: 1 },
});

// Feuilles de style par thème (clair, sombre), créées une seule fois chacune.
const stylesParTheme = new Map();
function stylesPour(c) {
  if (!stylesParTheme.has(c)) stylesParTheme.set(c, makeStyles(c));
  return stylesParTheme.get(c);
}
