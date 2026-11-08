import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Switch, TouchableOpacity, Pressable, Dimensions, Alert, AppState, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useFocusEffect } from '@react-navigation/native';
import OrderCard from '../components/OrderCard';
import CarteDemandeVue from '../components/CarteDemandeVue';
import OffreCoursePopup from '../components/OffreCoursePopup';
import DetailsSheet from '../components/DetailsSheet';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatKm, formatMinutes } from '../lib/i18nFormat';
import { deliveryService } from '../services/deliveryService';
import { envoyerPosition, positionObligatoire } from '../services/positionLivreur';
import { ouvrirVerification } from '../services/identiteService';
import BandeauDocumentsSeuil from '../components/BandeauDocumentsSeuil';
import { chargerDocumentsSeuil, donneesConnues, ecouter, estDocumentsRequis, signalerDocumentsRequis } from '../services/documentsSeuil';
import { chargerEtapes, cleCourse, enregistrerEtape, garderSeulement, lireEtape, oublierEtape } from '../services/etapesCourses';
import { annoncerCourses, marquerCoursesAnnoncees, noterReleve } from '../services/sonCourse';

// Libellé de l'étape en cours d'une course acceptée (index DeliveryFlow).
const ACTIVE_STEP_KEYS = ['pickup', 'enRoute', 'arrived', 'deliveryCode', 'deliveryDone'];

// Étape de l'écran de livraison qui correspond au statut serveur d'une course.
const ETAPE_DU_STATUT = { accepted: 0, picked_up: 1, in_transit: 1, arrived: 2 };
// Étape atteinte : celle gardée sur le téléphone, sinon celle du statut serveur.
function etapeCourse(order) {
  const garde = lireEtape(cleCourse(order));
  const duStatut = ETAPE_DU_STATUT[order?.status] ?? 0;
  return garde && typeof garde.step === 'number' ? Math.max(garde.step, duStatut) : duStatut;
}

/* === Zone d'approche (avant acceptation) ===
   Avant acceptation, le livreur n'a besoin que de la zone : quartier, ville et
   code postal. Ni nom, ni téléphone, ni numéro de rue. Les champs vides sont
   simplement ignorés pour ne jamais afficher un libellé vide. */
