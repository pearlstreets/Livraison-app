import InlineFilters from '../components/InlineFilters';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Switch, TouchableOpacity } from 'react-native';
import OrderCard from '../components/OrderCard';
import DetailsSheet from '../components/DetailsSheet';
import { getMeauxSeed } from '../constants/mockOrders';
import filtersUI from '../constants/filters-ui.json';

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

  return {
    id: `ORD-${idNum}`,
    category,
    restaurant,
    address,
    distanceText: `${km.toFixed(1)} km`,
    etaText: `${min} min`,
    priceText: `${price.toFixed(2)} €`,
    dropoffAddress: address,
    dropoffLat: lat, dropoffLng: lng
  };
}

/* ---------- Écran ---------- */
const InlineFilters = ({ selected, onChange }) => {
  const UI = (filtersUI && filtersUI.inline) || {};
  const H = UI.height ?? 28, R = UI.radius ?? 14, GAP = UI.gap ?? 6, PH = UI.paddingH ?? 10, FZ = UI.fontSize ?? 13;
  const items = [
    { id:'smart',   label:(UI.labels&&UI.labels.smart)||'Smart' },
    { id:'highpay', label:(UI.labels&&UI.labels.highpay)||'€' },
    { id:'nearest', label:(UI.labels&&UI.labels.nearest)||'Proche' }
  ];
  return (
    <View style={{ flexDirection:'row' }}>
      {items.map((f, i)=>(
        <TouchableOpacity key={f.id} onPress={()=>onChange&&onChange(f.id)}
          style={{
            height:H, paddingHorizontal:PH, borderRadius:R,
            alignItems:'center', justifyContent:'center',
            backgroundColor: selected===f.id ? '#00C29B' : '#F2F3F5',
            marginLeft: i===0 ? 0 : GAP
          }}>
          <Text style={{ fontSize:FZ, fontWeight:'700', color:selected===f.id?'#fff':'#111' }}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default function OrdersScreen() {
  const [selectedFilter, setSelectedFilter] = useState('smart');
  const filters = [{id:'smart',label:'Smart'},{id:'highpay',label:'€'},{id:'nearest',label:'Proche'}];

  // --- Simulateur Meaux uniquement ---
  React.useEffect(() => {
    try {
      const stop = startMeauxFeed(setAvailable, 4000);
      return () => typeof stop==='function' && stop();
    } catch {}
  }, []);

  React.useEffect(() => { //__SIM_MEAUX_FEED
    if (!__SIM_MEAUX) return;
    const seed = (typeof getMeauxSeed==='function' ? getMeauxSeed() : []);
    let i = 0;
    const tick = () => {
      const item = seed[i % seed.length];
      i++;
      if (!item) return;
      try {
        if (typeof setAvailable === 'function') {
          setAvailable(prev => [item, ...(Array.isArray(prev)?prev:[])]);
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

  const [online, setOnline] = useState(true);
  const [active, setActive] = useState([]);           // En cours
  const [available, setAvailable] = useState([]);     // Disponibles
  const timerRef = useRef(null);

  // Seed initial si vide
  useEffect(() => {
    if (available.length === 0) {
      setAvailable([genOrder(), genOrder(), genOrder()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flux continu quand "En ligne"
  useEffect(() => {
    if (!online) { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; return; }

    const schedule = () => {
      const delay = rint(4000, 7000); // 4–7s
      timerRef.current = setTimeout(() => {
        setAvailable(prev => {
          // Cap à 12 éléments, pas de doublon d'id
          const next = genOrder();
          if (prev.find(o => (o.id||o.code) === next.id)) return prev;
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
    setAvailable(prev => prev.filter(o => (o.id||o.code) !== (order?.id||order?.code)));
    setActive(prev => [{ ...order, status: 'active' }, ...prev]);
  }, []);

  const onDecline = useCallback((order) => {
    setAvailable(prev => prev.filter(o => (o.id||o.code) !== (order?.id||order?.code)));
  }, []);

    const keyOf = (o, i) => String(o?.id || o?.code || i);

  const onOpen = useCallback((order)=>{ setDetailsOrder(order); setDetailsVisible(true); }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      alwaysBounceVertical={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
    >
      {/* Bandeau En ligne */}
      <View style={styles.onlineCard}>
        <Text style={styles.onlineText}>En ligne</Text>
        <Switch
          value={online}
          onValueChange={setOnline}
          trackColor={{ true: '#00C29B', false: '#E6E8EB' }}
          thumbColor={online ? '#fff' : '#fff'}
        />
      </View>

      {/* En cours */}
      {active.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>En cours</Text>
          <View style={styles.cardsBlock}>
            {active.map((order, i) => (
              <View key={keyOf(order, i)} style={styles.cardWrap}>
                <OrderCard
                  order={order}
                  initialAccepted
                  onAccept={onAccept}
                  onDecline={onDecline}
                  onOpen={onOpen}
                />
              </View>
            ))}
          </View>
        </>
      )}

      {/* Disponibles */}
      <Text style={[styles.sectionTitle, active.length > 0 && styles.sectionTitleGap]}>
        Disponibles
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
          <Text style={styles.emptyText}>Aucune commande</Text>
        )}
      </View>
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

  sectionTitle: { fontSize: 28, fontWeight: '800', color: '#111', marginTop: 8, marginBottom: 12 },
  sectionTitleGap: {  marginTop: 12  },
  cardsBlock: {  marginBottom: 2  },
  cardWrap: { marginBottom: 12 },
  emptyText: { color: '#8E8E93', paddingVertical: 8, paddingHorizontal: 4 }
});
