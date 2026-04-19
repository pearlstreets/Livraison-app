import * as Notifications from 'expo-notifications';

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
async function listHistory(){ return history.slice().reverse(); }

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

async function getEarnings(){ return { earningsCents, earnings: currency(earningsCents) }; }

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
