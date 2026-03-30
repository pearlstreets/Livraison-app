import api from './api';

export const earningsService = {
  async getWeeklyEarnings() {
    const { data } = await api.get('/api/v1/delivery/earnings/');
    return data;
  },

  async getCurrentBalance() {
    const { data } = await api.get('/api/v1/delivery/earnings/balance/');
    return data;
  },

  async requestCashout() {
    const { data } = await api.post('/api/v1/delivery/earnings/cashout/');
    return data;
  },

  async getPayoutHistory(page = 1) {
    const { data } = await api.get('/api/v1/delivery/earnings/payouts/', { params: { page } });
    return data;
  },
};