function buildZoneLabel(a) {
  const ua = (a && a.user_address) || {};
  return [ua.road_area_colony, ua.city, ua.pincode || ua.postalCode]
    .map(v => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(', ');
}

/* === Adaptateur backend assignment → forme attendue par OrderCard ===
   `revealCustomer` : vrai une fois la course acceptée (le backend envoie alors
   l'adresse complète et le téléphone). Faux pour la liste des disponibles. */
// Nombre fourni par le serveur (float ou chaîne décimale), sinon null.
function serverNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function adaptAssignment(a, { revealCustomer = true } = {}) {
  const fee = typeof a.delivery_fee === 'number' ? a.delivery_fee : 0;
  const tip = typeof a.tip_amount === 'number' ? a.tip_amount : 0;
  // Bonus de demande (zone de forte demande), figé à l'acceptation.
  const bonus = serverNumber(a.bonus_demande) || 0;
  // Gain du livreur calculé par le serveur (frais + pourboire + bonus -
  // commission) : affiché tel quel. Repli sur frais + pourboire + bonus.
  const gainNet = serverNumber(a.gain_net);
  const total = gainNet != null ? gainNet : fee + tip + bonus;
  // Distance et temps calculés par le serveur : 0 = inconnu, donc non affiché.
  const distanceKm = serverNumber(a.distance_km);
  const etaMinutes = serverNumber(a.estimated_time_minutes);
  const items = Array.isArray(a.order_items)
    ? a.order_items.map(it => ({ name: it.name || '', qty: typeof it.quantity === 'number' ? it.quantity : 1 }))
    : [];
  // Avant acceptation : la zone remplace l'adresse de livraison si elle est
  // disponible, sinon on garde ce que le backend a envoyé (déjà restreint).
  const zone = revealCustomer ? '' : buildZoneLabel(a);
  const dropoff = revealCustomer ? (a.dropoff_address || '') : (zone || a.dropoff_address || '');
  return {
    // identifiants
    id: String(a.order_id || a.id || ''),   // clé numérique (accept / API)
    orderNumber: a.order_number || '',       // numéro OFFICIEL affiché (code marchand)
    _assignmentId: a.id,          // conservé pour les appels updateDeliveryStatus
    order_id: a.order_id,
    // affichage — vraie boutique (nom réel + image + adresse réelle du shop)
    restaurant: a.shop_name || a.pickup_address || '',
    shopName: a.shop_name || '',
    shopImage: a.shop_image || '',
    address: a.pickup_address || dropoff || '',
    dropoffAddress: dropoff,
    pickupAddress: a.pickup_address || '',
    distanceText: distanceKm > 0 ? formatKm(distanceKm.toFixed(1)) : '',
    etaText: etaMinutes > 0 ? formatMinutes(Math.round(etaMinutes)) : '',
    priceText: `${total.toFixed(2)} €`,
    priceEur: total,
    gainNet,
    bonusEur: bonus > 0 ? bonus : 0,
    delivery_fee: fee,
    tip_amount: tip,
    // Bonus compris dans le prix (zone calme), calculés serveur.
    bonus: Array.isArray(a.bonus?.details) ? a.bonus.details : [],
    // Heure à laquelle la commande sera prête en boutique (ISO UTC ou null).
    readyAt: a.ready_at || null,
    // Délais calculés par le serveur pour une course acceptée : étape en cours
    // (boutique avant récupération, client après), boutique, client.
    etapeEtaMinutes: serverNumber(a.etape_eta_minutes),
    etapeEtaAt: a.etape_eta_at || null,
    pickupEtaMinutes: serverNumber(a.pickup_eta_minutes),
    pickupEtaAt: a.pickup_eta_at || null,
    dropoffEtaMinutes: serverNumber(a.eta_minutes),
    dropoffEtaAt: a.eta_at || null,
    itemsCount: items.reduce((s, it) => s + it.qty, 0),
    items,
    // coordonnées
    dropoffLat: a.dropoff_lat,
    dropoffLng: a.dropoff_lng,
    pickupLat: a.pickup_lat,
    pickupLng: a.pickup_lng,
    // méta
    status: a.status || '',
    // Arrivée chez le client (serveur), base du minuteur d'attente.
    arrivedAt: a.arrived_at || null,
    // Offre réservée à ce livreur pour un temps limité (fin donnée par le
    // serveur) : seule une telle offre a un compte à rebours et un refus auto.
    offerExpiresAt: a.offer_expires_at || null,
    delivery_code: a.delivery_code || '',
    // Options de remise posées par le commerçant (fragile / alcool / consigne
    // si le client est absent). Visibles dès le pool pour décider d'accepter.
    is_fragile: !!a.is_fragile,
    has_alcohol: !!a.has_alcohol,
    absent_policy: a.absent_policy || 'return',
    // Nom du client : jamais affiché tant que la course n'est pas acceptée.
    customer_name: revealCustomer ? (a.customer_name || '') : '',
    // Téléphone client : le backend l'expose dans user_address.phone_number
    // (une fois la course acceptée) → permet un vrai appel depuis l'app.
    customerPhone: revealCustomer
      ? ((a.user_address && (a.user_address.phone_number || a.user_address.phone)) || a.customer_phone || '')
      : '',
    user_address: revealCustomer ? (a.user_address || {}) : {},
    created_at: a.created_at || '',
  };
}

/* ---------- Helpers clé ---------- */
const rint = (min, max) => Math.floor(Math.random()*(max-min+1))+min;

/* ---------- Mock generator (outil dev — simule une commande sans backend) ---------- */
const MOCK_RESTAURANTS = ['Burger Pearl', 'Pizza Marco', 'Sushi Yama', 'Tacos Express', 'Curry House', 'Le Petit Bistrot'];
// Adresses et VRAIES coordonnées des courses d'essai. ⛔ Même ordre que
// `ESSAI_RETRAITS` / `ESSAI_LIVRAISONS` du serveur (DeliveryApp/itineraire.py) :
// la carte demande le tracé par les rues avec `essai=<retrait>,<livraison>`.
const MOCK_PICKUPS = [
  { address: '12 Rue du Commerce, 75015 Paris', lat: 48.8469, lng: 2.2945 },
  { address: '34 Avenue Foch, 75116 Paris', lat: 48.8724, lng: 2.2840 },
  { address: '8 Rue de Rivoli, 75004 Paris', lat: 48.8553, lng: 2.3601 },
  { address: '45 Boulevard Haussmann, 75009 Paris', lat: 48.8735, lng: 2.3311 },
];
const MOCK_DROPOFFS = [
  { address: '56 Rue Lafayette, 75009 Paris', lat: 48.8751, lng: 2.3433 },
  { address: '21 Boulevard Voltaire, 75011 Paris', lat: 48.8649, lng: 2.3700 },
  { address: '7 Rue de la Roquette, 75011 Paris', lat: 48.8538, lng: 2.3713 },
  { address: '99 Avenue des Champs-Élysées, 75008 Paris', lat: 48.8718, lng: 2.3006 },
];
const MOCK_ITEMS_SETS = [
  [{ name: 'Burger Classique', qty: 1 }, { name: 'Frites', qty: 1 }, { name: 'Coca 33cl', qty: 1 }],
  [{ name: 'Pizza Margherita', qty: 1 }, { name: 'Tiramisu', qty: 1 }],
  [{ name: 'Sushi mix 12 pcs', qty: 1 }, { name: 'Soupe miso', qty: 2 }],
  [{ name: 'Tacos M', qty: 2 }, { name: 'Eau plate', qty: 1 }],
  [{ name: 'Poulet curry', qty: 1 }, { name: 'Naan', qty: 2 }, { name: 'Riz basmati', qty: 1 }],
];
const MOCK_CUSTOMERS = ['Sophie M.', 'Lucas D.', 'Léa P.', 'Hugo R.', 'Emma F.', 'Noah B.', 'Chloé V.'];
let __MOCK_SEQ = 1;
function makeMockOrder() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const distance = +(0.8 + Math.random() * 5.2).toFixed(1);
  const eta = Math.round(8 + distance * 3);
  const fee = +(3 + Math.random() * 5).toFixed(2);
  const tip = Math.random() > 0.5 ? +(1 + Math.random() * 3).toFixed(2) : 0;
  const total = +(fee + tip).toFixed(2);
  const items = pick(MOCK_ITEMS_SETS);
  const iRetrait = Math.floor(Math.random() * MOCK_PICKUPS.length);
  const iLivraison = Math.floor(Math.random() * MOCK_DROPOFFS.length);
  const retrait = MOCK_PICKUPS[iRetrait];
  const livraison = MOCK_DROPOFFS[iLivraison];
  const seq = __MOCK_SEQ++;
  return {
    _isMock: true,
    _uid: `mock-${Date.now()}-${seq}`,
    id: `ESSAI-${String(seq).padStart(4, '0')}`,
    _assignmentId: `mock-asg-${seq}`,
    order_id: `mock-${seq}`,
    restaurant: pick(MOCK_RESTAURANTS),
    _essai: `${iRetrait},${iLivraison}`,
    address: livraison.address,
    dropoffAddress: livraison.address,
    pickupAddress: retrait.address,
    distanceText: formatKm(distance.toFixed(1)),
    etaText: formatMinutes(eta),
    priceText: `${total.toFixed(2)} €`,
    priceEur: total,
    delivery_fee: fee,
    tip_amount: tip,
    itemsCount: items.reduce((s, it) => s + it.qty, 0),
    items,
    dropoffLat: livraison.lat,
    dropoffLng: livraison.lng,
    pickupLat: retrait.lat,
    pickupLng: retrait.lng,
    status: 'available',
    delivery_code: String(Math.floor(1000 + Math.random() * 9000)),
    customer_name: pick(MOCK_CUSTOMERS),
    user_address: {},
    created_at: new Date().toISOString(),
  };
}

