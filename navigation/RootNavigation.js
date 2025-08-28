import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

// Petit historique mémoire (nom, params, time)
const _history = [];

export function onStateChange() {
  if (!navigationRef.isReady()) return;
  const route = navigationRef.getCurrentRoute?.();
  if (route) {
    _history.push({ name: route.name, params: route.params, time: Date.now() });
    // Limiter la taille
    if (_history.length > 100) _history.shift();
  }
}

export function goBack() {
  try {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
      return true;
    }
    // Fallback: revenir au précédent enregistré
    if (_history.length >= 2) {
      const prev = _history[_history.length - 2];
      navigationRef.navigate(prev.name, prev.params);
      return true;
    }
  } catch {}
  return false;
}

export function goBackN(n = 1) {
  let did = false;
  for (let i = 0; i < n; i++) {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack(); did = true;
    } else {
      const idx = _history.length - 2 - i;
      if (idx >= 0) {
        const prev = _history[idx];
        navigationRef.navigate(prev.name, prev.params);
        did = true;
      }
    }
  }
  return did;
}

export function getHistory() {
  return [..._history];
}
