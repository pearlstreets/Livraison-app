import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

const BRAND = '#00C29B';

function openItinerary(order) {
  try {
    const addr = order?.dropoffAddress || order?.address || order?.destinationAddress || '';
    const lat = order?.dropoffLat || order?.lat || order?.destination?.lat;
    const lng = order?.dropoffLng || order?.lng || order?.destination?.lng;
    let url;
    if (lat && lng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    } else if (addr) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
    } else {
      url = 'https://www.google.com/maps';
    }
    Linking.openURL(url);
  } catch (e) {}
}

export default function OrderCard({ order, onAccept, onDecline, onOpen }) {
  const [accepted, setAccepted] = useState(false);

  const handlePrimary = () => {
    if (!accepted) {
      setAccepted(true);
      try { if (typeof onAccept === 'function') onAccept(order); } catch (e) {}
    } else {
      openItinerary(order);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.code}>{order?.code || order?.id || 'Commande'}</Text>
        {!!order?.category && <Text style={styles.category}>{order.category}</Text>}
      </View>

      {!!order?.restaurant && <Text style={styles.line}>{order.restaurant}</Text>}
      {!!order?.address && <Text style={styles.line}>{order.address}</Text>}

      {!accepted ? (
        <View style={styles.footerRow}>
          <TouchableOpacity style={[styles.btn, styles.btnLight, styles.mr12]} onPress={() => { try { if (typeof onDecline === 'function') onDecline(order); } catch (e) {} }}>
            <Text style={styles.btnTextDark}>Refuser</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.mr12]} onPress={handlePrimary}>
            <Text style={styles.btnText}>Accepter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch (e) {} }}>
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.footerRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.mr12, styles.flex125]} onPress={handlePrimary}>
            <Text style={styles.btnText}>Itinéraire</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch (e) {} }}>
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 8
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  code: { fontSize: 18, fontWeight: '800' },
  category: { color: BRAND, fontWeight: '700' },
  line: { color: '#333', marginBottom: 2 },

  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  mr12: { marginRight: 12 },

  btn: {
    flex: 1,
    height: 48,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  flex125: { flex: 1.25 },
  btnPrimary: { backgroundColor: BRAND },
  btnLight: { backgroundColor: '#F2F3F5' },
  btnGhost: { borderWidth: 1, borderColor: '#E6E8EB', backgroundColor: '#fff' },

  btnText: { color: '#fff', fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  btnTextDark: { color: '#111', fontWeight: '700', textAlign: 'center', includeFontPadding: false }
});
