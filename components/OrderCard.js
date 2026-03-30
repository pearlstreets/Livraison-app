import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Animated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';
const BTN_HEIGHT = 40;
const BTN_RADIUS = 12;
const GAP = 10;
const BTN_FONTSIZE = 16;
const COUNTDOWN_SECONDS = 30;

/* ---------- Utils ---------- */
const isObj = (v) => v !== null && typeof v === 'object';
function pickTop(obj, keys) {
  for (const key of keys) {
    const path = key.split('.');
    let val = obj;
    for (const p of path) { if (!isObj(val) && typeof val !== 'object') { val = undefined; break; } val = val?.[p]; }
    if (val !== undefined && val !== null) return typeof val === 'string' ? (val.trim() ? val : undefined) : val;
  }
  return undefined;
}
function findByKeyRegex(root, regex) {
  if (!isObj(root)) return undefined;
  const q = [root], seen = new Set();
  while (q.length) { const cur = q.shift(); if (seen.has(cur)) continue; seen.add(cur);
    for (const k of Object.keys(cur)) { const v = cur[k]; if (regex.test(k)) return v; if (isObj(v)) q.push(v); }
  }
  return undefined;
}
const pickHybrid = (obj, tops, rx) => { const t = pickTop(obj, tops); return t !== undefined ? t : findByKeyRegex(obj, rx); };

const fmtKm = (v)=> v==null?undefined : (typeof v==='number' ? `${(v>1000? v/1000:v).toFixed(1)} km`
  : ((s=>{const n=parseFloat(s.replace(',','.')); return isNaN(n)?s:(/km/i.test(s)?s:`${n.toFixed(1)} km`);})(String(v))));
const fmtMin=(v)=> v==null?undefined : (typeof v==='number' ? `${Math.round(v>180? v/60:v)} min`
  : ((s=>{const n=parseFloat(s.replace(',','.')); return isNaN(n)?s:(/(min|mn)/i.test(s)?s:`${Math.round(n)} min`);})(String(v))));
const fmtPrice=(v)=> v==null?undefined : (typeof v==='number' ? `${(Number.isInteger(v)&&v>1000? v/100:v).toFixed(2)} €`
  : ((s=>{const n=parseFloat(s.replace(',','.')); return isNaN(n)?(s.includes('€')?s:`${s} €`):`${n.toFixed(2)} €`;})(String(v))));

function openItinerary(order) {
  try {
    const addr = pickHybrid(order, ['dropoffAddress','destinationAddress','address','dropoff.address'], /(dropoff|destination).*address|^address$/i) || '';
    const lat  = pickHybrid(order, ['dropoffLat','destination.lat','lat'], /(dropoff|destination).*lat$|^lat$/i);
    const lng  = pickHybrid(order, ['dropoffLng','destination.lng','lng','lon','long','longitude'], /(dropoff|destination).*(lng|lon|long|longitude)$|^(lng|lon|long|longitude)$/i);
    let url;
    if (lat!=null && lng!=null) url=`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    else if (addr) url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(addr))}`;
    else url='https://www.google.com/maps';
    Linking.openURL(url);
  } catch {}
}

