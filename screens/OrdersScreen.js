import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Switch, TouchableOpacity, Pressable, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import OrderCard from '../components/OrderCard';
import DetailsSheet from '../components/DetailsSheet';
import { getMeauxSeed } from '../constants/mockOrders';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import filtersUI from '../constants/filters-ui.json';

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

/* ---------- Génération aléatoire ---------- */
const CATEGORIES = ['Food & Drink', 'Product Purchase', 'Groceries'];
const RESTOS = [
  'Pizzeria Roma, Meaux',
  'Le Bistrot, Meaux',
  'Chez Marcel, Meaux',
  'La Terrasse, Meaux',
  'Café du Pont, Meaux',
  'Sushi Zen, Meaux'
];
const ADDR = [
  '12 Rue Voltaire, Meaux',
  'Place Carnot, Meaux',
  '3 Bd Barbès, Meaux',
  '18 Rue de Verdun, Meaux',
  '6 Rue Trivalle, Meaux',
  '2 Rue de la République, Meaux'
];
const FOOD_ITEMS = [
  'Pizza Margherita', 'Burger Classic', 'Salade César', 'Pâtes Carbonara', 'Sushi Mix 12p',
  'Tacos Poulet', 'Wrap Végétarien', 'Tiramisu', 'Coca-Cola 33cl', 'Frites Maison',
  'Nems x4', 'Pad Thaï', 'Crêpe Nutella', 'Smoothie Fruits', 'Croissant Beurre',
];
const PRODUCT_ITEMS = [
  'Colis petit', 'Colis moyen', 'Enveloppe A4', 'Paquet fragile', 'Sac courses',
];

const rpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rfloat = (min, max, d=1) => (Math.random()*(max-min)+min).toFixed(d);
const rint = (min, max) => Math.floor(Math.random()*(max-min+1))+min;

let seq = 3000;
function genOrder() {
  const idNum = ++seq;
  const restaurant = rpick(RESTOS);
  const address = rpick(ADDR);
  const category = rpick(CATEGORIES);

  const km = Number(rfloat(0.8, 4.5, 1));
  const min = rint(6, 20);
  const price = Number((Math.random()*12 + 6).toFixed(2));

  // Fake coords (pas nécessaires mais utiles pour Itinéraire si dispo)
  const lat = 43.21 + Math.random()*0.02;
  const lng = 2.34 + Math.random()*0.03;

  const itemCount = rint(1, 5);
  const itemPool = category === 'Product Purchase' ? PRODUCT_ITEMS : FOOD_ITEMS;
  const orderItems = [];
  for (let j = 0; j < itemCount; j++) {
    const name = rpick(itemPool);
    const qty = category === 'Product Purchase' ? 1 : rint(1, 3);
    if (!orderItems.find(it => it.name === name)) orderItems.push({ name, qty });
  }

  return {
    id: `ORD-${idNum}`,
    category,
    restaurant,
    address,
    distanceText: `${km.toFixed(1)} km`,
    etaText: `${min} min`,
    priceText: `${price.toFixed(2)} €`,
    itemsCount: orderItems.reduce((s, it) => s + it.qty, 0),
    items: orderItems,
    dropoffAddress: address,
    dropoffLat: lat, dropoffLng: lng
  };
}

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

  // --- Simulateur Meaux (startMeauxFeed peut ne pas exister) ---
  React.useEffect(() => {
    try {
      if (typeof startMeauxFeed === 'function') {
        const stop = startMeauxFeed(setAvailable, 4000);
        return () => typeof stop==='function' && stop();
      }
    } catch {}
  }, []);

  React.useEffect(() => { //__SIM_MEAUX_FEED
    if (!__SIM_MEAUX) return;
    const seed = (typeof getMeauxSeed==='function' ? getMeauxSeed() : []);
    let i = 0;
    const tick = () => {
      const raw = seed[i % seed.length];
      i++;
      if (!raw) return;
      // Give each seed item a unique ID to avoid duplicate keys
      const item = { ...raw, id: raw.id || raw.code, _uid: `MX-${Date.now()}-${i}` };
      try {
        if (typeof setAvailable === 'function') {
          setAvailable(prev => {
            const key = item._uid;
            if (prev.find(o => o._uid === key)) return prev;
            const arr = [item, ...prev];
            return arr.slice(0, 12);
          });
        }
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 5000 + Math.floor(Math.random()*3000));
    return () => clearInterval(iv);
  }, []);

  const __SIM_MEAUX = true;

  const [detailsOrder, setDetailsOrder] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false); //__DETAILS_STATE_ANCHOR

  const online = isOnline;
  const setOnline = setIsOnline;
  const [active, setActive] = useState([]);           // En cours
  const [available, setAvailable] = useState([]);     // Disponibles
  const [history, setHistory] = useState([]);          // Historique
  const [activeSteps, setActiveSteps] = useState({}); // { orderId: { stepIndex, stepLabel } }
  const timerRef = useRef(null);

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

  // Seed initial si vide
  useEffect(() => {
    if (available.length === 0) {
      setAvailable([genOrder(), genOrder(), genOrder()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flux continu quand "En ligne" — throttled to reduce state updates
  useEffect(() => {
    if (!online) { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; return; }

    const schedule = () => {
      const delay = rint(6000, 10000); // 6–10s (throttled from 4–7s)
      timerRef.current = setTimeout(() => {
        setAvailable(prev => {
          // Cap à 12 éléments, pas de doublon d'id
          const next = genOrder();
          if (prev.find(o => o.id === next.id)) return prev;
          const arr = [next, ...prev];
          return arr.slice(0, 12);
        });
        schedule();
      }, delay);
    };
    schedule();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; };
  }, [online]);

  const onAccept = useCallback((order) => {
    const key = orderKey(order);
    setAvailable(prev => prev.filter(o => orderKey(o) !== key));
    setActive(prev => [{ ...order, status: 'active' }, ...prev]);
    setActiveSteps(prev => ({ ...prev, [key]: { stepIndex: 0, stepLabel: 'Récupération' } }));
    navigation.navigate('DeliveryFlow', { order });
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
