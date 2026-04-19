import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { sanitizeInput, isValidEmail } from '../utils/validation';
import { authService } from '../services/authService';
import { deliveryService } from '../services/deliveryService';
import { earningsService } from '../services/earningsService';

const AuthContext = createContext(null);

// Max login attempts before lockout
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const [accountActive, setAccountActive] = useState(true);
  const [rating, setRating] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [weeklyCancels, setWeeklyCancels] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
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

  // Login attempt tracking
  const loginAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef(null);

  // Populate user state from API profile data
  function applyProfile(profile) {
    setUser({
      id: profile.id,
      email: profile.email,
      firstName: profile.userName || profile.firstName || '',
      lastName: profile.lastName || '',
      phone: profile.phone || '',
      phoneCode: profile.phoneCode || '',
      vehicle: profile.vehicle_type || 'scooter',
      photo: profile.photo || null,
      isVerified: profile.is_verified ?? false,
    });
    setRating(parseFloat(profile.rating) || 0);
    setTotalDeliveries(profile.total_deliveries || 0);
    setWarnings(profile.warnings_count || 0);
    setAccountActive(profile.account_active !== false);
    setIsOnline(profile.is_online || false);
    if (profile.total_earnings) {
      setCurrentEarningsCents(Math.round(parseFloat(profile.total_earnings) * 100));
    }
  }

  // Check if admin has approved the driver account
  const checkVerificationStatus = useCallback(async () => {
    try {
      const data = await authService.getProfile();
      const profile = data.data || data;
      if (profile.is_verified || profile.isVerified) {
        setUser(prev => prev ? { ...prev, isVerified: true } : prev);
        // Now that we're verified, fetch full data
        fetchEarnings();
        fetchHistory();
        return true;
      }
    } catch (e) {
      // API unavailable
    }
    return false;
  }, []);

  // Fetch earnings from API after login
  async function fetchEarnings() {
    try {
      const data = await earningsService.getWeeklyEarnings();
      if (data.results && data.results.length > 0) {
        const mapped = data.results.map(w => ({
          start: w.period_start,
          range: `${w.period_start} - ${w.period_end}`,
          total: parseFloat(w.net_amount) || 0,
          bars: [0, 0, 0, 0, 0, 0, 0],
          grossAmount: parseFloat(w.gross_amount) || 0,
          tipsAmount: parseFloat(w.tips_amount) || 0,
          status: w.status,
        }));
        setWeeklyEarnings(mapped);
        setVersements(mapped.filter(w => w.status === 'paid').map(w => ({
          label: 'Paiements hebdomadaires',
          date: `Initié : ${w.start}`,
          amount: `${w.total.toFixed(2)} €`,
          iban: currentIban,
          detail: { net: `${w.total.toFixed(2)} €`, tips: `${w.tipsAmount.toFixed(2)} €`, courses: w.total > 0 ? '-' : 0, status: 'Versé' },
        })));
      }
    } catch (e) {
      // API unavailable - keep current state
    }
  }

  // Fetch delivery history from API
  async function fetchHistory() {
    try {
      const data = await deliveryService.getDeliveryHistory();
      if (data.results && data.results.length > 0) {
        setDeliveryHistory(data.results.map(d => ({
          id: d.id || d.order_id,
          restaurant: d.restaurant || d.pickup_address || '',
          address: d.dropoff_address || '',
          distanceText: d.distance ? `${d.distance} km` : '',
          priceText: d.fees ? `${parseFloat(d.fees).toFixed(2)} €` : '0.00 €',
          tip: d.tips ? `${parseFloat(d.tips).toFixed(2)} €` : null,
          date: d.completed_at || d.created_at || '',
          time: '',
          status: d.status === 'delivered' ? 'completed' : d.status,
          completedAt: d.completed_at,
        })));
      }
    } catch (e) {
      // API unavailable - keep current state
    }
  }

  // ---- LOGIN (async, calls API) ----
  async function login(email, password) {
    // Check lockout
    if (lockoutUntilRef.current && Date.now() < lockoutUntilRef.current) {
      const remaining = Math.ceil((lockoutUntilRef.current - Date.now()) / 1000);
      return { locked: true, remainingSeconds: remaining };
    }

    const cleanEmail = sanitizeInput(email);
    if (!isValidEmail(cleanEmail)) return false;
    if (!password || typeof password !== 'string') return false;

    try {
      const data = await authService.login(cleanEmail, password);
      // Reset attempts on success
      loginAttemptsRef.current = 0;
      lockoutUntilRef.current = null;
      // Apply profile from API response
      if (data.user) applyProfile(data.user);
      // Fetch additional data in background
      fetchEarnings();
      fetchHistory();
      return true;
    } catch (e) {
      loginAttemptsRef.current += 1;
      if (loginAttemptsRef.current >= MAX_LOGIN_ATTEMPTS) {
        lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION_MS;
        loginAttemptsRef.current = 0;
        return { locked: true, remainingSeconds: LOCKOUT_DURATION_MS / 1000 };
      }
      return false;
    }
  }

  // ---- REGISTER (async, calls API) ----
  async function register(data) {
    const cleanEmail = sanitizeInput(data.email);
    if (!isValidEmail(cleanEmail)) return false;

    try {
      const payload = {
        email: cleanEmail,
        password: data.password,
        userName: sanitizeInput(`${data.prenom || ''} ${data.nom || ''}`.trim()),
        phone: sanitizeInput(data.phone || ''),
        phoneCode: data.phoneCode || '',
        vehicle_type: 'scooter',
      };
      const result = await authService.register(payload);
      if (result.user && data.role === 'user') {
        applyProfile(result.user);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- LOGOUT (async, calls API) ----
  async function logout() {
    try {
      await authService.logout();
    } catch (e) {
      // Continue with local cleanup even if API fails
    }
    setUser(null);
    setDeliveryHistory([]);
    setWeeklyEarnings([]);
    setVersements([]);
    setCurrentEarningsCents(0);
    setTicketMessages({});
    setTicketReadCounts({});
  }

  // ---- TOGGLE ONLINE (calls API) ----
  async function toggleOnline(online) {
    try {
      await deliveryService.toggleOnline(online);
    } catch (e) {
      // Fallback: update local state only
    }
    setIsOnline(online);
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
        tip: isCancelled ? null : (order.tip || null),
        date: dateStr,
        time: timeStr,
        status: isCancelled ? 'cancelled' : 'completed',
        ...(isCancelled ? { cancelledAt: now.toISOString() } : { completedAt: now.toISOString() }),
      };
      return [entry, ...prev];
    });
    if (order.status !== 'cancelled') {
      setTotalDeliveries(prev => prev + 1);
      const priceStr = order.priceText || order.price || '0';
      const priceParsed = parseFloat(String(priceStr).replace(',', '.').replace(/[^0-9.]/g, ''));
      if (!isNaN(priceParsed) && priceParsed > 0) {
        const cents = Math.round(priceParsed * 100);
        setCurrentEarningsCents(prev => prev + cents);
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

  async function cashOut() {
    if (currentEarningsCents <= 0) return;
    const amountStr = (currentEarningsCents / 100).toFixed(2) + ' €';
    try {
      await earningsService.requestCashout();
    } catch (e) {
      // Fallback: continue with local state update
    }
    const now = new Date();
    const day = now.getDate();
    const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    const dateStr = `Initié : ${day} ${months[now.getMonth()]}`;
    const entry = {
      label: 'Versement exceptionnel',
      date: dateStr,
      amount: amountStr,
      iban: currentIban,
      cashedAt: now.toISOString(),
      detail: { net: amountStr, tips: '0.00 €', courses: '-', status: 'Versé' },
    };
    setVersements(prev => [entry, ...prev]);
    setCurrentEarningsCents(0);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, warnings, accountActive, rating, totalDeliveries, addWarning, cancelOrder, weeklyCancels, MAX_WEEKLY_CANCELS, reactivateAccount, deliveryHistory, addToHistory, markOrderReported, getTicketMessages, saveTicketMessages, currentEarningsCents, cashOut, versements, weeklyEarnings, currentIban, setCurrentIban, isOnline, setIsOnline, toggleOnline, warningsList, markTicketRead, getUnreadTicketCount, scheduleAdminReply, cancelAdminReply, ticketMessages, ticketReadCounts, readOpportunities, markOpportunityRead, getUnreadOpportunitiesCount, fetchEarnings, fetchHistory, checkVerificationStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
