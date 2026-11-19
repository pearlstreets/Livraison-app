/**
 * Haptique des sons : Android seulement, avec les motifs du catalogue
 * (attente, vibration, attente, vibration... en ms, impulsions de 8 à 60 ms).
 *
 * Rien sur iOS : Vibration y dure environ 400 ms, sans motif possible
 * (expo-haptics viendra au prochain build natif). Coupée avec le réglage
 * « Sons de l'application » (index.js n'appelle vibrer que s'il joue).
 * Permission VIBRATE déjà déclarée dans AndroidManifest.xml.
 */
import {Platform, Vibration} from 'react-native';

export function vibrer(motif) {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!Array.isArray(motif) || motif.length < 2) {
    return;
  }
  try {
    const propre = motif.map(n => Math.max(0, Math.round(Number(n) || 0)));
    Vibration.vibrate(propre, false);
  } catch (e) {}
}
