import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeInput, isValidEmail } from '../utils/validation';
import secureStorage from '../services/secureStorage';
import {
  isBiometricEnabled,
  authenticateBiometric,
} from '../services/biometricAuth';
import api from '../services/api';

const DUTY_STATUS_KEY = '@duty_status';

function _getOneSignal() {
  try { const m = require('react-native-onesignal'); return m.OneSignal || m.default || m; } catch { return null; }
}

// Mock user list for legacy local-login path. Empty in release builds —
// production auth goes through OTP via loginWithOtp(). Dev-only seed kept
// behind __DEV__ so creds never ship in the bundle.
const USERS = __DEV__ ? [] : [];

const AuthContext = createContext(null);

// Max login attempts before lockout
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes


const INITIAL_WEEKS = []; // données réelles chargées depuis /api/v1/delivery/earnings/

const MONTH_NAMES_FR = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sep.', 'oct.', 'nov.', 'déc.'];

function _formatWeekRange(periodStart, periodEnd) {
  const s = new Date(periodStart);
  const e = new Date(periodEnd);
  return `${s.getDate()} ${MONTH_NAMES_FR[s.getMonth()]} - ${e.getDate()} ${MONTH_NAMES_FR[e.getMonth()]}`;
}

function _earningsToWeek(item) {
  const total = parseFloat(item.net_amount || 0) + parseFloat(item.tips_amount || 0);
  const dailyAvg = total / 7;
  return {
    start: item.period_start,
    range: _formatWeekRange(item.period_start, item.period_end),
    total: Math.round(total * 100) / 100,
    bars: [dailyAvg, dailyAvg, dailyAvg, dailyAvg, dailyAvg, dailyAvg, dailyAvg],
  };
}

