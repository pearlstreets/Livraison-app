// Lien entre l'app téléphone et l'écran CarPlay (components/PontCarPlay.js).
//
// L'écran CarPlay ne refait aucune logique de course : il lit ce que
// l'accueil (screens/OrdersScreen.js) publie (en ligne, course proposée,
// courses en cours) et lui demande d'agir avec ses propres fonctions
// (passage en ligne, acceptation, refus). Les étapes d'une course passent par
// l'écran de livraison ouvert (screens/DeliveryFlowScreen.js), qui garde ses
// appels au serveur et ses contrôles (photo du ticket, code).
// Une action faite sur l'un se voit ainsi aussitôt sur l'autre.

let accueil = { pret: false, online: false, offre: null, courses: [] };
let actionsAccueil = {};
const ecouteursAccueil = new Set();

export function lireAccueil() {
  return accueil;
}

export function publierAccueil(partiel) {
  accueil = { ...accueil, ...partiel };
  ecouteursAccueil.forEach((fn) => { try { fn(accueil); } catch { /* ignoré */ } });
}

export function ecouterAccueil(fn) {
  ecouteursAccueil.add(fn);
  return () => ecouteursAccueil.delete(fn);
}

// actions : { passerEnLigne, passerHorsLigne, accepter, refuser }, chacune
// rendant une promesse. Renvoie la fonction de retrait.
export function brancherAccueil(actions) {
  actionsAccueil = actions;
  return () => {
    if (actionsAccueil === actions) actionsAccueil = {};
  };
}

// Résultat de l'action, ou null si l'accueil n'est pas monté.
export async function agirAccueil(nom, ...args) {
  const fn = actionsAccueil[nom];
  if (typeof fn !== 'function') return null;
  return fn(...args);
}

// --- Écran de livraison ouvert : pilote de l'étape suivante, par course ---

const pilotes = new Map();
const attentes = new Map();

// pilote(etapeAttendue) : passe à l'étape suivante si l'écran est bien à
// etapeAttendue ; promesse vraie si l'étape a changé.
export function brancherPilote(cle, pilote) {
  if (!cle) return () => {};
  pilotes.set(cle, pilote);
  const enAttente = attentes.get(cle);
  if (enAttente) {
    attentes.delete(cle);
    enAttente.forEach((r) => r(pilote));
  }
  return () => {
    if (pilotes.get(cle) === pilote) pilotes.delete(cle);
  };
}

export const piloteOuvert = (cle) => pilotes.has(cle);

// Attend qu'un écran de livraison s'ouvre pour la course (au plus `ms`).
export function attendrePilote(cle, ms = 6000) {
  const deja = pilotes.get(cle);
  if (deja) return Promise.resolve(deja);
  return new Promise((resolve) => {
    const liste = attentes.get(cle) || [];
    let fini = false;
    const r = (p) => { if (!fini) { fini = true; resolve(p); } };
    liste.push(r);
    attentes.set(cle, liste);
    setTimeout(() => {
      const reste = (attentes.get(cle) || []).filter((x) => x !== r);
      if (reste.length) attentes.set(cle, reste);
      else attentes.delete(cle);
      r(null);
    }, ms);
  });
}
