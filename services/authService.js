import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const authService = {
  async login(email, password) {
    const { data } = await api.post('/api/v1/delivery/login/', { email, password });
    await AsyncStorage.setItem('accessToken', data.access_token);
    await AsyncStorage.setItem('refreshToken', data.refresh_token);
    await AsyncStorage.setItem('userData', JSON.stringify(data.user));
    return data;
  },

  async register(payload) {
    // payload: { userName, email, password, phone, phoneCode, vehicle_type, categories, ... }
    const { data } = await api.post('/api/v1/delivery/register/', payload);
    return data;
  },

  async logout() {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      await api.post('/api/v1/delivery/logout/', { refresh: refreshToken });
    } catch (e) {}
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'userData']);
  },

  async getProfile() {
    const { data } = await api.get('/api/v1/delivery/profile/');
    return data;
  },

  async updateProfile(updates) {
    const { data } = await api.put('/api/v1/delivery/profile/', updates);
    return data;
  },

  async getStoredUser() {
    const stored = await AsyncStorage.getItem('userData');
    return stored ? JSON.parse(stored) : null;
  },

  async forgotPassword(email) {
    const { data } = await api.post('/api/v1/delivery/forgot-password/', { email });
    return data;
  },

  async resetPassword(payload) {
    const { data } = await api.post('/api/v1/delivery/reset-password/', payload);
    return data;
  },

  async updatePassword(oldPassword, newPassword) {
    const { data } = await api.post('/api/v1/delivery/update-password/', { old_password: oldPassword, new_password: newPassword });
    return data;
  },
};
