import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, FlatList, SafeAreaView, ActivityIndicator, InputAccessoryView, BackHandler, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isValidEmail, sanitizeInput, isStrongPassword } from '../utils/validation';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { uploadService } from '../services/uploadService';
import useSecureScreen from '../hooks/useSecureScreen';
import { noterBrouillonConnexion, lireBrouillonConnexion } from '../utils/repliEcran';

import { countryName } from '../data/countryNames';
import { authService } from '../services/authService';
import { CONTRAT_STRIPE, creerJetonCompte, dateIso, dateValide, formaterDate } from '../utils/stripeCompte';

const BRAND = '#00C29B';
const MAX_LOGIN_FAILS = 3;
const LOGIN_COOLDOWN_MS = 30000; // 30s cooldown after 3 fails

// Pliage / depliage : l'ecran est demonte puis remonte. Sans rechargement du
// JS (activite Android recreee), la saisie reste ici ; avec rechargement,
// utils/repliEcran.js la sauve avant et la rend au demarrage.
const VALIDITE_BROUILLON = 60 * 1000;
let brouillonMemoire = null;

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

// National phone format per country: len = national digit count, groups = spacing.
const PHONE_FMT = {
  FR:{len:9,groups:[1,2,2,2,2]}, BE:{len:9,groups:[3,2,2,2]}, GB:{len:10,groups:[4,3,3]},
  DE:{len:11,groups:[4,7]}, IT:{len:10,groups:[3,3,4]}, ES:{len:9,groups:[3,3,3]},
  PT:{len:9,groups:[3,3,3]}, NL:{len:9,groups:[1,4,4]}, CH:{len:9,groups:[2,3,2,2]},
  LU:{len:9,groups:[3,2,2,2]}, AT:{len:10,groups:[3,3,4]}, IE:{len:9,groups:[2,3,4]},
  SE:{len:9,groups:[2,3,2,2]}, DK:{len:8,groups:[2,2,2,2]}, NO:{len:8,groups:[3,2,3]},
  FI:{len:9,groups:[2,3,4]}, PL:{len:9,groups:[3,3,3]}, MA:{len:9,groups:[3,3,3]},
  TN:{len:8,groups:[2,3,3]}, DZ:{len:9,groups:[3,2,2,2]}, SN:{len:9,groups:[2,3,2,2]},
  CI:{len:10,groups:[2,2,2,2,2]}, CM:{len:9,groups:[3,3,3]}, CD:{len:9,groups:[3,3,3]},
  EG:{len:10,groups:[3,3,4]}, LB:{len:8,groups:[2,3,3]}, AE:{len:9,groups:[2,3,4]},
  SA:{len:9,groups:[2,3,4]}, TR:{len:10,groups:[3,3,4]}, US:{len:10,groups:[3,3,4]},
  CA:{len:10,groups:[3,3,4]}, MX:{len:10,groups:[2,4,4]}, BR:{len:11,groups:[2,5,4]},
  AU:{len:9,groups:[3,3,3]}, JP:{len:10,groups:[2,4,4]}, IN:{len:10,groups:[5,5]},
  RU:{len:10,groups:[3,3,2,2]}, ZA:{len:9,groups:[2,3,4]}, NG:{len:10,groups:[3,3,4]},
  KE:{len:9,groups:[3,3,3]}, GP:{len:9,groups:[3,2,2,2]}, MQ:{len:9,groups:[3,2,2,2]},
  RE:{len:9,groups:[3,2,2,2]}, GF:{len:9,groups:[3,2,2,2]}, HT:{len:8,groups:[2,2,2,2]},
};
const DEFAULT_PHONE_FMT = { len: 10, groups: [3, 3, 4] };
const phoneFmtFor = (code) => PHONE_FMT[code] || DEFAULT_PHONE_FMT;

// Véhicules proposés à l'inscription — valeurs backend bicycle/car/walk
// (mêmes que l'écran Vehicle du profil ; miroir de SIGNUP_VEHICLE_CHOICES côté
// backend, qui refuse toute autre valeur).
const SIGNUP_VEHICLES = [
  { id: 'bicycle', icon: 'bicycle', labelKey: 'bike' },
  { id: 'car', icon: 'car-outline', labelKey: 'car' },
  { id: 'walk', icon: 'walk-outline', labelKey: 'walk' },
];

// Véhicules qui exigent un permis de conduire. Miroir de
// VEHICLES_REQUIRING_LICENSE côté backend (DeliveryApp/registration_constants.py),
// qui refuse le dossier si le permis manque.
const VEHICLES_REQUIRING_LICENSE = new Set(['car']);

// Group raw digits with spaces following the selected country's pattern.
function formatPhone(value, fmt) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, fmt.len);
  const parts = [];
  let i = 0;
  for (const g of fmt.groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  if (i < digits.length) parts.push(digits.slice(i));
  return parts.join(' ');
}

// Placeholder showing the country shape, e.g. FR -> "6 12 34 56 78".
function phonePlaceholder(fmt) {
  return formatPhone('6123456789012345'.slice(0, fmt.len), fmt);
}

