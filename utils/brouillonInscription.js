// Brouillon de l'INSCRIPTION livreur (06/11/2026) : refus du serveur, reseau
// coupe ou app fermee, le livreur retrouve sa saisie en rouvrant l'app.
// Ecrit a chaque changement (anti-rebond, LoginScreen) et a la mise en
// arriere-plan, relu a l'ouverture de l'ecran SANS etre efface, efface
// seulement quand l'inscription reussit.
//
// ⛔ Memes regles que le brouillon du pliage (utils/repliEcran.js) : la saisie
// complete (mots de passe compris) va dans le coffre chiffre
// (expo-secure-store) ; sans coffre, AsyncStorage (en clair) ne garde que le
// non sensible. La connexion (loginEmail, loginPassword) n'y passe jamais.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';

const CLE = 'pd.brouillonInscription';

const CHAMPS = [
  'mode', 'isPro', 'step', 'email', 'password', 'confirmPwd', 'nom', 'prenom',
  'pseudo', 'companyName', 'phone', 'address', 'country', 'phoneCountry',
  'vehicle', 'proStatus', 'dob', 'postalCode', 'city', 'deliveryZone', 'taxId', 'siret', 'iban',
];
const DOCUMENTS = [
  'docIdFront', 'docIdBack', 'docIban', 'docKbiss', 'docLicense', 'docPhoto',
  'docProofAddress', 'docRcPro', 'docUrssaf',
];
// Saisie libre : sans aucune d'elles ni document, rien a garder.
const TEXTES = [
  'email', 'password', 'confirmPwd', 'nom', 'prenom', 'pseudo', 'companyName',
  'phone', 'address', 'dob', 'postalCode', 'city', 'deliveryZone', 'taxId', 'siret', 'iban',
];
// Sans coffre chiffre : ni mots de passe, ni IBAN, date de naissance, numero
// fiscal, adresse, telephone, ni documents.
const CHAMPS_NON_SENSIBLES = [
  'mode', 'isPro', 'step', 'email', 'nom', 'prenom', 'pseudo', 'companyName',
  'country', 'phoneCountry', 'vehicle', 'proStatus',
];

const coffre = () => {
  try {
    return require('expo-secure-store');
  } catch (_) {
    return null;
  }
};

// Les ecritures et l'effacement passent l'un apres l'autre : une ecriture
// partie juste avant la reussite ne fait jamais revenir le brouillon.
let file = Promise.resolve();
const enFile = op => {
  file = file.then(op, op).catch(() => {});
  return file;
};

const extraire = saisie => {
  const b = {};
  CHAMPS.concat(DOCUMENTS).forEach(cle => {
    if (saisie[cle] !== undefined && saisie[cle] !== null) {
      b[cle] = saisie[cle];
    }
  });
  // Seule l'inscription en cours rouvre sur sa page.
  if (b.mode !== 'signup') {
    delete b.mode;
  }
  return b;
};

const vide = b =>
  !TEXTES.some(cle => typeof b[cle] === 'string' && b[cle].trim()) &&
  !DOCUMENTS.some(cle => b[cle] && b[cle].uri);

const effacer = async () => {
  const c = coffre();
  if (c && c.deleteItemAsync) {
    try {
      await c.deleteItemAsync(CLE);
    } catch (_) {}
  }
  try {
    await AsyncStorage.removeItem(CLE);
  } catch (_) {}
};

// Saisie de l'ecran (toutes ses valeurs) : rangee, ou effacee si rien n'est
// rempli. Ne leve jamais.
export function ecrireBrouillonInscription(saisie) {
  return enFile(async () => {
    const b = extraire(saisie || {});
    if (vide(b)) {
      await effacer();
      return;
    }
    const c = coffre();
    if (c && c.setItemAsync) {
      try {
        await c.setItemAsync(CLE, JSON.stringify({ brouillon: b, pose: Date.now() }));
        // Ancienne copie en clair (coffre indisponible avant) : retiree.
        AsyncStorage.removeItem(CLE).catch(() => {});
        return;
      } catch (_) {}
    }
    const reste = {};
    CHAMPS_NON_SENSIBLES.forEach(cle => {
      if (b[cle] !== undefined) {
        reste[cle] = b[cle];
      }
    });
    await AsyncStorage.setItem(CLE, JSON.stringify({ brouillon: reste, pose: Date.now() }));
  });
}

// Fichier local encore present ? Meme appel natif que getInfoAsync
// d'expo-file-system (module present dans tous les binaires, dependance
// d'expo). Doute (module absent, erreur) : le document est garde.
const fichierAbsent = async uri => {
  try {
    const fs = requireOptionalNativeModule('ExponentFileSystem');
    if (!fs || !fs.getInfoAsync || !uri) {
      return false;
    }
    const info = await fs.getInfoAsync(uri, {});
    return !!info && info.exists === false;
  } catch (_) {
    return false;
  }
};

// Brouillon garde (ou null), sans l'effacer. Un document dont le fichier
// n'existe plus est retire : le livreur le reprend, le reste est rendu.
export async function lireBrouillonInscription() {
  let brut = null;
  const c = coffre();
  if (c && c.getItemAsync) {
    try {
      brut = await c.getItemAsync(CLE);
    } catch (_) {}
  }
  if (!brut) {
    try {
      brut = await AsyncStorage.getItem(CLE);
    } catch (_) {}
  }
  if (!brut) {
    return null;
  }
  let b = null;
  try {
    b = JSON.parse(brut).brouillon;
  } catch (_) {
    return null;
  }
  if (!b || typeof b !== 'object') {
    return null;
  }
  await Promise.all(
    DOCUMENTS.map(async cle => {
      if (b[cle] && b[cle].uri && (await fichierAbsent(b[cle].uri))) {
        b[cle] = null;
      }
    }),
  );
  return b;
}

// Inscription reussie : plus aucun brouillon sur le disque. Ne leve jamais.
export function effacerBrouillonInscription() {
  return enFile(effacer);
}
