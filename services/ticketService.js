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

  async getTicketDetail(ticketId) {
    const { data } = await api.get(`/api/v1/delivery/tickets/${ticketId}/`);
    return data;
  },

  async sendMessage(ticketId, text) {
    const { data } = await api.post(`/api/v1/delivery/tickets/${ticketId}/message/`, { text });
    return data;
  },
};
