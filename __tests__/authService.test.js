// Unit tests for services/authService.js.
//
// We mock services/api so we never hit the network and we can drive
// branch coverage of the auth flows. The goal is to catch regressions
// where tokens stop landing in expo-secure-store (the previous bug
// stored refreshToken in AsyncStorage in plain text).

jest.mock('../services/api', () => {
  const fns = {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
  };
  return { __esModule: true, default: fns, ...fns };
});

const SecureStore = require('expo-secure-store');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const api = require('../services/api').default;
const { authService } = require('../services/authService');

beforeEach(() => {
  jest.clearAllMocks();
  SecureStore.__reset?.();
  AsyncStorage.__reset?.();
});

afterEach(() => {
  // The login() flow arms a setTimeout via resetSessionTimer — clear it
  // so jest doesn't keep the worker alive after the test finishes.
  authService.clearSessionTimer();
});

describe('authService.login', () => {
  it('rejects invalid email format before any network call', async () => {
    await expect(authService.login('not-an-email', 'pwd')).rejects.toThrow(/Invalid email/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('stores tokens in SecureStore (NOT AsyncStorage) on success', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        access_token: 'access_abc',
        refresh_token: 'refresh_xyz',
        user: { id: 1, email: 'driver@test.com' },
      },
    });
    await authService.login('driver@test.com', 'plain-password');

    // Tokens MUST land in SecureStore
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'access_abc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refreshToken', 'refresh_xyz');
    // userData (non-sensitive) goes to AsyncStorage
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'userData',
      expect.stringContaining('driver@test.com'),
    );
    // Password sent in plain — server-side hashing handles confidentiality
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/delivery/login/',
      expect.objectContaining({ password: 'plain-password' }),
    );
  });
});

describe('authService.logout', () => {
  it('reads refreshToken from SecureStore (not AsyncStorage) and clears all', async () => {
    await SecureStore.setItemAsync('refreshToken', 'rt_to_revoke');
    api.post.mockResolvedValueOnce({ data: {} });

    await authService.logout();

    // Logout should pull refresh from SecureStore — historic bug used AsyncStorage
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/delivery/logout/',
      { refresh: 'rt_to_revoke' },
    );
    // SecureStore.clearAll path: deleteItemAsync called for tokens
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('accessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
  });

  it('still clears local secrets when the logout API fails', async () => {
    await SecureStore.setItemAsync('refreshToken', 'rt');
    api.post.mockRejectedValueOnce(new Error('network down'));

    await expect(authService.logout()).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
  });
});

describe('authService.refreshToken', () => {
  it('reads refresh from SecureStore and re-stores rotated tokens', async () => {
    await SecureStore.setItemAsync('refreshToken', 'old_refresh');
    api.post.mockResolvedValueOnce({
      data: { access: 'new_access', refresh: 'new_refresh' },
    });

    const out = await authService.refreshToken();
    expect(out.access).toBe('new_access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'new_access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refreshToken', 'new_refresh');
  });

  it('throws when no refresh token is present', async () => {
    await expect(authService.refreshToken()).rejects.toThrow(/No refresh token/i);
  });
});
