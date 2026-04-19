import * as Location from 'expo-location';
import { deliveryService } from './deliveryService';

const UPDATE_INTERVAL_MS = 30000; // Send location every 30 seconds

let watchSubscription = null;
let intervalId = null;
let lastLat = null;
let lastLng = null;

/**
 * Request location permissions.
 * Returns true if granted.
 */
export async function requestLocationPermission() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Get current location once.
 */
export async function getCurrentLocation() {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Start continuous location tracking during a delivery.
 * Sends location to the API every 30 seconds.
 * @param {function} onLocationUpdate - optional callback(lat, lng) for UI
 */
export async function startTracking(onLocationUpdate) {
  const granted = await requestLocationPermission();
  if (!granted) return false;

  // Watch position for real-time UI updates
  try {
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 20, // Update every 20 meters
        timeInterval: 10000, // Or every 10 seconds
      },
      (location) => {
        lastLat = location.coords.latitude;
        lastLng = location.coords.longitude;
        if (onLocationUpdate) {
          onLocationUpdate(lastLat, lastLng);
        }
      }
    );
  } catch {
    // Fallback: poll location manually
  }

  // Send to API at regular intervals
  intervalId = setInterval(async () => {
    if (lastLat != null && lastLng != null) {
      try {
        await deliveryService.updateLocation(lastLat, lastLng);
      } catch {
        // Network error, will retry next interval
      }
    }
  }, UPDATE_INTERVAL_MS);

  // Send initial location immediately
  const loc = await getCurrentLocation();
  if (loc) {
    lastLat = loc.lat;
    lastLng = loc.lng;
    if (onLocationUpdate) onLocationUpdate(loc.lat, loc.lng);
    deliveryService.updateLocation(loc.lat, loc.lng).catch(() => {});
  }

  return true;
}

/**
 * Stop tracking and clean up.
 */
export function stopTracking() {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  lastLat = null;
  lastLng = null;
}

/**
 * Check if currently tracking.
 */
export function isTracking() {
  return watchSubscription !== null || intervalId !== null;
}
