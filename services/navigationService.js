/**
 * Référence de navigation utilisable HORS composant React.
 *
 * Le tap sur une notification arrive dans un écouteur expo-notifications enregistré au
 * niveau du module : il n'a aucun accès au hook `useNavigation`. Sans cette
 * référence, la seule chose que sait faire l'app à la réception d'un tap est
 * de s'ouvrir là où l'utilisateur l'avait laissée.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  // `isReady()` est faux tant que la session n'est pas rechargée (app lancée
  // PAR le tap sur la notification : profil et gains chargés d'abord). On
  // retente jusqu'à 30 secondes plutôt que de perdre le tap sur un téléphone
  // lent ou un réseau faible.
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return;
  }
  let essais = 0;
  const timer = setInterval(() => {
    essais += 1;
    if (navigationRef.isReady()) {
      clearInterval(timer);
      navigationRef.navigate(name, params);
    } else if (essais > 120) {
      clearInterval(timer);
    }
  }, 250);
}

export default navigate;
