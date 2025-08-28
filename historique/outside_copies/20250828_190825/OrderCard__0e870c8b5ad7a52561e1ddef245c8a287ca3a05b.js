import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const BRAND = '#00C29B';
const BTN_HEIGHT = 56;     // même hauteur partout
const BTN_RADIUS = 24;     // mêmes angles partout
const GAP = 12;

/* ---------- Utils propres et compatibles ---------- */
const isObj = (v) => v !== null && typeof v === 'object';

function pickTop(obj, keys) {
  for (const key of keys) {
    const path = key.split('.');
    let val = obj;
    for (const p of path) {
      if (!isObj(val) && typeof val !== 'object') { val = undefined; break; }
      val = val?.[p];
    }
    if (val !== undefined && val !== null) {
      if (typeof val === 'string') {
        if (val.trim() !== '') return val;
      } else {
        return val;
      }
    }
  }
  return undefined;
}

function findByKeyRegex(root, regex) {
  if (!isObj(root)) return undefined;
  const q = [root];
  const seen = new Set();
  while (q.length) {
    const cur = q.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (regex.test(k)) return v;
      if (isObj(v)) q.push(v);
    }
  }
  return undefined;
}

function pickHybrid(obj, tops, rx) {
  const t = pickTop(obj, tops);
  if (t !== undefined) return t;
  return findByKeyRegex(obj, rx);
}

const fmtKm = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') {
    const km = v > 1000 ? v / 1000 : v;
    return `${km.toFixed(1)} km`;
  }
  const s = String(v);
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? s : (/km/i.test(s) ? s : `${n.toFixed(1)} km`);
};

const fmtMin = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') {
    const m = v > 180 ? Math.round(v / 60) : Math.round(v);
    return `${m} min`;
  }
  const s = String(v);
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? s : (/(min|mn)/i.test(s) ? s : `${Math.round(n)} min`);
};

const fmtPrice = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') {
    const euros = Number.isInteger(v) && v > 1000 ? v / 100 : v;
    return `${euros.toFixed(2)} €`;
  }
  const s = String(v);
  const n = parseFloat(s.replace(',', '.'));
  if (!isNaN(n)) return `${n.toFixed(2)} €`;
  return s.includes('€') ? s : `${s} €`;
};

function openItinerary(order) {
  try {
    const addr = pickHybrid(order,
      ['dropoffAddress','destinationAddress','address','dropoff.address'],
      /(dropoff|destination).*address|^address$/i
    ) || '';

    const lat = pickHybrid(order,
      ['dropoffLat','destination.lat','lat'],
      /(dropoff|destination).*lat$|^lat$/i
    );
    const lng = pickHybrid(order,
      ['dropoffLng','destination.lng','lng','lon','long','longitude'],
      /(dropoff|destination).*(lng|lon|long|longitude)$|^(lng|lon|long|longitude)$/i
    );

    let url;
    if (lat != null && lng != null) url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    else if (addr) url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(addr))}`;
    else url = 'https://www.google.com/maps';
    Linking.openURL(url);
  } catch {}
}

/* ---------- Petits composants UI ---------- */
function IconRow({ icon, text }) {
  if (!text) return null;
  return (
    <View style={styles.iconRow}>
      <View style={styles.iconBox}>{icon}</View>
      <Text style={styles.infoText} numberOfLines={1}>{String(text)}</Text>
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

/* ---------- OrderCard ---------- */
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

  const code = pickHybrid(order, ['code','id','orderId'], /(code|order.?id)$/i) || 'Commande';
  const category = pickHybrid(order, ['category','type','service'], /(category|type|service)/i);
  const merchant = pickHybrid(order, ['restaurant','merchantName','storeName','pickupName'], /(restaurant|merchant|store|pickup).*name/i);
  const address = pickHybrid(order, ['address','dropoffAddress','destinationAddress','dropoff.address'], /(address$|dropoff.*address|destination.*address)/i);

  const distance = fmtKm(pickHybrid(order, ['distanceText','distanceKm','distance'], /(distance|km)/i));
  const eta = fmtMin(pickHybrid(order, ['etaText','etaMinutes','duration','time'], /(eta|duration|time|min)/i));
  const price = fmtPrice(pickHybrid(order, ['priceText','price','amount','payout','total'], /(price|amount|payout|total|fare|cost)/i));

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
        <Text style={styles.code}>{String(code)}</Text>
        {!!category && <Text style={styles.category}>{String(category)}</Text>}
      </View>

      {/* Infos */}
      <IconRow icon={<MaterialCommunityIcons name="storefront-outline" size={18} color="#333" />} text={merchant} />
      <IconRow icon={<Ionicons name="home-outline" size={18} color="#333" />} text={address} />

      {/* Chips */}
      {(distance || eta || price) && (
        <View style={styles.pillsRow}>
          {!!distance && <Pill>{distance}</Pill>}
          {!!eta && <Pill>{eta}</Pill>}
          {!!price && <Pill variant="green">{price}</Pill>}
        </View>
      )}

      {/* Actions — largeur égale, tailles/angles identiques */}
      {!accepted ? (
        <>
          <View style={styles.rowEqual}>
            <TouchableOpacity
              style={[styles.btn, styles.btnLight, styles.mr]}
              onPress={() => { try { if (typeof onDecline === 'function') onDecline(order); } catch {} }}
            >
              <Text style={styles.btnTextDark}>Refuser</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.ml]}
              onPress={handleAcceptOrItinerary}
            >
              <Text style={styles.btnText}>Accepter</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnGhost, styles.btnFull, styles.mt]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.rowEqual}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.mr]}
            onPress={handleAcceptOrItinerary}
          >
            <Text style={styles.btnText}>Itinéraire</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnGhost, styles.ml]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>Détails</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ---------- Styles ---------- */
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

  rowEqual: { flexDirection: 'row', alignItems: 'center', marginTop: GAP},
  mr: { marginRight: GAP/2},
  ml: { marginLeft: GAP/2},
  mt: { marginTop: GAP },

  btn: { borderRadius: 24, height: 56,
    flex: 1,
    height: BTN_HEIGHT,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnPrimary: { backgroundColor: BRAND },
  btnLight: { backgroundColor: '#F2F3F5' },
  btnGhost: { borderWidth: 1, borderColor: '#E6E8EB', backgroundColor: '#FFFFFF' },
  btnFull: { width: '100%' },

  btnText: { fontSize: 18, color: '#FFFFFF', fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  btnTextDark: { fontSize: 18, color: '#111111', fontWeight: '700', textAlign: 'center', includeFontPadding: false }
});
