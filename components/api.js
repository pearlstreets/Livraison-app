import * as Notifications from 'expo-notifications';
import { earningsService } from '../services/earningsService';
import { deliveryService } from '../services/deliveryService';

const BRAND = '#00C29B';
let orders = [
  { id: 'ORD-1001', category: 'Food & Drink', pickup: { label: 'Pizzeria Roma, Carcassonne', lat: 43.2147, lng: 2.3508 }, dropoff: { label: '12 Rue Voltaire, Carcassonne', lat: 43.214, lng: 2.3532 }, items: ['2 Margherita','1 Coca 33cl'], amountCents: 2380, distanceKm: 2.1, etaMin: 15, status: 'available', customer: { name: 'Marc', phone: '+33600000001' } }
];
let history = [];
let earningsCents = 0;
let timeouts = {};

const currency = v => (v/100).toFixed(2) + ' €';

async function notify(title, body) {
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
}

async function listAvailableOrders(){ return orders.filter(o=>o.status==='available'); }
async function listActiveOrders(){ return orders.filter(o=>['accepted','picking','delivering'].includes(o.status)); }
async function getActiveOrder(){ return orders.find(o=>['accepted','picking','delivering'].includes(o.status))||null; }

// Try the real backend history endpoint first; fall back to the in-memory
// mock so the screen still works offline or while the backend isn't live.
async function listHistory(){
  try {
    const data = await deliveryService.getDeliveryHistory();
    const list = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : null);
    if (list) {
      return list.map((raw) => ({
        id: String(raw.id || raw.code || raw.assignment_id || ''),
        pickup: { label: raw.pickup_label || raw.pickup?.label || raw.restaurant || '' },
        dropoff: { label: raw.dropoff_label || raw.dropoff?.label || raw.address || '' },
        amountCents: Number(raw.amount_cents ?? raw.amountCents ?? 0),
        tipCents: Number(raw.tip_cents ?? raw.tipCents ?? 0),
        paidCents: Number(raw.paid_cents ?? raw.paidCents ?? (raw.amount_cents ?? 0)),
        surgeBoost: Number(raw.surge_boost ?? raw.surgeBoost ?? 1),
        finishedAt: raw.finished_at || raw.finishedAt || Date.now(),
        proofPhotoUri: raw.proof_photo_uri || raw.proofPhotoUri || null,
      }));
    }
  } catch { /* fall through to local */ }
  return history.slice().reverse();
}

async function acceptOrder(id){
  const o=orders.find(x=>x.id===id&&x.status==='available');
  if(o){ o.status='accepted'; clearTimeout(timeouts[id]); }
  return o;
}

async function declineOrder(id){
  const i=orders.findIndex(x=>x.id===id&&x.status==='available');
  if(i>=0) orders.splice(i,1);
  clearTimeout(timeouts[id]);
  return true;
}

async function updateStatus(id,next){
  const o=orders.find(x=>x.id===id);
  if(o) o.status=next;
  return o;
}

async function completeOrder(id,photo,sign){
  const i=orders.findIndex(x=>x.id===id);
  if(i===-1) return null;
  const done={...orders[i],status:'delivered',proofPhotoUri:photo,signatureDataUrl:sign,finishedAt:Date.now()};
  history.push(done);
  earningsCents+=done.amountCents;
  orders.splice(i,1);
  return done;
}

async function getEarnings(){
  // Prefer the authoritative balance from the backend; local running total is
  // a fallback for demo / offline. Normalises whichever of {balance_cents,
  // balanceCents, amount_cents, cents} the backend exposes.
  try {
    const data = await earningsService.getCurrentBalance();
    const cents = Number(
      data?.balance_cents ??
      data?.balanceCents ??
      data?.amount_cents ??
      data?.amountCents ??
      data?.cents ??
      data?.balance ??
      NaN
    );
    if (Number.isFinite(cents)) {
      return { earningsCents: cents, earnings: currency(cents) };
    }
  } catch { /* fall through to local */ }
  return { earningsCents, earnings: currency(earningsCents) };
}

async function seedNewOrder(fakeId){
  const newOrder = { id: fakeId, category:'Food & Drink', pickup:{ label:'Le Bistrot, Carcassonne', lat:43.2125, lng:2.3515 }, dropoff:{ label:'Place Carnot, Carcassonne', lat:43.2149, lng:2.3519 }, items:['Burger Maison','Frites'], amountCents:1590, distanceKm:1.4, etaMin:12, status:'available', customer:{ name:'Thomas', phone:'+33600000003' }};
  orders.push(newOrder);
  notify("Nouvelle course disponible", `Commande ${newOrder.id}`);
  autoDeclineAfter(newOrder.id, 20000);
  return true;
}

function autoDeclineAfter(id, ms=20000) {
  if (timeouts[id]) clearTimeout(timeouts[id]);
  timeouts[id] = setTimeout(() => declineOrder(id), ms);
}

export default { BRAND, listAvailableOrders, listActiveOrders, getActiveOrder, listHistory, acceptOrder, declineOrder, updateStatus, completeOrder, getEarnings, seedNewOrder, notify };
