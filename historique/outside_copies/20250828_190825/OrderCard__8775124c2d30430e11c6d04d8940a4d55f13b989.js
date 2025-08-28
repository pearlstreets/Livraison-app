import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const BRAND = '#00C29B';

/** -------- Utils de détection robuste -------- **/
const isObj = (v) => v && typeof v === 'object';
const seenSetAdd = (set, v) => { try { if (isObj(v)) { if (set.has(v)) return false; set.add(v); } } catch {} return true; };

// Recherche BFS d'une clé par regex n'importe où dans l'objet
function findByKeyRegex(root, regex) {
  if (!isObj(root)) return undefined;
  const q = [root];
  const seen = new Set();
  while (q.length) {
    const cur = q.shift();
    if (!seenSetAdd(seen, cur)) continue;
    for (const k of Object.keys(cur)) {
      const val = cur[k];
      if (regex.test(k)) return val;
      if (isObj(val)) q.push(val);
    }
  }
  return undefined;
}

// Cherche le premier champ non vide parmi des chemins simples au 1er niveau
function pickTop(obj, keys) {
  for (const k of keys) {
    const path = k.split('.');
    let v = obj;
    for (const p of path) v = isObj(v) ? v[p] : undefined;
    if (v !== undefined && v !== null && String(v).trim?.() !== '') return v;
  }
  return undefined;
}

// Pick hybride: d'abord top-level, sinon regex profonde
function pickHybrid(obj, tops, rx) {
  const v = pickTop(obj, tops);
  if (v !== undefined) return v;
  const deep = findByKeyRegex(obj, rx);
  return deep;
}

// Formateurs
const fmtKm = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') {
    // si >1000 on suppose mètres
    const km = v > 1000 ? v / 1000 : v;
    return `${km.toFixed(1)} km`;
  }
  const s = String(v);
  const num = parseFloat(s.replace(',', '.'));
  if (!isNaN(num)) {
    return /km/i.test(s) ? s : `${num.toFixed(1)} km`;
  }
  return s;
};

const fmtMin = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') {
    // si > 180 on suppose secondes
    const min = v > 180 ? Math.round(v / 60) : Math.round(v);
    return `${min} min`;
  }
  const s = String(v);
  const num = parseFloat(s.replace(',', '.'));
  if (!isNaN(num)) {
    // contient déjà "min" ?
    return /(min|mn)/i.test(s) ? s : `${Math.round(num)} min`;
  }
  return s;
};

const fmtPrice = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'number') {
    // si entier et grand, on suppose cents
    const euros = Number.isInteger(v) && v > 1000 ? v / 100 : v;
    return `${euros.toFixed(2)} €`;
  }
  const s = String(v);
  const num = parseFloat(s.replace(',', '.'));
  if (!isNaN(num)) return `${num.toFixed(2)} €`;
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

/** -------- Composants UI -------- **/
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

  // En-tête
  const code = pickHybrid(order, ['code','id','orderId'], /(code|order.?id)$/i) || 'Commande';
  const category = pickHybrid(order, ['category','type','service'], /(category|type|service)/i);

  // Lignes info
  const merchant = pickHybrid(
    order,
    ['restaurant','merchantName','storeName','pickupName'],
    /(restaurant|merchant|store|pickup).*name/i
  );
  const address = pickHybrid(
    order,
    ['address','dropoffAddress','destinationAddress','dropoff.address'],
    /(address$|dropoff.*address|destination.*address)/i
  );

  // Chips
  const distanceRaw = pickHybrid(order, ['distanceText','distanceKm','distance'], /(distance|km)/i);
  const etaRaw = pickHybrid(order, ['etaText','etaMinutes','duration','time'], /(eta|duration|time|min)/i);
  const priceRaw = pickHybrid(order, ['priceText','price','amount','payout','total'], /(price|amount|payout|total|fare|cost)/i);

  const distance = fmtKm(distanceRaw);
  const eta = fmtMin(etaRaw);
  const price = fmtPrice(priceRaw);

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

/** -------- Styles (fidèles à ta maquette) -------- **/
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
