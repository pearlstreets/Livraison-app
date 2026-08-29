/**
 * Référence de navigation utilisable HORS composant React.
 *
 * Le tap sur une notification arrive dans un écouteur OneSignal enregistré au
 * niveau du module : il n'a aucun accès au hook `useNavigation`. Sans cette
 * référence, la seule chose que sait faire l'app à la réception d'un tap est
 * de s'ouvrir là où l'utilisateur l'avait laissée.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  // `isReady()` est faux pendant le tout premier rendu (app lancée PAR le tap
  // sur la notification) : on retente brièvement plutôt que de perdre le tap.
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
    } else if (essais > 20) {
      clearInterval(timer);
    }
  }, 250);
}

export default navigate;
