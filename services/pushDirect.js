/**
 * Push en envoi direct, sans OneSignal : jeton Firebase (Android) ou Apple
 * (iPhone) du téléphone, enregistré sur notre serveur, qui envoie lui-même.
 *
 * Le serveur cible l'id du PROFIL livreur (même cible que l'ancien
 * OneSignal.login) : il le déduit seul du compte connecté
 * (UserApp/api/notifications_views.py, `_direct_external_id`).
 *
 * Tout est fail-open : sans autorisation, sans réseau ou sans module natif,
 * l'app continue normalement, simplement sans push.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { binaireAvecSon, CANAL_COURSES_MUET, CANAL_COURSES_SON, SON_COURSE } from './sonCourse';
import translations from '../contexts/translations';

// Canal Android de toutes les notifications livreur (nouvelle course en
// tête) : importance haute, donc bandeau et son. Nouvel id exprès : un canal
// existant (« default », importance normale) ne peut plus changer
// d'importance chez qui l'a déjà. Déclaré aussi comme canal par défaut de
// Firebase dans app.json (plugin expo-notifications, `defaultChannel`).
export const CANAL_ANDROID = 'courses';

const CLE_APPAREIL = 'pushDirect.cleAppareil';
// Clés dont le retrait côté serveur a échoué (réseau, session perdue),
// rejouées au prochain enregistrement.
const CLE_REVOCATIONS = 'pushDirect.revocationsEnAttente';
const ROUTE_ENREGISTRER = '/api/v1/notifications/device-tokens/direct/';
const ROUTE_RETIRER = '/api/v1/notifications/device-tokens/current/';

let _abonnementJeton = null;
let _enCours = null;

// Nom d'un canal dans la langue de l'app (Réglages > Notifications) :
// Android renomme un canal existant quand on le recrée avec le même id, ce
// que fait signalerLangue() au changement de langue. Repli : texte français.
function nomCanal(langue, cle, repli) {
  try {
    const texte = (langue && translations[langue]?.[cle]) || translations.fr?.[cle];
    return typeof texte === 'string' && texte ? texte : repli;
  } catch {
    return repli;
  }
}

async function preparerCanal() {
  if (Platform.OS !== 'android') return;
  const langue = await langueAffichee();
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
      name: nomCanal(langue, 'notifCanalCoursesMessages', 'Courses et messages'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Canal non créé : Android affiche quand même, dans le canal de repli.
  }
  // Canal muet des nouvelles courses (réglage « Son de nouvelle course »
  // coupé) : créé sur toutes les versions, sinon un livreur qui a coupé le
  // son l'entendrait quand même (Android se replierait sur « courses »).
  try {
    await Notifications.setNotificationChannelAsync(CANAL_COURSES_MUET, {
      name: nomCanal(langue, 'notifCanalCoursesSansSon', 'Nouvelles courses sans son'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Canal non créé : repli sur le canal « courses ».
  }
  // Canal avec le son de l'app : un canal ne change plus de son une fois
  // créé, donc seulement sur un binaire qui contient le son (1.0.9 et plus).
  // Binaire plus ancien : Android se replie sur le canal « courses ».
  if (!binaireAvecSon()) return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_COURSES_SON, {
      name: nomCanal(langue, 'notifCanalNouvellesCourses', 'Nouvelles courses'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: SON_COURSE,
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Canal non créé : repli sur le canal « courses ».
  }
}

/**
 * Seule demande d'autorisation de l'app (il y en avait deux, OneSignal et
 * Expo). Renvoie true si les notifications sont permises.
 */
export async function demanderAutorisation() {
  // Pas de test « vrai téléphone » : un émulateur Android avec les services
  // Google reçoit les push Firebase. Sans jeton (simulateur iPhone), l'appel
  // échoue plus loin et reste sans effet.
  try {
    await preparerCanal();
    const actuel = await Notifications.getPermissionsAsync();
    if (actuel.status === 'granted') return true;
    if (actuel.canAskAgain === false) return false;
    const reponse = await Notifications.requestPermissionsAsync();
    return reponse.status === 'granted';
  } catch {
    return false;
  }
}

// Environnement Apple réellement signé dans le binaire : un build de
// développement reçoit par le bac à sable, tout autre build par la prod.
// Se tromper rendrait le jeton refusé (et révoqué) par Apple.
async function fournisseurIos() {
  try {
    const Application = require('expo-application');
    if (typeof Application.getIosPushNotificationServiceEnvironmentAsync === 'function') {
      const env = await Application.getIosPushNotificationServiceEnvironmentAsync();
      if (env === 'development') return 'apns_sandbox';
      if (env === 'production') return 'apns';
    }
  } catch {
    // Module absent : repli ci-dessous.
  }
  return __DEV__ ? 'apns_sandbox' : 'apns';
}

