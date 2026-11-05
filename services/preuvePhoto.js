import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { requireOptionalNativeModule } from 'expo';
import api from './api';

// Preuves photo d'une course (ticket au retrait, sac posé devant la porte).
// Envoi au point existant du serveur (AssignmentPhotoUploadView, seul le
// livreur de la course). Réseau en panne : quelques essais, puis la preuve est
// gardée sur le téléphone et renvoyée plus tard, sans jamais bloquer le livreur.

const CLE_FILE = 'pearl_preuves_photo_en_attente';
const DELAIS_ESSAIS_MS = [0, 2000, 5000];

// Ouvre la caméra ; caméra refusée ou indisponible (binaire Android sans la
// permission CAMERA, refus sur iOS) : sélecteur de photos du système, sans
// permission. Renvoie l'URI de la photo, null si la caméra a été annulée,
// { indisponible: true } si aucune photo n'a pu être obtenue.
// Accès caméra demandé À L'AVANCE (dès l'étape de retrait) : l'appui sur
// « Photographier le ticket » ouvre la caméra sans attendre cette demande.
// Accès refusé : rien n'est gardé, la demande est refaite au prochain essai.
let accesCamera = null;
export function preparerCamera() {
  if (!accesCamera) {
    accesCamera = ImagePicker.getCameraPermissionsAsync()
      .then((p) => (p.granted || !p.canAskAgain ? p : ImagePicker.requestCameraPermissionsAsync()))
      .then((p) => { if (!p.granted) accesCamera = null; return p; })
      .catch(() => { accesCamera = null; return { granted: false }; });
  }
  return accesCamera;
}

export async function prendrePhoto() {
  try {
    const perm = await preparerCamera();
    if (perm.granted) {
      // Qualité 0.3 sans EXIF : photo du ticket compressée et envoyée bien plus vite.
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, exif: false });
      if (res.canceled || !res.assets?.length) return null;
      return res.assets[0].uri;
    }
  } catch {
    // caméra indisponible : repli sur la galerie
  }
  try {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.3, exif: false });
    if (!res.canceled && res.assets?.length) return res.assets[0].uri;
  } catch {
    // galerie indisponible aussi
  }
  return { indisponible: true };
}

// Appareil photo intégré (expo-camera + expo-image-manipulator, 05/11/2026).
// Les binaires 1.0.5 à 1.0.7 n'embarquent PAS ces modules natifs et reçoivent
// pourtant les mises à jour à distance : leurs fichiers JS appellent
// requireNativeModule dès leur chargement, ce qui planterait. On sonde donc
// d'abord les modules natifs (requireOptionalNativeModule rend null sans rien
// lever), et on ne charge les modules JS qu'ensuite, par un require différé.
// Module absent : chemin d'origine, prendrePhoto (expo-image-picker).
let modulesCamera; // undefined : pas encore sondé ; null : indisponible
function chargerModulesCamera() {
  if (modulesCamera !== undefined) return modulesCamera;
  modulesCamera = null;
  try {
    if (requireOptionalNativeModule('ExpoCamera') && requireOptionalNativeModule('ExpoImageManipulator')) {
      const camera = require('expo-camera');
      const manip = require('expo-image-manipulator');
      if (camera?.CameraView && manip?.manipulateAsync) modulesCamera = { camera, manip };
    }
  } catch {
    modulesCamera = null;
  }
  return modulesCamera;
}

// Composant CameraView, ou null si le binaire ne l'a pas.
export function composantCamera() {
  return chargerModulesCamera()?.camera.CameraView || null;
}

// Préchargement à l'étape de retrait : modules chargés et autorisation lue
// (sans la demander), pour que l'appareil s'ouvre sans attente.
let autorisationConnue = false;
export function prechargerCamera() {
  const m = chargerModulesCamera();
  if (!m || autorisationConnue) return;
  m.camera.Camera.getCameraPermissionsAsync()
    .then((p) => { autorisationConnue = !!p?.granted; })
    .catch(() => {});
}

// true si l'appareil intégré peut s'ouvrir (module présent et caméra
// autorisée, demandée au besoin). false : passer par prendrePhoto.
export async function cameraIntegreePrete() {
  const m = chargerModulesCamera();
  if (!m) return false;
  if (autorisationConnue) return true;
  try {
    let p = await m.camera.Camera.getCameraPermissionsAsync();
    if (!p?.granted && p?.canAskAgain !== false) p = await m.camera.Camera.requestCameraPermissionsAsync();
    autorisationConnue = !!p?.granted;
    return autorisationConnue;
  } catch {
    return false;
  }
}

