import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, Dimensions, Linking, Alert, TextInput, ScrollView, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { sanitizeInput, createRateLimiter } from '../utils/validation';

// Rate limiter for slide buttons (prevent double triggers)
const slideRateLimiter = createRateLimiter(2000);

const BRAND = '#00C29B';
const { width: W } = Dimensions.get('window');
const SLIDER_W = W - 64;
const THUMB_SIZE = 56;

// Steps: pickup → enroute → arrived → code → done
const STEPS = ['pickup', 'enroute', 'arrived', 'code', 'done'];
const STEP_LABEL_KEYS = {
  pickup: 'pickup',
  enroute: 'enRoute',
  arrived: 'arrived',
  code: 'deliveryCode',
  done: 'deliveryDone',
};

function SlideButton({ label, onComplete, color = BRAND }) {
  const pan = useRef(new Animated.Value(0)).current;
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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        if (completed.current) return;
        const x = Math.max(0, Math.min(gs.dx, maxSlide));
        pan.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        if (completed.current) return;
        if (gs.dx > maxSlide * 0.7) {
          completed.current = true;
          Animated.timing(pan, { toValue: maxSlide, duration: 150, useNativeDriver: false }).start(() => {
            onComplete?.();
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
      <Animated.Text style={[ss.sliderLabel, { color, opacity: labelOpacity }]}>
        {label}  <Ionicons name="chevron-forward" size={14} color={color} />
      </Animated.Text>
      {/* Thumb */}
      <Animated.View style={[ss.sliderThumb, { backgroundColor: color, transform: [{ translateX: pan }] }]} {...panResponder.panHandlers}>
        <Ionicons name="arrow-forward" size={24} color="#fff" />
      </Animated.View>
    </View>
  );
}

const WAIT_SECONDS = 7 * 60; // 7 minutes

const CALL_DEADLINE = 4 * 60; // 4 minutes — must call before this

function ArrivedStep({ address, orderId, onCallDone, hasCalled, onWarning, showCallPopup, setShowCallPopup, onMessage, onOpenMap }) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(WAIT_SECONDS);
  const timerRef = useRef(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const elapsed = WAIT_SECONDS - remaining;

  // At 4 min without call → show popup + warning
  useEffect(() => {
    if (elapsed >= CALL_DEADLINE && !hasCalled && !warnedRef.current) {
      warnedRef.current = true;
      setShowCallPopup(true);
      onWarning?.();
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
    Alert.alert(t('callInProgress'), t('callInProgressMsg'));
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
          <Text style={ss.arrivedAddrLabel}>Adresse de livraison</Text>
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
          {remaining > 0 ? `${mins} min ${secs}s restantes` : t('timeUp')}
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
        <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>Message client</Text>
      </Pressable>

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
  const { addWarning, cancelOrder, weeklyCancels, MAX_WEEKLY_CANCELS, currentEarningsCents, saveTicketMessages, markOrderReported } = useAuth();
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showCodeProblem, setShowCodeProblem] = useState(false);
  const [selectedCodeProblem, setSelectedCodeProblem] = useState(null);
  const [codeProblemDesc, setCodeProblemDesc] = useState('');

  const CODE_PROBLEMS = [
    { id: 'no_code', icon: 'key-outline', label: 'Le client ne donne pas le code' },
    { id: 'wrong_code', icon: 'close-circle-outline', label: 'Le code ne fonctionne pas' },
    { id: 'client_absent', icon: 'person-outline', label: 'Le client est absent' },
    { id: 'client_refuse', icon: 'hand-left-outline', label: 'Le client refuse la commande' },
    { id: 'other', icon: 'chatbubble-outline', label: 'Autre problème' },
  ];
  const [codeTimer, setCodeTimer] = useState(10 * 60); // 10 minutes
  const codeTimerRef = useRef(null);
  const order = route.params?.order || {};
  const initialStep = route.params?.initialStep || 0;
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [code, setCode] = useState(['', '', '', '']);
  const codeRefs = [useRef(), useRef(), useRef(), useRef()];
  const [hasCalled, setHasCalled] = useState(false);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sentQuicks, setSentQuicks] = useState([]);
  const chatListRef = useRef(null);
  const QUICK_MSGS = [
    "J'arrive bientôt",
    "Je suis devant la porte",
    "Je suis en bas de l'immeuble",
    "Pouvez-vous descendre ?",
    "Quel est le code d'entrée ?",
    "Je ne trouve pas l'adresse",
  ];
  const [showMapSheet, setShowMapSheet] = useState(false);
  const [mapSheetDest, setMapSheetDest] = useState('');
  const [mapSheetUrls, setMapSheetUrls] = useState({ google: '', waze: '' });
  const sheetPan = useRef(new Animated.Value(0)).current;
  const step = STEPS[stepIndex];

  const restaurant = order.restaurant || order.merchantName || 'Restaurant';
  const address = order.dropoffAddress || order.address || 'Adresse de livraison';
  const price = order.priceText || order.price || '—';
  const distance = order.distanceText || '—';
  const eta = order.etaText || '—';
  const orderId = order.id || order.code || 'Commande';

  const REAL_CODE = '4521';

  // Code step timer (10 min)
  useEffect(() => {
    if (step === 'code') {
      setCodeTimer(10 * 60);
      codeTimerRef.current = setInterval(() => {
        setCodeTimer(prev => {
          if (prev <= 1) { clearInterval(codeTimerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(codeTimerRef.current);
    } else {
      if (codeTimerRef.current) clearInterval(codeTimerRef.current);
    }
  }, [step]);

  const nextStep = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
    }
  }, [stepIndex]);

  // Sync step to OrdersScreen params whenever stepIndex changes (without navigating away)
  useEffect(() => {
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
    setMapSheetUrls({ google: googleUrl, waze: wazeUrl });
    sheetPan.setValue(0);
    setShowMapSheet(true);
  }, [order.dropoffLat, order.dropoffLng, sheetPan]);

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
    if (index === 3 && digit) {
      const entered = newCode.join('');
      if (entered === REAL_CODE) {
        setTimeout(nextStep, 300);
      } else {
        Alert.alert(t('wrongCode'), t('wrongCodeMsg'));
        setCode(['', '', '', '']);
        codeRefs[0].current?.focus();
      }
    }
  }, [code, nextStep, t]);

  // Progress indicator (memoized)
  const progress = useMemo(() => stepIndex / (STEPS.length - 1), [stepIndex]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }} edges={['top']}>
      {/* Header */}
      <View style={ss.header}>
        {step === 'done' ? (
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color="#111" />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={ss.headerTitle}>{t(STEP_LABEL_KEYS[step])}</Text>
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
        {/* Step: Pickup */}
        {step === 'pickup' && (
          <View style={ss.stepContentCompact}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={ss.smallIconWrap}>
                <MaterialCommunityIcons name="storefront-outline" size={24} color={BRAND} />
              </View>
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
                  <Text style={ss.routeAddr}>{restaurant}</Text>
                </View>
              </View>

              {/* Articles à récupérer */}
              {order.items && order.items.length > 0 && (
                <View style={ss.itemsBlock}>
                  <View style={ss.itemsHeader}>
                    <Ionicons name="bag-outline" size={14} color={BRAND} />
                    <Text style={ss.itemsTitle}>{order.items.reduce((s, it) => s + (it.qty || 1), 0)} article{order.items.reduce((s, it) => s + (it.qty || 1), 0) > 1 ? 's' : ''}</Text>
                  </View>
                  {order.items.map((item, idx) => (
                    <View key={idx} style={ss.itemRow}>
                      <Text style={ss.itemQty}>{item.qty || 1}x</Text>
                      <Text style={ss.itemName}>{item.name}</Text>
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
                <Ionicons name="receipt-outline" size={14} color="#666" />
                <Text style={ss.infoBadgeText}>{orderId}</Text>
              </View>
              <View style={ss.infoBadge}>
                <Ionicons name="navigate-outline" size={14} color="#666" />
                <Text style={ss.infoBadgeText}>{distance}</Text>
              </View>
              <View style={ss.infoBadge}>
                <Ionicons name="time-outline" size={14} color="#666" />
                <Text style={ss.infoBadgeText}>{eta}</Text>
              </View>
              <View style={[ss.infoBadge, { backgroundColor: BRAND }]}>
                <Ionicons name="cash-outline" size={14} color="#fff" />
                <Text style={[ss.infoBadgeText, { color: '#fff' }]}>{price}</Text>
              </View>
            </View>

            <Pressable style={ss.mapBtnCompact} onPress={() => openMap(restaurant)}>
              <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={ss.mapBtnTxt}>{t('itinerary')}</Text>
            </Pressable>
          </View>
        )}

        {/* Step: En route */}
        {step === 'enroute' && (
          <View style={ss.stepContentCompact}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={[ss.smallIconWrap, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="bicycle" size={24} color="#2196F3" />
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
                  <Text style={ss.enrouteLabel}>Récupération</Text>
                  <Text style={ss.enrouteAddr}>{restaurant}</Text>
                  <Pressable style={ss.enrouteAddrCopyRow} onPress={() => Alert.alert(t('copied'), t('addressCopied'))}>
                    <Text style={ss.enrouteAddrBold} selectable>{order.pickupAddress || '12 Rue du Commerce, Meaux'}</Text>
                    <Ionicons name="copy-outline" size={14} color="#555" />
                  </Pressable>
                </View>
                <Ionicons name="checkmark-circle" size={18} color={BRAND} />
              </View>
              <View style={ss.enrouteLine} />
              <View style={ss.enrouteRow}>
                <View style={ss.enrouteDotBlue} />
                <View style={{ flex: 1 }}>
                  <Text style={ss.enrouteLabel}>Livraison</Text>
                  <Text style={ss.enrouteAddr}>{address}</Text>
                </View>
                <Ionicons name="ellipse-outline" size={18} color="#ccc" />
              </View>
            </View>

            <View style={ss.badgesRow}>
              <View style={ss.infoBadge}>
                <Ionicons name="time-outline" size={16} color="#666" />
                <Text style={ss.infoBadgeText}>{eta}</Text>
              </View>
              <View style={ss.infoBadge}>
                <Ionicons name="navigate-outline" size={16} color="#666" />
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
                <Ionicons name="receipt-outline" size={14} color="#888" />
                <Text style={ss.enrouteDetailLabel}>Commande</Text>
                <Text style={ss.enrouteDetailValue}>{orderId}</Text>
              </View>
              {order.itemsCount && (
                <View style={ss.enrouteDetailRow}>
                  <Ionicons name="cube-outline" size={14} color="#888" />
                  <Text style={ss.enrouteDetailLabel}>Articles</Text>
                  <Text style={ss.enrouteDetailValue}>{order.itemsCount}</Text>
                </View>
              )}
              {order.category && (
                <View style={ss.enrouteDetailRow}>
                  <Ionicons name="pricetag-outline" size={14} color="#888" />
                  <Text style={ss.enrouteDetailLabel}>Catégorie</Text>
                  <Text style={ss.enrouteDetailValue}>{order.category}</Text>
                </View>
              )}
            </View>

            <Pressable style={ss.mapBtnCompact} onPress={() => openMap(address)}>
              <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={ss.mapBtnTxt}>{t('clientItinerary')}</Text>
            </Pressable>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={() => Alert.alert(t('clientCall'), t('featureComingSoon'))}>
              <Ionicons name="call-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('callTheClient')}</Text>
            </Pressable>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={() => setShowChat(true)}>
              <Ionicons name="chatbubble-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>Message client</Text>
            </Pressable>
          </View>
        )}

        {/* Step: Arrived */}
        {step === 'arrived' && (
          <ArrivedStep
            address={address}
            orderId={orderId}
            hasCalled={hasCalled}
            onCallDone={() => setHasCalled(true)}
            onWarning={addWarning}
            showCallPopup={showCallPopup}
            setShowCallPopup={setShowCallPopup}
            onMessage={() => setShowChat(true)}
            onOpenMap={openMap}
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
                  keyboardType="default"
                  maxLength={1}
                  value={code[i]}
                  onChangeText={val => handleCodeInput(val, i)}
                  autoFocus={i === 0}
                />
              ))}
            </View>

            <Text style={ss.codeHint}>{t('demoCode')} : {REAL_CODE}</Text>

            {/* Décompte 10 min */}
            <View style={ss.codeTimerWrap}>
              <Ionicons name="time-outline" size={16} color={codeTimer > 60 ? '#888' : '#e74c3c'} style={{ marginRight: 6 }} />
              <Text style={[ss.codeTimerText, codeTimer <= 60 && { color: '#e74c3c' }]}>
                {Math.floor(codeTimer / 60)}:{String(codeTimer % 60).padStart(2, '0')}
              </Text>
            </View>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={() => Alert.alert(t('clientCall'), t('featureComingSoon'))}>
              <Ionicons name="call-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>{t('callTheClient') || 'Appeler le client'}</Text>
            </Pressable>

            <Pressable style={[ss.callBtn, { paddingVertical: 10, marginBottom: 8 }]} onPress={() => setShowChat(true)}>
              <Ionicons name="chatbubble-outline" size={16} color={BRAND} style={{ marginRight: 6 }} />
              <Text style={[ss.callBtnTxt, { fontSize: 14 }]}>Message client</Text>
            </Pressable>

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
              <Text style={ss.earningsBannerLabel}>+ {price}</Text>
              <Text style={ss.earningsBannerSub}>ajouté à votre solde</Text>
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
              <View style={[ss.summaryRow, { borderBottomWidth: 0 }]}>
                <Text style={[ss.summaryLabel, { fontWeight: '800' }]}>{t('gain')}</Text>
                <Text style={[ss.summaryValue, { color: BRAND, fontWeight: '900', fontSize: 18 }]}>{price}</Text>
              </View>
            </View>

            <Pressable style={ss.doneBtn} onPress={() => {
              navigation.navigate('OrdersMain', { completedOrder: { ...order, status: 'completed', completedAt: new Date().toISOString() } });
            }}>
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
                '⚠️ Attention',
                'Le délai de 10 minutes n\'est pas encore écoulé. Si vous signalez un problème maintenant, un avertissement pourra être ajouté à votre compte selon la résolution du ticket par le service administratif.',
                [
                  { text: 'Attendre', style: 'cancel' },
                  { text: 'Continuer', style: 'destructive', onPress: () => {
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
              {codeTimer === 0 ? 'Ouvrir un ticket - Livraison client' : "J'ai un problème"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Fixed bottom slide button + cancel */}
      {(step === 'pickup' || step === 'enroute' || step === 'arrived') && (
        <View style={ss.bottomBar}>
          {step === 'pickup' && <SlideButton label={t('orderPickedUp')} onComplete={() => slideRateLimiter(nextStep)} />}
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
              {weeklyCancels < MAX_WEEKLY_CANCELS
                ? `Vous avez ${MAX_WEEKLY_CANCELS - weeklyCancels} annulation${MAX_WEEKLY_CANCELS - weeklyCancels > 1 ? 's' : ''} restante${MAX_WEEKLY_CANCELS - weeklyCancels > 1 ? 's' : ''} cette semaine avant avertissement.`
                : 'Vous avez dépassé vos 5 annulations cette semaine. Un avertissement sera ajouté à votre compte.'}
            </Text>
            {weeklyCancels >= MAX_WEEKLY_CANCELS && (
              <View style={ss.cancelWarningBadge}>
                <Ionicons name="alert-circle" size={16} color="#e74c3c" style={{ marginRight: 6 }} />
                <Text style={ss.cancelWarningText}>⚠️ Avertissement sera ajouté</Text>
              </View>
            )}
            <Pressable style={ss.cancelConfirmBtn} onPress={() => {
              const result = cancelOrder();
              setShowCancelPopup(false);
              const cancelledOrder = { ...order, status: 'cancelled', priceText: '0,00 €', cancelledAt: new Date().toISOString() };
              if (result.warning) {
                Alert.alert(t('warning'), t('warningAdded'), [
                  { text: t('ok'), onPress: () => navigation.navigate('OrdersMain', { cancelledOrder }) },
                ]);
              } else {
                Alert.alert(t('orderCancelled'), `Il vous reste ${result.remaining} annulation${result.remaining > 1 ? 's' : ''} cette semaine.`, [
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
              <Text style={ss.sheetTitle}>Ouvrir l'itinéraire</Text>
              <Text style={ss.sheetAddr} numberOfLines={2}>{mapSheetDest}</Text>

              <View style={ss.sheetGroup}>
                <Pressable style={ss.sheetOption} onPress={() => { closeMapSheet(); setTimeout(() => Linking.openURL(mapSheetUrls.google), 250); }}>
                  <View style={[ss.sheetIconWrap, { backgroundColor: '#e8f5e9' }]}>
                    <Ionicons name="map" size={20} color="#34a853" />
                  </View>
                  <Text style={ss.sheetOptionText}>Google Maps</Text>
                  <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                </Pressable>

                <View style={ss.sheetSep} />

                <Pressable style={ss.sheetOption} onPress={() => { closeMapSheet(); setTimeout(() => Linking.openURL(mapSheetUrls.waze), 250); }}>
                  <View style={[ss.sheetIconWrap, { backgroundColor: '#e3f2fd' }]}>
                    <Ionicons name="navigate" size={20} color="#2196F3" />
                  </View>
                  <Text style={ss.sheetOptionText}>Waze</Text>
                  <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                </Pressable>

                <View style={ss.sheetSep} />

                <Pressable style={ss.sheetOption} onPress={() => { closeMapSheet(); Alert.alert(t('copied'), t('addressCopied')); }}>
                  <View style={[ss.sheetIconWrap, { backgroundColor: '#f2f2f7' }]}>
                    <Ionicons name="copy-outline" size={20} color="#8e8e93" />
                  </View>
                  <Text style={ss.sheetOptionText}>Copier l'adresse</Text>
                  <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                </Pressable>
              </View>

              <Pressable style={ss.sheetCancelBtn} onPress={closeMapSheet}>
                <Text style={ss.sheetCancelTxt}>Annuler</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      {/* Problème code modal */}
      <Modal visible={showCodeProblem} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
          <View style={ss.chatHeader}>
            <Pressable onPress={() => setShowCodeProblem(false)}>
              <Ionicons name="close" size={28} color="#111" />
            </Pressable>
            <Text style={ss.chatHeaderTitle}>Signaler un problème</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, color: '#888', fontWeight: '600', marginBottom: 12 }}>Commande {orderId}</Text>

            {CODE_PROBLEMS.map(p => (
              <Pressable
                key={p.id}
                style={[ss.codeProblemRow, selectedCodeProblem === p.id && ss.codeProblemRowActive]}
                onPress={() => setSelectedCodeProblem(p.id)}
              >
                <Ionicons name={p.icon} size={18} color={selectedCodeProblem === p.id ? BRAND : '#666'} />
                <Text style={[ss.codeProblemRowText, selectedCodeProblem === p.id && { color: BRAND, fontWeight: '800' }]}>{p.label}</Text>
                {selectedCodeProblem === p.id && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
              </Pressable>
            ))}

            {selectedCodeProblem && (
              <TextInput
                style={ss.codeProblemInput}
                placeholder={t('descOptional')}
                placeholderTextColor="#aaa"
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
              style={[ss.codeTicketBtn, !selectedCodeProblem && { opacity: 0.4 }]}
              disabled={!selectedCodeProblem}
              onPress={() => {
                const problem = CODE_PROBLEMS.find(p => p.id === selectedCodeProblem);
                const now = new Date();
                const ticketMsgs = [
                  { id: '0', type: 'system', text: `Ticket ouvert pour la commande ${orderId}` },
                  { id: `user-${Date.now()}`, type: 'user', text: `Problème signalé : ${problem.label}${codeProblemDesc.trim() ? `\n${codeProblemDesc.trim()}` : ''}`, time: now.toISOString() },
                  { id: 'admin-0', type: 'admin', text: 'Bonjour ! Merci de nous contacter. Un agent va prendre en charge votre demande.', time: new Date(now.getTime() + 1500).toISOString() },
                ];
                saveTicketMessages(orderId, ticketMsgs);
                markOrderReported(order.id);
                setShowCodeProblem(false);
                const problemOrder = { ...order, status: 'completed', completedAt: now.toISOString(), reported: true };
                navigation.navigate('OrdersMain', { completedOrder: problemOrder });
              }}
            >
              <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={ss.codeTicketBtnTxt}>Envoyer et fermer la livraison</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Chat client modal */}
      <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f5f5f5' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={ss.chatHeader}>
            <Pressable onPress={() => setShowChat(false)}>
              <Ionicons name="close" size={28} color="#111" />
            </Pressable>
            <Text style={ss.chatHeaderTitle}>Message au client</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Info commande */}
          <View style={ss.chatInfoBar}>
            <View style={{ flex: 1 }}>
              <Text style={ss.chatInfoLabel}>Récupération</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Ionicons name="storefront-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
                <Text style={ss.chatInfoText} numberOfLines={1}>{restaurant}</Text>
              </View>
            </View>
            <View style={{ width: 1, height: 30, backgroundColor: '#e0e0e0', marginHorizontal: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={ss.chatInfoLabel}>Livraison</Text>
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
                  {new Date(item.time).getHours()}h{String(new Date(item.time).getMinutes()).padStart(2, '0')}
                </Text>
              </View>
            )}
          />

          {/* Input + quick chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.quickChipsRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}>
            {[...QUICK_MSGS.filter(m => !sentQuicks.includes(m)), ...sentQuicks].map((msg, i) => {
              const isSent = sentQuicks.includes(msg);
              return (
                <Pressable key={i} style={[ss.quickChipSmall, isSent && ss.quickChipSent]} onPress={() => {
                  if (isSent) return;
                  const m = { id: Date.now(), text: msg, from: 'me', time: new Date() };
                  setChatMessages(prev => [...prev, m]);
                  setSentQuicks(prev => [...prev, msg]);
                  setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
                }} disabled={isSent}>
                  <Text style={[ss.quickChipSmallText, isSent && ss.quickChipSentText]}>{msg}</Text>
                  {isSent && <Ionicons name="checkmark" size={14} color="#999" style={{ marginLeft: 4 }} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[ss.chatInputRow, { paddingBottom: insets.bottom || 16 }]}>
            <TextInput
              style={ss.chatInputField}
              placeholder={t('writeAMessage')}
              value={chatInput}
              onChangeText={setChatInput}
            />
            <Pressable style={[ss.chatSendBtn, !chatInput.trim() && { opacity: 0.4 }]} onPress={() => {
              if (!chatInput.trim()) return;
              const sanitized = sanitizeInput(chatInput);
              if (!sanitized) return;
              const m = { id: Date.now(), text: sanitized, from: 'me', time: new Date() };
              setChatMessages(prev => [...prev, m]);
              setChatInput('');
              setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
            }}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' }, /* unused kept for reference */
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  progressRow: { flexDirection: 'row', marginHorizontal: 16 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressSegmentActive: { backgroundColor: BRAND },
  progressSegmentInactive: { backgroundColor: '#e0e0e0' },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 30, backgroundColor: '#f5f5f5', flexShrink: 0 },
  // Call popup
  callPopup: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  callPopupCard: { backgroundColor: '#e74c3c', borderRadius: 20, padding: 28, alignItems: 'center', marginHorizontal: 32, width: W - 64 },
  callPopupTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 12 },
  callPopupSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  callPopupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%' },
  callPopupBtnTxt: { color: '#e74c3c', fontWeight: '800', fontSize: 16 },

  // Cancel button & popup
  cancelBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  cancelBtnTxt: { color: '#e74c3c', fontSize: 13, fontWeight: '700' },
  cancelOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  cancelCard: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', marginHorizontal: 24, width: W - 48 },
  cancelTitle: { fontSize: 20, fontWeight: '900', color: '#111', marginTop: 12 },
  cancelSub: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  cancelWarningBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fde8e8', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, marginTop: 12 },
  cancelWarningText: { fontSize: 13, fontWeight: '700', color: '#e74c3c' },
  cancelConfirmBtn: { backgroundColor: '#e74c3c', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 16 },
  cancelConfirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelKeepBtn: { paddingVertical: 12, width: '100%', alignItems: 'center', marginTop: 4 },
  cancelKeepBtnTxt: { color: BRAND, fontWeight: '700', fontSize: 15 },

  stepContent: { padding: 24, alignItems: 'center' },
  bigIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stepTitle: { fontSize: 24, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 6 },
  stepSub: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 20 },

  infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoLabel: { flex: 1, fontSize: 14, color: '#888', marginLeft: 10 },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#111' },

  mapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, width: '100%', marginBottom: 10 },
  mapBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, width: '100%', borderWidth: 1, borderColor: BRAND, marginBottom: 10 },
  callBtnTxt: { color: BRAND, fontWeight: '700', fontSize: 15 },

  tipsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND + '10', borderRadius: 14, padding: 16, width: '100%', marginBottom: 16 },
  tipsText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },

  // Countdown (arrived)
  countdownCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', marginBottom: 16, alignItems: 'center' },
  countdownCircle: { alignItems: 'center', marginBottom: 12 },
  countdownTime: { fontSize: 42, fontWeight: '900', letterSpacing: 2 },
  countdownLabel: { fontSize: 13, color: '#888', fontWeight: '600', marginTop: 2 },
  countdownBarBg: { width: '100%', height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  countdownBarFill: { height: 6, borderRadius: 3 },
  countdownHint: { fontSize: 13, fontWeight: '700', marginTop: 8 },

  // Route card (pickup)
  routeCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', marginBottom: 16 },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  routeDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND, marginRight: 12 },
  routeDotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e74c3c', marginRight: 12 },
  routeLineVert: { width: 2, height: 20, backgroundColor: '#e0e0e0', marginLeft: 5, marginVertical: 4 },
  itemsBlock: { marginLeft: 16, marginVertical: 8, backgroundColor: '#f8f9fa', borderRadius: 10, padding: 10 },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  itemsTitle: { fontSize: 13, fontWeight: '800', color: BRAND },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  itemQty: { fontSize: 13, fontWeight: '800', color: '#111', width: 28 },
  itemName: { fontSize: 13, color: '#444', flex: 1 },
  routeLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  routeAddr: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 2 },

  // Slider
  sliderTrack: { width: SLIDER_W, height: THUMB_SIZE + 12, borderRadius: (THUMB_SIZE + 12) / 2, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  sliderLabel: { fontSize: 15, fontWeight: '700', marginLeft: THUMB_SIZE },
  sliderThumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },

  // Code
  codeRow: { flexDirection: 'row', gap: 16, marginVertical: 24 },
  codeInput: { width: 56, height: 64, borderRadius: 14, borderWidth: 2, borderColor: '#e0e0e0', textAlign: 'center', fontSize: 28, fontWeight: '900', backgroundColor: '#fff' },
  codeInputFilled: { borderColor: BRAND },
  codeHint: { fontSize: 13, color: '#999', marginBottom: 20 },

  // Compact layout
  stepContentCompact: { padding: 16, alignItems: 'center' },
  smallIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND + '15', alignItems: 'center', justifyContent: 'center' },
  stepTitleCompact: { fontSize: 18, fontWeight: '900', color: '#111' },
  stepSubCompact: { fontSize: 13, color: '#888', marginTop: 2 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginBottom: 10 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, gap: 4 },
  infoBadgeText: { fontSize: 12, fontWeight: '700', color: '#333' },
  mapBtnCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingVertical: 12, width: '100%', marginBottom: 10 },

  // Done
  doneTitle: { fontSize: 28, fontWeight: '900', color: BRAND, textAlign: 'center', marginBottom: 8 },
  doneSub: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', marginBottom: 24 },
  summaryHeader: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  summaryLabel: { fontSize: 14, color: '#888' },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#111', maxWidth: '60%', textAlign: 'right' },
  enrouteAddrCopyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  enrouteAddrBold: { fontSize: 14, fontWeight: '800', color: '#111' },

  // Bottom sheet itinéraire — style Apple
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end', zIndex: 100 },
  sheetContainer: { backgroundColor: '#f2f2f7', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 10, paddingBottom: 40, paddingTop: 8 },
  sheetHandle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#c7c7cc', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 13, fontWeight: '600', color: '#8e8e93', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, paddingHorizontal: 10 },
  sheetAddr: { fontSize: 13, color: '#8e8e93', textAlign: 'center', marginBottom: 14, paddingHorizontal: 10 },
  sheetGroup: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  sheetSep: { height: 0.5, backgroundColor: '#c7c7cc', marginLeft: 66 },
  sheetIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sheetOptionText: { flex: 1, fontSize: 17, fontWeight: '400', color: '#000', letterSpacing: -0.4 },
  sheetCancelBtn: { backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  sheetCancelTxt: { fontSize: 17, fontWeight: '600', color: '#007aff' },
  enrouteCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: '#f0f0f0' },
  enrouteRow: { flexDirection: 'row', alignItems: 'center' },
  enrouteDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND, marginRight: 12 },
  enrouteDotBlue: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2196F3', marginRight: 12 },
  enrouteLine: { width: 2, height: 16, backgroundColor: '#e0e0e0', marginLeft: 5, marginVertical: 3 },
  enrouteLabel: { fontSize: 11, color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  enrouteAddr: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 2 },
  enrouteDetailCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: '#f0f0f0' },
  enrouteDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  enrouteDetailLabel: { flex: 1, fontSize: 14, color: '#666' },
  enrouteDetailValue: { fontSize: 14, fontWeight: '800', color: '#111' },
  earningsBanner: { backgroundColor: BRAND + '15', borderRadius: 14, paddingVertical: 14, alignItems: 'center', width: '100%' },
  earningsBannerLabel: { fontSize: 28, fontWeight: '900', color: BRAND },
  earningsBannerSub: { fontSize: 13, color: '#666', fontWeight: '600', marginTop: 2 },
  doneBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center' },
  doneBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  codeTimerWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, width: '100%' },
  codeTimerText: { fontSize: 20, fontWeight: '900', color: '#111' },
  codeProblemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff3e0', borderRadius: 14, paddingVertical: 14, width: '100%', marginBottom: 8, borderWidth: 1, borderColor: '#f5a623' },
  codeProblemBtnTxt: { color: '#f5a623', fontWeight: '800', fontSize: 14 },
  codeProblemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8, gap: 12, borderWidth: 1.5, borderColor: 'transparent' },
  codeProblemRowActive: { borderColor: BRAND, backgroundColor: BRAND + '10' },
  codeProblemRowText: { flex: 1, fontSize: 15, color: '#333', fontWeight: '600' },
  codeProblemInput: { backgroundColor: '#fff', borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, borderWidth: 1, borderColor: '#e0e0e0', marginTop: 12, color: '#111' },
  codeTicketBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', borderRadius: 14, paddingVertical: 14, width: '100%', marginTop: 4 },
  codeTicketBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  arrivedAddrCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: '#f0f0f0' },
  arrivedAddrLabel: { fontSize: 11, color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  arrivedAddrText: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 4 },
  arrivedMapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },

  // Chat client
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
  chatHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  chatInfoBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  chatInfoLabel: { fontSize: 10, color: '#999', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chatInfoText: { fontSize: 13, color: '#111', fontWeight: '700', flexShrink: 1 },
  quickWrap: { padding: 16 },
  quickTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },
  quickChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: '#f0f0f0' },
  quickChipText: { fontSize: 15, fontWeight: '600', color: '#111' },
  quickChipsRow: { backgroundColor: '#fff', paddingTop: 8, paddingBottom: 8, flexGrow: 0 },
  quickChipSmall: { backgroundColor: BRAND + '15', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  quickChipSmallText: { fontSize: 13, fontWeight: '700', color: BRAND },
  quickChipSent: { backgroundColor: '#f0f0f0', opacity: 0.7, flexDirection: 'row', alignItems: 'center' },
  quickChipSentText: { color: '#999' },
  chatBubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 10 },
  chatBubbleMe: { backgroundColor: BRAND, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleClient: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: 15, color: '#111', lineHeight: 20 },
  chatBubbleTime: { fontSize: 11, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  chatInputField: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, marginRight: 10 },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
});
