import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'pearl_offline_queue';

/**
 * Simple offline queue that stores failed API calls for retry.
 * Stores operations as { id, action, params, createdAt }.
 */
const offlineQueue = {
  /**
   * Add a failed operation to the queue.
   * @param {string} action - e.g. 'updateDeliveryStatus', 'updateLocation'
   * @param {object} params - the parameters for the API call
   */
  async enqueue(action, params) {
    try {
      const queue = await this.getAll();
      queue.push({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action,
        params,
        createdAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  },

  /**
   * Get all queued operations.
   */
  async getAll() {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Remove a specific item from the queue.
   */
  async dequeue(id) {
    try {
      const queue = await this.getAll();
      const filtered = queue.filter(item => item.id !== id);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    } catch {}
  },

  /**
   * Process all queued operations. Returns count of successfully processed items.
   * @param {object} services - { deliveryService, earningsService }
   */
  async processAll(services) {
    const queue = await this.getAll();
    if (queue.length === 0) return 0;

    let processed = 0;
    for (const item of queue) {
      try {
        if (item.action === 'updateDeliveryStatus' && services.deliveryService) {
          await services.deliveryService.updateDeliveryStatus(item.params.assignmentId, item.params.status);
        } else if (item.action === 'updateLocation' && services.deliveryService) {
          await services.deliveryService.updateLocation(item.params.lat, item.params.lng);
        } else if (item.action === 'toggleOnline' && services.deliveryService) {
          await services.deliveryService.toggleOnline(item.params.isOnline);
        }
        await this.dequeue(item.id);
        processed++;
      } catch {
        // Still offline or API error, keep in queue
        break;
      }
    }
    return processed;
  },

  /**
   * Clear all queued items.
   */
  async clear() {
    await AsyncStorage.removeItem(QUEUE_KEY).catch(() => {});
  },

  /**
   * Get queue size.
   */
  async size() {
    const queue = await this.getAll();
    return queue.length;
  },
};

export default offlineQueue;
