import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { isValidEmail } from '../utils/validation';
import secureStorage from '../services/secureStorage';
import { authService } from '../services/authService';
import { deliveryService } from '../services/deliveryService';
import { earningsService } from '../services/earningsService';

const AuthContext = createContext(null);

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

// Backend list endpoints answer with several shapes ({results}, {data}, raw array).
function extractList(resp) {
  if (Array.isArray(resp)) return resp;
  if (!resp || typeof resp !== 'object') return [];
  if (Array.isArray(resp.results)) return resp.results;
  if (Array.isArray(resp.data)) return resp.data;
  return [];
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

// --- adapters: backend payloads -> shapes the existing screens expect ---

function adaptProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.userName || raw.legal_name || raw.email || '';
  return {
    ...raw,
    email: raw.email || '',
    userName: name,
    firstName: name,
    lastName: '',
    pseudo: name,
    phone: raw.phone || '',
    vehicle: raw.vehicle_type || '',
    photo: raw.photo || null,
  };
}

function adaptEarningsWeek(rec) {
  const start = rec.period_start || '';
  return {
    start,
    range: start && rec.period_end ? `${fmtDate(start)} - ${fmtDate(rec.period_end)}` : start,
    total: Number(rec.net_amount ?? rec.gross_amount ?? 0),
    bars: [0, 0, 0, 0, 0, 0, 0], // backend exposes no per-day breakdown
    net: Number(rec.net_amount ?? 0),
    tips: Number(rec.tips_amount ?? 0),
    courses: Number(rec.total_deliveries ?? 0),
    status: rec.status || '',
  };
}

function adaptHistoryEntry(a) {
  const isCancelled = a.status === 'cancelled';
  const ts = a.delivered_at || a.cancelled_at || a.created_at || '';
  return {
    id: a.order_id != null ? `ORD-${a.order_id}` : `ASG-${a.id}`,
    assignmentId: a.id,
    restaurant: a.customer_name || a.pickup_address || 'Course',
    address: a.dropoff_address || '',
    distanceText: a.distance_km != null ? `${a.distance_km} km` : '',
    priceText: `${Number(a.delivery_fee ?? a.order_price ?? 0).toFixed(2)} €`,
    tip: a.tip_amount ? `${Number(a.tip_amount).toFixed(2)} €` : null,
    date: fmtDate(ts),
    time: fmtTime(ts),
    status: isCancelled ? 'cancelled' : 'completed',
    completedAt: isCancelled ? undefined : ts,
    cancelledAt: isCancelled ? ts : undefined,
  };
}

function adaptPayout(p, iban) {
  const amt = `${Number(p.amount ?? 0).toFixed(2)} €`;
  return {
    id: p.id,
    label: 'Versement',
    date: p.created_at ? `Initié : ${fmtDate(p.created_at)}` : '',
    amount: amt,
    iban: iban || '',
    status: p.status || '',
    paidAt: p.paid_at || null,
    detail: { net: amt, tips: '—', courses: '—', status: p.status || 'En cours' },
  };
}

function adaptWarning(w) {
  return {
    id: w.id != null ? `W-${w.id}` : `W-${Date.now()}`,
    reason: w.reason || w.type || 'Avertissement',
    severity: w.severity || '',
    date: fmtDate(w.created_at),
    time: fmtTime(w.created_at),
    createdAt: w.created_at || '',
  };
}

const ADMIN_REPLIES = [
  'Nous avons bien pris en compte votre demande. Un membre de l\'équipe va vous répondre sous peu.',
  'Merci pour votre patience. Nous analysons votre dossier.',
  'Votre demande est en cours de traitement par notre équipe.',
  'Nous revenons vers vous très rapidement avec une solution.',
  'Bien noté. Notre équipe travaille sur votre demande.',
];

