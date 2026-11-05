import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, Dimensions, Linking, Alert, TextInput, ScrollView, Modal, FlatList, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { Image as ImageReduite } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import translations from '../contexts/translations';
import { useTheme } from '../contexts/ThemeContext';
import { formatAmount, formatTime, formatMinutes } from '../lib/i18nFormat';
import { dirIcon, isRTL } from '../lib/rtl';
import { sanitizeInput, createRateLimiter } from '../utils/validation';
import { deliveryService } from '../services/deliveryService';
import { ticketService } from '../services/ticketService';
import { etasConnues, surEtas } from '../services/positionLivreur';
import { prendrePhoto, preparerCamera, envoyerPreuve, renvoyerPreuvesEnAttente } from '../services/preuvePhoto';
import { lienApplePlansVers } from '../lib/carteDemande';
import { cleCourse, enregistrerEtape, lireEtape } from '../services/etapesCourses';

// Statuts serveur d'une course en cours, dans l'ordre imposé par le serveur
// (aucun saut possible). 'delivered' est envoyé à part, avec le code.
const CHAINE_STATUTS = ['accepted', 'picked_up', 'in_transit', 'arrived'];
// Statut serveur à atteindre en QUITTANT une étape :
// - quitter "pickup"  = récupéré ET départ en course (picked_up puis in_transit)
// - quitter "enroute" = le livreur déclare son arrivée (arrived)
// - quitter "arrived" = rien ; l'étape code envoie 'delivered'
const STATUT_CIBLE = { pickup: 'in_transit', enroute: 'arrived' };
// Statut déjà atteint quand l'écran s'ouvre sur une étape donnée.
const STATUT_DE_ETAPE = ['accepted', 'in_transit', 'arrived', 'arrived', 'arrived'];
const CODE_SECONDS = 10 * 60;

// Délai de l'étape en cours calculé par le serveur (vers la boutique avant la
// récupération, vers le client après). Lu dans une course (champs plats
// etape_eta_*) ou dans `etas[assignment_id]` de la réponse de position.
// Renvoie null si le serveur ne fournit pas ces champs (ancien serveur).
function etapeEtaServeur(src) {
  if (!src || typeof src !== 'object') return null;
  if (!('etape_eta_minutes' in src) && !('etape_eta_at' in src)) return null;
  const n = src.etape_eta_minutes == null || src.etape_eta_minutes === '' ? null : Number(src.etape_eta_minutes);
  return { minutes: Number.isFinite(n) ? n : null, at: src.etape_eta_at || null };
}

// Réponse du changement de statut : la course seule, ou enveloppée.
function etapeEtaReponse(res) {
  return etapeEtaServeur(res) || etapeEtaServeur(res?.assignment) || etapeEtaServeur(res?.data);
}

// Rate limiter for slide buttons (prevent double triggers)
const slideRateLimiter = createRateLimiter(2000);

const BRAND = '#FF6A13';
const { width: W } = Dimensions.get('window');
const SLIDER_W = W - 64;
const THUMB_SIZE = 56;

// Icône de l'étape « En route » selon le véhicule du livreur (valeurs backend).
const VEHICLE_ICON = { bicycle: 'bicycle', car: 'car', walk: 'walk' };

// Steps: pickup → enroute → arrived → code → done
const STEPS = ['pickup', 'enroute', 'arrived', 'code', 'done'];
const STEP_LABEL_KEYS = {
  pickup: 'pickup',
  enroute: 'enRoute',
  arrived: 'arrived',
  code: 'deliveryCode',
  done: 'deliveryDone',
};

