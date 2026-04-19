import { ticketService } from '../services/ticketService';
import api from '../services/api';

jest.mock('../services/api');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ticketService', () => {
  describe('createTicket', () => {
    it('creates a ticket with valid payload', async () => {
      api.post.mockResolvedValue({ data: { id: 't1' } });
      const result = await ticketService.createTicket({
        assignment_id: '42',
        problem_type: 'damaged_order',
        description: 'Package was torn',
      });
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/tickets/create/', expect.objectContaining({
        problem_type: 'damaged_order',
      }));
      expect(result).toEqual({ id: 't1' });
    });

    it('rejects missing problem_type', async () => {
      await expect(ticketService.createTicket({ description: 'test' })).rejects.toThrow('Problem type is required');
    });

    it('rejects null payload', async () => {
      await expect(ticketService.createTicket(null)).rejects.toThrow('Problem type is required');
    });
  });

  describe('getTickets', () => {
    it('fetches with default page 1', async () => {
      api.get.mockResolvedValue({ data: { results: [] } });
      await ticketService.getTickets();
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/tickets/', { params: { page: 1 } });
    });
  });

  describe('getTicketDetail', () => {
    it('fetches ticket by ID', async () => {
      api.get.mockResolvedValue({ data: { id: 't1', status: 'open' } });
      const result = await ticketService.getTicketDetail('t1');
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/tickets/t1/');
      expect(result.status).toBe('open');
    });

    it('rejects empty ID', async () => {
      await expect(ticketService.getTicketDetail('')).rejects.toThrow('Ticket ID is required');
    });
  });

  describe('sendMessage', () => {
    it('sends a message to a ticket', async () => {
      api.post.mockResolvedValue({ data: { id: 'm1' } });
      await ticketService.sendMessage('t1', 'Hello support');
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/tickets/t1/message/', { text: 'Hello support' });
    });

    it('rejects empty text', async () => {
      await expect(ticketService.sendMessage('t1', '')).rejects.toThrow('Message text is required');
    });

    it('rejects whitespace-only text', async () => {
      await expect(ticketService.sendMessage('t1', '   ')).rejects.toThrow('Message text is required');
    });

    it('rejects empty ticket ID', async () => {
      await expect(ticketService.sendMessage('', 'hi')).rejects.toThrow('Ticket ID is required');
    });
  });
});
