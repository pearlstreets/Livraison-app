import api from './api';

// The Marketplace backend only exposes two endpoints for driver earnings:
//   GET  /api/v1/delivery/earnings/         → paginated list of weekly
//                                              DriverEarnings rows
//   POST /api/v1/delivery/earnings/cashout/ → request immediate payout
// There is NO /earnings/balance/ or /earnings/payouts/ endpoint (we
// previously called those and they 404'd). Balance + payout history are
// derived client-side from the weekly list.

async function fetchAllEarnings(maxPages = 6) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    let payload;
    try {
      const { data } = await api.get('/api/v1/delivery/earnings/', { params: { page } });
      payload = data;
    } catch {
      break; // backend unreachable — return whatever we have
    }
    const list = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];
    if (list.length === 0) break;
    all.push(...list);
    if (!payload?.next) break;
  }
  return all;
}

function weeklyToCents(raw) {
  // DriverEarningsSerializer uses DecimalField euros; prefer an explicit
  // cents field when present in case the backend switches to integer cents.
  const cents = Number(raw?.net_amount_cents ?? raw?.netAmountCents ?? NaN);
  if (Number.isFinite(cents)) return Math.round(cents);
  const net = Number(raw?.net_amount ?? 0);
  return Math.round(net * 100);
}

export const earningsService = {
  // Raw paginated list of weekly earnings rows.
  async getWeeklyEarnings(page = 1) {
    const { data } = await api.get('/api/v1/delivery/earnings/', { params: { page } });
    return data;
  },

  // Current unpaid balance — sum of net_amount across rows whose status is
  // NOT 'paid'. Exposed with the field shape components/api.js already
  // handles (balance_cents / balanceCents / amount_cents).
  async getCurrentBalance() {
    const rows = await fetchAllEarnings(6);
    const pendingCents = rows
      .filter(r => String(r?.status || '').toLowerCase() !== 'paid')
      .reduce((sum, r) => sum + weeklyToCents(r), 0);
    return {
      balance_cents: pendingCents,
      balanceCents: pendingCents,
      amount_cents: pendingCents,
    };
  },

  // Paid / completed weekly rows — what WalletScreen and VersementsList
  // render as past payouts.
  async getPayoutHistory() {
    const rows = await fetchAllEarnings(6);
    return { results: rows.filter(r => String(r?.status || '').toLowerCase() === 'paid') };
  },

  // Immediate payout request (throttled server-side to 1/day).
  async requestCashout() {
    const { data } = await api.post('/api/v1/delivery/earnings/cashout/');
    return data;
  },
};
