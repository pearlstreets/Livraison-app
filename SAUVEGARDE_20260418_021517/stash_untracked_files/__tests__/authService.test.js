import { authService } from '../services/authService';
import api from '../services/api';
import secureStorage from '../services/secureStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../services/api');
jest.mock('../services/secureStorage');

beforeEach(() => {
  jest.clearAllMocks();
  secureStorage.setSecure.mockResolvedValue();
  secureStorage.getSecure.mockResolvedValue(null);
  secureStorage.clearAll.mockResolvedValue();
});

describe('authService', () => {
  describe('login', () => {
    it('rejects invalid email', async () => {
      await expect(authService.login('notanemail', 'pass')).rejects.toThrow('Invalid email format');
    });

    it('calls API with hashed password', async () => {
      api.post.mockResolvedValue({
        data: { access_token: 'at', refresh_token: 'rt', user: { email: 'test@test.com' } },
      });
      const result = await authService.login('test@test.com', 'Test@123');
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/login/', expect.objectContaining({
        email: 'test@test.com',
        password: expect.stringMatching(/^ph2_/),
      }));
      // Verify password is hashed, not plaintext
      const sentPassword = api.post.mock.calls[0][1].password;
      expect(sentPassword).not.toBe('Test@123');
      expect(result.access_token).toBe('at');
    });

    it('stores tokens in secureStorage', async () => {
      api.post.mockResolvedValue({
        data: { access_token: 'mytoken', refresh_token: 'myrefresh', user: {} },
      });
      await authService.login('test@test.com', 'Pass1234');
      expect(secureStorage.setSecure).toHaveBeenCalledWith('accessToken', 'mytoken');
      expect(secureStorage.setSecure).toHaveBeenCalledWith('refreshToken', 'myrefresh');
    });

    it('stores user data in AsyncStorage', async () => {
      api.post.mockResolvedValue({
        data: { access_token: 'at', refresh_token: 'rt', user: { name: 'Jean' } },
      });
      await authService.login('test@test.com', 'Pass1234');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('userData', JSON.stringify({ name: 'Jean' }));
    });
  });

  describe('register', () => {
    it('rejects invalid email', async () => {
      await expect(authService.register({ email: 'bad', password: 'Test@123' })).rejects.toThrow('Invalid email format');
    });

    it('sends payload with hashed password', async () => {
      api.post.mockResolvedValue({ data: { id: 1 } });
      await authService.register({ email: 'new@test.com', password: 'Test@123', userName: 'Jean' });
      const sent = api.post.mock.calls[0][1];
      expect(sent.password).toMatch(/^ph2_/);
      expect(sent.password).not.toBe('Test@123');
      expect(sent.email).toBe('new@test.com');
    });
  });

  describe('logout', () => {
    it('calls API logout and clears storage', async () => {
      secureStorage.getSecure.mockResolvedValue('rt123');
      api.post.mockResolvedValue({ data: {} });
      await authService.logout();
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/logout/', { refresh: 'rt123' });
      expect(secureStorage.clearAll).toHaveBeenCalled();
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['userData']);
    });

    it('clears storage even if API logout fails', async () => {
      secureStorage.getSecure.mockResolvedValue('rt');
      api.post.mockRejectedValue(new Error('Network error'));
      await authService.logout();
      expect(secureStorage.clearAll).toHaveBeenCalled();
    });

    it('skips API call when no refresh token', async () => {
      secureStorage.getSecure.mockResolvedValue(null);
      await authService.logout();
      expect(api.post).not.toHaveBeenCalled();
      expect(secureStorage.clearAll).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('refreshes and stores new tokens', async () => {
      secureStorage.getSecure.mockResolvedValue('old_rt');
      api.post.mockResolvedValue({ data: { access: 'new_at', refresh: 'new_rt' } });
      const result = await authService.refreshToken();
      expect(secureStorage.setSecure).toHaveBeenCalledWith('accessToken', 'new_at');
      expect(secureStorage.setSecure).toHaveBeenCalledWith('refreshToken', 'new_rt');
      expect(result.access).toBe('new_at');
    });

    it('throws when no refresh token exists', async () => {
      secureStorage.getSecure.mockResolvedValue(null);
      await expect(authService.refreshToken()).rejects.toThrow('No refresh token');
    });
  });

  describe('getProfile', () => {
    it('fetches profile from API', async () => {
      api.get.mockResolvedValue({ data: { email: 'u@test.com', name: 'User' } });
      const result = await authService.getProfile();
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/profile/');
      expect(result.email).toBe('u@test.com');
    });
  });

  describe('updateProfile', () => {
    it('sends profile updates', async () => {
      api.put.mockResolvedValue({ data: { name: 'Updated' } });
      const result = await authService.updateProfile({ name: 'Updated' });
      expect(api.put).toHaveBeenCalledWith('/api/v1/delivery/profile/', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('forgotPassword', () => {
    it('rejects invalid email', async () => {
      await expect(authService.forgotPassword('bad')).rejects.toThrow('Invalid email format');
    });

    it('sends reset request with valid email', async () => {
      api.post.mockResolvedValue({ data: { sent: true } });
      await authService.forgotPassword('valid@test.com');
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/forgot-password/', { email: 'valid@test.com' });
    });
  });

  describe('updatePassword', () => {
    it('hashes both old and new passwords', async () => {
      api.post.mockResolvedValue({ data: {} });
      await authService.updatePassword('Old@Pass1', 'New@Pass2');
      const call = api.post.mock.calls[0][1];
      expect(call.old_password).toMatch(/^ph2_/);
      expect(call.new_password).toMatch(/^ph2_/);
      expect(call.old_password).not.toBe(call.new_password);
    });
  });

  describe('getStoredUser', () => {
    it('returns parsed user from AsyncStorage', async () => {
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ name: 'Jean' }));
      const result = await authService.getStoredUser();
      expect(result).toEqual({ name: 'Jean' });
    });

    it('returns null when no user stored', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);
      const result = await authService.getStoredUser();
      expect(result).toBeNull();
    });
  });
});
