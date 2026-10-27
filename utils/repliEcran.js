// Telephone pliable : au pliage ou au depliage, l'app passe d'un ecran a
// l'autre et la taille de la dalle change (transpose d'AppUser, 26/10/2026).
//
// ⛔ POURQUOI UN RECHARGEMENT
// Des tailles sont calculees UNE FOIS, au chargement des modules
// (DeliveryFlowScreen, HeatmapScreen, DetailsSheet), et la disposition en
// deux moities (utils/deuxEcrans.js) est choisie au chargement. Elles
// resteraient celles de l'autre ecran. L'app se recharge donc aussitot et le
// livreur retrouve l'ecran qu'il regardait.
//
// La LARGEUR de la fenetre : le clavier (adjustResize sous Android) ne change
// que sa hauteur. Une rotation ne recharge rien (utils/ecranPliable.js).
import {Dimensions, DevSettings} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {navigationRef} from '../services/navigationService';
import {dimensionsReelles, largeurMoitie} from './deuxEcrans';
import {ecranChange, ECART_MIN} from './ecranPliable';

const CLE_ETAT = 'pd.repliEcran.etat';
// Saisie de l'ecran de connexion / inscription (livreur pas encore connecte,
// aucun onglet a restaurer). Mots de passe compris : rangee dans le coffre
// chiffre (expo-secure-store), lue et effacee au redemarrage qui suit.
const CLE_BROUILLON = 'pd.repliEcran.connexion';
// L'etat sauvegarde ne sert qu'au redemarrage qui suit le pliage.
const VALIDITE_ETAT = 60 * 1000;

// Au demarrage, Dimensions peut rendre encore la taille d'avant le
// rechargement. Pendant ce delai, chaque mesure devient la reference.
const DELAI_DEMARRAGE = 3000;
// Android met a jour la taille de l'ecran un peu APRES la vue.
const DELAI_RECHARGEMENT = 800;
let debut = Date.now();
let reference = null;
let dejaSurveille = false;
// Dernier etat des onglets, note a chaque navigation (App.js, onStateChange).
// Le pliage peut recreer l'activite Android sans recharger le JS : l'app est
// remontee sur l'Accueil avant le rechargement, l'etat d'avant est ici.
let dernierEtat = null;
// Apres un remontage, l'etat neuf (Accueil) ne remplace pas celui d'avant.
let etatFigeJusqua = 0;
let rechargementEnCours = false;
// Numero du montage de l'app : un rechargement demande juste avant que le
// pliage recree l'activite serait perdu (ecran blanc, mesure sur emulateur
// le 26/10/2026). Il est abandonne et redemande par le nouveau montage.
let montage = 0;
let etatARestaurer = null;
// Fonction de l'ecran de connexion qui rend sa saisie (null hors de l'ecran).
let fournisseurBrouillon = null;

const coffre = () => {
  try {
    return require('expo-secure-store');
  } catch (_) {
    return null;
  }
};

// Sans coffre chiffre, AsyncStorage (en clair) ne garde que le non sensible :
// ni mots de passe, ni IBAN, date de naissance, numero fiscal, adresse,
// telephone, ni documents. Le livreur ressaisit le reste.
const CHAMPS_NON_SENSIBLES = [
  'mode', 'isPro', 'step', 'loginEmail', 'email', 'nom', 'prenom', 'pseudo',
  'companyName', 'country', 'phoneCountry', 'vehicle', 'proStatus',
];
const ecrireBrouillon = async brouillon => {
  const brut = JSON.stringify({brouillon, pose: Date.now()});
  const c = coffre();
  if (c && c.setItemAsync) {
    try {
      await c.setItemAsync(CLE_BROUILLON, brut);
      return;
    } catch (_) {}
  }
  const reste = {};
  CHAMPS_NON_SENSIBLES.forEach(cle => {
    if (brouillon[cle] !== undefined) {
      reste[cle] = brouillon[cle];
    }
  });
  await AsyncStorage.setItem(
    CLE_BROUILLON,
    JSON.stringify({brouillon: reste, pose: Date.now()}),
  );
};

// Les onglets sont montes (livreur connecte) : l'etat est celui de l'app.
const ongletsPrets = () => {
  try {
    if (!navigationRef.isReady()) {
      return false;
    }
    const etat = navigationRef.getRootState();
    return !!(etat && etat.routeNames && etat.routeNames.includes('Accueil'));
  } catch (_) {
    return false;
  }
};

const recharger = async () => {
  if (rechargementEnCours) {
    return;
  }
  rechargementEnCours = true;
  const montageDemande = montage;
  await new Promise(fin => setTimeout(fin, DELAI_RECHARGEMENT));
  if (montageDemande !== montage) {
    return;
  }
  try {
    const etat =
      dernierEtat || (ongletsPrets() ? navigationRef.getRootState() : null);
    if (etat) {
      await AsyncStorage.setItem(
        CLE_ETAT,
        JSON.stringify({etat, pose: Date.now()}),
      );
    }
  } catch (_) {}
  try {
    const brouillon = fournisseurBrouillon && fournisseurBrouillon();
    if (brouillon) {
      await ecrireBrouillon(brouillon);
    }
  } catch (_) {}
  try {
    const Updates = require('expo-updates');
    await Updates.reloadAsync();
    return;
  } catch (_) {}
  // Developpement (expo-updates inactif).
  try {
    DevSettings.reload();
  } catch (_) {
    rechargementEnCours = false;
  }
};