export function AuthProvider({ children }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState(null);
  const [warnings, setWarnings] = useState(0);
  const [accountActive, setAccountActive] = useState(true);
  const [rating, setRating] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [weeklyCancels, setWeeklyCancels] = useState(0);
  const [isOnline, setIsOnlineState] = useState(false);
  const [warningsList, setWarningsList] = useState([]);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [currentEarningsCents, setCurrentEarningsCents] = useState(0);
  const [currentIban, setCurrentIban] = useState('');
  const [weeklyEarnings, setWeeklyEarnings] = useState([]);
  const [versements, setVersements] = useState([]);
  const [readOpportunities, setReadOpportunities] = useState([]);
  const [ticketMessages, setTicketMessages] = useState({});
  const [ticketReadCounts, setTicketReadCounts] = useState({});
  const MAX_WEEKLY_CANCELS = 5;

  const ibanRef = useRef('');
  const adminReplyTimers = useRef({});

  const applyProfile = useCallback((raw) => {
    const p = adaptProfile(raw);
    if (!p) return;
    setUser(p);
    setRating(Number(p.rating ?? 0));
    setTotalDeliveries(Number(p.total_deliveries ?? 0));
    setWarnings(Number(p.warnings_count ?? 0));
    setAccountActive(p.account_active !== false);
    setCurrentIban(p.iban || '');
    ibanRef.current = p.iban || '';
    if (typeof p.is_online === 'boolean') setIsOnlineState(p.is_online);
  }, []);

  const refreshEarnings = useCallback(async () => {
    try {
      const w = await earningsService.getWeeklyEarnings();
      setWeeklyEarnings(extractList(w).map(adaptEarningsWeek));
    } catch (e) { /* keep last known */ }
    try {
      const b = await earningsService.getCurrentBalance();
      setCurrentEarningsCents(Math.round(Number(b?.available_balance ?? 0) * 100));
    } catch (e) { /* keep last known */ }
    try {
      const p = await earningsService.getPayoutHistory();
      setVersements(extractList(p).map((x) => adaptPayout(x, ibanRef.current)));
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const h = await deliveryService.getDeliveryHistory(1);
      setDeliveryHistory(extractList(h).map(adaptHistoryEntry));
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshWarnings = useCallback(async () => {
    try {
      const p = await deliveryService.getPenalties();
      setWarningsList(extractList(p).map(adaptWarning));
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshEarnings(), refreshHistory(), refreshWarnings()]);
  }, [refreshEarnings, refreshHistory, refreshWarnings]);

  // Restore an existing session on cold start.
  useEffect(() => {
    (async () => {
      try {
        const token = await secureStorage.getSecure('accessToken');
        if (token) {
          const prof = await authService.getProfile();
          applyProfile(prof?.data || prof);
          await refreshAll();
        }
      } catch (e) {
        // no valid session -> the login screen is shown
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [applyProfile, refreshAll]);

  const login = useCallback(async (email, password) => {
    if (!isValidEmail(String(email || '').trim())) return { ok: false, error: 'invalid_email' };
    try {
      const res = await authService.login(String(email).trim(), password);
      applyProfile(res?.user);
      await refreshAll();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'login_failed' };
    }
  }, [applyProfile, refreshAll]);

  const register = useCallback(async (data) => {
    if (!data || !isValidEmail(String(data.email || '').trim())) return { ok: false, error: 'invalid_email' };
    const isPro = data.role === 'professionaluser';
    try {
      const payload = {
        email: String(data.email).trim(),
        userName: [data.prenom, data.nom].filter(Boolean).join(' ').trim() || data.pseudo || data.email,
        password: data.password,
        phone: data.phone || '',
        phoneCode: data.phoneCode || '',
        vehicle_type: 'scooter',
        country: data.country || 'FR',
        legal_status: isPro ? 'societe' : 'particulier',
      };
      if (data.companyName) payload.legal_name = data.companyName;
      const res = await authService.register(payload);
      // Particulier drivers are usable immediately -> open a session.
      // Pro drivers wait for document validation -> no auto-login.
      if (!isPro && res?.access_token) {
        await secureStorage.setSecure('accessToken', res.access_token);
        await secureStorage.setSecure('refreshToken', res.refresh_token);
        applyProfile(res.user);
        await refreshAll();
      }
      return { ok: true, pending: isPro };
    } catch (e) {
      return { ok: false, error: e?.message || 'register_failed' };
    }
  }, [applyProfile, refreshAll]);

  const logout = useCallback(async () => {
    try { await authService.logout(); } catch (e) { /* clear locally regardless */ }
    setUser(null);
    setWeeklyEarnings([]);
    setVersements([]);
    setDeliveryHistory([]);
    setWarningsList([]);
    setCurrentEarningsCents(0);
    setWarnings(0);
    setRating(0);
    setTotalDeliveries(0);
    setIsOnlineState(false);
  }, []);

  const updateUser = useCallback((updates) => {
    if (!updates) return;
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
    const allowed = {};
    const vt = updates.vehicle_type || updates.vehicle;
    if (vt) allowed.vehicle_type = vt;
    if (updates.id_card_front_url) allowed.id_card_front_url = updates.id_card_front_url;
    if (updates.id_card_back_url) allowed.id_card_back_url = updates.id_card_back_url;
    if (updates.iban_doc_url) allowed.iban_doc_url = updates.iban_doc_url;
    if (updates.kbis_doc_url) allowed.kbis_doc_url = updates.kbis_doc_url;
    if (Object.keys(allowed).length) authService.updateProfile(allowed).catch(() => {});
  }, []);

  const setIsOnline = useCallback((value) => {
    setIsOnlineState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      authService.updateProfile({ is_online: next }).catch(() => {});
      return next;
    });
  }, []);

  const cashOut = useCallback(async () => {
    try {
      await earningsService.requestCashout();
      await refreshEarnings();
    } catch (e) { /* surfaced by the calling screen */ }
  }, [refreshEarnings]);

  // A delivery is recorded server-side on completion; just pull fresh data.
  const addToHistory = useCallback(async () => {
    await refreshHistory();
    await refreshEarnings();
  }, [refreshHistory, refreshEarnings]);

  // --- account standing (warnings) -------------------------------------
  function addWarning(reason) {
    const now = new Date();
    const dateStr = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = `${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
    setWarningsList((prev) => [{
      id: `W-${Date.now()}`,
      reason: reason || 'Trop d\'annulations cette semaine',
      date: dateStr,
      time: timeStr,
      createdAt: now.toISOString(),
    }, ...prev]);
    setWarnings((prev) => {
      const next = prev + 1;
      if (next >= 3) setAccountActive(false);
      return next;
    });
  }

  function cancelOrder() {
    const newCount = weeklyCancels + 1;
    setWeeklyCancels(newCount);
    if (newCount > MAX_WEEKLY_CANCELS) {
      addWarning('Dépassement du nombre d\'annulations autorisées cette semaine (5 max)');
      return { warning: true, remaining: 0 };
    }
    return { warning: false, remaining: MAX_WEEKLY_CANCELS - newCount };
  }

  function reactivateAccount() {
    setAccountActive(true);
    setWarnings(0);
  }

  function markOrderReported(orderId) {
    setDeliveryHistory((prev) => prev.map((o) => (o.id === orderId ? { ...o, reported: true } : o)));
  }

  // --- support tickets --------------------------------------------------
  function getTicketMessages(ticketId) {
    return ticketMessages[ticketId] || null;
  }

  function saveTicketMessages(ticketId, msgs) {
    setTicketMessages((prev) => ({ ...prev, [ticketId]: msgs }));
  }

  function markTicketRead(ticketId) {
    setTicketReadCounts((prev) => {
      const msgs = ticketMessages[ticketId] || [];
      return { ...prev, [ticketId]: msgs.length };
    });
  }

  function scheduleAdminReply(ticketId) {
    if (adminReplyTimers.current[ticketId]) clearTimeout(adminReplyTimers.current[ticketId]);
    const delay = 3000 + Math.random() * 4000;
    adminReplyTimers.current[ticketId] = setTimeout(() => {
      const reply = ADMIN_REPLIES[Math.floor(Math.random() * ADMIN_REPLIES.length)];
      setTicketMessages((prev) => {
        const msgs = prev[ticketId] || [];
        return { ...prev, [ticketId]: [...msgs, {
          id: `admin-auto-${Date.now()}`,
          type: 'admin',
          text: reply,
          time: new Date().toISOString(),
        }] };
      });
      delete adminReplyTimers.current[ticketId];
    }, delay);
  }

  function cancelAdminReply(ticketId) {
    if (adminReplyTimers.current[ticketId]) {
      clearTimeout(adminReplyTimers.current[ticketId]);
      delete adminReplyTimers.current[ticketId];
    }
  }

  function getUnreadTicketCount() {
    let total = 0;
    Object.keys(ticketMessages).forEach((ticketId) => {
      const msgs = ticketMessages[ticketId] || [];
      const readCount = ticketReadCounts[ticketId] || 0;
      if (msgs.length > readCount) total++;
    });
    return total;
  }

  // --- opportunities (no backend endpoint yet) -------------------------
  function markOpportunityRead(id) {
    setReadOpportunities((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function getUnreadOpportunitiesCount(total) {
    return Math.max(0, (total || 0) - readOpportunities.length);
  }

  return (
    <AuthContext.Provider value={{
      bootstrapping, user, login, register, logout, updateUser,
      warnings, accountActive, rating, totalDeliveries,
      addWarning, cancelOrder, weeklyCancels, MAX_WEEKLY_CANCELS, reactivateAccount,
      deliveryHistory, addToHistory, markOrderReported, refreshAll,
      getTicketMessages, saveTicketMessages, markTicketRead, getUnreadTicketCount,
      scheduleAdminReply, cancelAdminReply, ticketMessages, ticketReadCounts,
      currentEarningsCents, cashOut, versements, weeklyEarnings, currentIban, setCurrentIban,
      isOnline, setIsOnline, warningsList,
      readOpportunities, markOpportunityRead, getUnreadOpportunitiesCount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
