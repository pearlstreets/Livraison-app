// node --experimental-detect-module --test utils/__tests__/jeuRush.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTE_RUSH_JS } from '../jeuRushDifficulte.js';
import { POLICE_RUSH_JS } from '../jeuRushPolice.js';
import { readFileSync } from 'node:fs';

// Même code que celui injecté dans la page 3D.
const D = new Function(`${DIFFICULTE_RUSH_JS}; return RUSH_DIFF;`)();
const nouvellePolice = () => new Function(`${POLICE_RUSH_JS}; return RUSH_POLICE;`)();
const P = nouvellePolice();

// Distance parcourue au bout de `secondes` à vitesse de base (pas de 1/60 s).
function distanceApres(secondes) {
  let dist = 0;
  for (let t = 0; t < secondes; t += 1 / 60) dist += D.vitesse(dist, Math.floor(dist / 1000)) / 60;
  return dist;
}

// Code de la page 3D (le module importe sans extension, on lit donc le fichier).
const SOURCE_PAGE = readFileSync(new URL('../jeuRush3dPage.js', import.meta.url), 'utf8');
const JEU_JS = SOURCE_PAGE.slice(SOURCE_PAGE.indexOf('export const JEU_JS = `') + 23, SOURCE_PAGE.indexOf('\n`;\n'))
  .split('$' + '{DIFFICULTE_RUSH_JS}').join(DIFFICULTE_RUSH_JS)
  .split('$' + '{POLICE_RUSH_JS}').join(POLICE_RUSH_JS);

test('la page 3D se lit (code injecté valide)', () => {
  assert.ok(!JEU_JS.includes('$' + '{'), 'interpolation inattendue dans la page');
  assert.doesNotThrow(() => new Function(JEU_JS));
  assert.ok(JEU_JS.includes('var RUSH_DIFF='));
  assert.ok(JEU_JS.includes('var RUSH_POLICE='));
  // Aucun objet de chantier ni décor de nuit.
  ['tonneau', 'chantier', 'plot'].forEach((mot) => assert.ok(!JEU_JS.toLowerCase().includes(mot), mot));
});

test('vitesse : départ accessible, montée continue, plafond', () => {
  assert.equal(D.vitesse(0, 0), 11);
  let avant = 0;
  for (let d = 0; d <= 20000; d += 50) {
    const v = D.vitesse(d, Math.floor(d / 1000));
    assert.ok(v >= avant - 1e-9, `vitesse en baisse à ${d} m`);
    assert.ok(v <= D.V_MAX);
    avant = v;
  }
  assert.equal(D.vitesse(20000, 20), D.V_MAX);
});

test('niveau de difficulté croissant au fil du temps', () => {
  const a1 = distanceApres(60);
  const a3 = distanceApres(180);
  assert.ok(D.niveau(a1) > 0.1 && D.niveau(a1) < 0.5, `1 min : ${a1} m`);
  assert.ok(D.niveau(a3) > D.niveau(a1));
  assert.ok(D.pVoieLibre(a3) < D.pVoieLibre(a1) && D.pVoieLibre(a1) < D.pVoieLibre(0));
  assert.ok(D.pVoitureRoule(a3) > D.pVoitureRoule(a1) && D.pVoitureRoule(100) === 0);
  assert.ok(D.vVoitureRoule(a3, 0.5) > D.vVoitureRoule(0, 0.5));
});

test('rangées toujours franchissables : écart jamais sous un saut, même super saut après une haie ou une rangée de voies', () => {
  const air = D.tempsEnLAir(false);
  const airSuper = D.tempsEnLAir(true);
  assert.ok(Math.abs(air - 0.686) < 0.01);
  for (let d = 0; d <= 20000; d += 100) {
    const p = Math.floor(d / 1000);
    ['mur', 'banniere', 'bas'].forEach((g) => {
      const t = D.ecart(d, p, g) / D.vitesse(d, p);
      assert.ok(t >= 1.0 - 1e-9, `${d} m après ${g} : ${t} s`);
      assert.ok(t >= air + 0.25, `${d} m : écart ${t} s pour un saut de ${air} s`);
      if (g !== 'banniere') assert.ok(t > airSuper + 0.1, `${d} m après ${g} : super saut ${airSuper} s, écart ${t} s`);
    });
  }
  // Début plus aéré que la fin.
  assert.ok(D.tempsEcart(0, 'mur') > D.tempsEcart(20000, 'mur'));
});

