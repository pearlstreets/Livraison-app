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

  async acceptDelivery(orderId) {
    // Backend expects `order_id` (the order to assign), not the assignment id.
    const { data } = await api.post('/api/v1/delivery/accept/', { order_id: orderId });
    return data;
  },

  async updateDeliveryStatus(assignmentId, status, deliveryCode) {
    // The final `delivered` transition requires the customer's 4-digit code.
    const body = { status };
    if (deliveryCode) body.delivery_code = deliveryCode;
    const { data } = await api.patch(`/api/v1/delivery/assignments/${assignmentId}/status/`, body);
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

  async getPenalties() {
    const { data } = await api.get('/api/v1/delivery/penalties/');
    return data;
  },

  async requestStripeConnect() {
    const { data } = await api.post('/api/v1/delivery/stripe/connect/');
    return data;
  },
};
