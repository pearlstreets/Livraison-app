import { useEffect } from 'react';
import { AppState } from 'react-native';
import { deliveryService } from '../services/deliveryService';
import { annoncerCourses, derniereReleve, noterReleve } from '../services/sonCourse';

const INTERVALLE_MS = 15000;

/**
 * Veille des nouvelles courses, montée au niveau de l'app (App.js) : le son
 * d'une nouvelle course retentit quelle que soit la page ouverte (Revenus,
 * Profil, Messages, parcours de livraison). Quand l'accueil relève déjà les
 * courses (toutes les 15 s), la veille ne refait pas la requête.
 */
export function useVeilleCourses(actif) {
  useEffect(() => {
    if (!actif) return undefined;
    let annule = false;
    const relever = async () => {
      if (AppState.currentState !== 'active') return;
      if (Date.now() - derniereReleve() < INTERVALLE_MS - 3000) return;
      noterReleve();
      try {
        const res = await deliveryService.getAvailableOrders();
        if (annule) return;
        annoncerCourses(Array.isArray(res?.data) ? res.data : []);
      } catch {
        // Réseau coupé : nouvel essai au prochain passage.
      }
    };
    const minuteur = setInterval(relever, INTERVALLE_MS);
    return () => {
      annule = true;
      clearInterval(minuteur);
    };
  }, [actif]);
}
