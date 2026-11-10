// node --experimental-detect-module --test utils/__tests__/jeuSommet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONDE_L, V_SAUT, V_MONTE, JOUEUR_H, ECART_MAX_RATIO, LARGEURS, BONUS, TYPES_BONUS, BONUS_ECART_MIN,
  SURCHARGE_MAX, VENT_MAX, difficulte, ecarts, hauteurSaut, peutAtteindre, surcharge, ventMax,
  reglagesPieges, partieNeuve, genererJusqua, avancer, hasardGraine, bonusActifs, restaurerBonus,
} from '../jeuSommet.js';

const GRAINES = [1, 7, 42, 999, 31337];
const H_SAUT = hauteurSaut(V_SAUT);

test('difficulté : nulle au départ, croissante, bornée', () => {
  assert.equal(difficulte(0), 0);
  let avant = -1;
  for (let h = 0; h <= 20000; h += 500) {
    const d = difficulte(h);
    assert.ok(d > avant && d < 1, `hauteur ${h}`);
    avant = d;
  }
  const debut = ecarts(0);
  assert.ok(debut.min === 48 && debut.max === 84);
  assert.ok(ecarts(1).max <= ECART_MAX_RATIO * H_SAUT + 1e-9);
});

test('pièges de plus en plus durs, sans jamais devenir impossibles', () => {
  let avant = reglagesPieges(0);
  for (let h = 600; h <= 30000; h += 600) {
    const r = reglagesPieges(h);
    const ctx = `hauteur ${h}`;
    assert.ok(r.intervallePot <= avant.intervallePot + 1e-9, ctx);
    assert.ok(r.intervallePigeon <= avant.intervallePigeon + 1e-9, ctx);
    assert.ok(r.vitessePot >= avant.vitessePot - 1e-9, ctx);
    assert.ok(r.vitessePigeon >= avant.vitessePigeon - 1e-9, ctx);
    assert.ok(r.vent >= avant.vent - 1e-9, ctx);
    assert.ok(r.alertePot >= 0.6 - 1e-9, `${ctx} : alerte trop courte`);
    assert.ok(r.intervallePot >= 2 / (1 + SURCHARGE_MAX) - 1e-9, ctx);
    avant = r;
  }
  assert.equal(surcharge(0), 0);
  assert.equal(surcharge(4), 0);
  assert.ok(surcharge(5) > 0);
  assert.equal(surcharge(100), SURCHARGE_MAX);
  assert.equal(ventMax(0), 0);
  assert.equal(ventMax(1), VENT_MAX);
  assert.ok(ventMax(100) <= VENT_MAX * 1.3 + 1e-9);
});

test('le plus grand écart reste atteignable même contre le vent le plus fort', () => {
  const gap = ecarts(1).max;
  const vent = ventMax(1000);
  [0, 90, MONDE_L / 2].forEach((dx) => {
    assert.ok(peutAtteindre(gap, dx, LARGEURS.balcon, 0), `sans vent dx ${dx}`);
    assert.ok(peutAtteindre(gap, dx, LARGEURS.balcon, vent), `vent + dx ${dx}`);
    assert.ok(peutAtteindre(gap, dx, LARGEURS.balcon, -vent), `vent - dx ${dx}`);
  });
});

test('chaîne de plateformes : écarts sous la borne sur une très haute tour', () => {
  GRAINES.forEach((g) => {
    const e = partieNeuve(640, hasardGraine(g));
    genererJusqua(e, 30000);
    const chaine = e.plateformes.filter((p) => p.chaine).sort((a, b) => a.y - b.y);
    for (let i = 1; i < chaine.length; i += 1) {
      const ecart = chaine[i].y - chaine[i - 1].y;
      assert.ok(ecart <= ECART_MAX_RATIO * H_SAUT + 1e-6, `graine ${g} : écart ${ecart}`);
    }
  });
});

test('bonus : réguliers, espacés, variés, posés au-dessus d\'un balcon de la chaîne', () => {
  GRAINES.forEach((g) => {
    const e = partieNeuve(640, hasardGraine(g));
    genererJusqua(e, 30000);
    const liste = e.bonusListe;
    assert.ok(liste.length >= 15, `graine ${g} : seulement ${liste.length} bonus`);
    const vus = new Set();
    for (let i = 0; i < liste.length; i += 1) {
      const b = liste[i];
      vus.add(b.type);
      assert.ok(TYPES_BONUS.includes(b.type));
      assert.ok(b.y - 40 >= BONUS[b.type].des, `graine ${g} : ${b.type} trop bas`);
      const support = e.plateformes.find((p) => p.chaine && p.type === 'balcon' && p.y === b.y - 40 && Math.abs(p.x + p.l / 2 - b.x) < 1e-6);
      assert.ok(support, `graine ${g} : bonus ${i} sans balcon`);
      if (i > 0) {
        assert.ok(b.y - liste[i - 1].y >= BONUS_ECART_MIN - 1e-6, `graine ${g} : bonus trop proches`);
        assert.notEqual(b.type, liste[i - 1].type, `graine ${g} : deux fois le même bonus`);
      }
    }
    assert.equal(vus.size, TYPES_BONUS.length);
  });
});

