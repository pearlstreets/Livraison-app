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

export function resolveRoute(route) {
  if (!route || typeof route !== 'string') return ACCUEIL;
  const [screen] = route.replace(/^\/+/, '').split('/');
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
    case 'DeliveryHistory':
      // Jalon de livraisons, remerciement après course.
      return { screen: 'Profil', params: { screen: 'DeliveryHistory' } };
    case 'TicketsList':
      return { screen: 'Profil', params: { screen: 'TicketsList' } };
    case 'Inbox':
      return { screen: 'MessagesTab' };
    default:
      return ACCUEIL;
  }
}

export function deepLink(route) {
  try {
    const { screen, params } = resolveRoute(route);
    navigate(screen, params);
  } catch (e) {
    try {
      navigate('Accueil');
    } catch (_) {}
  }
}

export default deepLink;
