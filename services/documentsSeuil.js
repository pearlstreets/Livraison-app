import { Alert } from 'react-native';
import api from './api';
import { deepLink } from './deepLink';

// Documents demandés au livreur quand ses gains atteignent le seuil fixé par
// le serveur (RIB, pièce d'identité, justificatif de domicile). Le serveur
// décide de tout : l'app n'a aucun calcul de montant, elle affiche ce qu'il
// renvoie. Serveur ancien (404), réseau coupé ou réponse inattendue : null,
// l'app continue comme avant, sans bandeau.

const URL_SEUIL = '/api/v1/delivery/documents-seuil/';
const ETATS = new Set(['rien', 'rappel', 'en_verification', 'bloque', 'complet']);

// Données reconnues seulement : un `etat` connu et une liste de documents.
export function lireDonnees(brut) {
  const d = brut && typeof brut === 'object' && brut.data && typeof brut.data === 'object' ? brut.data : brut;
  if (!d || typeof d !== 'object' || !ETATS.has(d.etat)) return null;
  return { ...d, documents: Array.isArray(d.documents) ? d.documents.filter((x) => x && typeof x.cle === 'string') : [] };
}

// Dernières données connues, partagées entre l'accueil et l'écran des
// documents (une réponse 403 « documents_requis » les met à jour aussi).
let dernieres = null;
const abonnes = new Set();

export function donneesConnues() {
  return dernieres;
}

export function publier(donnees) {
  if (!donnees) return;
  dernieres = donnees;
  abonnes.forEach((fn) => {
    try { fn(donnees); } catch { /* écran démonté */ }
  });
}

export function ecouter(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

// GET : null si la réponse n'est pas exploitable. Ne rejette jamais.
export async function chargerDocumentsSeuil() {
  try {
    const { data } = await api.get(URL_SEUIL);
    const d = lireDonnees(data);
    if (d) publier(d);
    return d;
  } catch {
    return null;
  }
}

// POST d'un document : { cle, <champ>: url, ... }. Rejette en cas d'échec
// (l'écran garde la photo et propose de réessayer).
export async function envoyerDocumentSeuil(corps) {
  const { data } = await api.post(URL_SEUIL, corps, { timeout: 30000 });
  const d = lireDonnees(data);
  if (d) publier(d);
  return d;
}

// Refus 403 du serveur : documents demandés avant de rouler.
export function estDocumentsRequis(err) {
  return !!err && err.status === 403 && err.code === 'documents_requis';
}

// Ouvre l'écran des documents (onglet Profil), depuis n'importe où.
export function ouvrirEcranDocuments() {
  deepLink('DocumentsSeuil');
}

// Message du blocage dans la langue de l'app ; texte du serveur en repli
// pour un motif inconnu.
export function texteBlocage(t, motif, repli) {
  if (motif === 'livreur_mineur') return t('docsSeuilBloqueMineur');
  if (motif === 'verification_depassee') return t('docsSeuilBloqueVerification');
  if (motif === 'documents_manquants') return t('docsSeuilBloqueManquants');
  return (typeof repli === 'string' && repli.trim()) || t('docsSeuilBloqueManquants');
}

// Refus 403 « documents_requis » (passage en ligne, acceptation) : met à jour
// le bandeau et propose d'ouvrir l'écran des documents, sans erreur générique.
export function signalerDocumentsRequis(err, t) {
  const corps = err?.serverData || {};
  const d = lireDonnees(corps.documents_seuil);
  if (d) publier(d);
  const motif = corps.motif_blocage || d?.motif_blocage || null;
  const message = texteBlocage(t, motif, corps.message);
  if (motif === 'livreur_mineur') {
    Alert.alert(t('docsSeuilTitre'), message, [{ text: t('ok') }]);
    return;
  }
  Alert.alert(t('docsSeuilTitre'), message, [
    { text: t('docsSeuilPlusTard'), style: 'cancel' },
    { text: t('docsSeuilVoir'), onPress: ouvrirEcranDocuments },
  ]);
}
