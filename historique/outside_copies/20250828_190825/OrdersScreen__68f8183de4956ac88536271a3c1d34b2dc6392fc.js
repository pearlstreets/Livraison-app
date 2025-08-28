import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Modal, Image, Alert, ScrollView, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import SignatureCanvas from 'react-native-signature-canvas';
import OrderCard from '../components/OrderCard';
import api from '../components/api';

const BRAND = '#00C29B';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState([]);
  const [active, setActive] = useState([]);
  const [selected, setSelected] = useState(null);
  const [proofPhoto, setProofPhoto] = useState(null);
  const [signatureData, setSignatureData] = useState(null);
  const [signatureOpen, setSignatureOpen] = useState(false);

  const refresh = useCallback(async () => {
    setAvailable(await api.listAvailableOrders());
    setActive(await api.listActiveOrders());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(async () => {
      if (Math.random() < 0.25) await api.seedNewOrder('ORD-' + Math.floor(1000 + Math.random() * 9000));
      refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function accept(id) { await api.acceptOrder(id); await refresh(); }
  async function decline(id) { await api.declineOrder(id); await refresh(); }

  async function openCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission', 'Autorisez la caméra pour prendre une photo.'); return; }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.7 });
    if (!res.canceled) setProofPhoto(res.assets[0].uri);
  }

  function onSignatureOK(dataUrl) { setSignatureData(dataUrl); setSignatureOpen(false); }

  async function markDelivered() {
    if (!selected) return;
    if (!proofPhoto) { Alert.alert('Preuve requise', 'Prenez une photo de la commande livrée.'); return; }
    if (!signatureData) { Alert.alert('Signature requise', 'Obtenez la signature du client.'); return; }
    await api.completeOrder(selected.id, proofPhoto, signatureData);
    setSelected(null);
    setProofPhoto(null);
    setSignatureData(null);
    await refresh();
    Alert.alert('Succès', 'Commande livrée. Bravo.');
  }

  function openDirectionsToPickup(order) {
    const lat = order.pickup.lat, lng = order.pickup.lng, label = encodeURIComponent(order.pickup.label);
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`,
      android: `google.navigation:q=${lat},${lng}`
    });
    Linking.openURL(url);
  }

  const renderOrder = ({ item }) => (
    <OrderCard
      order={item}
      onAccept={() => accept(item.id)}
      onDecline={() => decline(item.id)}
      onOpen={() => setSelected(item)}
      onRoute={() => openDirectionsToPickup(item)}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            {active.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>En cours</Text>
                <FlatList data={active} keyExtractor={x => x.id} renderItem={renderOrder} scrollEnabled={false} />
              </View>
            )}
            <Text style={styles.sectionTitle}>Disponibles</Text>
          </View>
        }
        data={available}
        keyExtractor={x => x.id}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      />

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16 }}>
            <Text style={styles.detailId}>{selected.id}</Text>
            <Text style={styles.detailLine}>Prise: {selected.pickup.label}</Text>
            <Text style={styles.detailLine}>Livraison: {selected.dropoff.label}</Text>
            <Text style={styles.detailLine}>Client: {selected.customer.name}  Tel: {selected.customer.phone}</Text>
            <Text style={styles.detailLine}>Articles: {selected.items.join(', ')}</Text>
            <Text style={styles.detailLine}>Montant: {(selected.amountCents / 100).toFixed(2)} €</Text>
            <Text style={styles.badgeStatus}>Statut: {selected.status}</Text>

            {selected.status === 'accepted' && (
              <Pressable style={[styles.btn, styles.fill]} onPress={() => api.updateStatus(selected.id, 'picking').then(() => { setSelected({ ...selected, status: 'picking' }); refresh(); })}>
                <Text style={styles.btnTxt}>En route collecte</Text>
              </Pressable>
            )}

            {selected.status === 'picking' && (
              <Pressable style={[styles.btn, styles.fill]} onPress={() => api.updateStatus(selected.id, 'delivering').then(() => { setSelected({ ...selected, status: 'delivering' }); refresh(); })}>
                <Text style={styles.btnTxt}>En route livraison</Text>
              </Pressable>
            )}

            {selected.status === 'delivering' && (
              <View>
                <View style={{ flexDirection: 'row' }}>
                  <Pressable style={[styles.btn, styles.outline, { flex: 1, marginRight: 8 }]} onPress={openCamera}>
                    <Text style={[styles.btnTxt, { color: '#111' }]}>Prendre photo</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.outline, { flex: 1 }]} onPress={() => setSignatureOpen(true)}>
                    <Text style={[styles.btnTxt, { color: '#111' }]}>Signature</Text>
                  </Pressable>
                </View>
                {proofPhoto && (<Image source={{ uri: proofPhoto }} style={{ width: '100%', height: 220, borderRadius: 12, marginTop: 12 }} />)}
                <Pressable style={[styles.btn, styles.fill, { marginTop: 12 }]} onPress={markDelivered}>
                  <Text style={styles.btnTxt}>Marquer livrée</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={[styles.btn, styles.ghost]} onPress={() => setSelected(null)}>
              <Text style={[styles.btnTxt, { color: BRAND }]}>Fermer</Text>
            </Pressable>
          </ScrollView>
        )}
      </Modal>

      <Modal visible={signatureOpen} animationType="slide" onRequestClose={() => setSignatureOpen(false)}>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <SignatureCanvas
            onOK={onSignatureOK}
            onEmpty={() => {}}
            descriptionText="Signature client"
            clearText="Effacer"
            confirmText="Valider"
            webStyle={".m-signature-pad--footer .button { background:#00C29B; color:#fff; }"}
            autoClear={false}
          />
          <Pressable style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5ea', margin: 16, marginBottom: insets.bottom + 16 }]} onPress={() => setSignatureOpen(false)}>
            <Text style={[styles.btnTxt, { color: BRAND }]}>Annuler</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 28, fontWeight: '900', marginBottom: 8 },
  detailId: { fontSize: 26, fontWeight: '900', marginBottom: 12 },
  detailLine: { marginVertical: 4, color: '#222' },
  badgeStatus: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f2f2f7', alignSelf: 'flex-start', borderRadius: 999, fontWeight: '700' },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  fill: { backgroundColor: BRAND },
  outline: { backgroundColor: '#f2f2f7' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5ea' },
  btnTxt: { fontWeight: '800', color: '#fff' },
});
