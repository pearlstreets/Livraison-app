import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useLanguage } from './LanguageContext';
import { isValidEmail } from '../utils/validation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from '../services/secureStorage';
import { authService } from '../services/authService';
import { setOnSessionPurgee } from '../services/api';
import { deliveryService } from '../services/deliveryService';
import { ouvrirVerification } from '../services/identiteService';
import { earningsService } from '../services/earningsService';
import { ticketService } from '../services/ticketService';
import { enregistrerAppareil } from '../services/pushDirect';
import { estDocumentsRequis, signalerDocumentsRequis } from '../services/documentsSeuil';

import { formatDayMonth, formatTime, formatKm } from '../lib/i18nFormat';

const AuthContext = createContext(null);

const CLE_OPPORTUNITES_LUES = 'pearl_opportunites_lues';
// Notifications déjà ouvertes (le serveur n'a pas d'état « lu »), voir InboxScreen.
export const CLE_NOTIFICATIONS_LUES = 'pearl_notifications_lues';

// Backend list endpoints answer with several shapes ({results}, {data}, raw array).
function extractList(resp) {
  if (Array.isArray(resp)) return resp;
  if (!resp || typeof resp !== 'object') return [];
  if (Array.isArray(resp.results)) return resp.results;
  if (Array.isArray(resp.data)) return resp.data;
  return [];
}

// Dates et heures dans la langue courante de l'app (lib/i18nFormat).
function fmtDate(iso) {
  return formatDayMonth(iso);
}

