// Charge l'app APRES la premiere mesure de la vue racine, et corrige
// Dimensions si Android l'a laissee a la taille d'un autre ecran.
//
// ⛔ POURQUOI
// Au repli d'un telephone pliable, l'app se recharge (utils/repliEcran.js).
// Sous Android, Dimensions.get('window') rend alors encore la largeur DEPLIEE
// (700 au lieu de 411, mesure AppUser le 24/10/2026 sur emulateur) alors que la vue
// racine a la bonne taille : toutes les tailles calculees au chargement des
// modules seraient fausses (ecran coupe a gauche et a droite). La vue racine
// est mesuree d'abord, Dimensions corrigee si besoin, puis App.js est charge :
// ses modules lisent la bonne taille (DeliveryFlowScreen, HeatmapScreen,
// DetailsSheet la lisent au chargement). La tache de position reste
// declaree dans index.js, avant ce chargement.
import React from 'react';
import {View, Dimensions} from 'react-native';
import {preparerDeuxEcrans, garderLargeurMoitie} from './deuxEcrans';

// En dessous, ecarts d'arrondi : on ne touche a rien.
const ECART_MIN = 2;

// La dalle ('screen') reste aussi celle de l'autre ecran. Les feuilles du bas
// Elle suit la fenetre, avec l'ecart des barres systeme d'avant.
const dalleCorrigee = (fenetre, width, height) => {
  const dalle = Dimensions.get('screen') || {};
  if (
    Math.abs((dalle.width || 0) - width) < ECART_MIN &&
    (dalle.height || 0) >= height
  ) {
    return dalle;
  }
  const barres = Math.max(0, (dalle.height || 0) - (fenetre.height || 0));
  return {...dalle, width, height: height + barres};
};

const corrigerDimensions = (width, height) => {
  const fenetre = Dimensions.get('window') || {};
  const dalle = dalleCorrigee(fenetre, width, height);
  if (
    Math.abs((fenetre.width || 0) - width) < ECART_MIN &&
    Math.abs((fenetre.height || 0) - height) < ECART_MIN &&
    dalle === Dimensions.get('screen')
  ) {
    return;
  }
  Dimensions.set({
    window: {
      width,
      height,
      scale: fenetre.scale || 1,
      fontScale: fenetre.fontScale || 1,
    },
    screen: dalle,
  });
};

export function avecTailleMesuree(chargerApp) {
  return function Racine(props) {
    const [App, setApp] = React.useState(null);
    const auLayout = event => {
      if (App) {
        return;
      }
      try {
        const {width, height} = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          // Deplie : l'app voit la largeur d'une moitie (utils/deuxEcrans.js).
          corrigerDimensions(preparerDeuxEcrans(width, height), height);
          garderLargeurMoitie();
        }
      } catch (_) {}
      setApp(() => chargerApp());
    };
    if (App) {
      return <App {...props} />;
    }
    return <View style={{flex: 1}} onLayout={auLayout} />;
  };
}
