import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from '../services/secureStorage';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('secureStorage', () => {
  describe('setSecure', () => {
    it('stores obfuscated value in AsyncStorage', async () => {
      await secureStorage.setSecure('accessToken', 'my_token');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('accessToken', expect.any(String));
      // Should NOT store plaintext
      const storedValue = AsyncStorage.setItem.mock.calls[0][1];
      expect(storedValue).not.toBe('my_token');
    });

    it('refuses to store password-like keys', async () => {
      await secureStorage.setSecure('password', 'secret');
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('refuses keys containing pwd', async () => {
      await secureStorage.setSecure('userPwd', 'secret');
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('stores expiry when ttlMs is provided', async () => {
      await secureStorage.setSecure('token', 'val', 60000);
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
      const expiryCall = AsyncStorage.setItem.mock.calls[1];
      expect(expiryCall[0]).toBe('token__expiry');
    });
  });

  describe('getSecure', () => {
    it('returns deobfuscated value', async () => {
      // First store a value
      let storedValue;
      AsyncStorage.setItem.mockImplementation((key, val) => { storedValue = val; return Promise.resolve(); });
      await secureStorage.setSecure('testKey', 'hello123');

      // Then retrieve it
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'testKey') return Promise.resolve(storedValue);
        return Promise.resolve(null);
      });
      const result = await secureStorage.getSecure('testKey');
      expect(result).toBe('hello123');
    });

    it('returns null for missing key', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);
      const result = await secureStorage.getSecure('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null and cleans up expired keys', async () => {
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'token__expiry') return Promise.resolve(String(Date.now() - 1000)); // expired
        return Promise.resolve('some_value');
      });
      const result = await secureStorage.getSecure('token');
      expect(result).toBeNull();
    });
  });

  describe('removeSecure', () => {
    it('removes key and expiry from AsyncStorage', async () => {
      await secureStorage.removeSecure('token');
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['token', 'token__expiry']);
    });
  });

  describe('clearAll', () => {
    it('removes known token keys', async () => {
      await secureStorage.clearAll();
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(
        expect.arrayContaining(['accessToken', 'refreshToken'])
      );
    });
  });
});
