import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, SectionList, Pressable, StyleSheet, Modal, Image, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import OrderCard from '../components/OrderCard';
import api from '../components/api';
import SignatureCanvas from 'react-native-signature-canvas';

const BRAND = '#00C29B';

function shallowEqualArrays(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id || a[i]?.status !== b[i]?.status) return false;
  }
  return true;
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState([]);
  const [active, setActive] = useState([]);
  const [selected, setSelected] = useState(null);
  const [proofPhoto, setProofPhoto] = useState(null);
  const [signatureData, setSignatureData] = useState(null);
  const [signatureOpen, setSignatureOpen] = useState(false);

  const listRef = useRef(null);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([api.listActiveOrders(), api.listAvailableOrders()]);
    setActive(prev => (shallowEqualArrays(prev, a) ? prev : a));
    setAvailable(prev => (shallowEqualArrays(prev, b) ? prev : b));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(async () => {
      if (Math.random() < 0.2) {
        await api.seedNewOrder('ORD-' + Math.floor(1000 + Math.random() * 9000));
      }
      refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const keyExtractor = useCallback(item => item.id, []);
  const renderItem = useCallback(
    ({ item }) => (
      <OrderCard
        order={item}
        onAccept={async () => { await api.acceptOrder(item.id); refresh(); }}
        onDecline={async () => { await api.declineOrder(item.id); refresh(); }}
        onOpen={() => setSelected(item)}
      />
    ),
    [refresh]
  );

  const sections = useMemo(
    () => [
      { title: 'En cours', data: active },
      { title: 'Disponibles', data: available }
    ],
    [active, available]
  );

  async function advanceStatus() {
    if (!selected) return;
    const next = selected.status === 'accepted' ? 'picking' : selected.status === 'picking' ? 'delivering' : selected.status;
    const u = await api.updateStatus(selected.id, next);
    setSelected({ ...u });
    refresh();
  }

  async function openCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission','Autorisez la caméra pour prendre une photo.'); return; }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing:false, quality:0.7 });
    if (!res.canceled) setProofPhoto(res.assets[0].uri);
  }

  function onSignatureOK(dataUrl){ setSignatureData(dataUrl); setSignatureOpen(false); }

  async function markDelivered() {
    if (!selected) return;
    if (!proofPhoto) { Alert.alert('Preuve requise','Prenez une photo de la commande livrée.'); return; }
    if (!signatureData) { Alert.alert('Signature requise','Obtenez la signature du client.'); return; }
    await api.completeOrder(selected.id, proofPhoto, signatureData);
    setSelected(null); setProofPhoto(null); setSignatureData(null);
    refresh();
    Alert.alert('Succès','Commande livrée. Bravo.');
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (<Text style={styles.sectionTitle}>{section.title}</Text>)}
        ListEmptyComponent={<Text style={{ color:'#666', marginTop:12 }}>Aucune commande disponible</Text>}
        refreshing={false}
        onRefresh={refresh}
        removeClippedSubviews
      />

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)} presentationStyle="pageSheet">
        {selected && (
          <View style={{ flex:1, paddingTop: insets.top + 12, paddingHorizontal:16, paddingBottom: insets.bottom + 16 }}>
            <Text style={styles.detailId}>{selected.id}</Text>
            <Text style={styles.detailLine}>Prise: {selected.pickup.label}</Text>
            <Text style={styles.detailLine}>Livraison: {selected.dropoff.label}</Text>
            <Text style={styles.detailLine}>Client: {selected.customer.name}  Tel: {selected.customer.phone}</Text>
            <Text style={styles.detailLine}>Articles: {selected.items.join(', ')}</Text>
            <Text style={styles.detailLine}>Montant: {(selected.amountCents/100).toFixed(2)} €</Text>
            <Text style={styles.badgeStatus}>Statut: {selected.status}</Text>

            {selected.status==='accepted' && (
              <Pressable style={[styles.btn, styles.fill]} onPress={advanceStatus}>
                <Text style={styles.btnTxt}>En route collecte</Text>
              </Pressable>
            )}

            {selected.status==='picking' && (
              <Pressable style={[styles.btn, styles.fill]} onPress={advanceStatus}>
                <Text style={styles.btnTxt}>En route livraison</Text>
              </Pressable>
            )}

            {selected.status==='delivering' && (
              <View>
                <View style={{ flexDirection:'row' }}>
                  <Pressable style={[styles.btn, styles.outline, { flex:1, marginRight:8 }]} onPress={openCamera}>
                    <Text style={[styles.btnTxt, { color:'#111' }]}>Prendre photo</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.outline, { flex:1 }]} onPress={()=>setSignatureOpen(true)}>
                    <Text style={[styles.btnTxt, { color:'#111' }]}>Signature</Text>
                  </Pressable>
                </View>
                {proofPhoto && (<Image source={{ uri: proofPhoto }} style={{ width:'100%', height:220, borderRadius:12, marginTop:12 }} />)}
                <Pressable style={[styles.btn, styles.fill, { marginTop:12 }]} onPress={markDelivered}>
                  <Text style={styles.btnTxt}>Marquer livrée</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={[styles.btn, styles.ghost]} onPress={()=>setSelected(null)}>
              <Text style={[styles.btnTxt, { color: BRAND }]}>Fermer</Text>
            </Pressable>
          </View>
        )}
      </Modal>

      <Modal visible={signatureOpen} animationType="slide" onRequestClose={()=>setSignatureOpen(false)}>
        <View style={{ flex:1, paddingTop: insets.top }}>
          <SignatureCanvas
            onOK={onSignatureOK}
            onEmpty={()=>{}}
            descriptionText="Signature client"
            clearText="Effacer"
            confirmText="Valider"
            webStyle={`.m-signature-pad--footer .button { background:${BRAND}; color:#fff; }`}
            autoClear={false}
          />
          <Pressable style={[styles.btn, { backgroundColor:'#fff', borderWidth:1, borderColor:'#e5e5ea', margin:16, marginBottom: insets.bottom + 16 }]} onPress={()=>setSignatureOpen(false)}>
            <Text style={[styles.btnTxt, { color: BRAND }]}>Annuler</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10, marginTop: 6 },
  detailId: { fontSize: 28, fontWeight: '900', marginBottom: 12 },
  detailLine: { marginVertical: 4, color: '#222', fontSize: 16, lineHeight: 22 },
  badgeStatus: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f2f2f7', alignSelf: 'flex-start', borderRadius: 999, fontWeight: '700' },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  fill: { backgroundColor: BRAND },
  outline: { backgroundColor: '#f2f2f7' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5ea' },
  btnTxt: { fontWeight: '800', color: '#fff' }
});