const verifierTaille = fenetre => {
  if (!fenetre || !fenetre.width) {
    return;
  }
  if (!reference || !reference.width || Date.now() - debut < DELAI_DEMARRAGE) {
    reference = fenetre;
    return;
  }
  if (ecranChange(reference, fenetre)) {
    recharger();
    return;
  }
  // Rotation : nouvelle reference. Clavier (largeur identique) : on garde
  // la hauteur sans clavier.
  if (Math.abs(fenetre.width - reference.width) >= ECART_MIN) {
    reference = fenetre;
  }
};

// onLayout de la vue racine (App.js). Second signal, indispensable : sous
// Android, apres un rechargement, le retour a la taille d'avant n'emet aucun
// evenement Dimensions, la vue racine, elle, est toujours remesuree.
export function signalerTailleRacine(event) {
  try {
    const {width, height} = event.nativeEvent.layout;
    verifierTaille({width, height});
  } catch (_) {}
}

// A appeler une fois au montage de l'app. Rend la fonction de retrait.
export function surveillerRepliEcran() {
  // Activite recreee par le pliage (meme JS) : l'app est remontee, la
  // reference d'avant est gardee pour que le changement de taille recharge.
  if (!dejaSurveille) {
    dejaSurveille = true;
    debut = Date.now();
    // Deplie, Dimensions annonce une moitie (utils/deuxEcrans.js) : la
    // reference et les mesures restent celles de l'ecran entier.
    reference = dimensionsReelles() || Dimensions.get('window');
  } else {
    // Remontage : la vue racine remesuree redemande le rechargement.
    montage += 1;
    rechargementEnCours = false;
  }
  const abonnement = Dimensions.addEventListener('change', ({window}) => {
    if (
      dimensionsReelles() &&
      Math.abs(((window && window.width) || 0) - largeurMoitie()) < 2
    ) {
      return;
    }
    verifierTaille(window);
  });
  // Etat laisse par le rechargement precedent : lu et efface tout de suite.
  AsyncStorage.getItem(CLE_ETAT)
    .then(brut => {
      if (!brut) {
        return;
      }
      AsyncStorage.removeItem(CLE_ETAT).catch(() => {});
      const {etat, pose} = JSON.parse(brut);
      if (etat && Date.now() - pose < VALIDITE_ETAT) {
        etatARestaurer = etat;
        restaurerEcranApresRepli();
      }
    })
    .catch(() => {});
  return () => {
    // App demontee (activite recreee) : l'etat neuf du remontage ne
    // remplace pas celui d'avant.
    etatFigeJusqua = Date.now() + DELAI_DEMARRAGE;
    try {
      abonnement && abonnement.remove && abonnement.remove();
    } catch (_) {}
  };
}

// onStateChange du NavigationContainer (App.js).
export function noterEtatNavigation(etat) {
  // Pas d'etat (demontage) : on garde le dernier connu.
  if (!etat || Date.now() < etatFigeJusqua) {
    return;
  }
  dernierEtat =
    etat && etat.routeNames && etat.routeNames.includes('Accueil')
      ? etat
      : null;
}

// Appelee aussi quand les onglets s'affichent (livreur charge apres le
// demarrage) : l'ecran d'avant le pliage est rendu une fois les onglets la.
// Memes noms d'ecrans plie et deplie : l'etat se remet tel quel. Ne leve
// jamais.
export function restaurerEcranApresRepli() {
  if (!etatARestaurer || !ongletsPrets()) {
    return;
  }
  const etat = etatARestaurer;
  etatARestaurer = null;
  try {
    navigationRef.reset(etat);
  } catch (_) {}
}

// Ecran de connexion : declare la fonction qui rend sa saisie, sauvee juste
// avant le rechargement du pliage. Rend la fonction de retrait.
export function noterBrouillonConnexion(fournisseur) {
  fournisseurBrouillon = fournisseur;
  return () => {
    if (fournisseurBrouillon === fournisseur) {
      fournisseurBrouillon = null;
    }
  };
}

// Saisie laissee par le rechargement precedent (ou null) : lue et effacee.
export async function lireBrouillonConnexion() {
  let brut = null;
  const c = coffre();
  if (c && c.getItemAsync) {
    try {
      brut = await c.getItemAsync(CLE_BROUILLON);
      if (brut) {
        c.deleteItemAsync(CLE_BROUILLON).catch(() => {});
      }
    } catch (_) {}
  }
  // Copie en clair : toujours effacee, meme si le coffre a rendu la saisie.
  try {
    const clair = await AsyncStorage.getItem(CLE_BROUILLON);
    if (clair) {
      AsyncStorage.removeItem(CLE_BROUILLON).catch(() => {});
      brut = brut || clair;
    }
  } catch (_) {}
  if (!brut) {
    return null;
  }
  try {
    const {brouillon, pose} = JSON.parse(brut);
    return brouillon && Date.now() - pose < VALIDITE_ETAT ? brouillon : null;
  } catch (_) {
    return null;
  }
}

// Connexion reussie ou dossier envoye : plus aucun brouillon sur le disque
// (coffre chiffre et AsyncStorage). Ne leve jamais.
export async function effacerBrouillonConnexion() {
  const c = coffre();
  if (c && c.deleteItemAsync) {
    try {
      await c.deleteItemAsync(CLE_BROUILLON);
    } catch (_) {}
  }
  try {
    await AsyncStorage.removeItem(CLE_BROUILLON);
  } catch (_) {}
}
