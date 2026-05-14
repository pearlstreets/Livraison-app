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

  /**
   * Récupère les courses urgentes (food_drink, SLA 30min) en priorité.
   * Le backend les remonte triées par dispatch_score (lower = better) ;
   * cette fonction filtre côté client si on veut UNIQUEMENT urgent.
   */
  async getUrgentOrders(params = {}) {
    const { data } = await api.get('/api/v1/delivery/available/', { params });
    const list = Array.isArray(data?.data) ? data.data : [];
    return { ...data, data: list.filter(o => o.priority === 'urgent' || o.is_urgent === true) };
  },

  /**
   * Accepte une course par order_id (le backend attend `order_id`, pas
   * assignment_id — l'assignment est CRÉÉ par l'accept). Lock atomique
   * via select_for_update : un seul driver gagne.
   * 409 si déjà acceptée par un autre.
   */
  async acceptDelivery(orderId, extra = {}) {
    const payload = { order_id: orderId, ...extra };
    const { data } = await api.post('/api/v1/delivery/accept/', payload);
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
