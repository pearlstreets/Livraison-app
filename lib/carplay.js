// Écran CarPlay : choix de ce qui est montré et des actions possibles, à
// partir de l'état de l'app téléphone. Module pur, sans dépendance (testé par
// lib/__tests__/carplay.test.mjs) ; components/PontCarPlay.js l'affiche.
//
// Conduite d'abord : gros libellés, trois actions au plus par écran, aucune
// saisie. Ce qui demande une photo, un code ou une saisie se termine sur le
// téléphone, à l'arrêt.

// Étapes de l'écran de livraison (screens/DeliveryFlowScreen.js).
export const ETAPES = ['pickup', 'enroute', 'arrived', 'code', 'done'];

// Étape de l'écran de livraison qui correspond au statut serveur d'une course
// (même table que screens/OrdersScreen.js).
const ETAPE_DU_STATUT = { accepted: 0, picked_up: 1, in_transit: 1, arrived: 2 };

// Étape atteinte : celle gardée sur le téléphone (services/etapesCourses.js),
// sinon celle du statut serveur ; jamais en arrière du serveur.
export function etapeDeCourse(garde, statut) {
  const duStatut = ETAPE_DU_STATUT[statut] ?? 0;
  return garde && typeof garde.step === 'number' ? Math.max(garde.step, duStatut) : duStatut;
}

// Téléphone du client pour un appel, comme l'écran de livraison.
export function telephoneClient(course) {
  if (!course) return '';
  return String(
    course.customerPhone || (course.user_address && course.user_address.phone_number) || '',
  ).replace(/[^0-9+]/g, '');
}

// Actions de l'étape, dans l'ordre d'affichage (3 au plus) :
// - retrait : itinéraire vers le commerce, puis « Commande récupérée » si la
//   photo du ticket est déjà faite sur le téléphone, sinon « Terminer sur le
//   téléphone » (photo à prendre à l'arrêt) ;
// - en route : itinéraire vers le client, « Je suis arrivé », appel ;
// - chez le client et code : « Terminer sur le téléphone » (code à saisir),
//   appel ;
// - terminée : aucune.
export function actionsEtape(etape, { preuveRetrait = false, telephone = '' } = {}) {
  const appel = telephone ? ['appeler'] : [];
  switch (ETAPES[etape]) {
    case 'pickup':
      return ['itineraire', preuveRetrait ? 'recuperee' : 'telephone'];
    case 'enroute':
      return ['itineraire', 'arrive', ...appel];
    case 'arrived':
    case 'code':
      return ['telephone', ...appel];
    default:
      return [];
  }
}

const LIBELLES_ACTIONS = {
  enLigne: 'carplayPasserEnLigne',
  horsLigne: 'carplayPasserHorsLigne',
  accepter: 'carplayAccepter',
  refuser: 'carplayRefuser',
  itineraire: 'carplayItineraire',
  arrive: 'carplayArrive',
  recuperee: 'carplayRecuperee',
  telephone: 'carplayTerminerTelephone',
  appeler: 'carplayAppeler',
};

const STYLES_ACTIONS = { enLigne: 'confirmer', accepter: 'confirmer', arrive: 'confirmer', recuperee: 'confirmer', refuser: 'annuler' };

function boutons(ids, t) {
  return ids.slice(0, 3).map((id) => ({ id, titre: t(LIBELLES_ACTIONS[id]), style: STYLES_ACTIONS[id] || 'normal' }));
}

const ligne = (titre, detail) => ({ titre: String(titre || ''), detail: String(detail || '') });
const avecValeur = (l) => l.detail.trim() !== '';

// Message du serveur assez court pour l'écran de la voiture, sinon rien.
export function messageCourt(texte, max = 80) {
  const s = String(texte || '').replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : '';
}

