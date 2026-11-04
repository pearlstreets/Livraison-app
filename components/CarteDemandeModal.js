import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mapsAvailable } from '../lib/maps';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { deliveryService } from '../services/deliveryService';
import {
  CLES_NIVEAU, COULEURS, NIVEAUX_FORTS, delaiRafraichissementMs, lienApplePlans, lienGoogleMaps, lienWaze,
  lieuParDefaut, lieuxValides, zoneDuLieu,
} from '../lib/carteDemande';

const BRAND = '#FF6A13';
const VERT_BONUS = '#00A86B';
const DELTA = 0.06;

// Dernière position connue, sans jamais ouvrir la fenêtre d'autorisation.
async function positionConnue() {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync();
    if (!pos?.coords) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

// Carte de la demande en fenêtre plein écran, ouverte au lancement de l'app :
// restaurants ouverts, zones de demande, position du livreur, panneau du bas
// avec le lieu choisi et le bouton Naviguer. La croix la ferme. En zone de
// demande forte, pastille verte du bonus par course (figé à l'acceptation).
// Liste relue au rythme demandé par le serveur (1 minute) : une boutique qui
// ferme ou passe hors ligne disparaît vite ; niveaux recalculés toutes les
// 10 minutes côté serveur.
export default function CarteDemandeModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { fmtPrice } = useCurrency();
  const mapRef = useRef(null);
  const [lieux, setLieux] = useState([]);
  const [forteDemande, setForteDemande] = useState(0);
  const [choisiId, setChoisiId] = useState(null);
  const [centre, setCentre] = useState(null);
  const [charge, setCharge] = useState(false);
  const [delaiMs, setDelaiMs] = useState(60 * 1000);

  const charger = useCallback(async () => {
    const pos = await positionConnue();
    try {
      const res = await deliveryService.getCarteDemande(pos);
      const data = res?.data || {};
      const liste = lieuxValides(data.lieux);
      setLieux(liste);
      setDelaiMs(delaiRafraichissementMs(data.rafraichir_dans_s));
      setForteDemande(Number(data.forte_demande) || liste.filter((l) => NIVEAUX_FORTS.includes(l.niveau)).length);
      setChoisiId((id) => (liste.some((l) => l.id === id) ? id : lieuParDefaut(liste)?.id ?? null));
      const c = pos || data.position || (liste[0] ? { lat: liste[0].lat, lng: liste[0].lng } : null);
      if (c) setCentre((avant) => avant || { latitude: Number(c.lat), longitude: Number(c.lng) });
    } catch {
      if (pos) setCentre((avant) => avant || { latitude: pos.lat, longitude: pos.lng });
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    charger();
    const minuteur = setInterval(charger, delaiMs);
    return () => clearInterval(minuteur);
  }, [visible, charger, delaiMs]);

  const choisi = useMemo(() => lieux.find((l) => l.id === choisiId) || null, [lieux, choisiId]);
  const zones = useMemo(() => lieux.map(zoneDuLieu).filter(Boolean), [lieux]);

  const choisir = useCallback((lieu) => {
    setChoisiId(lieu.id);
    mapRef.current?.animateToRegion({
      latitude: lieu.lat, longitude: lieu.lng, latitudeDelta: DELTA / 2, longitudeDelta: DELTA / 2,
    }, 400);
  }, []);

  const naviguer = useCallback(() => {
    if (!choisi) return;
    const ouvrir = (url) => Linking.openURL(url).catch(() => {});
    Alert.alert(t('openRoute'), choisi.nom || '', [
      ...(Platform.OS === 'ios' ? [{ text: t('navAppleMaps'), onPress: () => ouvrir(lienApplePlans(choisi)) }] : []),
      { text: 'Google Maps', onPress: () => ouvrir(lienGoogleMaps(choisi)) },
      { text: 'Waze', onPress: () => ouvrir(lienWaze(choisi)) },
      { text: t('carteDemandCancel'), style: 'cancel' },
    ]);
  }, [choisi, t]);

  const couleur = COULEURS[choisi?.niveau || 'faible'];
  const cles = CLES_NIVEAU[choisi?.niveau || 'faible'];
  const libelleProches = forteDemande === 0
    ? t('carteDemandNearbyNone')
    : forteDemande === 1 ? t('carteDemandNearbyOne') : t('carteDemandNearbyMany', { n: forteDemande });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={s.container}>
        {mapsAvailable && centre ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_DEFAULT}
            initialRegion={{ ...centre, latitudeDelta: DELTA, longitudeDelta: DELTA }}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            {zones.map((z) => (
              <React.Fragment key={z.key}>
                <Circle center={z.center} radius={z.radius} fillColor={`rgba(${z.rgb}, 0.22)`} strokeColor={`rgba(${z.rgb}, 0.5)`} strokeWidth={1} />
                <Circle center={z.center} radius={z.radius * 0.45} fillColor={`rgba(${z.rgb}, 0.35)`} strokeColor="transparent" strokeWidth={0} />
              </React.Fragment>
            ))}
            {lieux.map((l) => (
              <Marker
                key={`lieu-${l.id}`}
                coordinate={{ latitude: l.lat, longitude: l.lng }}
                onPress={() => choisir(l)}
                anchor={{ x: 0.5, y: 0.3 }}
              >
                <View style={s.repere}>
                  <View style={[s.repereRond, { borderColor: COULEURS[l.niveau].pastille }, l.id === choisiId && s.repereChoisi]}>
                    <Ionicons name="restaurant" size={16} color={l.id === choisiId ? '#fff' : '#1c1c1e'} />
                  </View>
                  <Text style={s.repereNom} numberOfLines={1}>{l.nom}</Text>
                  {l.bonus > 0 && (
                    <View style={s.repereBonus}>
                      <Text style={s.repereBonusTxt}>+{fmtPrice(l.bonus)}</Text>
                    </View>
                  )}
                </View>
              </Marker>
            ))}
          </MapView>
        ) : (
          <View style={s.sansCarte} />
        )}

        <Pressable
          style={[s.fermer, { top: insets.top + 10 }]}
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <Ionicons name="close" size={26} color="#1c1c1e" />
        </Pressable>

        <View style={[s.panneau, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {choisi ? (
            <>
              <View style={s.pastilles}>
                <View style={[s.pastille, { backgroundColor: couleur.pastille }]}>
                  <Ionicons name="flame" size={14} color="#fff" />
                  <Text style={s.pastilleTxt}>{t(cles.titre)}</Text>
                </View>
                {choisi.bonus > 0 && (
                  <View style={[s.pastille, { backgroundColor: VERT_BONUS }]}>
                    <Ionicons name="trending-up" size={14} color="#fff" />
                    <Text style={s.pastilleTxt}>{t('carteDemandBonus', { montant: fmtPrice(choisi.bonus) })}</Text>
                  </View>
                )}
              </View>
              <Text style={s.nom} numberOfLines={1}>{choisi.nom}</Text>
              {Number.isFinite(choisi.minutes) && (
                <Text style={s.minutes}>{t('carteDemandAwayMin', { n: choisi.minutes })}</Text>
              )}
              <Text style={s.proches}>{libelleProches}</Text>
              <Text style={s.phrase}>{t(cles.phrase)} {t('carteDemandUpdatedEvery10')}</Text>
              {choisi.bonus > 0 && <Text style={s.phrase}>{t('carteDemandBonusText')}</Text>}
              <Pressable style={s.naviguer} onPress={naviguer} accessibilityRole="button">
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={s.naviguerTxt}>{t('carteDemandNavigate')}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={s.vide}>{charge ? t('carteDemandNoPlaces') : t('carteDemandLoading')}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  sansCarte: { flex: 1, backgroundColor: '#f2f2f7' },
  fermer: {
    position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  repere: { alignItems: 'center', maxWidth: 140 },
  repereRond: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  repereChoisi: { backgroundColor: BRAND, borderColor: '#fff' },
  repereNom: {
    marginTop: 2, fontSize: 11, fontWeight: '700', color: '#1c1c1e',
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden',
  },
  panneau: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 18,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: -2 }, elevation: 10,
  },
  repereBonus: {
    marginTop: 2, backgroundColor: VERT_BONUS, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  repereBonusTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  pastilleTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  nom: { marginTop: 10, fontSize: 22, fontWeight: '800', color: '#1c1c1e' },
  minutes: { marginTop: 2, fontSize: 15, color: '#3a3a3c' },
  proches: { marginTop: 10, fontSize: 15, fontWeight: '600', color: '#1c1c1e' },
  phrase: { marginTop: 4, fontSize: 14, lineHeight: 20, color: '#6e6e73' },
  naviguer: {
    marginTop: 16, height: 52, borderRadius: 12, backgroundColor: BRAND,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  naviguerTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  vide: { fontSize: 15, color: '#6e6e73', textAlign: 'center', paddingVertical: 16 },
});
