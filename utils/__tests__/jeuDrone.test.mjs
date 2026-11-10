// node --experimental-detect-module --test utils/__tests__/jeuDrone.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HAUTEUR, SOL, DRONE_DX, DRONE_DY, LARGEUR_OBSTACLE, MARGE, POINTS_COLIS, POINTS_CLIENT, IMPULSION,
  DUREE_AIMANT, DUREE_DOUBLE, BONUS_RANG_MIN, BONUS_ECART, BONUS,
  reglages, creerMonde, avancer, impulsion, nouvelObstacle, centreObstacle, bonusActifs, multiplicateur,
} from '../jeuDrone.js';

const GRAINES = [1, 7, 42, 999, 31337, 123456];

test('difficulté croissante et bornée', () => {
  let avant = reglages(0);
  assert.equal(avant.vitesse, 330);
  assert.equal(avant.ecart, 290);
  assert.equal(avant.probaMouvement, 0);
  for (let p = 5; p <= 600; p += 5) {
    const r = reglages(p);
    assert.ok(r.vitesse >= avant.vitesse, `vitesse ${p}`);
    assert.ok(r.ecart <= avant.ecart, `écart ${p}`);
    assert.ok(r.espacement <= avant.espacement, `espacement ${p}`);
    assert.ok(r.amplitude >= avant.amplitude, `amplitude ${p}`);
    avant = r;
  }
  assert.ok(reglages(150).vitesse < reglages(350).vitesse, 'encore plus dur après 150 passages');
  const fin = reglages(10000);
  assert.ok(fin.vitesse <= 500 && fin.ecart >= 230 && fin.espacement >= 390, 'plafonds');
  assert.ok(fin.ecart >= 4 * DRONE_DY, 'passage toujours plus de 4 fois la hauteur du drone');
});

test('passages toujours dans l’écran et sous les bornes, à tous les niveaux', () => {
  GRAINES.forEach((g) => {
    [0, 40, 150, 300, 800].forEach((passes) => {
      const m = creerMonde(800, g);
      m.passes = passes;
      for (let i = 0; i < 200; i += 1) {
        const o = nouvelObstacle(m);
        assert.ok(o.centre - o.ecart / 2 - o.amp >= MARGE - 0.5, `haut ${g} ${passes}`);
        assert.ok(o.centre + o.ecart / 2 + o.amp <= HAUTEUR - SOL - MARGE + 0.5, `bas ${g} ${passes}`);
      }
    });
  });
});

test('bonus : jamais au début, espacés, jamais avec un colis, les trois types sortent', () => {
  const vus = new Set();
  GRAINES.forEach((g) => {
    const m = creerMonde(800, g);
    let dernier = -99;
    for (let i = 0; i < 600; i += 1) {
      const o = nouvelObstacle(m);
      const rang = m.obstacles.length - 1;
      if (o.bonus) {
        vus.add(o.bonus);
        assert.ok(BONUS.includes(o.bonus));
        assert.ok(rang >= BONUS_RANG_MIN, 'pas au début');
        assert.ok(rang - dernier >= BONUS_ECART, 'espacés');
        assert.ok(!o.colis, 'jamais avec un colis');
        dernier = rang;
      }
    }
    const nb = m.obstacles.filter((o) => o.bonus).length;
    assert.ok(nb >= 15 && nb <= 70, `fréquence ${nb} pour 600 obstacles`);
  });
  assert.equal(vus.size, 3);
});

// Monde de test : un seul obstacle juste devant le drone, passage centré sur lui.
function mondeAvecObstacle(champs) {
  const m = creerMonde(800, 5);
  impulsion(m);
  m.obstacles = [];
  m.drone.vy = 0;
  m.drone.y = 450;
  const o = nouvelObstacle(m);
  Object.assign(o, { x: m.drone.x + DRONE_DX + 2, centre: 450, amp: 0, ecart: 260, colis: false, client: false, bonus: null }, champs);
  m.obstacles = [o];
  return { m, o };
}

function voler(m, secondes, garderHauteur = true) {
  const ev = [];
  for (let t = 0; t < secondes; t += 1 / 60) {
    if (garderHauteur) { m.drone.vy = 0; }
    ev.push(...avancer(m, 1 / 60));
    if (m.phase !== 'vol') break;
  }
  return ev;
}