// Destination de l'itinéraire : le commerce avant la récupération, le client
// ensuite. Coordonnées si connues, sinon adresse.
export function destinationEtape(course, etape) {
  if (!course) return null;
  const retrait = etape === 0;
  const lat = retrait ? course.pickupLat : course.dropoffLat;
  const lng = retrait ? course.pickupLng : course.dropoffLng;
  const adresse = retrait ? course.pickupAddress : course.dropoffAddress;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (lat != null && lng != null && lat !== '' && lng !== '' && Number.isFinite(nLat) && Number.isFinite(nLng)) {
    return { coords: `${nLat},${nLng}`, adresse: adresse || '' };
  }
  return adresse ? { coords: null, adresse } : null;
}

// Paquets Android des apps GPS proposées sur Android Auto.
export const PAQUETS_GPS_ANDROID = { google: 'com.google.android.apps.maps', waze: 'com.waze' };

// Liens de navigation ouverts sur l'écran de la voiture (apps CarPlay ; sur
// Android Auto, intention NAVIGATE de la bibliothèque androidx.car.app vers
// une adresse geo:, adressée à l'app choisie).
export function liensItineraire(dest, os = 'ios') {
  if (!dest) return null;
  const cible = dest.coords || encodeURIComponent(dest.adresse);
  if (os === 'android') {
    const geo = dest.coords ? `geo:${dest.coords}?q=${dest.coords}` : `geo:0,0?q=${cible}`;
    const vers = (paquet) => `${geo}#Intent;action=androidx.car.app.action.NAVIGATE;package=${paquet};end`;
    return { google: vers(PAQUETS_GPS_ANDROID.google), waze: vers(PAQUETS_GPS_ANDROID.waze) };
  }
  return {
    plans: `maps://?daddr=${cible}&dirflg=d`,
    google: `comgooglemaps://?daddr=${cible}&directionsmode=driving`,
    waze: dest.coords ? `waze://?ll=${dest.coords}&navigate=yes` : `waze://?q=${cible}&navigate=yes`,
  };
}

// Feuille « Itinéraire » : choix de l'app GPS (Plans d'Apple sur iOS seulement).
export function feuilleItineraire(t, os = 'ios') {
  return {
    id: 'itineraire',
    type: 'feuille',
    titres: [t('carplayOuvrirAvec')],
    actions: [
      ...(os === 'android' ? [] : [{ id: 'gps:plans', titre: t('carplayPlans'), style: 'normal' }]),
      { id: 'gps:google', titre: 'Google Maps', style: 'normal' },
      { id: 'gps:waze', titre: 'Waze', style: 'normal' },
      { id: 'fermer', titre: t('carplayAnnuler'), style: 'annuler' },
    ],
  };
}

// Alerte simple avec un bouton OK (variantes du plus long au plus court).
export function alerteInfo(id, titres, t) {
  return {
    id,
    type: 'alerte',
    titres: titres.filter(Boolean),
    actions: [{ id: 'fermer', titre: t('carplayOk'), style: 'annuler' }],
  };
}

// Alerte « Nouvelle course » : gain, distance, retrait et livraison.
export function alerteOffre(offre, t, prix) {
  const gain = prix(offre.priceEur);
  const titre = offre.distanceText
    ? t('carplayOffreTitre', { gain, distance: offre.distanceText })
    : t('carplayOffreTitreCourt', { gain });
  const retrait = offre.restaurant || offre.pickupAddress || '';
  const livraison = offre.dropoffAddress || '';
  const details = [
    retrait && t('carplayLibelleValeur', { libelle: t('carplayRetrait'), valeur: retrait }),
    livraison && t('carplayLibelleValeur', { libelle: t('carplayLivraison'), valeur: livraison }),
  ].filter(Boolean);
  const variantes = [];
  if (details.length) variantes.push([titre, ...details].join('\n'));
  variantes.push(titre);
  if (offre.distanceText) variantes.push(t('carplayOffreTitreCourt', { gain }));
  return {
    id: `offre:${offre._uid || offre.id || ''}`,
    type: 'alerte',
    titres: variantes,
    actions: [
      { id: 'accepter', titre: t('carplayAccepter'), style: 'normal' },
      { id: 'refuser', titre: t('carplayRefuser'), style: 'annuler' },
    ],
  };
}

