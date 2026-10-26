// Ecran deplie d'un pliable Android : l'app se presente comme deux
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

let reel = null;

// Appele une seule fois, avec la taille mesuree de la vue racine. Rend la
// largeur a annoncer a l'app.
export function preparerDeuxEcrans(width, height) {
  if (Platform.OS === 'android' && width >= LARGEUR_MIN && width >= height) {
    reel = {width, height};
    return Math.floor(width / 2);
  }
  reel = null;
  return width;
}

export const ecranDeplie = () => reel !== null;
export const dimensionsReelles = () => reel;
export const largeurMoitie = () => (reel ? Math.floor(reel.width / 2) : 0);

// Android renvoie la vraie largeur a chaque changement de configuration :
// elle est remise a celle d'une moitie.
let ecoute = null;
export function garderLargeurMoitie() {
  if (!reel || ecoute) {
    return;
  }
  ecoute = Dimensions.addEventListener('change', ({window, screen}) => {
    const moitie = largeurMoitie();
    if (!window || Math.abs((window.width || 0) - moitie) < ECART_MIN) {
      return;
    }
    // Apres les autres ecouteurs : la derniere valeur recue reste la moitie.
    setTimeout(() => {
      Dimensions.set({
        window: {...window, width: moitie},
        screen: {...(screen || window), width: moitie},
      });
    }, 0);
  });
}
