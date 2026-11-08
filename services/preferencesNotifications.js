/**
 * Réglages des notifications du livreur, gardés sur le serveur
 * (DeliveryDriverProfile.preferences_notifications). Toutes les clés valent
 * vrai par défaut. Le son des nouvelles courses est aussi gardé sur le
 * téléphone : la fenêtre « Nouvelle course » le lit sans réseau.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const ROUTE = '/api/v1/delivery/driver/notification-preferences/';
const CLE_SON_COURSE = 'notifications.sonCourse';

export const CLES_PREFERENCES = ['son_course', 'messages_clients', 'forte_demande', 'bonus_promos', 'recap_gains'];

// Valeur lue en mémoire (null : pas encore lue sur ce lancement).
let _sonCourse = null;
// Réponses arrivées dans le désordre : seule la plus récente demande garde
// le son sur le téléphone.
let _jeton = 0;

export function normaliserPreferences(brut) {
  const source = brut && typeof brut === 'object' ? brut : {};
  const prefs = {};
  CLES_PREFERENCES.forEach((cle) => {
    prefs[cle] = source[cle] !== false;
  });
  return prefs;
}

async function garderSonCourse(valeur) {
  _sonCourse = valeur !== false;
  try {
    await AsyncStorage.setItem(CLE_SON_COURSE, _sonCourse ? '1' : '0');
  } catch {
    // Stockage indisponible : la valeur reste en mémoire.
  }
}

/** Réglages du serveur, valeurs par défaut remplies. Lève en cas d'échec. */
export async function lirePreferences() {
  const jeton = ++_jeton;
  const res = await api.get(ROUTE);
  const prefs = normaliserPreferences(res?.data);
  if (jeton === _jeton) await garderSonCourse(prefs.son_course);
  return prefs;
}

/** Enregistre un seul réglage. Lève en cas d'échec. */
export async function modifierPreference(cle, valeur) {
  const jeton = ++_jeton;
  const res = await api.patch(ROUTE, { [cle]: !!valeur });
  const prefs = normaliserPreferences(res?.data);
  if (jeton === _jeton) await garderSonCourse(prefs.son_course);
  return prefs;
}

/** Son des nouvelles courses voulu ? Vrai tant que rien n'est connu. */
export async function sonCourseActif() {
  if (_sonCourse !== null) return _sonCourse;
  try {
    const brut = await AsyncStorage.getItem(CLE_SON_COURSE);
    _sonCourse = brut !== '0';
  } catch {
    _sonCourse = true;
  }
  return _sonCourse;
}
