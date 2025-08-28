import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const BRAND = '#00C29B';

function openItinerary(order) {
  try {
    const addr =
      order?.dropoffAddress ||
      order?.destinationAddress ||
      order?.address ||
      order?.dropoff?.address ||
      '';
    const lat =
      order?.dropoffLat || order?.destination?.lat || order?.lat;
    const lng =
      order?.dropoffLng || order?.destination?.lng || order?.lng;

    let url;
    if (lat && lng) url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    else if (addr) url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
    else url = 'https://www.google.com/maps';
    Linking.openURL(url);
  } catch {}
}

/** Utils: récupère le premier champ non vide parmi plusieurs clés */
const pick = (obj, keys) => {
  for (const k of keys) {
    const val = k.split('.').reduce((a, c) => (a ? a[c] : undefined), obj);
    if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  }
  return undefined;
};

const fmtKm = (v) => {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return `${v.toFixed(1)} km`;
  const s = String(v);
  return /km/i.test(s) ? s : `${s} km`;
};
const fmtMin = (v) => {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return `${Math.round(v)} min`;
  const s = String(v);
  return /(min|mn)/i.test(s) ? s : `${s} min`;
};
const fmtPrice = (v) => {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return `${v.toFixed(2)} €`;
  const s = String(v);
  return /€/.test(s) ? s : `${s} €`;
};

function IconRow({ icon, text }) {
  if (!text) return null;
  return (
    <View style={styles.iconRow}>
      <View style={styles.iconBox}>{icon}</View>
      <Text style={styles.infoText} numberOfLines={1}>{text}</Text>
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
  const inferAccepted = ['accepted','acceptée','active','en_cours'].includes(
    String(order?.status || '').toLowerCase()
  );
  const [accepted, setAccepted] = useState(inferAccepted || initialAccepted);

  // Champs robustes (noms variés)
  const code = pick(order, ['code', 'id']) || 'Commande';
  const category = pick(order, ['category', 'type', 'service']);
  const merchant = pick(order, ['restaurant', 'merchantName', 'storeName', 'pickupName']);
  const address = pick(order, ['address', 'dropoffAddress', 'destinationAddress', 'dropoff.address']);

  const distance = fmtKm(pick(order, ['distanceText', 'distanceKm', 'distance']));
  const eta = fmtMin(pick(order, ['etaText', 'etaMinutes', 'duration', 'time']));
  const price = fmtPrice(pick(order, ['priceText', 'price', 'amount', 'payout']));

  const handleAcceptOrItinerary = () => {
    if (!accepted) {
      setAccepted(true);
      try { if (typeof onAccept === 'function') onAccept(order); } catch {}
    } else {
      openItinerary(order);
    }
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.code}>{code}</Text>
        {!!category && <Text style={styles.category}>{category}</Text>}
      </View>

      {/* Lignes info */}
      <IconRow
        icon={<MaterialCommunityIcons name="storefront-outline" size={18} color="#333" />}
        text={merchant}
      />
      <IconRow
        icon={<Ionicons name="home-outline" size={18} color="#333" />}
        text={address}
      />

      {/* Chips */}
      {(distance || eta || price) && (
        <View style={styles.pillsRow}>
          {!!distance && <Pill>{distance}</Pill>}
          {!!eta && <Pill>{eta}</Pill>}
          {!!price && <Pill variant="green">{price}</Pill>}
        </View>
      )}

      {/* Actions */}
      {!accepted ? (
        <>
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnLight, styles.mr12]}
              onPress={() => { try { if (typeof onDecline === 'function') onDecline(order); } catch {} }}
            >
              <Text style={styles.btnTextDark}>Refuser</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleAcceptOrItinerary}
            >
              <Text style={styles.btnText}>Accepter</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnGhost, styles.btnFull, styles.mt12]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.mr12, styles.flex125]}
            onPress={handleAcceptOrItinerary}
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
    borderRadius: 24,
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

  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  iconBox: { width: 22, alignItems: 'center' },
  infoText: { color: '#333', flexShrink: 1 },

  pillsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 8 },
  pill: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 10 },
  pillText: { fontWeight: '700' },

  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  mr12: { marginRight: 12 },
  mt12: { marginTop: 12 },

  btn: {
    flex: 1,
    height: 52,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  flex125: { flex: 1.25 },
  btnPrimary: { backgroundColor: BRAND },
  btnLight: { backgroundColor: '#F2F3F5' },
  btnGhost: { borderWidth: 1, borderColor: '#E6E8EB', backgroundColor: '#FFFFFF' },
  btnFull: { width: '100%' },

  btnText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  btnTextDark: { color: '#111111', fontWeight: '700', textAlign: 'center', includeFontPadding: false }
});
