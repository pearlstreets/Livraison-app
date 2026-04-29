// Certificate-pinning helper for Pearl Delivery.
//
// Pearl Delivery runs on Expo Managed (SDK 53). True runtime cert pinning
// from JavaScript (`react-native-ssl-pinning`, `react-native-cert-pinner`,
// custom URLSession delegates) requires native code that we cannot ship via
// JS-only updates. The pragmatic split is:
//
//   1. Android  → `android/app/src/main/res/xml/network_security_config.xml`
//      provides OS-level pinning via the Android Network Security Config.
//      The application tag in AndroidManifest references it via
//      `android:networkSecurityConfig="@xml/network_security_config"`.
//      **Action required**: replace the placeholder SHA-256 fingerprints
//      with real production cert pins before the next release. See the
//      header comment in that XML file for the openssl one-liner.
//
//   2. iOS     → no built-in pinning. To match the Android guarantee, ship
//      the next build via EAS Build with `react-native-ssl-pinning` (and
//      patch services/api.js to use its `fetch` wrapper) OR move to Expo
//      Bare Workflow and use `URLSessionPinningDelegate`. Current state is
//      **HTTPS + ATS only** — sufficient for confidentiality in transit
//      but not against a CA compromise on iOS.
//
// This module exports the expected pins and a `verifyPinningHealth()` helper
// you can call once at boot to log a dev warning when running an
// un-pinned build (so the gap stays visible).

import { Platform } from 'react-native';

// SHA-256 base64-encoded SubjectPublicKeyInfo pins. Keep two entries
// minimum (current + backup) so a routine cert rotation never bricks
// older clients. Update both Android XML and this list together.
export const EXPECTED_PINS = {
  'pythonapi.digiexports.in': [
    // PLACEHOLDER — replace with `openssl s_client -connect host:443 ...`
    // output before any release (also replace in network_security_config.xml).
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  ],
};

// Detection heuristic — we cannot probe native pinning state from JS, but we
// can flag the case where the Android XML still contains the literal
// placeholder strings (the build was not configured for production).
export function pinsLookConfigured() {
  const pins = EXPECTED_PINS['pythonapi.digiexports.in'] || [];
  return pins.every((p) => p && !/^A{43}=$/.test(p) && !/^B{43}=$/.test(p));
}

export function verifyPinningHealth() {
  if (__DEV__) return; // dev builds are expected to skip pinning
  if (Platform.OS === 'android' && !pinsLookConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(
      '[certPinning] Android network_security_config.xml still uses placeholder pins — ' +
        'cert pinning is NOT effective in this build. Replace the SHA-256 fingerprints before shipping.',
    );
  }
  if (Platform.OS === 'ios') {
    // eslint-disable-next-line no-console
    console.warn(
      '[certPinning] iOS build has no runtime pinning. Add react-native-ssl-pinning or move to Bare Workflow ' +
        'before treating this build as PCI / financial data ready.',
    );
  }
}

export default {
  EXPECTED_PINS,
  pinsLookConfigured,
  verifyPinningHealth,
};
