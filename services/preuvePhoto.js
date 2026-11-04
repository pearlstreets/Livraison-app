import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
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
export async function prendrePhoto() {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) {
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets?.length) return null;
      return res.assets[0].uri;
    }
  } catch {
    // caméra indisponible : repli sur la galerie
  }
  try {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets?.length) return res.assets[0].uri;
  } catch {
    // galerie indisponible aussi
  }
  return { indisponible: true };
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
  const code = err?.response?.status;
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

// Renvoie les preuves gardées sur le téléphone (appelé à l'ouverture de
// l'écran de course et avant chaque nouvel envoi).
export async function renvoyerPreuvesEnAttente() {
  const liste = await lireFile();
  if (!liste.length) return;
  const restantes = [];
  for (const p of liste) {
    try {
      await envoyerUneFois(p.assignmentId, p.kind, p.uri);
    } catch (err) {
      if (!refusDefinitif(err)) restantes.push(p);
    }
  }
  await ecrireFile(restantes);
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
  const liste = await lireFile();
  liste.push({ assignmentId, kind, uri, at: Date.now() });
  await ecrireFile(liste);
  return 'en_attente';
}
