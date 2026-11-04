// node --experimental-detect-module --test lib/__tests__/carteDemande.test.mjs (Node 20 ; option inutile dès Node 22)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lieuxValides, lieuParDefaut, zoneDuLieu, lienGoogleMaps, lienWaze, aMontrerAuLancement, niveauConnu,
} from '../carteDemande.js';

test('lieuxValides : positions numériques seulement, niveau inconnu = faible', () => {
  const l = lieuxValides([
    { id: 1, lat: '48.8', lng: '2.3', niveau: 'forte' },
    { id: 2, lat: null, lng: 2.3 },
    { id: 3, lat: 'x', lng: 2.3 },
    { id: 4, lat: 48.9, lng: 2.4, niveau: 'enorme' },
  ]);
  assert.deepEqual(l.map((x) => x.id), [1, 4]);
  assert.equal(l[0].lat, 48.8);
  assert.equal(l[1].niveau, 'faible');
  assert.deepEqual(lieuxValides(undefined), []);
});

test('lieuParDefaut : plus forte demande, puis le plus proche', () => {
  const lieux = [
    { id: 1, niveau: 'forte', distance_km: 1 },
    { id: 2, niveau: 'tres_forte', distance_km: 5 },
    { id: 3, niveau: 'tres_forte', distance_km: 2 },
  ];
  assert.equal(lieuParDefaut(lieux).id, 3);
  assert.equal(lieuParDefaut([]), null);
});

test('zoneDuLieu : rien pour une demande faible, rayon croissant avec la demande', () => {
  assert.equal(zoneDuLieu({ id: 1, lat: 1, lng: 2, niveau: 'faible' }), null);
  const forte = zoneDuLieu({ id: 1, lat: 1, lng: 2, niveau: 'forte' });
  const tres = zoneDuLieu({ id: 2, lat: 1, lng: 2, niveau: 'tres_forte' });
  assert.ok(tres.radius > forte.radius);
  assert.deepEqual(forte.center, { latitude: 1, longitude: 2 });
});

test('liens de navigation', () => {
  const lieu = { lat: 48.85, lng: 2.35 };
  assert.equal(lienGoogleMaps(lieu), 'https://www.google.com/maps/dir/?api=1&destination=48.85,2.35');
  assert.equal(lienWaze(lieu), 'https://waze.com/ul?ll=48.85,2.35&navigate=yes');
});

test('une seule ouverture par lancement', () => {
  assert.equal(aMontrerAuLancement(), true);
  assert.equal(aMontrerAuLancement(), false);
  assert.equal(niveauConnu('moyenne'), 'moyenne');
});

test('bonus : montant lu du serveur, illisible ou négatif = 0', async () => {
  const { bonusValide } = await import('../carteDemande.js');
  assert.equal(bonusValide(2), 2);
  assert.equal(bonusValide('1.5'), 1.5);
  assert.equal(bonusValide(null), 0);
  assert.equal(bonusValide(-1), 0);
  assert.equal(bonusValide('x'), 0);
  const [l] = lieuxValides([{ id: 1, lat: 48.8, lng: 2.3, niveau: 'forte', bonus: '1.00' }]);
  assert.equal(l.bonus, 1);
  assert.equal(lieuxValides([{ id: 2, lat: 48.8, lng: 2.3 }])[0].bonus, 0);
});

test('rafraîchissement : rythme du serveur, borné entre 30 s et 10 min', async () => {
  const { delaiRafraichissementMs } = await import('../carteDemande.js');
  assert.equal(delaiRafraichissementMs(60), 60000);
  assert.equal(delaiRafraichissementMs(5), 30000);
  assert.equal(delaiRafraichissementMs(3600), 600000);
  assert.equal(delaiRafraichissementMs(undefined), 60000);
});

test('Apple Plans : itinéraire en voiture vers le lieu', async () => {
  const { lienApplePlans, lienApplePlansVers } = await import('../carteDemande.js');
  assert.equal(lienApplePlans({ lat: 48.8, lng: 2.3 }), 'https://maps.apple.com/?daddr=48.8,2.3&dirflg=d');
  assert.equal(lienApplePlansVers('1%20rue'), 'https://maps.apple.com/?daddr=1%20rue&dirflg=d');
});