const INITIAL_HISTORY = [];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [warnings, setWarnings] = useState(0);
  const [accountActive, setAccountActive] = useState(true);
  const [rating, setRating] = useState(4.8);
  const [totalDeliveries, setTotalDeliveries] = useState(127);
  const [weeklyCancels, setWeeklyCancels] = useState(0);
  // `isOnline` aka duty status. Persisted to AsyncStorage under @duty_status so
  // a driver who toggles off-duty does not start tracking again on next launch.
  const [isOnline, setIsOnlineState] = useState(true);
  const [dutyHydrated, setDutyHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DUTY_STATUS_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw === 'off') setIsOnlineState(false);
        else if (raw === 'on') setIsOnlineState(true);
        setDutyHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setDutyHydrated(true);
      });
    return () => { cancelled = true; };
  }, []);

  const setIsOnline = useCallback((next) => {
    const v = typeof next === 'function' ? next(isOnline) : !!next;
    setIsOnlineState(v);
    AsyncStorage.setItem(DUTY_STATUS_KEY, v ? 'on' : 'off').catch(() => {});
  }, [isOnline]);

  // ── Session hydration ─────────────────────────────────────────────────────
  // On cold start: if a token is in SecureStore, restore the cached profile.
  // If the user opted into biometric unlock, gate restoration on a successful
  // prompt — failure wipes the SecureStore entry and forces a fresh login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await secureStorage.getSecure('accessToken').catch(() => null);
        if (cancelled || !token) return;

        const useBio = await isBiometricEnabled();
        if (useBio) {
          const res = await authenticateBiometric({
            promptMessage: 'Déverrouiller Pearl Delivery',
            cancelLabel: 'Annuler',
          });
          if (cancelled) return;
          if (!res.success) {
            // Biometric refused / cancelled / locked → clear session.
            await secureStorage.removeSecure('accessToken').catch(() => {});
            await secureStorage.removeSecure('refreshToken').catch(() => {});
            await AsyncStorage.removeItem('userData').catch(() => {});
            return;
          }
        }

        const stored = await AsyncStorage.getItem('userData').catch(() => null);
        if (cancelled || !stored) return;
        try {
          const profile = JSON.parse(stored);
          if (profile && typeof profile === 'object') setUser(profile);
        } catch {}
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  const [warningsList, setWarningsList] = useState([]);
  const [deliveryHistory, setDeliveryHistory] = useState(INITIAL_HISTORY);
  const [currentEarningsCents, setCurrentEarningsCents] = useState(0);
  const [currentIban, setCurrentIban] = useState(null);
  const [weeklyEarnings, setWeeklyEarnings] = useState(INITIAL_WEEKS);
  const [versements, setVersements] = useState([]);
  const [readOpportunities, setReadOpportunities] = useState([]);
  const [ticketMessages, setTicketMessages] = useState({});
  const [ticketReadCounts, setTicketReadCounts] = useState({}); // { ticketId: lastReadCount }
  const MAX_WEEKLY_CANCELS = 5;

  const fetchEarnings = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/delivery/earnings/');
      const items = res?.data?.results || res?.data || [];
      if (Array.isArray(items) && items.length > 0) {
        setWeeklyEarnings(items.map(_earningsToWeek));
        const pending = items.find(i => i.status === 'pending');
        if (pending) {
          const cents = Math.round(
            (parseFloat(pending.net_amount || 0) + parseFloat(pending.tips_amount || 0)) * 100
          );
          setCurrentEarningsCents(cents);
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[AuthContext] fetchEarnings failed:', err?.message);
    }
  }, []);

  // Login attempt tracking
  const loginAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef(null);

  function login(email, password) {
    // Check lockout
    if (lockoutUntilRef.current && Date.now() < lockoutUntilRef.current) {
      const remaining = Math.ceil((lockoutUntilRef.current - Date.now()) / 1000);
      return { locked: true, remainingSeconds: remaining };
    }

    // Validate and sanitize inputs
    const cleanEmail = sanitizeInput(email);
    if (!isValidEmail(cleanEmail)) return false;
    if (!password || typeof password !== 'string') return false;

    const found = USERS.find(
      u => u.email.toLowerCase() === cleanEmail.toLowerCase() && u.password === password
    );
    if (!found) {
      loginAttemptsRef.current += 1;
      if (loginAttemptsRef.current >= MAX_LOGIN_ATTEMPTS) {
        lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION_MS;
        loginAttemptsRef.current = 0;
        return { locked: true, remainingSeconds: LOCKOUT_DURATION_MS / 1000 };
      }
      return false;
    }
    // Reset attempts on success
    loginAttemptsRef.current = 0;
    lockoutUntilRef.current = null;
    const { password: _, ...profile } = found;
    setUser({ ...profile, photo: null });
    try { const OS = _getOneSignal(); if (OS) OS.login(cleanEmail); } catch {}
    return true;
  }

  function register(data) {
    // Validate email
    const cleanEmail = sanitizeInput(data.email);
    if (!isValidEmail(cleanEmail)) return false;

    // Check if email already exists
    if (USERS.find(u => u.email.toLowerCase() === cleanEmail.toLowerCase())) return false;

    // Sanitize all user inputs
    const newUser = {
      email: cleanEmail,
      password: data.password,
      firstName: sanitizeInput(data.prenom),
      lastName: sanitizeInput(data.nom),
      pseudo: sanitizeInput(data.pseudo),
      phone: sanitizeInput(data.phone),
      vehicle: 'Scooter',
      role: data.role || 'user',
      isVerified: data.role === 'user' ? true : false,
      companyName: sanitizeInput(data.companyName || ''),
      country: data.country || 'FR',
    };
    USERS.push(newUser);
    if (data.role === 'user') {
      const { password: _, ...profile } = newUser;
      setUser({ ...profile, photo: null });
    }
    return true;
  }

  function logout() {
    try { const OS = _getOneSignal(); if (OS) OS.logout(); } catch {}
    // Clear OTP-login tokens if present (best-effort; legacy login path has its own cleanup)
    secureStorage.removeSecure('accessToken').catch(() => {});
    secureStorage.removeSecure('refreshToken').catch(() => {});
    AsyncStorage.removeItem('userData').catch(() => {});
    setUser(null);
  }

  /**
   * Set session state after a successful OTP v2 phone verify.
   * Stores tokens in secureStorage (same keys as authService.login so
   * axios interceptors / refresh logic keep working) and sets the
   * driver profile in the React context.
   *
   * @param {Object} otpResult — the `verifyOtp()` return value from
   *   `services/otpauth/useOtpSender.js` — must contain accessToken,
   *   refreshToken, userId, phoneE164, userType ("delivery_driver").
   */
  async function loginWithOtp(otpResult) {
    if (!otpResult?.accessToken || !otpResult?.refreshToken) return false;
    try {
      await secureStorage.setSecure('accessToken', otpResult.accessToken);
      await secureStorage.setSecure('refreshToken', otpResult.refreshToken);
    } catch {}
    const driverProfile = {
      id: otpResult.userId || null,
      email: '',
      firstName: '',
      lastName: '',
      pseudo: '',
      phone: otpResult.phoneE164 || '',
      vehicle: 'Scooter',
      photo: null,
      role: 'deliverydriver',
      isVerified: true,
    };
    try {
      await AsyncStorage.setItem('userData', JSON.stringify(driverProfile));
    } catch {}
    setUser(driverProfile);
    fetchEarnings().catch(() => {});
    try {
      const OS = _getOneSignal();
      if (OS && otpResult.userId) OS.login(String(otpResult.userId));
    } catch {}
    // Reset login lockout state on successful OTP login
    loginAttemptsRef.current = 0;
    lockoutUntilRef.current = null;
    return true;
  }

  function updateUser(updates) { setUser(prev => prev ? { ...prev, ...updates } : prev); }

  function addWarning(reason) {
    const now = new Date();
    const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = `${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
    setWarningsList(prev => [{
      id: `W-${Date.now()}`,
      reason: reason || 'Trop d\'annulations cette semaine',
      date: dateStr,
      time: timeStr,
      createdAt: now.toISOString(),
    }, ...prev]);
    setWarnings(prev => {
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

  function addToHistory(order) {
    setDeliveryHistory(prev => {
      if (prev.find(o => o.id === order.id)) return prev;
      const now = new Date();
      const h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${h}h${m}`;
      const day = now.getDate();
      const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
      const dateStr = `${day} ${months[now.getMonth()]}`;
      const isCancelled = order.status === 'cancelled';
      const entry = {
        id: order.id || order.code,
        restaurant: order.restaurant || order.merchantName || '',
        address: order.dropoffAddress || order.address || '',
        distanceText: order.distanceText || '',
        priceText: isCancelled ? '0,00 €' : (order.priceText || order.price || ''),
        tip: isCancelled ? null : (order.tip || (Math.random() > 0.5 ? (Math.random() * 3 + 1).toFixed(2) + ' €' : null)),
        date: dateStr,
        time: timeStr,
        status: isCancelled ? 'cancelled' : 'completed',
        ...(isCancelled ? { cancelledAt: now.toISOString() } : { completedAt: now.toISOString() }),
      };
      return [entry, ...prev];
    });
    if (order.status !== 'cancelled') {
      setTotalDeliveries(prev => prev + 1);
      // Update earnings
      const priceStr = order.priceText || order.price || '0';
      const priceParsed = parseFloat(String(priceStr).replace(',', '.').replace(/[^0-9.]/g, ''));
      if (!isNaN(priceParsed) && priceParsed > 0) {
        const cents = Math.round(priceParsed * 100);
        setCurrentEarningsCents(prev => prev + cents);
        // Update weekly earnings - find the week that contains today
        const now = new Date();
        const todayMs = now.getTime();
        setWeeklyEarnings(prev => {
          const idx = prev.findIndex(w => {
            const wStart = new Date(w.start);
            const wEnd = new Date(w.start);
            wEnd.setDate(wStart.getDate() + 6);
            wEnd.setHours(23, 59, 59, 999);
            return todayMs >= wStart.getTime() && todayMs <= wEnd.getTime();
          });
          if (idx < 0) return prev; // no matching week, don't create new
          const updated = [...prev];
          const week = { ...updated[idx] };
          week.total = Math.round((week.total + priceParsed) * 100) / 100;
          // Determine which day index within this week
          const wStart = new Date(week.start);
          const diffDays = Math.floor((todayMs - wStart.getTime()) / (1000 * 60 * 60 * 24));
          const dayIdx = Math.min(Math.max(diffDays, 0), 6);
          week.bars = [...week.bars];
          week.bars[dayIdx] = (week.bars[dayIdx] || 0) + Math.round(priceParsed);
          updated[idx] = week;
          return updated;
        });
      }
    }
  }

  const adminReplyTimers = useRef({});

  const ADMIN_REPLIES = [
    'Nous avons bien pris en compte votre demande. Un membre de l\'équipe va vous répondre sous peu.',
    'Merci pour votre patience. Nous analysons votre dossier.',
    'Votre demande est en cours de traitement par notre équipe.',
    'Nous revenons vers vous très rapidement avec une solution.',
    'Bien noté. Notre équipe travaille sur votre demande.',
  ];

  function getTicketMessages(ticketId) {
    return ticketMessages[ticketId] || null;
  }

  function saveTicketMessages(ticketId, msgs) {
    setTicketMessages(prev => ({ ...prev, [ticketId]: msgs }));
  }

  function markTicketRead(ticketId) {
    setTicketReadCounts(prev => {
      const msgs = ticketMessages[ticketId] || [];
      return { ...prev, [ticketId]: msgs.length };
    });
  }

  function scheduleAdminReply(ticketId) {
    if (adminReplyTimers.current[ticketId]) clearTimeout(adminReplyTimers.current[ticketId]);
    const delay = 3000 + Math.random() * 4000;
    adminReplyTimers.current[ticketId] = setTimeout(() => {
      const reply = ADMIN_REPLIES[Math.floor(Math.random() * ADMIN_REPLIES.length)];
      setTicketMessages(prev => {
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
    Object.keys(ticketMessages).forEach(ticketId => {
      const msgs = ticketMessages[ticketId] || [];
      const readCount = ticketReadCounts[ticketId] || 0;
      if (msgs.length > readCount) total++;
    });
    return total;
  }

  function markOpportunityRead(id) {
    setReadOpportunities(prev => prev.includes(id) ? prev : [...prev, id]);
  }

  function getUnreadOpportunitiesCount(total) {
    return Math.max(0, total - readOpportunities.length);
  }

  function markOrderReported(orderId) {
    setDeliveryHistory(prev => prev.map(o => o.id === orderId ? { ...o, reported: true } : o));
  }

  const cashOut = useCallback(async () => {
    if (currentEarningsCents <= 0) return { success: false, reason: 'no_balance' };
    try {
      const res = await api.post('/api/v1/delivery/earnings/cashout/');
      if (res?.data) {
        setCurrentEarningsCents(0);
        fetchEarnings().catch(() => {});
        return { success: true };
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) return { success: false, reason: 'already_today' };
      if (__DEV__) console.warn('[cashOut] error:', err?.message);
      return { success: false, reason: 'error' };
    }
    return { success: false, reason: 'error' };
  }, [currentEarningsCents, fetchEarnings]);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loginWithOtp, updateUser, warnings, accountActive, rating, totalDeliveries, addWarning, cancelOrder, weeklyCancels, MAX_WEEKLY_CANCELS, reactivateAccount, deliveryHistory, addToHistory, markOrderReported, getTicketMessages, saveTicketMessages, currentEarningsCents, cashOut, fetchEarnings, versements, weeklyEarnings, currentIban, setCurrentIban, isOnline, setIsOnline, dutyHydrated, warningsList, markTicketRead, getUnreadTicketCount, scheduleAdminReply, cancelAdminReply, ticketMessages, ticketReadCounts, readOpportunities, markOpportunityRead, getUnreadOpportunitiesCount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