export default function LoginScreen() {
  // ⛔ Le SafeAreaView importe de 'react-native' ne fait RIEN sur Android : la
  // fleche de retour se superposait a l'heure de la barre de statut (constate
  // sur emulateur Android 15 le 10/09/2026, apres le passage en targetSdk 36 ou
  // l'edge-to-edge devient obligatoire). On lit donc l'inset reel, comme le
  // reste du projet (cf. VehicleScreen).
  const insets = useSafeAreaInsets();
  // Mot de passe, pièces d'identité, permis et justificatif IBAN de l'inscription.
  useSecureScreen('Login');
  const { t, lang, setLang, LANGUAGES } = useLanguage();
  const { login, register } = useAuth();

  // Mode: 'login' | 'choose' | 'signup'
  const [mode, setMode] = useState('login');
  const [isPro, setIsPro] = useState(null); // null=choose, true=pro, false=particulier
  const [step, setStep] = useState(1); // 1=email/pwd, 2=tout le reste sur une page
  const [pendingValidation, setPendingValidation] = useState(false);

  // Fields (connexion : etats a part, la saisie de l'inscription n'y passe pas)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
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
  const [address, setAddress] = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [addrSearching, setAddrSearching] = useState(false);
  const addrDebounceRef = useRef(null);
  const [country, setCountry] = useState('FR');
  const [phoneCountry, setPhoneCountry] = useState('FR');
  // Véhicule choisi à l'inscription (valeurs backend : bicycle/car/walk).
  const [vehicle, setVehicle] = useState('bicycle');
  // Inscription en une page (26/10/2026) : statut, déclaration des revenus
  // et compte de virement Stripe.
  const [proStatus, setProStatus] = useState('auto_entrepreneur'); // pro : auto_entrepreneur | societe
  const [dob, setDob] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [taxId, setTaxId] = useState('');
  const [siret, setSiret] = useState('');
  // Fiche du registre lue depuis le SIRET (France) : remplit le nom,
  // l'adresse, le code postal et la ville. null | 'recherche' | 'ok' | 'introuvable' | 'ferme'
  const [siretEtat, setSiretEtat] = useState(null);
  const [siretNom, setSiretNom] = useState('');
  // Dernier SIRET déjà recopié : une nouvelle lecture du même numéro ne
  // réécrase pas ce que le pro a corrigé à la main.
  const siretRecopieRef = useRef('');
  const [iban, setIban] = useState('');
  const [stripeAccepte, setStripeAccepte] = useState(false);
  const [stripeInfo, setStripeInfo] = useState(null); // { publishable_key, country, stripe_form }

  // Documents
  const [docIdFront, setDocIdFront] = useState(null);
  const [docIdBack, setDocIdBack] = useState(null);
  const [docIban, setDocIban] = useState(null);
  const [docKbiss, setDocKbiss] = useState(null);
  const [docLicense, setDocLicense] = useState(null);
  const [docPhoto, setDocPhoto] = useState(null);
  const [docProofAddress, setDocProofAddress] = useState(null);
  const [docRcPro, setDocRcPro] = useState(null);
  const [docUrssaf, setDocUrssaf] = useState(null);

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

  // Saisie complete, pour la retrouver apres un pliage ou un depliage.
  const brouillonRef = useRef(null);
  brouillonRef.current = {
    mode, isPro, step, loginEmail, loginPassword, email, password, confirmPwd,
    nom, prenom, pseudo, companyName, phone, address, country, phoneCountry, vehicle,
    proStatus, dob, postalCode, city, taxId, siret, iban, stripeAccepte,
    docIdFront, docIdBack, docIban, docKbiss, docLicense, docPhoto, docProofAddress, docRcPro, docUrssaf,
  };
  // Connecte ou dossier envoye : rien a garder.
  const termineRef = useRef(false);

  useEffect(() => {
    const appliquer = (b) => {
      if (!b) return;
      const fixe = (v, set) => { if (v !== undefined) set(v); };
      // Ancienne étape 3 (documents) : désormais sur la page 2.
      fixe(b.mode, setMode); fixe(b.isPro, setIsPro); fixe(b.step === 3 ? 2 : b.step, setStep);
      fixe(b.loginEmail, setLoginEmail); fixe(b.loginPassword, setLoginPassword);
      fixe(b.email, setEmail); fixe(b.password, setPassword); fixe(b.confirmPwd, setConfirmPwd);
      fixe(b.nom, setNom); fixe(b.prenom, setPrenom); fixe(b.pseudo, setPseudo);
      fixe(b.companyName, setCompanyName); fixe(b.phone, setPhone); fixe(b.address, setAddress);
      fixe(b.country, setCountry); fixe(b.phoneCountry, setPhoneCountry); fixe(b.vehicle, setVehicle);
      fixe(b.proStatus, setProStatus); fixe(b.dob, setDob); fixe(b.postalCode, setPostalCode);
      fixe(b.city, setCity); fixe(b.taxId, setTaxId); fixe(b.siret, setSiret);
      fixe(b.iban, setIban); fixe(b.stripeAccepte, setStripeAccepte);
      fixe(b.docIdFront, setDocIdFront); fixe(b.docIdBack, setDocIdBack); fixe(b.docIban, setDocIban);
      fixe(b.docKbiss, setDocKbiss); fixe(b.docLicense, setDocLicense); fixe(b.docPhoto, setDocPhoto);
      fixe(b.docProofAddress, setDocProofAddress); fixe(b.docRcPro, setDocRcPro); fixe(b.docUrssaf, setDocUrssaf);
    };
    const memoire = brouillonMemoire;
    brouillonMemoire = null;
    if (memoire && Date.now() - memoire.demonte < VALIDITE_BROUILLON) {
      appliquer(memoire.brouillon);
    } else {
      lireBrouillonConnexion().then(appliquer).catch(() => {});
    }
    const retirer = noterBrouillonConnexion(() => (termineRef.current ? null : brouillonRef.current));
    return () => {
      retirer();
      brouillonMemoire = termineRef.current ? null : { brouillon: brouillonRef.current, demonte: Date.now() };
    };
  }, []);

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
  const selectedPhoneCountry = COUNTRIES.find(c => c.code === phoneCountry) || COUNTRIES[0];
  const phoneFmt = phoneFmtFor(phoneCountry);
  const legalStatus = isPro ? proStatus : 'particulier';

  // Page 2 : le pays de résidence dit si le compte de virement Stripe est
  // créé dès l'inscription (société : plus tard, depuis le profil).
  useEffect(() => {
    if (mode !== 'signup' || step !== 2) return undefined;
    let actif = true;
    authService.getStripeInscription(country)
      .then((d) => { if (actif) setStripeInfo(d && d.publishable_key ? d : null); })
      .catch(() => { if (actif) setStripeInfo(null); });
    return () => { actif = false; };
  }, [mode, step, country]);
  const stripeActif = !!stripeInfo?.stripe_form && legalStatus !== 'societe';

  // SIRET complet (France) : la fiche du registre public remplit le nom,
  // l'adresse, le code postal et la ville, toujours modifiables. Registre
  // muet ou en panne : rien n'est bloqué, le pro saisit à la main.
  const siretChiffres = siret.replace(/\D/g, '');
  useEffect(() => {
    if (mode !== 'signup' || step !== 2 || !isPro || country !== 'FR' || siretChiffres.length !== 14) {
      setSiretEtat(null);
      return undefined;
    }
    let actif = true;
    setSiretEtat('recherche');
    authService.verifierSiret(siretChiffres)
      .then((r) => {
        if (!actif) return;
        const d = (r && r.data) || r || {};
        if (r?.valid === false) { setSiretEtat('introuvable'); return; }
        if (!r || r.valid !== true) { setSiretEtat(null); return; }
        if (r.active === false || d.active === false) { setSiretEtat('ferme'); return; }
        const adr = d.registered_address || {};
        setSiretNom(d.name || '');
        if (siretRecopieRef.current !== siretChiffres) {
          siretRecopieRef.current = siretChiffres;
          if (d.name) setCompanyName(d.name);
          if (adr.line1) setAddress(adr.line1);
          if (adr.postal_code) setPostalCode(adr.postal_code);
          if (adr.city) setCity(adr.city);
          setAddrSuggestions([]);
        }
        setSiretEtat('ok');
      })
      .catch(() => { if (actif) setSiretEtat(null); });
    return () => { actif = false; };
  }, [mode, step, isPro, country, siretChiffres]);

  // Photos (selfie, ID card) use the image library; paperwork (KBIS, RIB,
  // proof of address, RC Pro, URSSAF) also accepts a PDF via the file picker.
  const pickDocument = async (setter, allowPdf = false) => {
    if (allowPdf) {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setter({ uri: asset.uri, size: asset.size ?? null, type: asset.mimeType ?? 'application/octet-stream' });
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setter({ uri: asset.uri, size: asset.fileSize ?? null, type: asset.mimeType ?? 'image/jpeg' });
    }
  };

  // Mandatory registration documents. Same base set for every driver;
  // pros also provide their company paperwork. `pdf: true` → the file
  // picker also accepts a PDF; photos (selfie, ID card) stay image-only.
  const docFields = [
    { slot: 'profile_photo', url: 'profile_photo_url', label: t('docProfilePhoto'), value: docPhoto, setter: setDocPhoto, icon: 'person-circle-outline', pdf: false },
    { slot: 'id_front', url: 'id_card_front_url', label: t('idCardFront'), value: docIdFront, setter: setDocIdFront, icon: 'card-outline', pdf: false },
    { slot: 'id_back', url: 'id_card_back_url', label: t('idCardBack'), value: docIdBack, setter: setDocIdBack, icon: 'card-outline', pdf: false },
    // Réclamé dès que le livreur déclare une voiture : sans lui, un livreur
    // motorisé arrivait à la validation admin sans qu'aucun permis n'ait été
    // demandé. Le backend l'exige aussi, la liste ci-dessous étant tout ce que
    // l'écran envoie.
    ...(VEHICLES_REQUIRING_LICENSE.has(vehicle) ? [
      { slot: 'driver_license', url: 'driver_license_url', label: t('driverLicense'), value: docLicense, setter: setDocLicense, icon: 'car-outline', pdf: true },
    ] : []),
    { slot: 'proof_of_address', url: 'proof_of_address_url', label: t('docProofOfAddress'), value: docProofAddress, setter: setDocProofAddress, icon: 'home-outline', pdf: true },
    ...(isPro ? [
      { slot: 'rc_pro', url: 'rc_pro_url', label: t('docRcPro'), value: docRcPro, setter: setDocRcPro, icon: 'shield-checkmark-outline', pdf: true },
      ...(legalStatus === 'societe' ? [{ slot: 'kbis', url: 'kbis_doc_url', label: t('docKbiss'), value: docKbiss, setter: setDocKbiss, icon: 'document-text-outline', pdf: true }] : []),
    ] : []),
  ];

  // Back navigation
  const handleBack = () => {
    setError('');
    if (mode === 'login') return;
    if (mode === 'choose') { setMode('login'); return; }
    if (step === 2) { setStep(1); return; }
    if (isPro !== null) { setIsPro(null); setMode('choose'); return; }
    setMode('login');
  };

  // Touche retour Android : etape precedente, puis la connexion. Sur la
  // connexion, comportement normal (quitter l'app).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pendingValidation) {
        setPendingValidation(false); setMode('login'); setIsPro(null); setStep(1); setError('');
        return true;
      }
      if (mode === 'login') return false;
      handleBack();
      return true;
    });
    return () => sub.remove();
  });

  // Nouvelle etape : la page repart du haut.
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [mode, step]);

  // Login with rate limiting and validation
  const handleLogin = async () => {
    setError('');
    if (loginDisabled) {
      setError(t('loginCooldown') || 'Trop de tentatives. Veuillez patienter 30 secondes.');
      return;
    }
    if (!loginEmail.trim() && !loginPassword.trim()) { setError(t('errorBothEmpty') || 'Veuillez saisir votre email et mot de passe'); return; }
    if (!loginEmail.trim()) { setError(t('errorNoEmail') || 'Veuillez saisir votre email'); return; }
    if (!isValidEmail(loginEmail.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return; }
    if (!loginPassword.trim()) { setError(t('errorNoPassword') || 'Veuillez saisir votre mot de passe'); return; }
    setLoading(true);
    const result = await login(loginEmail.trim(), loginPassword);
    setLoading(false);
    if (result && result.ok) { termineRef.current = true; return; } // AuthContext sets the user -> navigation happens
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
  };

  // Suggestions d'adresse — Photon (OpenStreetMap), le meme geocodeur que
  // l'inscription user et pro. Gratuit et sans cle : la facturation Google
  // est coupee en prod, ne PAS basculer sur Places.
  const fetchAddressSuggestions = useCallback((q, iso) => {
    if (addrDebounceRef.current) clearTimeout(addrDebounceRef.current);
    if (!q || q.trim().length < 3) { setAddrSuggestions([]); return; }
    addrDebounceRef.current = setTimeout(async () => {
      try {
        setAddrSearching(true);
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=fr`
        );
        const json = await res.json();
        const cible = String(iso || 'FR').toUpperCase();
        const vus = new Set();
        const items = (json.features || [])
          // On restreint au pays de residence choisi : sans ce filtre, une rue
          // homonyme a l'etranger remonte avant la bonne.
          .filter((f) => (f.properties?.countrycode || '').toUpperCase() === cible)
          .map((f) => {
            const pr = f.properties || {};
            const rue = [pr.housenumber, pr.street || pr.name].filter(Boolean).join(' ');
            const ville = [pr.postcode, pr.city || pr.district].filter(Boolean).join(' ');
            return { label: [rue, ville].filter(Boolean).join(', '), rue, cp: pr.postcode || '', ville: pr.city || pr.district || '' };
          })
          .filter((sg) => sg.label && !vus.has(sg.label) && vus.add(sg.label));
        setAddrSuggestions(items.slice(0, 5));
      } catch (e) {
        // Reseau ou geocodeur indisponible : on laisse la saisie libre,
        // l'inscription ne doit jamais etre bloquee par une suggestion.
        setAddrSuggestions([]);
      } finally {
        setAddrSearching(false);
      }
    }, 300);
  }, []);

  // Signup
  const handleSignup = async () => {
    setError('');
    // Step 1: email + password
    if (step === 1) {
      if (!email.trim() || !password.trim() || !confirmPwd.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      if (!isValidEmail(email.trim())) { setError(t('errorInvalidEmail') || 'Format email invalide'); return; }
      if (!isStrongPassword(password)) { setError(t('errorPasswordWeak') || 'Le mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre'); return; }
      if (password !== confirmPwd) { setError(t('errorPasswordMismatch') || 'Les mots de passe ne correspondent pas'); return; }
      setStep(2);
      return;
    }
    // Page 2 : tout le reste, puis envoi de la demande.
    const ibanPropre = iban.replace(/\s+/g, '').toUpperCase();
    const siretPropre = siret.replace(/\s+/g, '');
    if (!prenom.trim() || !nom.trim() || !phone.trim() || !address.trim() || !postalCode.trim() || !city.trim() || (!isPro && !taxId.trim())) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
    if (isPro && !companyName.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
    if (!dateValide(dob)) { setError(t('payoutSetupInvalidDob')); return; }
    if (isPro && !/^\d{14}$/.test(siretPropre)) { setError(t('errorSiret')); return; }
    if (isPro && siretEtat === 'introuvable') { setError(t('siretNotFound')); return; }
    if (isPro && siretEtat === 'ferme') { setError(t('siretClosed')); return; }
    if (ibanPropre.length < 15) { setError(t('errorIban')); return; }
    if (docFields.some(f => !f.value?.uri)) { setError(t('errorDocsRequired') || 'Tous les documents sont obligatoires.'); return; }
    if (stripeActif && !stripeAccepte) { setError(t('errorStripeTerms')); return; }
    setLoading(true);
    let docUrls;
    try {
      const urls = await Promise.all(docFields.map(f =>
        uploadService.uploadDriverDoc({ fileUri: f.value.uri, slot: f.slot, size: f.value.size, contentType: f.value.type })
      ));
      docUrls = {};
      docFields.forEach((f, i) => { docUrls[f.url] = urls[i]; });
    } catch (uploadErr) {
      setLoading(false);
      setError(t('errorUploadFailed') || "Échec de l'envoi des documents. Veuillez réessayer.");
      return;
    }
    // Compte de virement Stripe : jeton fabriqué ici, compte créé par le
    // serveur avec l'inscription (annulée entière si Stripe refuse).
    let accountToken;
    if (stripeActif) {
      try {
        const jeton = await creerJetonCompte(stripeInfo.publishable_key, {
          firstName: prenom, lastName: nom, dob, line1: address, postalCode, city, email: email.trim(),
        }, stripeInfo.country || country);
        if (!jeton.id) { setLoading(false); setError(jeton.erreur || t('stripeSetupError')); return; }
        accountToken = jeton.id;
      } catch {
        setLoading(false); setError(t('errorNetwork') || t('genericError')); return;
      }
    }
    const result = await register({
      email: email.trim(), password, nom: nom.trim(), prenom: prenom.trim(), pseudo: pseudo.trim(),
      phone: phone.trim(), phoneCode: selectedPhoneCountry.phoneCode, country, companyName: companyName.trim(),
      legal_status: legalStatus,
      legal_address: `${address.trim()}, ${postalCode.trim()} ${city.trim()}`,
      postal_code: postalCode.trim(), city: city.trim(), birth_date: dateIso(dob), tax_id: isPro ? '' : taxId.trim(),
      siret: isPro ? siretPropre : '',
      iban: ibanPropre, iban_holder_name: legalStatus === 'societe' ? companyName.trim() : `${prenom.trim()} ${nom.trim()}`,
      account_token: accountToken,
      vehicle_type: vehicle, role: isPro ? 'professionaluser' : 'user', documents: docUrls,
    });
    setLoading(false);
    if (result && result.ok) { termineRef.current = true; setPendingValidation(true); return; }
    setError((result && result.error) || t('genericError'));
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

  const errorBox = error ? (
    <View style={{backgroundColor:'#FEE2E2', borderRadius:10, padding:12, marginBottom:16, flexDirection:'row', alignItems:'center'}}>
      <Ionicons name="alert-circle" size={18} color="#EF4444" />
      <Text style={{color:'#EF4444', fontSize:13, marginLeft:8, flex:1}}>{error}</Text>
    </View>
  ) : null;
  // Titre de section de la page 2 (icône + libellé, filet au-dessus).
  const section = (icone, titre, premier = false) => (
    <View style={[p.section, premier && p.sectionPremier]}>
      <Ionicons name={icone} size={18} color={BRAND} />
      <Text style={p.sectionTxt}>{titre}</Text>
    </View>
  );

  // Voile des fenetres sur tout l'ecran, barres systeme comprises.
  const voile = { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' };
  const basFeuille = Math.max(40, insets.bottom + 16);

  return (
    <KeyboardAvoidingView style={{flex:1, backgroundColor:'#fff'}} behavior="padding">
      <SafeAreaView style={{flex:1}}>
        {/* Back arrow */}
        {(mode !== 'login') && (
          <TouchableOpacity onPress={handleBack} style={{paddingHorizontal:16, paddingTop: insets.top + 12}}>
            <Ionicons name={dirIcon('arrow-back')} size={26} color="#111" />
          </TouchableOpacity>
        )}

        {/* Logo — fixed top (inscription/choix). En mode login il est rendu
            DANS le contenu centré du ScrollView pour être centré avec le form. */}
        {((mode === 'choose') || (mode === 'signup' && step === 1)) && (
          <View style={{alignItems:'center', paddingTop:16, paddingBottom:8}}>
            <Ionicons name="bicycle" size={50} color={BRAND} style={{marginBottom:6}} />
            <Text style={{fontSize:24, fontWeight:'900', color:'#111'}}>Pearl Delivery</Text>
          </View>
        )}

        <ScrollView ref={scrollRef} contentContainerStyle={{flexGrow:1, justifyContent:'center', paddingHorizontal:24, paddingVertical:20}} keyboardShouldPersistTaps="handled">

          {/* Step title on form pages */}
          {mode === 'signup' && isPro !== null && (
            <Text style={{fontSize:18, fontWeight:'800', color:'#111', marginBottom:16}}>
              {step === 1 ? (t('stepEmail') || 'Identifiants') : (t('stepInfo') || 'Informations')}
            </Text>
          )}

          {/* Error (connexion : sous le logo, contre le formulaire) */}
          {mode !== 'login' && errorBox}

          {/* === LOGIN === */}
          {mode === 'login' && (
            <>
              {/* Logo centré avec le formulaire (le ScrollView centre verticalement) */}
              <View style={{alignItems:'center', marginBottom:36}}>
                <Ionicons name="bicycle" size={54} color={BRAND} style={{marginBottom:8}} />
                <Text style={{fontSize:26, fontWeight:'900', color:'#111'}}>Pearl Delivery</Text>
              </View>
              {errorBox}
              <Text style={s.label}>{t('emailLabel')}</Text>
              <TextInput style={s.input} value={loginEmail} onChangeText={setLoginEmail} placeholder={t('loginEmail') || 'email@exemple.com'} placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={s.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={s.pwdRow}>
                <TextInput style={[s.input, {flex:1, marginBottom:0}]} value={loginPassword} onChangeText={setLoginPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Pressable style={[s.btn, loginDisabled && { opacity: 0.5 }]} onPress={handleLogin} disabled={loginDisabled}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('loginButton') || 'Se connecter'}</Text>}
              </Pressable>
              <TouchableOpacity onPress={() => { setMode('choose'); setIsPro(null); setStep(1); setError(''); }} style={{alignItems:'center', paddingVertical:16}}>
                <Text style={{color:'#6B7280', fontSize:15}}>
                  {t('noAccount') || 'Pas de compte ?'} <Text style={{color:BRAND, fontWeight:'800'}}>{t('signUp') || "S'inscrire"}</Text>
                </Text>
              </TouchableOpacity>
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
                  <Ionicons name={dirIcon('chevron-forward')} size={20} color={BRAND} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* === SIGNUP STEP 1: Email + Password === */}
          {mode === 'signup' && step === 1 && (
            <>
              <Text style={p.label}>{t('emailLabel')}</Text>
              <TextInput style={p.input} value={email} onChangeText={setEmail} placeholder={t('emailPlaceholder')} placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
              <Text style={p.label}>{t('password') || 'Mot de passe'}</Text>
              <View style={p.pwdRow}>
                <TextInput style={[p.input, {flex:1}]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowPwd(v => !v)} style={p.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Text style={p.label}>{t('confirmPassword') || 'Confirmer le mot de passe'}</Text>
              <View style={p.pwdRow}>
                <TextInput style={[p.input, {flex:1}]} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="••••••••" placeholderTextColor="#aaa" secureTextEntry={!showConfirmPwd} autoComplete="off" textContentType="oneTimeCode" inputAccessoryViewID="noSuggest" />
                <Pressable onPress={() => setShowConfirmPwd(v => !v)} style={p.eyeBtn}>
                  <Ionicons name={showConfirmPwd ? 'eye-off' : 'eye'} size={22} color="#888" />
                </Pressable>
              </View>
              <Pressable style={p.btn} onPress={handleSignup}>
                <Text style={p.btnTxt}>{t('next') || 'Suivant'}</Text>
              </Pressable>
            </>
          )}

          {/* === PAGE 2 : tout le reste, sur une page (26/10/2026) === */}
          {mode === 'signup' && step === 2 && (
            <>
              {isPro && (
                <>
                  {section('briefcase-outline', t('sectionStatus'), true)}
                  <View style={p.chipsRow}>
                    {[
                      { id: 'auto_entrepreneur', label: t('statusAutoEntrepreneur') },
                      { id: 'societe', label: t('statusCompany') },
                    ].map((o) => {
                      const actif = proStatus === o.id;
                      return (
                        <TouchableOpacity key={o.id} onPress={() => setProStatus(o.id)} style={[p.chip, actif && p.chipActif]}>
                          <Ionicons name={actif ? 'radio-button-on' : 'radio-button-off'} size={18} color={actif ? BRAND : '#9CA3AF'} style={{marginRight:8}} />
                          <Text style={[p.chipTxt, actif && {color:BRAND}]}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={p.label}>{t('siretLabel')}</Text>
                  <TextInput style={p.input} value={siret} onChangeText={(v) => setSiret(v.replace(/[^\d ]/g, ''))} placeholder="123 456 789 00012" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={17} />
                  {siretEtat === 'recherche' && (
                    <View style={p.siretLigne}><ActivityIndicator size="small" color={BRAND} /><Text style={[p.hintSous, {marginTop:0, marginLeft:6}]}>{t('siretSearching')}</Text></View>
                  )}
                  {siretEtat === 'ok' && (
                    <View style={p.siretLigne}><Ionicons name="checkmark-circle" size={16} color={BRAND} /><Text style={[p.hintSous, {marginTop:0, marginLeft:6, color:BRAND, flex:1}]}>{siretNom ? `${t('siretFound')} : ${siretNom}` : t('siretFound')}</Text></View>
                  )}
                  {(siretEtat === 'introuvable' || siretEtat === 'ferme') && (
                    <View style={p.siretLigne}><Ionicons name="alert-circle" size={16} color="#EF4444" /><Text style={[p.hintSous, {marginTop:0, marginLeft:6, color:'#EF4444', flex:1}]}>{t(siretEtat === 'ferme' ? 'siretClosed' : 'siretNotFound')}</Text></View>
                  )}
                  <Text style={p.label}>{t('companyName') || "Nom de l'établissement"}</Text>
                  <TextInput style={p.input} value={companyName} onChangeText={setCompanyName} placeholder={t('shopPlaceholder')} placeholderTextColor="#aaa" />
                </>
              )}

              {section('person-outline', t('sectionIdentity'), !isPro)}
              <View style={p.row}>
                <View style={{flex:1, marginRight:10}}>
                  <Text style={p.label}>{t('driverFirstName') || 'Prénom'}</Text>
                  <TextInput style={p.input} value={prenom} onChangeText={setPrenom} placeholder={t('firstNamePlaceholder')} placeholderTextColor="#aaa" autoCapitalize="words" />
                </View>
                <View style={{flex:1}}>
                  <Text style={p.label}>{t('driverLastName') || 'Nom'}</Text>
                  <TextInput style={p.input} value={nom} onChangeText={setNom} placeholder={t('lastNamePlaceholder')} placeholderTextColor="#aaa" autoCapitalize="words" />
                </View>
              </View>
              <Text style={p.label}>{t('birthDate')}</Text>
              <TextInput style={p.input} value={dob} onChangeText={(v) => setDob(formaterDate(v))} placeholder={t('birthDatePlaceholder')} placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={10} />
              <Text style={p.label}>{t('phoneLabel') || 'Numéro de téléphone'}</Text>
              <View style={p.row}>
                <TouchableOpacity onPress={() => setPhonePickerVisible(true)} style={[p.input, p.select, {marginRight:8, paddingRight:8}]}>
                  <Text style={{fontSize:16, marginRight:6}}>{selectedPhoneCountry.flag}</Text>
                  <Text style={p.selectTxt}>{selectedPhoneCountry.phoneCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" style={{marginLeft:4}} />
                </TouchableOpacity>
                <TextInput style={[p.input, {flex:1}]} value={formatPhone(phone, phoneFmt)} onChangeText={(txt) => setPhone(txt.replace(/\D/g, '').slice(0, phoneFmt.len))} placeholder={phonePlaceholder(phoneFmt)} placeholderTextColor="#aaa" keyboardType="phone-pad" maxLength={phoneFmt.len + phoneFmt.groups.length} />
              </View>

              {section('home-outline', t('sectionAddress'))}
              <Text style={p.label}>{t('countryLabel') || 'Pays de résidence'}</Text>
              <TouchableOpacity onPress={() => setCountryPickerVisible(true)} style={[p.input, p.select]}>
                <Text style={{fontSize:18, marginRight:10}}>{selectedCountry.flag}</Text>
                <Text style={[p.selectTxt, {flex:1}]}>{countryName(selectedCountry.code, lang, selectedCountry.name)}</Text>
                <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={p.label}>{t('streetAddress') || t('driverAddressLabel') || 'Adresse'}</Text>
              <TextInput
                style={p.input}
                value={address}
                onChangeText={(txt) => { setAddress(txt); fetchAddressSuggestions(txt, selectedCountry.code); }}
                placeholder={t('addressPlaceholder')}
                placeholderTextColor="#aaa"
              />
              {addrSearching && <ActivityIndicator size="small" color={BRAND} style={{marginTop:6}} />}
              {addrSuggestions.length > 0 && (
                <View style={p.suggestions}>
                  {addrSuggestions.map((sugg) => (
                    <TouchableOpacity
                      key={sugg.label}
                      onPress={() => {
                        setAddress(sugg.rue || sugg.label);
                        if (sugg.cp) setPostalCode(sugg.cp);
                        if (sugg.ville) setCity(sugg.ville);
                        setAddrSuggestions([]);
                      }}
                      style={{paddingVertical:10, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}
                    >
                      <Text style={{fontSize:13, color:'#111'}}>{sugg.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={p.row}>
                <View style={{flex:1, marginRight:10}}>
                  <Text style={p.label}>{t('postalCode')}</Text>
                  <TextInput style={p.input} value={postalCode} onChangeText={setPostalCode} placeholder="75002" placeholderTextColor="#aaa" keyboardType="number-pad" maxLength={10} />
                </View>
                <View style={{flex:2}}>
                  <Text style={p.label}>{t('city')}</Text>
                  <TextInput style={p.input} value={city} onChangeText={setCity} placeholder="Paris" placeholderTextColor="#aaa" autoCapitalize="words" />
                </View>
              </View>

              {!isPro && (
                <>
                  {section('document-text-outline', t('sectionTax'))}
                  <Text style={p.hint}>{t('sectionTaxHint')}</Text>
                  <Text style={p.label}>{t('taxIdLabel')}</Text>
                  <TextInput style={p.input} value={taxId} onChangeText={setTaxId} placeholder="1234567890123" placeholderTextColor="#aaa" autoCapitalize="characters" autoCorrect={false} maxLength={32} />
                  <Text style={p.hintSous}>{t('taxIdHint')}</Text>
                </>
              )}

              {section('bicycle-outline', t('sectionVehicle'))}
              <View style={p.chipsRow}>
                {SIGNUP_VEHICLES.map((v) => {
                  const active = vehicle === v.id;
                  return (
                    <TouchableOpacity key={v.id} onPress={() => setVehicle(v.id)} style={[p.vehicule, active && p.chipActif, v.id === 'walk' && {marginRight:0}]}>
                      <Ionicons name={v.icon} size={22} color={active ? BRAND : '#9CA3AF'} />
                      <Text style={[p.vehiculeTxt, active && {color:BRAND, fontWeight:'700'}]}>{t(v.labelKey) || v.id}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {section('card-outline', t('sectionPayouts'))}
              <Text style={p.hint}>{t('payoutSetupIntro')}</Text>
              <Text style={p.label}>{t('ibanLabel')}</Text>
              <TextInput style={p.input} value={iban} onChangeText={setIban} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" placeholderTextColor="#aaa" autoCapitalize="characters" autoCorrect={false} maxLength={42} />
              {legalStatus === 'societe' && <Text style={p.hintSous}>{t('signupPayoutCompanyLater')}</Text>}

              {section('folder-open-outline', t('sectionDocuments'))}
              {docFields.map((doc) => (
                <TouchableOpacity key={doc.slot} onPress={() => pickDocument(doc.setter, doc.pdf)} style={[p.doc, doc.value?.uri && p.chipActif]}>
                  <Ionicons name={doc.value?.uri ? 'checkmark-circle' : doc.icon} size={22} color={doc.value?.uri ? BRAND : '#9CA3AF'} style={{marginRight:12}} />
                  <View style={{flex:1}}>
                    <Text style={{fontSize:13, fontWeight:'600', color:'#111'}}>{doc.label} *</Text>
                    <Text style={{fontSize:11, color: doc.value?.uri ? BRAND : '#9CA3AF', marginTop:2}}>{doc.value?.uri ? (t('docUploaded') || 'Document ajouté') : (t('docTapUpload') || 'Appuyez pour ajouter')}</Text>
                  </View>
                  {doc.value?.uri && (
                    <TouchableOpacity onPress={() => doc.setter(null)} style={{padding:4}}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}

              {stripeActif && (
                <Pressable style={p.checkRow} onPress={() => setStripeAccepte((v) => !v)}>
                  <Ionicons name={stripeAccepte ? 'checkbox' : 'square-outline'} size={22} color={stripeAccepte ? BRAND : '#9CA3AF'} style={{marginRight:10}} />
                  <Text style={p.checkTxt}>
                    {t('stripeTermsAccept')}{' '}
                    <Text style={p.lien} onPress={() => Linking.openURL(CONTRAT_STRIPE)}>{t('stripeTermsLink')}</Text>
                  </Text>
                </Pressable>
              )}
              <Pressable style={[p.btn, loading && {opacity:0.6}]} onPress={handleSignup} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={p.btnTxt}>{t('submitApplication') || 'Envoyer la demande'}</Text>}
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
        <Modal visible={countryPickerVisible} animationType="none" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCountryPickerVisible(false)}>
          <View style={voile}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setCountryPickerVisible(false)} />
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'70%', paddingBottom:basFeuille}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}>
                <Text style={{fontSize:18, fontWeight:'800', color:'#111'}}>{t('countryLabel') || 'Pays de résidence'}</Text>
                <TouchableOpacity onPress={() => setCountryPickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code} contentContainerStyle={{paddingHorizontal:16}} renderItem={({item: c}) => (
                <TouchableOpacity onPress={() => { setCountry(c.code); setPhoneCountry(c.code); setPhone(p => p.replace(/\D/g, '').slice(0, phoneFmtFor(c.code).len)); setCountryPickerVisible(false); }} style={{flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', backgroundColor: country === c.code ? '#F0FDF4' : '#fff'}}>
                  <Text style={{fontSize:24, marginRight:14}}>{c.flag}</Text>
                  <Text style={{flex:1, fontSize:16, fontWeight: country === c.code ? '700' : '500', color: country === c.code ? BRAND : '#111'}}>{countryName(c.code, lang, c.name)}</Text>
                  {country === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Phone Code Picker */}
        <Modal visible={phonePickerVisible} animationType="none" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPhonePickerVisible(false)}>
          <View style={voile}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhonePickerVisible(false)} />
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'70%', paddingBottom:basFeuille}}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1, borderBottomColor:'#F3F4F6'}}>
                <Text style={{fontSize:18, fontWeight:'800', color:'#111'}}>{t('phoneCodeLabel') || 'Indicatif téléphonique'}</Text>
                <TouchableOpacity onPress={() => setPhonePickerVisible(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <FlatList data={COUNTRIES} keyExtractor={c => c.code + '_p'} contentContainerStyle={{paddingHorizontal:16}} renderItem={({item: c}) => (
                <TouchableOpacity onPress={() => { setPhoneCountry(c.code); setPhone(p => p.replace(/\D/g, '').slice(0, phoneFmtFor(c.code).len)); setPhonePickerVisible(false); }} style={{flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#F3F4F6', backgroundColor: phoneCountry === c.code ? '#F0FDF4' : '#fff'}}>
                  <Text style={{fontSize:24, marginRight:14}}>{c.flag}</Text>
                  <Text style={{flex:1, fontSize:16, fontWeight: phoneCountry === c.code ? '700' : '500', color: phoneCountry === c.code ? BRAND : '#111'}}>{countryName(c.code, lang, c.name)}</Text>
                  <Text style={{fontSize:14, fontWeight:'700', color:'#374151'}}>{c.phoneCode}</Text>
                  {phoneCountry === c.code && <Ionicons name="checkmark-circle" size={20} color={BRAND} style={{marginLeft:8}} />}
                </TouchableOpacity>
              )} />
            </View>
          </View>
        </Modal>

        {/* Language Picker */}
        <Modal visible={langPickerVisible} animationType="none" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setLangPickerVisible(false)}>
          <View style={voile}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setLangPickerVisible(false)} />
            <View style={{backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'60%', paddingBottom:basFeuille}}>
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

// Inscription (26/10/2026) : champs, boutons et sections au style de l'app
// pro, sur fond blanc.
const p = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'center', marginTop: 26, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#F0F0F0', marginBottom: 2 },
  sectionPremier: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  sectionTxt: { fontSize: 16, fontWeight: '700', color: '#111', marginLeft: 8 },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 6 },
  siretLigne: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  hintSous: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 5 },
  label: { fontSize: 12, fontWeight: '600', color: '#111', marginBottom: 5, marginTop: 14 },
  input: { height: 45, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 10, fontSize: 13, color: '#111' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  select: { flexDirection: 'row', alignItems: 'center' },
  selectTxt: { fontSize: 13, fontWeight: '600', color: '#111' },
  suggestions: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  pwdRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 10, padding: 4 },
  chipsRow: { flexDirection: 'row', marginTop: 12 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 45, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', marginRight: 10, backgroundColor: '#fff' },
  chipActif: { borderColor: BRAND, backgroundColor: '#E0F5EF' },
  chipTxt: { fontSize: 13, fontWeight: '600', color: '#374151', flexShrink: 1 },
  vehicule: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', marginRight: 10, backgroundColor: '#fff' },
  vehiculeTxt: { fontSize: 11, marginTop: 4, fontWeight: '500', color: '#6B7280' },
  doc: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', marginTop: 10, backgroundColor: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 22 },
  checkTxt: { flex: 1, fontSize: 13, color: '#333', lineHeight: 19 },
  lien: { color: BRAND, fontWeight: '700', textDecorationLine: 'underline' },
  btn: { height: 46, backgroundColor: BRAND, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
