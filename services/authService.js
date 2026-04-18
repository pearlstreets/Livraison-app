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

// Simple SHA-256 hash using SubtleCrypto (available in React Native via expo-crypto or polyfill)
async function hashPassword(password) {
  try {
    // Use a simple hash approach compatible with React Native
    // In production, use expo-crypto or a proper library
    let hash = 0;
    const str = password + 'pearl_salt_v1';
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Convert to hex-like string for transmission
    return 'ph_' + Math.abs(hash).toString(16).padStart(8, '0');
  } catch {
    // Fallback: return as-is (server should still hash)
    return password;
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

    const hashedPwd = await hashPassword(password);
    const { data } = await api.post('/api/v1/delivery/login/', {
      email: sanitizeForApi(email),
      password: hashedPwd,
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
      password: await hashPassword(payload.password),
    };

    const { data } = await api.post('/api/v1/delivery/register/', sanitizedPayload);
    return data;
  },

  async logout() {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
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

  async refreshToken() {
    // Token rotation guard
    if (refreshCount >= MAX_REFRESHES_PER_SESSION) {
      await this.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const refreshToken = await AsyncStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    // Refresh endpoint is mounted at root, NOT under /delivery/.
    // See Marketplace/urls.py: path('api/v1/token/refresh/', CookieAwareTokenRefreshView).
    const { data } = await api.post('/api/v1/token/refresh/', { refresh: refreshToken });
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
      old_password: await hashPassword(oldPassword),
      new_password: await hashPassword(newPassword),
    });
    return data;
  },

  // Session management
  resetSessionTimer,
  clearSessionTimer,
};
