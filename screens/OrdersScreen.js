import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Switch } from 'react-native';
import OrderCard from '../components/OrderCard';

/* ---------- Génération aléatoire ---------- */
const CATEGORIES = ['Food & Drink', 'Product Purchase', 'Groceries'];
const RESTOS = [
  'Pizzeria Roma, Carcassonne',
  'Le Bistrot, Carcassonne',
  'Chez Marcel, Carcassonne',
  'La Terrasse, Carcassonne',
  'Café du Pont, Carcassonne',
  'Sushi Zen, Carcassonne'
];
const ADDR = [
  '12 Rue Voltaire, Carcassonne',
  'Place Carnot, Carcassonne',
  '3 Bd Barbès, Carcassonne',
  '18 Rue de Verdun, Carcassonne',
  '6 Rue Trivalle, Carcassonne',
  '2 Rue de la République, Carcassonne'
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
export default function OrdersScreen() {
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

  const onOpen = useCallback((_order) => {
    // tu peux mettre un modal ici si besoin
  }, []);

  const keyOf = (o, i) => String(o?.id || o?.code || i);

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
  sectionTitleGap: { marginTop: 24 },
  cardsBlock: { marginBottom: 4 },
  cardWrap: { marginBottom: 12 },
  emptyText: { color: '#8E8E93', paddingVertical: 8, paddingHorizontal: 4 }
});
