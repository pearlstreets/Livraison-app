import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

// Caméra utilisable pour le selfie vidéo ? Valeur gardée en mémoire et lue par
// l'intercepteur de services/api.js (en-tête X-Pearl-Selfie : 1 ou 0). Le
// serveur n'impose la vérification qu'aux appareils qui peuvent filmer.

let cameraDisponible = true;

export function enteteSelfie() {
  return cameraDisponible ? '1' : '0';
}

export function marquerCameraIndisponible() {
  cameraDisponible = false;
}

// iOS : filmer une vidéo touche au micro ; sans NSMicrophoneUsageDescription
// dans le binaire, iOS ferme l'app. Les binaires jusqu'au build 1014 n'ont pas
// cette description : pas de selfie demandé sur ces binaires (en-tête 0).
// Le build qui l'ajoute à app.json doit porter un numéro >= IOS_BUILD_MIN_SELFIE.
const IOS_BUILD_MIN_SELFIE = 1015;

function iosSansMicro() {
  if (Platform.OS !== 'ios') return false;
  const build = Number(Application.nativeBuildVersion);
  const description = Constants.expoConfig?.ios?.infoPlist?.NSMicrophoneUsageDescription;
  return !(build >= IOS_BUILD_MIN_SELFIE) || !description;
}

// Refus définitif (canAskAgain false) ou permission absente du binaire
// (erreur de lecture) : caméra indisponible. Jamais demandée : disponible.
export async function verifierCameraSelfie() {
  if (iosSansMicro()) {
    cameraDisponible = false;
    return false;
  }
  try {
    const perm = await ImagePicker.getCameraPermissionsAsync();
    cameraDisponible = !!perm && (perm.granted === true || perm.canAskAgain !== false);
  } catch {
    cameraDisponible = false;
  }
  return cameraDisponible;
}

// Au lancement, puis à chaque retour au premier plan (réglages modifiés).
verifierCameraSelfie();
AppState.addEventListener('change', (etat) => {
  if (etat === 'active') verifierCameraSelfie();
});
