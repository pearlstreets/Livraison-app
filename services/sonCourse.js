/**
 * Son des nouvelles courses, joué une seule fois par course, quelle que soit
 * la page ouverte : la relève des courses (accueil ou veille globale d'App.js),
 * la push « available » reçue app ouverte et la fenêtre « Nouvelle course »
 * passent toutes par annoncerCourse(), qui ne sonne qu'à la première.
 *
 * Le son « nouvelle_commande.wav » n'existe que dans les binaires 1.0.9 et
 * plus (app.json, plugin expo-notifications). Sur un binaire plus ancien, le
 * son par défaut du téléphone est gardé, comme avant.
 */
import { Platform, Vibration } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { sonCourseActif } from './preferencesNotifications';

export const SON_COURSE = 'nouvelle_commande.wav';
// Canaux Android des nouvelles courses (même nom côté serveur). Un canal ne
// change plus de son une fois créé : ils ne sont créés que sur un binaire
// qui contient le son.
export const CANAL_COURSES_SON = 'nouvelles_courses';
export const CANAL_COURSES_MUET = 'nouvelles_courses_muet';
const VERSION_AVEC_SON = [1, 0, 9];

const VIBRATION_COURSE = [0, 400, 200, 400];
// Plusieurs courses d'un coup : un seul son.
const ANTI_REBOND_MS = 3000;
const MAX_CLES = 300;

const _annoncees = new Set();
let _dernierSon = 0;

function versionNative() {
  try {
    const Application = require('expo-application');
    if (Application?.nativeApplicationVersion) return String(Application.nativeApplicationVersion);
  } catch {
    // Module absent : repli ci-dessous.
  }
  return String(Constants?.nativeAppVersion || '');
}

/** Le binaire installé contient-il le son des courses (1.0.9 et plus) ? */
export function binaireAvecSon() {
  const morceaux = versionNative().split('.').map((n) => parseInt(n, 10));
  if (!morceaux.length || morceaux.some((n) => Number.isNaN(n))) return false;
  for (let i = 0; i < VERSION_AVEC_SON.length; i += 1) {
    const v = morceaux[i] || 0;
    if (v > VERSION_AVEC_SON[i]) return true;
    if (v < VERSION_AVEC_SON[i]) return false;
  }
  return true;
}

/** Clé d'une course : commande simulée, course de l'API ou push. */
export function cleAnnonce(course) {
  if (!course) return '';
  return String(course._uid || course.order_id || course.id || '');
}

function dejaAnnoncee(cle) {
  if (!cle) return false;
  if (_annoncees.has(cle)) return true;
  _annoncees.add(cle);
  if (_annoncees.size > MAX_CLES) {
    const premiere = _annoncees.values().next().value;
    _annoncees.delete(premiere);
  }
  return false;
}

async function jouerSon() {
  if (!(await sonCourseActif())) return;
  const avecSon = binaireAvecSon();
  const content = {
    title: '',
    body: '',
    sound: avecSon ? SON_COURSE : 'default',
    data: { status: 'available', sonSeul: true },
  };
  // Android : le son vient du canal. Binaire ancien : canal par défaut.
  const trigger = Platform.OS === 'android' && avecSon ? { channelId: CANAL_COURSES_SON } : null;
  await Notifications.scheduleNotificationAsync({ content, trigger });
}

/**
 * Annonce une course : vibration et son, une seule fois par course. Sans
 * clé, seul l'anti-rebond s'applique. Ne lève jamais.
 */
export function annoncerCourse(cle, course) {
  try {
    if (dejaAnnoncee(cle ? String(cle) : '')) return;
    prevenirNouvelleCourse({ cle: cle ? String(cle) : '', course: course || null });
    const maintenant = Date.now();
    if (maintenant - _dernierSon < ANTI_REBOND_MS) return;
    _dernierSon = maintenant;
    Vibration.vibrate(VIBRATION_COURSE);
    jouerSon().catch(() => {});
  } catch {
    // Annonce impossible : la course reste affichée.
  }
}

// Écrans prévenus d'une nouvelle course (le mini-jeu se met en pause).
const _ecouteurs = new Set();
// Chaque écouteur reçoit { cle, course } : la course complète quand elle
// vient d'une relève, seulement sa clé quand elle vient d'une push.
function prevenirNouvelleCourse(info) {
  _ecouteurs.forEach((fn) => {
    try { fn(info); } catch { /* Un écouteur en erreur ne bloque pas l'annonce. */ }
  });
}
/** Appelle fn à chaque nouvelle course annoncée ; renvoie la fonction de désabonnement. */
export function ecouterNouvelleCourse(fn) {
  if (typeof fn !== 'function') return () => {};
  _ecouteurs.add(fn);
  return () => { _ecouteurs.delete(fn); };
}

/** Course déjà vue par le livreur (notification touchée ou affichée) : plus de son. */
export function marquerAnnoncee(cle) {
  try {
    if (cle) dejaAnnoncee(String(cle));
  } catch {
    // Sans effet.
  }
}

/** Courses relevées app en arrière-plan : notées sans son (la push a sonné). */
export function marquerCoursesAnnoncees(liste) {
  if (!Array.isArray(liste)) return;
  liste.filter(Boolean).forEach((course) => marquerAnnoncee(cleAnnonce(course)));
}

/** Courses relevées sur le serveur : chaque nouvelle est annoncée. */
export function annoncerCourses(liste) {
  if (!Array.isArray(liste)) return;
  liste.filter(Boolean).forEach((course) => annoncerCourse(cleAnnonce(course), course));
}

// Dernière relève des courses disponibles, par n'importe quel écran : la
// veille globale ne double pas la relève de l'accueil.
let _derniereReleve = 0;
export function noterReleve() {
  _derniereReleve = Date.now();
}
export function derniereReleve() {
  return _derniereReleve;
}
