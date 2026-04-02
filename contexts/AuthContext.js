import React, { createContext, useContext, useState, useRef } from 'react';

const USERS = [
  { email: 'remsko@live.fr', password: 'Test@123', firstName: 'Ganja', lastName: 'Remsko', pseudo: 'Remsko', phone: '06 12 34 56 78', vehicle: 'Scooter' },
];

const AuthContext = createContext(null);


const INITIAL_WEEKS = [
  { start: '2026-03-24', range: '24 mars - 29 mars', total: 312.50, bars: [45, 62, 38, 70, 55, 42, 0] },
  { start: '2026-03-17', range: '17 mars - 23 mars', total: 447.40, bars: [30, 55, 48, 72, 65, 80, 47] },
  { start: '2026-03-10', range: '10 mars - 16 mars', total: 518.20, bars: [10, 40, 65, 85, 50, 70, 58] },
  { start: '2026-03-03', range: '3 mars - 9 mars', total: 369.37, bars: [60, 20, 50, 30, 75, 45, 49] },
  { start: '2026-02-24', range: '24 fév. - 2 mars', total: 272.07, bars: [15, 45, 10, 60, 35, 55, 52] },
  { start: '2026-02-17', range: '17 fév. - 23 fév.', total: 427.92, bars: [40, 20, 55, 70, 45, 80, 17] },
  { start: '2026-02-10', range: '10 fév. - 16 fév.', total: 343.81, bars: [25, 35, 60, 15, 50, 72, 43] },
];