test('sept bonus, tous tirables, avec leur durée', () => {
  assert.deepEqual(D.IDS, ['turbo', 'saut', 'x2', 'aimant', 'casque', 'ralenti', 'or']);
  const vus = new Set();
  for (let i = 0; i < 1000; i += 1) vus.add(D.choisirBonus(i / 1000));
  assert.equal(vus.size, 7);
  assert.equal(D.choisirBonus(0.99999), 'or');
  D.IDS.filter((id) => id !== 'casque').forEach((id) => assert.ok(D.DUREE[id] > 0, id));
  assert.equal(D.bonusPossible(30, 5, 0), false);
  assert.equal(D.bonusPossible(500, 2, 0), false);
  assert.equal(D.bonusPossible(500, 3, 0.5), true);
  assert.equal(D.bonusPossible(500, 3, 0.6), false);
});

test('score : une heure parfaite reste sous le plafond serveur (2 000 000)', () => {
  // Une heure sans faute, tous les colis ramassés (au plus ~6 par rangée, une rangée par seconde),
  // x2 et colis en or aussi souvent que le tirage le permet (un bonus toutes les ~3,8 rangées).
  const parBonus = 3 + 1 / 0.55 - 1; // rangées entre deux bonus, en moyenne
  const cycle = parBonus * D.IDS.length; // s entre deux bonus identiques
  const partX2 = Math.min(1, D.DUREE.x2 / cycle);
  const partOr = Math.min(1, D.DUREE.or / cycle);
  const valeurColis = 10 * (1 - partOr + partOr * 5) * (1 + partX2);
  const score = distanceApres(3600) * (1 + partX2) + 3600 * 6 * valeurColis;
  assert.ok(score < 2000000, `${Math.round(score)}`);
});

test('obstacles : voitures, adultes, enfants, obstacle bas et barrière, tous tirables', () => {
  const vus = new Set();
  for (let i = 0; i < 1000; i += 1) vus.add(D.choisirObstacle(i / 1000));
  assert.deepEqual([...vus].sort(), ['adulte', 'barriere', 'bas', 'enfant', 'voiture']);
});

test('police : premier choc, poursuite de 10 s puis abandon', () => {
  const p = P.creer();
  assert.equal(P.visible(p), false);
  assert.equal(P.ecart(p), -1);
  assert.equal(P.choc(p, {}), 'poursuite');
  assert.equal(P.enPoursuite(p), true);
  assert.equal(P.secondes(p), 10);
  assert.equal(P.ratio(p), 1);
  let abandons = 0;
  for (let i = 0; i < 599; i += 1) if (P.avancer(p, 1 / 60) === 'abandon') abandons += 1;
  assert.equal(abandons, 0, 'pas d\'abandon avant 10 s');
  assert.equal(P.enPoursuite(p), true);
  assert.equal(P.secondes(p), 1);
  let fin = '';
  for (let i = 0; i < 3 && !fin; i += 1) fin = P.avancer(p, 1 / 60);
  assert.equal(fin, 'abandon');
  assert.equal(P.enPoursuite(p), false);
  // La voiture repart puis disparaît, abandon annoncé une seule fois.
  assert.equal(P.visible(p), true);
  for (let i = 0; i < 200; i += 1) assert.notEqual(P.avancer(p, 1 / 60), 'abandon');
  assert.equal(P.visible(p), false);
  // Nouveau choc après l'abandon : nouvelle poursuite, pas d'arrestation.
  assert.equal(P.choc(p, {}), 'poursuite');
  assert.equal(p.arrete, false);
});

