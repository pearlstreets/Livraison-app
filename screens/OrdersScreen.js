import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform } from 'react-native';
import OrderCard from '../components/OrderCard';

// --- Données de démo (simulateur) ---
const DEMO_AVAILABLE = [
  {
    id: 'ORD-2316',
    category: 'Food & Drink',
    restaurant: 'Le Bistrot, Carcassonne',
    address: 'Place Carnot, Carcassonne',
    distanceText: '1.4 km',
    etaText: '12 min',
    priceText: '15.90 €',
    dropoffAddress: 'Place Carnot, Carcassonne',
    dropoffLat: 43.214, dropoffLng: 2.352
  },
  {
    id: 'ORD-8622',
    category: 'Food & Drink',
    restaurant: 'Pizzeria Roma, Carcassonne',
    address: '12 Rue Voltaire, Carcassonne',
    distanceText: '2.1 km',
    etaText: '15 min',
    priceText: '23.80 €',
    dropoffAddress: '12 Rue Voltaire, Carcassonne',
    dropoffLat: 43.213, dropoffLng: 2.359
  }
];

export default function OrdersScreen() {
  // Listes locales (simulateur)
  const [active, setActive] = useState([]);
  const [available, setAvailable] = useState([]);

  // À l’ouverture: si tout est vide, on injecte les données de démo
  useEffect(() => {
    if (active.length === 0 && available.length === 0) {
      setAvailable(DEMO_AVAILABLE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAccept = useCallback((order) => {
    setAvailable(prev => prev.filter(o => (o.id || o.code) !== (order?.id || order?.code)));
    setActive(prev => [order, ...prev]);
  }, []);

  const onDecline = useCallback((order) => {
    setAvailable(prev => prev.filter(o => (o.id || o.code) !== (order?.id || order?.code)));
  }, []);

  const onOpen = useCallback((_order) => {
    // ici tu peux ouvrir un modal de détails si tu veux
  }, []);

  const keyOf = (o, i) => String(o?.id || o?.code || i);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      alwaysBounceVertical={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
    >
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

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 28, fontWeight: '800', color: '#111', marginTop: 8, marginBottom: 12 },
  sectionTitleGap: { marginTop: 24 },
  cardsBlock: { marginBottom: 4 },
  cardWrap: { marginBottom: 12 },
  emptyText: { color: '#8E8E93', paddingVertical: 8, paddingHorizontal: 4 }
});
