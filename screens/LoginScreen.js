import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, FlatList,
  SafeAreaView, ActivityIndicator, InputAccessoryView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isValidEmail, sanitizeInput, isStrongPassword } from '../utils/validation';
import * as ImagePicker from 'expo-image-picker';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import useOtpSender from '../services/otpauth/useOtpSender';
import { getFirebaseApp } from '../services/otpauth/firebase';
import api from '../services/api';
import {
  LEGAL_STATUSES, DOCS_BY_STATUS, PARTICULIER_ALLOWED, STRIPE_CONNECT_COUNTRIES,
} from './registrationConfig';

const BRAND = '#00C29B';
const MAX_LOGIN_FAILS = 3;
const LOGIN_COOLDOWN_MS = 30000;

const COUNTRIES = [
  { code: 'FR', flag: '🇫🇷', name: 'France', phoneCode: '+33' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgique', phoneCode: '+32' },
  { code: 'GB', flag: '🇬🇧', name: 'Royaume-Uni', phoneCode: '+44' },
  { code: 'DE', flag: '🇩🇪', name: 'Allemagne', phoneCode: '+49' },
  { code: 'IT', flag: '🇮🇹', name: 'Italie', phoneCode: '+39' },
  { code: 'ES', flag: '🇪🇸', name: 'Espagne', phoneCode: '+34' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal', phoneCode: '+351' },
  { code: 'NL', flag: '🇳🇱', name: 'Pays-Bas', phoneCode: '+31' },
  { code: 'CH', flag: '🇨🇭', name: 'Suisse', phoneCode: '+41' },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg', phoneCode: '+352' },
  { code: 'AT', flag: '🇦🇹', name: 'Autriche', phoneCode: '+43' },
  { code: 'IE', flag: '🇮🇪', name: 'Irlande', phoneCode: '+353' },
  { code: 'SE', flag: '🇸🇪', name: 'Suède', phoneCode: '+46' },
  { code: 'DK', flag: '🇩🇰', name: 'Danemark', phoneCode: '+45' },
  { code: 'NO', flag: '🇳🇴', name: 'Norvège', phoneCode: '+47' },
  { code: 'FI', flag: '🇫🇮', name: 'Finlande', phoneCode: '+358' },
  { code: 'PL', flag: '🇵🇱', name: 'Pologne', phoneCode: '+48' },
  { code: 'MA', flag: '🇲🇦', name: 'Maroc', phoneCode: '+212' },
  { code: 'TN', flag: '🇹🇳', name: 'Tunisie', phoneCode: '+216' },
  { code: 'DZ', flag: '🇩🇿', name: 'Algérie', phoneCode: '+213' },
  { code: 'SN', flag: '🇸🇳', name: 'Sénégal', phoneCode: '+221' },
  { code: 'CI', flag: '🇨🇮', name: "Côte d'Ivoire", phoneCode: '+225' },
  { code: 'CM', flag: '🇨🇲', name: 'Cameroun', phoneCode: '+237' },
  { code: 'CD', flag: '🇨🇩', name: 'RD Congo', phoneCode: '+243' },
  { code: 'EG', flag: '🇪🇬', name: 'Égypte', phoneCode: '+20' },
  { code: 'LB', flag: '🇱🇧', name: 'Liban', phoneCode: '+961' },
  { code: 'AE', flag: '🇦🇪', name: 'Émirats arabes unis', phoneCode: '+971' },
  { code: 'SA', flag: '🇸🇦', name: 'Arabie saoudite', phoneCode: '+966' },
  { code: 'TR', flag: '🇹🇷', name: 'Turquie', phoneCode: '+90' },
  { code: 'US', flag: '🇺🇸', name: 'États-Unis', phoneCode: '+1' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada', phoneCode: '+1' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexique', phoneCode: '+52' },
  { code: 'BR', flag: '🇧🇷', name: 'Brésil', phoneCode: '+55' },
  { code: 'AU', flag: '🇦🇺', name: 'Australie', phoneCode: '+61' },
  { code: 'JP', flag: '🇯🇵', name: 'Japon', phoneCode: '+81' },
  { code: 'IN', flag: '🇮🇳', name: 'Inde', phoneCode: '+91' },
  { code: 'RU', flag: '🇷🇺', name: 'Russie', phoneCode: '+7' },
  { code: 'ZA', flag: '🇿🇦', name: 'Afrique du Sud', phoneCode: '+27' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria', phoneCode: '+234' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya', phoneCode: '+254' },
  { code: 'GP', flag: '🇬🇵', name: 'Guadeloupe', phoneCode: '+590' },
  { code: 'MQ', flag: '🇲🇶', name: 'Martinique', phoneCode: '+596' },
  { code: 'RE', flag: '🇷🇪', name: 'La Réunion', phoneCode: '+262' },
  { code: 'GF', flag: '🇬🇫', name: 'Guyane française', phoneCode: '+594' },
  { code: 'HT', flag: '🇭🇹', name: 'Haïti', phoneCode: '+509' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadDocToS3(uri, slot) {
  const filename = uri.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const contentType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const stat = await fetch(uri);
  const blob = await stat.blob();
  const size = blob.size;

  const { data: presign } = await api.post('/api/v1/delivery/register/doc-presign/', {
    filename, content_type: contentType, size, slot,
  });
  if (!presign?.data?.url) throw new Error('Presign failed');

  const form = new FormData();
  Object.entries(presign.data.fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', { uri, name: filename, type: contentType });
  await fetch(presign.data.url, { method: 'POST', body: form });
  return presign.data.public_url;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { t, lang, setLang, LANGUAGES } = useLanguage();
  const { login, register, loginWithOtp } = useAuth();

  // mode: 'login' | 'forgot' | 'phoneOtp' | 'signup'
  const [mode, setMode] = useState('login');
  // step 1=identifiants 2=profil 3=docs 4=stripe
  const [step, setStep] = useState(1);
  const [legalStatus, setLegalStatus] = useState(null);
  const [pendingValidation, setPendingValidation] = useState(false);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState('');

  // Profile fields
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [country, setCountry] = useState('FR');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('FR');

  // Legal fields
  const [siret, setSiret] = useState('');
  const [legalName, setLegalName] = useState('');

  // Bank fields (SEPA manuel)
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [ibanHolder, setIbanHolder] = useState('');

  // Documents
  const [docs, setDocs] = useState({});
  const setDoc = useCallback((key, uri) => setDocs(prev => ({ ...prev, [key]: uri })), []);

  // OTP login
  const [otpPhone, setOtpPhone] = useState('');
  const [otpPhoneCountry, setOtpPhoneCountry] = useState('FR');
  const [otpCode, setOtpCode] = useState('');
  const [otpStage, setOtpStage] = useState('enter-phone');

  // Signup OTP
  const [signupOtpStage, setSignupOtpStage] = useState(null);
  const [signupOtpCode, setSignupOtpCode] = useState('');
  const [signupFirebaseUid, setSignupFirebaseUid] = useState('');
  const [signupPhoneE164, setSignupPhoneE164] = useState('');

  // Modals
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [phonePickerVisible, setPhonePickerVisible] = useState(false);
  const [otpPhonePickerVisible, setOtpPhonePickerVisible] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginFailsRef = useRef(0);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const cooldownTimerRef = useRef(null);

  const recaptchaVerifier = useRef(null);
  const [firebaseOptions, setFirebaseOptions] = useState(null);
  useEffect(() => {
    (async () => {
      try { const app = await getFirebaseApp(); if (app?.options) setFirebaseOptions(app.options); } catch (_) {}
    })();
  }, []);

  const { sendOtp, verifyOtp, reset: otpReset, loading: otpLoading, error: otpError } =
    useOtpSender({ platform: 'app-delivery', recaptchaVerifier });

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
  const selectedPhoneCountry = COUNTRIES.find(c => c.code === phoneCountry) || COUNTRIES[0];
  const selectedOtpPhoneCountry = COUNTRIES.find(c => c.code === otpPhoneCountry) || COUNTRIES[0];

  const isStripeConnect = STRIPE_CONNECT_COUNTRIES.has(country);
  const currentDocs = legalStatus ? DOCS_BY_STATUS[legalStatus] : [];
  const requiredDocs = currentDocs.filter(d => d.required);

  // ── Login ──────────────────────────────────────────────────────────────────

  const handleLogin = () => {
    setError('');
    if (loginDisabled) { setError(t('loginCooldown') || 'Trop de tentatives. Attendez 30s.'); return; }
    if (!email.trim()) { setError(t('errorNoEmail') || 'Email requis'); return; }
    if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return; }
    if (!password.trim()) { setError(t('errorNoPassword') || 'Mot de passe requis'); return; }
    const result = login(email.trim(), password);
    if (!result) {
      loginFailsRef.current += 1;
      if (loginFailsRef.current >= MAX_LOGIN_FAILS) {
        setLoginDisabled(true);
        setError(t('loginCooldown') || 'Trop de tentatives. Attendez 30s.');
        cooldownTimerRef.current = setTimeout(() => { setLoginDisabled(false); loginFailsRef.current = 0; }, LOGIN_COOLDOWN_MS);
      } else {
        setError(t('loginErrorCredentials') || 'Email ou mot de passe incorrect');
      }
    }
  };

  // ── OTP login ──────────────────────────────────────────────────────────────

  const handleOtpSend = async () => {
    setError('');
    if (!otpPhone.trim()) { setError(t('errorNoPhone') || 'Téléphone requis'); return; }
    const full = `${selectedOtpPhoneCountry.phoneCode}${otpPhone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
    const ok = await sendOtp({ phone: full, channel: 'sms', defaultRegion: otpPhoneCountry });
    if (ok) { setOtpStage('enter-code'); return; }
    setError(otpError || t('phoneOtpSendFailed') || 'Impossible d\'envoyer le code.');
  };

  const handleOtpVerify = async () => {
    setError('');
    const result = await verifyOtp({ code: otpCode });
    if (!result) { setError(otpError || t('otpVerifyFailed') || 'Code invalide.'); return; }
    if (!result.userFound) {
      setError(t('driverNotFound') || 'Aucun compte trouvé. Inscrivez-vous.');
      setMode('signup'); setStep(1); setOtpStage('enter-phone'); setOtpCode(''); return;
    }
    const ok = await loginWithOtp(result);
    if (!ok) setError(t('otpLoginFailed') || 'Connexion impossible.');
  };

  // ── Signup steps ───────────────────────────────────────────────────────────

  const handleBack = () => {
    setError('');
    if (mode === 'login') return;
    if (mode === 'phoneOtp') { if (otpStage === 'enter-code') { otpReset(); setOtpCode(''); setOtpStage('enter-phone'); } else { setMode('login'); } return; }
    if (mode === 'forgot') { setMode('login'); return; }
    if (signupOtpStage === 'verify') { otpReset(); setSignupOtpCode(''); setSignupOtpStage(null); return; }
    if (step > 1) { setStep(s => s - 1); return; }
    setMode('login');
  };

  const validateStep1 = () => {
    if (!email.trim() || !password.trim() || !confirmPwd.trim()) { setError(t('errorEmpty') || 'Remplissez tous les champs'); return false; }
    if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return false; }
    if (!isStrongPassword(password)) { setError(t('errorPasswordWeak') || 'Mot de passe trop faible (8 car., maj, min, chiffre)'); return false; }
    if (password !== confirmPwd) { setError(t('errorPasswordMismatch') || 'Mots de passe différents'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!nom.trim() || !prenom.trim() || !phone.trim()) { setError(t('errorEmpty') || 'Remplissez tous les champs'); return false; }
    if (!legalStatus) { setError(t('errorNoStatus') || 'Choisissez votre statut'); return false; }
    if (legalStatus === 'particulier' && !PARTICULIER_ALLOWED.has(country)) {
      setError(t('particulierNotAllowed') || 'Le statut Particulier n\'est pas disponible pour ce pays. Choisissez Auto-entrepreneur ou Société.');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if ((legalStatus === 'auto_entrepreneur' || legalStatus === 'societe') && siret.trim().replace(/\s/g, '').length !== 14) {
      setError(t('errorSiret') || 'SIRET invalide (14 chiffres)'); return false;
    }
    const missing = requiredDocs.filter(d => !docs[d.key]);
    if (missing.length > 0) { setError(t('errorDocsRequired') || 'Documents obligatoires manquants'); return false; }
    if (!isStripeConnect && !iban.trim()) { setError(t('errorIbanRequired') || 'IBAN obligatoire'); return false; }
    return true;
  };

  const handleStep1Next = () => { setError(''); if (validateStep1()) setStep(2); };
  const handleStep2Next = () => {
    setError('');
    if (!validateStep2()) return;
    handleSignupOtpSend();
  };
  const handleStep3Next = () => { setError(''); if (validateStep3()) setStep(4); };

  // ── Signup OTP ─────────────────────────────────────────────────────────────

  const handleSignupOtpSend = async () => {
    const full = `${selectedPhoneCountry.phoneCode}${phone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
    setLoading(true);
    const ok = await sendOtp({ phone: full, channel: 'sms', defaultRegion: phoneCountry });
    setLoading(false);
    if (ok) { setSignupOtpStage('verify'); setSignupOtpCode(''); return; }
    setError(otpError || t('phoneOtpSendFailed') || 'Impossible d\'envoyer le code.');
  };

  const handleSignupOtpVerify = async () => {
    setError('');
    setLoading(true);
    const result = await verifyOtp({ code: signupOtpCode });
    setLoading(false);
    if (!result) { setError(otpError || t('otpVerifyFailed') || 'Code invalide.'); return; }
    setSignupFirebaseUid(result.firebaseUid || '');
    setSignupPhoneE164(result.phoneE164 || '');
    setSignupOtpStage(null);
    setSignupOtpCode('');
    otpReset();
    setStep(3);
  };

  // ── Stripe onboarding (étape 4) ────────────────────────────────────────────

  const handleStripeOnboarding = async () => {
    setError('');
    setLoading(true);
    try {
      await finalizeRegistration();
      if (isStripeConnect) {
        const { data } = await api.post('/api/v1/delivery/stripe/connect/');
        if (data?.url) {
          await WebBrowser.openBrowserAsync(data.url);
        }
      }
      setPendingValidation(true);
    } catch (e) {
      setError(e?.response?.data?.message || t('errorGeneric') || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const finalizeRegistration = async () => {
    const uploadedDocs = {};
    for (const doc of currentDocs) {
      if (docs[doc.key]) {
        uploadedDocs[doc.key] = await uploadDocToS3(docs[doc.key], doc.slot);
      }
    }

    await register({
      email: email.trim(), password,
      userName: `${prenom.trim()} ${nom.trim()}`,
      phone: signupPhoneE164 || `${selectedPhoneCountry.phoneCode}${phone.trim().replace(/^0+/, '')}`,
      phoneCode: selectedPhoneCountry.phoneCode,
      country,
      legal_status: legalStatus,
      siret: siret.trim().replace(/\s/g, ''),
      legal_name: legalName.trim(),
      iban: iban.trim(), bic: bic.trim(), iban_holder_name: ibanHolder.trim(),
      firebase_uid: signupFirebaseUid || undefined,
      ...uploadedDocs,
    });
  };

  // ── Pick document ──────────────────────────────────────────────────────────

  const pickDocument = async (docKey) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setDoc(docKey, result.assets[0].uri);
    }
  };

  // ── Pending validation screen ──────────────────────────────────────────────

  if (pendingValidation) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Ionicons name="time-outline" size={40} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 12 }}>
              {t('pendingTitle') || 'En attente de validation'}
            </Text>
            <Text style={{ fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {isStripeConnect
                ? (t('pendingMsgStripe') || 'Stripe vérifie votre identité. Vous recevrez une notification dès que votre compte est actif.')
                : (t('pendingMsg') || 'Votre dossier est en cours de vérification. Vous recevrez un email une fois approuvé.')}
            </Text>
            {[
              { icon: 'mail-outline', text: t('pendingEmail') || 'Email de confirmation envoyé' },
              { icon: 'shield-checkmark-outline', text: t('pendingReview') || 'Vérification sous 24-48h ouvrées' },
              { icon: 'notifications-outline', text: t('pendingNotif') || 'Notification à l\'activation' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name={item.icon} size={20} color={BRAND} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 14, color: '#374151', flex: 1 }}>{item.text}</Text>
              </View>
            ))}
            <Pressable
              onPress={() => { setPendingValidation(false); setMode('login'); setStep(1); setLegalStatus(null); setDocs({}); setError(''); }}
              style={{ height: 52, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('pendingBackLogin') || 'Retour à la connexion'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'forgot') return <ForgotPasswordScreen onBack={() => { setMode('login'); setError(''); }} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        {firebaseOptions && (
          <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={firebaseOptions} attemptInvisibleVerification />
        )}

        {mode !== 'login' && (
          <TouchableOpacity onPress={handleBack} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Ionicons name="arrow-back" size={26} color="#111" />
          </TouchableOpacity>
        )}

        {(mode === 'login' || (mode === 'signup' && step === 1)) && (
          <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 8 }}>
            <Ionicons name="bicycle" size={50} color={BRAND} style={{ marginBottom: 6 }} />
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111' }}>Pearl Delivery</Text>
          </View>
        )}

        {/* Progress bar signup */}
        {mode === 'signup' && (
          <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 8 }}>
            {[1, 2, 3, 4].map(s => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s <= step ? BRAND : '#E5E7EB', marginHorizontal: 2 }} />
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 20 }} keyboardShouldPersistTaps="handled">

          {error ? (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={{ color: '#EF4444', fontSize: 13, marginLeft: 8, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}><Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" /></Pressable>
              </View>
              <TouchableOpacity onPress={() => { setMode('forgot'); setError(''); }} style={{ alignSelf: 'flex-end', paddingTop: 6 }}>
                <Text style={{ color: BRAND, fontSize: 13, fontWeight: '600' }}>{t('forgotPasswordLink')}</Text>
              </TouchableOpacity>
              <Pressable style={[s.btn, loginDisabled && { opacity: 0.5 }]} onPress={handleLogin} disabled={loginDisabled}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('loginButton') || 'Se connecter'}</Text>}
              </Pressable>
              <TouchableOpacity onPress={() => { setMode('phoneOtp'); setOtpStage('enter-phone'); setError(''); otpReset(); }} style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: BRAND, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>{t('loginWithPhone') || 'Se connecter avec un téléphone'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setMode('signup'); setStep(1); setError(''); }} style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ color: '#6B7280', fontSize: 15 }}>{t('noAccount') || 'Pas de compte ?'} <Text style={{ color: BRAND, fontWeight: '800' }}>{t('signUp') || "S'inscrire"}</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── PHONE OTP LOGIN ── */}
          {mode === 'phoneOtp' && otpStage === 'enter-phone' && (
            <>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' }}>{t('phoneOtpTitle') || 'Connexion par téléphone'}</Text>
              <Text style={s.label}>{t('phoneLabel') || 'Téléphone'}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <TouchableOpacity onPress={() => setOtpPhonePickerVisible(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', marginRight: 8, flex: 0 }]}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{selectedOtpPhoneCountry.flag}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{selectedOtpPhoneCountry.phoneCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1 }]} value={otpPhone} onChangeText={setOtpPhone} placeholder="6 12 34 56 78" placeholderTextColor="#aaa" keyboardType="phone-pad" />
              </View>
              <Pressable style={[s.btn, (!otpPhone.trim() || otpLoading) && { opacity: 0.5 }]} onPress={handleOtpSend} disabled={!otpPhone.trim() || otpLoading}>
                {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('sendCode') || 'Envoyer le code'}</Text>}
              </Pressable>
            </>
          )}
          {mode === 'phoneOtp' && otpStage === 'enter-code' && (
            <>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' }}>{t('otpVerifyTitle') || 'Code reçu par SMS'}</Text>
              <TextInput style={[s.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center' }]} value={otpCode} onChangeText={setOtpCode} placeholder="123456" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={6} />
              <Pressable style={[s.btn, (otpCode.length < 4 || otpLoading) && { opacity: 0.5 }]} onPress={handleOtpVerify} disabled={otpCode.length < 4 || otpLoading}>
                {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyCode') || 'Vérifier'}</Text>}
              </Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 1 : Identifiants ── */}
          {mode === 'signup' && step === 1 && (
            <>
              <Text style={s.stepTitle}>{t('stepEmail') || 'Identifiants'}</Text>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}><Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" /></Pressable>
              </View>
              <Text style={s.label}>{t('confirmPassword') || 'Confirmer'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showConfirmPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowConfirmPwd(v => !v)} style={s.eyeBtn}><Ionicons name={showConfirmPwd ? 'eye-off' : 'eye'} size={22} color="#888" /></Pressable>
              </View>
              <Pressable style={s.btn} onPress={handleStep1Next}><Text style={s.btnTxt}>{t('next') || 'Suivant'}</Text></Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 2 : Profil + Statut ── */}
          {mode === 'signup' && step === 2 && signupOtpStage !== 'verify' && (
            <>
              <Text style={s.stepTitle}>{t('stepInfo') || 'Votre profil'}</Text>
              <Text style={s.label}>{t('driverLastName') || 'Nom'}</Text>
              <TextInput style={s.input} value={nom} onChangeText={setNom} placeholder="Dupont" placeholderTextColor="#aaa" />
              <Text style={s.label}>{t('driverFirstName') || 'Prénom'}</Text>
              <TextInput style={s.input} value={prenom} onChangeText={setPrenom} placeholder="Jean" placeholderTextColor="#aaa" />
              <Text style={s.label}>{t('countryLabel') || 'Pays'}</Text>
              <TouchableOpacity onPress={() => setCountryPickerVisible(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center' }]}>
                <Text style={{ fontSize: 20, marginRight: 10 }}>{selectedCountry.flag}</Text>
                <Text style={{ flex: 1, fontSize: 15, color: '#111', fontWeight: '600' }}>{selectedCountry.name}</Text>
                <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={s.label}>{t('phoneLabel') || 'Téléphone'}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <TouchableOpacity onPress={() => setPhonePickerVisible(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', marginRight: 8, flex: 0 }]}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{selectedPhoneCountry.flag}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{selectedPhoneCountry.phoneCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1 }]} value={phone} onChangeText={setPhone} placeholder="6 12 34 56 78" placeholderTextColor="#aaa" keyboardType="phone-pad" />
              </View>
              <Text style={s.label}>{t('statusLabel') || 'Votre statut'}</Text>
              {LEGAL_STATUSES.map(ls => {
                const disabled = ls.key === 'particulier' && !PARTICULIER_ALLOWED.has(country);
                const selected = legalStatus === ls.key;
                return (
                  <TouchableOpacity key={ls.key} onPress={() => !disabled && setLegalStatus(ls.key)} style={{
                    borderWidth: 2, borderColor: selected ? BRAND : disabled ? '#E5E7EB' : '#D1D5DB',
                    borderRadius: 14, padding: 16, marginBottom: 10,
                    backgroundColor: selected ? '#F0FDF4' : disabled ? '#F9FAFB' : '#fff',
                    flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.4 : 1,
                  }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: selected ? BRAND : '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Ionicons name={ls.icon} size={22} color={selected ? '#fff' : '#6B7280'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: disabled ? '#9CA3AF' : '#111' }}>{t(ls.labelKey) || ls.labelKey}</Text>
                      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{t(ls.descKey) || ''}</Text>
                      {disabled && <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>{t('particulierNotAvailable') || 'Non disponible dans ce pays'}</Text>}
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={BRAND} />}
                  </TouchableOpacity>
                );
              })}
              <Pressable style={[s.btn, (loading || otpLoading) && { opacity: 0.5 }]} onPress={handleStep2Next} disabled={loading || otpLoading}>
                {(loading || otpLoading) ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyAndContinue') || 'Vérifier le numéro'}</Text>}
              </Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 2 : OTP SMS ── */}
          {mode === 'signup' && step === 2 && signupOtpStage === 'verify' && (
            <>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="shield-checkmark" size={40} color={BRAND} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginTop: 12, textAlign: 'center' }}>{t('signupVerifyTitle') || 'Vérifier votre numéro'}</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8 }}>{t('otpSentTo') || 'Code envoyé au'} <Text style={{ fontWeight: '700', color: '#111' }}>{selectedPhoneCountry.phoneCode} {phone.trim()}</Text></Text>
              </View>
              <TextInput style={[s.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center' }]} value={signupOtpCode} onChangeText={setSignupOtpCode} placeholder="123456" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={6} />
              <Pressable style={[s.btn, (signupOtpCode.length < 4 || otpLoading || loading) && { opacity: 0.5 }]} onPress={handleSignupOtpVerify} disabled={signupOtpCode.length < 4 || otpLoading || loading}>
                {(otpLoading || loading) ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyCode') || 'Vérifier'}</Text>}
              </Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 3 : Documents ── */}
          {mode === 'signup' && step === 3 && (
            <>
              <Text style={s.stepTitle}>{t('stepDocs') || 'Documents'}</Text>

              {/* SIRET pour AE + Société */}
              {(legalStatus === 'auto_entrepreneur' || legalStatus === 'societe') && (
                <>
                  <Text style={s.label}>{legalStatus === 'societe' ? (t('siretSociete') || 'N° SIRET / Immatriculation') : (t('siretAE') || 'Numéro SIRET (14 chiffres)')}</Text>
                  <TextInput style={s.input} value={siret} onChangeText={setSiret} placeholder="12345678900012" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={14} />
                  {legalStatus === 'societe' && (
                    <>
                      <Text style={s.label}>{t('legalName') || 'Nom légal de la société'}</Text>
                      <TextInput style={s.input} value={legalName} onChangeText={setLegalName} placeholder="Ma Société SAS" placeholderTextColor="#aaa" />
                    </>
                  )}
                </>
              )}

              {/* Documents */}
              {currentDocs.map(doc => (
                <TouchableOpacity key={doc.key} onPress={() => pickDocument(doc.key)} style={{
                  flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1,
                  borderColor: docs[doc.key] ? BRAND : '#E5E7EB', borderRadius: 12, marginBottom: 10,
                  backgroundColor: docs[doc.key] ? '#F0FDF4' : '#fff',
                }}>
                  <Ionicons name={docs[doc.key] ? 'checkmark-circle' : doc.icon} size={22} color={docs[doc.key] ? BRAND : '#9CA3AF'} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{t(doc.labelKey) || doc.labelKey}{doc.required ? ' *' : ''}</Text>
                    {doc.note && !docs[doc.key] && <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{t(doc.note) || doc.note}</Text>}
                    <Text style={{ fontSize: 11, color: docs[doc.key] ? BRAND : '#9CA3AF', marginTop: 2 }}>{docs[doc.key] ? (t('docUploaded') || 'Document ajouté') : (t('docTapUpload') || 'Appuyer pour ajouter')}</Text>
                  </View>
                  {docs[doc.key] && (
                    <TouchableOpacity onPress={() => setDoc(doc.key, null)} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}

              {/* IBAN / BIC pour SEPA manuel */}
              {!isStripeConnect && (
                <>
                  <Text style={[s.label, { marginTop: 8 }]}>{t('ibanLabel') || 'IBAN'} *</Text>
                  <TextInput style={s.input} value={iban} onChangeText={setIban} placeholder="FR76 3000 6000 0112 3456 7890 189" placeholderTextColor="#aaa" autoCapitalize="characters" />
                  <Text style={s.label}>BIC/SWIFT *</Text>
                  <TextInput style={s.input} value={bic} onChangeText={setBic} placeholder="BNPAFRPP" placeholderTextColor="#aaa" autoCapitalize="characters" />
                  <Text style={s.label}>{t('ibanHolder') || 'Titulaire du compte'} *</Text>
                  <TextInput style={s.input} value={ibanHolder} onChangeText={setIbanHolder} placeholder="Jean Dupont" placeholderTextColor="#aaa" />
                </>
              )}

              <Pressable style={s.btn} onPress={handleStep3Next}><Text style={s.btnTxt}>{t('next') || 'Suivant'}</Text></Pressable>
            </>
          )}

          {/* ── SIGNUP STEP 4 : Stripe ── */}
          {mode === 'signup' && step === 4 && (
            <>
              <Text style={s.stepTitle}>{t('stepStripe') || 'Paiement & Vérification'}</Text>
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="card" size={40} color="#6366F1" />
                </View>
                {isStripeConnect ? (
                  <>
                    <Text style={{ fontSize: 16, color: '#374151', textAlign: 'center', lineHeight: 24 }}>
                      {t('stripeConnectDesc') || 'Stripe va vérifier votre identité et configurer vos virements automatiques. Cela prend 2-3 minutes.'}
                    </Text>
                    <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, width: '100%', marginTop: 16 }}>
                      {[
                        t('stripeStep1') || '📋 Vos informations personnelles',
                        t('stripeStep2') || '🪪 Vérification de votre identité',
                        t('stripeStep3') || '🏦 Vos coordonnées bancaires',
                      ].map((item, i) => (
                        <Text key={i} style={{ fontSize: 14, color: '#374151', marginBottom: i < 2 ? 8 : 0 }}>{item}</Text>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={{ fontSize: 16, color: '#374151', textAlign: 'center', lineHeight: 24 }}>
                    {t('sepaManualDesc') || 'Votre dossier sera examiné manuellement. Les virements seront effectués par virement bancaire international.'}
                  </Text>
                )}
              </View>
              <Pressable style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleStripeOnboarding} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={s.btnTxt}>{isStripeConnect ? (t('startStripeOnboarding') || 'Continuer vers Stripe') : (t('submitApplication') || 'Envoyer ma demande')}</Text>
                )}
              </Pressable>
            </>
          )}

        </ScrollView>

        {mode === 'login' && (
          <TouchableOpacity onPress={() => setLangPickerVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 24, marginBottom: 12, paddingVertical: 12 }}>
            <Ionicons name="globe-outline" size={18} color="#6B7280" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>{LANGUAGES.find(l => l.code === lang)?.flag || '🌐'} {LANGUAGES.find(l => l.code === lang)?.native || 'Language'}</Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'ios' && <InputAccessoryView nativeID="noSuggest"><View /></InputAccessoryView>}

        {/* Country Picker */}
        <Modal visible={countryPickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('countryLabel') || 'Pays'}</Text>
                <TouchableOpacity onPress={() => setCountryPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: c }) => (
                <TouchableOpacity onPress={() => { setCountry(c.code); setPhoneCountry(c.code); setCountryPickerVisible(false); if (legalStatus === 'particulier' && !PARTICULIER_ALLOWED.has(c.code)) setLegalStatus(null); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: country === c.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: country === c.code ? '700' : '500', color: country === c.code ? BRAND : '#111' }}>{c.name}</Text>
                  {country === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Phone Picker */}
        <Modal visible={phonePickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('phoneCodeLabel') || 'Indicatif'}</Text>
                <TouchableOpacity onPress={() => setPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_p'} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: c }) => (
                <TouchableOpacity onPress={() => { setPhoneCountry(c.code); setPhonePickerVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: phoneCountry === c.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: phoneCountry === c.code ? '700' : '500', color: phoneCountry === c.code ? BRAND : '#111' }}>{c.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>{c.phoneCode}</Text>
                  {phoneCountry === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* OTP Phone Picker */}
        <Modal visible={otpPhonePickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('phoneCodeLabel') || 'Indicatif'}</Text>
                <TouchableOpacity onPress={() => setOtpPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_otp'} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: c }) => (
                <TouchableOpacity onPress={() => { setOtpPhoneCountry(c.code); setOtpPhonePickerVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: otpPhoneCountry === c.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, color: otpPhoneCountry === c.code ? BRAND : '#111' }}>{c.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>{c.phoneCode}</Text>
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Language Picker */}
        <Modal visible={langPickerVisible} animationType="none" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{t('languageLabel') || 'Langue'}</Text>
                <TouchableOpacity onPress={() => setLangPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={LANGUAGES} keyExtractor={l => l.code} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item: l }) => (
                <TouchableOpacity onPress={() => { setLang(l.code); setLangPickerVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: lang === l.code ? '#F0FDF4' : '#fff' }}>
                  <Text style={{ fontSize: 24, marginRight: 14 }}>{l.flag}</Text>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: lang === l.code ? '700' : '500', color: lang === l.code ? BRAND : '#111' }}>{l.native}</Text>
                  {lang === l.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  label: { fontWeight: '700', fontSize: 14, color: '#333', marginBottom: 6, marginTop: 16 },
  stepTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 16 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4,
  },
  pwdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eyeBtn: { position: 'absolute', right: 12, padding: 4 },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
