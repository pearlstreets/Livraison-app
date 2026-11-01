// node --experimental-detect-module --test lib/__tests__/itineraire.test.mjs (Node 20 ; option inutile dès Node 22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { enPoints, metres, projeter, recoller, ecartAuTrace } from '../itineraire.js';

// Rue droite vers l'est (environ 730 m), puis virage vers le nord.
const A = { latitude: 48.85, longitude: 2.35 };
const B = { latitude: 48.85, longitude: 2.36 };
const C = { latitude: 48.86, longitude: 2.36 };
const trace = [A, B, C];

test('enPoints : liste du serveur, null si absente ou trop courte', () => {
  assert.deepEqual(enPoints([[1, 2], [3, 4]]), [
    { latitude: 1, longitude: 2 },
    { latitude: 3, longitude: 4 },
  ]);
  assert.equal(enPoints(null), null);
  assert.equal(enPoints([[1, 2]]), null);
});

test('metres et projeter', () => {
  const d = metres(A, B);
  assert.ok(d > 700 && d < 760, `distance ${d}`);
  const milieu = { latitude: 48.8501, longitude: 2.355 };
  const q = projeter(A, B, milieu);
  assert.ok(Math.abs(q.longitude - 2.355) < 1e-9);
  assert.ok(Math.abs(q.latitude - 48.85) < 1e-9);
});

test('le chemin parcouru disparait derriere le livreur, au milieu de la rue', () => {
  const pos = { latitude: 48.85002, longitude: 2.355 };
  const reste = recoller(trace, pos);
  assert.deepEqual(reste[0], pos);
  assert.ok(Math.abs(reste[1].longitude - 2.355) < 1e-9);
  assert.deepEqual(reste.slice(2), [B, C]);
  assert.ok(!reste.some((p) => p.longitude < 2.355 - 1e-9));
});

test('ecart de plus de 60 m : le trait part du point du trace le plus proche', () => {
  const loin = { latitude: 48.8495, longitude: 2.355 };
  assert.ok(ecartAuTrace(trace, loin) > 50);
  const reste = recoller(trace, { latitude: 48.849, longitude: 2.355 });
  assert.ok(Math.abs(reste[0].latitude - 48.85) < 1e-9);
  assert.deepEqual(reste.slice(1), [B, C]);
});

test('au bout du trajet ou sans trace : plus de trait', () => {
  assert.equal(recoller(trace, C), null);
  assert.equal(recoller(null, A), null);
  assert.equal(recoller([A], A), null);
  assert.equal(ecartAuTrace(null, A), Infinity);
});
