import api from './api';

export const deliveryService = {
  async toggleOnline(isOnline) {
    const { data } = await api.post('/api/v1/delivery/toggle-online/', { is_online: isOnline });
    return data;
  },

  async updateLocation(lat, lng) {
    const { data } = await api.post('/api/v1/delivery/location/', { lat, lng });
    return data;
  },

  async getAvailableOrders(params = {}) {
    const { data } = await api.get('/api/v1/delivery/available/', { params });
    return data;
  },

  async acceptDelivery(assignmentId) {
    const { data } = await api.post('/api/v1/delivery/accept/', { assignment_id: assignmentId });
    return data;
  },

  async updateDeliveryStatus(assignmentId, status) {
    const { data } = await api.patch(`/api/v1/delivery/assignments/${assignmentId}/status/`, { status });
    return data;
  },

  async cancelDelivery(assignmentId, reason = '') {
    const { data } = await api.post(`/api/v1/delivery/assignments/${assignmentId}/cancel/`, { reason });
    return data;
  },

  async getDeliveryHistory(page = 1) {
    const { data } = await api.get('/api/v1/delivery/history/', { params: { page } });
    return data;
  },

  // Register (or update) the driver's Expo push token so the backend can
  // target this device for new-order notifications. Safe to call repeatedly
  // — the backend is expected to upsert by (user, token) pair.
  async registerPushToken(token, platform) {
    const { data } = await api.post('/api/v1/delivery/push-token/', { token, platform });
    return data;
  },
};
