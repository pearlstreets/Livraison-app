/**
 * WebSocket events handler — pearl-delivery.
 *
 * Le backend Channels pousse des événements live via /ws/delivery/driver/.
 * Sans ce parser, le driver dépend du polling /available/ (5-10s lag) au
 * lieu du push instant (<500ms cible Uber Eats).
 *
 * Événements supportés :
 *   - 'new_order'         → nouvelle course pour ce driver (filtrée backend par geo)
 *   - 'order_cancelled'   → course retirée (autre driver l'a prise OU client annule)
 *   - 'tip_received'      → notification tip live pendant la course
 *   - 'status_change'     → changement status assignment (push vers UI)
 *   - 'broadcast'         → message global admin (maintenance, promo, etc.)
 *
 * Usage dans MapScreen.js :
 *   import { createDeliveryEventHandler } from '../services/wsDeliveryEvents';
 *   const handler = createDeliveryEventHandler({
 *     onNewOrder: (order) => navigation.navigate('Orders', { newOrder: order }),
 *     onCancelled: (orderId) => removeFromList(orderId),
 *     onTipReceived: (data) => showTipToast(data),
 *   });
 *   ws.onmessage = handler;
 */

const noop = () => {};

/**
 * Parse un message WebSocket en événement métier.
 * Retourne null si non parsable (ignore silencieusement).
 */
export function parseDeliveryEvent(rawMessage) {
  if (!rawMessage) return null;
  try {
    const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
    if (!data || typeof data !== 'object') return null;
    return {
      type: data.type || data.event || 'unknown',
      payload: data.payload || data.data || data,
      timestamp: data.timestamp || data.ts || Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Créé un handler `onmessage` complet pour WebSocket.
 * Tous les callbacks sont optionnels.
 *
 * Callbacks disponibles :
 *   onNewOrder(orderData)         — nouvelle course dispo
 *   onCancelled(orderId, reason)  — course retirée
 *   onTipReceived({order_id, amount, currency, sender_name})
 *   onStatusChange({assignment_id, status, ...})
 *   onBroadcast({title, body, level})
 *   onUnknown(event)              — pour debug
 *   onError(err, raw)             — parse error
 */
export function createDeliveryEventHandler(callbacks = {}) {
  const {
    onNewOrder = noop,
    onCancelled = noop,
    onTipReceived = noop,
    onStatusChange = noop,
    onBroadcast = noop,
    onUnknown = noop,
    onError = noop,
  } = callbacks;

  return function handleMessage(event) {
    const raw = event?.data ?? event;
    const parsed = parseDeliveryEvent(raw);
    if (!parsed) {
      try { onError(new Error('parse_failed'), raw); } catch {}
      return;
    }

    try {
      switch (parsed.type) {
        case 'new_order':
        case 'NEW_ORDER':
          onNewOrder(parsed.payload);
          break;
        case 'order_cancelled':
        case 'ORDER_CANCELLED':
          onCancelled(
            parsed.payload?.order_id || parsed.payload?.id,
            parsed.payload?.reason || '',
          );
          break;
        case 'tip_received':
        case 'TIP':
          onTipReceived(parsed.payload);
          break;
        case 'status_change':
        case 'assignment_status':
          onStatusChange(parsed.payload);
          break;
        case 'broadcast':
        case 'admin_message':
          onBroadcast(parsed.payload);
          break;
        default:
          onUnknown(parsed);
      }
    } catch (err) {
      try { onError(err, raw); } catch {}
    }
  };
}

/**
 * Helper pour envoyer un message au backend via WS.
 * Vérifie que la socket est OPEN avant d'envoyer (silencieux sinon).
 */
export function sendDeliveryEvent(ws, type, payload = {}) {
  if (!ws || ws.readyState !== 1 /* OPEN */) return false;
  try {
    ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    return true;
  } catch {
    return false;
  }
}
