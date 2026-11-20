// node --experimental-detect-module --test lib/__tests__/carplay.test.mjs (Node 20 ; option inutile dès Node 22)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  etapeDeCourse, telephoneClient, actionsEtape, messageCourt, destinationEtape,
  liensItineraire, feuilleItineraire, alerteOffre, ecranCarPlay,
} from '../carplay.js';

// Traduction factice : rend la clé et ses variables, pour vérifier le choix des textes.
const t = (cle, vars) => (vars ? `${cle}(${Object.values(vars).join('|')})` : cle);
const prix = (n) => `${Number(n).toFixed(2)} €`;
const ids = (ecran) => ecran.actions.map((a) => a.id);

const course = {
  id: 12, _assignmentId: 'a12', status: 'accepted',
  restaurant: 'Boulangerie Lune', pickupAddress: '3 rue A, Paris',
  dropoffAddress: '8 rue B, Paris', customer_name: 'Léa', customerPhone: '06 12 34 56 78',
  pickupLat: 48.85, pickupLng: 2.35, dropoffLat: '48.86', dropoffLng: '2.36', priceEur: 6.5,
};

test('etapeDeCourse : étape gardée, jamais en arrière du serveur', () => {
  assert.equal(etapeDeCourse(null, 'accepted'), 0);
  assert.equal(etapeDeCourse(null, 'picked_up'), 1);
  assert.equal(etapeDeCourse(null, 'in_transit'), 1);
  assert.equal(etapeDeCourse(null, 'arrived'), 2);
  assert.equal(etapeDeCourse({ step: 3 }, 'arrived'), 3);
  assert.equal(etapeDeCourse({ step: 0 }, 'arrived'), 2);
  assert.equal(etapeDeCourse(undefined, 'inconnu'), 0);
});

test('telephoneClient : numéro nettoyé, adresse de secours, vide sinon', () => {
  assert.equal(telephoneClient(course), '0612345678');
  assert.equal(telephoneClient({ user_address: { phone_number: '+33 6 00' } }), '+33600');
  assert.equal(telephoneClient({}), '');
  assert.equal(telephoneClient(null), '');
});

test('actionsEtape : actions selon l étape', () => {
  assert.deepEqual(actionsEtape(0, {}), ['itineraire', 'telephone']);
  assert.deepEqual(actionsEtape(0, { preuveRetrait: true }), ['itineraire', 'recuperee']);
  assert.deepEqual(actionsEtape(1, { telephone: '06' }), ['itineraire', 'arrive', 'appeler']);
  assert.deepEqual(actionsEtape(1, {}), ['itineraire', 'arrive']);
  assert.deepEqual(actionsEtape(2, { telephone: '06' }), ['telephone', 'appeler']);
  assert.deepEqual(actionsEtape(3, {}), ['telephone']);
  assert.deepEqual(actionsEtape(4, { telephone: '06' }), []);
  for (let e = 0; e < 5; e += 1) assert.ok(actionsEtape(e, { preuveRetrait: true, telephone: '1' }).length <= 3);
});

test('messageCourt : message court gardé, long ou vide refusé', () => {
  assert.equal(messageCourt('  Documents   manquants '), 'Documents manquants');
  assert.equal(messageCourt('x'.repeat(81)), '');
  assert.equal(messageCourt(null), '');
});

test('destinationEtape et liensItineraire : commerce puis client', () => {
  assert.deepEqual(destinationEtape(course, 0), { coords: '48.85,2.35', adresse: '3 rue A, Paris' });
  assert.deepEqual(destinationEtape(course, 1), { coords: '48.86,2.36', adresse: '8 rue B, Paris' });
  const sansCoords = destinationEtape({ dropoffAddress: '8 rue B' }, 2);
  assert.deepEqual(sansCoords, { coords: null, adresse: '8 rue B' });
  assert.equal(destinationEtape({}, 1), null);
  const l = liensItineraire(destinationEtape(course, 1));
  assert.equal(l.plans, 'maps://?daddr=48.86,2.36&dirflg=d');
  assert.equal(l.google, 'comgooglemaps://?daddr=48.86,2.36&directionsmode=driving');
  assert.equal(l.waze, 'waze://?ll=48.86,2.36&navigate=yes');
  assert.equal(liensItineraire(sansCoords).plans, 'maps://?daddr=8%20rue%20B&dirflg=d');
  assert.equal(liensItineraire(null), null);
});

test('feuilleItineraire : trois apps et Annuler', () => {
  const f = feuilleItineraire(t);
  assert.equal(f.type, 'feuille');
  assert.deepEqual(f.actions.map((a) => a.id), ['gps:plans', 'gps:google', 'gps:waze', 'fermer']);
});

