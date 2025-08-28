import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const BRAND = '#00C29B';

function openItinerary(order) {
  try {
    const addr = order?.dropoffAddress || order?.address || order?.destinationAddress || '';
    const lat = order?.dropoffLat || order?.lat || order?.destination?.lat;
    const lng = order?.dropoffLng || order?.lng || order?.destination?.lng;
    let url;
    if (lat && lng) url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    else if (addr) url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
    else url = 'https://www.google.com/maps';
    Linking.openURL(url);
  } catch {}
}

function IconLabel({ icon, children }) {
  return (
    <View style={styles.iconRow}>
      <View style={styles.iconBox}>{icon}</View>
      <Text style={styles.infoText} numberOfLines={1}>{children}</Text>
    </View>
  );
}

function Pill({ children, variant }) {
  const bg = variant === 'green' ? BRAND : '#F2F3F5';
  const color = variant === 'green' ? '#FFFFFF' : '#111111';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

export default function OrderCard({
  order,
  onAccept,
  onDecline,
  onOpen,
  initialAccepted = false
}) {
  const inferAccepted =
    ['accepted','acceptée','active','en_cours'].includes(String(order?.status || '').toLowerCase());
  const [accepted, setAccepted] = useState(inferAccepted || initialAccepted);

  const handlePrimary = () => {
    if (!accepted) {
      setAccepted(true);
      try { if (typeof onAccept === 'function') onAccept(order); } catch {}
    } else {
      openItinerary(order);
    }
  };

  const merchant = order?.restaurant || order?.merchantName || '';
  const address = order?.address || order?.dropoffAddress || order?.destinationAddress || '';
  const distance = order?.distance;
  const eta = order?.eta;
  const price = order?.price;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.code}>{order?.code || order?.id || 'Commande'}</Text>
        {!!order?.category && <Text style={styles.category}>{order.category}</Text>}
      </View>

      {!!merchant && (
        <IconLabel icon={<MaterialCommunityIcons name="storefront-outline" size={18} color="#333" />}>
          {merchant}
        </IconLabel>
      )}
      {!!address && (
        <IconLabel icon={<Ionicons name="home-outline" size={18} color="#333" />}>
          {address}
        </IconLabel>
      )}

      {(distance || eta || price) && (
        <View style={styles.pillsRow}>
          {!!distance && <Pill>{distance}</Pill>}
          {!!eta && <Pill>{eta}</Pill>}
          {!!price && <Pill variant="green">{price}</Pill>}
        </View>
      )}

      {!accepted ? (
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnLight, styles.mr12]}
            onPress={() => { try { if (typeof onDecline === 'function') onDecline(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>Refuser</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.mr12]}
            onPress={handlePrimary}
          >
            <Text style={styles.btnText}>Accepter</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.mr12, styles.flex125]}
            onPress={handlePrimary}
          >
            <Text style={styles.btnText}>Itinéraire</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
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
  code: { fontSize: 18, fontWeight: '800', color: '#111' },
  category: { color: BRAND, fontWeight: '700' },

  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  iconBox: { width: 22, alignItems: 'center' },
  infoText: { color: '#333', flexShrink: 1 },

  pillsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 8 },
  pill: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 10 },
  pillText: { fontWeight: '700' },

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
  btnGhost: { borderWidth: 1, borderColor: '#E6E8EB', backgroundColor: '#FFFFFF' },

  btnText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  btnTextDark: { color: '#111111', fontWeight: '700', textAlign: 'center', includeFontPadding: false }
});
