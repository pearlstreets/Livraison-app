import { AppState } from 'react-native';
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

// Refus définitif (canAskAgain false) ou permission absente du binaire
// (erreur de lecture) : caméra indisponible. Jamais demandée : disponible.
export async function verifierCameraSelfie() {
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
