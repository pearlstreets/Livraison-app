// Accès JS à l'écran CarPlay (module natif local, iOS seulement).
//
// Jamais d'exception : sans le module natif (Android, Expo Go, iOS sans
// CarPlay, build sans l'option), chaque fonction répond « pas connecté »,
// faux ou ne fait rien.
import { Platform } from 'react-native';

let natif = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line global-require
    const { requireOptionalNativeModule } = require('expo-modules-core');
    natif = requireOptionalNativeModule('PearlCarPlay');
  } catch {
    natif = null;
  }
}

export const carPlayPresent = () => natif != null;

export function estConnecte() {
  try {
    return Boolean(natif && natif.estConnecte());
  } catch {
    return false;
  }
}

// evenement : 'surConnexion' ({ connecte }) ou 'surAction' ({ id, modale }).
export function ecouter(evenement, fn) {
  if (!natif || typeof natif.addListener !== 'function') return () => {};
  try {
    const abo = natif.addListener(evenement, fn);
    return () => { try { abo.remove(); } catch { /* déjà retiré */ } };
  } catch {
    return () => {};
  }
}

async function appeler(nom, ...args) {
  if (!natif || typeof natif[nom] !== 'function') return false;
  try {
    return Boolean(await natif[nom](...args));
  } catch {
    return false;
  }
}

// ecran : { titre, lignes: [{ titre, detail }], actions: [{ id, titre, style }] }
export const afficher = (ecran) => appeler('afficher', ecran);
// modale : { id, type: 'alerte' | 'feuille', titres: [...], message?, actions: [...] }
export const presenter = (modale) => appeler('presenter', modale);
export const fermerModale = (id) => appeler('fermerModale', id ?? null);
export const ouvrirUrl = (lien) => appeler('ouvrirUrl', lien);
