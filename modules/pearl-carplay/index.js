// Accès JS à l'écran de la voiture (module natif local) : CarPlay sur iOS
// (PearlCarPlay), Android Auto sur Android (PearlAndroidAuto), même interface.
//
// Jamais d'exception : sans le module natif (Expo Go, build sans le module),
// chaque fonction répond « pas connecté », faux ou ne fait rien.
import { Platform } from 'react-native';

const NOM_NATIF = { ios: 'PearlCarPlay', android: 'PearlAndroidAuto' }[Platform.OS];

let natif = null;
if (NOM_NATIF) {
  try {
    // eslint-disable-next-line global-require
    const { requireOptionalNativeModule } = require('expo-modules-core');
    natif = requireOptionalNativeModule(NOM_NATIF);
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