function fmtTime(iso) {
  return formatTime(iso);
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

// Gains NETS par jour (lun à dim). Le serveur ne donne par jour que le brut
// (daily_breakdown : courses + pourboires + bonus) ; le net de la semaine
// (net_amount) est réparti sur les jours au prorata de ce brut, au centime
// près : la somme des 7 jours vaut exactement le net de la semaine.
function joursNets(brutParJour, netSemaine) {
  const brut = brutParJour.reduce((a, v) => a + v, 0);
  if (!(brut > 0) || !(netSemaine > 0)) return brutParJour.map(() => 0);
  const centimes = Math.round(netSemaine * 100);
  const parts = brutParJour.map((v) => (v * centimes) / brut);
  const nets = parts.map((v) => Math.floor(v));
  // Centimes restants : aux jours qui ont les plus grands restes.
  let reste = centimes - nets.reduce((a, v) => a + v, 0);
  parts.map((v, i) => [v - nets[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => {
    if (reste > 0) { nets[i] += 1; reste -= 1; }
  });
  return nets.map((c) => c / 100);
}

function adaptEarningsWeek(rec) {
  const start = rec.period_start || '';
  const barsGross = Array.isArray(rec.daily_breakdown) && rec.daily_breakdown.length === 7
    ? rec.daily_breakdown.map((v) => Number(v) || 0)
    : [0, 0, 0, 0, 0, 0, 0];
  return {
    start,
    end: rec.period_end || '',
    range: start && rec.period_end ? `${fmtDate(start)} - ${fmtDate(rec.period_end)}` : start,
    // Total versé (net_amount du serveur) : il comprend déjà pourboires et
    // bonus, après commission et cotisations URSSAF.
    total: Number(rec.net_amount ?? 0),
    // Total brut (courses + pourboires + bonus), avant retenues.
    gross: Number(rec.gross_amount ?? 0),
    // Barres par jour (lun à dim) en NET, comme le total (voir joursNets) ;
    // le brut par jour du serveur reste dans barsGross.
    bars: joursNets(barsGross, Number(rec.net_amount ?? 0)),
    barsGross,
    // Part des courses seules : total moins pourboires et bonus, pour que
    // Prix net + Pourboire + Bonus = Total.
    net: Math.max(0, Math.round((Number(rec.net_amount ?? 0) - Number(rec.tips_amount ?? 0) - (Number(rec.bonus_amount ?? 0) || 0)) * 100) / 100),
    tips: Number(rec.tips_amount ?? 0),
    // Bonus de demande versés (déjà compris dans le total).
    bonus: Number(rec.bonus_amount ?? 0) || 0,
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
    restaurant: a.customer_name || a.pickup_address || '-',
    address: a.dropoff_address || '',
    distanceText: a.distance_km != null ? formatKm(a.distance_km) : '',
    priceText: `${Number(a.delivery_fee ?? a.order_price ?? 0).toFixed(2)} €`,
    tip: a.tip_amount ? `${Number(a.tip_amount).toFixed(2)} €` : null,
    // Montants BRUTS en euros, en plus des chaînes déjà formatées ci-dessus :
    // les écrans les passent à fmtPrice() pour afficher la devise du livreur.
    // Les chaînes `priceText`/`tip` restent inchangées (aucun consommateur cassé).
    priceEur: Number(a.delivery_fee ?? a.order_price ?? 0),
    tipEur: a.tip_amount != null ? Number(a.tip_amount) : null,
    // Bonus de demande figé à l'acceptation (versé seulement si livrée).
    bonus: !isCancelled && Number(a.bonus_demande) > 0 ? `${Number(a.bonus_demande).toFixed(2)} €` : null,
    bonusEur: !isCancelled && Number(a.bonus_demande) > 0 ? Number(a.bonus_demande) : 0,
    date: fmtDate(ts),
    time: fmtTime(ts),
    status: isCancelled ? 'cancelled' : 'completed',
    completedAt: isCancelled ? undefined : ts,
    cancelledAt: isCancelled ? ts : undefined,
  };
}

// État d'un virement montré au livreur (`state` du serveur, 04/11/2026) :
// verse, en_cours, echoue, standard (instantané parti en virement standard).
const ETAT_VERSEMENT = { verse: 'paid', en_cours: 'processing', echoue: 'failed', standard: 'standard' };

function adaptPayout(p, iban) {
  const amt = `${Number(p.amount ?? 0).toFixed(2)} €`;
  const statut = ETAT_VERSEMENT[p.state] || p.status || '';
  return {
    id: p.id,
    // « Versement exceptionnel » = virement instantané (icône éclair des écrans).
    label: p.kind === 'instant' ? 'Versement exceptionnel' : 'Versement',
    kind: p.kind || 'weekly',
    date: fmtDate(p.created_at),
    amount: amt,
    // Montants bruts en euros (cf. adaptAssignment) pour l'affichage en devise
    // locale ; le versement bancaire réel reste en euros.
    amountEur: Number(p.amount ?? 0),
    iban: iban || '',
    status: statut,
    paidAt: p.paid_at || null,
    createdAtRaw: p.created_at || null,
    // Détail réel du versement (DriverEarnings) : net, pourboires, nb de courses.
    detail: {
      net: `${Number(p.net_amount ?? p.amount ?? 0).toFixed(2)} €`,
      tips: p.tips_amount != null ? `${Number(p.tips_amount).toFixed(2)} €` : '-',
      netEur: Number(p.net_amount ?? p.amount ?? 0),
      tipsEur: p.tips_amount != null ? Number(p.tips_amount) : null,
      courses: p.total_deliveries != null ? p.total_deliveries : '-',
      status: statut,
      feeEur: Number(p.fee_amount ?? 0),
      feeRefunded: !!p.fee_refunded,
      // Retenues (04/11/2026) : total des courses (brut du serveur, courses +
      // pourboires + bonus, avant retenues), commission Pearl Streets,
      // cotisations URSSAF payées par Pearl Streets pour le livreur.
      grossEur: p.gross_amount != null ? Number(p.gross_amount) : null,
      commissionEur: Number(p.commission ?? 0),
      urssafEur: Number(p.urssaf_amount ?? 0),
      urssafRate: Number(p.urssaf_rate ?? 0),
    },
  };
}

function adaptWarning(w) {
  return {
    id: w.id != null ? `W-${w.id}` : `W-${Date.now()}`,
    reason: w.reason || w.type || '',
    severity: w.severity || '',
    date: fmtDate(w.created_at),
    time: fmtTime(w.created_at),
    createdAt: w.created_at || '',
  };
}

export function AuthProvider({ children }) {
  // Traductions lues par référence : setIsOnline garde la même identité quand
  // la langue change (le suivi de position en dépend).
  const langue = useLanguage();
  const tRef = useRef(null);
  tRef.current = langue && typeof langue.t === 'function' ? langue.t : null;
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState(null);
  const [warnings, setWarnings] = useState(0);
  const [accountActive, setAccountActive] = useState(true);
  const [rating, setRating] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [weeklyCancels, setWeeklyCancels] = useState(0);
  // Plafond d'annulations de la semaine donné par le serveur (null tant qu'il
  // n'est pas connu : l'écran se replie alors sur MAX_WEEKLY_CANCELS).
  const [maxWeeklyCancels, setMaxWeeklyCancels] = useState(null);
  const [isOnline, setIsOnlineState] = useState(false);
  // État en ligne courant, lu par setIsOnline (l'appel au serveur part hors de
  // la mise à jour d'état, qui peut être rejouée par React).
  const isOnlineRef = useRef(false);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  // Vrai pendant qu'une livraison est en cours (écran DeliveryFlow monté).
  // Force le tracking GPS même si le livreur s'est mis hors-ligne, sinon le
  // client perd la position du livreur en pleine course.
  const [activeDelivery, setActiveDelivery] = useState(false);
  const [warningsList, setWarningsList] = useState([]);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [currentEarningsCents, setCurrentEarningsCents] = useState(0);
  // Portefeuille (04/11/2026) : prochain virement du lundi et virement
  // instantané (frais, minimum, nombre restant aujourd'hui), lus sur le serveur.
  const [wallet, setWallet] = useState(null);
  const [currentIban, setCurrentIban] = useState('');
  const [weeklyEarnings, setWeeklyEarnings] = useState([]);
  const [versements, setVersements] = useState([]);
  const [ratingsSummary, setRatingsSummary] = useState(null);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  // Identifiants des opportunités actives renvoyées par le serveur : le badge
  // compte exactement celles de la liste, jamais une valeur par défaut.
  const [opportunityIds, setOpportunityIds] = useState([]);
  const [readOpportunities, setReadOpportunities] = useState([]);
  const lusChargesRef = useRef(false);

  // Opportunités déjà ouvertes : gardées sur le téléphone pour que le badge
  // ne revienne pas à chaque lancement de l'app.
  useEffect(() => {
    AsyncStorage.getItem(CLE_OPPORTUNITES_LUES)
      .then((v) => {
        const lus = v ? JSON.parse(v) : [];
        if (Array.isArray(lus)) setReadOpportunities((prev) => Array.from(new Set([...lus.map(String), ...prev])));
      })
      .catch(() => {})
      .finally(() => { lusChargesRef.current = true; });
  }, []);
  useEffect(() => {
    if (!lusChargesRef.current) return;
    AsyncStorage.setItem(CLE_OPPORTUNITES_LUES, JSON.stringify(readOpportunities)).catch(() => {});
  }, [readOpportunities]);
  const [ticketMessages, setTicketMessages] = useState({});
  const [ticketReadCounts, setTicketReadCounts] = useState({});
  const MAX_WEEKLY_CANCELS = 5;

  const ibanRef = useRef('');

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
    // Push ciblés : ce téléphone est enregistré pour ce livreur (le serveur
    // vise l'id de son profil). Idempotent, ne lève jamais.
    enregistrerAppareil();
  }, []);

  const refreshEarnings = useCallback(async () => {
    try {
      const w = await earningsService.getWeeklyEarnings();
      setWeeklyEarnings(extractList(w).map(adaptEarningsWeek));
    } catch (e) { /* keep last known */ }
    try {
      const b = await earningsService.getCurrentBalance();
      setCurrentEarningsCents(Math.round(Number(b?.available_balance ?? 0) * 100));
      setWallet({
        bankReady: !!b?.bank_ready,
        nextPayoutDate: b?.next_payout?.date || null,
        nextPayoutEur: Number(b?.next_payout?.amount ?? 0),
        instant: b?.instant ? {
          available: !!b.instant.available,
          reason: b.instant.reason || '',
          // Valeurs du serveur seulement : null si absentes (ligne masquée).
          feeEur: b.instant.fee != null ? Number(b.instant.fee) : null,
          minBalanceEur: b.instant.min_balance != null ? Number(b.instant.min_balance) : null,
          maxPerDay: b.instant.max_per_day != null ? Number(b.instant.max_per_day) : null,
          remainingToday: b.instant.remaining_today != null ? Number(b.instant.remaining_today) : null,
          youReceiveEur: Number(b.instant.you_receive ?? 0),
        } : null,
      });
    } catch (e) { /* keep last known */ }
    try {
      const p = await earningsService.getPayoutHistory();
      setVersements(extractList(p).map((x) => adaptPayout(x, ibanRef.current)));
    } catch (e) { /* keep last known */ }
  }, []);

  // Profil relu sur le serveur (ex. après la configuration des virements :
  // IBAN et état du compte à jour).
  const refreshProfile = useCallback(async () => {
    try {
      const prof = await authService.getProfile();
      applyProfile(prof?.data || prof);
    } catch (e) { /* keep last known */ }
  }, [applyProfile]);

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
      if (typeof s.max_weekly_cancels === 'number') setMaxWeeklyCancels(s.max_weekly_cancels);
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
      // Toutes les pages : au-delà de 10 tickets, le compte restait faux.
      const list = await ticketService.getAllTickets();
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
      setOpportunityIds(extractList(r).map((o) => String(o.id)));
    } catch (e) { /* keep last known */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshEarnings(), refreshHistory(), refreshWarnings(), refreshRatings(), refreshTickets(), refreshOpportunities()]);
  }, [refreshEarnings, refreshHistory, refreshWarnings, refreshRatings, refreshTickets, refreshOpportunities]);

  // Restore an existing session on cold start.
  // Sans réseau (sous-sol, zone blanche) la session reste valable : le profil
  // gardé sur le téléphone est affiché et le serveur est relu en arrière-plan,
  // au lieu de renvoyer le livreur à l'écran de connexion.
  const relectureRef = useRef(null);
  useEffect(() => {
    let actif = true;
    const relireProfil = async () => {
      const prof = await authService.getProfile();
      if (!actif) return;
      applyProfile(prof?.data || prof);
      await refreshAll();
    };
    const relireEnArrierePlan = () => {
      relectureRef.current = setTimeout(async () => {
        relectureRef.current = null;
        if (!actif) return;
        try {
          if (!(await secureStorage.getSecure('accessToken'))) return;
          await relireProfil();
        } catch (e) {
          if (actif && e?.isNetworkError) relireEnArrierePlan();
        }
      }, 15000);
    };
    (async () => {
      try {
        await authService.reduireUserDataStocke();
        // « Rester connecté » décoché : la session ne survit pas à la
        // fermeture de l'app, retour à l'écran de connexion.
        if (!(await authService.chargerResterConnecte()) && (await secureStorage.getSecure('accessToken'))) {
          await authService.logout().catch(() => {});
        }
        const token = await secureStorage.getSecure('accessToken');
        if (token) await relireProfil();
      } catch (e) {
        if (e?.isNetworkError && (await secureStorage.getSecure('accessToken').catch(() => null))) {
          const garde = await authService.getStoredUser().catch(() => null);
          if (garde && actif) {
            setUser((u) => u || adaptProfile(garde));
            if (garde.account_active === false) setAccountActive(false);
            relireEnArrierePlan();
          }
        }
        // Sinon : pas de session valable, l'écran de connexion s'affiche.
      } finally {
        if (actif) setBootstrapping(false);
      }
    })();
    return () => {
      actif = false;
      if (relectureRef.current) clearTimeout(relectureRef.current);
    };
  }, [applyProfile, refreshAll]);

  const login = useCallback(async (email, password) => {
    if (!isValidEmail(String(email || '').trim())) return { ok: false, error: 'invalid_email' };
    try {
      const res = await authService.login(String(email).trim(), password);
      applyProfile(res?.user);
      await refreshAll();
      return { ok: true };
    } catch (e) {
      // Compte pas encore validé (403 « pending validation ») : l'écran
      // d'attente, jamais « mot de passe incorrect ».
      if (e?.status === 403 && /pending validation/i.test(e?.serverMessage || '')) {
        return { ok: false, pending: true, error: 'pending_validation' };
      }
      // Statut et coupure réseau remontés à l'écran : seul un refus des
      // identifiants compte comme une tentative ratée.
      return { ok: false, error: e?.message || 'login_failed', status: e?.status, network: !!e?.isNetworkError, serverMessage: e?.serverMessage || null };
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
        // Véhicule choisi à l'inscription (défaut vélo si absent).
        vehicle_type: data.vehicle_type || data.vehicle || 'bicycle',
        country: data.country || 'FR',
        legal_status: data.legal_status || (isPro ? 'societe' : 'particulier'),
      };
      if (data.companyName) payload.legal_name = data.companyName;
      // Inscription en une page (26/10/2026) : adresse, déclaration des
      // revenus et compte de virement Stripe.
      [
        'legal_address', 'birth_date', 'tax_id', 'postal_code', 'city', 'delivery_zone', 'siret',
        'vat_number', 'iban', 'iban_holder_name', 'account_token',
      ].forEach((k) => { if (data[k]) payload[k] = data[k]; });
      if (data.documents) {
        const d = data.documents;
        [
          'id_card_front_url', 'id_card_back_url', 'iban_doc_url', 'kbis_doc_url',
          'rc_pro_url', 'urssaf_doc_url', 'proof_of_address_url', 'profile_photo_url',
          // Permis de conduire : exigé par le serveur pour une voiture.
          'driver_license_url',
        ].forEach((k) => { if (d[k]) payload[k] = d[k]; });
      }
      await authService.register(payload);
      // Every new driver starts pending admin validation of their
      // documents — no auto-login; the app shows the pending screen.
      return { ok: true, pending: true };
    } catch (e) {
      // Refus du serveur (400 champ manquant, 422 Stripe...) : son message,
      // pour corriger sur la page. Sinon un texte traduit, jamais l'anglais
      // générique de l'intercepteur.
      const tr = tRef.current;
      if (e?.status >= 400 && e?.status < 500 && e?.serverMessage) return { ok: false, error: e.serverMessage };
      if (e?.isNetworkError && tr) return { ok: false, error: tr('errorNetwork') };
      if (e?.status === 429 && tr) return { ok: false, error: tr('errorTooManyRequests') };
      return { ok: false, error: tr ? tr('genericError') : 'register_failed' };
    }
  }, [applyProfile, refreshAll]);

  // Remet à zéro tout l'état du compte (déconnexion, suppression) : aucun
  // chiffre du compte précédent ne reste affiché au compte suivant.
  const viderEtatCompte = useCallback(() => {
    setUser(null);
    setWeeklyEarnings([]);
    setVersements([]);
    setDeliveryHistory([]);
    setWarningsList([]);
    setCurrentEarningsCents(0);
    setWallet(null);
    setWarnings(0);
    setAccountActive(true);
    setRating(0);
    setTotalDeliveries(0);
    setWeeklyCancels(0);
    setMaxWeeklyCancels(null);
    setRatingsSummary(null);
    setOpenTicketCount(0);
    setOpportunityIds([]);
    setReadOpportunities([]);
    AsyncStorage.removeItem(CLE_OPPORTUNITES_LUES).catch(() => {});
    AsyncStorage.removeItem(CLE_NOTIFICATIONS_LUES).catch(() => {});
    setTicketMessages({});
    setTicketReadCounts({});
    setCurrentIban('');
    ibanRef.current = '';
    setActiveDelivery(false);
    setIsOnlineState(false);
  }, []);

  const logout = useCallback(async () => {
    try { await authService.logout(); } catch (e) { /* clear locally regardless */ }
    viderEtatCompte();
  }, [viderEtatCompte]);

  // Fin de session (30 min) : passe par ce logout pour que l'écran revienne
  // à la connexion, pas seulement par celui du service.
  useEffect(() => {
    authService.setOnSessionTimeout(() => { logout(); });
    return () => authService.setOnSessionTimeout(null);
  }, [logout]);

  // Session refusée par le serveur (jetons vidés par l'intercepteur) : retour
  // à l'écran de connexion, suivi de position arrêté. Si une nouvelle
  // connexion a déjà reposé un jeton entre-temps, rien n'est touché.
  const reconnexionRef = useRef(false);
  useEffect(() => {
    setOnSessionPurgee(() => {
      if (reconnexionRef.current) return;
      secureStorage.getSecure('accessToken')
        .then((jeton) => { if (!jeton) logout(); })
        .catch(() => { logout(); });
    });
    return () => setOnSessionPurgee(null);
  }, [logout]);

  // Mot de passe changé depuis le profil : le serveur refuse désormais les
  // jetons d'avant. Nouvelle connexion aussitôt avec le nouveau mot de passe,
  // pour que le livreur reste connecté. Renvoie false si elle échoue.
  const reconnecterApresMotDePasse = useCallback(async (nouveauMotDePasse) => {
    const adresse = String(user?.email || '').trim();
    if (!adresse) return false;
    // Un appel parti avec l'ancien jeton peut échouer pendant ce temps : sa
    // purge ne doit pas déconnecter le livreur qu'on reconnecte.
    reconnexionRef.current = true;
    try {
      const res = await authService.login(adresse, nouveauMotDePasse);
      applyProfile(res?.user);
      return true;
    } catch (e) {
      return false;
    } finally {
      reconnexionRef.current = false;
    }
  }, [user, applyProfile]);

  // Suppression de compte (Apple 5.1.1(v)). Relaie l'erreur si l'appel serveur
  // échoue (l'appelant garde l'utilisateur connecté + affiche l'erreur) ; en cas
  // de succès, purge la session comme un logout → retour à l'écran de connexion.
  const deleteAccount = useCallback(async () => {
    await authService.deleteAccount();
    viderEtatCompte();
  }, [viderEtatCompte]);

  // Attend la réponse du serveur : le changement n'est appliqué en local qu'en
  // cas de succès. En cas de refus (409 pendant une course, 403 compte en
  // attente de validation...), l'erreur remonte à l'écran appelant, qui affiche
  // le message du serveur (error.serverMessage) ; rien ne change en local.
  const updateUser = useCallback(async (updates) => {
    if (!updates) return;
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
    const res = Object.keys(allowed).length ? await authService.updateProfile(allowed) : null;
    // Changement accepté mais à revérifier (IBAN ou pièce remplacés) : le
    // serveur a remis le compte en attente et hors ligne ; on reprend son profil.
    if (res?.revalidation_requise && res.data) {
      applyProfile(res.data);
      return res;
    }
    // `vehicle` est le champ lu par les écrans (voir adaptProfile).
    setUser((prev) => (prev ? { ...prev, ...updates, ...(vt ? { vehicle: vt } : {}) } : prev));
    return res;
  }, [applyProfile]);

  // Remplace un document du dossier livreur par un fichier deja envoye sur S3.
  // Attend la reponse du serveur : l'ecran n'annonce le succes que s'il est reel.
  const updateDocument = useCallback(async (field, url) => {
    const res = await authService.updateProfile({ [field]: url });
    if (res?.revalidation_requise && res.data) {
      applyProfile(res.data);
      return res;
    }
    setUser((prev) => (prev ? { ...prev, [field]: url } : prev));
    return res;
  }, [applyProfile]);

  const setIsOnline = useCallback((value) => {
    const next = typeof value === 'function' ? value(isOnlineRef.current) : value;
    isOnlineRef.current = next;
    setIsOnlineState(next);
    // Passage en ligne par toggle-online : le serveur peut demander d'abord
    // un selfie vidéo (verification_requise) ou refuser un compte bloqué (423).
    const appel = next === true
      ? deliveryService.toggleOnline(true)
      : authService.updateProfile({ is_online: next });
    appel
      .then((res) => {
        if (next !== true) return;
        if (res?.status === 'verification_requise') {
          setIsOnlineState(false);
          ouvrirVerification(res.identite || { bloque: false, blocage: null, verification: res.verification || null });
          return;
        }
        // Passage en ligne refusé par le serveur (réponse is_online false) :
        // l'app ne reste pas « en ligne » sans recevoir de courses.
        if (res?.is_online === false || res?.data?.is_online === false) setIsOnlineState(false);
      })
      .catch((e) => {
        if (next === true && e?.status === 423) {
          setIsOnlineState(false);
          ouvrirVerification(e.identite || null);
          return;
        }
        // Seul un refus explicite du serveur (4xx hors session expirée) remet
        // hors ligne, avec son message. Réseau coupé : on reste en ligne, la
        // position continue de partir. Le passage hors ligne n'est jamais annulé.
        const statut = e?.status;
        if (next !== true || !statut || statut < 400 || statut >= 500 || statut === 401 || statut === 429) return;
        setIsOnlineState(false);
        const t = tRef.current;
        // Documents demandés par le serveur (seuil de gains) : hors ligne,
        // sans erreur générique, avec l'accès à l'écran des documents.
        if (t && estDocumentsRequis(e)) {
          signalerDocumentsRequis(e, t);
          return;
        }
        Alert.alert(t ? t('error') : '', e.serverMessage || (t ? t('genericError') : ''));
      });
  }, []);

  // Virement instantané : renvoie le vrai résultat du serveur, jamais d'exception.
  // { ok, code, amountEur } ; code : instantane, standard, en_attente, ou le
  // motif du refus (limite_jour, minimum, banque_non_eligible...).
  const cashOut = useCallback(async () => {
    let res;
    try {
      const r = await earningsService.requestCashout();
      res = { ok: true, code: r?.code || 'instantane', amountEur: Number(r?.data?.amount ?? 0) };
    } catch (e) {
      // Limite et minimum réels du refus (429 limite_jour, minimum), si fournis.
      const d = e?.serverData || {};
      res = {
        ok: false,
        code: e?.code || (e?.isNetworkError ? 'reseau' : 'erreur'),
        max: d.max_per_day != null ? Number(d.max_per_day) : null,
        // Plafond d'un virement instantané (refus « maximum »).
        maxAmount: d.max_amount != null ? Number(d.max_amount) : null,
        min: d.min_balance != null ? Number(d.min_balance) : null,
      };
    }
    await refreshEarnings();
    return res;
  }, [refreshEarnings]);

  // A delivery is recorded server-side on completion; just pull fresh data.
  const addToHistory = useCallback(async () => {
    await refreshHistory();
    await refreshEarnings();
  }, [refreshHistory, refreshEarnings]);

  // --- account standing (warnings) -------------------------------------
  // Les avertissements viennent seulement du serveur (refreshWarnings) : aucun
  // avertissement n'est créé sur le téléphone.

  // Repli hors connexion seulement : compte l'annulation en local, sans
  // avertissement (le serveur tranchera au prochain rafraîchissement).
  function cancelOrder() {
    const plafond = maxWeeklyCancels ?? MAX_WEEKLY_CANCELS;
    const newCount = weeklyCancels + 1;
    setWeeklyCancels(newCount);
    return { warning: false, remaining: Math.max(0, plafond - newCount) };
  }

  // Résultat réel du serveur après une annulation acceptée.
  function applyCancelResult(resp) {
    if (!resp || typeof resp !== 'object') return;
    if (typeof resp.weekly_cancels === 'number') setWeeklyCancels(resp.weekly_cancels);
    if (typeof resp.max_weekly_cancels === 'number') setMaxWeeklyCancels(resp.max_weekly_cancels);
    if (typeof resp.warnings_count === 'number') setWarnings(resp.warnings_count);
    if (typeof resp.account_active === 'boolean') setAccountActive(resp.account_active);
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

  function getUnreadTicketCount() {
    // Nombre de tickets support non résolus (réel, rafraîchi via refreshTickets).
    return openTicketCount;
  }

  // --- opportunities (backend-driven : GET /opportunities/) ------------
  function markOpportunityRead(id) {
    setReadOpportunities((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function getUnreadOpportunitiesCount() {
    // Opportunités actives (serveur) pas encore ouvertes : 0 si la liste est vide.
    return opportunityIds.filter((id) => !readOpportunities.includes(id)).length;
  }

  return (
    <AuthContext.Provider value={{
      bootstrapping, user, login, register, logout, deleteAccount, updateUser, updateDocument, reconnecterApresMotDePasse,
      warnings, accountActive, rating, totalDeliveries,
      cancelOrder, applyCancelResult, weeklyCancels, maxWeeklyCancels, MAX_WEEKLY_CANCELS, reactivateAccount,
      deliveryHistory, addToHistory, markOrderReported, refreshAll,
      refreshEarnings, refreshTickets, refreshOpportunities, refreshProfile,
      getTicketMessages, saveTicketMessages, markTicketRead, getUnreadTicketCount,
      ticketMessages, ticketReadCounts,
      currentEarningsCents, wallet, cashOut, versements, weeklyEarnings, currentIban, setCurrentIban,
      isOnline, setIsOnline, setIsOnlineState, activeDelivery, setActiveDelivery, warningsList, ratingsSummary, refreshRatings,
      readOpportunities, markOpportunityRead, getUnreadOpportunitiesCount, setOpportunityIds,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
