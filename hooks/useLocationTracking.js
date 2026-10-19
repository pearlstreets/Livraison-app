import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  BATTEMENT_MS, arreterSuivi, demarrerSuivi, envoyerPosition, positionPrecise, surRetourHorsLigne,
} from '../services/positionLivreur';

// Suit la position tant que le livreur est en ligne ou en course, y compris
// téléphone verrouillé. L'envoi au serveur est limité dans positionLivreur.js
// (100 m parcourus ou 4 min sur place).
export function useLocationTracking(enabled) {
  const { isOnline, setIsOnline } = useAuth();
  const { t } = useLanguage();
  const enLigneRef = useRef(isOnline);
  enLigneRef.current = isOnline;

  useEffect(() => {
    surRetourHorsLigne(() => {
      if (enLigneRef.current) setIsOnline(false);
    });
    return () => surRetourHorsLigne(null);
  }, [setIsOnline]);

  useEffect(() => {
    if (!enabled) {
      arreterSuivi();
      return undefined;
    }
    let annule = false;

    async function demarrer() {
      try {
        // Lecture seule : sur Android, redemander ici ouvre la fenêtre système,
        // ce qui relance l'écouteur ci-dessous en boucle. La demande se fait au
        // passage en ligne (positionObligatoire).
        const permission = await Location.getForegroundPermissionsAsync();
        if (annule) return;
        if (permission.status !== 'granted' || !positionPrecise(permission)) {
          // Accès retiré ou passé en « Approximative » dans les réglages :
          // comme Uber, plus en ligne sans position précise.
          if (enLigneRef.current) setIsOnline(false);
          return;
        }
        await demarrerSuivi(t);
      } catch {
        // Service non démarré : le battement ci-dessous continue d'envoyer.
      }
    }

    // Battement : garde la position fraîche quand le livreur reste sur place.
    async function battement() {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await envoyerPosition(loc.coords.latitude, loc.coords.longitude, { mocked: loc.mocked });
      } catch {
        // Erreur GPS ou réseau : silencieux.
      }
    }

    demarrer();
    const intervalle = setInterval(battement, BATTEMENT_MS / 4);
    let etatPrecedent = AppState.currentState;
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active' && etatPrecedent === 'background') demarrer();
      etatPrecedent = etat;
    });

    return () => {
      annule = true;
      clearInterval(intervalle);
      abonnement.remove();
      arreterSuivi();
    };
  }, [enabled, t, setIsOnline]);
}
