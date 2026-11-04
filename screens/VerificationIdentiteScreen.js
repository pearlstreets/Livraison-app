import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dirIcon } from '../lib/rtl';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDayMonth, formatTime } from '../lib/i18nFormat';
import {
  identiteService, marquerVerificationVue, TAILLE_MAX_VIDEO,
  garderVideoEnAttente, lireVideoEnAttente, oublierVideoEnAttente, erreurAReessayer,
} from '../services/identiteService';
import { marquerCameraIndisponible } from '../services/selfieCamera';

const BRAND = '#FF6A13';
const VERT = '#00C29B';
const APPEL_MIN = 10;
const APPEL_MAX = 2000;
const MOTIFS_BLOCAGE = ['echec_visage', 'echec_mouvement', 'pas_de_video', 'plusieurs_visages', 'aucun_visage'];
const STATUTS_APPEL = ['en_cours', 'debloque', 'agent_humain', 'maintenu'];
// Conseils montrés après un essai refusé, selon la raison donnée par le serveur.
const CONSEILS_ESSAI = {
  aucun_visage: ['idvConseilLumiere', 'idvConseilCadre', 'idvConseilLunettes', 'idvConseilCasque'],
  echec_visage: ['idvConseilLumiere', 'idvConseilLunettes', 'idvConseilCasque', 'idvConseilCadre'],
  plusieurs_visages: ['idvConseilSeul', 'idvConseilCadre'],
  echec_mouvement: ['idvConseilTete', 'idvConseilCadre'],
};
const CONSEILS_TOUS = ['idvConseilLumiere', 'idvConseilLunettes', 'idvConseilCasque', 'idvConseilCadre', 'idvConseilSeul', 'idvConseilTete'];
// Renvois automatiques de la vidéo après une coupure : 3 s, 10 s, puis 30 s.
const DELAIS_RENVOI = [3000, 10000, 30000];

// Instant de fin : secondes restantes du serveur comptées depuis la réception
// (insensible à l'heure du téléphone), sinon date ISO.
function finDepuis(secondes, dateIso) {
  const n = secondes == null ? NaN : Number(secondes);
  if (Number.isFinite(n)) return Date.now() + n * 1000;
  const d = dateIso ? Date.parse(dateIso) : NaN;
  return Number.isFinite(d) ? d : null;
}

function formatDuree(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function useMaintenant() {
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, []);
  return maintenant;
}

