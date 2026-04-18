import api from './api';

// Map the app's 5 UI steps to the backend's 5 assignment states.
// Backend state machine (VALID_STATUS_TRANSITIONS in DeliveryApp/views.py):
//   accepted → picked_up → in_transit → arrived → delivered
// App steps are: pickup, enroute, arrived, code, done.
// The `code` step has no backend counterpart (still 'arrived' server-side).
// Transitioning from pickup → enroute requires two backend calls in sequence
// (picked_up then in_transit) because the backend refuses to skip states.
export const STEP_TO_BACKEND_TRANSITIONS = {
  pickup: [], // no call — accept creates the 'accepted' state server-side
  enroute: ['picked_up', 'in_transit'],
  arrived: ['arrived'],
  code: [], // stays 'arrived' — delivery_code is sent with the 'delivered' call
  done: ['delivered'],
};

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

  // Backend expects `{ order_id }` (NewOrders.id) and returns a fresh
  // DeliveryAssignment whose own id is what UpdateDeliveryStatus uses.
  // See AcceptDeliveryView.post in Backend/Marketplace/DeliveryApp/views.py.
  async acceptDelivery(orderId, extra = {}) {
    const payload = { order_id: Number(orderId), ...extra };
    const { data } = await api.post('/api/v1/delivery/accept/', payload);
    return data;
  },

  async updateDeliveryStatus(assignmentId, status, extra = {}) {
    const body = { status, ...extra }; // `delivery_code` for status=delivered
    const { data } = await api.patch(`/api/v1/delivery/assignments/${assignmentId}/status/`, body);
    return data;
  },

  // Walk the backend state machine from the app's previous step to the new
  // one. Each call is sequential because picked_up → in_transit → arrived
  // can't be collapsed server-side. Any failure aborts subsequent calls so
  // we never send an invalid transition on top of a stale state.
  async advanceToStep(assignmentId, appStep, extra = {}) {
    const chain = STEP_TO_BACKEND_TRANSITIONS[appStep] || [];
    const results = [];
    for (const status of chain) {
      try {
        const extraForCall = status === 'delivered' ? extra : {};
        results.push(await this.updateDeliveryStatus(assignmentId, status, extraForCall));
      } catch (err) {
        return { ok: false, results, error: err };
      }
    }
    return { ok: true, results };
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
