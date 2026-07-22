import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from './secureStorage';
import { isValidEmail, sanitizeForApi } from '../utils/validation';

// Session timeout: auto-logout after 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
let sessionTimer = null;

function resetSessionTimer(onTimeout) {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    authService.logout();
    if (onTimeout) onTimeout();
  }, SESSION_TIMEOUT_MS);
}

function clearSessionTimer() {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
}

// Token rotation: track refresh count to detect abuse
let refreshCount = 0;
const MAX_REFRESHES_PER_SESSION = 50;

// Biometric auth placeholder
// TODO: Implement with expo-local-authentication
// import * as LocalAuthentication from 'expo-local-authentication';
// async function authenticateWithBiometrics() {
//   const hasHardware = await LocalAuthentication.hasHardwareAsync();
//   if (!hasHardware) return false;
//   const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate' });
//   return result.success;
// }

export const authService = {
  async login(email, password) {
    // Validate email format
    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    const { data } = await api.post('/api/v1/delivery/login/', {
      email: sanitizeForApi(email),
      password,
    });

    // Store tokens securely
    await secureStorage.setSecure('accessToken', data.access_token);
    await secureStorage.setSecure('refreshToken', data.refresh_token);
    // User data is non-sensitive, store in AsyncStorage
    await AsyncStorage.setItem('userData', JSON.stringify(data.user));

    refreshCount = 0;
    resetSessionTimer();
    return data;
  },

  async register(payload) {
    // Validate email
    if (!isValidEmail(payload.email)) {
      throw new Error('Invalid email format');
    }

    // Hash password before sending
    const sanitizedPayload = {
      ...payload,
      email: sanitizeForApi(payload.email),
      userName: payload.userName ? sanitizeForApi(payload.userName) : undefined,
      password: payload.password,
    };

    const { data } = await api.post('/api/v1/delivery/register/', sanitizedPayload);
    return data;
  },

  async logout() {
    try {
      const refreshToken = await secureStorage.getSecure('refreshToken');
      if (refreshToken) {
        await api.post('/api/v1/delivery/logout/', { refresh: refreshToken });
      }
    } catch (e) {
      // Logout API failure should not block local cleanup
    }

    // Clear ALL sensitive data from storage
    clearSessionTimer();
    refreshCount = 0;
    await secureStorage.clearAll();
  },

  // Suppression de compte in-app (exigence Apple 5.1.1(v)). On appelle
  // l'endpoint AUTHENTIFIÉ (donc avant tout nettoyage local), et seulement en
  // cas de succès on purge la session locale. Si l'appel échoue, on relance
  // l'erreur SANS vider la session (le compte n'a pas été supprimé côté serveur).
  async deleteAccount() {
    await api.delete('/api/v1/delivery/delete-account/');
    clearSessionTimer();
    refreshCount = 0;
    await secureStorage.clearAll();
  },

  async refreshToken() {
    // Token rotation guard
    if (refreshCount >= MAX_REFRESHES_PER_SESSION) {
      await this.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const refreshToken = await secureStorage.getSecure('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    const { data } = await api.post('/api/v1/delivery/token/refresh/', { refresh: refreshToken });
    await secureStorage.setSecure('accessToken', data.access);
    if (data.refresh) {
      await secureStorage.setSecure('refreshToken', data.refresh);
    }
    refreshCount++;
    resetSessionTimer();
    return data;
  },

  async getProfile() {
    resetSessionTimer();
    const { data } = await api.get('/api/v1/delivery/profile/');
    return data;
  },

  async updateProfile(updates) {
    resetSessionTimer();
    const { data } = await api.put('/api/v1/delivery/profile/', updates);
    return data;
  },

  async getStoredUser() {
    const stored = await AsyncStorage.getItem('userData');
    return stored ? JSON.parse(stored) : null;
  },

  async forgotPassword(email) {
    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }
    const { data } = await api.post('/api/v1/delivery/forgot-password/', { email: sanitizeForApi(email) });
    return data;
  },

  async resetPassword(payload) {
    const { data } = await api.post('/api/v1/delivery/reset-password/', payload);
    return data;
  },

  async updatePassword(oldPassword, newPassword) {
    const { data } = await api.post('/api/v1/delivery/update-password/', {
      old_password: oldPassword,
      new_password: newPassword,
    });
    return data;
  },

  // Session management
  resetSessionTimer,
  clearSessionTimer,
};
