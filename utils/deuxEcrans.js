// Ecran deplie d'un pliable Android, ou tablette (iPad, tablette Android) : l'app se presente comme deux
// telephones cote a cote (user 26/10/2026, comme AppUser). La moitie gauche
// porte l'ecran de navigation (onglets, listes), la moitie droite la page
// ouverte depuis la gauche (detail d'une course, d'un versement, reglages...).
//
// Chaque moitie garde le design du telephone : au demarrage, Dimensions
// annonce la largeur d'UNE moitie (utils/tailleAuDemarrage.js). Toutes les
// tailles de l'app (Dimensions, useWindowDimensions) sont ainsi celles d'un
// telephone. La taille reelle reste lisible ici. L'app se recharge au pliage
// (utils/repliEcran.js) : le mode est fixe pour toute la duree du chargement.
import {Dimensions, Platform} from 'react-native';

const LARGEUR_MIN = 600;
const ECART_MIN = 2;
// Tablette (iPad, tablette Android) : les deux moities des que chacune a la
// largeur d'un telephone (360), en portrait comme en paysage (20/11/2026).
const LARGEUR_MIN_TABLETTE = 720;
const COTE_MIN_TABLETTE = 600;

let reel = null;
let ecran = null;
let echelle = 1;
let surTablette = false;

// Tablette : toute l'app est dessinee plus grosse, comme les grandes apps
// (boites, boutons, textes, user 20/11/2026). Elle est mise en page sur
// l'ecran divise par l'echelle, puis agrandie (utils/agrandiTablette.js).
// Tablette : un seul ecran, pas coupe en deux (les deux moities sont pour
// les pliables, user 20/11/2026).
const ECHELLE_TABLETTE = 1.2;
const RAPPORT_MAX_PLIABLE = 1.3;
const presqueCarre = (width, height) =>
  Math.max(width, height) / Math.max(1, Math.min(width, height)) <
  RAPPORT_MAX_PLIABLE;
const echelleDe = width =>
  Math.max(1, Math.min(ECHELLE_TABLETTE, width / LARGEUR_MIN_TABLETTE));

// Appele une seule fois, avec la taille mesuree de la vue racine. Rend la
// largeur a annoncer a l'app.
export const estTablette = (width, height) =>
  (Platform.OS === 'ios' && !!Platform.isPad) ||
  (Platform.OS === 'android' && Math.min(width, height) >= COTE_MIN_TABLETTE);

export function preparerDeuxEcrans(width, height) {
  const pliable =
    Platform.OS === 'android' && width >= LARGEUR_MIN && width >= height;
  const tablette =
    estTablette(width, height) && width >= LARGEUR_MIN_TABLETTE;
  // Tablette et pliable sont deux choses differentes (user 20/11/2026) :
  // agrandissement et fond blanc sur les vraies tablettes seulement. Un
  // pliable Android deplie (Galaxy Z Fold, Pixel Fold) a un ecran presque
  // carre, une tablette non.
  surTablette =
    tablette && !pliable && !(Platform.OS === 'android' && presqueCarre(width, height));
  echelle = surTablette ? echelleDe(width) : 1;
  if (surTablette) {
    ecran = {width, height};
    reel = null;
    return Math.floor(width / echelle);
  }
  if (pliable || tablette) {
    ecran = {width, height};
    reel = {width: width / echelle, height: height / echelle};
    return Math.floor(reel.width / 2);
  }
  reel = null;
  ecran = null;
  return width;
}

export const ecranDeplie = () => reel !== null;
// Taille de l'ecran entier, en points de l'app (agrandie sur tablette).
export const dimensionsReelles = () => reel;
// Taille de l'ecran entier, en points de l'ecran (rotation, pliage).
export const dimensionsEcran = () => ecran;
export const echelleTablette = () => echelle;
export const tabletteDeplie = () => surTablette;
// Hauteur a annoncer a l'app (points de l'app).
export const hauteurApp = height => height / echelle;
// Taille annoncee a l'app sur tablette (points de l'app, ecran entier).
export const dimensionsApp = () =>
  reel ||
  (surTablette && ecran
    ? {width: Math.floor(ecran.width / echelle), height: ecran.height / echelle}
    : null);
export const largeurMoitie = () => (reel ? Math.floor(reel.width / 2) : 0);

// Android renvoie la vraie largeur a chaque changement de configuration :
// elle est remise a celle d'une moitie.
let ecoute = null;
export function garderLargeurMoitie() {
  if ((!reel && !surTablette) || ecoute) {
    return;
  }
  ecoute = Dimensions.addEventListener('change', ({window, screen}) => {
    // Tablette : la largeur de l'ecran entier, en points de l'app.
    const moitie = reel ? largeurMoitie() : dimensionsApp().width;
    if (!window || Math.abs((window.width || 0) - moitie) < ECART_MIN) {
      return;
    }
    // Apres les autres ecouteurs : la derniere valeur recue reste la moitie.
    setTimeout(() => {
      Dimensions.set({
        window: {...window, width: moitie, height: hauteurApp(window.height)},
        screen: {
          ...(screen || window),
          width: moitie,
          height: hauteurApp((screen || window).height),
        },
      });
    }, 0);
  });
}
