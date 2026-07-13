import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { isValidEmail } from '../utils/validation';
import secureStorage from '../services/secureStorage';
import { authService } from '../services/authService';
import { deliveryService } from '../services/deliveryService';
import { earningsService } from '../services/earningsService';
import { ticketService } from '../services/ticketService';

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
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  // Vrais champs séparés si présents, sinon dérivés du nom complet (comptes
  // existants créés avant l'ajout de first_name/last_name/pseudo).
  const firstName = raw.first_name || parts[0] || '';
  const lastName = raw.last_name || (parts.length > 1 ? parts.slice(1).join(' ') : '');
  const pseudo = raw.pseudo || name;
  return {
    ...raw,
    email: raw.email || '',
    userName: name,
    firstName,
    lastName,
    pseudo,
    phone: raw.phone || '',
    vehicle: raw.vehicle_type || '',
    // Photo de profil : le backend renvoie profile_photo_url (pas raw.photo).
    photo: raw.profile_photo_url || raw.photo || null,
    isVerified: !!raw.is_verified,
  };
}

function adaptEarningsWeek(rec) {
  const start = rec.period_start || '';
  return {
    start,
    range: start && rec.period_end ? `${fmtDate(start)} - ${fmtDate(rec.period_end)}` : start,
    total: Number(rec.net_amount ?? rec.gross_amount ?? 0),
    // Vraies barres par jour (lun→dim) fournies par le backend (daily_breakdown).
    bars: Array.isArray(rec.daily_breakdown) && rec.daily_breakdown.length === 7
      ? rec.daily_breakdown.map((v) => Number(v) || 0)
      : [0, 0, 0, 0, 0, 0, 0],
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
    createdAtRaw: p.created_at || null,
    // Détail réel du versement (DriverEarnings) : net, pourboires, nb de courses.
    detail: {
      net: `${Number(p.net_amount ?? p.amount ?? 0).toFixed(2)} €`,
      tips: p.tips_amount != null ? `${Number(p.tips_amount).toFixed(2)} €` : '—',
      courses: p.total_deliveries != null ? p.total_deliveries : '—',
      status: p.status || 'En cours',
    },
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
  const [ratingsSummary, setRatingsSummary] = useState(null);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [opportunitiesCount, setOpportunitiesCount] = useState(0);
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
      // Synthèse RÉELLE (compteur, compte actif, annulations de la semaine) —
      // source de vérité backend, plus de compteur local.
      const s = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
      if (typeof s.warnings_count === 'number') setWarnings(s.warnings_count);
      if (typeof s.account_active === 'boolean') setAccountActive(s.account_active);
      if (typeof s.cancellations_this_week === 'number') setWeeklyCancels(s.cancellations_this_week);
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshRatings = useCallback(async () => {
    try {
      const r = await deliveryService.getRatings();
      const d = (r && r.data) ? r.data : r;
      setRatingsSummary(d || null);
      // La note moyenne (recalculée serveur) devient la source de vérité.
      if (d && typeof d.average === 'number') setRating(d.average);
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshTickets = useCallback(async () => {
    // Badge « support » = nombre de tickets non résolus (source backend réelle,
    // remplace l'ancien compteur local mort).
    try {
      const r = await ticketService.getTickets();
      const list = extractList(r);
      const openCount = list.filter((tk) => {
        const st = String(tk?.status || '').toLowerCase();
        return st === 'open' || st === 'in_progress';
      }).length;
      setOpenTicketCount(openCount);
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshOpportunities = useCallback(async () => {
    // Compte réel d'opportunités actives (pour le badge, au lieu d'un 4 en dur).
    try {
      const r = await deliveryService.getOpportunities();
      setOpportunitiesCount(extractList(r).length);
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshEarnings(), refreshHistory(), refreshWarnings(), refreshRatings(), refreshTickets(), refreshOpportunities()]);
  }, [refreshEarnings, refreshHistory, refreshWarnings, refreshRatings, refreshTickets, refreshOpportunities]);

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
        // Identité séparée persistée côté livreur (header du profil).
        first_name: (data.prenom || '').trim(),
        last_name: (data.nom || '').trim(),
        pseudo: (data.pseudo || '').trim(),
        password: data.password,
        phone: data.phone || '',
        phoneCode: data.phoneCode || '',
        vehicle_type: 'scooter',
        country: data.country || 'FR',
        legal_status: isPro ? 'societe' : 'particulier',
      };
      if (data.companyName) payload.legal_name = data.companyName;
      if (data.documents) {
        const d = data.documents;
        [
          'id_card_front_url', 'id_card_back_url', 'iban_doc_url', 'kbis_doc_url',
          'rc_pro_url', 'urssaf_doc_url', 'proof_of_address_url', 'profile_photo_url',
        ].forEach((k) => { if (d[k]) payload[k] = d[k]; });
      }
      await authService.register(payload);
      // Every new driver starts pending admin validation of their
      // documents — no auto-login; the app shows the pending screen.
      return { ok: true, pending: true };
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
    // Identité éditable → persistée en base via PUT /profile/.
    const fn = updates.first_name ?? updates.firstName;
    const ln = updates.last_name ?? updates.lastName;
    if (fn != null) allowed.first_name = fn;
    if (ln != null) allowed.last_name = ln;
    if (updates.pseudo != null) allowed.pseudo = updates.pseudo;
    if (updates.userName) allowed.userName = updates.userName;
    // Photo : on n'envoie qu'une URL S3 (http), jamais un URI local (file://).
    const photoUrl = updates.profile_photo_url
      || (typeof updates.photo === 'string' && /^https?:/.test(updates.photo) ? updates.photo : null);
    if (photoUrl) allowed.profile_photo_url = photoUrl;
    if (updates.iban) allowed.iban = updates.iban;
    if (updates.bic) allowed.bic = updates.bic;
    if (updates.iban_holder_name) allowed.iban_holder_name = updates.iban_holder_name;
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
    // Nombre de tickets support non résolus (réel, rafraîchi via refreshTickets).
    return openTicketCount;
  }

  // --- opportunities (backend-driven : GET /opportunities/) ------------
  function markOpportunityRead(id) {
    setReadOpportunities((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function getUnreadOpportunitiesCount(total) {
    // Utilise le vrai nombre d'opportunités si connu, sinon le total passé.
    const n = opportunitiesCount || total || 0;
    return Math.max(0, n - readOpportunities.length);
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
      isOnline, setIsOnline, warningsList, ratingsSummary, refreshRatings,
      readOpportunities, markOpportunityRead, getUnreadOpportunitiesCount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
