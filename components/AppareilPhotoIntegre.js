// Appareil photo intégré des preuves (ticket au retrait, sac devant la porte),
// 05/11/2026. Un seul appui sur le déclencheur = photo prise, sans écran de
// confirmation (« Reprendre la photo » existe sur l'écran de course). Photo
// allégée aussitôt (1280 px, JPEG 0.5, sans EXIF). Rendu seulement si le
// binaire a expo-camera (voir services/preuvePhoto.js) : sinon l'écran passe
// par l'appareil photo du système.
// QR code du ticket (05/11/2026) : avec `onCodeQr`, l'appareil lit aussi les
// QR codes. Seuls les textes commençant par PSTICKET1: sont transmis ; un seul
// à la fois, et le code que le parent vient de refuser n'est pas renvoyé.
// `onCodeQr(texte)` rend 'ok' (le parent ferme l'appareil), 'erreur' (réseau :
// même code réessayé après quelques secondes) ou un refus. `messageQr` est
// affiché par-dessus l'image.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import { composantCamera, allegerPhoto, PREFIXE_TICKET_QR } from '../services/preuvePhoto';

const ATTENTE_APRES_ERREUR_MS = 3000;

export default function AppareilPhotoIntegre({ visible, consigne, onPhoto, onFermer, onCodeQr, messageQr }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const camRef = useRef(null);
  const [prete, setPrete] = useState(false);
  const [lampe, setLampe] = useState(false);
  const [prise, setPrise] = useState(false);
  const CameraView = composantCamera();
  const verifQr = useRef(false);
  const codeRefuse = useRef(null); // { texte, jusqua }
  const priseRef = useRef(false);

  // Chaque ouverture repart à zéro (lampe éteinte, déclencheur libre).
  useEffect(() => {
    if (visible) { setPrete(false); setLampe(false); setPrise(false); priseRef.current = false; verifQr.current = false; codeRefuse.current = null; }
  }, [visible]);

  const declencher = async () => {
    if (prise || !camRef.current) return;
    setPrise(true);
    priseRef.current = true;
    try {
      // Traitement gardé (skipProcessing laissé à false) : sur Android, le
      // sauter rend des photos mal orientées. Qualité basse, allégée ensuite.
      const photo = await camRef.current.takePictureAsync({ quality: 0.4, exif: false });
      const uri = await allegerPhoto(photo);
      onPhoto(uri || null);
    } catch {
      setPrise(false);
      priseRef.current = false;
    }
  };

  const codeLu = async (resultat) => {
    const texte = typeof resultat?.data === 'string' ? resultat.data : '';
    if (!onCodeQr || !texte.startsWith(PREFIXE_TICKET_QR)) return;
    if (verifQr.current || priseRef.current) return;
    const refuse = codeRefuse.current;
    if (refuse && refuse.texte === texte && Date.now() < refuse.jusqua) return;
    verifQr.current = true;
    try {
      const etat = await onCodeQr(texte);
      if (etat !== 'ok') {
        codeRefuse.current = { texte, jusqua: etat === 'erreur' ? Date.now() + ATTENTE_APRES_ERREUR_MS : Infinity };
      }
    } catch {
      codeRefuse.current = { texte, jusqua: Date.now() + ATTENTE_APRES_ERREUR_MS };
    } finally {
      verifQr.current = false;
    }
  };

  if (!CameraView) return null;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => { if (!prise) onFermer(); }}>
      <StatusBar barStyle="light-content" />
      <View style={[st.fond, { backgroundColor: colors.bg }]}>
        {visible && (
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            enableTorch={lampe}
            onCameraReady={() => setPrete(true)}
            onMountError={() => onFermer({ erreur: true })}
            {...(onCodeQr ? { barcodeScannerSettings: { barcodeTypes: ['qr'] }, onBarcodeScanned: codeLu } : {})}
          />
        )}

        <View style={[st.haut, { paddingTop: insets.top + 10 }]}>
          <Pressable style={st.rond} onPress={() => onFermer()} disabled={prise} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('close')}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Pressable
            style={[st.rond, lampe && { backgroundColor: BRAND }]}
            onPress={() => setLampe((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={lampe ? t('cameraTorchOff') : t('cameraTorchOn')}
          >
            <Ionicons name={lampe ? 'flashlight' : 'flashlight-outline'} size={22} color="#fff" />
          </Pressable>
        </View>

        {(!!consigne || !!messageQr) && (
          <View style={st.consigneZone} pointerEvents="none">
            {!!messageQr && <Text style={[st.consigne, st.messageQr]}>{messageQr}</Text>}
            {!!consigne && <Text style={st.consigne}>{consigne}</Text>}
          </View>
        )}

        <View style={[st.bas, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable
            onPress={declencher}
            disabled={!prete || prise}
            accessibilityRole="button"
            accessibilityLabel={t('cameraTakePhoto')}
            style={({ pressed }) => [st.declencheur, (!prete || pressed) && { opacity: 0.6 }]}
          >
            <View style={st.declencheurCoeur}>
              {(prise || !prete) && <ActivityIndicator color="#fff" />}
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fond: { flex: 1 },
  haut: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  rond: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  consigneZone: { position: 'absolute', left: 20, right: 20, bottom: 150, alignItems: 'center' },
  consigne: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  messageQr: { marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.7)' },
  bas: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  declencheur: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  declencheurCoeur: { width: 62, height: 62, borderRadius: 31, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
});
