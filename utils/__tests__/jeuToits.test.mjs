// node --experimental-detect-module --test utils/__tests__/jeuToits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAUT_MESURE, ECART_MAX, MONTEE_MAX, LARGEUR, VIES, PALIER_PIECES, DISTANCE_SURE, BORD_SUR,
  DEGAGEMENT_ATTERRISSAGE, genererNiveau, creerMonde, pas, etatsEntree, etatsSortie, hautDe,
  peutSauter, simulerSaut, MARGE_SAUT, pointDeReprise, reapparaitre, zoneGeneur, reglagesNiveau,
} from '../jeuToits.js';

const NIVEAUX = Array.from({ length: 15 }, (_, i) => i + 1);
const GRAINES = [1, 7, 42, 999, 31337, 123456];

function chaqueNiveau(fn) {
  NIVEAUX.forEach((n) => GRAINES.forEach((g) => fn(genererNiveau(n, g * 97 + n), n, g)));
}

test('saut mesuré avec la physique du jeu, bornes avec marge', () => {
  assert.ok(SAUT_MESURE.portee > 100 && SAUT_MESURE.portee < 200, `portée ${SAUT_MESURE.portee}`);
  assert.ok(SAUT_MESURE.hauteur > 100 && SAUT_MESURE.hauteur < 200, `hauteur ${SAUT_MESURE.hauteur}`);
  assert.ok(ECART_MAX <= SAUT_MESURE.portee * 0.75);
  assert.ok(MONTEE_MAX <= SAUT_MESURE.hauteur * 0.65);
});

test('chaque saut obligatoire est sous les bornes et faisable, même déclenché tôt', () => {
  chaqueNiveau((niv, n, g) => {
    const P = niv.plateformes;
    for (let i = 0; i + 1 < P.length; i += 1) {
      etatsSortie(P[i]).forEach((a) => etatsEntree(P[i + 1]).forEach((b) => {
        const ecart = b.x - (a.x + a.w);
        const dy = b.y - hautDe(a);
        const ctx = `niveau ${n} graine ${g} plateforme ${i}`;
        assert.ok(ecart <= ECART_MAX + 0.5, `${ctx} : trou ${ecart}`);
        assert.ok(Math.abs(dy) <= MONTEE_MAX + 0.5, `${ctx} : marche ${dy}`);
        assert.ok(peutSauter(a, b), `${ctx} : saut impossible`);
        assert.ok(simulerSaut(a, b, MARGE_SAUT, null, niv.boites), `${ctx} : saut gêné par une boîte`);
      }));
    }
  });
});

test('entre deux colonnes fixes, on peut toujours revenir en arrière', () => {
  const fixe = (p) => !p.flottante && !p.mobile;
  chaqueNiveau((niv, n, g) => {
    const P = niv.plateformes;
    for (let i = 0; i + 1 < P.length; i += 1) {
      const a = P[i];
      const b = P[i + 1];
      if (!fixe(a) || !fixe(b)) continue;
      const mir = (p) => ({ ...p, x: -(p.x + p.w) });
      assert.ok(peutSauter(mir(b), mir(a)), `niveau ${n} graine ${g} : retour impossible ${i + 1} vers ${i}`);
    }
  });
});

test('aucun gêneur à l\'atterrissage ni sur le départ, difficulté progressive', () => {
  chaqueNiveau((niv, n, g) => {
    niv.geneurs.forEach((e) => {
      const p = niv.plateformes.find((q) => !q.flottante && e.y >= q.y - 0.5 && e.x >= q.x && e.x <= q.x + q.w);
      assert.ok(p, `niveau ${n} graine ${g} : gêneur hors toit`);
      assert.ok(p.id !== 0 && !p.fragile && !p.arrivee, `niveau ${n} graine ${g} : gêneur mal placé`);
      const [debut] = zoneGeneur(e);
      assert.ok(debut >= p.x + DEGAGEMENT_ATTERRISSAGE - 0.5, `niveau ${n} graine ${g} : gêneur à l'atterrissage`);
    });
  });
  const r1 = reglagesNiveau(1);
  const r10 = reglagesNiveau(10);
  assert.ok(r1.ratioMax < r10.ratioMax && r1.longueur < r10.longueur && r1.probGeneur < r10.probGeneur);
  assert.deepEqual(r1.types, ['chien']);
});

test('point de reprise sûr pour toute position de chute', () => {
  NIVEAUX.forEach((n) => GRAINES.slice(0, 3).forEach((g) => {
    const m = creerMonde(n, {}, g * 97 + n);
    const solides = m.plateformes.filter((p) => !p.flottante && !p.mobile && !p.fragile && p.type !== 'benne');
    for (let x = 0; x < m.longueur; x += 60) {
      m.dernierSol = solides.filter((p) => p.x <= x).pop() || solides[0];
      const { p, x: rx } = pointDeReprise(m, x);
      const ctx = `niveau ${n} graine ${g} x ${x}`;
      assert.ok(!p.flottante && !p.mobile && !p.fragile, `${ctx} : sol non sûr`);
      if (p.id !== 0) {
        assert.ok(rx >= p.x + BORD_SUR - 0.5 && rx + LARGEUR <= p.x + p.w - BORD_SUR + 0.5, `${ctx} : trop près du bord`);
      }
      assert.ok(rx <= x, `${ctx} : reprise en avant`);
      m.geneurs.forEach((e) => {
        const [a, b] = zoneGeneur(e);
        assert.ok(rx + LARGEUR <= a - DISTANCE_SURE + 0.5 || rx >= b + DISTANCE_SURE - 0.5, `${ctx} : gêneur trop près`);
      });
    }
  }));
});

