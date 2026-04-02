import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, FlatList, SafeAreaView, ActivityIndicator, InputAccessoryView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import * as ImagePicker from 'expo-image-picker';

const BRAND = '#00C29B';

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
  const { login, register } = useAuth();

  // Mode: 'login' | 'choose' | 'signup'
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

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
  const selectedPhoneCountry = COUNTRIES.find(c => c.code === phoneCountry) || COUNTRIES[0];

  const pickDocument = async (setter) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.length > 0) setter(result.assets[0].uri);
  };

  // Back navigation
  const handleBack = () => {
    setError('');
    if (mode === 'login') return;
    if (mode === 'choose') { setMode('login'); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 2) { setStep(1); return; }
    if (isPro !== null) { setIsPro(null); setMode('choose'); return; }
    setMode('login');
  };

  // Login
  const handleLogin = () => {
    setError('');
    if (!email.trim() && !password.trim()) { setError(t('errorBothEmpty') || 'Veuillez saisir votre email et mot de passe'); return; }
    if (!email.trim()) { setError(t('errorNoEmail') || 'Veuillez saisir votre email'); return; }
    if (!password.trim()) { setError(t('errorNoPassword') || 'Veuillez saisir votre mot de passe'); return; }
    const ok = login(email.trim(), password);
    if (!ok) setError(t('loginErrorCredentials') || 'Email ou mot de passe incorrect');
  };

  // Signup
  const handleSignup = () => {
    setError('');
    // Step 1: email + password
    if (step === 1) {
      if (!email.trim() || !password.trim() || !confirmPwd.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      if (password.length < 6) { setError(t('errorPasswordLength') || 'Minimum 6 caractères'); return; }
      if (password !== confirmPwd) { setError(t('errorPasswordMismatch') || 'Les mots de passe ne correspondent pas'); return; }
      setStep(2);
      return;
    }
    // Step 2: info
    if (step === 2) {
      if (!nom.trim() || !prenom.trim() || !pseudo.trim() || !phone.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      if (isPro && !companyName.trim()) { setError(t('errorEmpty') || 'Veuillez remplir tous les champs'); return; }
      if (isPro) { setStep(3); return; }
      // Particulier: register directly
      setLoading(true);
      const success = register({ email: email.trim(), password, nom: nom.trim(), prenom: prenom.trim(), pseudo: pseudo.trim(), phone: phone.trim(), phoneCode: selectedPhoneCountry.phoneCode, country, role: 'user' });
      setLoading(false);
      if (success) return; // AuthContext handles navigation
      setError(t('errorEmailExists') || 'Un compte avec cet email existe déjà');
      return;
    }
    // Step 3: documents (pro)
    if (!docIdFront || !docIdBack || !docIban || !docKbiss) { setError(t('errorDocsRequired') || "Carte d'identité, IBAN et KBISS sont obligatoires"); return; }
    setLoading(true);
    register({ email: email.trim(), password, nom: nom.trim(), prenom: prenom.trim(), pseudo: pseudo.trim(), phone: phone.trim(), phoneCode: selectedPhoneCountry.phoneCode, country, companyName: companyName.trim(), role: 'professionaluser', isVerified: false, documents: { idFront: docIdFront, idBack: docIdBack, iban: docIban, kbiss: docKbiss } });
    setLoading(false);
    setPendingValidation(true);
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

  return (
    <KeyboardAvoidingView style={{flex:1, backgroundColor:'#fff'}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{flex:1}}>
        {/* Back arrow */}
        {(mode !== 'login') && (
          <TouchableOpacity onPress={handleBack} style={{paddingHorizontal:16, paddingTop:12}}>
            <Ionicons name="arrow-back" size={26} color="#111" />
          </TouchableOpacity>
        )}

        {/* Logo — fixed top */}
        {(mode === 'login' || mode === 'choose' || (mode === 'signup' && step === 1)) && (
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
              <Pressable style={s.btn} onPress={handleLogin}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{t('loginButton') || 'Se connecter'}</Text>}
              </Pressable>
              <TouchableOpacity onPress={() => { setMode('choose'); setError(''); }} style={{alignItems:'center', paddingVertical:16}}>
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

          {/* === SIGNUP STEP 2: Info === */}
          {mode === 'signup' && step === 2 && (
            <>
              <Text style={s.label}>{t('driverLastName') || 'Nom du livreur'}</Text>
              <TextInput style={s.input} value={nom} onChangeText={setNom} placeholder="Dupont" placeholderTextColor="#aaa" />
              <Text style={s.label}>{t('driverFirstName') || 'Prénom du livreur'}</Text>
              <TextInput style={s.input} value={prenom} onChangeText={setPrenom} placeholder="Jean" placeholderTextColor="#aaa" />
              <Text style={s.label}>Pseudo</Text>
              <TextInput style={s.input} value={pseudo} onChangeText={setPseudo} placeholder="MonPseudo" placeholderTextColor="#aaa" />
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
              <Pressable style={s.btn} onPress={handleSignup}>
                <Text style={s.btnTxt}>{isPro ? (t('next') || 'Suivant') : (t('signUp') || "S'inscrire")}</Text>
              </Pressable>
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