/* ---------- Écran ---------- */
const orderKey = (o) => o?._uid || o?.id || o?.code;

// Compte de démonstration remis aux vérificateurs Apple et Google. La liste
// "Disponibles" dépend de commandes marchandes réelles et se trouve donc
// presque toujours vide pendant une vérification : ce compte conserve le
// générateur de commande de test pour que le parcours complet reste
// vérifiable, sans exposer le bouton aux vrais livreurs.
const REVIEW_ACCOUNT_EMAIL = 'king@gmail.com';
// Livraison pas encore ouverte : bouton Simuler et message d'ouverture pour tous.
const SIMULATION_POUR_TOUS = true;

export default function OrdersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { accountActive, addToHistory, isOnline, setIsOnline, user } = useAuth();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { fmtPrice } = useCurrency();
  // Couleurs du thème : en mode clair, valeurs identiques à l'écran d'origine.
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const gris = dark ? colors.textMuted : '#888';
  const scrollRef = useRef(null);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  // Documents demandés par le serveur (seuil de gains) : lus à chaque retour
  // sur l'accueil, une seule requête, et mis à jour après chaque envoi.
  const [docsSeuil, setDocsSeuil] = useState(donneesConnues);
  useEffect(() => ecouter(setDocsSeuil), []);
  useFocusEffect(useCallback(() => {
    chargerDocumentsSeuil();
  }, []));

  // --- Poll commandes disponibles toutes les 15s quand En ligne ---
  const pollRef = useRef(null);

  // Courses dont l'acceptation est partie et courses en cours : jamais
  // remontrées dans les disponibles par un rafraîchissement.
  const acceptEnCours = useRef(new Set());
  const activeRef = useRef([]);

  const fetchAvailableOrders = useCallback(async () => {
    // Relève notée : la veille globale (App.js) ne la double pas.
    noterReleve();
    try {
      const res = await deliveryService.getAvailableOrders();
      const data = Array.isArray(res?.data) ? res.data : [];
      const exclues = new Set([...acceptEnCours.current, ...activeRef.current.map(o => orderKey(o))]);
      // Liste des disponibles : coordonnées client masquées tant que la course
      // n'est pas acceptée (zone + distance suffisent pour décider).
      const disponibles = data
        .filter(Boolean)
        .map(a => adaptAssignment(a, { revealCustomer: false }))
        .filter(o => !exclues.has(orderKey(o)));
      setAvailable(disponibles);
      // Son d'une nouvelle course, une fois par course, même si l'accueil
      // n'est pas affiché (services/sonCourse.js). App en arrière-plan : la
      // push a déjà sonné, les courses sont notées sans son au retour.
      if (AppState.currentState === 'active') annoncerCourses(disponibles);
      else marquerCoursesAnnoncees(disponibles);
    } catch {
      // Silencieux : on garde la liste actuelle plutôt que de crasher
    }
  }, []);

  const [detailsOrder, setDetailsOrder] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false); //__DETAILS_STATE_ANCHOR

  const online = isOnline;
  const setOnline = setIsOnline;
  // Comme Uber : pas en ligne sans position. La position part d'abord, pour que
  // le serveur ait une position fraîche dès le passage en ligne.
  const passerEnLigne = useCallback(async () => {
    const coords = await positionObligatoire(t);
    if (!coords) return;
    if (coords.latitude != null) {
      await envoyerPosition(coords.latitude, coords.longitude, { forcer: true, mocked: coords.mocked });
    }
    setOnline(true);
  }, [t, setOnline]);
  const [active, setActive] = useState([]);           // En cours
  const [available, setAvailable] = useState([]);     // Disponibles (backend)
  const [mockOrders, setMockOrders] = useState([]);   // Disponibles simulées (dev)
  activeRef.current = active;
  // Relu au retour sur l'accueil : l'étape atteinte vit dans etapesCourses.
  const [, setRelecture] = useState(0);

  // Courses déjà acceptées, relues sur le serveur au lancement et à chaque
  // passage en ligne : une course en cours ne disparaît jamais de l'écran
  // (app fermée, téléphone redémarré). Réseau coupé : on garde l'affichage.
  const restaurerCourses = useCallback(async () => {
    await chargerEtapes();
    let liste;
    try {
      liste = await deliveryService.getActiveDeliveries();
    } catch {
      setRelecture(n => n + 1);
      return;
    }
    // Réponse inattendue : jamais de .map sur autre chose qu'un tableau.
    const courses = (Array.isArray(liste) ? liste : []).filter(Boolean).map(a => adaptAssignment(a));
    garderSeulement(courses.map(cleCourse));
    setActive(prev => [...courses, ...prev.filter(o => o._isMock)]);
  }, []);

  useEffect(() => {
    if (accountActive) restaurerCourses();
  }, [accountActive, online, restaurerCourses]);

  // Course annulée (notification course_cancelled, App.js) : liste relue.
  useEffect(() => {
    const abo = DeviceEventEmitter.addListener('courseAnnulee', () => { if (accountActive) restaurerCourses(); });
    return () => abo.remove();
  }, [accountActive, restaurerCourses]);

  const addMockOrder = useCallback(() => {
    setMockOrders(prev => [makeMockOrder(), ...prev]);
  }, []);

  // Bouton Simuler réservé au compte King (et aux builds de développement) :
  // aucun autre livreur ne voit de course simulée.
  const canSimulate = __DEV__
    || String(user?.email || '').trim().toLowerCase() === REVIEW_ACCOUNT_EMAIL;

  const displayedAvailable = useMemo(() => [...mockOrders, ...available], [mockOrders, available]);

  // Handle completed order from DeliveryFlow
  useEffect(() => {
    const completedOrder = route?.params?.completedOrder;
    if (completedOrder) {
      const key = orderKey(completedOrder);
      setActive(prev => prev.filter(o => orderKey(o) !== key));
      oublierEtape(cleCourse(completedOrder));
      addToHistory(completedOrder);
      navigation.setParams({ completedOrder: undefined });
    }
  }, [route?.params?.completedOrder]);

  // Handle cancelled order from DeliveryFlow
  useEffect(() => {
    const cancelledOrder = route?.params?.cancelledOrder;
    if (cancelledOrder) {
      const key = orderKey(cancelledOrder);
      setActive(prev => prev.filter(o => orderKey(o) !== key));
      oublierEtape(cleCourse(cancelledOrder));
      addToHistory(cancelledOrder);
      navigation.setParams({ cancelledOrder: undefined });
    }
  }, [route?.params?.cancelledOrder]);

  // Retour depuis l'écran de livraison : étape atteinte relue (etapesCourses).
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => setRelecture(n => n + 1));
    return unsubscribe;
  }, [navigation]);

  // Poll toutes les 15s quand En ligne
  useEffect(() => {
    if (!online) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setAvailable([]);
      return;
    }
    // Premier fetch immédiat
    fetchAvailableOrders();
    pollRef.current = setInterval(fetchAvailableOrders, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [online, fetchAvailableOrders]);

  const onAccept = useCallback(async (order) => {
    const key = orderKey(order);
    // Commande simulée : aucun appel backend, transition directe vers active
    if (order?._isMock) {
      setMockOrders(prev => prev.filter(o => orderKey(o) !== key));
      const accepted = { ...order, status: 'accepted' };
      setActive(prev => [accepted, ...prev]);
      enregistrerEtape(cleCourse(accepted), { step: 0, statut: 'accepted' });
      navigation.navigate('DeliveryFlow', { order: accepted });
      return;
    }
    // Une seule demande par course, même sur un double appui.
    if (acceptEnCours.current.has(key)) return;
    acceptEnCours.current.add(key);
    // Retrait optimiste de la liste disponible
    setAvailable(prev => prev.filter(o => orderKey(o) !== key));
    try {
      const res = await deliveryService.acceptDelivery(order.order_id);
      const assignment = res?.data ? adaptAssignment(res.data) : { ...order, status: 'accepted' };
      setActive(prev => [assignment, ...prev.filter(o => orderKey(o) !== orderKey(assignment))]);
      enregistrerEtape(cleCourse(assignment), { step: 0, statut: 'accepted' });
      navigation.navigate('DeliveryFlow', { order: assignment });
    } catch (e) {
      // Course prise par un autre livreur, retirée ou refusée pour ce
      // livreur : elle ne revient pas. Autre échec : remise dans la liste.
      const plusPourLui = [403, 404, 409, 423].includes(e?.status);
      if (!plusPourLui) {
        setAvailable(prev => (prev.some(o => orderKey(o) === key) ? prev : [order, ...prev]));
      }
      // Vérification d'identité en attente ou compte bloqué : plus de nouvelle course.
      if (e?.status === 423) {
        Alert.alert(t('idvTitre'), e.serverMessage || t('idvAcceptRefuse'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('idvOuvrir'), onPress: () => ouvrirVerification(e.identite || null) },
        ]);
        return;
      }
      // Documents demandés par le serveur : pas d'erreur générique.
      if (estDocumentsRequis(e)) signalerDocumentsRequis(e, t);
      else if (e?.status === 409 || e?.status === 404) Alert.alert(t('error'), t('orderNoLongerAvailable'));
      else if (e?.isNetworkError) Alert.alert(t('error'), t('errorNetwork'));
      else Alert.alert(t('error'), (e?.status === 403 && e.serverMessage) || t('acceptOrderError'));
      // Réponse perdue ou course déjà attribuée : elle est peut-être à ce
      // livreur, on relit ses courses en cours sur le serveur.
      if (e?.isNetworkError || e?.status === 409) restaurerCourses();
    } finally {
      acceptEnCours.current.delete(key);
    }
  }, [navigation, t, restaurerCourses]);

  const onResumeActive = useCallback((order) => {
    navigation.navigate('DeliveryFlow', { order, initialStep: etapeCourse(order) });
  }, [navigation]);

  const onDecline = useCallback(async (order) => {
    const key = orderKey(order);
    setAvailable(prev => prev.filter(o => orderKey(o) !== key));
    setMockOrders(prev => prev.filter(o => orderKey(o) !== key));
    // Refus RÉEL de l'offre chronométrée → le backend la ré-offre au suivant.
    try { if (order?.order_id) await deliveryService.declineDelivery(order.order_id); } catch (e) {}
  }, []);

    const keyOf = (o, i) => String(o?._uid || o?.id || o?.code || `order-${i}`);

  const onOpen = useCallback((order)=>{ setDetailsOrder(order); setDetailsVisible(true); }, []);

  // Accueil sans course en cours : la carte de la demande (même vue que le
  // bouton carte), demande du 05/11/2026. Les courses proposées arrivent en
  // cartes par-dessus. L'icône liste revient à la liste.
  const [vueListe, setVueListe] = useState(false);
  const carteVide = active.length === 0;

  // Fenêtre « Nouvelle course » : chaque course proposée s'ouvre une fois.
  const offresVues = useRef(new Set());
  const [offre, setOffre] = useState(null);
  // Stable : le minuteur de la fenêtre ne repart pas à chaque rendu.
  const fermerOffre = useCallback(() => setOffre(null), []);
  useEffect(() => {
    if (!online || !carteVide || offre) return;
    const nouvelle = displayedAvailable.find((o, i) => !offresVues.current.has(keyOf(o, i)));
    if (nouvelle) {
      offresVues.current.add(keyOf(nouvelle, displayedAvailable.indexOf(nouvelle)));
      setOffre(nouvelle);
    }
  }, [displayedAvailable, online, carteVide, offre]);
  // Course retirée (prise par un autre, expirée) : la fenêtre se ferme.
  // Comparaison par clé : la relève des 15 s recrée les objets, la fenêtre ne
  // doit pas se fermer pour autant tant que la course est toujours proposée.
  const cleOffre = offre ? orderKey(offre) : null;
  useEffect(() => {
    if (offre && !displayedAvailable.some(o => (cleOffre != null ? orderKey(o) === cleOffre : o === offre))) setOffre(null);
  }, [displayedAvailable, offre, cleOffre]);
  const estOffre = (o) => !!offre && (cleOffre != null ? orderKey(o) === cleOffre : o === offre);

  if (!accountActive) {
    return (
      <View style={[styles.deactivatedContainer, { paddingTop: insets.top + 16 }]}>
        <Ionicons name="lock-closed" size={48} color={colors.danger} />
        <Text style={styles.deactivatedTitle}>{t('accountDeactivated')}</Text>
        <Text style={styles.deactivatedSub}>{t('accountDeactivatedMsg')}</Text>
      </View>
    );
  }

  if (carteVide && !vueListe) {
    return (
      <CarteDemandeVue
        navigation={navigation}
        onList={() => setVueListe(true)}
        onStatusPress={() => (online ? setOnline(false) : passerEnLigne())}
      >
        <BandeauDocumentsSeuil donnees={docsSeuil} onPress={() => navigation.navigate('DocumentsSeuil')} />
        {!online && (
          <Pressable style={[styles.goOnlineBtn, { marginHorizontal: 0, marginBottom: 0 }]} onPress={passerEnLigne}>
            <Ionicons name="power" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.goOnlineBtnTxt}>{t('goOnline')}</Text>
          </Pressable>
        )}
        {online && canSimulate && (
          <TouchableOpacity style={[styles.mockBtn, { alignSelf: 'flex-start' }]} onPress={addMockOrder} accessibilityLabel={t('simulate')}>
            <Ionicons name="flask-outline" size={16} color="#fff" />
            <Text style={styles.mockBtnTxt}>{t('simulate')}</Text>
          </TouchableOpacity>
        )}
        {online && displayedAvailable.length > 0 && (
          <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.45 }} showsVerticalScrollIndicator={false}>
            {/* La course de la fenêtre « Nouvelle course » n'est pas répétée derrière elle. */}
            {displayedAvailable.map((order, i) => estOffre(order) ? null : (
              <View key={keyOf(order, i)} style={styles.cardWrap}>
                <OrderCard order={order} onAccept={onAccept} onDecline={onDecline} onOpen={onOpen} />
              </View>
            ))}
          </ScrollView>
        )}
        <DetailsSheet visible={detailsVisible} order={detailsOrder} onClose={() => setDetailsVisible(false)} />
        <OffreCoursePopup order={offre} onAccept={onAccept} onDecline={onDecline} onOpen={onOpen} onClose={fermerOffre} />
      </CarteDemandeVue>
    );
  }

  return (
    <>
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, flexGrow: 1 }]}
      alwaysBounceVertical={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
    >
      {/* Bandeau En ligne / Hors ligne */}
      <View style={[styles.onlineCard, !online && { borderWidth: 1, borderColor: dark ? colors.borderStrong : '#E6E8EB' }]}>
        {/* Icône carte tout à gauche, puis l'état. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable style={styles.mapBtn} onPress={() => (carteVide ? setVueListe(false) : navigation.navigate('Heatmap'))}>
            <Ionicons name="map" size={18} color="#FF6A13" />
          </Pressable>
          <Text style={[styles.onlineText, !online && { color: colors.textFaint }]}>{online ? t('online') : t('offline')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch
            value={online}
            onValueChange={(val) => {
              if (!val && active.length > 0) {
                Alert.alert(t('cannotGoOfflineTitle') || 'Impossible', t('cannotGoOfflineMsg') || 'Vous avez une commande en cours. Terminez-la avant de passer hors ligne.');
                return;
              }
              if (val) passerEnLigne();
              else setOnline(false);
            }}
            trackColor={{ true: '#FF6A13', false: dark ? colors.borderStrong : '#E6E8EB' }}
            thumbColor={online ? '#fff' : '#fff'}
          />
        </View>
      </View>

      <BandeauDocumentsSeuil donnees={docsSeuil} onPress={() => navigation.navigate('DocumentsSeuil')} />

      {/* Hors ligne message — centered vertically */}
      {!online && active.length === 0 && (
        <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 240 }}>
          <Ionicons name="moon-outline" size={48} color={colors.chevron} />
          <Text style={styles.offlineTitle}>{t('youAreOffline')}</Text>
          <Text style={styles.offlineSub}>{t('offlineMsg')}</Text>
        </View>
      )}

      {/* Bottom go-online button */}
      {!online && (
        <Pressable style={styles.goOnlineBtn} onPress={passerEnLigne}>
          <Ionicons name="power" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.goOnlineBtnTxt}>{t('goOnline')}</Text>
        </Pressable>
      )}

      {/* En cours */}
      {active.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('inProgress')}</Text>
          <View style={styles.cardsBlock}>
            {active.map((order, i) => {
              const stepInfo = { stepIndex: etapeCourse(order) };
              return (
                <Pressable key={keyOf(order, i)} style={styles.cardWrap} onPress={() => onResumeActive(order)}>
                  <View style={styles.activeCard}>
                    {/* Step status badge */}
                    <View style={styles.activeStepBadge}>
                      <Ionicons name={
                        stepInfo?.stepIndex === 0 ? 'storefront-outline' :
                        stepInfo?.stepIndex === 1 ? ({ car: 'car', walk: 'walk' }[user?.vehicle] || 'bicycle') :
                        stepInfo?.stepIndex === 2 ? 'location' :
                        stepInfo?.stepIndex === 3 ? 'keypad' : 'checkmark-circle'
                      } size={14} color="#fff" />
                      <Text style={styles.activeStepText}>{t(ACTIVE_STEP_KEYS[stepInfo?.stepIndex || 0] || 'pickup')}</Text>
                    </View>
                    {/* Order info */}
                    <View style={styles.activeHeader}>
                      {/* Numéro officiel de commande (comme la carte), puis gain en devise du livreur. */}
                      <Text style={styles.activeCode} numberOfLines={1}>{order.orderNumber || order.id || order.code}</Text>
                      <Text style={styles.activePrice}>{order.priceEur != null ? fmtPrice(order.priceEur) : (order.priceText || order.price)}</Text>
                    </View>
                    <View style={styles.activeDetailRow}>
                      <Ionicons name="storefront-outline" size={14} color={gris} />
                      <Text style={styles.activeDetailText} numberOfLines={1}>{order.restaurant || order.merchantName}</Text>
                    </View>
                    <View style={styles.activeDetailRow}>
                      <Ionicons name="location-outline" size={14} color={gris} />
                      <Text style={styles.activeDetailText} numberOfLines={1}>{order.dropoffAddress || order.address}</Text>
                    </View>
                    <View style={styles.activeFooter}>
                      <Text style={styles.activeContinue}>{t('continueDelivery')}</Text>
                      <Ionicons name={dirIcon('chevron-forward')} size={16} color="#FF6A13" />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Disponibles (only when online) */}
      {online && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, active.length > 0 && styles.sectionTitleGap, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('available')}
            </Text>
            {canSimulate && (
              <TouchableOpacity
                style={[styles.mockBtn, { marginLeft: 8 }]}
                onPress={addMockOrder}
                accessibilityLabel={t('simulate')}
              >
                <Ionicons name="flask-outline" size={16} color="#fff" />
                <Text style={styles.mockBtnTxt}>{t('simulate')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.cardsBlock, SIMULATION_POUR_TOUS && available.length === 0 && styles.cardsBlockCentre]}>
            {SIMULATION_POUR_TOUS && available.length === 0 && (
              <View style={styles.opensSoonCard}>
                <Ionicons name="time-outline" size={28} color="#FF6A13" />
                <Text style={styles.opensSoonTitle}>{t('deliveryOpensSoonTitle')}</Text>
                <Text style={styles.opensSoonText}>{t('deliveryOpensSoonText')}</Text>
              </View>
            )}
            {displayedAvailable.length > 0 ? (
              displayedAvailable.map((order, i) => (
                <View key={keyOf(order, i)} style={styles.cardWrap}>
                  <OrderCard
                    order={order}
                    onAccept={onAccept}
                    onDecline={onDecline}
                    onOpen={onOpen}
                  />
                </View>
              ))
            ) : SIMULATION_POUR_TOUS ? null : (
              <Text style={styles.emptyText}>{t('noOrders')}</Text>
            )}
          </View>
        </>
      )}
      <DetailsSheet visible={detailsVisible} order={detailsOrder} onClose={() => setDetailsVisible(false)} />
    </ScrollView>
    <StatusBarShield color={dark ? colors.bg : 'rgb(242, 242, 242)'} />
    </>
  );
}