// Écran principal selon l'état :
// etat = {
//   session: 'chargement' | 'deconnecte' | 'desactive' | 'ok',
//   accueilPret, online, enCours (action en cours, bouton masqué),
//   offre, course, garde (étape gardée de la course), nbCourses,
// }
export function ecranCarPlay(etat, t, prix) {
  const { session, accueilPret, online, enCours, offre, course, garde } = etat;
  if (session === 'chargement') {
    return { titre: 'Pearl Delivery', lignes: [ligne(t('carplayChargement'), '')], actions: [] };
  }
  if (session === 'deconnecte') {
    return {
      titre: 'Pearl Delivery',
      lignes: [ligne(t('carplayConnectezVous'), t('carplayConnectezVousDetail'))],
      actions: [],
    };
  }
  if (session === 'desactive') {
    return { titre: 'Pearl Delivery', lignes: [ligne(t('carplayCompteDesactive'), t('carplayVoirTelephone'))], actions: [] };
  }
  if (!accueilPret) {
    return { titre: 'Pearl Delivery', lignes: [ligne(t('carplayOuvrezTelephone'), '')], actions: [] };
  }

  if (course) {
    const etape = etapeDeCourse(garde, course.status);
    const tel = telephoneClient(course);
    const ids = actionsEtape(etape, { preuveRetrait: Boolean(garde && garde.preuveRetrait), telephone: tel })
      .filter((id) => id !== enCours);
    const nom = ETAPES[etape];
    if (nom === 'pickup') {
      const lignes = [
        ligne(t('carplayCommerce'), course.restaurant || course.shopName),
        ligne(t('carplayAdresse'), course.pickupAddress),
      ].filter(avecValeur);
      if (!(garde && garde.preuveRetrait)) lignes.push(ligne(t('carplayPhotoTicket'), t('carplayPhotoTicketDetail')));
      return { titre: t('carplayEtapeRetrait'), lignes, actions: boutons(ids, t) };
    }
    if (nom === 'enroute') {
      const lignes = [
        ligne(t('carplayClient'), course.customer_name),
        ligne(t('carplayAdresse'), course.dropoffAddress),
      ].filter(avecValeur);
      return { titre: t('carplayEtapeLivraison'), lignes, actions: boutons(ids, t) };
    }
    if (nom === 'arrived' || nom === 'code') {
      const lignes = [
        ligne(t('carplayClient'), course.customer_name),
        ligne(t('carplayAdresse'), course.dropoffAddress),
        ligne(t('carplayCodeClient'), t('carplayCodeClientDetail')),
      ].filter(avecValeur);
      return { titre: t('carplayEtapeChezClient'), lignes, actions: boutons(ids, t) };
    }
    return {
      titre: t('carplayEtapeTerminee'),
      lignes: [ligne(t('carplayGain'), prix(course.priceEur))].filter(avecValeur),
      actions: [],
    };
  }

  if (online && offre) {
    const lignes = [
      ligne(t('carplayGain'), prix(offre.priceEur)),
      ligne(t('carplayDistance'), offre.distanceText),
      ligne(t('carplayRetrait'), offre.restaurant || offre.pickupAddress),
      ligne(t('carplayLivraison'), offre.dropoffAddress),
    ].filter(avecValeur);
    return { titre: t('carplayNouvelleCourse'), lignes, actions: boutons(['accepter', 'refuser'].filter((id) => id !== enCours), t) };
  }

  if (online) {
    return {
      titre: t('carplayEnLigne'),
      lignes: [ligne(t('carplayEnAttente'), t('carplayEnAttenteDetail'))],
      actions: enCours ? [] : boutons(['horsLigne'], t),
    };
  }
  return {
    titre: t('carplayHorsLigne'),
    lignes: [
      enCours
        ? ligne(t('carplayPassageEnCours'), '')
        : ligne(t('carplayHorsLigneTitre'), t('carplayHorsLigneDetail')),
    ],
    actions: enCours ? [] : boutons(['enLigne'], t),
  };
}