function SlideButton({ label, onComplete, color: couleur = BRAND, disabled = false }) {
  const { ss } = useSS();
  const color = disabled ? '#bdbdbd' : couleur;
  const pan = useRef(new Animated.Value(0)).current;
  // Glissière verrouillée (preuve de retrait manquante) : geste ignoré.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  // Action relue à chaque rendu : le geste, créé une seule fois, appelait la
  // première version (photo du ticket encore absente) et ne faisait rien.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // En arabe, la piste est inversée par la mise en page, mais ni le geste ni
  // la translation : on les retourne pour glisser de droite à gauche.
  const translateX = useRef(isRTL ? Animated.multiply(pan, -1) : pan).current;
  const maxSlide = SLIDER_W - THUMB_SIZE;
  const completed = useRef(false);

  // Fade out label as thumb moves
  const labelOpacity = pan.interpolate({
    inputRange: [0, maxSlide * 0.5, maxSlide],
    outputRange: [1, 0.3, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderMove: (_, gs) => {
        if (completed.current || disabledRef.current) return;
        const x = Math.max(0, Math.min(isRTL ? -gs.dx : gs.dx, maxSlide));
        pan.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        if (completed.current || disabledRef.current) return;
        if ((isRTL ? -gs.dx : gs.dx) > maxSlide * 0.7) {
          completed.current = true;
          Animated.timing(pan, { toValue: maxSlide, duration: 150, useNativeDriver: false }).start(() => {
            onCompleteRef.current?.();
            setTimeout(() => { completed.current = false; pan.setValue(0); }, 300);
          });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[ss.sliderTrack, { backgroundColor: color + '20' }]}>
      {/* Label centered, offset to the right of thumb resting position */}
      <Animated.Text style={[ss.sliderLabel, { color, opacity: labelOpacity }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}  <Ionicons name={dirIcon('chevron-forward')} size={14} color={color} />
      </Animated.Text>
      {/* Thumb */}
      <Animated.View style={[ss.sliderThumb, { backgroundColor: color, transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <Ionicons name={dirIcon('arrow-forward')} size={24} color="#fff" />
      </Animated.View>
    </View>
  );
}

const WAIT_SECONDS = 7 * 60; // 7 minutes

const CALL_DEADLINE = 4 * 60; // 4 minutes — must call before this

function ArrivedStep({ address, orderId, debut, onCallDone, hasCalled, showCallPopup, setShowCallPopup, onMessage, onMessagePro, onOpenMap, onCall, depotPorte, onDepotPorte, depotBusy }) {
  const { t } = useLanguage();
  const { ss } = useSS();
  // Attente comptée depuis l'arrivée chez le client (`debut`, en ms) : le
  // minuteur reprend où il en était après un retour à l'accueil.
  const resteAttente = () => Math.max(0, WAIT_SECONDS - Math.floor((Date.now() - (debut || Date.now())) / 1000));
  const [remaining, setRemaining] = useState(resteAttente);
  const timerRef = useRef(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    setRemaining(resteAttente());
    timerRef.current = setInterval(() => {
      const r = resteAttente();
      setRemaining(r);
      if (r <= 0) clearInterval(timerRef.current);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [debut]);

  const elapsed = WAIT_SECONDS - remaining;

  // 4 min sans appel : rappel à l'écran seulement (aucun avertissement local,
  // les avertissements viennent du serveur).
  useEffect(() => {
    if (elapsed >= CALL_DEADLINE && !hasCalled && !warnedRef.current) {
      warnedRef.current = true;
      setShowCallPopup(true);
    }
  }, [elapsed, hasCalled]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
  const pct = remaining / WAIT_SECONDS;
  const timerColor = remaining > 120 ? BRAND : remaining > 60 ? '#f5a623' : '#e74c3c';

  function handleCall() {
    onCallDone?.();
    setShowCallPopup(false);
    // Vrai appel téléphonique (tel:) délégué au parent, plus de popup factice.
    onCall?.();
  }

  return (
    <View style={ss.stepContentCompact}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={[ss.smallIconWrap, { backgroundColor: '#fff3e0' }]}>
          <Ionicons name="location" size={24} color="#f5a623" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={ss.stepTitleCompact}>{t('youAreHere')}</Text>
          <Text style={ss.stepSubCompact}>{address}</Text>
        </View>
      </View>

      {/* Adresse client + itinéraire */}
      <View style={ss.arrivedAddrCard}>
        <View style={{ flex: 1 }}>
          <Text style={ss.arrivedAddrLabel}>{t('deliveryAddress')}</Text>
          <Text style={ss.arrivedAddrText}>{address}</Text>
        </View>
        <Pressable style={ss.arrivedMapBtn} onPress={() => onOpenMap?.(address)}>
          <Ionicons name="navigate" size={16} color="#fff" />
        </Pressable>
      </View>

      {/* Compact countdown */}
      <View style={[ss.countdownCard, { padding: 12 }]}>
        <Text style={[ss.countdownTime, { fontSize: 32, color: timerColor }]}>{timeStr}</Text>
        <View style={[ss.countdownBarBg, { marginTop: 6 }]}>
          <View style={[ss.countdownBarFill, { width: `${pct * 100}%`, backgroundColor: timerColor }]} />
        </View>
        <Text style={[ss.countdownHint, { color: timerColor, fontSize: 12 }]}>
          {remaining > 0 ? t('timeLeftMinSec', { m: mins, s: secs }) : t('timeUp')}
        </Text>
      </View>

      {hasCalled ? (
        <View style={[ss.tipsCard, { padding: 10, marginBottom: 8 }]}>
          <Ionicons name="checkmark-circle" size={16} color={BRAND} style={{ marginRight: 8 }} />
          <Text style={[ss.tipsText, { fontSize: 12 }]}>{t('calledClient')}</Text>
        </View>
      ) : (
        <View style={[ss.tipsCard, { padding: 10, marginBottom: 8 }]}>
          <Ionicons name="information-circle" size={16} color={BRAND} style={{ marginRight: 8 }} />
          <Text style={[ss.tipsText, { fontSize: 12 }]}>{t('giveOrderCode')}</Text>
        </View>
      )}

      <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={handleCall}>
        <Ionicons name="call-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
        <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('callTheClient') || 'Appeler le client'}</Text>
      </Pressable>

      <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={onMessage}>
        <Ionicons name="chatbubble-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
        <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('customerMessage')}</Text>
      </Pressable>

      {!!onMessagePro && (
        <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={onMessagePro}>
          <Ionicons name="storefront-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
          <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('writeToShop')}</Text>
        </Pressable>
      )}

      {/* Fin de l'attente, client absent : « J'ai déposé la commande », sac
          posé devant la porte, la photo valide la livraison sans code
          (jamais pour une commande avec alcool, cf. validate_depot_porte). */}
      {remaining === 0 && depotPorte && (
        <View style={ss.preuveCard}>
          <Text style={ss.preuveHint}>{t('bagDoorHint')}</Text>
          <Pressable style={[ss.preuveBtn, depotBusy && { opacity: 0.5 }]} onPress={onDepotPorte} disabled={depotBusy}>
            <Ionicons name="camera" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={ss.preuveBtnTxt}>{t('bagDoorBtn')}</Text>
          </Pressable>
        </View>
      )}

      {/* Call popup overlay */}
      {showCallPopup && !hasCalled && (
        <View style={ss.callPopup}>
          <View style={ss.callPopupCard}>
            <Ionicons name="call" size={32} color="#fff" />
            <Text style={ss.callPopupTitle}>{t('callClient')}</Text>
            <Text style={ss.callPopupSub}>{t('fourMinUp')}</Text>
            <Pressable style={ss.callPopupBtn} onPress={handleCall}>
              <Ionicons name="call" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={ss.callPopupBtnTxt}>{t('callNow')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function DeliveryFlowScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, cancelOrder, applyCancelResult, weeklyCancels, maxWeeklyCancels, MAX_WEEKLY_CANCELS, currentEarningsCents, markOrderReported, refreshAll, setActiveDelivery } = useAuth();
  const { fmtPrice } = useCurrency();
  const { ss, colors, dark } = useSS();
  // Gris d'icône : identique en clair, lisible en sombre.
  const gris = (v) => (dark ? colors.textMuted : v);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showCodeProblem, setShowCodeProblem] = useState(false);
  const [selectedCodeProblem, setSelectedCodeProblem] = useState(null);
  const [codeProblemDesc, setCodeProblemDesc] = useState('');
  const [codeTicketSending, setCodeTicketSending] = useState(false);

  // labelKey : libellé affiché dans la langue du livreur ; le ticket envoyé au
  // support garde le libellé français (langue de l'équipe administrative).
  const CODE_PROBLEMS = [
    { id: 'no_code', icon: 'key-outline', labelKey: 'codePbNoCode' },
    { id: 'wrong_code', icon: 'close-circle-outline', labelKey: 'codePbWrongCode' },
    { id: 'client_absent', icon: 'person-outline', labelKey: 'codePbAbsent' },
    { id: 'client_refuse', icon: 'hand-left-outline', labelKey: 'codePbRefuse' },
    { id: 'other', icon: 'chatbubble-outline', labelKey: 'otherProblem' },
  ];
  const [codeTimer, setCodeTimer] = useState(10 * 60); // 10 minutes
  const codeTimerRef = useRef(null);
  const order = route.params?.order || {};
  const initialStep = route.params?.initialStep || 0;
  // ID de l'assignment backend (pour updateDeliveryStatus / cancelDelivery)
  // Course simulée : aucun appel au serveur, chaque étape passe aussitôt.
  const assignmentId = order._isMock ? null : (order._assignmentId || order.id || null);
  // Avancement gardé sur le téléphone (étape, statut serveur, minuteurs).
  const cle = cleCourse(order);
  const [etapeGardee] = useState(() => lireEtape(cle));
  // Dernier statut serveur connu : le plus avancé entre celui gardé, celui de
  // la course et celui de l'étape d'ouverture.
  const statutRef = useRef(null);
  if (statutRef.current === null) {
    const rang = (st) => CHAINE_STATUTS.indexOf(st);
    statutRef.current = [etapeGardee?.statut, order.status, STATUT_DE_ETAPE[initialStep] || 'accepted']
      .filter((st) => rang(st) >= 0)
      .reduce((a, b) => (rang(b) > rang(a) ? b : a), 'accepted');
  }
  const avanceEnCours = useRef(false);
  const envoiCode = useRef(false);
  // Arrivée chez le client : heure du serveur, sinon celle notée sur le téléphone.
  const [debutAttente, setDebutAttente] = useState(() => {
    const serveur = order.arrivedAt ? Date.parse(order.arrivedAt) : NaN;
    return Number.isFinite(serveur) ? serveur : (etapeGardee?.arriveeLe || null);
  });
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [code, setCode] = useState(['', '', '', '']);
  const codeRefs = [useRef(), useRef(), useRef(), useRef()];
  const [hasCalled, setHasCalled] = useState(false);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sentQuicks, setSentQuicks] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatListRef = useRef(null);
  // Fil affiché dans la fenêtre de chat : 'client' ou 'pro' (boutique de la commande).
  const [filChat, setFilChat] = useState('client');
  const filChatRef = useRef('client');
  // Accès boutique montré seulement si le serveur connaît un fil boutique pour la course.
  const [proChatDispo, setProChatDispo] = useState(false);
  const [chatError, setChatError] = useState('');

  // Relit le fil demandé. Les messages encore en cours d'envoi sont gardés.
  const loadChat = useCallback(async (fil, { scroll = false } = {}) => {
    if (!assignmentId) return;
    try {
      const res = fil === 'pro'
        ? await deliveryService.getProMessages(assignmentId)
        : await deliveryService.getClientMessages(assignmentId);
      if (filChatRef.current !== fil) return;
      const msgs = Array.isArray(res?.data) ? res.data : [];
      const serveur = msgs.map(m => ({
        id: m.id,
        text: m.text,
        from: m.sender_type === 'driver' || m.sender_type === 'user' ? 'me' : 'client',
        time: m.created_at ? new Date(m.created_at) : new Date(),
      }));
      setChatMessages(prev => [...serveur, ...prev.filter(x => x.pending)]);
      if (scroll) setTimeout(() => chatListRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (_) {
      // Keep current messages on error
    }
  }, [assignmentId]);

  const openChat = useCallback(async (fil) => {
    const cible = fil === 'pro' ? 'pro' : 'client';
    filChatRef.current = cible;
    setFilChat(cible);
    setChatError('');
    setChatMessages([]);
    setShowChat(true);
    if (!assignmentId) return;
    setChatLoading(true);
    try {
      await loadChat(cible, { scroll: true });
    } finally {
      setChatLoading(false);
    }
  }, [assignmentId, loadChat]);

  // Envoi d'un message sur le fil ouvert. Sur le fil boutique, un échec retire
  // le message et affiche une erreur ; sur le fil client, comportement inchangé.
  const sendChatMessage = useCallback(async (text) => {
    const fil = filChatRef.current;
    const localId = `local-${Date.now()}`;
    setChatError('');
    setChatMessages(prev => [...prev, { id: localId, text, from: 'me', time: new Date(), pending: true }]);
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    if (!assignmentId) return;
    try {
      if (fil === 'pro') await deliveryService.sendProMessage(assignmentId, text);
      else await deliveryService.sendClientMessage(assignmentId, text);
      setChatMessages(prev => prev.map(x => (x.id === localId ? { ...x, pending: false } : x)));
    } catch (_) {
      if (fil === 'pro') {
        setChatMessages(prev => prev.filter(x => x.id !== localId));
        if (filChatRef.current === 'pro') setChatError(t('shopMessageError'));
      }
    }
  }, [assignmentId, t]);
  const QUICK_MSGS = [
    t('quickMsgOnMyWay'),
    t('quickMsgAtDoor'),
    t('quickMsgDownstairs'),
    t('quickMsgComeDown'),
    t('quickMsgDoorCode'),
    t('quickMsgCantFind'),
  ];
  const [showMapSheet, setShowMapSheet] = useState(false);
  const [mapSheetDest, setMapSheetDest] = useState('');
  const [mapSheetUrls, setMapSheetUrls] = useState({ google: '', waze: '', apple: '' });
  const sheetPan = useRef(new Animated.Value(0)).current;
  // Remise en l'absence du client (lieu sûr / voisin).
  const [absentOpen, setAbsentOpen] = useState(false);
  const [absentNote, setAbsentNote] = useState('');
  const [absentBusy, setAbsentBusy] = useState(false);
  // Preuve de retrait : photo du ticket ou du reçu, exigée avant « Commande récupérée ».
  const [ticketPhoto, setTicketPhoto] = useState(null);
  const [preuveManquante, setPreuveManquante] = useState(false);
  const [ticketEnvoi, setTicketEnvoi] = useState(null); // 'envoi' | 'envoyee' | 'en_attente' | 'refusee'
  const [depotBusy, setDepotBusy] = useState(false);
  const step = STEPS[stepIndex];

  const restaurant = order.restaurant || order.merchantName || t('restaurant');
  const address = order.dropoffAddress || order.address || t('deliveryAddress');
  // Gain du livreur calculé par le serveur (gain_net), affiché tel quel ;
  // repli sur le montant existant pour un ancien serveur.
  const price = order.gainNet != null
    ? fmtPrice(order.gainNet)
    : (order.priceEur != null ? fmtPrice(order.priceEur) : (order.priceText || order.price || '-'));
  const distance = order.distanceText || '-';
  const orderId = order.orderNumber || order.id || order.code || t('order');
  // Plafond d'annulations réel du serveur ; 5 seulement en repli.
  const plafondAnnulations = maxWeeklyCancels ?? MAX_WEEKLY_CANCELS;

  // Fil boutique : absent (404) pour une course sans commande marchand.
  useEffect(() => {
    if (!assignmentId) { setProChatDispo(false); return undefined; }
    let actif = true;
    deliveryService.getProMessages(assignmentId)
      .then(() => { if (actif) setProChatDispo(true); })
      .catch(() => { if (actif) setProChatDispo(false); });
    return () => { actif = false; };
  }, [assignmentId]);

  // Fenêtre de chat ouverte : relecture du fil toutes les 10 s pour voir les réponses.
  useEffect(() => {
    if (!showChat || !assignmentId) return undefined;
    const id = setInterval(() => { loadChat(filChat); }, 10000);
    return () => clearInterval(id);
  }, [showChat, filChat, assignmentId, loadChat]);
  // ETA de l'étape en cours, toujours celle du serveur : dernière réponse de
  // position connue, sinon la course reçue à l'acceptation. Relue à chaque
  // envoi de position (surEtas) et à chaque changement de statut (nextStep).
  const [etapeEta, setEtapeEta] = useState(() => (
    etapeEtaServeur(etasConnues(order._assignmentId))
    || (order.etapeEtaMinutes != null || order.etapeEtaAt
      ? { minutes: order.etapeEtaMinutes ?? null, at: order.etapeEtaAt || null }
      : null)
  ));
  useEffect(() => {
    if (!order._assignmentId) return undefined;
    return surEtas((etas) => {
      const suivante = etapeEtaServeur(etas[String(order._assignmentId)]);
      if (suivante) setEtapeEta(suivante);
    });
  }, [order._assignmentId]);
  const eta = (() => {
    if (etapeEta && (etapeEta.minutes != null || etapeEta.at)) {
      const heure = etapeEta.at ? formatTime(etapeEta.at) : '';
      if (etapeEta.minutes == null) return heure;
      const minutes = formatMinutes(Math.max(0, Math.round(etapeEta.minutes)));
      return heure ? `${minutes} · ${heure}` : minutes;
    }
    return order.etaText || '-';
  })();
  // Heure à laquelle la commande sera prête en boutique (serveur).
  const readyTime = order.readyAt ? formatTime(order.readyAt) : '';
  // Livraison en cours tant que cet écran est monté → force le tracking GPS
  // même si le livreur passe hors-ligne, pour que le client garde la position
  // live. Remis à false à la fermeture de l'écran.
  useEffect(() => {
    setActiveDelivery?.(true);
    return () => setActiveDelivery?.(false);
  }, [setActiveDelivery]);
  // Code de remise : renseigné pour une commande PRO (affiché + validé en local,
  // comportement historique inchangé) ; VIDE pour une commande courses (le client
  // le donne de vive voix, le backend valide). Le livreur ne voit donc jamais le
  // code d'une course.
  const REAL_CODE = String(order.delivery_code || '');
  // Options de remise posées par le commerçant (backend handling_options.py).
  const isFragile = !!(order.is_fragile || order.isFragile);
  const hasAlcohol = !!(order.has_alcohol || order.hasAlcohol);
  const absentPolicy = String(order.absent_policy || order.absentPolicy || 'return');
  // Remise sans code possible seulement si le commerçant l'a prévue ET qu'il
  // n'y a pas d'alcool (contrôle d'âge impossible sans destinataire).
  const canDeliverWhenAbsent =
    !hasAlcohol && (absentPolicy === 'safe_place' || absentPolicy === 'neighbor');
  // Téléphone client pour un vrai appel (tel:).
  const clientPhone = String(
    order.customerPhone || (order.user_address && order.user_address.phone_number) || ''
  ).replace(/[^0-9+]/g, '');
  const callClient = useCallback(() => {
    if (clientPhone) {
      Linking.openURL(`tel:${clientPhone}`).catch(() => {});
    } else {
      Alert.alert(t('callTheClient'), t('clientPhoneUnavailable'));
    }
  }, [clientPhone, t]);

  // Arrivée chez le client notée une seule fois (minuteur d'attente).
  useEffect(() => {
    if (step === 'arrived' && !debutAttente) {
      const maintenant = Date.now();
      setDebutAttente(maintenant);
      enregistrerEtape(cle, { arriveeLe: maintenant });
    }
  }, [step, debutAttente, cle]);

  // Code step timer (10 min), compté depuis la première ouverture de l'étape.
  useEffect(() => {
    if (step !== 'code') {
      if (codeTimerRef.current) clearInterval(codeTimerRef.current);
      return undefined;
    }
    let debut = lireEtape(cle)?.codeLe;
    if (!debut) {
      debut = Date.now();
      enregistrerEtape(cle, { codeLe: debut });
    }
    const reste = () => Math.max(0, CODE_SECONDS - Math.floor((Date.now() - debut) / 1000));
    setCodeTimer(reste());
    codeTimerRef.current = setInterval(() => {
      const r = reste();
      setCodeTimer(r);
      if (r <= 0) clearInterval(codeTimerRef.current);
    }, 1000);
    return () => clearInterval(codeTimerRef.current);
  }, [step, cle]);

  // Passe à l'étape suivante une fois le serveur à jour. Les statuts sont
  // envoyés un par un depuis le dernier statut connu. Statut refusé parce que
  // le serveur en est ailleurs : on se recale sur lui. Autre échec : l'étape
  // ne change pas et le livreur réessaie.
  const nextStep = useCallback(async () => {
    if (stepIndex >= STEPS.length - 1 || avanceEnCours.current) return;
    const cible = STATUT_CIBLE[STEPS[stepIndex]];
    if (assignmentId && cible) {
      avanceEnCours.current = true;
      try {
        let essais = 0;
        while (CHAINE_STATUTS.indexOf(statutRef.current) < CHAINE_STATUTS.indexOf(cible) && essais < 8) {
          essais += 1;
          const suivant = CHAINE_STATUTS[CHAINE_STATUTS.indexOf(statutRef.current) + 1];
          try {
            const res = await deliveryService.updateDeliveryStatus(assignmentId, suivant);
            // La réponse porte l'ETA de la nouvelle étape (ex. vers le client
            // une fois la commande récupérée).
            const suivante = etapeEtaReponse(res);
            if (suivante) setEtapeEta(suivante);
            statutRef.current = suivant;
            enregistrerEtape(cle, { statut: suivant });
          } catch (e) {
            const dejaLa = /from '(\w+)'/.exec(String(e?.serverMessage || ''));
            if (dejaLa && CHAINE_STATUTS.includes(dejaLa[1]) && dejaLa[1] !== statutRef.current) {
              statutRef.current = dejaLa[1];
              enregistrerEtape(cle, { statut: dejaLa[1] });
              continue;
            }
            Alert.alert(t('error'), e?.isNetworkError ? t('errorNetwork') : t('statusUpdateError'));
            return;
          }
        }
        if (CHAINE_STATUTS.indexOf(statutRef.current) < CHAINE_STATUTS.indexOf(cible)) {
          Alert.alert(t('error'), t('statusUpdateError'));
          return;
        }
      } finally {
        avanceEnCours.current = false;
      }
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex, assignmentId, cle, t]);

  // Étape atteinte gardée sur le téléphone (reprise depuis l'accueil).
  useEffect(() => {
    enregistrerEtape(cle, { step: stepIndex });
    navigation.setParams({ currentStep: stepIndex, currentStepLabel: t(STEP_LABEL_KEYS[STEPS[stepIndex]]) });
  }, [stepIndex]);

  const openMap = useCallback((dest) => {
    const lat = order.dropoffLat;
    const lng = order.dropoffLng;
    const addr = encodeURIComponent(dest);
    const googleUrl = lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${addr}`;
    const wazeUrl = lat && lng
      ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : `https://waze.com/ul?q=${addr}&navigate=yes`;

    setMapSheetDest(dest);
    const appleUrl = lienApplePlansVers(lat && lng ? `${lat},${lng}` : addr);

    setMapSheetUrls({ google: googleUrl, waze: wazeUrl, apple: appleUrl });
    sheetPan.setValue(0);
    setShowMapSheet(true);
  }, [order.dropoffLat, order.dropoffLng, sheetPan]);

  // Carte d'itinéraire IN-APP (marqueurs boutique + client, tracé, nav externe).
  const openRouteMap = useCallback(() => {
    // Avant le retrait, la navigation externe vise la boutique.
    navigation.navigate('RouteMap', { order, recupere: stepIndex >= 1 });
  }, [navigation, order, stepIndex]);

  const closeMapSheet = useCallback(() => {
    Animated.timing(sheetPan, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowMapSheet(false);
    });
  }, [sheetPan]);

  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) sheetPan.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) closeMapSheet();
        else Animated.spring(sheetPan, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const handleCodeInput = useCallback((text, index) => {
    // Validate: only accept single digits
    const digit = text.replace(/[^0-9]/g, '').slice(0, 1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    if (digit && index < 3) {
      codeRefs[index + 1].current?.focus();
    }
    // Envoi seulement quand les 4 chiffres sont saisis, une fois à la fois.
    if (newCode.every(Boolean) && !envoiCode.current) {
      const entered = newCode.join('');
      const recommencer = () => {
        setCode(['', '', '', '']);
        codeRefs[0].current?.focus();
      };
      // Code connu de l'app (course d'essai) : vérifié sur place d'abord.
      if (REAL_CODE && entered !== REAL_CODE) {
        Alert.alert(t('wrongCode'), t('wrongCodeMsg'));
        recommencer();
        return;
      }
      if (!assignmentId) { setTimeout(nextStep, 300); return; }
      // Le serveur fait autorité : la course n'est terminée que s'il accepte.
      envoiCode.current = true;
      deliveryService.updateDeliveryStatus(assignmentId, 'delivered', entered)
        .then(() => { setTimeout(nextStep, 300); })
        .catch((e) => {
          const msg = String(e?.serverMessage || '');
          if (e?.isNetworkError) Alert.alert(t('error'), t('errorNetwork'));
          else if (e?.status === 429) Alert.alert(t('error'), t('codeTooManyAttempts'));
          else if (e?.status === 400 && /invalid delivery code|4 digits/i.test(msg)) Alert.alert(t('wrongCode'), t('wrongCodeMsg'));
          else Alert.alert(t('error'), t('statusUpdateError'));
          recommencer();
        })
        .finally(() => { envoiCode.current = false; });
    }
  }, [code, nextStep, t, assignmentId, REAL_CODE]);

  // Clôture SANS code parce que le client est absent. Le backend revalide la
  // consigne du commerçant : un refus (400) laisse la course ouverte.
  const confirmAbsentDelivery = useCallback(() => {
    if (!assignmentId || absentBusy) return;
    const note = sanitizeInput(absentNote).trim();
    if (absentPolicy === 'neighbor' && !note) {
      Alert.alert(t('absentNeighborNameRequired'));
      return;
    }
    setAbsentBusy(true);
    deliveryService
      .updateDeliveryStatus(assignmentId, 'delivered', null, {
        outcome: absentPolicy,
        note,
      })
      .then(() => {
        setAbsentBusy(false);
        setAbsentOpen(false);
        setTimeout(nextStep, 300);
      })
      .catch(() => {
        setAbsentBusy(false);
        Alert.alert(t('absentRefusedTitle'), t('absentRefusedMsg'));
      });
  }, [assignmentId, absentBusy, absentNote, absentPolicy, nextStep, t]);

  // Ouvre la caméra (repli galerie dans prendrePhoto). Renvoie l'URI, null
  // si annulé, 'indisponible' si aucune photo n'a pu être obtenue.
  // Un seul appui compte : le bouton montre aussitôt que la caméra s'ouvre,
  // un 2e appui pendant l'ouverture est ignoré.
  const [cameraOuverture, setCameraOuverture] = useState(false);
  const cameraOccupee = useRef(false);
  const ouvrirCamera = useCallback(async () => {
    if (cameraOccupee.current) return null;
    cameraOccupee.current = true;
    setCameraOuverture(true);
    try {
      const res = await prendrePhoto();
      if (res && res.indisponible) return 'indisponible';
      return typeof res === 'string' ? res : null;
    } catch {
      return 'indisponible';
    } finally {
      cameraOccupee.current = false;
      setCameraOuverture(false);
    }
  }, []);

  // Accès caméra préparé dès l'étape de retrait (et l'arrivée chez le client),
  // pour que la caméra s'ouvre sans attente au moment de la photo.
  useEffect(() => {
    if (step === 'pickup' || step === 'arrived') preparerCamera().catch(() => {});
  }, [step]);

  // Preuves gardées sur le téléphone lors d'une course précédente : renvoi.
  useEffect(() => {
    if (!order._isMock) renvoyerPreuvesEnAttente().catch(() => {});
  }, [order._isMock]);

  // Photo du ticket au retrait. Débloque aussitôt la glissière ; l'envoi part
  // en arrière-plan (course d'essai : aucun envoi).
  const photographierTicket = useCallback(async () => {
    const uri = await ouvrirCamera();
    if (!uri) return;
    // Aucune photo possible : le livreur n'est jamais bloqué.
    if (uri === 'indisponible') { setPreuveManquante(true); return; }
    setTicketPhoto(uri);
    if (!assignmentId) { setTicketEnvoi(null); return; }
    setTicketEnvoi('envoi');
    const etat = await envoyerPreuve(assignmentId, 'pickup', uri);
    setTicketEnvoi(etat);
  }, [ouvrirCamera, assignmentId]);

  // Fin de l'attente, client absent : sac posé devant la porte, photo, puis
  // remise sans code (dépôt en lieu sûr, revalidé par le serveur).
  const depotDevantPorte = useCallback(async () => {
    if (depotBusy) return;
    const uri = await ouvrirCamera();
    if (!uri) return;
    // Aucune photo possible : le chemin par code reste.
    if (uri === 'indisponible') { Alert.alert(t('bagDoorFailedTitle'), t('bagDoorRefused')); return; }
    const fin = () => setStepIndex(STEPS.indexOf('done'));
    if (!assignmentId) { fin(); return; }
    setDepotBusy(true);
    // La photo VALIDE la livraison : elle doit être reçue par le serveur
    // avant la clôture (sinon le livreur réessaie ou passe par le code).
    const etat = await envoyerPreuve(assignmentId, 'safe_place', uri, { garder: false });
    if (etat !== 'envoyee') {
      setDepotBusy(false);
      Alert.alert(t('bagDoorFailedTitle'), t('bagDoorPhotoFailed'));
      return;
    }
    try {
      await deliveryService.updateDeliveryStatus(assignmentId, 'delivered', null, null, true);
      setDepotBusy(false);
      fin();
    } catch {
      setDepotBusy(false);
      Alert.alert(t('bagDoorFailedTitle'), t('bagDoorRefused'));
    }
  }, [depotBusy, ouvrirCamera, assignmentId, t]);

  // Fin de course : retour à l'accueil, la course passe dans l'historique.
  const terminer = useCallback(() => {
    navigation.navigate('OrdersMain', { completedOrder: { ...order, status: 'completed', completedAt: new Date().toISOString() } });
  }, [navigation, order]);

  // Progress indicator (memoized)
  const progress = useMemo(() => stepIndex / (STEPS.length - 1), [stepIndex]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? colors.bg : '#f5f5f5' }} edges={['top']}>
      {/* Header */}
      <View style={ss.header}>
        {step === 'done' ? (
          <Pressable onPress={terminer}>
            <Ionicons name="close" size={24} color={dark ? colors.text : '#111'} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={ss.headerTitle} numberOfLines={1}>{t(STEP_LABEL_KEYS[step])}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress bar - 3 segments, masqué quand terminé */}
      {step !== 'done' && (
        <View style={ss.progressRow}>
          {['pickup', 'enroute', 'arrived'].map((seg, i) => {
            const segActive = seg === 'pickup' ? stepIndex >= 0
              : seg === 'enroute' ? stepIndex >= 1
              : stepIndex >= 2;
            return <View key={seg} style={[ss.progressSegment, segActive ? ss.progressSegmentActive : ss.progressSegmentInactive, i < 2 && { marginRight: 4 }]} />;
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} style={{ flex: 1 }} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Options de remise posées par le commerçant : visibles à chaque étape,
            pour que le livreur sache AVANT le retrait comment manipuler le colis. */}
        {step !== 'done' && (isFragile || hasAlcohol || absentPolicy !== 'return') && (
          <View style={[ss.handlingRow, { paddingHorizontal: 16, marginTop: 10 }]}>
            {isFragile && (
              <View style={ss.handlingChip}>
                <MaterialCommunityIcons name="package-variant" size={14} color="#e67e22" />
                <Text style={ss.handlingChipText}>{t('fragileBadge')}</Text>
              </View>
            )}
            {hasAlcohol && (
              <View style={ss.handlingChip}>
                <MaterialCommunityIcons name="glass-wine" size={14} color="#8e44ad" />
                <Text style={ss.handlingChipText}>{t('alcoholBadge')}</Text>
              </View>
            )}
            {absentPolicy !== 'return' && (
              <View style={ss.handlingChip}>
                <Ionicons name="home-outline" size={14} color={BRAND} />
                <Text style={ss.handlingChipText}>
                  {absentPolicy === 'neighbor' ? t('absentNeighborBadge') : t('absentSafePlaceBadge')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Step: Pickup */}
        {step === 'pickup' && (
          <View style={ss.stepContentCompact}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              {order.shopImage ? (
                <Image source={{ uri: order.shopImage }} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: dark ? colors.border : '#f0f0f0' }} />
              ) : (
                <View style={ss.smallIconWrap}>
                  <MaterialCommunityIcons name="storefront-outline" size={24} color={BRAND} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={ss.stepTitleCompact}>{restaurant}</Text>
                <Text style={ss.stepSubCompact}>{t('pickupOrder')}</Text>
              </View>
            </View>

            {/* Adresses + Articles */}
            <View style={ss.routeCard}>
              <View style={ss.routeRow}>
                <View style={ss.routeDotGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={ss.routeLabel}>{t('pickup')}</Text>
                  {/* Vraie adresse de la boutique (pas juste le nom) */}
                  <Text style={ss.routeAddr}>{order.pickupAddress || restaurant}</Text>
                </View>
              </View>

              {/* Articles à récupérer */}
              {Array.isArray(order.items) && order.items.length > 0 && (
                <View style={ss.itemsBlock}>
                  <View style={ss.itemsHeader}>
                    <Ionicons name="bag-outline" size={14} color={BRAND} />
                    <Text style={ss.itemsTitle}>{(() => { const n = order.items.reduce((s, it) => s + (Number(it?.qty) || 1), 0); return `${n} ${t(n > 1 ? 'articles' : 'article')}`; })()}</Text>
                  </View>
                  {order.items.map((item, idx) => (
                    <View key={idx} style={ss.itemRow}>
                      <Text style={ss.itemQty}>{item?.qty || 1}x</Text>
                      <Text style={ss.itemName}>{item?.name || ''}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={ss.routeLineVert} />
              <View style={ss.routeRow}>
                <View style={ss.routeDotRed} />
                <View style={{ flex: 1 }}>
                  <Text style={ss.routeLabel}>{t('delivery')}</Text>
                  <Text style={ss.routeAddr}>{address}</Text>
                </View>
              </View>
            </View>

            {/* Info badges inline */}
            <View style={ss.badgesRow}>
              <View style={ss.infoBadge}>
                <Ionicons name="receipt-outline" size={14} color={gris('#666')} />
                <Text style={ss.infoBadgeText}>{orderId}</Text>
              </View>
              <View style={ss.infoBadge}>
                <Ionicons name="navigate-outline" size={14} color={gris('#666')} />
                <Text style={ss.infoBadgeText}>{distance}</Text>
              </View>
              <View style={ss.infoBadge}>
                <Ionicons name="time-outline" size={14} color={gris('#666')} />
                <Text style={ss.infoBadgeText}>{eta}</Text>
              </View>
              {!!readyTime && (
                <View style={ss.infoBadge}>
                  <Ionicons name="alarm-outline" size={14} color={gris('#666')} />
                  <Text style={ss.infoBadgeText}>{t('readyAtTime', { time: readyTime })}</Text>
                </View>
              )}
              <View style={[ss.infoBadge, { backgroundColor: BRAND }]}>
                <Ionicons name="cash-outline" size={14} color="#fff" />
                <Text style={[ss.infoBadgeText, { color: '#fff' }]}>{price}</Text>
              </View>
            </View>

            <Pressable style={ss.mapBtnCompact} onPress={openRouteMap}>
              <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={ss.mapBtnTxt}>{t('itinerary')}</Text>
            </Pressable>

            {/* Preuve de retrait : photo du ticket ou du reçu (QR compris). */}
            {ticketPhoto ? (
              <View style={[ss.preuveCard, ss.preuveCardOk]}>
                {/* Miniature réduite à sa taille d'affichage : l'écran ne fige pas sur une photo de 12 à 48 Mpx. */}
                <ImageReduite source={{ uri: ticketPhoto }} style={ss.preuveThumb} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle" size={16} color={BRAND} style={{ marginRight: 6 }} />
                    <Text style={ss.preuveOkTitle}>{t('ticketPhotoDone')}</Text>
                  </View>
                  {!!ticketEnvoi && (
                    <Text style={ss.preuveEtat}>
                      {ticketEnvoi === 'envoyee' ? t('proofSent') : ticketEnvoi === 'envoi' ? t('proofSending') : ticketEnvoi === 'refusee' ? t('proofRefused') : t('proofQueued')}
                    </Text>
                  )}
                  <Pressable onPress={photographierTicket} hitSlop={8}>
                    <Text style={ss.preuveRetake}>{t('ticketPhotoRetake')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={ss.preuveCard}>
                <Text style={ss.preuveHint}>{t('ticketPhotoHint')}</Text>
                <Pressable style={ss.preuveBtn} onPress={photographierTicket} disabled={cameraOuverture}>
                  {cameraOuverture
                    ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                    : <Ionicons name="camera" size={18} color="#fff" style={{ marginRight: 8 }} />}
                  <Text style={ss.preuveBtnTxt}>{t('ticketPhotoBtn')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Step: En route */}
        {step === 'enroute' && (
          <View style={ss.stepContentCompact}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={[ss.smallIconWrap, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name={VEHICLE_ICON[user?.vehicle] || 'bicycle'} size={24} color="#2196F3" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={ss.stepTitleCompact}>{t('enRoute')}</Text>
                <Text style={ss.stepSubCompact}>{address}</Text>
              </View>
            </View>

            {/* Route info */}
            <View style={ss.enrouteCard}>
              <View style={ss.enrouteRow}>
                <View style={ss.enrouteDotGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={ss.enrouteLabel}>{t('pickup')}</Text>
                  <Text style={ss.enrouteAddr}>{restaurant}</Text>
                  <View style={ss.enrouteAddrCopyRow}>
                    <Text style={ss.enrouteAddrBold} selectable>{order.pickupAddress || order.shopName || restaurant}</Text>
                  </View>
                </View>
                <Ionicons name="checkmark-circle" size={18} color={BRAND} />
              </View>
              <View style={ss.enrouteLine} />
              <View style={ss.enrouteRow}>
                <View style={ss.enrouteDotBlue} />
                <View style={{ flex: 1 }}>
                  <Text style={ss.enrouteLabel}>{t('delivery')}</Text>
                  <Text style={ss.enrouteAddr}>{address}</Text>
                </View>
                <Ionicons name="ellipse-outline" size={18} color={dark ? colors.chevron : '#ccc'} />
              </View>
            </View>

            <View style={ss.badgesRow}>
              <View style={ss.infoBadge}>
                <Ionicons name="time-outline" size={16} color={gris('#666')} />
                <Text style={ss.infoBadgeText}>{eta}</Text>
              </View>
              <View style={ss.infoBadge}>
                <Ionicons name="navigate-outline" size={16} color={gris('#666')} />
                <Text style={ss.infoBadgeText}>{distance}</Text>
              </View>
              <View style={[ss.infoBadge, { backgroundColor: BRAND + '15' }]}>
                <Ionicons name="cash-outline" size={16} color={BRAND} />
                <Text style={[ss.infoBadgeText, { color: BRAND, fontWeight: '800' }]}>{price}</Text>
              </View>
            </View>

            {/* Order details */}
            <View style={ss.enrouteDetailCard}>
              <View style={ss.enrouteDetailRow}>
                <Ionicons name="receipt-outline" size={14} color={gris('#888')} />
                <Text style={ss.enrouteDetailLabel}>{t('order')}</Text>
                <Text style={ss.enrouteDetailValue}>{orderId}</Text>
              </View>
              {order.itemsCount > 0 && (
                <View style={ss.enrouteDetailRow}>
                  <Ionicons name="cube-outline" size={14} color={gris('#888')} />
                  <Text style={ss.enrouteDetailLabel}>{t('itemsLabel')}</Text>
                  <Text style={ss.enrouteDetailValue}>{order.itemsCount}</Text>
                </View>
              )}
              {!!order.category && (
                <View style={ss.enrouteDetailRow}>
                  <Ionicons name="pricetag-outline" size={14} color={gris('#888')} />
                  <Text style={ss.enrouteDetailLabel}>{t('categoryLabel')}</Text>
                  <Text style={ss.enrouteDetailValue}>{order.category}</Text>
                </View>
              )}
            </View>

            <Pressable style={ss.mapBtnCompact} onPress={openRouteMap}>
              <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={ss.mapBtnTxt}>{t('clientItinerary')}</Text>
            </Pressable>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={callClient}>
              <Ionicons name="call-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('callTheClient')}</Text>
            </Pressable>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={openChat}>
              <Ionicons name="chatbubble-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('customerMessage')}</Text>
            </Pressable>

            {proChatDispo && (
              <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={() => openChat('pro')}>
                <Ionicons name="storefront-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
                <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('writeToShop')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Step: Arrived */}
        {step === 'arrived' && (
          <ArrivedStep
            address={address}
            orderId={orderId}
            debut={debutAttente}
            hasCalled={hasCalled}
            onCallDone={() => setHasCalled(true)}
           
            showCallPopup={showCallPopup}
            setShowCallPopup={setShowCallPopup}
            onMessage={openChat}
            onMessagePro={proChatDispo ? () => openChat('pro') : undefined}
            onOpenMap={openMap}
            onCall={callClient}
            depotPorte={!hasAlcohol}
            onDepotPorte={depotDevantPorte}
            depotBusy={depotBusy}
          />
        )}

        {/* Step: Code */}
        {step === 'code' && (
          <View style={ss.stepContentCompact}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={[ss.smallIconWrap, { backgroundColor: BRAND + '20' }]}>
                <Ionicons name="keypad" size={24} color={BRAND} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={ss.stepTitleCompact}>{t('deliveryCode')}</Text>
                <Text style={ss.stepSubCompact}>{t('askCode')}</Text>
              </View>
            </View>

            <View style={ss.codeRow}>
              {[0, 1, 2, 3].map(i => (
                <TextInput
                  key={i}
                  ref={codeRefs[i]}
                  style={[ss.codeInput, code[i] ? ss.codeInputFilled : null]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={code[i]}
                  onChangeText={val => handleCodeInput(val, i)}
                  autoFocus={i === 0}
                />
              ))}
            </View>

            {/* PRO : le code est affiché au livreur (comportement historique).
                COURSES : REAL_CODE = '' (non exposé) → rien ne s'affiche, le
                client donne le code et le backend le valide. */}
            {!!REAL_CODE && <Text style={ss.codeHint}>{t('deliveryCode')} : {REAL_CODE}</Text>}

            {/* Décompte 10 min */}
            <View style={ss.codeTimerWrap}>
              <Ionicons name="time-outline" size={16} color={codeTimer > 60 ? gris('#888') : '#e74c3c'} style={{ marginRight: 6 }} />
              <Text style={[ss.codeTimerText, codeTimer <= 60 && { color: '#e74c3c' }]}>
                {Math.floor(codeTimer / 60)}:{String(codeTimer % 60).padStart(2, '0')}
              </Text>
            </View>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={callClient}>
              <Ionicons name="call-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('callTheClient') || 'Appeler le client'}</Text>
            </Pressable>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={openChat}>
              <Ionicons name="chatbubble-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('customerMessage')}</Text>
            </Pressable>

            {proChatDispo && (
              <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={() => openChat('pro')}>
                <Ionicons name="storefront-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
                <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('writeToShop')}</Text>
              </Pressable>
            )}

            {/* Client absent : proposé UNIQUEMENT si le commerçant l'a prévu.
                Sinon le colis repart, comme avant (aucune sortie sans code). */}
            {canDeliverWhenAbsent && (
              <Pressable
                style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]}
                onPress={() => { setAbsentNote(''); setAbsentOpen(true); }}
              >
                <Ionicons name="home-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
                <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('absentHandover')}</Text>
              </Pressable>
            )}

          </View>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <View style={ss.stepContentCompact}>
            <View style={[ss.smallIconWrap, { backgroundColor: BRAND + '20', width: 56, height: 56, borderRadius: 28, marginBottom: 8 }]}>
              <Ionicons name="checkmark-circle" size={36} color={BRAND} />
            </View>
            <Text style={[ss.doneTitle, { fontSize: 22 }]}>{t('deliveryComplete')}</Text>
            <Text style={[ss.doneSub, { marginBottom: 12 }]}>{orderId} {t('deliverySuccessMsg')}</Text>

            {/* Gain de la course */}
            <View style={[ss.earningsBanner, { marginBottom: 12 }]}>
              {order._isMock ? (
                <Text style={ss.earningsBannerSub}>{t('testRunNoGain')}</Text>
              ) : (
                <>
                  <Text style={ss.earningsBannerLabel}>+ {price}</Text>
                  <Text style={ss.earningsBannerSub}>{t('addedToBalance')}</Text>
                </>
              )}
            </View>

            <View style={[ss.summaryCard, { padding: 12, marginBottom: 12 }]}>
              <Text style={[ss.summaryHeader, { fontSize: 14, marginBottom: 6 }]}>{t('summary')}</Text>
              <View style={ss.summaryRow}>
                <Text style={ss.summaryLabel}>{t('restaurant')}</Text>
                <Text style={ss.summaryValue}>{restaurant}</Text>
              </View>
              <View style={ss.summaryRow}>
                <Text style={ss.summaryLabel}>{t('delivery')}</Text>
                <Text style={ss.summaryValue} numberOfLines={1}>{address}</Text>
              </View>
              <View style={ss.summaryRow}>
                <Text style={ss.summaryLabel}>{t('distance')}</Text>
                <Text style={ss.summaryValue}>{distance}</Text>
              </View>
              {!order._isMock && (
                <View style={[ss.summaryRow, { borderBottomWidth: 0 }]}>
                  <Text style={[ss.summaryLabel, { fontWeight: '800' }]}>{t('gain')}</Text>
                  <Text style={[ss.summaryValue, { color: BRAND, fontWeight: '900', fontSize: 18 }]}>{price}</Text>
                </View>
              )}
            </View>

            <Pressable style={ss.doneBtn} onPress={terminer}>
              <Text style={ss.doneBtnTxt}>{t('backToHome')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom - code step */}
      {step === 'code' && codeTimer <= 540 && (
        <View style={ss.bottomBar}>
          <Pressable style={[ss.codeProblemBtn, codeTimer === 0 && { borderColor: '#e74c3c', backgroundColor: '#fde8e8' }]} onPress={() => {
            if (codeTimer > 0) {
              Alert.alert(
                `⚠️ ${t('attention')}`,
                t('codeProblemEarlyMsg'),
                [
                  { text: t('waitAction'), style: 'cancel' },
                  { text: t('continueAction'), style: 'destructive', onPress: () => {
                    setSelectedCodeProblem(null);
                    setCodeProblemDesc('');
                    setShowCodeProblem(true);
                  }},
                ]
              );
            } else {
              setSelectedCodeProblem(null);
              setCodeProblemDesc('');
              setShowCodeProblem(true);
            }
          }}>
            <Ionicons name="warning-outline" size={16} color={codeTimer === 0 ? '#e74c3c' : '#f5a623'} style={{ marginRight: 8 }} />
            <Text style={[ss.codeProblemBtnTxt, codeTimer === 0 && { color: '#e74c3c' }]}>
              {codeTimer === 0 ? t('openTicketDelivery') : t('iHaveProblem')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Fixed bottom slide button + cancel */}
      {(step === 'pickup' || step === 'enroute' || step === 'arrived') && (
        <View style={ss.bottomBar}>
          {step === 'pickup' && !ticketPhoto && !preuveManquante && <Text style={ss.preuveLock}>{t('ticketPhotoRequired')}</Text>}
          {step === 'pickup' && <SlideButton label={t('orderPickedUp')} disabled={!ticketPhoto && !preuveManquante} onComplete={() => { if (ticketPhoto || preuveManquante) slideRateLimiter(nextStep); }} />}
          {step === 'enroute' && <SlideButton label={t('iArrived')} onComplete={() => slideRateLimiter(nextStep)} color="#2196F3" />}
          {step === 'arrived' && <SlideButton label={t('orderGiven')} onComplete={() => slideRateLimiter(nextStep)} color="#f5a623" />}
          <Pressable style={ss.cancelBtn} onPress={() => setShowCancelPopup(true)}>
            <Text style={ss.cancelBtnTxt}>{t('cancelOrder')}</Text>
          </Pressable>
        </View>
      )}

      {/* Cancel popup overlay */}
      {showCancelPopup && (
        <View style={ss.cancelOverlay}>
          <View style={ss.cancelCard}>
            <Ionicons name="warning" size={36} color="#e74c3c" />
            <Text style={ss.cancelTitle}>{t('cancelDeliveryTitle')}</Text>
            <Text style={ss.cancelSub}>
              {weeklyCancels < plafondAnnulations
                ? t('cancelsLeftBeforeWarning', { n: plafondAnnulations - weeklyCancels })
                : t('cancelsExceeded')}
            </Text>
            {weeklyCancels >= plafondAnnulations && (
              <View style={ss.cancelWarningBadge}>
                <Ionicons name="alert-circle" size={16} color="#e74c3c" style={{ marginRight: 6 }} />
                <Text style={ss.cancelWarningText}>{t('warningWillBeAdded')}</Text>
              </View>
            )}
            <Pressable style={ss.cancelConfirmBtn} onPress={async () => {
              setShowCancelPopup(false);
              // Course simulée : annulation sans avertissement ni compteur.
              if (order._isMock) {
                navigation.navigate('OrdersMain', { cancelledOrder: { ...order, status: 'cancelled' } });
                return;
              }
              // Le BACKEND fait autorité sur la règle d'annulation (reste,
              // avertissement). Repli local seulement si le réseau est coupé ;
              // un refus du serveur affiche son message et la course continue.
              let remaining = null;
              let warned = false;
              if (assignmentId) {
                try {
                  const resp = await deliveryService.cancelDelivery(assignmentId);
                  applyCancelResult?.(resp);
                  if (typeof resp?.remaining === 'number') remaining = resp.remaining;
                  warned = !!resp?.warning_issued;
                } catch (e) {
                  if (!e?.isNetworkError) {
                    Alert.alert(t('error'), e?.serverMessage || t('genericError'));
                    return;
                  }
                }
              }
              if (remaining === null) { const r = cancelOrder(); remaining = r.remaining; warned = r.warning; }
              try { await refreshAll?.(); } catch {}
              const cancelledOrder = { ...order, status: 'cancelled', priceText: `${formatAmount(0)} €`, priceEur: 0, cancelledAt: new Date().toISOString() };
              if (warned) {
                Alert.alert(t('warning'), t('warningAdded'), [
                  { text: t('ok'), onPress: () => navigation.navigate('OrdersMain', { cancelledOrder }) },
                ]);
              } else {
                Alert.alert(t('orderCancelled'), t('cancelsLeftThisWeek', { n: remaining }), [
                  { text: t('ok'), onPress: () => navigation.navigate('OrdersMain', { cancelledOrder }) },
                ]);
              }
            }}>
              <Text style={ss.cancelConfirmBtnTxt}>{t('confirmCancel')}</Text>
            </Pressable>
            <Pressable style={ss.cancelKeepBtn} onPress={() => setShowCancelPopup(false)}>
              <Text style={ss.cancelKeepBtnTxt}>{t('keepOrder')}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {/* Bottom sheet itinéraire */}
      {showMapSheet && (
        <Pressable style={ss.sheetOverlay} onPress={closeMapSheet}>
          <Animated.View
            style={[ss.sheetContainer, { transform: [{ translateY: sheetPan }] }]}
            {...sheetPanResponder.panHandlers}
          >
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={ss.sheetHandle} />
              <Text style={ss.sheetTitle}>{t('openRoute')}</Text>
              <Text style={ss.sheetAddr} numberOfLines={2}>{mapSheetDest}</Text>

              <View style={ss.sheetGroup}>
                {Platform.OS === 'ios' && (
                  <>
                    <Pressable style={ss.sheetOption} onPress={() => { closeMapSheet(); setTimeout(() => Linking.openURL(mapSheetUrls.apple).catch(() => {}), 250); }}>
                      <View style={[ss.sheetIconWrap, { backgroundColor: '#e8f0fe' }]}>
                        <Ionicons name="compass" size={20} color="#007AFF" />
                      </View>
                      <Text style={ss.sheetOptionText}>{t('navAppleMaps')}</Text>
                      <Ionicons name={dirIcon('chevron-forward')} size={18} color={dark ? colors.chevron : '#c7c7cc'} />
                    </Pressable>
                    <View style={ss.sheetSep} />
                  </>
                )}
                <Pressable style={ss.sheetOption} onPress={() => { closeMapSheet(); setTimeout(() => Linking.openURL(mapSheetUrls.google).catch(() => {}), 250); }}>
                  <View style={[ss.sheetIconWrap, { backgroundColor: '#e8f5e9' }]}>
                    <Ionicons name="map" size={20} color="#34a853" />
                  </View>
                  <Text style={ss.sheetOptionText}>Google Maps</Text>
                  <Ionicons name={dirIcon('chevron-forward')} size={18} color={dark ? colors.chevron : '#c7c7cc'} />
                </Pressable>

                <View style={ss.sheetSep} />

                <Pressable style={ss.sheetOption} onPress={() => { closeMapSheet(); setTimeout(() => Linking.openURL(mapSheetUrls.waze).catch(() => {}), 250); }}>
                  <View style={[ss.sheetIconWrap, { backgroundColor: '#e3f2fd' }]}>
                    <Ionicons name="navigate" size={20} color="#2196F3" />
                  </View>
                  <Text style={ss.sheetOptionText}>Waze</Text>
                  <Ionicons name={dirIcon('chevron-forward')} size={18} color={dark ? colors.chevron : '#c7c7cc'} />
                </Pressable>
              </View>

              <Pressable style={ss.sheetCancelBtn} onPress={closeMapSheet}>
                <Text style={ss.sheetCancelTxt}>{t('cancel')}</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      {/* Problème code modal */}
      <Modal visible={showCodeProblem} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCodeProblem(false)}>
        <View style={{ flex: 1, backgroundColor: dark ? colors.bg : '#f5f5f5' }}>
          <View style={ss.chatHeader}>
            <Pressable onPress={() => setShowCodeProblem(false)}>
              <Ionicons name="close" size={28} color={dark ? colors.text : '#111'} />
            </Pressable>
            <Text style={ss.chatHeaderTitle} numberOfLines={1}>{t('reportProblem')}</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, color: gris('#888'), fontWeight: '600', marginBottom: 12 }}>{t('order')} {orderId}</Text>

            {CODE_PROBLEMS.map(p => (
              <Pressable
                key={p.id}
                style={[ss.codeProblemRow, selectedCodeProblem === p.id && ss.codeProblemRowActive]}
                onPress={() => setSelectedCodeProblem(p.id)}
              >
                <Ionicons name={p.icon} size={18} color={selectedCodeProblem === p.id ? BRAND : gris('#666')} />
                <Text style={[ss.codeProblemRowText, selectedCodeProblem === p.id && { color: BRAND, fontWeight: '800' }]}>{t(p.labelKey)}</Text>
                {selectedCodeProblem === p.id && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
              </Pressable>
            ))}

            {selectedCodeProblem && (
              <TextInput
                style={ss.codeProblemInput}
                placeholder={t('descriptionOptional')}
                placeholderTextColor={dark ? colors.textFaint : '#aaa'}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={codeProblemDesc}
                onChangeText={(text) => setCodeProblemDesc(sanitizeInput(text))}
              />
            )}
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
            <Pressable
              style={[ss.codeTicketBtn, (!selectedCodeProblem || codeTicketSending) && { opacity: 0.4 }]}
              disabled={!selectedCodeProblem || codeTicketSending}
              onPress={async () => {
                const problem = CODE_PROBLEMS.find(p => p.id === selectedCodeProblem);
                // Mappe le type de problème de code → PROBLEM_CHOICES backend.
                const PROBLEM_MAP = { client_absent: 'client_absent', no_code: 'autre', wrong_code: 'autre', client_refuse: 'autre', other: 'autre' };
                const problem_type = PROBLEM_MAP[selectedCodeProblem] || 'autre';
                const description = `${(problem && translations.fr[problem.labelKey]) || translations.fr.otherProblem}${codeProblemDesc.trim() ? `\n${codeProblemDesc.trim()}` : ''}`;
                // VRAI ticket support côté backend (au lieu d'une conversation simulée).
                // Échec : la fenêtre reste ouverte (le bouton sert à réessayer)
                // et la course n'est PAS marquée « signalée », sinon le
                // livreur croit le support prévenu alors qu'il ne l'est pas.
                setCodeTicketSending(true);
                try {
                  await ticketService.createTicket({ problem_type, description, assignment_id: assignmentId });
                } catch {
                  setCodeTicketSending(false);
                  Alert.alert(t('error'), t('ticketCreateError'));
                  return;
                }
                setCodeTicketSending(false);
                markOrderReported(order.id);
                setShowCodeProblem(false);
                const problemOrder = { ...order, status: 'completed', completedAt: new Date().toISOString(), reported: true };
                navigation.navigate('OrdersMain', { completedOrder: problemOrder });
              }}
            >
              <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={ss.codeTicketBtnTxt}>{t('sendAndClose')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Chat client modal */}
      <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChat(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: dark ? colors.bg : '#f5f5f5' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={ss.chatHeader}>
            <Pressable onPress={() => setShowChat(false)}>
              <Ionicons name="close" size={28} color={dark ? colors.text : '#111'} />
            </Pressable>
            <Text style={ss.chatHeaderTitle} numberOfLines={1}>{filChat === 'pro' ? t('chatShopTitle') : t('messageToCustomer')}</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Info commande */}
          <View style={ss.chatInfoBar}>
            <View style={{ flex: 1 }}>
              <Text style={ss.chatInfoLabel}>{t('pickup')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Ionicons name="storefront-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
                <Text style={ss.chatInfoText} numberOfLines={1}>{restaurant}</Text>
              </View>
            </View>
            <View style={{ width: 1, height: 30, backgroundColor: dark ? colors.borderStrong : '#e0e0e0', marginHorizontal: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={ss.chatInfoLabel}>{t('delivery')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Ionicons name="location-outline" size={14} color="#e74c3c" style={{ marginRight: 6 }} />
                <Text style={ss.chatInfoText} numberOfLines={1}>{address}</Text>
              </View>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'flex-end', width: '100%' }}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            renderItem={({ item }) => (
              <View style={[ss.chatBubble, item.from === 'me' ? ss.chatBubbleMe : ss.chatBubbleClient]}>
                <Text style={[ss.chatBubbleText, item.from === 'me' && { color: '#fff' }]}>{item.text}</Text>
                <Text style={[ss.chatBubbleTime, item.from === 'me' && { color: 'rgba(255,255,255,0.7)' }]}>
                  {formatTime(item.time)}
                </Text>
              </View>
            )}
          />

          {/* Input + quick chips */}
          {filChat === 'client' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.quickChipsRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}>
            {[...QUICK_MSGS.filter(m => !sentQuicks.includes(m)), ...sentQuicks].map((msg, i) => {
              const isSent = sentQuicks.includes(msg);
              return (
                <Pressable key={i} style={[ss.quickChipSmall, isSent && ss.quickChipSent]} onPress={async () => {
                  if (isSent) return;
                  setSentQuicks(prev => [...prev, msg]);
                  await sendChatMessage(msg);
                }} disabled={isSent}>
                  <Text style={[ss.quickChipSmallText, isSent && ss.quickChipSentText]}>{msg}</Text>
                  {isSent && <Ionicons name="checkmark" size={14} color={dark ? colors.textFaint : '#999'} style={{ marginLeft: 4 }} />}
                </Pressable>
              );
            })}
          </ScrollView>
          )}
          {!!chatError && (
            <Text style={{ color: '#e74c3c', fontSize: 13, fontWeight: '600', backgroundColor: dark ? colors.card : '#fff', paddingHorizontal: 16, paddingTop: 8 }}>{chatError}</Text>
          )}
          <View style={[ss.chatInputRow, { paddingBottom: insets.bottom || 16 }]}>
            <TextInput
              style={ss.chatInputField}
              placeholder={t('writeMessage')}
              placeholderTextColor={colors.textFaint}
              value={chatInput}
              onChangeText={setChatInput}
            />
            <Pressable style={[ss.chatSendBtn, !chatInput.trim() && { opacity: 0.4 }]} onPress={async () => {
              if (!chatInput.trim()) return;
              const sanitized = sanitizeInput(chatInput);
              if (!sanitized) return;
              setChatInput('');
              await sendChatMessage(sanitized);
            }}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Client absent : consigne du commerçant + preuve écrite. */}
      <Modal visible={absentOpen} animationType="slide" transparent onRequestClose={() => { if (!absentBusy) setAbsentOpen(false); }}>
        <View style={ss.absentBackdrop}>
          <View style={ss.absentCard}>
            <Text style={ss.absentTitle}>{t('absentHandover')}</Text>
            <Text style={ss.absentHint}>
              {absentPolicy === 'neighbor' ? t('absentNeighborHint') : t('absentSafePlaceHint')}
            </Text>

            <TextInput
              style={ss.absentInput}
              value={absentNote}
              onChangeText={setAbsentNote}
              placeholder={absentPolicy === 'neighbor'
                ? t('absentNeighborPlaceholder')
                : t('absentSafePlacePlaceholder')}
              placeholderTextColor={dark ? colors.textFaint : '#999'}
              maxLength={255}
              multiline
            />

            <Pressable
              style={[ss.absentBtn, absentBusy && { opacity: 0.5 }]}
              onPress={confirmAbsentDelivery}
              disabled={absentBusy}
            >
              <Text style={ss.absentBtnTxt}>{t('absentConfirm')}</Text>
            </Pressable>
            <Pressable style={ss.absentCancel} onPress={() => setAbsentOpen(false)}>
              <Text style={ss.absentCancelTxt}>{t('keepOrder')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Styles selon le thème : en clair, valeurs d'origine strictement identiques ;
// en sombre, fonds, textes et bordures suivent `colors`. Un jeu de styles par
// palette, mis en cache (aucune recréation à chaque rendu).
const cacheSS = new WeakMap();
function useSS() {
  const { colors, dark } = useTheme();
  let st = cacheSS.get(colors);
  if (!st) { st = makeSS(colors, dark); cacheSS.set(colors, st); }
  return { ss: st, colors, dark };
}

function makeSS(c, dark) {
  const d = (sombre, clair) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: d(c.bg, '#f5f5f5') }, /* unused kept for reference */
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 18, fontWeight: '800', color: d(c.text, '#111') },
  progressRow: { flexDirection: 'row', marginHorizontal: 16 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressSegmentActive: { backgroundColor: BRAND },
  progressSegmentInactive: { backgroundColor: d(c.borderStrong, '#e0e0e0') },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 30, backgroundColor: d(c.bg, '#f5f5f5'), flexShrink: 0 },
  // Call popup
  callPopup: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  callPopupCard: { backgroundColor: '#e74c3c', borderRadius: 20, padding: 28, alignItems: 'center', marginHorizontal: 32, width: W - 64 },
  callPopupTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 12 },
  callPopupSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  callPopupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%' },
  callPopupBtnTxt: { color: '#e74c3c', fontWeight: '800', fontSize: 16, flexShrink: 1, textAlign: 'center' },

  // Cancel button & popup
  cancelBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  cancelBtnTxt: { color: '#e74c3c', fontSize: 13, fontWeight: '700' },
  cancelOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  cancelCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 20, padding: 28, alignItems: 'center', marginHorizontal: 24, width: W - 48 },
  cancelTitle: { fontSize: 20, fontWeight: '900', color: d(c.text, '#111'), marginTop: 12 },
  cancelSub: { fontSize: 13, color: d(c.textMuted, '#666'), textAlign: 'center', marginTop: 8, lineHeight: 19 },
  cancelWarningBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fde8e8', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, marginTop: 12 },
  cancelWarningText: { fontSize: 13, fontWeight: '700', color: '#e74c3c', flexShrink: 1 },
  cancelConfirmBtn: { backgroundColor: '#e74c3c', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 16 },
  cancelConfirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelKeepBtn: { paddingVertical: 12, width: '100%', alignItems: 'center', marginTop: 4 },
  cancelKeepBtnTxt: { color: BRAND, fontWeight: '700', fontSize: 15 },

  stepContent: { padding: 24, alignItems: 'center' },
  bigIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stepTitle: { fontSize: 24, fontWeight: '900', color: d(c.text, '#111'), textAlign: 'center', marginBottom: 6 },
  stepSub: { fontSize: 15, color: d(c.textMuted, '#666'), textAlign: 'center', marginBottom: 20 },

  infoCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 16, padding: 16, width: '100%', marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: d(c.border, '#f0f0f0') },
  infoLabel: { flex: 1, fontSize: 14, color: d(c.textMuted, '#888'), marginLeft: 10 },
  infoValue: { fontSize: 15, fontWeight: '700', color: d(c.text, '#111') },

  mapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, width: '100%', marginBottom: 10 },
  mapBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16, flexShrink: 1, textAlign: 'center' },

  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: d(c.card, '#fff'), borderRadius: 14, paddingVertical: 14, width: '100%', borderWidth: 1, borderColor: BRAND, marginBottom: 10 },
  callBtnTxt: { color: BRAND, fontWeight: '700', fontSize: 15, flexShrink: 1, textAlign: 'center' },

  tipsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND + '10', borderRadius: 14, padding: 16, width: '100%', marginBottom: 16 },
  tipsText: { flex: 1, fontSize: 14, color: d(c.textSoft, '#333'), lineHeight: 20 },

  // Countdown (arrived)
  countdownCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 16, padding: 20, width: '100%', marginBottom: 16, alignItems: 'center' },
  countdownCircle: { alignItems: 'center', marginBottom: 12 },
  countdownTime: { fontSize: 42, fontWeight: '900', letterSpacing: 2 },
  countdownLabel: { fontSize: 13, color: d(c.textMuted, '#888'), fontWeight: '600', marginTop: 2 },
  countdownBarBg: { width: '100%', height: 6, backgroundColor: d(c.border, '#f0f0f0'), borderRadius: 3, overflow: 'hidden' },
  countdownBarFill: { height: 6, borderRadius: 3 },
  countdownHint: { fontSize: 13, fontWeight: '700', marginTop: 8 },

  // Route card (pickup)
  routeCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 16, padding: 16, width: '100%', marginBottom: 16 },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  routeDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND, marginRight: 12 },
  routeDotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e74c3c', marginRight: 12 },
  routeLineVert: { width: 2, height: 20, backgroundColor: d(c.borderStrong, '#e0e0e0'), marginLeft: 5, marginVertical: 4 },
  itemsBlock: { marginLeft: 16, marginVertical: 8, backgroundColor: d(c.bg, '#f8f9fa'), borderRadius: 10, padding: 10 },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  itemsTitle: { fontSize: 13, fontWeight: '800', color: BRAND },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  itemQty: { fontSize: 13, fontWeight: '800', color: d(c.text, '#111'), width: 28 },
  itemName: { fontSize: 13, color: d(c.textSoft, '#444'), flex: 1 },
  routeLabel: { fontSize: 12, color: d(c.textMuted, '#888'), fontWeight: '600' },
  routeAddr: { fontSize: 15, fontWeight: '700', color: d(c.text, '#111'), marginTop: 2 },

  // Slider
  sliderTrack: { width: SLIDER_W, height: THUMB_SIZE + 12, borderRadius: (THUMB_SIZE + 12) / 2, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  sliderLabel: { fontSize: 15, fontWeight: '700', marginLeft: THUMB_SIZE, maxWidth: SLIDER_W - THUMB_SIZE - 24 },
  sliderThumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },

  // Code
  codeRow: { flexDirection: 'row', gap: 16, marginVertical: 24 },
  codeInput: { width: 56, height: 64, borderRadius: 14, borderWidth: 2, borderColor: d(c.inputBorder, '#e0e0e0'), textAlign: 'center', fontSize: 28, fontWeight: '900', backgroundColor: d(c.input, '#fff') },
  codeInputFilled: { borderColor: BRAND },
  codeHint: { fontSize: 13, color: d(c.textFaint, '#999'), marginBottom: 20 },

  // Compact layout
  stepContentCompact: { padding: 16, alignItems: 'center' },
  smallIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND + '15', alignItems: 'center', justifyContent: 'center' },
  stepTitleCompact: { fontSize: 18, fontWeight: '900', color: d(c.text, '#111') },
  stepSubCompact: { fontSize: 13, color: d(c.textMuted, '#888'), marginTop: 2 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginBottom: 10 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: d(c.card, '#fff'), borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, gap: 4, maxWidth: '100%' },
  infoBadgeText: { fontSize: 12, fontWeight: '700', color: d(c.textSoft, '#333'), flexShrink: 1 },
  mapBtnCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingVertical: 12, width: '100%', marginBottom: 10 },

  // Done
  doneTitle: { fontSize: 28, fontWeight: '900', color: BRAND, textAlign: 'center', marginBottom: 8 },
  doneSub: { fontSize: 15, color: d(c.textMuted, '#666'), textAlign: 'center', marginBottom: 24 },
  summaryCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 16, padding: 16, width: '100%', marginBottom: 24 },
  summaryHeader: { fontSize: 16, fontWeight: '800', color: d(c.text, '#111'), marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: d(c.border, '#f0f0f0') },
  summaryLabel: { fontSize: 14, color: d(c.textMuted, '#888'), flexShrink: 1, marginRight: 12 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: d(c.text, '#111'), maxWidth: '60%', textAlign: 'right' },
  enrouteAddrCopyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  enrouteAddrBold: { fontSize: 14, fontWeight: '800', color: d(c.text, '#111'), flexShrink: 1 },

  // Bottom sheet itinéraire — style Apple
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end', zIndex: 100 },
  sheetContainer: { backgroundColor: d(c.bg, '#f2f2f7'), borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 10, paddingBottom: 40, paddingTop: 8 },
  sheetHandle: { width: 36, height: 5, borderRadius: 3, backgroundColor: d(c.chevron, '#c7c7cc'), alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 13, fontWeight: '600', color: d(c.textMuted, '#8e8e93'), textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, paddingHorizontal: 10 },
  sheetAddr: { fontSize: 13, color: d(c.textMuted, '#8e8e93'), textAlign: 'center', marginBottom: 14, paddingHorizontal: 10 },
  sheetGroup: { backgroundColor: d(c.card, '#fff'), borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  sheetSep: { height: 0.5, backgroundColor: d(c.borderStrong, '#c7c7cc'), marginLeft: 66 },
  sheetIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sheetOptionText: { flex: 1, fontSize: 17, fontWeight: '400', color: d(c.text, '#000'), letterSpacing: -0.4 },
  sheetCancelBtn: { backgroundColor: d(c.card, '#fff'), borderRadius: 14, alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  sheetCancelTxt: { fontSize: 17, fontWeight: '600', color: '#007aff' },
  enrouteCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 14, padding: 14, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: d(c.border, '#f0f0f0') },
  enrouteRow: { flexDirection: 'row', alignItems: 'center' },
  enrouteDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND, marginRight: 12 },
  enrouteDotBlue: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2196F3', marginRight: 12 },
  enrouteLine: { width: 2, height: 16, backgroundColor: d(c.borderStrong, '#e0e0e0'), marginLeft: 5, marginVertical: 3 },
  enrouteLabel: { fontSize: 11, color: d(c.textFaint, '#999'), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  enrouteAddr: { fontSize: 14, fontWeight: '700', color: d(c.text, '#111'), marginTop: 2 },
  enrouteDetailCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 14, padding: 12, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: d(c.border, '#f0f0f0') },
  enrouteDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: d(c.border, '#f8f8f8') },
  enrouteDetailLabel: { flex: 1, fontSize: 14, color: d(c.textMuted, '#666') },
  enrouteDetailValue: { fontSize: 14, fontWeight: '800', color: d(c.text, '#111'), flexShrink: 1, maxWidth: '60%', textAlign: 'right' },
  earningsBanner: { backgroundColor: BRAND + '15', borderRadius: 14, paddingVertical: 14, alignItems: 'center', width: '100%' },
  earningsBannerLabel: { fontSize: 28, fontWeight: '900', color: BRAND },
  earningsBannerSub: { fontSize: 13, color: d(c.textMuted, '#666'), fontWeight: '600', marginTop: 2 },
  doneBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center' },
  doneBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  codeTimerWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: d(c.card, '#fff'), borderRadius: 12, padding: 12, marginBottom: 12, width: '100%' },
  codeTimerText: { fontSize: 20, fontWeight: '900', color: d(c.text, '#111') },
  codeProblemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff3e0', borderRadius: 14, paddingVertical: 14, width: '100%', marginBottom: 8, borderWidth: 1, borderColor: '#f5a623' },
  codeProblemBtnTxt: { color: '#f5a623', fontWeight: '800', fontSize: 14, flexShrink: 1, textAlign: 'center' },
  codeProblemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: d(c.card, '#fff'), borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8, gap: 12, borderWidth: 1.5, borderColor: 'transparent' },
  codeProblemRowActive: { borderColor: BRAND, backgroundColor: BRAND + '10' },
  codeProblemRowText: { flex: 1, fontSize: 15, color: d(c.textSoft, '#333'), fontWeight: '600' },
  codeProblemInput: { backgroundColor: d(c.input, '#fff'), borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, borderWidth: 1, borderColor: d(c.inputBorder, '#e0e0e0'), marginTop: 12, color: d(c.text, '#111') },
  codeTicketBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', borderRadius: 14, paddingVertical: 14, width: '100%', marginTop: 4 },
  codeTicketBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14, flexShrink: 1, textAlign: 'center' },
  arrivedAddrCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: d(c.card, '#fff'), borderRadius: 14, padding: 14, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: d(c.border, '#f0f0f0') },
  arrivedAddrLabel: { fontSize: 11, color: d(c.textFaint, '#999'), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  arrivedAddrText: { fontSize: 15, fontWeight: '800', color: d(c.text, '#111'), marginTop: 4 },
  arrivedMapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },

  // Chat client
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: d(c.border, '#f0f0f0'), backgroundColor: d(c.card, '#fff') },
  chatHeaderTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 17, fontWeight: '800', color: d(c.text, '#111') },
  chatInfoBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: d(c.card, '#fff'), paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: d(c.border, '#f0f0f0') },
  chatInfoLabel: { fontSize: 10, color: d(c.textFaint, '#999'), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chatInfoText: { fontSize: 13, color: d(c.text, '#111'), fontWeight: '700', flexShrink: 1 },
  quickWrap: { padding: 16 },
  quickTitle: { fontSize: 15, fontWeight: '800', color: d(c.text, '#111'), marginBottom: 12 },
  quickChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: d(c.card, '#fff'), borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: d(c.border, '#f0f0f0') },
  quickChipText: { fontSize: 15, fontWeight: '600', color: d(c.text, '#111') },
  quickChipsRow: { backgroundColor: d(c.card, '#fff'), paddingTop: 8, paddingBottom: 8, flexGrow: 0 },
  quickChipSmall: { backgroundColor: BRAND + '15', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  quickChipSmallText: { fontSize: 13, fontWeight: '700', color: BRAND },
  quickChipSent: { backgroundColor: d(c.border, '#f0f0f0'), opacity: 0.7, flexDirection: 'row', alignItems: 'center' },
  quickChipSentText: { color: d(c.textFaint, '#999') },
  chatBubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 10 },
  chatBubbleMe: { backgroundColor: BRAND, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleClient: { backgroundColor: d(c.card, '#fff'), alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: 15, color: d(c.text, '#111'), lineHeight: 20 },
  chatBubbleTime: { fontSize: 11, color: d(c.textFaint, '#999'), marginTop: 4, alignSelf: 'flex-end' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: d(c.card, '#fff') },
  chatInputField: { flex: 1, backgroundColor: d(c.input, '#f5f5f5'), borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, marginRight: 10, ...(dark ? { color: c.text } : {}) },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  // Options de remise (fragile / alcool / consigne d'absence)
  handlingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  handlingChip: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: d(c.card, '#fff'), borderWidth: 1, borderColor: d(c.border, '#f0f0f0') },
  handlingChipText: { fontSize: 12, fontWeight: '700', color: d(c.text, '#111'), marginLeft: 5, flexShrink: 1 },
  absentBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  absentCard: { backgroundColor: d(c.card, '#fff'), borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  absentTitle: { fontSize: 18, fontWeight: '800', color: d(c.text, '#111'), marginBottom: 6 },
  absentHint: { fontSize: 13, color: d(c.textMuted, '#666'), lineHeight: 18, marginBottom: 14 },
  absentInput: { backgroundColor: d(c.input, '#f5f5f5'), borderRadius: 12, padding: 14, fontSize: 15, color: d(c.text, '#111'), minHeight: 80, textAlignVertical: 'top', marginBottom: 14 },
  // Preuve photo (ticket au retrait, sac devant la porte)
  preuveCard: { backgroundColor: d(c.card, '#fff'), borderRadius: 14, padding: 12, marginTop: 10, borderWidth: 1, borderColor: BRAND + '40' },
  preuveCardOk: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND + '10', borderColor: BRAND + '30' },
  preuveHint: { fontSize: 13, color: d(c.textSoft, '#333'), lineHeight: 18, marginBottom: 10 },
  preuveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 12 },
  preuveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink: 1, textAlign: 'center' },
  preuveThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: d(c.border, '#f0f0f0') },
  preuveOkTitle: { fontSize: 14, fontWeight: '700', color: d(c.text, '#111'), flexShrink: 1 },
  preuveEtat: { fontSize: 12, color: d(c.textMuted, '#666'), marginTop: 2 },
  preuveRetake: { fontSize: 13, fontWeight: '700', color: BRAND, marginTop: 4 },
  preuveLock: { fontSize: 13, color: d(c.textMuted, '#666'), textAlign: 'center', marginBottom: 8 },
  absentBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  absentBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  absentCancel: { paddingVertical: 14, alignItems: 'center' },
  absentCancelTxt: { color: d(c.textMuted, '#666'), fontSize: 15, fontWeight: '600' },
});
}
