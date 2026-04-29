// Unit tests for services/deliveryService.js.
// Lightweight smoke coverage — the service is a thin axios wrapper, but
// regressions here would silently break the driver flow (location pings,
// accept, status updates).

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const api = require('../services/api').default;
const { deliveryService } = require('../services/deliveryService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deliveryService', () => {
  it('updateLocation posts {lat,lng} to the location endpoint', async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    await deliveryService.updateLocation(48.8566, 2.3522);
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/delivery/location/',
      { lat: 48.8566, lng: 2.3522 },
    );
  });

  it('propagates errors from updateLocation (callers must handle)', async () => {
    api.post.mockRejectedValueOnce(new Error('500'));
    await expect(deliveryService.updateLocation(0, 0)).rejects.toThrow('500');
  });

  it('acceptDelivery sends assignment_id (snake_case) to backend', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 99 } });
    await deliveryService.acceptDelivery(99);
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/delivery/accept/',
      { assignment_id: 99 },
    );
  });

  it('updateDeliveryStatus includes delivery_code only when provided', async () => {
    api.patch.mockResolvedValue({ data: {} });
    await deliveryService.updateDeliveryStatus(7, 'picked_up');
    expect(api.patch).toHaveBeenLastCalledWith(
      '/api/v1/delivery/assignments/7/status/',
      { status: 'picked_up' },
    );
    await deliveryService.updateDeliveryStatus(7, 'delivered', '1234');
    expect(api.patch).toHaveBeenLastCalledWith(
      '/api/v1/delivery/assignments/7/status/',
      { status: 'delivered', delivery_code: '1234' },
    );
  });
});
