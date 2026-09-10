import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

// Premier build Android dont le manifeste porte la clé Google Maps
// (app.json > android.config.googleMaps.apiKey). Sur un binaire plus ancien,
// monter une MapView fait planter l'app en natif (« API key not found ») :
// aucun try/catch JavaScript ne peut l'intercepter.
const FIRST_ANDROID_BUILD_WITH_MAPS_KEY = 1008;

// versionCode du BINAIRE installé, lu dans la config embarquée au build.
// Constants.expoConfig ne convient pas : après une mise à jour OTA, il reflète
// app.json au moment de la publication, pas le binaire réellement installé.
function installedAndroidBuild() {
  try {
    const raw = requireOptionalNativeModule('ExponentConstants')?.manifest;
    const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Number(config?.android?.versionCode) || 0;
  } catch {
    return 0;
  }
}

export const mapsAvailable =
  Platform.OS !== 'android' || installedAndroidBuild() >= FIRST_ANDROID_BUILD_WITH_MAPS_KEY;
