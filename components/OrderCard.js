import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Animated, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
// Alias : le module a déjà un helper local `fmtPrice` (parse des chaînes
// pré-formatées) — on importe donc le formateur devise sous un autre nom.
import { useCurrency as useDriverCurrency } from '../contexts/CurrencyContext';

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
  // Ref keeps the latest onExpire without re-running the expiration effect.
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

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
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fire onExpire AFTER the commit (not inside the setRemaining updater),
  // otherwise React warns: "Cannot update a component (OrdersScreen) while
  // rendering a different component (CountdownBar)".
  useEffect(() => {
    if (remaining === 0) {
      onExpireRef.current?.();
    }
  }, [remaining]);

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

/* ---------- Inline metrics ---------- */
function InlineMetrics({ distance, eta, items }) {
  const { t } = useLanguage();
  const segments = [];
  if (distance) segments.push({ icon: 'navigate-outline', label: distance });
  if (eta) segments.push({ icon: 'time-outline', label: eta });
  if (items) segments.push({ icon: 'cube-outline', label: `${items} ${items > 1 ? t('articles') : t('article')}` });
  if (segments.length === 0) return null;
  return (
    <View style={styles.metricsRow}>
      {segments.map((s, i) => (
        <View key={s.icon} style={styles.metricItem}>
          {i > 0 && <View style={styles.metricDot} />}
          <Ionicons name={s.icon} size={14} color="#8E8E93" />
          <Text style={styles.metricText}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- Card ---------- */
export default function OrderCard({ order, onAccept, onDecline, onOpen, initialAccepted=false }) {
  const { fmtPrice: fmtDriverPrice } = useDriverCurrency();
  const { t } = useLanguage();
  const inferAccepted = ['accepted','acceptée','active','en_cours'].includes(String(order?.status||'').toLowerCase());
  const [accepted, setAccepted] = useState(inferAccepted || initialAccepted);

  const code = order?.orderNumber || pickHybrid(order, ['code','id','orderId'], /(code|order.?id)$/i) || t('order');
  const category = pickHybrid(order, ['category','type','service'], /(category|type|service)/i);
  const merchant = pickHybrid(order, ['restaurant','merchantName','storeName','pickupName'], /(restaurant|merchant|store|pickup).*name/i);
  const address = pickHybrid(order, ['address','dropoffAddress','destinationAddress','dropoff.address'], /(address$|dropoff.*address|destination.*address)/i);

  const distance = fmtKm(pickHybrid(order, ['distanceText','distanceKm','distance'], /(distance|km)/i));
  const eta = fmtMin(pickHybrid(order, ['etaText','etaMinutes','duration','time'], /(eta|duration|time|min)/i));
  // Montant numérique EUR fourni par la source → devise du livreur ;
  // sinon on garde le parsing historique de la chaîne pré-formatée.
  const price = order?.priceEur != null
    ? fmtDriverPrice(order.priceEur)
    : fmtPrice(pickHybrid(order, ['priceText','price','amount','payout','total'], /(price|amount|payout|total|fare|cost)/i));
  const items = pickHybrid(order, ['itemsCount','items','nbItems'], /(items|nb.*items)/i);
  const shopImage = order?.shopImage || order?.shop_image || '';

  const handleAcceptOrItinerary = () => {
    if (!accepted) { setAccepted(true); try { if (typeof onAccept === 'function') onAccept(order); } catch {} }
    else { openItinerary(order); }
  };

  const handleExpire = () => {
    if (!accepted) {
      try { if (typeof onDecline === 'function') onDecline(order); } catch {}
    }
  };

  const openDetails = () => { try { if (typeof onOpen === 'function') onOpen(order); } catch {} };

  return (
    <View style={[styles.card, !accepted && styles.cardPending]}>
      {/* Countdown for pending orders */}
      {!accepted && (
        <CountdownBar seconds={COUNTDOWN_SECONDS} onExpire={handleExpire} />
      )}

      {/* Header — ID pill (gauche) + prix dominant (droite) */}
      <View style={styles.header}>
        <View style={styles.idPill}>
          <Text style={styles.idPillText}>{String(code)}</Text>
          {!!category && <Text style={styles.category}>· {String(category)}</Text>}
        </View>
        {!!price && (
          <View style={styles.priceWrap}>
            <Text style={styles.priceLead}>+</Text>
            <Text style={styles.priceText}>{price}</Text>
          </View>
        )}
      </View>

      {/* Restaurant — titre principal */}
      {!!merchant && (
        <TouchableOpacity activeOpacity={0.7} onPress={openDetails} style={styles.merchantRow}>
          {shopImage ? (
            <Image source={{ uri: shopImage }} style={styles.merchantImg} />
          ) : (
            <View style={styles.merchantIcon}>
              <MaterialCommunityIcons name="storefront" size={14} color={BRAND} />
            </View>
          )}
          <Text style={styles.merchantText} numberOfLines={1}>{String(merchant)}</Text>
        </TouchableOpacity>
      )}

      {/* Adresse */}
      {!!address && (
        <View style={styles.addressRow}>
          <Ionicons name="location-sharp" size={14} color="#e74c3c" style={{ marginTop: 1 }} />
          <Text style={styles.addressText} numberOfLines={2}>{String(address)}</Text>
        </View>
      )}

      {/* Métriques inline (km · min · articles) */}
      <InlineMetrics distance={distance} eta={eta} items={items} />

      <View style={styles.divider} />

      {!accepted ? (
        <>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => { try { if (typeof onDecline === 'function') onDecline(order); } catch {} }}
              accessibilityLabel={t('refuse')}
            >
              <Ionicons name="close" size={22} color="#8E8E93" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={handleAcceptOrItinerary}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.acceptBtnText}>{t('accept')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.detailsLink} onPress={openDetails} activeOpacity={0.6}>
            <Text style={styles.detailsLinkText}>{t('viewDetails')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#8E8E93" />
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={handleAcceptOrItinerary}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.acceptBtnText}>{t('itinerary')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={openDetails} accessibilityLabel={t('details')}>
            <Ionicons name="information" size={20} color="#8E8E93" />
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
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    marginVertical: 4,
  },
  cardPending: {
    borderWidth: 1,
    borderColor: BRAND + '33',
  },

  // Countdown
  countdownWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  countdownBarBg: { flex: 1, height: 5, backgroundColor: '#EEF1F4', borderRadius: 3, overflow: 'hidden', marginRight: 10 },
  countdownBarFill: { height: 5, borderRadius: 3 },
  countdownText: { fontWeight: '900', fontSize: 14, width: 34, textAlign: 'right' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  idPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F6F8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  idPillText: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },
  category: { color: BRAND, fontWeight: '700', fontSize: 11, marginLeft: 4 },
  priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
  priceLead: { color: BRAND, fontSize: 14, fontWeight: '800', marginRight: 1 },
  priceText: { color: BRAND, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },

  // Restaurant
  merchantRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  merchantIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: BRAND + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  merchantImg: { width: 30, height: 30, borderRadius: 8, marginRight: 8, backgroundColor: '#f0f0f0' },
  merchantText: { fontSize: 17, fontWeight: '800', color: '#111', flexShrink: 1, letterSpacing: -0.2 },

  // Address
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10, paddingLeft: 2 },
  addressText: { fontSize: 13, color: '#4B5563', flexShrink: 1, lineHeight: 18 },

  // Inline metrics
  metricsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, paddingLeft: 2 },
  metricItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#D1D5DB', marginHorizontal: 8 },
  metricText: { fontSize: 13, color: '#374151', fontWeight: '600' },

  // Divider
  divider: { height: 1, backgroundColor: '#F1F2F4', marginBottom: 12 },

  // Actions
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  declineBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#F4F6F8',
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtn: {
    flex: 1, height: 48, borderRadius: 14,
    backgroundColor: BRAND,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },

  // Details link
  detailsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 10, marginTop: 2 },
  detailsLinkText: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
});
