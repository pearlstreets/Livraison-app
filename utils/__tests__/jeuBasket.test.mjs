// node --experimental-detect-module --test utils/__tests__/jeuBasket.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reglagesNiveau, tirIdeal, simulerTir, tirDepuisGeste, longueurPourVitesse, vitesseIdeale,
  projeter, creerPartie, enregistrerTir, niveauReussi, passerNiveau, etatSauvegarde, partieReprise,
  multiplicateur, enFeu, DUREE_NIVEAU, BONUS_PARFAIT_S, MULTI_MAX,
} from '../jeuBasket.js';

const NIVEAUX = Array.from({ length: 15 }, (_, i) => i + 1);

test('progression des niveaux : distance, panier mobile, vent, objectif', () => {
  const r = NIVEAUX.map(reglagesNiveau);
  assert.ok(r[0].distance < r[1].distance && r[1].distance < r[2].distance, 'distance 1 à 3');
  [0, 1, 2].forEach((i) => { assert.equal(r[i].amplitude, 0); assert.equal(r[i].vent, 0); });
  [3, 4, 5].forEach((i) => { assert.ok(r[i].amplitude > 0); assert.equal(r[i].vent, 0); });
  r.slice(6).forEach((x) => {
    assert.ok(x.ventForce > 0 && x.vent !== 0, `vent au niveau ${x.niveau}`);
    assert.ok(x.periode < r[5].periode, 'panier plus rapide dès 7');
  });
  for (let i = 1; i < r.length; i += 1) {
    assert.ok(r[i].objectif >= r[i - 1].objectif);
    assert.ok(r[i].aide <= r[i - 1].aide);
  }
  assert.equal(reglagesNiveau(500).objectif, 12);
  r.forEach((x) => assert.equal(x.duree, DUREE_NIVEAU));
});

test('tir idéal = parfait à chaque niveau sans vent, au centre ou décalé', () => {
  NIVEAUX.forEach((n) => {
    const reg = { ...reglagesNiveau(n), vent: 0 };
    [0, reg.amplitude * 0.7].forEach((hx) => {
      const s = simulerTir(tirIdeal(reg, hx), reg, hx);
      assert.equal(s.issue, 'parfait', `niveau ${n}, hx ${hx}`);
    });
  });
});

test('le geste de la bonne longueur, droit vers le panier, donne un parfait', () => {
  [1, 2, 3].forEach((n) => {
    const reg = reglagesNiveau(n);
    const L = longueurPourVitesse(vitesseIdeale(reg.distance));
    const s = simulerTir(tirDepuisGeste({ dx: 0, dy: -L }, reg, 0), reg, 0);
    assert.equal(s.issue, 'parfait', `niveau ${n}`);
  });
});

test('trop court ou trop long : raté ; entre les deux : panier avec cercle ou planche', () => {
  const reg = reglagesNiveau(1);
  const v = tirIdeal(reg);
  const fois = (k) => ({ vx: v.vx * k, vy: v.vy * k, vz: v.vz * k });
  assert.equal(simulerTir(fois(0.85), reg).issue, 'rate');
  assert.equal(simulerTir(fois(1.2), reg).issue, 'rate');
  let touche = false;
  for (let k = 0.9; k <= 1.12; k += 0.002) {
    const s = simulerTir(fois(k), reg);
    if (s.issue === 'panier') { assert.ok(s.cercle || s.planche); touche = true; }
  }
  assert.ok(touche, 'au moins un panier non parfait');
});

test('grand angle de côté : raté ; le vent dévie le tir idéal', () => {
  const reg = reglagesNiveau(1);
  const L = longueurPourVitesse(vitesseIdeale(reg.distance));
  assert.equal(simulerTir(tirDepuisGeste({ dx: 0.2, dy: -L }, reg, 0), reg, 0).issue, 'rate');
  const venteux = reglagesNiveau(9);
  const calme = { ...venteux, vent: 0 };
  const avec = simulerTir(tirIdeal(calme), venteux);
  const sans = simulerTir(tirIdeal(calme), calme);
  assert.ok(Math.abs(avec.x - sans.x) > 0.3, `déviation ${avec.x - sans.x}`);
  assert.equal(Math.sign(avec.x - sans.x), venteux.ventSens);
});