/* ---------- Countdown bar ---------- */
function CountdownBar({ seconds, onExpire }) {
  const [remaining, setRemaining] = useState(seconds);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: seconds * 1000,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const barColor = remaining > 10 ? BRAND : remaining > 5 ? '#f5a623' : '#e74c3c';

  return (
    <View style={styles.countdownWrap}>
      <View style={styles.countdownBarBg}>
        <Animated.View style={[styles.countdownBarFill, {
          backgroundColor: barColor,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
      <Text style={[styles.countdownText, { color: barColor }]}>{remaining}s</Text>
    </View>
  );
}

/* ---------- Info badges ---------- */
function InfoBadges({ distance, eta, price, items }) {
  const { t } = useLanguage();
  return (
    <View style={styles.badgesRow}>
      {!!distance && (
        <View style={styles.badge}>
          <Ionicons name="navigate-outline" size={14} color="#666" />
          <Text style={styles.badgeText}>{distance}</Text>
        </View>
      )}
      {!!eta && (
        <View style={styles.badge}>
          <Ionicons name="time-outline" size={14} color="#666" />
          <Text style={styles.badgeText}>{eta}</Text>
        </View>
      )}
      {!!items && (
        <View style={styles.badge}>
          <Ionicons name="cube-outline" size={14} color="#666" />
          <Text style={styles.badgeText}>{items} {items > 1 ? t('articles') : t('article')}</Text>
        </View>
      )}
      {!!price && (
        <View style={[styles.badge, styles.badgeGreen]}>
          <Ionicons name="cash-outline" size={14} color="#fff" />
          <Text style={[styles.badgeText, { color: '#fff' }]}>{price}</Text>
        </View>
      )}
    </View>
  );
}

/* ---------- Card ---------- */
export default function OrderCard({ order, onAccept, onDecline, onOpen, initialAccepted=false }) {
  const { t } = useLanguage();
  const inferAccepted = ['accepted','acceptée','active','en_cours'].includes(String(order?.status||'').toLowerCase());
  const [accepted, setAccepted] = useState(inferAccepted || initialAccepted);

  const code = pickHybrid(order, ['code','id','orderId'], /(code|order.?id)$/i) || t('order');
  const category = pickHybrid(order, ['category','type','service'], /(category|type|service)/i);
  const merchant = pickHybrid(order, ['restaurant','merchantName','storeName','pickupName'], /(restaurant|merchant|store|pickup).*name/i);
  const address = pickHybrid(order, ['address','dropoffAddress','destinationAddress','dropoff.address'], /(address$|dropoff.*address|destination.*address)/i);

  const distance = fmtKm(pickHybrid(order, ['distanceText','distanceKm','distance'], /(distance|km)/i));
  const eta = fmtMin(pickHybrid(order, ['etaText','etaMinutes','duration','time'], /(eta|duration|time|min)/i));
  const price = fmtPrice(pickHybrid(order, ['priceText','price','amount','payout','total'], /(price|amount|payout|total|fare|cost)/i));
  const items = pickHybrid(order, ['itemsCount','items','nbItems'], /(items|nb.*items)/i);

  const handleAcceptOrItinerary = () => {
    if (!accepted) { setAccepted(true); try { if (typeof onAccept === 'function') onAccept(order); } catch {} }
    else { openItinerary(order); }
  };

  const handleExpire = () => {
    if (!accepted) {
      try { if (typeof onDecline === 'function') onDecline(order); } catch {}
    }
  };

  return (
    <View style={[styles.card, !accepted && styles.cardPending]}>
      {/* Countdown for pending orders */}
      {!accepted && (
        <CountdownBar seconds={COUNTDOWN_SECONDS} onExpire={handleExpire} />
      )}

      <View style={styles.header}>
        <Text style={styles.code}>{String(code)}</Text>
        {!!category && <Text style={styles.category}>{String(category)}</Text>}
      </View>

      {/* Restaurant */}
      {!!merchant && (
        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="storefront-outline" size={16} color={BRAND} />
          </View>
          <Text style={styles.infoText} numberOfLines={1}>{String(merchant)}</Text>
        </View>
      )}

      {/* Address */}
      {!!address && (
        <View style={styles.iconRow}>
          <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="location" size={16} color="#e74c3c" />
          </View>
          <Text style={styles.infoText} numberOfLines={1}>{String(address)}</Text>
        </View>
      )}

      {/* Info badges */}
      <InfoBadges distance={distance} eta={eta} price={price} items={items} />

      {!accepted ? (
        <>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btn46, styles.btnLight]}
              onPress={() => { try { if (typeof onDecline === 'function') onDecline(order); } catch {} }}
            >
              <Ionicons name="close" size={18} color="#666" style={{ marginRight: 4 }} />
              <Text style={styles.btnTextDark}>{t('refuse')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btn46, styles.btnPrimary]}
              onPress={handleAcceptOrItinerary}
            >
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.btnText}>{t('accept')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnFull, styles.btnGhost, styles.mt]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>{t('viewDetails')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btn56, styles.btnPrimary]}
            onPress={handleAcceptOrItinerary}
          >
            <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.btnText}>{t('itinerary')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btn40, styles.btnGhost]}
            onPress={() => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} }}
          >
            <Text style={styles.btnTextDark}>{t('details')}</Text>
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
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginVertical: 4,
  },
  cardPending: {
    borderWidth: 2,
    borderColor: BRAND + '40',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  code: { fontSize: 18, fontWeight: '800', color: '#111' },
  category: { color: BRAND, fontWeight: '700', fontSize: 13 },

  // Countdown
  countdownWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  countdownBarBg: { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginRight: 10 },
  countdownBarFill: { height: 6, borderRadius: 3 },
  countdownText: { fontWeight: '900', fontSize: 16, width: 36, textAlign: 'right' },

  // Info rows
  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND + '15', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  infoText: { color: '#333', fontSize: 14, fontWeight: '600', flexShrink: 1 },

  // Route line
  routeLine: { flexDirection: 'row', alignItems: 'center', marginLeft: 13, marginBottom: 10, gap: 0 },
  routeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND },
  routeDash: { flex: 1, height: 2, backgroundColor: '#e0e0e0', marginHorizontal: 4, maxWidth: 60 },

  // Info badges
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, gap: 4 },
  badgeGreen: { backgroundColor: BRAND },
  badgeText: { fontWeight: '800', fontSize: 13, color: '#333' },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: GAP,
    marginTop: GAP,
  },

  btn: {
    height: BTN_HEIGHT,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  btn46: { width: '46%' },
  btn56: { width: '56%' },
  btn40: { width: '40%' },
  btnFull: { width: '100%' },
  mt: { marginTop: GAP },

  btnPrimary: { backgroundColor: BRAND },
  btnLight: { backgroundColor: '#F2F3F5' },
  btnGhost: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E8EB' },

  btnText: { color: '#FFFFFF', fontSize: BTN_FONTSIZE, fontWeight: '700', includeFontPadding: false },
  btnTextDark: { color: '#111111', fontSize: BTN_FONTSIZE, fontWeight: '700', includeFontPadding: false },
});