test('alerteOffre : gain, distance, retrait, livraison, Accepter et Refuser', () => {
  const a = alerteOffre({ ...course, _uid: 'u1', distanceText: '2,4 km' }, t, prix);
  assert.equal(a.id, 'offre:u1');
  assert.equal(a.type, 'alerte');
  assert.match(a.titres[0], /carplayOffreTitre\(6\.50 €\|2,4 km\)/);
  assert.match(a.titres[0], /Boulangerie Lune/);
  assert.match(a.titres[0], /8 rue B, Paris/);
  assert.equal(a.titres.at(-1), 'carplayOffreTitreCourt(6.50 €)');
  assert.deepEqual(a.actions.map((x) => x.id), ['accepter', 'refuser']);
});

test('ecranCarPlay : session', () => {
  assert.deepEqual(ecranCarPlay({ session: 'deconnecte' }, t, prix).lignes[0].titre, 'carplayConnectezVous');
  assert.equal(ecranCarPlay({ session: 'deconnecte' }, t, prix).actions.length, 0);
  assert.equal(ecranCarPlay({ session: 'chargement' }, t, prix).lignes[0].titre, 'carplayChargement');
  assert.equal(ecranCarPlay({ session: 'desactive' }, t, prix).lignes[0].titre, 'carplayCompteDesactive');
  assert.equal(ecranCarPlay({ session: 'ok', accueilPret: false }, t, prix).lignes[0].titre, 'carplayOuvrezTelephone');
});

test('ecranCarPlay : hors ligne, en ligne, passage en cours', () => {
  const base = { session: 'ok', accueilPret: true };
  assert.deepEqual(ids(ecranCarPlay({ ...base, online: false }, t, prix)), ['enLigne']);
  assert.equal(ecranCarPlay({ ...base, online: false }, t, prix).titre, 'carplayHorsLigne');
  assert.deepEqual(ids(ecranCarPlay({ ...base, online: false, enCours: 'enLigne' }, t, prix)), []);
  assert.deepEqual(ids(ecranCarPlay({ ...base, online: true }, t, prix)), ['horsLigne']);
  // Offre ignorée hors ligne, montrée en ligne.
  assert.deepEqual(ids(ecranCarPlay({ ...base, online: false, offre: course }, t, prix)), ['enLigne']);
  const o = ecranCarPlay({ ...base, online: true, offre: { ...course, distanceText: '' } }, t, prix);
  assert.equal(o.titre, 'carplayNouvelleCourse');
  assert.deepEqual(ids(o), ['accepter', 'refuser']);
  assert.ok(o.lignes.every((l) => l.detail !== ''), 'aucune ligne vide');
});

test('ecranCarPlay : course en cours, étapes et actions', () => {
  const base = { session: 'ok', accueilPret: true, online: true };
  const retrait = ecranCarPlay({ ...base, course }, t, prix);
  assert.equal(retrait.titre, 'carplayEtapeRetrait');
  assert.deepEqual(ids(retrait), ['itineraire', 'telephone']);
  assert.equal(retrait.lignes.at(-1).titre, 'carplayPhotoTicket');
  const preuve = ecranCarPlay({ ...base, course, garde: { step: 0, preuveRetrait: true } }, t, prix);
  assert.deepEqual(ids(preuve), ['itineraire', 'recuperee']);
  assert.ok(!preuve.lignes.some((l) => l.titre === 'carplayPhotoTicket'));
  const route = ecranCarPlay({ ...base, course: { ...course, status: 'in_transit' } }, t, prix);
  assert.equal(route.titre, 'carplayEtapeLivraison');
  assert.deepEqual(ids(route), ['itineraire', 'arrive', 'appeler']);
  const enCours = ecranCarPlay({ ...base, enCours: 'arrive', course: { ...course, status: 'in_transit' } }, t, prix);
  assert.deepEqual(ids(enCours), ['itineraire', 'appeler']);
  const chez = ecranCarPlay({ ...base, course: { ...course, status: 'arrived' } }, t, prix);
  assert.equal(chez.titre, 'carplayEtapeChezClient');
  assert.deepEqual(ids(chez), ['telephone', 'appeler']);
  const fin = ecranCarPlay({ ...base, course, garde: { step: 4 } }, t, prix);
  assert.equal(fin.titre, 'carplayEtapeTerminee');
  assert.deepEqual(ids(fin), []);
  // La course en cours passe avant une offre.
  assert.equal(ecranCarPlay({ ...base, course, offre: course }, t, prix).titre, 'carplayEtapeRetrait');
});
