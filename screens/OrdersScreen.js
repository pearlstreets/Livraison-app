import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Switch, TouchableOpacity, Pressable, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import OrderCard from '../components/OrderCard';
import DetailsSheet from '../components/DetailsSheet';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import filtersUI from '../constants/filters-ui.json';
import { deliveryService } from '../services/deliveryService';

/* === Adaptateur backend assignment → forme attendue par OrderCard === */
function adaptAssignment(a) {
  const fee = typeof a.delivery_fee === 'number' ? a.delivery_fee : 0;
  const tip = typeof a.tip_amount === 'number' ? a.tip_amount : 0;
  const total = fee + tip;
  const items = Array.isArray(a.order_items)
    ? a.order_items.map(it => ({ name: it.name || '', qty: typeof it.quantity === 'number' ? it.quantity : 1 }))
    : [];
  return {
    // identifiants
    id: String(a.order_id || a.id || ''),
    _assignmentId: a.id,          // conservé pour les appels updateDeliveryStatus
    order_id: a.order_id,
    // affichage
    restaurant: a.pickup_address || '',
    address: a.dropoff_address || '',
    dropoffAddress: a.dropoff_address || '',
    pickupAddress: a.pickup_address || '',
    distanceText: typeof a.distance_km === 'number' ? `${a.distance_km.toFixed(1)} km` : '',
    etaText: typeof a.estimated_time_minutes === 'number' ? `${a.estimated_time_minutes} min` : '',
    priceText: `${total.toFixed(2)} €`,
    delivery_fee: fee,
    tip_amount: tip,
    itemsCount: items.reduce((s, it) => s + it.qty, 0),
    items,
    // coordonnées
    dropoffLat: a.dropoff_lat,
    dropoffLng: a.dropoff_lng,
    pickupLat: a.pickup_lat,
    pickupLng: a.pickup_lng,
    // méta
    status: a.status || '',
    delivery_code: a.delivery_code || '',
    customer_name: a.customer_name || '',
    user_address: a.user_address || {},
    created_at: a.created_at || '',
  };
}

