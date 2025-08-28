import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform } from 'react-native';
import OrderCard from '../components/OrderCard';

/**
 * Helper: force un tableau
 */
const toArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

/**
 * Écran Commandes
 * - Un seul ScrollView pour toute la page
 * - Section "En cours" (active) puis "Disponibles"
 * - Chaque item est un OrderCard (qui affiche nom d'établissement + adresse + chips)
 */
export default function OrdersScreen(props) {
  // Tente d'utiliser les données déjà présentes dans l'écran existant
  // (ex: state, props, route, etc.)
  const activeRaw =
    props?.active ??
    props?.route?.params?.active ??
    props?.route?.params?.ordersActive ??
    [];

  const availableRaw =
    props?.available ??
    props?.route?.params?.available ??
    props?.route?.params?.ordersAvailable ??
    [];

  const active = toArr(activeRaw);
  const available = toArr(availableRaw);

  // clés de rendu stables
  const keyOf = (order, i) => String(order?.id || order?.code || i);

  // mémo pour alléger les re-rendus
  const hasActive = active.length > 0;
  const hasAvailable = available.length > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      // iOS a un bounce agréable, Android moins : on lisse un peu
      alwaysBounceVertical={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
    >
      {/* Section En cours */}
      {hasActive && (
        <>
          <Text style={styles.sectionTitle}>En cours</Text>
          <View style={styles.cardsBlock}>
            {active.map((order, i) => (
              <View key={keyOf(order, i)} style={styles.cardWrap}>
                <OrderCard order={order} initialAccepted />
              </View>
            ))}
          </View>
        </>
      )}

      {/* Section Disponibles */}
      <Text style={[styles.sectionTitle, hasActive && styles.sectionTitleGap]}>
        Disponibles
      </Text>
      <View style={styles.cardsBlock}>
        {hasAvailable ? (
          available.map((order, i) => (
            <View key={keyOf(order, i)} style={styles.cardWrap}>
              <OrderCard order={order} />
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
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitleGap: {
    marginTop: 24,
  },
  cardsBlock: {
    marginBottom: 4,
  },
  cardWrap: {
    marginBottom: 12,
  },
  emptyText: {
    color: '#8E8E93',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
});
