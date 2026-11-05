import api from './api';

export const ticketService = {
  async createTicket(payload) {
    // payload: { assignment_id, problem_type, description }
    const { data } = await api.post('/api/v1/delivery/tickets/create/', payload);
    return data;
  },

  async getTickets(page = 1) {
    const { data } = await api.get('/api/v1/delivery/tickets/', { params: { page } });
    return data;
  },

  // Tous les tickets du livreur : le serveur pagine (10 par page par défaut),
  // on suit `next` jusqu'au bout, par pages de 100.
  async getAllTickets() {
    const tous = [];
    for (let page = 1; page <= 50; page += 1) {
      const { data } = await api.get('/api/v1/delivery/tickets/', { params: { page, page_size: 100 } });
      const liste = Array.isArray(data) ? data : (data?.results || data?.data || []);
      if (Array.isArray(liste)) tous.push(...liste);
      if (Array.isArray(data) || !data?.next) break;
    }
    return tous;
  },

  async getTicketDetail(ticketId) {
    const { data } = await api.get(`/api/v1/delivery/tickets/${ticketId}/`);
    return data;
  },

  async sendMessage(ticketId, text) {
    const { data } = await api.post(`/api/v1/delivery/tickets/${ticketId}/message/`, { text });
    return data;
  },
};