/* === Filtres inline (unique) === */
const OrdersInlineFilters = React.memo(({ selected, onChange, filters = [] }) => {
  const UI = (filtersUI && filtersUI.inline) || {};
  const H = UI.height ?? 28, R = UI.radius ?? 14, GAP = UI.gap ?? 6, PH = UI.paddingH ?? 10, FZ = UI.fontSize ?? 13;
  const labels = UI.labels || {};
  return (
    <View style={{ flexDirection:'row', gap:GAP }}>
      {filters.map(f => (
        <TouchableOpacity
          key={f.id}
          onPress={() => onChange && onChange(f.id)}
          style={{
            height:H, paddingHorizontal:PH, borderRadius:R,
            alignItems:'center', justifyContent:'center',
            backgroundColor: selected===f.id ? '#00C29B' : '#F2F3F5'
          }}
        >
          <Text style={{ fontSize:FZ, fontWeight:'700', color: selected===f.id ? '#fff' : '#111' }}>
            { labels[f.id] ?? f.label ?? f.id }
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});

/* ---------- Helpers clé ---------- */
const rint = (min, max) => Math.floor(Math.random()*(max-min+1))+min;

/* ---------- Écran ---------- */
const orderKey = (o) => o?._uid || o?.id || o?.code;

export default function OrdersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { accountActive, addToHistory, isOnline, setIsOnline } = useAuth();
  const { t } = useLanguage();
  const scrollRef = useRef(null);
  const [selectedFilter, setSelectedFilter] = useState('smart');
  const filters = [{id:'smart',label:'Smart'},{id:'highpay',label:'€'},{id:'nearest',label:'Proche'}];

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  // --- Poll commandes disponibles toutes les 15s quand En ligne ---
  const pollRef = useRef(null);

  const fetchAvailableOrders = useCallback(async () => {
    try {
      const res = await deliveryService.getAvailableOrders();
      const data = Array.isArray(res?.data) ? res.data : [];
      setAvailable(data.map(adaptAssignment));
    } catch {
      // Silencieux : on garde la liste actuelle plutôt que de crasher
    }
  }, []);

  const [detailsOrder, setDetailsOrder] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false); //__DETAILS_STATE_ANCHOR

  const online = isOnline;
  const setOnline = setIsOnline;
  const [active, setActive] = useState([]);           // En cours
  const [available, setAvailable] = useState([]);     // Disponibles
  const [history, setHistory] = useState([]);          // Historique
  const [activeSteps, setActiveSteps] = useState({}); // { orderId: { stepIndex, stepLabel } }

  // Handle completed order from DeliveryFlow
  useEffect(() => {
    const completedOrder = route?.params?.completedOrder;
    if (completedOrder) {
      const key = orderKey(completedOrder);
      setActive(prev => prev.filter(o => orderKey(o) !== key));
      setActiveSteps(prev => { const n = { ...prev }; delete n[key]; return n; });
      setHistory(prev => {
        if (prev.find(o => orderKey(o) === key)) return prev;
        return [completedOrder, ...prev];
      });
      addToHistory(completedOrder);
      navigation.setParams({ completedOrder: undefined });
    }
  }, [route?.params?.completedOrder]);

  // Handle cancelled order from DeliveryFlow
  useEffect(() => {
    const cancelledOrder = route?.params?.cancelledOrder;
    if (cancelledOrder) {
      const key = orderKey(cancelledOrder);
      setActive(prev => prev.filter(o => orderKey(o) !== key));
      setActiveSteps(prev => { const n = { ...prev }; delete n[key]; return n; });
      setHistory(prev => {
        if (prev.find(o => orderKey(o) === key)) return prev;
        return [cancelledOrder, ...prev];
      });
      addToHistory(cancelledOrder);
      navigation.setParams({ cancelledOrder: undefined });
    }
  }, [route?.params?.cancelledOrder]);

  // Update step info when returning from DeliveryFlow
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Read step from the DeliveryFlow route state
      const navState = navigation.getState?.();
      if (navState) {
        const dfRoute = navState.routes?.find(r => r.name === 'DeliveryFlow');
        if (dfRoute?.params?.order && dfRoute.params.currentStep != null) {
          const key = orderKey(dfRoute.params.order);
          setActiveSteps(prev => ({ ...prev, [key]: { stepIndex: dfRoute.params.currentStep, stepLabel: dfRoute.params.currentStepLabel || 'Récupération' } }));
        }
      }
    });
    return unsubscribe;
  }, [navigation]);

  // Poll toutes les 15s quand En ligne
  useEffect(() => {
    if (!online) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setAvailable([]);
      return;
    }
    // Premier fetch immédiat
    fetchAvailableOrders();
    pollRef.current = setInterval(fetchAvailableOrders, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [online, fetchAvailableOrders]);

  const onAccept = useCallback(async (order) => {
    const key = orderKey(order);
    // Retrait optimiste de la liste disponible
    setAvailable(prev => prev.filter(o => orderKey(o) !== key));
    try {
      const res = await deliveryService.acceptDelivery(order.order_id);
      const assignment = res?.data ? adaptAssignment(res.data) : { ...order, status: 'accepted' };
      setActive(prev => [{ ...assignment, status: 'active' }, ...prev]);
      setActiveSteps(prev => ({ ...prev, [orderKey(assignment)]: { stepIndex: 0, stepLabel: 'Récupération' } }));
      navigation.navigate('DeliveryFlow', { order: assignment });
    } catch {
      // Remettre la commande dans la liste si l'accept échoue
      setAvailable(prev => [order, ...prev]);
      Alert.alert('Erreur', 'Impossible d\'accepter la commande. Veuillez réessayer.');
    }
  }, [navigation]);

  const onResumeActive = useCallback((order) => {
    const key = orderKey(order);
    const stepInfo = activeSteps[key];
    navigation.navigate('DeliveryFlow', { order, initialStep: stepInfo?.stepIndex || 0 });
  }, [navigation, activeSteps]);

  const onDecline = useCallback((order) => {
    const key = orderKey(order);
    setAvailable(prev => prev.filter(o => orderKey(o) !== key));
  }, []);

    const keyOf = (o, i) => String(o?._uid || o?.id || o?.code || `order-${i}`);

  const onOpen = useCallback((order)=>{ setDetailsOrder(order); setDetailsVisible(true); }, []);

  const onFilterChange = useCallback((id) => setSelectedFilter(id), []);

  // Memoize history rendering data to avoid re-computation on every render
  const memoizedHistory = useMemo(() => history.map(order => {
    const id = order.id || order.code || '';
    const resto = order.restaurant || order.merchantName || '';
    const addr = order.dropoffAddress || order.address || '';
    const isCancelled = order.status === 'cancelled';
    const isReported = order.reported;
    const price = isCancelled ? '0,00 \u20ac' : (order.priceText || '');
    const dist = order.distanceText || '';
    const time = (order.completedAt || order.cancelledAt) ? new Date(order.completedAt || order.cancelledAt) : null;
    const timeStr = time ? `${time.getHours()}h${String(time.getMinutes()).padStart(2,'0')}` : '';
    const iconColor = isCancelled ? '#e74c3c' : isReported ? '#e74c3c' : '#00C29B';
    const borderColor = isCancelled ? '#e74c3c' : isReported ? '#e74c3c' : '#00C29B';
    return { id, resto, addr, isCancelled, isReported, price, dist, timeStr, iconColor, borderColor, order };
  }), [history]);

  if (!accountActive) {
    return (
      <View style={[styles.deactivatedContainer, { paddingTop: insets.top + 16 }]}>
        <Ionicons name="lock-closed" size={48} color="#e74c3c" />
        <Text style={styles.deactivatedTitle}>{t('accountDeactivated')}</Text>
        <Text style={styles.deactivatedSub}>{t('accountDeactivatedMsg')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12 }]}
      alwaysBounceVertical={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
    >
      {/* Bandeau En ligne / Hors ligne */}
      <View style={[styles.onlineCard, !online && { borderWidth: 1, borderColor: '#E6E8EB' }]}>
        <Text style={[styles.onlineText, !online && { color: '#999' }]}>{online ? t('online') : t('offline')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable style={styles.mapBtn} onPress={() => navigation.navigate('Heatmap')}>
            <Ionicons name="map" size={18} color="#00C29B" />
          </Pressable>
          <Switch
            value={online}
            onValueChange={(val) => {
              if (!val && active.length > 0) {
                Alert.alert(t('cannotGoOfflineTitle') || 'Impossible', t('cannotGoOfflineMsg') || 'Vous avez une commande en cours. Terminez-la avant de passer hors ligne.');
                return;
              }
              setOnline(val);
            }}
            trackColor={{ true: '#00C29B', false: '#E6E8EB' }}
            thumbColor={online ? '#fff' : '#fff'}
          />
        </View>
      </View>

      {/* Hors ligne message — centered vertically */}
      {!online && active.length === 0 && (
        <View style={{ alignItems: 'center', justifyContent: 'center', height: Dimensions.get('window').height - insets.top - insets.bottom - 200 }}>
          <Ionicons name="moon-outline" size={48} color="#ccc" />
          <Text style={styles.offlineTitle}>{t('youAreOffline')}</Text>
          <Text style={styles.offlineSub}>{t('offlineMsg')}</Text>
        </View>
      )}

      {/* Bottom go-online button */}
      {!online && (
        <Pressable style={styles.goOnlineBtn} onPress={() => setOnline(true)}>
          <Ionicons name="power" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.goOnlineBtnTxt}>{t('goOnline')}</Text>
        </Pressable>
      )}

      {/* En cours */}
      {online && active.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('inProgress')}</Text>
          <View style={styles.cardsBlock}>
            {active.map((order, i) => {
              const key = orderKey(order);
              const stepInfo = activeSteps[key];
              return (
                <Pressable key={keyOf(order, i)} style={styles.cardWrap} onPress={() => onResumeActive(order)}>
                  <View style={styles.activeCard}>
                    {/* Step status badge */}
                    <View style={styles.activeStepBadge}>
                      <Ionicons name={
                        stepInfo?.stepIndex === 0 ? 'storefront-outline' :
                        stepInfo?.stepIndex === 1 ? 'bicycle' :
                        stepInfo?.stepIndex === 2 ? 'location' :
                        stepInfo?.stepIndex === 3 ? 'keypad' : 'checkmark-circle'
                      } size={14} color="#fff" />
                      <Text style={styles.activeStepText}>{stepInfo?.stepLabel || 'Récupération'}</Text>
                    </View>
                    {/* Order info */}
                    <View style={styles.activeHeader}>
                      <Text style={styles.activeCode}>{order.id || order.code}</Text>
                      <Text style={styles.activePrice}>{order.priceText || order.price}</Text>
                    </View>
                    <View style={styles.activeDetailRow}>
                      <Ionicons name="storefront-outline" size={14} color="#888" />
                      <Text style={styles.activeDetailText} numberOfLines={1}>{order.restaurant || order.merchantName}</Text>
                    </View>
                    <View style={styles.activeDetailRow}>
                      <Ionicons name="location-outline" size={14} color="#888" />
                      <Text style={styles.activeDetailText} numberOfLines={1}>{order.dropoffAddress || order.address}</Text>
                    </View>
                    <View style={styles.activeFooter}>
                      <Text style={styles.activeContinue}>{t('continueDelivery')}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#00C29B" />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Disponibles (only when online) */}
      {online && (
        <>
          <Text style={[styles.sectionTitle, active.length > 0 && styles.sectionTitleGap]}>
            {t('available')}
          </Text>
          <View style={styles.cardsBlock}>
            {available.length > 0 ? (
              available.map((order, i) => (
                <View key={keyOf(order, i)} style={styles.cardWrap}>
                  <OrderCard
                    order={order}
                    onAccept={onAccept}
                    onDecline={onDecline}
                    onOpen={onOpen}
                  />
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('noOrders')}</Text>
            )}
          </View>
        </>
      )}
      {/* Historique */}
      {online && memoizedHistory.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, styles.sectionTitleGap]}>{t('history')}</Text>
          <View style={styles.cardsBlock}>
            {memoizedHistory.map((h, i) => (
                <View key={h.id || i} style={[styles.historyCard, { borderLeftColor: h.borderColor }]}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyIconWrap}>
                      <Ionicons name={h.isCancelled ? 'close-circle' : h.isReported ? 'hourglass' : 'checkmark-circle'} size={20} color={h.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyId}>{h.id}</Text>
                      <Text style={[styles.historyTime, h.isCancelled && { color: '#e74c3c' }]}>
                        {h.isCancelled ? `${t('cancelledAt')}${h.timeStr ? ` ${h.timeStr}` : ''}` : `${t('deliveredAt')}${h.timeStr ? ` ${h.timeStr}` : ''}`}
                      </Text>
                    </View>
                    <Text style={[styles.historyPrice, h.isCancelled && { color: '#999' }]}>{h.price}</Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <View style={styles.historyDetailRow}>
                      <Ionicons name="storefront-outline" size={14} color="#888" />
                      <Text style={styles.historyDetailText} numberOfLines={1}>{h.resto}</Text>
                    </View>
                    <View style={styles.historyDetailRow}>
                      <Ionicons name="location-outline" size={14} color="#888" />
                      <Text style={styles.historyDetailText} numberOfLines={1}>{h.addr}</Text>
                    </View>
                    {!!h.dist && (
                      <View style={styles.historyDetailRow}>
                        <Ionicons name="navigate-outline" size={14} color="#888" />
                        <Text style={styles.historyDetailText}>{h.dist}</Text>
                      </View>
                    )}
                  </View>
                </View>
            ))}
          </View>
        </>
      )}

      <DetailsSheet visible={detailsVisible} order={detailsOrder} onClose={() => setDetailsVisible(false)} />
    </ScrollView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 12 },

  onlineCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2
  },
  onlineText: { color: '#00C29B', fontWeight: '700', fontSize: 16 },
  mapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e6faf5', alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: 28, fontWeight: '800', color: '#111', marginTop: 4, marginBottom: 8 },
  sectionTitleGap: {  marginTop: 8  },
  cardsBlock: {  marginBottom: 0  },
  cardWrap: { marginBottom: 8 },
  emptyText: { color: '#8E8E93', paddingVertical: 8, paddingHorizontal: 4 },

  // Offline
  offlineTitle: { fontSize: 18, fontWeight: '800', color: '#999', marginTop: 12 },
  offlineSub: { fontSize: 14, color: '#bbb', marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  goOnlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C29B', borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginBottom: 16 },
  goOnlineBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Deactivated
  deactivatedContainer: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  deactivatedTitle: { fontSize: 22, fontWeight: '900', color: '#e74c3c', marginTop: 16, marginBottom: 8 },
  deactivatedSub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },

  // Active (en cours)
  activeCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderLeftWidth: 4, borderLeftColor: '#00C29B' },
  activeStepBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#00C29B', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, gap: 5, marginBottom: 8 },
  activeStepText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  activeCode: { fontWeight: '800', fontSize: 15, color: '#111' },
  activePrice: { fontWeight: '900', fontSize: 16, color: '#00C29B' },
  activeDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  activeDetailText: { fontSize: 13, color: '#666', flexShrink: 1 },
  activeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6, gap: 4 },
  activeContinue: { fontSize: 13, fontWeight: '700', color: '#00C29B' },

  // Historique
  historyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#00C29B' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  historyIconWrap: { marginRight: 10 },
  historyId: { fontWeight: '800', fontSize: 15, color: '#111' },
  historyTime: { fontSize: 12, color: '#999', marginTop: 1 },
  historyPrice: { fontWeight: '900', fontSize: 17, color: '#00C29B' },
  historyDetails: { marginLeft: 30 },
  historyDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  historyDetailText: { fontSize: 13, color: '#666', flexShrink: 1 },
});
