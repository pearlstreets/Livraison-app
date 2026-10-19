// Position du livreur, comme Uber : obligatoire pour passer en ligne, et
// envoyée aussi téléphone verrouillé (service avec notification « Vous êtes en
// ligne » sur Android, indicateur bleu sur iOS). Seul l'accès « pendant
// l'utilisation » est demandé, jamais « toujours ».
// Pour limiter les appels au serveur, une position n'est envoyée que si le
// livreur a bougé d'au moins 100 m, ou toutes les 4 minutes s'il reste sur
// place (le serveur n'envoie pas d'offre sur une position de plus de 10 min).
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { deliveryService } from './deliveryService';

export const TACHE_POSITION = 'pearl-delivery-position';
const DISTANCE_MIN_M = 100;
export const BATTEMENT_MS = 4 * 60 * 1000;

let dernierEnvoi = null;
let quandHorsLigne = null;

// Appelé quand le serveur répond que le livreur n'est plus en ligne
// (repassé hors ligne après 30 min sans position).
export function surRetourHorsLigne(fn) {
  quandHorsLigne = fn;
}

function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

// `mocked` : Android signale une position simulée (appli de fausse position).
// On ne bloque pas le livreur (faux positifs possibles), on le signale au serveur.
export async function envoyerPosition(lat, lng, { forcer = false, mocked = false } = {}) {
  const maintenant = Date.now();
  if (!forcer && dernierEnvoi
    && distanceM(dernierEnvoi, { lat, lng }) < DISTANCE_MIN_M
    && maintenant - dernierEnvoi.t < BATTEMENT_MS) {
    return true;
  }
  const precedent = dernierEnvoi;
  dernierEnvoi = { lat, lng, t: maintenant };
  try {
    const data = await deliveryService.updateLocation(lat, lng, mocked === true);
    if (data && data.is_online === false && quandHorsLigne) quandHorsLigne();
    return true;
  } catch {
    // Réseau ou serveur indisponible : on retentera à la prochaine mesure.
    dernierEnvoi = precedent;
    return false;
  }
}

TaskManager.defineTask(TACHE_POSITION, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const derniere = data.locations[data.locations.length - 1];
  const { latitude, longitude } = derniere.coords;
  await envoyerPosition(latitude, longitude, { mocked: derniere.mocked });
});

function avecDelai(promesse, ms) {
  return Promise.race([promesse, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// Demande l'accès à la position. S'il est refusé ou si la localisation du
// téléphone est coupée, propose d'ouvrir les réglages et renvoie null.
// Sinon renvoie les coordonnées (ou {} si le GPS n'a pas encore de mesure).
// « Approximative » (Android) ou « Position exacte » coupée (iOS) : comme Uber,
// pas de passage en ligne.
export function positionPrecise(permission) {
  return permission?.android?.accuracy !== 'coarse' && permission?.ios?.accuracy !== 'reduced';
}

export async function positionObligatoire(t) {
  try {
    const localisationActive = await Location.hasServicesEnabledAsync();
    const permission = localisationActive
      ? await Location.requestForegroundPermissionsAsync()
      : { status: 'denied' };
    if (permission.status === 'granted' && !positionPrecise(permission)) {
      Alert.alert(t('preciseLocationTitle'), t('preciseLocationMsg'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('openSettings'), onPress: () => Linking.openSettings() },
      ]);
      return null;
    }
    if (permission.status === 'granted') {
      const loc = await avecDelai(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        10000,
      ) || await Location.getLastKnownPositionAsync().catch(() => null);
      return loc ? { ...loc.coords, mocked: loc.mocked === true } : {};
    }
  } catch {
    // Traité comme un refus ci-dessous.
  }
  Alert.alert(t('locationRequiredTitle'), t('locationRequiredMsg'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('openSettings'), onPress: () => Linking.openSettings() },
  ]);
  return null;
}

async function suiviDemarre() {
  return Location.hasStartedLocationUpdatesAsync(TACHE_POSITION).catch(() => false);
}

// Démarrages et arrêts passent l'un après l'autre, jamais en même temps.
let file = Promise.resolve();
function enFile(fn) {
  file = file.then(fn, fn);
  return file;
}

// À lancer appli ouverte (Android refuse de démarrer le service en arrière-plan).
export function demarrerSuivi(t) {
  return enFile(async () => {
    if (await suiviDemarre()) return;
    await Location.startLocationUpdatesAsync(TACHE_POSITION, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: t('onlineNotifTitle'),
        notificationBody: t('onlineNotifBody'),
        notificationColor: '#00C29B',
      },
    });
  });
}

export function arreterSuivi() {
  return enFile(async () => {
    if (await suiviDemarre()) {
      await Location.stopLocationUpdatesAsync(TACHE_POSITION).catch(() => {});
    }
  });
}
