// Unit tests for services/secureStorage.js.
// Covers: blocked keys (passwords) are refused, expiry purges values.

const SecureStore = require('expo-secure-store');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const secureStorage = require('../services/secureStorage').default;

beforeEach(() => {
  jest.clearAllMocks();
  SecureStore.__reset?.();
  AsyncStorage.__reset?.();
});

describe('secureStorage', () => {
  it('refuses to store password-like keys', async () => {
    await secureStorage.setSecure('userPassword', 'secret');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('round-trips a secure value through the platform Keychain mock', async () => {
    await secureStorage.setSecure('accessToken', 'tok');
    const got = await secureStorage.getSecure('accessToken');
    expect(got).toBe('tok');
  });

  it('returns null and clears the value once TTL has elapsed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await secureStorage.setSecure('ephemeral', 'value', 1000);
    jest.setSystemTime(new Date('2026-01-01T00:00:02Z')); // +2s
    const got = await secureStorage.getSecure('ephemeral');
    expect(got).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ephemeral');
    jest.useRealTimers();
  });
});