const INITIAL_HISTORY = [
  { id: 'ORD-2998', restaurant: 'Pizzeria Roma, Meaux', address: '12 Rue Voltaire, Meaux', distanceText: '2.3 km', priceText: '8.50 €', tip: '1.50 €', date: '29 mars', time: '19h32', status: 'completed', completedAt: '2026-03-29T19:32:00' },
  { id: 'ORD-2996', restaurant: 'Café du Pont, Meaux', address: '2 Rue de la République, Meaux', distanceText: '1.4 km', priceText: '0,00 €', tip: null, date: '29 mars', time: '18h50', status: 'cancelled', cancelledAt: '2026-03-29T18:50:00' },
  { id: 'ORD-2995', restaurant: 'Le Bistrot, Meaux', address: 'Place Carnot, Meaux', distanceText: '1.8 km', priceText: '6.20 €', tip: null, date: '29 mars', time: '18h15', status: 'completed', completedAt: '2026-03-29T18:15:00' },
  { id: 'ORD-2991', restaurant: 'Sushi Zen, Meaux', address: '3 Bd Barbès, Meaux', distanceText: '3.1 km', priceText: '11.40 €', tip: '2.00 €', date: '29 mars', time: '14h48', status: 'completed', completedAt: '2026-03-29T14:48:00' },
  { id: 'ORD-2987', restaurant: 'Chez Marcel, Meaux', address: '18 Rue de Verdun, Meaux', distanceText: '0.9 km', priceText: '7.80 €', tip: null, date: '28 mars', time: '20h10', status: 'completed', completedAt: '2026-03-28T20:10:00' },
  { id: 'ORD-2984', restaurant: 'La Terrasse, Meaux', address: '6 Rue Trivalle, Meaux', distanceText: '2.7 km', priceText: '9.90 €', tip: '1.00 €', date: '28 mars', time: '19h22', status: 'completed', completedAt: '2026-03-28T19:22:00' },
  { id: 'ORD-2980', restaurant: 'Café du Pont, Meaux', address: '2 Rue de la République, Meaux', distanceText: '1.5 km', priceText: '6.50 €', tip: null, date: '28 mars', time: '13h05', status: 'completed', completedAt: '2026-03-28T13:05:00' },
  { id: 'ORD-2976', restaurant: 'Pizzeria Roma, Meaux', address: 'Place Carnot, Meaux', distanceText: '2.0 km', priceText: '8.10 €', tip: '3.00 €', date: '27 mars', time: '20h45', status: 'completed', completedAt: '2026-03-27T20:45:00' },
  { id: 'ORD-2971', restaurant: 'Le Bistrot, Meaux', address: '12 Rue Voltaire, Meaux', distanceText: '1.2 km', priceText: '7.30 €', tip: null, date: '27 mars', time: '12h30', status: 'completed', completedAt: '2026-03-27T12:30:00' },
  { id: 'ORD-2968', restaurant: 'Sushi Zen, Meaux', address: '18 Rue de Verdun, Meaux', distanceText: '3.5 km', priceText: '12.60 €', tip: '2.50 €', date: '26 mars', time: '19h55', status: 'completed', completedAt: '2026-03-26T19:55:00' },
  { id: 'ORD-2963', restaurant: 'La Terrasse, Meaux', address: '3 Bd Barbès, Meaux', distanceText: '2.1 km', priceText: '9.20 €', tip: null, date: '26 mars', time: '13h18', status: 'completed', completedAt: '2026-03-26T13:18:00' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState({ email: 'remsko@live.fr', firstName: 'Ganja', lastName: 'Remsko', pseudo: 'Remsko', phone: '06 12 34 56 78', vehicle: 'Scooter', photo: null });
  const [warnings, setWarnings] = useState(0);
  const [accountActive, setAccountActive] = useState(true);
  const [rating, setRating] = useState(4.8);
  const [totalDeliveries, setTotalDeliveries] = useState(127);
  const [weeklyCancels, setWeeklyCancels] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [warningsList, setWarningsList] = useState([]);
  const [deliveryHistory, setDeliveryHistory] = useState(INITIAL_HISTORY);
  const [currentEarningsCents, setCurrentEarningsCents] = useState(0);
  const [currentIban, setCurrentIban] = useState('FR76 •••• •••• •••• •••• •••• 15');
  const [weeklyEarnings, setWeeklyEarnings] = useState(INITIAL_WEEKS);
  const [versements, setVersements] = useState([
    { label: 'Paiements hebdomadaires', date: 'Initié : 24 mars', amount: '312.50 €', iban: 'FR76 •••• •••• •••• •••• •••• 15', detail: { net: '305.20 €', tips: '7.30 €', courses: 64, status: 'Versé' } },
    { label: 'Paiements hebdomadaires', date: 'Initié : 17 mars', amount: '447.40 €', iban: 'FR76 •••• •••• •••• •••• •••• 15', detail: { net: '440.29 €', tips: '7.11 €', courses: 82, status: 'Versé' } },
    { label: 'Paiements hebdomadaires', date: 'Initié : 10 mars', amount: '518.20 €', iban: 'FR76 •••• •••• •••• •••• •••• 15', detail: { net: '512.80 €', tips: '5.40 €', courses: 95, status: 'Versé' } },
    { label: 'Paiements hebdomadaires', date: 'Initié : 3 mars', amount: '369.37 €', iban: 'FR76 •••• •••• •••• •••• •••• 15', detail: { net: '362.17 €', tips: '7.20 €', courses: 71, status: 'Versé' } },
  ]);
  const [readOpportunities, setReadOpportunities] = useState([]);
  const [ticketMessages, setTicketMessages] = useState({});
  const [ticketReadCounts, setTicketReadCounts] = useState({}); // { ticketId: lastReadCount }
  const MAX_WEEKLY_CANCELS = 5;

  function login(email, password) {
    const found = USERS.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!found) return false;
    const { password: _, ...profile } = found;
    setUser({ ...profile, photo: null });
    return true;
  }

  function register(data) {
    // Check if email already exists
    if (USERS.find(u => u.email.toLowerCase() === data.email.toLowerCase())) return false;
    const newUser = {
      email: data.email, password: data.password, firstName: data.prenom, lastName: data.nom,
      pseudo: data.pseudo, phone: data.phone, vehicle: 'Scooter',
      role: data.role || 'user', isVerified: data.role === 'user' ? true : false,
      companyName: data.companyName || '', country: data.country || 'FR',
    };
    USERS.push(newUser);
    if (data.role === 'user') {
      const { password: _, ...profile } = newUser;
      setUser({ ...profile, photo: null });
    }
    return true;
  }

  function logout() { setUser(null); }

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

  function cashOut() {
    if (currentEarningsCents <= 0) return;
    const amountStr = (currentEarningsCents / 100).toFixed(2) + ' €';
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
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, warnings, accountActive, rating, totalDeliveries, addWarning, cancelOrder, weeklyCancels, MAX_WEEKLY_CANCELS, reactivateAccount, deliveryHistory, addToHistory, markOrderReported, getTicketMessages, saveTicketMessages, currentEarningsCents, cashOut, versements, weeklyEarnings, currentIban, setCurrentIban, isOnline, setIsOnline, warningsList, markTicketRead, getUnreadTicketCount, scheduleAdminReply, cancelAdminReply, ticketMessages, ticketReadCounts, readOpportunities, markOpportunityRead, getUnreadOpportunitiesCount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