test('après une chute : immobile sans geste, aucune vie perdue en chaîne, puis invincible', () => {
  NIVEAUX.slice(0, 8).forEach((n) => {
    const m = creerMonde(n, {}, 5000 + n);
    // Chute forcée en plein niveau.
    m.joueur.x = m.longueur * 0.5;
    m.joueur.y = -200;
    const cmd = { droite: true, gauche: false, sautTenu: false, sautAppui: false, bas: false, geste: false };
    const ev = pas(m, 1 / 60, cmd);
    assert.ok(ev.some((e) => e.type === 'chute'));
    assert.equal(m.vies, VIES - 1);
    const x0 = m.joueur.x;
    // Droite encore tenue mais aucun geste neuf : le livreur ne bouge pas.
    for (let k = 0; k < 60 * 6; k += 1) pas(m, 1 / 60, cmd);
    assert.equal(m.vies, VIES - 1, `niveau ${n} : vie perdue pendant l'attente`);
    assert.ok(Math.abs(m.joueur.x - x0) < 0.01, `niveau ${n} : le livreur a bougé seul`);
    assert.ok(m.attente);
    // Un geste le relance, invincible environ 2 s.
    pas(m, 1 / 60, { ...cmd, geste: true });
    assert.ok(!m.attente && m.invul > 1.5);
  });
});

test('coup reçu en grand livreur : il perd sa taille, pas une vie', () => {
  const m = creerMonde(3, {}, 77);
  m.grand = true;
  const e = { type: 'chien', x: m.joueur.x, y: m.joueur.y, x1: m.joueur.x, x2: m.joueur.x, vx: 0, w: 26, h: 20, dir: -1, actif: true, ecarte: 0, temps: 0, id: 99 };
  m.geneurs.push(e);
  const ev = pas(m, 1 / 60, { droite: false, gauche: false, geste: false });
  assert.ok(ev.some((x) => x.type === 'encaisse'));
  assert.equal(m.vies, VIES);
  assert.equal(m.grand, false);
  assert.ok(m.invul > 1.5);
});

test('reprise : jamais sur un chien, même mort juste à côté', () => {
  const m = creerMonde(6, {}, 4242);
  const avecChien = m.geneurs.find((e) => e.type !== 'pigeon');
  if (!avecChien) return;
  const p = m.plateformes.find((q) => !q.flottante && avecChien.x >= q.x && avecChien.x <= q.x + q.w);
  m.dernierSol = p;
  reapparaitre(m, avecChien.x + 5);
  const [a, b] = zoneGeneur(avecChien);
  assert.ok(m.joueur.x + LARGEUR <= a - DISTANCE_SURE + 0.5 || m.joueur.x >= b + DISTANCE_SURE - 0.5);
});

test('tous les 10 colis : une vie s\'il en manque, sinon un aimant', () => {
  const m = creerMonde(1, { vies: 2 }, 1);
  const colis = Array.from({ length: PALIER_PIECES }, (_, k) => ({ id: 1000 + k, x: m.joueur.x, y: m.joueur.y + 4, pris: false }));
  m.colis.push(...colis);
  pas(m, 1 / 60, {});
  assert.equal(m.pieces, PALIER_PIECES);
  assert.equal(m.vies, 3);
  assert.equal(m.annonce.cle, 'jeuxToitsBonusVie');
  m.colis.push(...colis.map((c) => ({ ...c, id: c.id + 100, pris: false })));
  pas(m, 1 / 60, {});
  assert.ok(m.aimant > 0);
  assert.equal(m.annonce.cle, 'jeuxToitsBonusAimant');
});

test('caisse bonus frappée par-dessous : amélioration donnée et annoncée', () => {
  const m = creerMonde(1, {}, 3);
  const caisse = m.boites.find((b) => b.bonus);
  assert.ok(caisse, 'caisse bonus sur le départ');
  m.joueur.x = caisse.x;
  m.joueur.y = caisse.y - 32;
  m.joueur.vy = 300;
  m.joueur.sol = null;
  const ev = [];
  for (let k = 0; k < 10 && !caisse.frappee; k += 1) ev.push(...pas(m, 1 / 60, {}));
  assert.ok(caisse.frappee);
  assert.ok(ev.some((e) => e.type === 'bonus'));
  assert.ok(m.annonce && m.annonce.cle.startsWith('jeuxToits'));
});

test('score d\'un niveau loin du plafond serveur (2 000 000)', () => {
  const m = creerMonde(15, {}, 9);
  const max = m.colis.length * 10 + m.boites.length * 100 + m.geneurs.length * 150 + 500 + m.limite * 20;
  assert.ok(max < 20000, `max ${max}`);
});
