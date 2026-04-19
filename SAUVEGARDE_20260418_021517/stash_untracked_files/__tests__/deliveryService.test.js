import { deliveryService } from '../services/deliveryService';
import api from '../services/api';

jest.mock('../services/api');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deliveryService', () => {
  describe('toggleOnline', () => {
    it('sends boolean is_online', async () => {
      api.post.mockResolvedValue({ data: { status: 'online' } });
      const result = await deliveryService.toggleOnline(true);
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/toggle-online/', { is_online: true });
      expect(result).toEqual({ status: 'online' });
    });

    it('coerces truthy values to boolean', async () => {
      api.post.mockResolvedValue({ data: {} });
      await deliveryService.toggleOnline(1);
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/toggle-online/', { is_online: true });
    });
  });

  describe('updateLocation', () => {
    it('accepts valid coordinates', async () => {
      api.post.mockResolvedValue({ data: { ok: true } });
      await deliveryService.updateLocation(48.95, 2.88);
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/location/', { lat: 48.95, lng: 2.88 });
    });

    it('rejects out-of-range latitude', async () => {
      await expect(deliveryService.updateLocation(91, 0)).rejects.toThrow('Latitude out of range');
    });

    it('rejects out-of-range longitude', async () => {
      await expect(deliveryService.updateLocation(0, 181)).rejects.toThrow('Longitude out of range');
    });

    it('rejects NaN coordinates', async () => {
      await expect(deliveryService.updateLocation('abc', 0)).rejects.toThrow('Invalid coordinates');
    });
  });

  describe('acceptDelivery', () => {
    it('sends valid assignment ID', async () => {
      api.post.mockResolvedValue({ data: { id: '123' } });
      await deliveryService.acceptDelivery('123');
      expect(api.post).toHaveBeenCalledWith('/api/v1/delivery/accept/', { assignment_id: '123' });
    });

    it('rejects empty ID', async () => {
      await expect(deliveryService.acceptDelivery('')).rejects.toThrow('Assignment ID is required');
    });

    it('rejects ID with injection characters', async () => {
      await expect(deliveryService.acceptDelivery("123'; DROP")).rejects.toThrow('Invalid Assignment ID format');
    });
  });

  describe('updateDeliveryStatus', () => {
    it('accepts valid status', async () => {
      api.patch.mockResolvedValue({ data: { ok: true } });
      await deliveryService.updateDeliveryStatus('42', 'picked_up');
      expect(api.patch).toHaveBeenCalledWith(
        '/api/v1/delivery/assignments/42/status/',
        { status: 'picked_up' }
      );
    });

    it('rejects invalid status', async () => {
      await expect(deliveryService.updateDeliveryStatus('42', 'hacked')).rejects.toThrow('Invalid status');
    });
  });

  describe('cancelDelivery', () => {
    it('sanitizes reason text', async () => {
      api.post.mockResolvedValue({ data: {} });
      await deliveryService.cancelDelivery('42', "can't deliver; too far");
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/delivery/assignments/42/cancel/',
        { reason: 'cant deliver too far' }
      );
    });
  });

  describe('getDeliveryHistory', () => {
    it('defaults to page 1', async () => {
      api.get.mockResolvedValue({ data: { results: [] } });
      await deliveryService.getDeliveryHistory();
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/history/', { params: { page: 1 } });
    });

    it('floors decimal page numbers', async () => {
      api.get.mockResolvedValue({ data: { results: [] } });
      await deliveryService.getDeliveryHistory(2.7);
      expect(api.get).toHaveBeenCalledWith('/api/v1/delivery/history/', { params: { page: 2 } });
    });
  });
});