/* ---------- Styles ---------- */
const makeStyles = (c, dark) => StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 12 },

  onlineCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2
  },
  onlineText: { color: '#FF6A13', fontWeight: '700', fontSize: 16 },
  mapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: 28, fontWeight: '800', color: c.text, marginTop: 4, marginBottom: 8 },
  sectionTitleGap: {  marginTop: 8  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mockBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF6A13', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  opensSoonCard: { backgroundColor: c.card, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', marginBottom: 12 },
  opensSoonTitle: { fontSize: 17, fontWeight: '700', color: dark ? c.text : '#1c1c1e', marginTop: 10, textAlign: 'center' },
  opensSoonText: { fontSize: 14, color: dark ? c.textMuted : '#6b6b70', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  mockBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cardsBlock: {  marginBottom: 0  },
  // Box « La livraison ouvre bientôt » centrée verticalement dans l'espace libre.
  cardsBlockCentre: { flex: 1, justifyContent: 'center' },
  cardWrap: { marginBottom: 8 },
  emptyText: { color: dark ? c.textMuted : '#8E8E93', paddingVertical: 8, paddingHorizontal: 4 },

  // Offline
  offlineTitle: { fontSize: 18, fontWeight: '800', color: c.textFaint, marginTop: 12 },
  offlineSub: { fontSize: 14, color: dark ? c.textFaint : '#bbb', marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  goOnlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C29B', borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginBottom: 16 },
  goOnlineBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Deactivated
  deactivatedContainer: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  deactivatedTitle: { fontSize: 22, fontWeight: '900', color: c.danger, marginTop: 16, marginBottom: 8 },
  deactivatedSub: { fontSize: 14, color: dark ? c.textMuted : '#666', textAlign: 'center', lineHeight: 20 },

  // Active (en cours)
  activeCard: { backgroundColor: c.card, borderRadius: 16, padding: 14, borderLeftWidth: 4, borderLeftColor: '#FF6A13' },
  activeStepBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#FF6A13', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, gap: 5, marginBottom: 8 },
  activeStepText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  activeCode: { flex: 1, fontWeight: '800', fontSize: 15, color: c.text },
  activePrice: { flexShrink: 0, marginLeft: 8, fontWeight: '900', fontSize: 16, color: '#FF6A13' },
  activeDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  activeDetailText: { fontSize: 13, color: dark ? c.textMuted : '#666', flexShrink: 1 },
  activeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6, gap: 4 },
  activeContinue: { fontSize: 13, fontWeight: '700', color: '#FF6A13' },

});
