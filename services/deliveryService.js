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

  async updateDeliveryStatus(assignmentId, status, deliveryCode) {
    const payload = { status };
    if (deliveryCode) payload.delivery_code = deliveryCode;
    const { data } = await api.patch(`/api/v1/delivery/assignments/${assignmentId}/status/`, payload);
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
};
