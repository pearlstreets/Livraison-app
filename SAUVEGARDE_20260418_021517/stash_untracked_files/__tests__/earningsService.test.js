import { earningsService } from '../services/earningsService';
import api from '../services/api';

jest.mock('../services/api');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('earningsService', () => {
  describe('getWeeklyEarnings', () => {
    it('fetches weekly earnings', async () => {
      api.get.mockResolvedValue({ data: { weeks: [{ total: 284.30 }] } });
      const result = await earningsService.getWeeklyEarnings();
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/earnings/');
      expect(result.weeks).toHaveLength(1);
    });
  });

  describe('getCurrentBalance', () => {
    it('fetches current balance', async () => {
      api.get.mockResolvedValue({ data: { balance: 150.00 } });
      const result = await earningsService.getCurrentBalance();
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/earnings/balance/');
      expect(result.balance).toBe(150.00);
    });
  });

  describe('requestCashout', () => {
    it('sends cashout request', async () => {
      api.post.mockResolvedValue({ data: { status: 'processing' } });
      const result = await earningsService.requestCashout();
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/earnings/cashout/');
      expect(result.status).toBe('processing');
    });

    it('propagates API errors', async () => {
      api.post.mockRejectedValue(new Error('Insufficient balance'));
      await expect(earningsService.requestCashout()).rejects.toThrow('Insufficient balance');
    });
  });

  describe('getPayoutHistory', () => {
    it('fetches payout history with default page', async () => {
      api.get.mockResolvedValue({ data: { results: [], count: 0 } });
      const result = await earningsService.getPayoutHistory();
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/earnings/payouts/', { params: { page: 1 } });
      expect(result.results).toEqual([]);
    });

    it('fetches specific page', async () => {
      api.get.mockResolvedValue({ data: { results: [{ amount: '50.00 €' }] } });
      await earningsService.getPayoutHistory(3);
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/earnings/payouts/', { params: { page: 3 } });
    });
  });
});