// Photo allégée : côté le plus long ramené à 1280 px, JPEG compressé à 0.5,
// sans EXIF (le réencodage les retire). Environ 100 à 200 Ko. En cas d'échec,
// la photo d'origine est gardée : le livreur n'est jamais bloqué.
const COTE_MAX = 1280;
export async function allegerPhoto(photo) {
  const uri = photo?.uri;
  const m = chargerModulesCamera();
  if (!uri || !m) return uri || null;
  try {
    const w = photo.width || 0;
    const h = photo.height || 0;
    const actions = [];
    if (Math.max(w, h) > COTE_MAX || !w || !h) actions.push({ resize: w >= h ? { width: COTE_MAX } : { height: COTE_MAX } });
    const res = await m.manip.manipulateAsync(uri, actions, { compress: 0.5, format: m.manip.SaveFormat.JPEG });
    return res?.uri || uri;
  } catch {
    return uri;
  }
}

async function envoyerUneFois(assignmentId, kind, uri) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('photo', { uri, name: `${kind}.jpg`, type: 'image/jpeg' });
  await api.post(`/api/v1/delivery/assignments/${assignmentId}/photo/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
}

// Refus définitif du serveur (photo illisible, course d'un autre, annulée) :
// inutile de réessayer.
function refusDefinitif(err) {
  // Erreurs de services/api.js : le code HTTP est dans `status`.
  const code = err?.status;
  return code >= 400 && code < 500 && code !== 408 && code !== 429;
}

async function lireFile() {
  try {
    const brut = await AsyncStorage.getItem(CLE_FILE);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

async function ecrireFile(liste) {
  try {
    await AsyncStorage.setItem(CLE_FILE, JSON.stringify(liste.slice(-20)));
  } catch {
    // stockage indisponible : la preuve est perdue, le livreur n'est pas bloqué
  }
}

// Chaque lecture puis écriture de la file passe à son tour : une preuve
// ajoutée pendant un renvoi n'est jamais écrasée.
let fileVerrou = Promise.resolve();
function modifierFile(changer) {
  const suite = fileVerrou.then(async () => {
    const liste = await lireFile();
    await ecrireFile(changer(liste));
  });
  fileVerrou = suite.catch(() => {});
  return suite;
}

const memePreuve = (a, b) => a.assignmentId === b.assignmentId && a.kind === b.kind && a.uri === b.uri && a.at === b.at;

// Renvoie les preuves gardées sur le téléphone (appelé à l'ouverture de
// l'écran de course et avant chaque nouvel envoi). Un seul renvoi à la fois.
let renvoiEnCours = null;
export function renvoyerPreuvesEnAttente() {
  if (!renvoiEnCours) {
    renvoiEnCours = (async () => {
      await fileVerrou;
      const liste = await lireFile();
      if (!liste.length) return;
      const finies = [];
      for (const p of liste) {
        try {
          await envoyerUneFois(p.assignmentId, p.kind, p.uri);
          finies.push(p);
        } catch (err) {
          if (refusDefinitif(err)) finies.push(p);
        }
      }
      // Retire seulement les preuves traitées ; celles ajoutées entre-temps restent.
      if (finies.length) await modifierFile((actuelle) => actuelle.filter((p) => !finies.some((f) => memePreuve(f, p))));
    })().finally(() => { renvoiEnCours = null; });
  }
  return renvoiEnCours;
}

// Envoie une preuve. Résout 'envoyee', 'en_attente' (gardée, renvoyée plus
// tard), 'echec' (non gardée, `garder: false`) ou 'refusee' (refus du
// serveur). Ne rejette jamais.
export async function envoyerPreuve(assignmentId, kind, uri, { garder = true } = {}) {
  if (!assignmentId || !uri) return 'en_attente';
  renvoyerPreuvesEnAttente().catch(() => {});
  for (const delai of DELAIS_ESSAIS_MS) {
    if (delai) await new Promise((r) => setTimeout(r, delai));
    try {
      await envoyerUneFois(assignmentId, kind, uri);
      return 'envoyee';
    } catch (err) {
      if (refusDefinitif(err)) return 'refusee';
    }
  }
  if (!garder) return 'echec';
  await modifierFile((liste) => [...liste, { assignmentId, kind, uri, at: Date.now() }]);
  return 'en_attente';
}

// QR code du ticket imprimé par le commerçant (05/11/2026) : texte commençant
// par PSTICKET1:, vérifié par le serveur pour CETTE course. Résout 'ok',
// 'autre_commande', 'code_invalide' ou 'erreur' (réseau, serveur). Ne rejette
// jamais : la photo reste toujours possible.
export const PREFIXE_TICKET_QR = 'PSTICKET1:';
export async function verifierTicketQr(assignmentId, code) {
  if (!assignmentId || typeof code !== 'string' || !code.startsWith(PREFIXE_TICKET_QR)) return 'code_invalide';
  try {
    const res = await api.post(`/api/v1/delivery/assignments/${assignmentId}/ticket-scan/`, { code }, { timeout: 10000 });
    if (res?.data?.ok === true) return 'ok';
    return res?.data?.raison === 'autre_commande' ? 'autre_commande' : 'code_invalide';
  } catch (err) {
    const raison = err?.serverData?.raison;
    if (raison === 'autre_commande') return 'autre_commande';
    if (raison === 'code_invalide' || err?.status === 400) return 'code_invalide';
    return 'erreur';
  }
}
