import api from './api';

export const deliveryService = {
  async toggleOnline(isOnline) {
    const { data } = await api.post('/api/v1/delivery/toggle-online/', { is_online: isOnline });
    return data;
  },

  async updateLocation(lat, lng) {
    const { data } = await api.post('/api/v1/delivery/update-location/', { lat, lng });
    return data;
  },

  async getAvailableOrders(params = {}) {
    const { data } = await api.get('/api/v1/delivery/available/', { params });
    return data;
  },

  async acceptDelivery(assignmentId) {
    const { data } = await api.post(`/api/v1/delivery/accept/${assignmentId}/`);
    return data;
  },

  async updateDeliveryStatus(assignmentId, status) {
    const { data } = await api.patch(`/api/v1/delivery/status/${assignmentId}/`, { status });
    return data;
  },

  async cancelDelivery(assignmentId, reason = '') {
    const { data } = await api.post(`/api/v1/delivery/cancel/${assignmentId}/`, { reason });
    return data;
  },

  async getDeliveryHistory(page = 1) {
    const { data } = await api.get('/api/v1/delivery/history/', { params: { page } });
    return data;
  },

  async getActiveDelivery() {
    const { data } = await api.get('/api/v1/delivery/active/');
    return data;
  },
};
