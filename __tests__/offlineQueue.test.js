// Unit tests for services/offlineQueue.js.
// Each test resets modules so the queue's internal state is fresh.

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

function loadFresh() {
  const api = require('../services/api').default;
  const offlineQueue = require('../services/offlineQueue').default;
  return { api, offlineQueue };
}

describe('offlineQueue', () => {
  it('queues items when offline and flushes when reconnected', async () => {
    const { api, offlineQueue } = loadFresh();
    offlineQueue._setOnline(false);
    await offlineQueue.enqueue({ url: '/api/v1/delivery/location/', data: { lat: 1, lng: 2 } });
    expect(offlineQueue.size()).toBe(1);
    expect(api.request).not.toHaveBeenCalled();

    api.request.mockResolvedValueOnce({});
    offlineQueue._setOnline(true);
    await offlineQueue._flush();

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/delivery/location/', data: { lat: 1, lng: 2 } }),
    );
    expect(offlineQueue.size()).toBe(0);
  });

  it('drops 4xx/5xx items to avoid poison-pill loops', async () => {
    const { api, offlineQueue } = loadFresh();
    offlineQueue._setOnline(false);
    await offlineQueue.enqueue({ url: '/bad/', data: {} });
    api.request.mockRejectedValueOnce(Object.assign(new Error('400'), { isNetworkError: false }));
    offlineQueue._setOnline(true);
    await offlineQueue._flush();
    expect(offlineQueue.size()).toBe(0);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('retains items on network errors and stops flushing', async () => {
    const { api, offlineQueue } = loadFresh();
    offlineQueue._setOnline(false);
    await offlineQueue.enqueue({ url: '/a/' });
    await offlineQueue.enqueue({ url: '/b/' });
    expect(offlineQueue.size()).toBe(2);

    api.request.mockImplementation(async () => {
      const err = new Error('net');
      err.isNetworkError = true;
      throw err;
    });
    offlineQueue._setOnline(true);
    await offlineQueue._flush();
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(offlineQueue.size()).toBe(2); // both still queued, no poison-pill drop
  });

  it('coalesces repeated enqueues with the same dedupeKey', async () => {
    const { offlineQueue } = loadFresh();
    offlineQueue._setOnline(false);
    await offlineQueue.enqueue({ url: '/loc/', data: { v: 1 }, dedupeKey: 'loc' });
    await offlineQueue.enqueue({ url: '/loc/', data: { v: 2 }, dedupeKey: 'loc' });
    await offlineQueue.enqueue({ url: '/loc/', data: { v: 3 }, dedupeKey: 'loc' });
    expect(offlineQueue.size()).toBe(1);
  });
});