test('police : deuxième choc pendant la poursuite, arrestation puis fin', () => {
  const p = P.creer();
  P.choc(p, {});
  for (let i = 0; i < 594; i += 1) P.avancer(p, 1 / 60); // 9,9 s
  assert.equal(P.enPoursuite(p), true);
  assert.equal(P.choc(p, {}), 'arrete');
  assert.equal(p.arrete, true);
  assert.equal(P.enPoursuite(p), false);
  assert.equal(P.visible(p), true);
  // La voiture se rapproche pendant la scène, puis la partie finit une seule fois.
  const e0 = P.ecart(p);
  let fins = 0;
  for (let i = 0; i < 60 * 3; i += 1) if (P.avancer(p, 1 / 60) === 'fin') fins += 1;
  assert.ok(fins >= 1);
  assert.ok(P.ecart(p) < e0);
  assert.ok(P.ecart(p) > 0);
  // Arrêté : aucune protection ne compte plus.
  assert.equal(P.choc(p, { casque: true, turbo: true }), 'arrete');
  assert.equal(P.photo(p), 0);
});

test('police : le casque et le turbo n\'appellent pas la police', () => {
  const p = P.creer();
  assert.equal(P.choc(p, { casque: true }), 'casque');
  assert.equal(P.choc(p, { turbo: true }), 'turbo');
  assert.equal(P.visible(p), false);
  // Pendant une poursuite, le casque évite aussi l'arrestation.
  P.choc(p, {});
  P.avancer(p, 2);
  assert.equal(P.choc(p, { casque: true }), 'casque');
  assert.equal(p.arrete, false);
  assert.equal(P.enPoursuite(p), true);
});

test('police : la voiture arrive de loin, suit de près, repart au loin', () => {
  const p = P.creer();
  P.choc(p, {});
  const loin = P.ecart(p);
  P.avancer(p, 2);
  const suit = P.ecart(p);
  assert.ok(loin > suit && suit > 0);
  P.avancer(p, 8.5);
  P.avancer(p, 1);
  assert.ok(P.ecart(p) > suit);
});

test('police : reprise de partie pendant une poursuite', () => {
  const p = P.creer();
  P.choc(p, {});
  P.avancer(p, 4);
  const photo = P.photo(p);
  assert.ok(Math.abs(photo - 6) < 1e-9);
  const q = P.restaurer(photo);
  assert.equal(P.enPoursuite(q), true);
  assert.equal(P.secondes(q), 6);
  assert.equal(P.choc(q, {}), 'arrete');
  ['', null, undefined, 'x', -3, 0].forEach((v) => assert.equal(P.enPoursuite(P.restaurer(v)), false));
  assert.equal(P.restaurer(99).reste, 10);
  assert.ok(nouvellePolice() !== P);
});

test('police : nouveau choc pendant le départ, la voiture repart de sa place (pas de saut)', () => {
  const p = P.creer();
  P.choc(p, {});
  P.avancer(p, 10);
  assert.equal(P.enPoursuite(p), false);
  P.avancer(p, 0.6);
  const avant = P.ecart(p);
  assert.ok(avant > P.ECART_SUIT && avant < 18);
  assert.equal(P.choc(p, {}), 'poursuite');
  assert.ok(Math.abs(P.ecart(p) - avant) < 1e-6, `${P.ecart(p)} au lieu de ${avant}`);
  P.avancer(p, 2);
  assert.ok(Math.abs(P.ecart(p) - P.ECART_SUIT) < 1e-9);
});

test('page 3D : score plafonné, collision balayée, voie dégagée à l\'arrestation', () => {
  assert.ok(/function score\(\)\{ return Math\.min\(SCORE_MAX,/.test(JEU_JS));
  assert.ok(JEU_JS.includes('var SCORE_MAX=2000000;'));
  assert.ok(JEU_JS.includes('dp=dc-mv-dz'));
  assert.ok(JEU_JS.includes('preparerArrestation(o)'));
});
