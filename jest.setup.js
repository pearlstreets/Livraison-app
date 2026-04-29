// Global Jest setup for pearl-delivery.
// jest-expo provides preset transforms, but we mock platform-only modules
// here so unit tests stay node-pure.

// React Native / Expo expose __DEV__ as a global. Default to true in tests
// so dev-only branches stay reachable (matches a Metro dev bundle).
global.__DEV__ = true;

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    setItem: jest.fn(async (k, v) => { store[k] = v; }),
    getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
    removeItem: jest.fn(async (k) => { delete store[k]; }),
    multiRemove: jest.fn(async (keys) => { keys.forEach((k) => delete store[k]); }),
    getAllKeys: jest.fn(async () => Object.keys(store)),
    clear: jest.fn(async () => { store = {}; }),
    __reset: () => { store = {}; },
  };
});

jest.mock('expo-secure-store', () => {
  let store = {};
  return {
    setItemAsync: jest.fn(async (k, v) => { store[k] = v; }),
    getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
    deleteItemAsync: jest.fn(async (k) => { delete store[k]; }),
    __reset: () => { store = {}; },
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
  addEventListener: jest.fn(() => () => {}),
}));

jest.mock('react-native-onesignal', () => ({
  OneSignal: { login: jest.fn(), logout: jest.fn() },
}));

// Silence noisy warnings during test runs
const origWarn = console.warn;
console.warn = (...args) => {
  const msg = String(args[0] || '');
  if (msg.includes('[secureStorage] Refusing')) return;
  origWarn(...args);
};
