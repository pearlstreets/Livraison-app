import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Switch, TouchableOpacity, Pressable, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import OrderCard from '../components/OrderCard';
import DetailsSheet from '../components/DetailsSheet';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import filtersUI from '../constants/filters-ui.json';
import { deliveryService } from '../services/deliveryService';

/* === Zone d'approche (avant acceptation) ===
   Avant acceptation, le livreur n'a besoin que de la zone : quartier, ville et
   code postal. Ni nom, ni téléphone, ni numéro de rue. Les champs vides sont
   simplement ignorés pour ne jamais afficher un libellé vide. */
function buildZoneLabel(a) {
  const ua = (a && a.user_address) || {};
  return [ua.road_area_colony, ua.city, ua.pincode || ua.postalCode]
    .map(v => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(', ');
}

/* === Adaptateur backend assignment → forme attendue par OrderCard ===
   `revealCustomer` : vrai une fois la course acceptée (le backend envoie alors
   l'adresse complète et le téléphone). Faux pour la liste des disponibles. */
function adaptAssignment(a, { revealCustomer = true } = {}) {
  const fee = typeof a.delivery_fee === 'number' ? a.delivery_fee : 0;
  const tip = typeof a.tip_amount === 'number' ? a.tip_amount : 0;
  const total = fee + tip;
  const items = Array.isArray(a.order_items)
    ? a.order_items.map(it => ({ name: it.name || '', qty: typeof it.quantity === 'number' ? it.quantity : 1 }))
    : [];
  // Avant acceptation : la zone remplace l'adresse de livraison si elle est
  // disponible, sinon on garde ce que le backend a envoyé (déjà restreint).
  const zone = revealCustomer ? '' : buildZoneLabel(a);
  const dropoff = revealCustomer ? (a.dropoff_address || '') : (zone || a.dropoff_address || '');
  return {
    // identifiants
    id: String(a.order_id || a.id || ''),   // clé numérique (accept / API)
    orderNumber: a.order_number || '',       // numéro OFFICIEL affiché (code marchand)
    _assignmentId: a.id,          // conservé pour les appels updateDeliveryStatus
    order_id: a.order_id,
    // affichage — vraie boutique (nom réel + image + adresse réelle du shop)
    restaurant: a.shop_name || a.pickup_address || '',
    shopName: a.shop_name || '',
    shopImage: a.shop_image || '',
    address: a.pickup_address || dropoff || '',
    dropoffAddress: dropoff,
    pickupAddress: a.pickup_address || '',
    distanceText: typeof a.distance_km === 'number' ? `${a.distance_km.toFixed(1)} km` : '',
    etaText: typeof a.estimated_time_minutes === 'number' ? `${a.estimated_time_minutes} min` : '',
    priceText: `${total.toFixed(2)} €`,
    priceEur: total,
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
    // Nom du client : jamais affiché tant que la course n'est pas acceptée.
    customer_name: revealCustomer ? (a.customer_name || '') : '',
    // Téléphone client : le backend l'expose dans user_address.phone_number
    // (une fois la course acceptée) → permet un vrai appel depuis l'app.
    customerPhone: revealCustomer
      ? ((a.user_address && (a.user_address.phone_number || a.user_address.phone)) || a.customer_phone || '')
      : '',
    user_address: revealCustomer ? (a.user_address || {}) : {},
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

/* ---------- Mock generator (outil dev — simule une commande sans backend) ---------- */
const MOCK_RESTAURANTS = ['Burger Pearl', 'Pizza Marco', 'Sushi Yama', 'Tacos Express', 'Curry House', 'Le Petit Bistrot'];
const MOCK_PICKUPS = [
  '12 Rue du Commerce, 75015 Paris',
  '34 Avenue Foch, 75116 Paris',
  '8 Rue de Rivoli, 75004 Paris',
  '45 Boulevard Haussmann, 75009 Paris',
];
const MOCK_DROPOFFS = [
  '56 Rue Lafayette, 75009 Paris',
  '21 Boulevard Voltaire, 75011 Paris',
  '7 Rue de la Roquette, 75011 Paris',
  '99 Avenue des Champs-Élysées, 75008 Paris',
];
const MOCK_ITEMS_SETS = [
  [{ name: 'Burger Classique', qty: 1 }, { name: 'Frites', qty: 1 }, { name: 'Coca 33cl', qty: 1 }],
  [{ name: 'Pizza Margherita', qty: 1 }, { name: 'Tiramisu', qty: 1 }],
  [{ name: 'Sushi mix 12 pcs', qty: 1 }, { name: 'Soupe miso', qty: 2 }],
  [{ name: 'Tacos M', qty: 2 }, { name: 'Eau plate', qty: 1 }],
  [{ name: 'Poulet curry', qty: 1 }, { name: 'Naan', qty: 2 }, { name: 'Riz basmati', qty: 1 }],
];
const MOCK_CUSTOMERS = ['Sophie M.', 'Lucas D.', 'Léa P.', 'Hugo R.', 'Emma F.', 'Noah B.', 'Chloé V.'];
let __MOCK_SEQ = 1;
function makeMockOrder() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const distance = +(0.8 + Math.random() * 5.2).toFixed(1);
  const eta = Math.round(8 + distance * 3);
  const fee = +(3 + Math.random() * 5).toFixed(2);
  const tip = Math.random() > 0.5 ? +(1 + Math.random() * 3).toFixed(2) : 0;
  const total = +(fee + tip).toFixed(2);
  const items = pick(MOCK_ITEMS_SETS);
  const seq = __MOCK_SEQ++;
  return {
    _isMock: true,
    _uid: `mock-${Date.now()}-${seq}`,
    id: `MOCK-${String(seq).padStart(4, '0')}`,
    _assignmentId: `mock-asg-${seq}`,
    order_id: `mock-${seq}`,
    restaurant: pick(MOCK_RESTAURANTS),
    address: pick(MOCK_DROPOFFS),
    dropoffAddress: pick(MOCK_DROPOFFS),
    pickupAddress: pick(MOCK_PICKUPS),
    distanceText: `${distance.toFixed(1)} km`,
    etaText: `${eta} min`,
    priceText: `${total.toFixed(2)} €`,
    priceEur: total,
    delivery_fee: fee,
    tip_amount: tip,
    itemsCount: items.reduce((s, it) => s + it.qty, 0),
    items,
    dropoffLat: 48.8566 + (Math.random() - 0.5) * 0.05,
    dropoffLng: 2.3522 + (Math.random() - 0.5) * 0.05,
    pickupLat: 48.8566 + (Math.random() - 0.5) * 0.05,
    pickupLng: 2.3522 + (Math.random() - 0.5) * 0.05,
    status: 'available',
    delivery_code: String(Math.floor(1000 + Math.random() * 9000)),
    customer_name: pick(MOCK_CUSTOMERS),
    user_address: {},
    created_at: new Date().toISOString(),
  };
}

/* ---------- Écran ---------- */
const orderKey = (o) => o?._uid || o?.id || o?.code;

// Compte de démonstration remis aux vérificateurs Apple et Google. La liste
// "Disponibles" dépend de commandes marchandes réelles et se trouve donc
// presque toujours vide pendant une vérification : ce compte conserve le
// générateur de commande de test pour que le parcours complet reste
// vérifiable, sans exposer le bouton aux vrais livreurs.
const REVIEW_ACCOUNT_EMAIL = 'king@gmail.com';

export default function OrdersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { accountActive, addToHistory, isOnline, setIsOnline, user } = useAuth();
  const { t } = useLanguage();
  // Symbole de la devise du livreur : le filtre « bien payé » affichait « € »
  // en dur, incohérent avec les montants des courses désormais convertis.
  const { symbol: currencySymbol } = useCurrency();
  const scrollRef = useRef(null);
  const [selectedFilter, setSelectedFilter] = useState('smart');
  const filters = [{id:'smart',label:'Smart'},{id:'highpay',label:currencySymbol},{id:'nearest',label:'Proche'}];

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  // --- Poll commandes disponibles toutes les 15s quand En ligne ---
  const pollRef = useRef(null);

  const fetchAvailableOrders = useCallback(async () => {
    try {
      const res = await deliveryService.getAvailableOrders();
      const data = Array.isArray(res?.data) ? res.data : [];
      // Liste des disponibles : coordonnées client masquées tant que la course
      // n'est pas acceptée (zone + distance suffisent pour décider).
      setAvailable(data.map(a => adaptAssignment(a, { revealCustomer: false })));
    } catch {
      // Silencieux : on garde la liste actuelle plutôt que de crasher
    }
  }, []);

  const [detailsOrder, setDetailsOrder] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false); //__DETAILS_STATE_ANCHOR

  const online = isOnline;
  const setOnline = setIsOnline;
  const [active, setActive] = useState([]);           // En cours
  const [available, setAvailable] = useState([]);     // Disponibles (backend)
  const [mockOrders, setMockOrders] = useState([]);   // Disponibles simulées (dev)
  const [activeSteps, setActiveSteps] = useState({}); // { orderId: { stepIndex, stepLabel } }

  const addMockOrder = useCallback(() => {
    setMockOrders(prev => [makeMockOrder(), ...prev]);
  }, []);

  const canSimulate = __DEV__
    || String(user?.email || '').trim().toLowerCase() === REVIEW_ACCOUNT_EMAIL;

  const displayedAvailable = useMemo(() => [...mockOrders, ...available], [mockOrders, available]);

  // Handle completed order from DeliveryFlow
  useEffect(() => {
    const completedOrder = route?.params?.completedOrder;
    if (completedOrder) {
      const key = orderKey(completedOrder);
      setActive(prev => prev.filter(o => orderKey(o) !== key));
      setActiveSteps(prev => { const n = { ...prev }; delete n[key]; return n; });
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
    // Commande simulée : aucun appel backend, transition directe vers active
    if (order?._isMock) {
      setMockOrders(prev => prev.filter(o => orderKey(o) !== key));
      const accepted = { ...order, status: 'active' };
      setActive(prev => [accepted, ...prev]);
      setActiveSteps(prev => ({ ...prev, [orderKey(accepted)]: { stepIndex: 0, stepLabel: 'Récupération' } }));
      navigation.navigate('DeliveryFlow', { order: accepted });
      return;
    }
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

  const onDecline = useCallback(async (order) => {
    const key = orderKey(order);
    setAvailable(prev => prev.filter(o => orderKey(o) !== key));
    setMockOrders(prev => prev.filter(o => orderKey(o) !== key));
    // Refus RÉEL de l'offre chronométrée → le backend la ré-offre au suivant.
    try { if (order?.order_id) await deliveryService.declineDelivery(order.order_id); } catch (e) {}
  }, []);

    const keyOf = (o, i) => String(o?._uid || o?.id || o?.code || `order-${i}`);

  const onOpen = useCallback((order)=>{ setDetailsOrder(order); setDetailsVisible(true); }, []);

  const onFilterChange = useCallback((id) => setSelectedFilter(id), []);

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
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, active.length > 0 && styles.sectionTitleGap]}>
              {t('available')}
            </Text>
            {canSimulate && (
              <TouchableOpacity
                style={styles.mockBtn}
                onPress={addMockOrder}
                accessibilityLabel="Simuler une commande"
              >
                <Ionicons name="flask-outline" size={16} color="#fff" />
                <Text style={styles.mockBtnTxt}>Simuler</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.cardsBlock}>
            {displayedAvailable.length > 0 ? (
              displayedAvailable.map((order, i) => (
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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mockBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#00C29B', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  mockBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
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

});
