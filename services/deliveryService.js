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
    // Backend returns { status, count, data: [{ order_id, customer_name,
    // order_price, pickup_address, dropoff_address, ... }] }. We normalise
    // into the shape the OrdersScreen JSX renders so the two sides stay
    // decoupled — backend can evolve its payload without breaking the UI.
    const { data } = await api.get('/api/v1/delivery/available/', { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows.map((r) => ({
      id: `ORD-${r.order_id}`,
      orderId: r.order_id,
      restaurant: r.customer_name || '',
      address: r.pickup_address || '',
      dropoffAddress: r.dropoff_address || '',
      priceText: r.order_price != null ? `${Number(r.order_price).toFixed(2)} €` : '',
      // Distance / ETA / items are not served by the backend today — caller
      // falls back to empty strings; the row still renders without NaN.
      distanceText: '',
      etaText: '',
      itemsCount: 0,
      items: [],
      category: r.delivery_method === 'delivery_pearl' ? 'Delivery' : '',
      notes: r.delivery_notes || '',
    }));
  },

  async acceptDelivery(orderId, meta = {}) {
    // Backend AcceptDeliveryView expects `order_id` (the NewOrders.id) plus
    // optional pickup/dropoff metadata used to populate the new
    // DeliveryAssignment row. Pass the current order id — the assignment
    // does not exist yet on the server side when the driver accepts.
    const payload = {
      order_id: orderId,
      pickup_address: meta.pickupAddress || '',
      dropoff_address: meta.dropoffAddress || '',
      pickup_lat: meta.pickupLat,
      pickup_lng: meta.pickupLng,
      dropoff_lat: meta.dropoffLat,
      dropoff_lng: meta.dropoffLng,
      delivery_fee: meta.deliveryFee || 0,
      distance_km: meta.distanceKm || 0,
      estimated_time_minutes: meta.estimatedTimeMinutes || 0,
    };
    const { data } = await api.post('/api/v1/delivery/accept/', payload);
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
};
