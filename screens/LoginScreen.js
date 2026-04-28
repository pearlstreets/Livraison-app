import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, FlatList, SafeAreaView, ActivityIndicator, InputAccessoryView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isValidEmail, sanitizeInput, isStrongPassword } from '../utils/validation';
import * as ImagePicker from 'expo-image-picker';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import useOtpSender from '../services/otpauth/useOtpSender';
import { getFirebaseApp } from '../services/otpauth/firebase';

// NOTE: To prevent screen capture in production, consider using
// expo-screen-capture: ScreenCapture.preventScreenCaptureAsync()

const BRAND = '#00C29B';
const MAX_LOGIN_FAILS = 3;
const LOGIN_COOLDOWN_MS = 30000; // 30s cooldown after 3 fails

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

export default function LoginScreen() {
  const { t, lang, setLang, LANGUAGES } = useLanguage();
  const { login, register, loginWithOtp } = useAuth();

  // Mode: 'login' | 'choose' | 'signup' | 'phoneOtp'
  const [mode, setMode] = useState('login');
  const [isPro, setIsPro] = useState(null); // null=choose, true=pro, false=particulier
  const [step, setStep] = useState(1); // 1=email/pwd, 2=info, 3=docs(pro)
  const [pendingValidation, setPendingValidation] = useState(false);

  // Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('FR');
  const [phoneCountry, setPhoneCountry] = useState('FR');

  // Phone OTP login fields
  const [otpPhone, setOtpPhone] = useState('');
  const [otpPhoneCountry, setOtpPhoneCountry] = useState('FR');
  const [otpCode, setOtpCode] = useState('');
  const [otpStage, setOtpStage] = useState('enter-phone'); // 'enter-phone' | 'enter-code'
  const [otpPhonePickerVisible, setOtpPhonePickerVisible] = useState(false);

  // Signup OTP — verifies the phone entered at step 2 before register.
  // `signupOtpStage`: null = not in OTP flow; 'verify' = code input shown.
  // `signupFirebaseUid` is passed to register() so backend links the new
  // account to the Firebase UID for seamless OTP login afterwards.
  const [signupOtpStage, setSignupOtpStage] = useState(null);
  const [signupOtpCode, setSignupOtpCode] = useState('');
  const [signupFirebaseUid, setSignupFirebaseUid] = useState('');
  const [signupPhoneE164, setSignupPhoneE164] = useState('');

  // Documents
  const [docIdFront, setDocIdFront] = useState(null);
  const [docIdBack, setDocIdBack] = useState(null);
  const [docIban, setDocIban] = useState(null);
  const [docKbiss, setDocKbiss] = useState(null);

  // Modals
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [phonePickerVisible, setPhonePickerVisible] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Rate limiting for login
  const loginFailsRef = useRef(0);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const cooldownTimerRef = useRef(null);

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
  const selectedPhoneCountry = COUNTRIES.find(c => c.code === phoneCountry) || COUNTRIES[0];
  const selectedOtpPhoneCountry = COUNTRIES.find(c => c.code === otpPhoneCountry) || COUNTRIES[0];

  // Firebase reCAPTCHA verifier for Expo. Mounted below in the phone OTP
  // flows (login + signup) so the ref is populated when the hook calls
  // signInWithPhoneNumber(). firebaseOptions loaded lazily from the init
  // singleton in services/otpauth/firebase.js.
  const recaptchaVerifier = useRef(null);
  const [firebaseOptions, setFirebaseOptions] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const app = await getFirebaseApp();
        if (app?.options) setFirebaseOptions(app.options);
      } catch (_) {}
    })();
  }, []);

  // OTP v2 phone login hook — `app-delivery` platform tag, user_type is
  // hardcoded to "delivery_driver" inside services/otpauth/otpV2Client.js.
  const {
    sendOtp: otpSendOtp,
    verifyOtp: otpVerifyOtp,
    reset: otpReset,
    loading: otpLoading,
    error: otpError,
    shouldFallback: otpShouldFallback,
  } = useOtpSender({ platform: 'app-delivery', recaptchaVerifier });

  const handleOtpSend = async () => {
    setError('');
    if (!otpPhone.trim()) {
      setError(t('errorNoPhone') || 'Veuillez saisir votre numéro de téléphone');
      return;
    }
    const fullPhone = `${selectedOtpPhoneCountry.phoneCode}${otpPhone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
    const ok = await otpSendOtp({ phone: fullPhone, channel: 'sms', defaultRegion: otpPhoneCountry });
    if (ok) {
      setOtpStage('enter-code');
      return;
    }
    if (otpShouldFallback) {
      setError(t('phoneOtpUnavailable') || 'Connexion par téléphone indisponible. Veuillez utiliser votre email.');
      setMode('login');
      return;
    }
    setError(otpError || t('phoneOtpSendFailed') || 'Impossible d\'envoyer le code. Réessayez.');
  };

  const handleOtpVerify = async () => {
    setError('');
    if (otpCode.length < 4) {
      setError(t('otpCodeTooShort') || 'Code trop court');
      return;
    }
    const result = await otpVerifyOtp({ code: otpCode });
    if (!result) {
      if (otpShouldFallback) {
        setError(t('phoneOtpUnavailable') || 'Connexion par téléphone indisponible. Veuillez utiliser votre email.');
        setMode('login');
      } else {
        setError(otpError || t('otpVerifyFailed') || 'Code invalide. Réessayez.');
      }
      return;
    }
    if (!result.userFound) {
      // Driver doesn't exist (or account_active=false). Redirect to signup.
      setError(t('driverNotFound') || 'Aucun compte livreur trouvé pour ce numéro. Veuillez vous inscrire.');
      const fullPhone = `${selectedOtpPhoneCountry.phoneCode}${otpPhone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
      setPhone(fullPhone.replace(selectedOtpPhoneCountry.phoneCode, ''));
      setPhoneCountry(otpPhoneCountry);
      setMode('choose');
      setOtpStage('enter-phone');
      setOtpCode('');
      return;
    }
    // Existing driver with active account → set session, auto-navigate.
    const ok = await loginWithOtp(result);
    if (!ok) {
      setError(t('otpLoginFailed') || 'Connexion impossible. Réessayez.');
    }
    // Success: AuthContext.setUser fires → App.js renders the Main tab navigator.
  };

  const handleOtpBack = () => {
    setError('');
    if (otpStage === 'enter-code') {
      otpReset();
      setOtpCode('');
      setOtpStage('enter-phone');
    } else {
      setMode('login');
      setOtpPhone('');
      otpReset();
    }
  };

  const pickDocument = async (setter) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.length > 0) setter(result.assets[0].uri);
  };

  // Back navigation
  const handleBack = () => {
    setError('');
    if (mode === 'login') return;
    if (mode === 'phoneOtp') { handleOtpBack(); return; }
    if (mode === 'signup' && signupOtpStage === 'verify') { handleSignupOtpBack(); return; }
    if (mode === 'choose') { setMode('login'); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 2) { setStep(1); return; }
    if (isPro !== null) { setIsPro(null); setMode('choose'); return; }
    setMode('login');
  };

  // Login with rate limiting and validation
  const handleLogin = () => {
    setError('');
    if (loginDisabled) {
      setError(t('loginCooldown') || 'Trop de tentatives. Veuillez patienter 30 secondes.');
      return;
    }
    if (!email.trim() && !password.trim()) { setError(t('errorBothEmpty') || 'Veuillez saisir votre email et mot de passe'); return; }
    if (!email.trim()) { setError(t('errorNoEmail') || 'Veuillez saisir votre email'); return; }
    if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return; }
    if (!password.trim()) { setError(t('errorNoPassword') || 'Veuillez saisir votre mot de passe'); return; }
    const result = login(email.trim(), password);
    if (result && typeof result === 'object' && result.locked) {
      setError(t('accountLocked') || 'Compte temporairement verrouill\u00e9. R\u00e9essayez dans quelques minutes.');
      return;
    }
    if (!result) {
      loginFailsRef.current += 1;
      if (loginFailsRef.current >= MAX_LOGIN_FAILS) {
        setLoginDisabled(true);
        setError(t('loginCooldown') || 'Trop de tentatives. Veuillez patienter 30 secondes.');
        cooldownTimerRef.current = setTimeout(() => {
          setLoginDisabled(false);
          loginFailsRef.current = 0;
        }, LOGIN_COOLDOWN_MS);
      } else {
        setError(t('loginErrorCredentials') || 'Email ou mot de passe incorrect');
      }
    }
  };

  // Signup
  const handleSignup = () => {
    setError('');
    // Step 1: email + password
    if (step === 1) {
      if (!email.trim() || !password.trim() || !confirmPwd.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return; }
      if (!isStrongPassword(password)) { setError(t('errorPasswordWeak') || 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre'); return; }
      if (password !== confirmPwd) { setError(t('errorPasswordMismatch') || 'Les mots de passe ne correspondent pas'); return; }
      setStep(2);
      return;
    }
    // Step 2: info — after validation, trigger phone OTP verification
    // before the account is created. firebase_uid from the successful
    // verify is then forwarded to register() so the backend can trust
    // the phone AND link this new account to the Firebase identity
    // for future OTP logins.
    if (step === 2) {
      if (!nom.trim() || !prenom.trim() || !phone.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      if (isPro && !companyName.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      // Kick off OTP send to the phone entered above
      handleSignupOtpSend();
      return;
    }
    // Step 3: documents (pro)
    if (!docIdFront || !docIdBack || !docIban || !docKbiss) { setError(t('errorDocsRequired') || "Carte d'identité, IBAN et KBISS sont obligatoires"); return; }
    setLoading(true);
    register({
      email: email.trim(), password,
      nom: nom.trim(), prenom: prenom.trim(), pseudo: pseudo.trim(),
      phone: signupPhoneE164 || phone.trim(),
      phoneCode: selectedPhoneCountry.phoneCode,
      country, companyName: companyName.trim(),
      role: 'professionaluser', isVerified: false,
      documents: { idFront: docIdFront, idBack: docIdBack, iban: docIban, kbiss: docKbiss },
      firebase_uid: signupFirebaseUid || undefined,
    });
    setLoading(false);
    setPendingValidation(true);
  };

  // Signup OTP — verifies the phone number the driver entered at step 2
  // BEFORE the account is created. On success we store firebase_uid and
  // pass it to the final register payload so the backend links the new
  // ProfessionalUser to the Firebase identity (enables OTP login later).
  const handleSignupOtpSend = async () => {
    setError('');
    const fullPhone = `${selectedPhoneCountry.phoneCode}${phone.trim().replace(/^0+/, '').replace(/\s+/g, '')}`;
    setLoading(true);
    const ok = await otpSendOtp({ phone: fullPhone, channel: 'sms', defaultRegion: phoneCountry });
    setLoading(false);
    if (ok) {
      setSignupOtpStage('verify');
      setSignupOtpCode('');
      return;
    }
    if (otpShouldFallback) {
      // OTP infrastructure unavailable (Firebase misconfigured OR backend
      // v2 disabled). Driver apps require verified phone — silently
      // skipping verification would let anyone register with an arbitrary
      // number (identity-fraud vector for a delivery platform). Block
      // the flow with a clear message; the driver can retry later when
      // the provider is restored. This surfaces outages instead of
      // swallowing them.
      console.warn('[signup] OTP unavailable — blocking signup until phone verification works');
      setError(
        t('phoneOtpUnavailableSignup') ||
        'Vérification du numéro indisponible pour le moment. Merci de réessayer dans quelques minutes.'
      );
      return;
    }
    setError(otpError || t('phoneOtpSendFailed') || 'Impossible d\'envoyer le code. Réessayez.');
  };

  const handleSignupOtpVerify = async () => {
    setError('');
    if (signupOtpCode.length < 4) {
      setError(t('otpCodeTooShort') || 'Code trop court');
      return;
    }
    setLoading(true);
    const result = await otpVerifyOtp({ code: signupOtpCode });
    setLoading(false);
    if (!result) {
      setError(otpError || t('otpVerifyFailed') || 'Code invalide. Réessayez.');
      return;
    }
    // result.userFound will usually be false here (it's signup!), which
    // is expected — backend returns success:true + firebase_uid anyway.
    setSignupFirebaseUid(result.firebaseUid || '');
    setSignupPhoneE164(result.phoneE164 || '');
    setSignupOtpStage(null);
    setSignupOtpCode('');
    otpReset();
    // Now proceed with the original step-2 flow
    proceedSignupWithoutOtp();
  };

  const proceedSignupWithoutOtp = () => {
    if (isPro) {
      setStep(3);
      return;
    }
    // Particulier: register directly
    setLoading(true);
    const success = register({
      email: email.trim(), password,
      nom: nom.trim(), prenom: prenom.trim(), pseudo: pseudo.trim(),
      phone: signupPhoneE164 || phone.trim(),
      phoneCode: selectedPhoneCountry.phoneCode,
      country, role: 'user',
      firebase_uid: signupFirebaseUid || undefined,
    });
    setLoading(false);
    if (success) return;
    setError(t('errorEmailExists') || 'Un compte avec cet email existe déjà');
  };

  const handleSignupOtpBack = () => {
    setError('');
    otpReset();
    setSignupOtpCode('');
    setSignupOtpStage(null);
    // Stay on step 2 so user can edit phone and retry
  };

  // Pending validation page
  if (pendingValidation) {
    return (
      <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
        <ScrollView contentContainerStyle={{flexGrow:1, justifyContent:'center', paddingHorizontal:32}}>
          <View style={{alignItems:'center'}}>
            <View style={{width:80, height:80, borderRadius:40, backgroundColor:'#FEF3C7', alignItems:'center', justifyContent:'center', marginBottom:24}}>
              <Ionicons name="time-outline" size={40} color="#F59E0B" />
            </View>
            <Text style={{fontSize:24, fontWeight:'900', color:'#111', textAlign:'center', marginBottom:12}}>
              {t('pendingTitle') || 'En attente de validation'}
            </Text>
            <Text style={{fontSize:15, color:'#6B7280', textAlign:'center', lineHeight:22, marginBottom:24}}>
              {t('pendingMsg') || 'Vos documents sont en cours de vérification. Vous recevrez un email une fois approuvé.'}
            </Text>
            <View style={{backgroundColor:'#F9FAFB', borderRadius:12, padding:16, width:'100%', marginBottom:24}}>
              {[
                { icon: 'mail-outline', text: t('pendingEmail') || 'Un email de confirmation vous sera envoyé' },
                { icon: 'shield-checkmark-outline', text: t('pendingReview') || 'Vérification sous 24-48h ouvrées' },
                { icon: 'notifications-outline', text: t('pendingNotif') || 'Vous serez notifié du résultat' },
              ].map((item, i) => (
                <View key={i} style={{flexDirection:'row', alignItems:'center', marginBottom: i < 2 ? 12 : 0}}>
                  <Ionicons name={item.icon} size={20} color={BRAND} style={{marginRight:10}} />
                  <Text style={{fontSize:14, color:'#374151'}}>{item.text}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => { setPendingValidation(false); setMode('login'); setIsPro(null); setStep(1); setError(''); }}
              style={{height:52, borderRadius:14, backgroundColor:BRAND, alignItems:'center', justifyContent:'center', width:'100%'}}>
              <Text style={{color:'#fff', fontWeight:'700', fontSize:16}}>{t('pendingBackLogin') || 'Retour à la connexion'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const isSignup = mode === 'signup' || mode === 'choose';

  // Forgot-password flow renders its own self-contained screen (email → code +
  // new password → done). Wires authService.forgotPassword / resetPassword.
  if (mode === 'forgot') {
    return <ForgotPasswordScreen onBack={() => { setMode('login'); setError(''); }} />;
  }

  return (
    <KeyboardAvoidingView style={{flex:1, backgroundColor:'#fff'}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{flex:1}}>
        {/* Firebase invisible reCAPTCHA (Expo requirement). Must be mounted
            BEFORE sendOtp() is called so the ref is populated. Safe to keep
            mounted at all times — it's invisible until Firebase triggers it. */}
        {firebaseOptions && (
          <FirebaseRecaptchaVerifierModal
            ref={recaptchaVerifier}
            firebaseConfig={firebaseOptions}
            attemptInvisibleVerification={true}
          />
        )}
        {/* Back arrow */}
        {(mode !== 'login') && (
          <TouchableOpacity onPress={handleBack} style={{paddingHorizontal:16, paddingTop:12}}>
            <Ionicons name="arrow-back" size={26} color="#111" />
          </TouchableOpacity>
        )}

        {/* Logo — fixed top */}
        {(mode === 'login' || mode === 'choose' || mode === 'phoneOtp' || (mode === 'signup' && step === 1)) && (
          <View style={{alignItems:'center', paddingTop:16, paddingBottom:8}}>
            <Ionicons name="bicycle" size={50} color={BRAND} style={{marginBottom:6}} />
            <Text style={{fontSize:24, fontWeight:'900', color:'#111'}}>Pearl Delivery</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{flexGrow:1, justifyContent:'center', paddingHorizontal:24, paddingVertical:20}} keyboardShouldPersistTaps="handled">

          {/* Step title on form pages */}
          {mode === 'signup' && isPro !== null && (
            <Text style={{fontSize:18, fontWeight:'800', color:'#111', marginBottom:16}}>
              {step === 1 ? (t('stepEmail') || 'Identifiants') : step === 2 ? (t('stepInfo') || 'Informations') : (t('stepDocs') || 'Documents')}
            </Text>
          )}

          {/* Error */}
          {error ? (
            <View style={{backgroundColor:'#FEE2E2', borderRadius:10, padding:12, marginBottom:16, flexDirection:'row', alignItems:'center'}}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={{color:'#EF4444', fontSize:13, marginLeft:8, flex:1}}>{error}</Text>
            </View>
          ) : null}

          {/* === LOGIN === */}
          {mode === 'login' && (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder={t('loginEmail') || 'email@exemple.com'} placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, {flex:1, marginBottom:0}]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <TouchableOpacity onPress={() => { setMode('forgot'); setError(''); }} style={{alignSelf:'flex-end', paddingTop:6, paddingHorizontal:4}}>
                <Text style={{color:BRAND, fontSize:13, fontWeight:'600'}}>{t('forgotPasswordLink')}</Text>
              </TouchableOpacity>
              <Pressable style={[s.btn, loginDisabled && { opacity: 0.5 }]} onPress={handleLogin} disabled={loginDisabled}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('loginButton') || 'Se connecter'}</Text>}
              </Pressable>
              {/* Phone OTP login entry */}
              <TouchableOpacity onPress={() => { setMode('phoneOtp'); setOtpStage('enter-phone'); setOtpCode(''); setError(''); otpReset(); }} style={{alignItems:'center', paddingVertical:12}}>
                <Text style={{color:BRAND, fontSize:14, fontWeight:'700', textDecorationLine:'underline'}}>
                  {t('loginWithPhone') || 'Se connecter avec un numéro de téléphone'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setMode('choose'); setError(''); }} style={{alignItems:'center', paddingVertical:16}}>
                <Text style={{color:'#6B7280', fontSize:15}}>
                  {t('noAccount') || 'Pas de compte ?'} <Text style={{color:BRAND, fontWeight:'800'}}>{t('signUp') || "S'inscrire"}</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* === PHONE OTP LOGIN === */}
          {mode === 'phoneOtp' && (
            <>
              {otpStage === 'enter-phone' ? (
                <>
                  <Text style={{fontSize:18, fontWeight:'800', color:'#111', marginBottom:8, textAlign:'center'}}>
                    {t('phoneOtpTitle') || 'Connexion par téléphone'}
                  </Text>
                  <Text style={{fontSize:13, color:'#6B7280', textAlign:'center', marginBottom:20}}>
                    {t('phoneOtpSubtitle') || 'Vous recevrez un code de vérification par SMS.'}
                  </Text>
                  <Text style={s.label}>{t('phoneLabel') || 'Numéro de téléphone'}</Text>
                  <View style={{flexDirection:'row', marginBottom:4}}>
                    <TouchableOpacity onPress={() => setOtpPhonePickerVisible(true)} style={[s.input, {flexDirection:'row', alignItems:'center', marginRight:8, flex:0}]}>
                      <Text style={{fontSize:16, marginRight:6}}>{selectedOtpPhoneCountry.flag}</Text>
                      <Text style={{fontSize:14, fontWeight:'600', color:'#111'}}>{selectedOtpPhoneCountry.phoneCode}</Text>
                      <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{marginLeft:4}} />
                    </TouchableOpacity>
                    <TextInput style={[s.input, {flex:1}]} value={otpPhone} onChangeText={setOtpPhone} placeholder="6 12 34 56 78" placeholderTextColor="#aaa" keyboardType="phone-pad" />
                  </View>
                  <Pressable style={[s.btn, (!otpPhone.trim() || otpLoading) && { opacity: 0.5 }]} onPress={handleOtpSend} disabled={!otpPhone.trim() || otpLoading}>
                    {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('sendCode') || 'Envoyer le code'}</Text>}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{fontSize:18, fontWeight:'800', color:'#111', marginBottom:8, textAlign:'center'}}>
                    {t('otpVerifyTitle') || 'Entrez le code'}
                  </Text>
                  <Text style={{fontSize:13, color:'#6B7280', textAlign:'center', marginBottom:20}}>
                    {t('otpSentTo') || 'Code envoyé au'} <Text style={{fontWeight:'700', color:'#111'}}>{selectedOtpPhoneCountry.phoneCode} {otpPhone.trim()}</Text>
                  </Text>
                  <Text style={s.label}>{t('otpCodeLabel') || 'Code de vérification'}</Text>
                  <TextInput
                    style={[s.input, {fontSize:22, letterSpacing:8, textAlign:'center'}]}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="123456"
                    placeholderTextColor="#aaa"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Pressable style={[s.btn, (otpCode.length < 4 || otpLoading) && { opacity: 0.5 }]} onPress={handleOtpVerify} disabled={otpCode.length < 4 || otpLoading}>
                    {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyCode') || 'Vérifier'}</Text>}
                  </Pressable>
                  <TouchableOpacity onPress={handleOtpBack} style={{alignItems:'center', paddingVertical:12}}>
                    <Text style={{color:BRAND, fontSize:14, fontWeight:'600', textDecorationLine:'underline'}}>
                      {t('changeNumber') || 'Changer de numéro'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* === CHOOSE TYPE === */}
          {mode === 'choose' && (
            <>
              {[
                { pro: true, icon: 'storefront', label: t('proPro') || 'Livreur Pro', desc: t('proProDesc') || 'Vous avez un établissement ou un statut professionnel' },
                { pro: false, icon: 'bicycle', label: t('driverParticulier') || 'Livreur Particulier', desc: t('driverParticulierDesc') || 'Vous souhaitez livrer en complément de revenu' },
              ].map((opt, i) => (
                <TouchableOpacity key={i} onPress={() => { setIsPro(opt.pro); setMode('signup'); setStep(1); setError(''); }} style={{
                  borderWidth:2, borderColor:BRAND, borderRadius:16, padding:20, marginBottom:12,
                  backgroundColor:'#F0FDF4', flexDirection:'row', alignItems:'center'
                }}>
                  <View style={{width:50, height:50, borderRadius:25, backgroundColor:BRAND, alignItems:'center', justifyContent:'center', marginRight:16}}>
                    <Ionicons name={opt.icon} size={26} color="#fff" />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{fontSize:17, fontWeight:'800', color:'#111'}}>{opt.label}</Text>
                    <Text style={{fontSize:13, color:'#6B7280', marginTop:4}}>{opt.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={BRAND} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* === SIGNUP STEP 1: Email + Password === */}
          {mode === 'signup' && step === 1 && (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, {flex:1, marginBottom:0}]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Text style={s.label}>{t('confirmPassword') || 'Confirmer le mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, {flex:1, marginBottom:0}]} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showConfirmPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowConfirmPwd(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showConfirmPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Pressable style={s.btn} onPress={handleSignup}>
                <Text style={s.btnTxt}>{t('next') || 'Suivant'}</Text>
              </Pressable>
            </>
          )}

          {/* === SIGNUP STEP 2: Info (or phone OTP verify) === */}
          {mode === 'signup' && step === 2 && signupOtpStage !== 'verify' && (
            <>
              <Text style={s.label}>{t('driverLastName') || 'Nom du livreur'}</Text>
              <TextInput style={s.input} value={nom} onChangeText={setNom} placeholder="Dupont" placeholderTextColor="#aaa" />
              <Text style={s.label}>{t('driverFirstName') || 'Prénom du livreur'}</Text>
              <TextInput style={s.input} value={prenom} onChangeText={setPrenom} placeholder="Jean" placeholderTextColor="#aaa" />
              {isPro && (
                <>
                  <Text style={s.label}>{t('companyName') || "Nom de l'établissement"}</Text>
                  <TextInput style={s.input} value={companyName} onChangeText={setCompanyName} placeholder="Ma Boutique" placeholderTextColor="#aaa" />
                </>
              )}
              <Text style={s.label}>{t('countryLabel') || 'Pays de résidence'}</Text>
              <TouchableOpacity onPress={() => setCountryPickerVisible(true)} style={[s.input, {flexDirection:'row', alignItems:'center'}]}>
                <Text style={{fontSize:20, marginRight:10}}>{selectedCountry.flag}</Text>
                <Text style={{flex:1, fontSize:15, color:'#111', fontWeight:'600'}}>{selectedCountry.name}</Text>
                <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={s.label}>{t('phoneLabel') || 'Numéro de téléphone'}</Text>
              <View style={{flexDirection:'row', marginBottom:4}}>
                <TouchableOpacity onPress={() => setPhonePickerVisible(true)} style={[s.input, {flexDirection:'row', alignItems:'center', marginRight:8, flex:0}]}>
                  <Text style={{fontSize:16, marginRight:6}}>{selectedPhoneCountry.flag}</Text>
                  <Text style={{fontSize:14, fontWeight:'600', color:'#111'}}>{selectedPhoneCountry.phoneCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{marginLeft:4}} />
                </TouchableOpacity>
                <TextInput style={[s.input, {flex:1}]} value={phone} onChangeText={setPhone} placeholder="6 12 34 56 78" placeholderTextColor="#aaa" keyboardType="phone-pad" />
              </View>
              <Text style={{fontSize:12, color:'#6B7280', marginBottom:8, fontStyle:'italic'}}>
                {t('signupOtpHint') || 'Un code de vérification vous sera envoyé par SMS.'}
              </Text>
              <Pressable style={[s.btn, (loading || otpLoading) && { opacity: 0.5 }]} onPress={handleSignup} disabled={loading || otpLoading}>
                {(loading || otpLoading) ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyAndContinue') || 'Vérifier le numéro'}</Text>}
              </Pressable>
            </>
          )}

          {/* === SIGNUP STEP 2 — OTP CODE VERIFY === */}
          {mode === 'signup' && step === 2 && signupOtpStage === 'verify' && (
            <>
              <View style={{alignItems:'center', marginBottom:20}}>
                <Ionicons name="shield-checkmark" size={40} color={BRAND} />
                <Text style={{fontSize:18, fontWeight:'800', color:'#111', marginTop:12, textAlign:'center'}}>
                  {t('signupVerifyTitle') || 'Vérifier votre numéro'}
                </Text>
                <Text style={{fontSize:13, color:'#6B7280', textAlign:'center', marginTop:8}}>
                  {t('otpSentTo') || 'Code envoyé au'} <Text style={{fontWeight:'700', color:'#111'}}>{selectedPhoneCountry.phoneCode} {phone.trim()}</Text>
                </Text>
              </View>
              <Text style={s.label}>{t('otpCodeLabel') || 'Code de vérification'}</Text>
              <TextInput
                style={[s.input, {fontSize:22, letterSpacing:8, textAlign:'center'}]}
                value={signupOtpCode}
                onChangeText={setSignupOtpCode}
                placeholder="123456"
                placeholderTextColor="#aaa"
                keyboardType="number-pad"
                maxLength={6}
              />
              <Pressable style={[s.btn, (signupOtpCode.length < 4 || otpLoading || loading) && { opacity: 0.5 }]} onPress={handleSignupOtpVerify} disabled={signupOtpCode.length < 4 || otpLoading || loading}>
                {(otpLoading || loading) ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('verifyCode') || 'Vérifier'}</Text>}
              </Pressable>
              <TouchableOpacity onPress={handleSignupOtpBack} style={{alignItems:'center', paddingVertical:12}}>
                <Text style={{color:BRAND, fontSize:14, fontWeight:'600', textDecorationLine:'underline'}}>
                  {t('changeNumber') || 'Changer de numéro'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* === SIGNUP STEP 3: Documents (Pro) === */}
          {mode === 'signup' && step === 3 && (
            <>
              {[
                { label: t('docIdFront') || "Carte d'identité (recto)", value: docIdFront, setter: setDocIdFront, icon: 'card-outline' },
                { label: t('docIdBack') || "Carte d'identité (verso)", value: docIdBack, setter: setDocIdBack, icon: 'card-outline' },
                { label: t('docIban') || 'IBAN / RIB', value: docIban, setter: setDocIban, icon: 'wallet-outline' },
                { label: t('docKbiss') || 'KBISS', value: docKbiss, setter: setDocKbiss, icon: 'document-text-outline' },
              ].map((doc, i) => (
                <TouchableOpacity key={i} onPress={() => pickDocument(doc.setter)} style={{
                  flexDirection:'row', alignItems:'center', padding:14, borderWidth:1,
                  borderColor: doc.value ? BRAND : '#E5E7EB', borderRadius:12, marginBottom:10,
                  backgroundColor: doc.value ? '#F0FDF4' : '#fff'
                }}>
                  <Ionicons name={doc.value ? 'checkmark-circle' : doc.icon} size={22} color={doc.value ? BRAND : '#9CA3AF'} style={{marginRight:12}} />
                  <View style={{flex:1}}>
                    <Text style={{fontSize:14, fontWeight:'600', color:'#111'}}>{doc.label} *</Text>
                    <Text style={{fontSize:11, color: doc.value ? BRAND : '#9CA3AF', marginTop:2}}>{doc.value ? (t('docUploaded') || 'Document ajouté') : (t('docTapUpload') || 'Appuyez pour ajouter')}</Text>
                  </View>
                  {doc.value && (
                    <TouchableOpacity onPress={() => doc.setter(null)} style={{padding:4}}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
              <Pressable style={s.btn} onPress={handleSignup}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('submitApplication') || 'Envoyer la demande'}</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>

        {/* Already have account — fixed above language on choose page */}
        {mode === 'choose' && (
          <TouchableOpacity onPress={() => { setMode('login'); setError(''); }} style={{alignItems:'center', paddingVertical:12}}>
            <Text style={{color:'#6B7280', fontSize:15}}>
              {t('hasAccount') || 'Déjà un compte Pearl Delivery ?'} <Text style={{color:BRAND, fontWeight:'800'}}>{t('loginButton') || 'Se connecter'}</Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* Language button — fixed bottom */}
        <TouchableOpacity onPress={() => setLangPickerVisible(true)} style={{
          flexDirection:'row', alignItems:'center', justifyContent:'center',
          marginHorizontal:24, marginBottom:12, paddingVertical:12, borderRadius:12, backgroundColor:'#fff'
        }}>
          <Ionicons name="globe-outline" size={18} color="#6B7280" style={{marginRight:8}} />
          <Text style={{fontSize:14, fontWeight:'600', color:'#374151'}}>
            {LANGUAGES.find(l => l.code === lang)?.flag || '🌐'} {LANGUAGES.find(l => l.code === lang)?.native || 'Language'}
          </Text>
        </TouchableOpacity>

        {/* iOS hide suggestions */}
        {Platform.OS === 'ios' && <InputAccessoryView nativeID="noSuggest"><View /></InputAccessoryView>}

        {/* Country Picker */}
        <Modal visible={countryPickerVisible} animationType="none" transparent>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'70%', paddingBottom:40}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}>
                <Text style={{fontSize:18, fontWeight:'800', color:'#111'}}>{t('countryLabel') || 'Pays de résidence'}</Text>
                <TouchableOpacity onPress={() => setCountryPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code} contentContainerStyle={{paddingHorizontal:16}} renderItem={({item: c}) => (
                <TouchableOpacity onPress={() => { setCountry(c.code); setPhoneCountry(c.code); setCountryPickerVisible(false); }} style={{flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', backgroundColor: country === c.code ? '#F0FDF4' : '#fff'}}>
                  <Text style={{fontSize:24, marginRight:14}}>{c.flag}</Text>
                  <Text style={{flex:1, fontSize:16, fontWeight: country === c.code ? '700' : '500', color: country === c.code ? BRAND : '#111'}}>{c.name}</Text>
                  {country === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Phone Code Picker */}
        <Modal visible={phonePickerVisible} animationType="none" transparent>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'70%', paddingBottom:40}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}>
                <Text style={{fontSize:18, fontWeight:'800', color:'#111'}}>{t('phoneCodeLabel') || 'Indicatif téléphonique'}</Text>
                <TouchableOpacity onPress={() => setPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_p'} contentContainerStyle={{paddingHorizontal:16}} renderItem={({item: c}) => (
                <TouchableOpacity onPress={() => { setPhoneCountry(c.code); setPhonePickerVisible(false); }} style={{flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', backgroundColor: phoneCountry === c.code ? '#F0FDF4' : '#fff'}}>
                  <Text style={{fontSize:24, marginRight:14}}>{c.flag}</Text>
                  <Text style={{flex:1, fontSize:16, fontWeight: phoneCountry === c.code ? '700' : '500', color: phoneCountry === c.code ? BRAND : '#111'}}>{c.name}</Text>
                  <Text style={{fontSize:14, fontWeight:'700', color:'#374151'}}>{c.phoneCode}</Text>
                  {phoneCountry === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} style={{marginLeft:8}} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* OTP Phone Code Picker */}
        <Modal visible={otpPhonePickerVisible} animationType="none" transparent>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'70%', paddingBottom:40}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}>
                <Text style={{fontSize:18, fontWeight:'800', color:'#111'}}>{t('phoneCodeLabel') || 'Indicatif téléphonique'}</Text>
                <TouchableOpacity onPress={() => setOtpPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_otp'} contentContainerStyle={{paddingHorizontal:16}} renderItem={({item: c}) => (
                <TouchableOpacity onPress={() => { setOtpPhoneCountry(c.code); setOtpPhonePickerVisible(false); }} style={{flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', backgroundColor: otpPhoneCountry === c.code ? '#F0FDF4' : '#fff'}}>
                  <Text style={{fontSize:24, marginRight:14}}>{c.flag}</Text>
                  <Text style={{flex:1, fontSize:16, fontWeight: otpPhoneCountry === c.code ? '700' : '500', color: otpPhoneCountry === c.code ? BRAND : '#111'}}>{c.name}</Text>
                  <Text style={{fontSize:14, fontWeight:'700', color:'#374151'}}>{c.phoneCode}</Text>
                  {otpPhoneCountry === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} style={{marginLeft:8}} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Language Picker */}
        <Modal visible={langPickerVisible} animationType="none" transparent>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'60%', paddingBottom:40}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}>
                <Text style={{fontSize:18, fontWeight:'800', color:'#111'}}>{t('languageLabel') || 'Langue'}</Text>
                <TouchableOpacity onPress={() => setLangPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={LANGUAGES} keyExtractor={l => l.code} contentContainerStyle={{paddingHorizontal:16}} renderItem={({item: l}) => (
                <TouchableOpacity onPress={() => { setLang(l.code); setLangPickerVisible(false); }} style={{flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', backgroundColor: lang === l.code ? '#F0FDF4' : '#fff'}}>
                  <Text style={{fontSize:24, marginRight:14}}>{l.flag}</Text>
                  <Text style={{flex:1, fontSize:16, fontWeight: lang === l.code ? '700' : '500', color: lang === l.code ? BRAND : '#111'}}>{l.native}</Text>
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
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4,
  },
  pwdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eyeBtn: { position: 'absolute', right: 12, padding: 4 },
  btn: {
    backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