async function lireRevocations() {
  try {
    const brut = await AsyncStorage.getItem(CLE_REVOCATIONS);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

async function ecrireRevocations(liste) {
  try {
    if (liste.length) await AsyncStorage.setItem(CLE_REVOCATIONS, JSON.stringify(liste));
    else await AsyncStorage.removeItem(CLE_REVOCATIONS);
  } catch { /* sans gravité */ }
}

async function marquerRevocation(cle) {
  if (!cle) return;
  const liste = await lireRevocations();
  if (!liste.includes(cle)) await ecrireRevocations([...liste, cle]);
}

// Rejouées AVANT l'envoi du jeton : la même clé peut ensuite revenir au
// compte connecté. Avec un autre compte, la route filtre par propriétaire
// et ne retire rien, la révocation est alors abandonnée.
async function rejouerRevocations() {
  const liste = await lireRevocations();
  if (!liste.length) return;
  const restantes = [];
  for (const cle of liste) {
    try {
      await api.delete(ROUTE_RETIRER, { params: { player_id: cle }, timeout: 4000 });
    } catch (e) {
      if (e?.status !== 404) restantes.push(cle);
    }
  }
  await ecrireRevocations(restantes);
}

// Langue affichée par l'app (contexts/LanguageContext.js, clé DRIVER_LANG,
// français par défaut comme l'écran) : le serveur écrit les notifications de
// ce téléphone dans cette langue. Valeur inconnue : rien d'envoyé, le serveur
// garde la langue du compte.
const LANGUES_APP = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'ru', 'sv', 'th', 'zh'];

async function langueAffichee() {
  try {
    const code = (await AsyncStorage.getItem('DRIVER_LANG')) || 'fr';
    return LANGUES_APP.includes(code) ? code : null;
  } catch {
    return null;
  }
}

async function envoyerJeton(jeton) {
  if (!jeton || !jeton.data) return;
  const ios = Platform.OS === 'ios';
  const corps = {
    app_kind: 'delivery',
    platform: ios ? 'ios' : 'android',
    provider: ios ? await fournisseurIos() : 'fcm',
    push_token: String(jeton.data),
    app_version: String(Constants.expoConfig?.version || ''),
  };
  const langue = await langueAffichee();
  if (langue) corps.langue = langue;
  let ancienne = null;
  try { ancienne = await AsyncStorage.getItem(CLE_APPAREIL); } catch { /* illisible */ }
  const res = await api.post(ROUTE_ENREGISTRER, corps);
  const cle = res?.data?.onesignal_player_id ? String(res.data.onesignal_player_id) : null;
  if (!cle) return;
  // Jeton renouvelé : l'ancienne ligne du serveur est retirée.
  if (ancienne && ancienne !== cle) {
    try {
      await api.delete(ROUTE_RETIRER, { params: { player_id: ancienne }, timeout: 4000 });
    } catch { /* l'ancien jeton finira refusé et nettoyé */ }
  }
  await AsyncStorage.setItem(CLE_APPAREIL, cle);
}

/**
 * Enregistre ce téléphone pour le livreur connecté. À appeler après chaque
 * connexion ou chargement du profil : idempotent côté serveur (même jeton,
 * même ligne), et un changement de compte sur le même téléphone retire
 * l'appareil de l'ancien compte. Ne lève jamais.
 */
export function enregistrerAppareil() {
  if (_enCours) return _enCours;
  _enCours = (async () => {
    try {
      try { await rejouerRevocations(); } catch { /* nouvel essai au prochain */ }
      if (!(await demanderAutorisation())) return;
      // Jeton renouvelé par Firebase ou Apple : on renvoie le nouveau. Posé
      // avant l'envoi, pour rester en place même si celui-ci échoue.
      if (!_abonnementJeton) {
        _abonnementJeton = Notifications.addPushTokenListener((nouveau) => {
          envoyerJeton(nouveau).catch(() => {});
        });
      }
      const jeton = await Notifications.getDevicePushTokenAsync();
      await envoyerJeton(jeton);
    } catch {
      // Pas de jeton (réseau, Play Services absent) : nouvel essai au
      // prochain chargement du profil.
    } finally {
      _enCours = null;
    }
  })();
  return _enCours;
}

/**
 * Retire ce téléphone du compte. À appeler AVANT d'effacer la session (la
 * route exige d'être connecté). Ne lève jamais : un échec n'empêche pas la
 * déconnexion, le retrait est alors rejoué au prochain enregistrement.
 */
export async function retirerAppareil() {
  if (_abonnementJeton) {
    try { _abonnementJeton.remove(); } catch { /* déjà retiré */ }
    _abonnementJeton = null;
  }
  let cle = null;
  try { cle = await AsyncStorage.getItem(CLE_APPAREIL); } catch { /* illisible */ }
  if (!cle) return;
  try {
    // Délai court : la déconnexion n'attend jamais plus de 4 secondes.
    await api.delete(ROUTE_RETIRER, { params: { player_id: cle }, timeout: 4000 });
  } catch (e) {
    // Session déjà expirée ou réseau coupé : retrait gardé en attente.
    if (e?.status !== 404) {
      await marquerRevocation(cle);
      return;
    }
  }
  try { await AsyncStorage.removeItem(CLE_APPAREIL); } catch { /* sans gravité */ }
}

/**
 * Session déjà perdue, sans appel serveur possible : le retrait de
 * l'appareil est gardé en attente, rejoué au prochain enregistrement.
 */
export function oublierAppareil() {
  if (_abonnementJeton) {
    try { _abonnementJeton.remove(); } catch { /* déjà retiré */ }
    _abonnementJeton = null;
  }
  AsyncStorage.getItem(CLE_APPAREIL)
    .then((cle) => marquerRevocation(cle))
    .catch(() => {});
}

/**
 * Langue de l'app changée : renvoie le jeton avec la nouvelle langue, mais
 * seulement si ce téléphone est déjà enregistré (livreur connecté). Avant la
 * connexion, rien : ni demande d'autorisation ni appel. Ne lève jamais.
 */
export async function signalerLangue() {
  try {
    if (!(await AsyncStorage.getItem(CLE_APPAREIL))) return;
    // Canaux Android renommés dans la nouvelle langue : déjà fait par
    // enregistrerAppareil() ci-dessous (demanderAutorisation, preparerCanal).
    // Envoi déjà en cours avec l'ancienne langue : on attend sa fin, puis
    // on renvoie avec la nouvelle.
    if (_enCours) await _enCours;
    await enregistrerAppareil();
  } catch { /* nouvel envoi au prochain lancement */ }
}
