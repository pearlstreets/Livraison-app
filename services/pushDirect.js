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
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// Canal Android de toutes les notifications livreur (nouvelle course en
// tête) : importance haute, donc bandeau et son. Nouvel id exprès : un canal
// existant (« default », importance normale) ne peut plus changer
// d'importance chez qui l'a déjà. Déclaré aussi comme canal par défaut de
// Firebase dans app.json (plugin expo-notifications, `defaultChannel`).
export const CANAL_ANDROID = 'courses';

const CLE_APPAREIL = 'pushDirect.cleAppareil';
const ROUTE_ENREGISTRER = '/api/v1/notifications/device-tokens/direct/';
const ROUTE_RETIRER = '/api/v1/notifications/device-tokens/current/';

let _abonnementJeton = null;
let _enCours = null;

async function preparerCanal() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
      name: 'Courses et messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Canal non créé : Android affiche quand même, dans le canal de repli.
  }
}

/**
 * Seule demande d'autorisation de l'app (il y en avait deux, OneSignal et
 * Expo). Renvoie true si les notifications sont permises.
 */
export async function demanderAutorisation() {
  if (!Device.isDevice) return false;
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
  const res = await api.post(ROUTE_ENREGISTRER, corps);
  const cle = res?.data?.onesignal_player_id;
  if (cle) await AsyncStorage.setItem(CLE_APPAREIL, String(cle));
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
      if (!(await demanderAutorisation())) return;
      const jeton = await Notifications.getDevicePushTokenAsync();
      await envoyerJeton(jeton);
      // Jeton renouvelé par Firebase ou Apple : on renvoie le nouveau.
      if (!_abonnementJeton) {
        _abonnementJeton = Notifications.addPushTokenListener((nouveau) => {
          envoyerJeton(nouveau).catch(() => {});
        });
      }
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
 * déconnexion, et le compte suivant reprendra l'appareil de toute façon.
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
  } catch {
    // Session déjà expirée ou réseau coupé : rien de plus à faire ici.
  }
  try { await AsyncStorage.removeItem(CLE_APPAREIL); } catch { /* sans gravité */ }
}

/** Oublie l'appareil localement, sans appel serveur (session déjà perdue). */
export function oublierAppareil() {
  if (_abonnementJeton) {
    try { _abonnementJeton.remove(); } catch { /* déjà retiré */ }
    _abonnementJeton = null;
  }
  AsyncStorage.removeItem(CLE_APPAREIL).catch(() => {});
}
