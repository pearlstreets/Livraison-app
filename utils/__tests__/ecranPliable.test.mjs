// node --test utils/__tests__/ecranPliable.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ecranChange,
  ecransVisibles,
  pileAvantOuverture,
  retourDeLaSource,
} from '../ecranPliable.js';

test('pliage et depliage rechargent, rotation et clavier non', () => {
  const plie = {width: 411, height: 797};
  const deplie = {width: 841, height: 701};
  assert.equal(ecranChange(plie, deplie), true);
  assert.equal(ecranChange(deplie, plie), true);
  // Rotation du telephone plie : largeur et hauteur s'echangent.
  assert.equal(ecranChange(plie, {width: 797, height: 411}), false);
  // Clavier : seule la hauteur change.
  assert.equal(ecranChange(plie, {width: 411, height: 500}), false);
  assert.equal(ecranChange(null, deplie), false);
});

const gauche = ['MenuMain', 'DeliveryHistory'];
const pile = noms => ({
  key: 'pile-1',
  routeNames: ['MenuMain', 'DeliveryHistory', 'DeliveryDetail', 'TicketChat', 'Wallet'],
  index: noms.length - 1,
  routes: noms.map((name, i) => ({key: `${name}-${i}`, name})),
});

test('ecrans visibles de chaque cote', () => {
  assert.deepEqual(ecransVisibles(gauche, pile(['MenuMain']).routes), {iGauche: 0, iDroite: -1});
  assert.deepEqual(
    ecransVisibles(gauche, pile(['MenuMain', 'Wallet', 'DeliveryHistory']).routes),
    {iGauche: 2, iDroite: 1},
  );
  assert.deepEqual(
    ecransVisibles(gauche, pile(['MenuMain', 'DeliveryHistory', 'DeliveryDetail']).routes),
    {iGauche: 1, iDroite: 2},
  );
});

test('page ouverte depuis la gauche : remplace la page de droite', () => {
  const avant = pile(['MenuMain', 'DeliveryHistory', 'DeliveryDetail', 'TicketChat']);
  const apres = pileAvantOuverture(gauche, avant, {
    type: 'NAVIGATE',
    source: 'DeliveryHistory-1',
    payload: {name: 'DeliveryDetail'},
  });
  assert.deepEqual(apres.routes.map(r => r.name), ['MenuMain', 'DeliveryHistory']);
  assert.equal(apres.index, 1);
});

test('page ouverte depuis la droite, liste ouverte a gauche : rien ne change', () => {
  const avant = pile(['MenuMain', 'DeliveryHistory', 'DeliveryDetail']);
  const depuisDroite = {type: 'NAVIGATE', source: 'DeliveryDetail-2', payload: {name: 'TicketChat'}};
  assert.equal(pileAvantOuverture(gauche, avant, depuisDroite), avant);
  const listeAGauche = {type: 'NAVIGATE', source: 'MenuMain-0', payload: {name: 'DeliveryHistory'}};
  assert.equal(pileAvantOuverture(gauche, avant, listeAGauche), avant);
  const retour = {type: 'GO_BACK', source: 'DeliveryDetail-2'};
  assert.equal(pileAvantOuverture(gauche, avant, retour), avant);
  const inconnu = {type: 'NAVIGATE', source: 'DeliveryHistory-1', payload: {name: 'Accueil'}};
  assert.equal(pileAvantOuverture(gauche, avant, inconnu), avant);
});

test('retour depuis la page de droite : ferme cette page, pas la liste du dessus', () => {
  const avant = pile(['MenuMain', 'EditProfile', 'Opportunities']);
  const retour = retourDeLaSource(avant, {type: 'GO_BACK', source: 'EditProfile-1'});
  assert.equal(retour.target, 'pile-1');
  const cible = {type: 'GO_BACK', source: 'EditProfile-1', target: 'autre'};
  assert.equal(retourDeLaSource(avant, cible), cible);
  const etranger = {type: 'GO_BACK', source: 'ailleurs'};
  assert.equal(retourDeLaSource(avant, etranger), etranger);
  const ouvrir = {type: 'NAVIGATE', source: 'MenuMain-0', payload: {name: 'Wallet'}};
  assert.equal(retourDeLaSource(avant, ouvrir), ouvrir);
});