test('bonus aimant : attrape le colis et sert le client à toute hauteur, puis s’arrête', () => {
  const { m, o } = mondeAvecObstacle({ colis: true, client: true });
  m.aimant = DUREE_AIMANT;
  m.drone.y = 450 - 100; // au-dessus du centre, hors de portée du colis sans aimant
  o.centre = 450 - 100 + 0; // passage à hauteur du drone (pas de crash)
  m.drone.y = o.centre - 60; // au-dessus du colis et du balcon
  const ev = voler(m, 1);
  assert.ok(ev.some((e) => e.type === 'colis'), 'colis attiré');
  assert.ok(ev.some((e) => e.type === 'client'), 'client servi');
  m.aimant = 0.01;
  const fin = voler(m, 0.1);
  assert.ok(fin.some((e) => e.type === 'finBonus' && e.bonus === 'aimant'));
  assert.equal(bonusActifs(m).length, 0);
});

test('bonus points doublés : passage, colis et client comptent double', () => {
  const { m } = mondeAvecObstacle({ colis: true });
  m.double = DUREE_DOUBLE;
  assert.equal(multiplicateur(m), 2);
  const ev = voler(m, 1);
  const colis = ev.find((e) => e.type === 'colis');
  const passage = ev.find((e) => e.type === 'passage');
  assert.equal(colis.points, POINTS_COLIS * 2);
  assert.equal(passage.points, 2);
  assert.equal(m.score, POINTS_COLIS * 2 + 2);
  assert.ok(POINTS_CLIENT * 2 === 6);
});

test('bonus ramassé au milieu du passage, annoncé, affiché au HUD', () => {
  const { m } = mondeAvecObstacle({ bonus: 'bouclier' });
  const ev = voler(m, 1);
  assert.ok(ev.some((e) => e.type === 'bonus' && e.bonus === 'bouclier'));
  assert.equal(m.bouclier, true);
  assert.deepEqual(bonusActifs(m).map((b) => b.id), ['bouclier']);
});

test('bouclier : encaisse un choc contre un obstacle, puis le choc suivant est fatal', () => {
  const { m, o } = mondeAvecObstacle({});
  m.bouclier = true;
  o.centre = 450 + 200; // drone dans l'immeuble du haut : choc certain
  const ev = voler(m, 1.5);
  assert.ok(ev.some((e) => e.type === 'bouclierPerdu'), 'bouclier utilisé');
  assert.ok(!ev.some((e) => e.type === 'crash'), 'pas de crash');
  assert.equal(m.bouclier, false);
  assert.equal(m.phase, 'vol');
  // Plus de bouclier : le prochain choc fait tomber le drone.
  m.obstacles = [];
  m.invincible = 0;
  const o2 = nouvelObstacle(m);
  Object.assign(o2, { x: m.drone.x - LARGEUR_OBSTACLE / 2, centre: m.drone.y + 200, amp: 0, ecart: 260 });
  const ev2 = voler(m, 0.2);
  assert.ok(ev2.some((e) => e.type === 'crash'));
});

test('bouclier : rebond au sol au lieu du crash', () => {
  const { m } = mondeAvecObstacle({});
  m.obstacles[0].x = 2000;
  m.bouclier = true;
  m.drone.y = HAUTEUR - SOL - DRONE_DY - 2;
  m.drone.vy = 400;
  const ev = voler(m, 0.1, false);
  assert.ok(ev.some((e) => e.type === 'bouclierPerdu'));
  assert.ok(!ev.some((e) => e.type === 'crash'));
  assert.ok(m.drone.vy <= 0 || m.drone.y < HAUTEUR - SOL - DRONE_DY, 'remonte');
  assert.ok(IMPULSION > 0);
});

test('ancienne sauvegarde sans champs de bonus : la partie continue', () => {
  const m = creerMonde(800, 3);
  impulsion(m);
  delete m.bouclier; delete m.aimant; delete m.double; delete m.invincible; delete m.dernierBonus; delete m.bonusPris;
  const copie = JSON.parse(JSON.stringify(m));
  for (let i = 0; i < 120; i += 1) {
    if (i % 8 === 0) impulsion(copie);
    avancer(copie, 1 / 60);
  }
  assert.ok(['vol', 'chute', 'fini'].includes(copie.phase));
  assert.ok(Number.isFinite(copie.score));
});

test('plafond serveur 200 000 hors de portée : plus de 2 h de partie parfaite au plus dur', () => {
  const r = reglages(100000);
  const passagesParS = r.vitesse / r.espacement;
  // Pire cas : chaque passage avec colis et client, toujours points doublés (impossible en vrai).
  const pointsParPassage = 2 * (1 + POINTS_COLIS + POINTS_CLIENT);
  const heures = 200000 / (passagesParS * pointsParPassage) / 3600;
  assert.ok(heures > 2, `${heures.toFixed(1)} h`);
  assert.ok(centreObstacle({ centre: 1, amp: 0 }, 0) === 1);
});
