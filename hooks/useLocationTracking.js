import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  BATTEMENT_MS, arreterSuivi, demarrerSuivi, envoyerPosition, surRetourHorsLigne,
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
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (annule) return;
        if (status !== 'granted') {
          // Accès retiré dans les réglages : comme Uber, plus en ligne sans position.
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
        await envoyerPosition(loc.coords.latitude, loc.coords.longitude);
      } catch {
        // Erreur GPS ou réseau : silencieux.
      }
    }

    demarrer();
    const intervalle = setInterval(battement, BATTEMENT_MS / 4);
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') demarrer();
    });

    return () => {
      annule = true;
      clearInterval(intervalle);
      abonnement.remove();
      arreterSuivi();
    };
  }, [enabled, t, setIsOnline]);
}
