import AsyncStorage from '@react-native-async-storage/async-storage';

// Avancement des courses en cours, par course (identifiant d'affectation) :
// étape atteinte dans l'écran de livraison, dernier statut confirmé par le
// serveur, heure d'arrivée chez le client et heure d'ouverture de l'étape
// code. Gardé sur le téléphone : une course reprise (retour à l'accueil, app
// relancée) repart de là où elle en était, minuteurs compris.
// Courses d'essai : en mémoire seulement.

const CLE = 'pearl_etapes_courses';
let etapes = {};
let charge = null;

const persistante = (cle) => !String(cle).startsWith('mock-');

function sauver() {
  const aGarder = {};
  for (const [cle, v] of Object.entries(etapes)) if (persistante(cle)) aGarder[cle] = v;
  AsyncStorage.setItem(CLE, JSON.stringify(aGarder)).catch(() => {});
}

// Lecture du stockage, une seule fois par lancement.
export function chargerEtapes() {
  if (!charge) {
    charge = AsyncStorage.getItem(CLE)
      .then((brut) => {
        const lu = brut ? JSON.parse(brut) : {};
        if (lu && typeof lu === 'object') etapes = { ...lu, ...etapes };
      })
      .catch(() => {});
  }
  return charge;
}

export function cleCourse(order) {
  if (!order) return '';
  return String(order._assignmentId || order.id || '');
}

export function lireEtape(cle) {
  return (cle && etapes[cle]) || null;
}

export function enregistrerEtape(cle, champs) {
  if (!cle) return;
  etapes = { ...etapes, [cle]: { ...(etapes[cle] || {}), ...champs } };
  sauver();
}

export function oublierEtape(cle) {
  if (!cle || !etapes[cle]) return;
  const suite = { ...etapes };
  delete suite[cle];
  etapes = suite;
  sauver();
}

// Garde seulement les courses que le serveur donne encore en cours.
export function garderSeulement(cles) {
  const set = new Set(cles.map(String));
  let change = false;
  const suite = {};
  for (const [cle, v] of Object.entries(etapes)) {
    if (set.has(cle) || !persistante(cle)) suite[cle] = v;
    else change = true;
  }
  if (change) {
    etapes = suite;
    sauver();
  }
}
