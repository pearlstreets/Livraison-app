import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { deliveryService } from '../services/deliveryService';

const INTERVAL_MS = 25000;

export function useLocationTracking(enabled) {
  const intervalRef = useRef(null);
  const permissionGrantedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        permissionGrantedRef.current = true;

        // Ping immédiat au démarrage
        await ping();

        intervalRef.current = setInterval(async () => {
          await ping();
        }, INTERVAL_MS);
      } catch {
        // Refus ou erreur → pas de crash, pas de tracking
      }
    }

    async function ping() {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await deliveryService.updateLocation(loc.coords.latitude, loc.coords.longitude);
      } catch {
        // Erreur GPS ou réseau → silencieux
      }
    }

    function stop() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    if (enabled) {
      start();
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled]);
}
