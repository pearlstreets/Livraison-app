import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { navigate } from './navigationService';
import translations from '../contexts/translations';

// Vérification d'identité du livreur par selfie vidéo de 3 secondes (comme
// Uber) : demandée au passage en ligne, sur signalement ou au hasard pendant
// une course. Un échec bloque le compte 24 h, avec appel possible pendant 48 h.

const BASE = '/api/v1/delivery/identite';
const TAILLE_MAX_VIDEO = 30 * 1024 * 1024;

export const identiteService = {
  // EtatIdentite : { bloque, blocage, verification }.
  async getEtat() {
    const { data } = await api.get(`${BASE}/etat/`);
    return data?.data || null;
  },

  // `video` : { uri, mimeType, fileName }. Réponse : { status, resultat,
  // is_online, identite }.
  async envoyerVideo(verificationId, video) {
    const uri = video.uri;
    const mov = /\.mov$/i.test(uri || '') || /quicktime/i.test(video.mimeType || '');
    const form = new FormData();
    form.append('video', {
      uri,
      name: mov ? 'selfie.mov' : 'selfie.mp4',
      type: video.mimeType || (mov ? 'video/quicktime' : 'video/mp4'),
    });
    const { data } = await api.post(`${BASE}/verification/${verificationId}/video/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return data;
  },

  async annuler(verificationId) {
    const { data } = await api.post(`${BASE}/verification/${verificationId}/annuler/`, {});
    return data;
  },

  // Après les 24 h de blocage : nouvelle vérification (motif deblocage).
  async demanderDeblocage() {
    const { data } = await api.post(`${BASE}/deblocage/`, {});
    return data;
  },

  // Appel du blocage, 10 à 2000 caractères. La réponse de l'IA arrive dans la
  // même réponse.
  async faireAppel(message) {
    const { data } = await api.post(`${BASE}/appel/`, { message });
    return data;
  },
};

export { TAILLE_MAX_VIDEO };

// Vidéo filmée mais pas encore reçue par le serveur (réseau coupé, délai
// dépassé, erreur 5xx) : gardée, avec son chemin local, pour être renvoyée
// automatiquement, même après une fermeture de l'app. Le serveur l'accepte
// jusqu'à 15 min après l'échéance de la vérification. Oubliée seulement après
// une réponse 200, 400 ou 409.
const CLE_VIDEO_EN_ATTENTE = 'IDV_VIDEO_EN_ATTENTE';
const MARGE_RENVOI_MS = 15 * 60 * 1000;
let videoEnAttente = null;

export function erreurAReessayer(e) {
  const statut = e?.status;
  return !statut || statut >= 500;
}

// `echeance` : fin de la vérification (ms), 15 min de marge en plus.
export async function garderVideoEnAttente(verificationId, video, echeance) {
  videoEnAttente = {
    verificationId: String(verificationId),
    video: { uri: video.uri, mimeType: video.mimeType || null },
    limite: (Number.isFinite(echeance) ? echeance : Date.now()) + MARGE_RENVOI_MS,
  };
  try {
    await AsyncStorage.setItem(CLE_VIDEO_EN_ATTENTE, JSON.stringify(videoEnAttente));
  } catch {
    // Stockage indisponible : la vidéo reste gardée en mémoire.
  }
  return videoEnAttente;
}

export async function lireVideoEnAttente(verificationId) {
  if (!videoEnAttente) {
    try {
      const brut = await AsyncStorage.getItem(CLE_VIDEO_EN_ATTENTE);
      videoEnAttente = brut ? JSON.parse(brut) : null;
    } catch {
      videoEnAttente = null;
    }
  }
  if (!videoEnAttente) return null;
  if (videoEnAttente.limite < Date.now()) {
    await oublierVideoEnAttente();
    return null;
  }
  if (verificationId != null && videoEnAttente.verificationId !== String(verificationId)) return null;
  return videoEnAttente;
}

export async function oublierVideoEnAttente() {
  videoEnAttente = null;
  try {
    await AsyncStorage.removeItem(CLE_VIDEO_EN_ATTENTE);
  } catch {
    // Rien à faire.
  }
}

// Vérifications déjà montrées au livreur : une seule alerte par vérification.
const verificationsVues = new Set();

export function marquerVerificationVue(id) {
  if (id != null) verificationsVues.add(String(id));
}

// Ouvre l'écran de vérification d'identité (onglet Accueil), depuis n'importe
// où dans l'app. `etat` : EtatIdentite déjà connu, rafraîchi par l'écran.
export function ouvrirVerification(etat) {
  if (etat && etat.verification && etat.verification.id != null) marquerVerificationVue(etat.verification.id);
  navigate('Accueil', { screen: 'VerificationIdentite', params: { etat: etat || null } });
}

async function traducteur() {
  let langue = 'fr';
  try {
    const choisie = await AsyncStorage.getItem('DRIVER_LANG');
    if (choisie && translations[choisie]) langue = choisie;
  } catch {
    // Langue illisible : français.
  }
  return (cle) => translations[langue]?.[cle] ?? translations.fr?.[cle] ?? cle;
}

// Réponse de POST location/ portant `identite` : vérification demandée pendant
// la course. Alerte une seule fois par vérification, sans couper la course ;
// application en arrière-plan : l'alerte attend le prochain envoi au premier plan.
export async function signalerIdentiteCourse(identite) {
  const verification = identite && identite.verification;
  if (!verification || verification.id == null) return;
  const cle = String(verification.id);
  if (verificationsVues.has(cle)) return;
  if (AppState.currentState !== 'active') return;
  verificationsVues.add(cle);
  const t = await traducteur();
  Alert.alert(t('idvAlerteTitre'), t('idvAlerteCourseMsg'), [
    { text: t('idvPlusTard'), style: 'cancel' },
    { text: t('idvFaireMaintenant'), onPress: () => ouvrirVerification(identite) },
  ]);
}
