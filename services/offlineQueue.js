// services/offlineQueue.js
//
// Lightweight offline-first queue for non-critical writes (location pings,
// status updates, telemetry). When the network is offline, calls are pushed
// onto an AsyncStorage-backed queue and replayed in order when connectivity
// returns. Auth flows MUST NOT use this — they require synchronous failure.
//
// MVP scope (driver app):
//   - linear retry (one shot per replay tick), no exponential backoff
//   - bounded queue (default 200 items) — oldest dropped if exceeded
//   - per-call optional `dedupeKey` to coalesce repeated location updates
//
// Usage:
//   import offlineQueue from './offlineQueue';
//   offlineQueue.start();   // call once at app boot (App.js)
//   offlineQueue.enqueue({ method: 'POST', url: '/api/v1/delivery/location/', data: { lat, lng } });

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const STORAGE_KEY = '__offline_queue_v1';
const MAX_ITEMS = 200;

let memQueue = [];
let initialized = false;
let unsubNet = null;
let isOnline = true;
let flushing = false;

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memQueue));
  } catch {
    // Non-fatal: queue lost on restart
  }
}

async function load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) memQueue = JSON.parse(raw) || [];
  } catch {
    memQueue = [];
  }
}

async function flush() {
  if (flushing) return;
  if (!isOnline) return;
  if (memQueue.length === 0) return;
  flushing = true;
  try {
    while (memQueue.length > 0 && isOnline) {
      const item = memQueue[0];
      try {
        await api.request({
          method: item.method || 'POST',
          url: item.url,
          data: item.data,
          params: item.params,
        });
        memQueue.shift();
        await persist();
      } catch (err) {
        // Network error → stop, retry on next online event
        if (err?.isNetworkError) break;
        // Server error (4xx/5xx) → drop the item to avoid poison-pill loops
        memQueue.shift();
        await persist();
      }
    }
  } finally {
    flushing = false;
  }
}

const offlineQueue = {
  async start() {
    if (initialized) return;
    initialized = true;
    await load();
    // Capture initial state
    try {
      const state = await NetInfo.fetch();
      isOnline = !!state?.isConnected;
    } catch {
      isOnline = true;
    }
    unsubNet = NetInfo.addEventListener((state) => {
      const next = !!state?.isConnected;
      const wasOffline = !isOnline;
      isOnline = next;
      if (wasOffline && next) flush();
    });
    // Best-effort initial flush
    if (isOnline) flush();
  },

  stop() {
    if (unsubNet) {
      unsubNet();
      unsubNet = null;
    }
    initialized = false;
  },

  /**
   * Enqueue an API call. Returns immediately.
   * @param {{method?: string, url: string, data?: any, params?: any, dedupeKey?: string}} item
   */
  async enqueue(item) {
    if (!item || !item.url) return;
    if (item.dedupeKey) {
      memQueue = memQueue.filter((x) => x.dedupeKey !== item.dedupeKey);
    }
    memQueue.push({ ...item, ts: Date.now() });
    if (memQueue.length > MAX_ITEMS) {
      memQueue = memQueue.slice(memQueue.length - MAX_ITEMS);
    }
    await persist();
    if (isOnline) flush();
  },

  /** Test/inspection helper — returns a snapshot, not the live array. */
  size() {
    return memQueue.length;
  },

  async clear() {
    memQueue = [];
    await persist();
  },

  // Internal — exposed for tests
  _setOnline(v) {
    isOnline = !!v;
  },
  _flush: flush,
};

export default offlineQueue;