function partieTest() {
  const e = partieNeuve(640, hasardGraine(3));
  e.plateformes = [];
  e.colisListe = [];
  e.bonusListe = [];
  e.prochainY = 1e9; // rien de nouveau
  e.hautMax = 100; // pas de gêneurs
  e.joueur = { x: 180, y: 300, vx: 0, vy: 0, regard: 1, rot: 0 };
  e.cam = 0;
  return e;
}

test('ramasser un bonus l\'active pour sa durée', () => {
  TYPES_BONUS.forEach((type) => {
    const e = partieTest();
    e.bonusListe.push({ id: 999, type, x: 180, y: 320, pris: false });
    const evts = avancer(e, 1 / 60, 0);
    assert.ok(evts.includes(type), type);
    assert.ok(e[type] > BONUS[type].duree - 0.1 && e[type] <= BONUS[type].duree, `${type} ${e[type]}`);
  });
});

test('casque : pare un pot, puis s\'use', () => {
  const e = partieTest();
  e.casque = 5;
  e.pots.push({ id: 50, x: 180, y: 320, vy: 0, alerte: 0, casse: false });
  const evts = avancer(e, 1 / 60, 0);
  assert.ok(evts.includes('protege'));
  assert.equal(e.phase, 'jeu');
  assert.equal(e.casque, 0);
  assert.ok(e.pots[0].casse);
  // Sans casque ni répit, le pot suivant arrête la tournée.
  e.invuln = 0;
  e.joueur.y = 300;
  e.joueur.vy = 0;
  e.pots.push({ id: 51, x: 180, y: 320, vy: 0, alerte: 0, casse: false });
  const evts2 = avancer(e, 1 / 60, 0);
  assert.ok(evts2.includes('touche'));
  assert.equal(e.phase, 'chute');
});

test('casque : pare aussi un pigeon touché de côté', () => {
  const e = partieTest();
  e.casque = 5;
  e.joueur.vy = 300;
  e.pigeons.push({ id: 60, x: 180, y: 320, vx: 0, regard: 1, mort: false, vyMort: 0 });
  const evts = avancer(e, 1 / 60, 0);
  assert.ok(evts.includes('protege'));
  assert.equal(e.phase, 'jeu');
  assert.ok(e.pigeons[0].mort);
});

test('filet : rattrape une chute une seule fois', () => {
  const e = partieTest();
  e.cam = 1000;
  e.joueur.y = 1000 - JOUEUR_H - 25;
  e.joueur.vy = -800;
  e.filet = 5;
  const evts = avancer(e, 1 / 60, 0);
  assert.ok(evts.includes('sauve'));
  assert.equal(e.phase, 'jeu');
  assert.equal(e.filet, 0);
  assert.ok(e.joueur.vy > V_MONTE * 0.9);
  // Sans filet : fin de partie.
  e.joueur.y = e.cam - JOUEUR_H - 25;
  e.joueur.vy = -800;
  const evts2 = avancer(e, 1 / 60, 0);
  assert.ok(evts2.includes('fin'));
  assert.equal(e.phase, 'fin');
});

test('aimant : attire un colis proche, pas un colis lointain', () => {
  const e = partieTest();
  e.aimant = 8;
  e.joueur.vy = 0;
  e.colisListe.push({ id: 70, x: 180 + 120, y: 323, pris: false });
  e.colisListe.push({ id: 71, x: 180, y: 900, pris: false });
  let pris = 0;
  for (let i = 0; i < 30; i += 1) {
    e.joueur.y = 300;
    e.joueur.vy = 0;
    if (avancer(e, 1 / 60, 0).includes('colis')) pris += 1;
  }
  assert.equal(pris, 1);
  assert.equal(e.colis, 1);
  assert.ok(e.colisListe.some((c) => c.id === 71 && c.x === 180 && c.y === 900));
});

test('bonus actifs sauvegardés et restaurés (bornés)', () => {
  const e = partieTest();
  e.aimant = 3.27;
  e.casque = 0;
  e.filet = 12;
  const sauve = JSON.parse(JSON.stringify(bonusActifs(e)));
  assert.deepEqual(sauve, { aimant: 3.3, casque: 0, filet: 12 });
  const f = partieNeuve(640, hasardGraine(5));
  restaurerBonus(f, { ...sauve, casque: 999, filet: 'x' });
  assert.equal(f.aimant, 3.3);
  assert.equal(f.casque, BONUS.casque.duree);
  assert.equal(f.filet, 0);
  restaurerBonus(f, undefined);
  assert.equal(f.aimant, 3.3);
});

test('partie neuve accessible : premier bonus vers le 11e étage, aucun gêneur au départ', () => {
  const e = partieNeuve(640, hasardGraine(11));
  assert.ok(e.bonusListe.every((x) => x.y >= 650));
  assert.equal(e.bonusListe[0]?.type, 'aimant');
  for (let i = 0; i < 60; i += 1) avancer(e, 1 / 60, 0);
  assert.equal(e.pots.length, 0);
  assert.equal(e.pigeons.length, 0);
});
