/**
 * Route envoyée par le backend (`data.route`) → écran réel de l'app livreur.
 *
 * Les écrans vivent dans des onglets : `Accueil` (HomeStack), `Revenus`
 * (EarningsStack) et `Profil` (MenuStack). Un `navigate('Documents')` à plat
 * n'est géré par aucun navigateur — d'où la forme imbriquée systématique.
 *
 * Toute route inconnue ouvre l'accueil : c'est le comportement d'avant, donc
 * une route ajoutée côté backend avant la mise à jour de l'app ne casse rien.
 */
import { navigate } from './navigationService';

const ACCUEIL = { screen: 'Accueil', params: { screen: 'OrdersMain' } };

// Identifiant de ticket lu dans `data.ticket_id` (push « réponse du
// support », « ticket résolu ») ou dans la route `TicketChat/<id>`.
function idTicket(valeur) {
  const n = Number(valeur);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const DOCUMENTS_SEUIL = { screen: 'Profil', params: { screen: 'DocumentsSeuil' } };

export function resolveRoute(route, data) {
  // Documents demandés au seuil de gains : `type` seul suffit.
  if (data && data.type === 'documents_seuil') return DOCUMENTS_SEUIL;
  if (!route || typeof route !== 'string') return ACCUEIL;
  const [screen, segment] = route.replace(/^\/+/, '').split('/');
  const ticketId = idTicket(segment) || idTicket(data && data.ticket_id);
  switch (screen) {
    case 'Orders':
    case 'OrdersMain':
      // Course prête à récupérer : la liste des courses du jour.
      return ACCUEIL;
    case 'Heatmap':
      // Zone à forte demande : la carte des zones chaudes.
      return { screen: 'Accueil', params: { screen: 'Heatmap' } };
    case 'Earnings':
      // Récapitulatif hebdomadaire des gains.
      return { screen: 'Revenus', params: { screen: 'EarningsMain' } };
    case 'Wallet':
      // Pourboire reçu : le porte-monnaie.
      return { screen: 'Revenus', params: { screen: 'Wallet' } };
    case 'VersementsList':
    case 'Payouts':
      // Virement en route : l'historique des versements.
      return { screen: 'Revenus', params: { screen: 'VersementsList' } };
    case 'Ratings':
      // Avis 5 étoiles reçu.
      return { screen: 'Profil', params: { screen: 'Ratings' } };
    case 'Documents':
      // Document qui expire : l'écran où on le remplace.
      return { screen: 'Profil', params: { screen: 'Documents' } };
    case 'DocumentsSeuil':
      // Documents demandés au seuil de gains (RIB, identité, domicile).
      return DOCUMENTS_SEUIL;
    case 'DeliveryHistory':
      // Jalon de livraisons, remerciement après course.
      return { screen: 'Profil', params: { screen: 'DeliveryHistory' } };
    case 'TicketsList':
    case 'TicketChat':
      // Réponse du support : le fil du ticket ; sans identifiant, la liste.
      if (ticketId) {
        return { screen: 'Profil', params: { screen: 'TicketChat', params: { ticketId } } };
      }
      return { screen: 'Profil', params: { screen: 'TicketsList' } };
    case 'Inbox':
      return { screen: 'MessagesTab' };
    default:
      return ACCUEIL;
  }
}

export function deepLink(route, data) {
  try {
    const { screen, params } = resolveRoute(route, data);
    navigate(screen, params);
  } catch (e) {
    try {
      navigate('Accueil');
    } catch (_) {}
  }
}

export default deepLink;
