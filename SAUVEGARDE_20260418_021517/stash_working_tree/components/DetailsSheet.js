import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Animated, Dimensions, ScrollView, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

const { height: H } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(H * 0.55); // ~55% de l'écran
const BRAND = '#00C29B';
const BTN_H = 40, BTN_R = 12;

const isObj = v => v && typeof v === 'object';
const pickTop = (obj, keys) => {
  for (const k of keys) {
    const path = k.split('.');
    let v = obj;
    for (const p of path) { if (!isObj(v)) { v = undefined; break; } v = v?.[p]; }
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};
const findByKeyRegex = (root, rx) => {
  if (!isObj(root)) return;
  const q=[root], seen=new Set();
  while(q.length){ const cur=q.shift(); if(seen.has(cur)) continue; seen.add(cur);
    for(const k of Object.keys(cur)){ const v=cur[k]; if(rx.test(k)) return v; if(isObj(v)) q.push(v); }
  }
};
const pick = (obj, tops, rx) => pickTop(obj, tops) ?? findByKeyRegex(obj, rx);

const fmt = {
  price: v => v==null?undefined : (typeof v==='number' ? `${(Number.isInteger(v)&&v>1000? v/100:v).toFixed(2)} €`
    : (String(v).includes('€') ? String(v) : `${String(v)} €`)),
  km: v => v==null?undefined : (typeof v==='number' ? `${(v>1000? v/1000:v).toFixed(1)} km`
    : (/km/i.test(String(v))?String(v):`${parseFloat(String(v).replace(',','.')).toFixed(1)} km`)),
  min: v => v==null?undefined : (typeof v==='number' ? `${Math.round(v>180? v/60:v)} min`
    : (/(min|mn)/i.test(String(v))?String(v):`${Math.round(parseFloat(String(v)))} min`)),
};

function openItinerary(order){
  try{
    const addr = pick(order, ['dropoffAddress','destinationAddress','address','dropoff.address'], /(dropoff|destination).*address|^address$/i);
    const lat  = pick(order, ['dropoffLat','destination.lat','lat'], /(dropoff|destination).*lat$|^lat$/i);
    const lng  = pick(order, ['dropoffLng','destination.lng','lng','lon','longitude'], /(dropoff|destination).*(lng|lon|longitude)$|^(lng|lon|longitude)$/i);
    let url;
    if(lat!=null && lng!=null) url=`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    else if(addr) url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(addr))}`;
    else url='https://www.google.com/maps';
    Linking.openURL(url);
  }catch{}
}

export default function DetailsSheet({ visible, order, onClose }) {
  const { t } = useLanguage();
  const y = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    } else {
      // remet en bas pour la prochaine ouverture
      y.setValue(SHEET_HEIGHT);
    }
  }, [visible, y]);

  if (!visible) return null;

  const code = pick(order, ['code','id','orderId'], /(code|order.?id)$/i);
  const category = pick(order, ['category','type','service'], /(category|type|service)/i);
  const merchant = pick(order, ['restaurant','merchantName','storeName','pickupName'], /(restaurant|merchant|store|pickup).*name/i);
  const address = pick(order, ['address','dropoffAddress','destinationAddress','dropoff.address'], /(address$|dropoff.*address|destination.*address)/i);
  const distance = fmt.km(pick(order, ['distanceText','distanceKm','distance'], /(distance|km)/i));
  const eta = fmt.min(pick(order, ['etaText','etaMinutes','duration','time'], /(eta|duration|time|min)/i));
  const price = fmt.price(pick(order, ['priceText','price','amount','payout','total'], /(price|amount|payout|total|fare|cost)/i));

  const animateClose = () => {
    Animated.timing(y, { toValue: SHEET_HEIGHT, duration: 180, useNativeDriver: true })
      .start(() => onClose?.());
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={animateClose}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={animateClose} />

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: y }] }]}>
        <View style={styles.grabber} />

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.code}>{String(code || t('orderLabel'))}</Text>
            {!!category && <Text style={styles.category}>{String(category)}</Text>}
          </View>

          {!!merchant && (
            <View style={styles.row}>
              <MaterialCommunityIcons name="storefront-outline" size={18} color="#333" style={styles.icon} />
              <Text style={styles.text}>{String(merchant)}</Text>
            </View>
          )}
          {!!address && (
            <View style={styles.row}>
              <Ionicons name="home-outline" size={18} color="#333" style={styles.icon} />
              <Text style={styles.text}>{String(address)}</Text>
            </View>
          )}

          <View style={styles.chips}>
            {!!distance && <View style={styles.pill}><Text style={styles.pillTxt}>{distance}</Text></View>}
            {!!eta && <View style={styles.pill}><Text style={styles.pillTxt}>{eta}</Text></View>}
            {!!price && <View style={[styles.pill, { backgroundColor: BRAND }]}><Text style={[styles.pillTxt, { color:'#fff' }]}>{price}</Text></View>}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={() => openItinerary(order)} style={[styles.btn, styles.primary]}>
              <Text style={styles.btnTxtLight}>{t('itinerary')}</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Fixed black close button at bottom */}
        <Pressable onPress={animateClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnTxt}>{t('close')}</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.25)' },
  sheet: {
    position:'absolute',
    left:0, right:0, bottom:0,
    height: SHEET_HEIGHT,
    backgroundColor:'#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor:'#000', shadowOpacity:0.12, shadowRadius:12, elevation:8
  },
  grabber: { alignSelf:'center', width:48, height:5, borderRadius:999, backgroundColor:'#E6E8EB', marginTop:8, marginBottom:8 },
  content: { paddingHorizontal:16, paddingBottom:16 },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  code: { fontSize:18, fontWeight:'800', color:'#111' },
  category: { color: BRAND, fontWeight:'700' },
  row: { flexDirection:'row', alignItems:'center', marginBottom:6 },
  icon: { width:22, marginRight:4 },
  text: { color:'#333', flexShrink:1 },
  chips: { flexDirection:'row', gap:8, marginTop:10, marginBottom:8, flexWrap:'wrap' },
  pill: { backgroundColor:'#F2F3F5', borderRadius:999, paddingVertical:6, paddingHorizontal:12 },
  pillTxt: { fontWeight:'700', color:'#111' },
  actions: { flexDirection:'row', justifyContent:'space-between', marginTop:12, columnGap:10 },
  btn: { flex:1, height:BTN_H, borderRadius:BTN_R, alignItems:'center', justifyContent:'center' },
  primary: { backgroundColor: BRAND },
  ghost: { backgroundColor:'#fff', borderWidth:1, borderColor:'#E6E8EB' },
  btnTxtLight: { color:'#fff', fontSize:16, fontWeight:'700' },
  closeBtn: { backgroundColor:'#111', borderRadius:14, paddingVertical:16, marginHorizontal:16, marginBottom:20, alignItems:'center' },
  closeBtnTxt: { color:'#fff', fontSize:16, fontWeight:'800' },
});