export default function VerificationIdentiteScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { setIsOnline, setIsOnlineState } = useAuth();
  const insets = useSafeAreaInsets();
  const maintenant = useMaintenant();

  const [etat, setEtatBrut] = useState(route?.params?.etat || null);
  const [chargement, setChargement] = useState(!route?.params?.etat);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null); // { resultat, is_online, motif }
  const [essai, setEssai] = useState(null); // { motif_echec, essais_restants } après « reessayer »
  const [reprise, setReprise] = useState(false); // vidéo gardée, renvoi automatique en cours
  const [dernierAppel, setDernierAppel] = useState(null);
  const [appelOuvert, setAppelOuvert] = useState(false);
  const [messageAppel, setMessageAppel] = useState('');
  // Fins calculées à la réception de l'état (secondes restantes du serveur).
  const [finVerification, setFinVerification] = useState(null);
  const [finBlocage, setFinBlocage] = useState(null);
  const rechargeApresDelai = useRef(null);
  const envoiEnCours = useRef(false);
  const minuteurRenvoi = useRef(null);
  const nbRenvois = useRef(0);
  const verificationCourante = useRef(null);
  const finVerificationRef = useRef(null);

  const setEtat = useCallback((e) => {
    setEtatBrut(e || null);
    const v = e && e.verification;
    const b = e && e.blocage;
    const fin = v ? finDepuis(v.secondes_restantes, v.echeance) : null;
    finVerificationRef.current = fin;
    if (v) verificationCourante.current = v;
    setFinVerification(fin);
    setFinBlocage(b && b.fin_blocage ? finDepuis(b.selfie_possible_dans_secondes, b.fin_blocage) : null);
    if (v && v.id != null) marquerVerificationVue(v.id);
    if (b && b.appel) setDernierAppel(b.appel);
  }, []);

  useEffect(() => {
    if (route?.params?.etat) {
      setResultat(null);
      setEssai(null);
      setEtat(route.params.etat);
    }
  }, [route?.params?.etat, setEtat]);

  const charger = useCallback(async () => {
    try {
      const e = await identiteService.getEtat();
      setEtat(e);
    } catch {
      // Réseau coupé : on garde l'état connu.
    } finally {
      setChargement(false);
    }
  }, [setEtat]);

  // Réponse du serveur à la vidéo (HTTP 200).
  const traiterResultat = useCallback((res) => {
    const motif = verificationCourante.current?.motif;
    if (res?.resultat === 'reessayer') {
      const v = res.identite?.verification;
      setEssai({
        motif_echec: res.motif_echec || v?.motif_echec || null,
        essais_restants: v?.essais_restants ?? res.essais_restants ?? null,
      });
      if (res.identite) setEtat(res.identite);
      else charger();
      return;
    }
    setEssai(null);
    if (res?.resultat === 'echouee') {
      setEtat(res.identite || null);
      if (!res.identite) charger();
      return;
    }
    if (res?.resultat === 'reussie' || res?.resultat === 'a_revoir') {
      if (res.is_online === true) setIsOnlineState(true);
      setResultat({ resultat: res.resultat, is_online: res.is_online === true, motif });
      setEtat(res.identite || null);
      return;
    }
    charger();
  }, [setEtat, charger, setIsOnlineState]);

  // Envoi de la vidéo gardée. Coupure réseau ou erreur 5xx : nouvel envoi
  // automatique tant que le serveur peut l'accepter. La vidéo n'est oubliée
  // qu'après une réponse 200, 400 ou 409.
  const envoyer = useCallback(async (verificationId, video) => {
    if (envoiEnCours.current) return;
    envoiEnCours.current = true;
    clearTimeout(minuteurRenvoi.current);
    setEnvoi(true);
    try {
      const res = await identiteService.envoyerVideo(verificationId, video);
      await oublierVideoEnAttente();
      nbRenvois.current = 0;
      setReprise(false);
      traiterResultat(res);
    } catch (e) {
      if (erreurAReessayer(e)) {
        const attente = await lireVideoEnAttente(verificationId);
        if (attente) {
          const delai = DELAIS_RENVOI[Math.min(nbRenvois.current, DELAIS_RENVOI.length - 1)];
          nbRenvois.current += 1;
          setReprise(true);
          minuteurRenvoi.current = setTimeout(() => {
            lireVideoEnAttente(verificationId).then((a) => { if (a) envoyer(a.verificationId, a.video); });
          }, delai);
        } else {
          setReprise(false);
          Alert.alert(t('idvTitre'), t('idvRepriseEchec'));
          charger();
        }
        return;
      }
      setReprise(false);
      nbRenvois.current = 0;
      if (e?.status === 409) {
        await oublierVideoEnAttente();
        if (e.identite) setEtat(e.identite);
        else charger();
        Alert.alert(t('idvTitre'), t('idvExpiree'));
      } else if (e?.status === 400) {
        // Fichier illisible, aucun essai compté : il faut filmer à nouveau.
        await oublierVideoEnAttente();
        Alert.alert(t('idvTitre'), e.serverMessage || t('idvVideoInvalide'));
      } else {
        Alert.alert(t('error'), t('genericError'));
      }
    } finally {
      envoiEnCours.current = false;
      setEnvoi(false);
    }
  }, [t, setEtat, charger, traiterResultat]);

  useEffect(() => () => clearTimeout(minuteurRenvoi.current), []);

  // Vidéo restée en attente (app fermée pendant une coupure) : renvoyée dès
  // l'ouverture de l'écran.
  const reprendreVideo = useCallback(async () => {
    const attente = await lireVideoEnAttente(null);
    if (attente && !envoiEnCours.current) envoyer(attente.verificationId, attente.video);
  }, [envoyer]);

  // Rafraîchi à chaque ouverture de l'écran, et à chaque notification (même
  // écran déjà ouvert).
  useEffect(() => {
    const desabonner = navigation.addListener('focus', () => { charger(); reprendreVideo(); });
    charger();
    reprendreVideo();
    return desabonner;
  }, [navigation, charger, reprendreVideo]);

  const ouvertLe = route?.params?.ouvertLe;
  useEffect(() => {
    if (ouvertLe) charger();
  }, [ouvertLe, charger]);

  const verification = etat && etat.verification;
  const blocage = etat && etat.blocage;
  const resteVerification = finVerification != null ? finVerification - maintenant : null;
  const resteBlocage = finBlocage != null ? finBlocage - maintenant : null;

  // Délai de 5 min écoulé : le serveur décide (expirée, blocage), une seule fois.
  useEffect(() => {
    if (!verification || resteVerification == null || resteVerification > 0) return;
    if (rechargeApresDelai.current === verification.id) return;
    rechargeApresDelai.current = verification.id;
    const minuteur = setTimeout(charger, 2000);
    return () => clearTimeout(minuteur);
  }, [verification, resteVerification, charger]);

  const quitter = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('OrdersMain');
  }, [navigation]);

  // Caméra impossible à ouvrir (permission refusée pour de bon, absente de
  // l'appareil) : aucun blocage, l'appareil est signalé sans caméra (en-tête
  // X-Pearl-Selfie: 0) et le passage en ligne est retenté.
  const cameraIndisponible = useCallback(() => {
    marquerCameraIndisponible();
    const motif = verificationCourante.current?.motif;
    Alert.alert(t('idvTitre'), t('idvCameraIndispo'), [{
      text: t('ok'),
      onPress: () => {
        if (motif === 'passage_en_ligne') setIsOnline(true);
        quitter();
      },
    }]);
  }, [t, setIsOnline, quitter]);

  const filmer = useCallback(async () => {
    if (!verification || envoi) return;
    let video = null;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain === false) {
          cameraIndisponible();
          return;
        }
        Alert.alert(t('idvTitre'), t('idvCameraRefusee'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('openSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        cameraType: ImagePicker.CameraType.front,
        videoMaxDuration: 3,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.length) return;
      video = res.assets[0];
    } catch {
      cameraIndisponible();
      return;
    }
    if (video.fileSize && video.fileSize > TAILLE_MAX_VIDEO) {
      Alert.alert(t('idvTitre'), t('idvVideoTropLourde'));
      return;
    }
    setEssai(null);
    nbRenvois.current = 0;
    const gardee = await garderVideoEnAttente(verification.id, video, finVerificationRef.current);
    envoyer(gardee.verificationId, gardee.video);
  }, [verification, envoi, t, cameraIndisponible, envoyer]);

  const annuler = useCallback(async () => {
    if (!verification) return;
    setEnvoi(true);
    try {
      await identiteService.annuler(verification.id);
    } catch {
      // Déjà expirée ou traitée : on quitte quand même.
    } finally {
      setEnvoi(false);
    }
    quitter();
  }, [verification, quitter]);

  const refaireSelfie = useCallback(async () => {
    setEnvoi(true);
    try {
      const res = await identiteService.demanderDeblocage();
      if (res?.identite) setEtat(res.identite);
      else if (res?.verification) setEtat({ ...(etat || {}), verification: res.verification });
      else charger();
    } catch (e) {
      if (e?.status === 409) {
        Alert.alert(t('idvTitre'), e.serverMessage || t('idvTropTot'));
        if (e.identite) setEtat(e.identite);
      } else {
        Alert.alert(t('error'), t('genericError'));
      }
    } finally {
      setEnvoi(false);
    }
  }, [etat, t, setEtat, charger]);

  const envoyerAppel = useCallback(async () => {
    const message = messageAppel.trim();
    if (message.length < APPEL_MIN || envoi) return;
    setEnvoi(true);
    try {
      const res = await identiteService.faireAppel(message);
      if (res?.appel) setDernierAppel(res.appel);
      if (res?.identite) setEtat(res.identite);
      else charger();
      setAppelOuvert(false);
      setMessageAppel('');
    } catch (e) {
      if (e?.status === 409) {
        Alert.alert(t('idvTitre'), e.serverMessage || t('idvAppelImpossible'));
        if (e.identite) setEtat(e.identite);
      } else {
        Alert.alert(t('error'), e?.serverMessage || t('genericError'));
      }
    } finally {
      setEnvoi(false);
    }
  }, [messageAppel, envoi, t, setEtat, charger]);

  const entete = (
    <View style={s.headerRow}>
      <Pressable onPress={quitter} hitSlop={10}>
        <Ionicons name={dirIcon('arrow-back')} size={22} color="#111" />
      </Pressable>
      <Text style={s.headerTitle}>{t('idvTitre')}</Text>
      <View style={{ width: 22 }} />
    </View>
  );

  const carteAppel = dernierAppel && STATUTS_APPEL.includes(dernierAppel.statut) ? (
    <View style={s.card}>
      <Text style={s.cardTitle}>{t('idvAppelTitre')}</Text>
      <Text style={s.cardText}>{t(`idvAppel_${dernierAppel.statut}`)}</Text>
      {!!dernierAppel.reponse && <Text style={s.reponse}>{dernierAppel.reponse}</Text>}
    </View>
  ) : null;

  let contenu;
  if (chargement && !etat) {
    contenu = <ActivityIndicator size="large" color={BRAND} style={{ marginTop: 40 }} />;
  } else if (resultat) {
    const accepte = resultat.resultat === 'reussie';
    let detail = accepte ? t('idvReussieMsg') : t('idvARevoirMsg');
    if (resultat.is_online) detail = `${detail} ${t('idvEnLigneMsg')}`;
    else if (resultat.motif === 'deblocage') detail = `${detail} ${t('idvDebloqueMsg')}`;
    contenu = (
      <View style={s.centre}>
        <Ionicons name="checkmark-circle" size={64} color={VERT} />
        <Text style={s.grandTitre}>{accepte ? t('idvReussieTitre') : t('idvARevoirTitre')}</Text>
        <Text style={s.sousTitre}>{detail}</Text>
        <Pressable style={[s.btnVert, { alignSelf: 'stretch' }]} onPress={quitter}>
          <Text style={s.btnVertTxt}>{t('idvContinuer')}</Text>
        </Pressable>
      </View>
    );
  } else if (reprise) {
    contenu = (
      <View style={s.centre}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={s.sousTitre}>{t('idvReprise')}</Text>
      </View>
    );
  } else if (verification && essai) {
    const conseils = CONSEILS_ESSAI[essai.motif_echec] || CONSEILS_TOUS;
    const restants = verification.essais_restants ?? essai.essais_restants;
    contenu = (
      <View style={s.card}>
        <View style={s.iconeRond}>
          <Ionicons name="refresh" size={36} color={BRAND} />
        </View>
        <Text style={s.grandTitre}>{t('idvReessayerTitre')}</Text>
        <Text style={s.cardText}>{t('idvReessayerMsg')}</Text>
        {conseils.map((cle) => (
          <View key={cle} style={s.conseilLigne}>
            <Ionicons name="checkmark-circle-outline" size={18} color={VERT} style={{ marginRight: 8 }} />
            <Text style={s.conseilTxt}>{t(cle)}</Text>
          </View>
        ))}
        {restants != null && (
          <Text style={[s.chronoTxt, { marginVertical: 10 }]}>{t('idvEssaisRestants', { n: restants })}</Text>
        )}
        <Pressable style={s.btnVert} onPress={() => setEssai(null)}>
          <Text style={s.btnVertTxt}>{t('idvReessayer')}</Text>
        </Pressable>
      </View>
    );
  } else if (verification) {
    const motifTexte = verification.motif === 'passage_en_ligne'
      ? t('idvMotifPassage')
      : verification.motif === 'deblocage' ? t('idvMotifDeblocage') : t('idvMotifCourse');
    const depasse = resteVerification != null && resteVerification <= 0;
    contenu = (
      <>
        <View style={s.card}>
          <Text style={s.cardText}>{motifTexte}</Text>
          <Text style={s.consigne}>{t('idvGuideTitre')}</Text>
          <View style={s.cadreVisage}>
            <Ionicons name="person-outline" size={72} color="#bbb" />
          </View>
          <Text style={s.consigne}>{t('idvGuideTete')}</Text>
          <View style={s.pastilleDuree}>
            <Ionicons name="timer-outline" size={15} color="#555" style={{ marginRight: 4 }} />
            <Text style={s.pastilleDureeTxt}>{t('idvGuideDuree')}</Text>
          </View>
          <Text style={s.conseil}>{t('idvConseil')}</Text>
          {verification.essais_restants != null && (
            <Text style={s.conseil}>{t('idvEssaisRestants', { n: verification.essais_restants })}</Text>
          )}
        </View>
        {resteVerification != null && (
          <View style={s.chrono}>
            <Ionicons name="time-outline" size={16} color={depasse ? '#e74c3c' : '#555'} style={{ marginRight: 6 }} />
            <Text style={[s.chronoTxt, depasse && { color: '#e74c3c' }]}>
              {depasse ? t('idvDelaiDepasse') : t('idvTempsRestant', { temps: formatDuree(resteVerification) })}
            </Text>
          </View>
        )}
        <Pressable style={[s.btnVert, (envoi || depasse) && { opacity: 0.5 }]} onPress={filmer} disabled={envoi || depasse}>
          {envoi
            ? <><ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /><Text style={s.btnVertTxt}>{t('idvEnvoi')}</Text></>
            : <><Ionicons name="videocam" size={18} color="#fff" style={{ marginRight: 8 }} /><Text style={s.btnVertTxt}>{t('idvFilmer')}</Text></>}
        </Pressable>
        {verification.annulable === true && (
          <Pressable style={s.btnSecondaire} onPress={annuler} disabled={envoi}>
            <Text style={s.btnSecondaireTxt}>{t('idvAnnuler')}</Text>
          </Pressable>
        )}
      </>
    );
  } else if (etat && etat.bloque && blocage) {
    const finConnue = blocage.fin_blocage != null;
    const peutRefaire = blocage.peut_refaire_selfie === true || (finConnue && resteBlocage != null && resteBlocage <= 0);
    const finAppel = blocage.fin_appel ? new Date(blocage.fin_appel) : null;
    const resteAppel = finAppel ? finAppel.getTime() - maintenant : null;
    const appelPossible = blocage.peut_faire_appel === true && !blocage.appel
      && (resteAppel == null || resteAppel > 0);
    const nbCar = messageAppel.trim().length;
    contenu = (
      <>
        <View style={s.card}>
          <View style={[s.iconeRond, { backgroundColor: '#fdecea' }]}>
            <Ionicons name="lock-closed" size={36} color="#e74c3c" />
          </View>
          <Text style={s.grandTitre}>{finConnue ? t('idvBloqueTitre') : t('idvBloqueAgentTitre')}</Text>
          {MOTIFS_BLOCAGE.includes(blocage.motif) && <Text style={s.cardText}>{t(`idvMotif_${blocage.motif}`)}</Text>}
          {finConnue && (
            <Text style={s.cardText}>
              {t('idvFinBlocage', { date: formatDayMonth(blocage.fin_blocage), heure: formatTime(blocage.fin_blocage) })}
            </Text>
          )}
          {finConnue && !peutRefaire && resteBlocage != null && (
            <Text style={s.chronoTxt}>{t('idvRestant', { temps: formatDuree(resteBlocage) })}</Text>
          )}
        </View>

        {peutRefaire && (
          <Pressable style={[s.btnVert, envoi && { opacity: 0.5 }]} onPress={refaireSelfie} disabled={envoi}>
            {envoi
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Ionicons name="videocam" size={18} color="#fff" style={{ marginRight: 8 }} /><Text style={s.btnVertTxt}>{t('idvRefaireSelfie')}</Text></>}
          </Pressable>
        )}

        {carteAppel}

        {appelPossible && !appelOuvert && (
          <>
            {finAppel && (
              <Text style={s.conseil}>
                {t('idvAppelDelai', { date: formatDayMonth(finAppel), heure: formatTime(finAppel) })}
              </Text>
            )}
            {resteAppel != null && (
              <Text style={[s.chronoTxt, { marginBottom: 8 }]}>{t('idvAppelRestant', { temps: formatDuree(resteAppel) })}</Text>
            )}
            <Pressable style={s.btnSecondaire} onPress={() => setAppelOuvert(true)}>
              <Text style={s.btnSecondaireTxt}>{t('idvFaireAppel')}</Text>
            </Pressable>
          </>
        )}

        {appelPossible && appelOuvert && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t('idvFaireAppel')}</Text>
            <Text style={s.conseil}>{t('idvAppelAide')}</Text>
            <TextInput
              style={s.saisie}
              placeholder={t('idvAppelPlaceholder')}
              placeholderTextColor="#aaa"
              multiline
              textAlignVertical="top"
              maxLength={APPEL_MAX}
              value={messageAppel}
              onChangeText={setMessageAppel}
            />
            <Text style={s.compteur}>{`${nbCar} / ${APPEL_MAX}`}</Text>
            <Pressable
              style={[s.btnVert, (nbCar < APPEL_MIN || envoi) && { opacity: 0.5 }]}
              onPress={envoyerAppel}
              disabled={nbCar < APPEL_MIN || envoi}
            >
              {envoi
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnVertTxt}>{t('idvEnvoyerAppel')}</Text>}
            </Pressable>
          </View>
        )}
      </>
    );
  } else {
    contenu = (
      <>
        {carteAppel}
        <View style={s.centre}>
          <Ionicons name="shield-checkmark-outline" size={56} color={VERT} />
          <Text style={s.grandTitre}>{t('idvRienTitre')}</Text>
          <Text style={s.sousTitre}>{t('idvRienMsg')}</Text>
          <Pressable style={[s.btnVert, { alignSelf: 'stretch' }]} onPress={quitter}>
            <Text style={s.btnVertTxt}>{t('idvContinuer')}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {entete}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {contenu}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 6 },
  cardText: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 6, textAlign: 'center' },
  consigne: { fontSize: 16, fontWeight: '800', color: '#111', lineHeight: 22, textAlign: 'center', marginVertical: 8 },
  conseil: { fontSize: 12, color: '#777', lineHeight: 17, textAlign: 'center', marginBottom: 8 },
  reponse: { fontSize: 13, color: '#333', lineHeight: 19, backgroundColor: '#f7f7f7', borderRadius: 10, padding: 10, marginTop: 4 },
  iconeRond: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: BRAND + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },

  cadreVisage: { alignSelf: 'center', width: 150, height: 190, borderRadius: 95, borderWidth: 3, borderColor: BRAND, borderStyle: 'dashed', backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  pastilleDuree: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  pastilleDureeTxt: { fontSize: 13, fontWeight: '700', color: '#555' },
  conseilLigne: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  conseilTxt: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },

  chrono: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  chronoTxt: { fontSize: 14, fontWeight: '700', color: '#555', textAlign: 'center' },

  centre: { alignItems: 'center', paddingTop: 32 },
  grandTitre: { fontSize: 18, fontWeight: '800', color: '#111', textAlign: 'center', marginTop: 12, marginBottom: 8 },
  sousTitre: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  saisie: { backgroundColor: '#fff', borderRadius: 12, padding: 12, fontSize: 14, minHeight: 110, borderWidth: 1, borderColor: '#e0e0e0' },
  compteur: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4, marginBottom: 10 },

  btnVert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: VERT, borderRadius: 12, paddingVertical: 14, marginBottom: 10 },
  btnVertTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondaire: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  btnSecondaireTxt: { color: '#333', fontWeight: '700', fontSize: 14 },
});
