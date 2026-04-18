// Expo reads this at build time. We keep app.json as the static base and
// overlay env-driven bits here — right now the only reason this file
// exists is to switch the OneSignal plugin between "development" and
// "production" modes without hand-editing the config.
//
// Pass ONESIGNAL_MODE=production when building for the App Store / Play
// Store:
//   ONESIGNAL_MODE=production eas build --platform all --profile production
//
// In all other cases (Expo Go, EAS development/preview, local dev server)
// this defaults to "development" so push notifications work against the
// sandbox APNs / FCM credentials.

const ONESIGNAL_MODE =
  process.env.ONESIGNAL_MODE === 'production' ? 'production' : 'development';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    'expo-notifications',
    'expo-localization',
    [
      'onesignal-expo-plugin',
      { mode: ONESIGNAL_MODE },
    ],
  ],
});
