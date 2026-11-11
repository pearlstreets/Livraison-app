import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// Langue affichée par l'app (contexts/LanguageContext.js, clé DRIVER_LANG,
// français par défaut comme l'écran), envoyée en ?lang= à la cloche : le
// serveur y écrit les notifications. Inconnue ou illisible : rien d'envoyé.
const LANGUES_APP = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'ru', 'sv', 'th', 'zh'];

async function langueApp() {
  try {
    const code = (await AsyncStorage.getItem('DRIVER_LANG')) || 'fr';
    return LANGUES_APP.includes(code) ? code : null;
  } catch {
    return null;
  }
}

export const deliveryService = {
  async toggleOnline(isOnline) {
    const { data } = await api.post('/api/v1/delivery/toggle-online/', { is_online: isOnline });
    return data;
  },

  // `mocked` : position simulée signalée par Android. Envoyé seulement si vrai ;
  // le serveur actuel lit lat et lng et ignore les autres champs.
  async updateLocation(lat, lng, mocked = false) {
    const body = mocked ? { lat, lng, mocked: true } : { lat, lng };
    const { data } = await api.post('/api/v1/delivery/location/', body);
    return data;
  },

  async getAvailableOrders(params = {}) {
    const { data } = await api.get('/api/v1/delivery/available/', { params });
    return data;
  },

  async acceptDelivery(orderId) {
    // Backend expects `order_id` (the order to assign), not the assignment id.
    const { data } = await api.post('/api/v1/delivery/accept/', { order_id: orderId });
    return data;
  },

  // Refuser une offre chronométrée : le backend la ré-offre au livreur suivant.
  async declineDelivery(orderId) {
    const { data } = await api.post('/api/v1/delivery/decline/', { order_id: orderId });
    return data;
  },

  async updateDeliveryStatus(assignmentId, status, deliveryCode, absent, deposePorte) {
    // The final `delivered` transition requires the customer's 4-digit code.
    const body = { status };
    if (deliveryCode) body.delivery_code = deliveryCode;
    // Client absent : remise sans code, autorisée uniquement si le commerçant
    // l'a prévue (le backend revalide, cf. handling_options.py).
    if (absent && absent.outcome) {
      body.absent_outcome = absent.outcome;
      if (absent.note) body.absent_note = absent.note;
    }
    // Dépôt devant la porte en fin d'attente : la photo déjà reçue par le
    // serveur vaut remise (le serveur vérifie l'attente et la photo).
    if (deposePorte) body.depose_porte = true;
    const { data } = await api.patch(`/api/v1/delivery/assignments/${assignmentId}/status/`, body);
    return data;
  },

  // Tracé par les rues (Apple Plans) du livreur vers la boutique tant que la
  // course n'est pas récupérée, vers le client ensuite. `depuis` : position
  // affichée {latitude, longitude} ; absente, le serveur prend la position
  // enregistrée du livreur. Réponse : { statusCode, data: { trace, destination } }.
  // `essai` : course d'essai, « <retrait>,<livraison> » (adresses d'essai
  // connues du serveur), tracé de la boutique au client.
  async getItineraire(assignmentId, depuis, essai) {
    const params = { assignment_id: assignmentId };
    if (depuis) params.depuis = `${depuis.latitude},${depuis.longitude}`;
    if (essai) params.essai = essai;
    const { data } = await api.get('/api/v1/delivery/driver/itineraire/', { params });
    return data;
  },

  async cancelDelivery(assignmentId, reason = '') {
    const { data } = await api.post(`/api/v1/delivery/assignments/${assignmentId}/cancel/`, { reason });
    return data;
  },

  async getDeliveryHistory(page = 1) {
    const { data } = await api.get('/api/v1/delivery/history/', { params: { page } });
    return data;
  },

  // Courses du livreur encore en cours sur le serveur (acceptée, récupérée, en
  // route, arrivé), lues par statut dans l'historique. Rejette si une lecture
  // échoue : l'appelant garde alors ce qu'il affiche.
  async getActiveDeliveries() {
    const statuts = ['accepted', 'picked_up', 'in_transit', 'arrived'];
    const pages = await Promise.all(statuts.map((status) => (
      api.get('/api/v1/delivery/history/', { params: { status, page_size: 20 } }).then((r) => r.data)
    )));
    const liste = [];
    for (const p of pages) {
      const res = Array.isArray(p) ? p : (Array.isArray(p?.results) ? p.results : (Array.isArray(p?.data) ? p.data : []));
      liste.push(...res);
    }
    return liste;
  },

  // Statut serveur d'une course du livreur (historique, plus récentes
  // d'abord). null si elle n'est pas dans la première page. Rejette si la
  // lecture échoue.
  async getAssignmentStatus(assignmentId) {
    const { data } = await api.get('/api/v1/delivery/history/', { params: { page_size: 50 } });
    const res = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : (Array.isArray(data?.data) ? data.data : []));
    const course = res.find((a) => a && String(a.id) === String(assignmentId));
    return course && typeof course.status === 'string' ? course.status : null;
  },

  async getPenalties() {
    const { data } = await api.get('/api/v1/delivery/penalties/');
    return data;
  },

  async getRatings() {
    const { data } = await api.get('/api/v1/delivery/ratings/');
    return data;
  },

  async getOpportunities() {
    const { data } = await api.get('/api/v1/delivery/opportunities/');
    return data;
  },

  async getPayoutSetup() {
    const { data } = await api.get('/api/v1/delivery/stripe/setup/');
    return data;
  },

  async submitPayoutSetup(payload) {
    const { data } = await api.post('/api/v1/delivery/stripe/setup/', payload);
    return data;
  },

  async requestStripeConnect() {
    const { data } = await api.post('/api/v1/delivery/stripe/connect/');
    return data;
  },

  async getHeatmap() {
    const { data } = await api.get('/api/v1/delivery/heatmap/');
    return data;
  },

  // Carte de la demande au lancement : restaurants ouverts autour de la
  // position (absente : position enregistrée par le serveur).
  async getCarteDemande(position) {
    const params = position ? { lat: position.lat, lng: position.lng } : {};
    const { data } = await api.get('/api/v1/delivery/driver/carte-demande/', { params });
    return data;
  },

  async getNotifications() {
    const lang = await langueApp();
    const { data } = await api.get('/api/v1/delivery/notifications/', lang ? { params: { lang } } : undefined);
    return data;
  },

  async getClientMessages(assignmentId) {
    const { data } = await api.get(`/api/v1/delivery/assignments/${assignmentId}/client-message/`);
    return data;
  },

  async sendClientMessage(assignmentId, text) {
    const { data } = await api.post(`/api/v1/delivery/assignments/${assignmentId}/client-message/`, { text });
    return data;
  },

  async getProMessages(assignmentId) {
    const { data } = await api.get(`/api/v1/delivery/assignments/${assignmentId}/pro-messages/`);
    return data;
  },

  async sendProMessage(assignmentId, text) {
    const { data } = await api.post(`/api/v1/delivery/assignments/${assignmentId}/pro-messages/`, { text });
    return data;
  },

  // Mini-jeu Tri express : record du livreur (le serveur garde le max).
  // Réponse : { status, moi: { rang, score, niveau } }.
  async envoyerScoreJeu(score, niveau) {
    const { data } = await api.post('/api/v1/delivery/driver/jeu/score/', { score, niveau }, { timeout: 10000 });
    return data;
  },

  // Classement des livreurs : { classement: [{ rang, nom, niveau, score, moi }], moi }.
  async getClassementJeu() {
    const { data } = await api.get('/api/v1/delivery/driver/jeu/classement/', { timeout: 10000 });
    return data;
  },

  // Écran « Jeux » (Tournée des toits, Livraison au sommet, Drone express, Rush en ville) :
  // record par jeu, le serveur garde le max. Réponse : { status, moi: { rang, score } }.
  async envoyerRecordJeux(jeu, score) {
    const { data } = await api.post(`/api/v1/delivery/driver/jeux/${encodeURIComponent(jeu)}/score/`, { score }, { timeout: 10000 });
    return data;
  },

  // Classement d'un jeu : { classement: [{ rang, nom, score, moi }], moi }.
  async getClassementJeux(jeu) {
    const { data } = await api.get(`/api/v1/delivery/driver/jeux/${encodeURIComponent(jeu)}/classement/`, { timeout: 10000 });
    return data;
  },
};