test('glissement trop court : aucun tir', () => {
  assert.equal(tirDepuisGeste({ dx: 0, dy: -0.02 }, reglagesNiveau(1)), null);
  assert.equal(tirDepuisGeste({ dx: 0, dy: 0.3 }, reglagesNiveau(1)), null);
});

test('aide d angle seulement pour un panier fixe sans vent', () => {
  const geste = { dx: 0.01, dy: -0.25 };
  const angle = (v) => Math.atan2(v.vx, v.vz);
  const fixe = reglagesNiveau(1);
  assert.ok(Math.abs(angle(tirDepuisGeste(geste, fixe, 0)) - angle(tirDepuisGeste(geste, { ...fixe, aide: 0 }, 0))) > 1e-4);
  for (const niv of [4, 7]) {
    const reg = reglagesNiveau(niv);
    const ecart = angle(tirDepuisGeste(geste, reg, 0)) - angle(tirDepuisGeste(geste, { ...reg, aide: 0 }, 0));
    assert.ok(Math.abs(ecart) < 1e-9, `niveau ${niv} : ${ecart}`);
  }
});

test('parfaits d affilée : multiplicateur x2 à x5, feu à 3, +2 s, remise à x1', () => {
  const p = creerPartie(1);
  const pts = [1, 2, 3, 4, 5, 6].map(() => enregistrerTir(p, 'parfait'));
  assert.deepEqual(pts.map((x) => x.points), [3, 6, 9, 12, 15, 15]);
  assert.deepEqual(pts.map((x) => x.feu), [false, false, true, true, true, true]);
  pts.forEach((x) => assert.equal(x.bonusTemps, BONUS_PARFAIT_S));
  assert.equal(multiplicateur(50), MULTI_MAX);
  const panier = enregistrerTir(p, 'panier');
  assert.equal(panier.points, 2);
  assert.equal(panier.serie, 0);
  assert.equal(enregistrerTir(p, 'parfait').points, 3);
  const rate = enregistrerTir(p, 'rate');
  assert.equal(rate.points, 0);
  assert.equal(enregistrerTir(p, 'parfait').points, 3);
  assert.equal(enFeu(2), false);
  assert.equal(p.meilleureSerie, 6);
  assert.equal(p.score, 3 + 6 + 9 + 12 + 15 + 15 + 2 + 3 + 3);
});

test('objectif du niveau puis niveau suivant', () => {
  const p = creerPartie(1);
  const obj = reglagesNiveau(1).objectif;
  for (let i = 0; i < obj - 1; i += 1) enregistrerTir(p, 'panier');
  assert.equal(niveauReussi(p), false);
  enregistrerTir(p, 'parfait');
  assert.equal(niveauReussi(p), true);
  passerNiveau(p);
  assert.equal(p.niveau, 2);
  assert.equal(p.paniersNiveau, 0);
});

test('projection : panier plus loin = plus petit et plus haut', () => {
  const pres = projeter(0, 3.05, 3.5, 390, 750);
  const loin = projeter(0, 3.05, 6.5, 390, 750);
  assert.ok(loin.s < pres.s);
  assert.ok(loin.y < pres.y);
});

test('sauvegarde puis reprise', () => {
  const p = creerPartie(4);
  enregistrerTir(p, 'parfait');
  enregistrerTir(p, 'parfait');
  const etat = JSON.parse(JSON.stringify(etatSauvegarde(p, 12345)));
  const { partie, tempsRestant } = partieReprise(etat);
  assert.deepEqual(partie, p);
  assert.equal(tempsRestant, 12345);
  assert.equal(partieReprise({}).tempsRestant, DUREE_NIVEAU * 1000);
  assert.equal(partieReprise(null).partie.niveau, 1);
});
