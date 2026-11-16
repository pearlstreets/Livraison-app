// node --experimental-detect-module --test utils/__tests__/jeuCoupe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIES, BONUS, SCORE_MAX, DUREE_RALENTI, DUREE_DOUBLE, VAGUE_PREMIER_BONUS,
  DUREE_VOL_MIN, ECART_ESCORTE, MOTIFS, choisirMotif, nouvelleVague,
  reglagesVague, probaBonus, bonusPossibles, creerMonde, avancer, lame, lancer,
  etatSauvegarde, mondeRepris, estBonus,
} from '../jeuCoupe.js';

// Joueur parfait : tranche chaque fruit, cœur et bonus quand il redescend, évite les colis.
function partieParfaite(secondes, graine = 42, reprise = null, largeur = 500) {
  const m = reprise ? mondeRepris(largeur, reprise, graine) : creerMonde(largeur, graine);
  const vus = new Set();
  let ev = [];
  const pas = 1 / 60;
  const vagueA = {};
  for (let i = 0; i < secondes * 60 && m.phase === 'jeu'; i += 1) {
    ev = ev.concat(avancer(m, pas).filter((e) => e.type === 'bonus' || e.type === 'finBonus'));
    for (const o of [...m.objets]) {
      if (o.type !== 'fragile' && o.y < 950 && !vus.has(o.id)) {
        // Petit coup de lame vertical sur l'objet, loin des colis.
        const proche = m.objets.some((f) => f.type === 'fragile' && Math.hypot(f.x - o.x, f.y - o.y) < 56);
        if (!proche) {
          vus.add(o.id);
          ev = ev.concat(lame(m, o.x, o.y - 3, o.x, o.y + 3));
        }
      }
    }
    const s = Math.round(i / 60);
    if (vagueA[s] == null) vagueA[s] = m.vague;
  }
  return { m, ev, vagueA };
}

test('début court mais pas trivial : 3 fruits à la vague 1 sans colis, colis dès la vague 2, aucun bonus avant la vague 4', () => {
  const r1 = reglagesVague(1);
  assert.equal(r1.fruits, 3);
  assert.equal(r1.probaFragile, 0);
  assert.deepEqual(r1.motifs, ['pluie']);
  assert.ok(r1.duree >= 2.2 && r1.duree <= 2.4);
  assert.ok(reglagesVague(2).probaFragile > 0);
  for (const n of [1, 2, 3]) assert.equal(probaBonus(n), 0);
});

test('chaque vague plus dure que la précédente, plafond relevé, toujours faisable', () => {
  let avant = reglagesVague(1);
  for (let n = 2; n <= 200; n += 1) {
    const r = reglagesVague(n);
    assert.ok(r.duree <= avant.duree + 1e-9, `durée vague ${n}`);
    assert.ok(r.fruits >= avant.fruits);
    assert.ok(r.probaFragile >= avant.probaFragile);
    assert.ok(r.maxFragiles >= avant.maxFragiles);
    assert.ok(r.pause <= avant.pause && r.etalement <= avant.etalement);
    assert.ok(r.motifs.length >= avant.motifs.length);
    assert.ok(r.rapide >= avant.rapide);
    // Au moins un des réglages devient strictement plus dur jusqu'à la vague 40.
    if (n <= 40) {
      assert.ok(
        r.duree < avant.duree || r.fruits > avant.fruits || r.probaFragile > avant.probaFragile,
        `vague ${n} pas plus dure`,
      );
    }
    assert.ok(r.duree >= 1.39, `vol trop court vague ${n}`);
    assert.ok(r.fruits <= 10 && r.maxFragiles <= 5 && r.probaFragile < 1);
    avant = r;
  }
  // Courbe raide : dur dès les vagues 4 à 8.
  assert.ok(reglagesVague(4).fruits >= 6 && reglagesVague(4).maxFragiles >= 1);
  assert.ok(reglagesVague(8).duree <= 1.76 && reglagesVague(8).fruits >= 8);
  assert.ok(reglagesVague(8).probaFragile >= 0.8);
  assert.ok(reglagesVague(40).duree < reglagesVague(20).duree);
  assert.ok(reglagesVague(14).fruits === 10 && reglagesVague(14).maxFragiles === 5);
});

test('motifs : nouveau imposé à son apparition, jamais deux fois de suite, tous vus', () => {
  for (const x of MOTIFS) {
    const m = creerMonde(500, 1);
    m.motif = x.nom === 'pluie' ? null : 'pluie';
    assert.equal(choisirMotif(m, x.des), x.nom);
  }
  for (const graine of [1, 7, 42, 1234, 99999]) {
    const m = creerMonde(420, graine);
    const vus = new Set();
    let precedent = null;
    for (let i = 0; i < 120; i += 1) {
      m.objets = [];
      nouvelleVague(m, []);
      if (m.vague > 1) assert.ok(m.motif !== precedent, `motif répété vague ${m.vague}`);
      precedent = m.motif;
      vus.add(m.motif);
      // File triée, bon nombre de fruits.
      for (let k = 1; k < m.file.length; k += 1) assert.ok(m.file[k].delai >= m.file[k - 1].delai);
      const r = reglagesVague(m.vague);
      assert.equal(m.file.filter((d) => d.type === 'fruit').length, r.fruits);
      assert.ok(m.file.filter((d) => d.type === 'fragile').length <= r.maxFragiles);
    }
    MOTIFS.forEach((x) => assert.ok(vus.has(x.nom), `motif ${x.nom} jamais vu`));
  }
});

test('aucun vol sous DUREE_VOL_MIN et escorte toujours hors de portée de la lame', () => {
  const portee = 62 * 1.12 + 56 * 0.8; // fruit + colis, marges de la lame
  for (const largeur of [300, 420, 600]) {
    for (const graine of [3, 11, 77, 2024]) {
      const m = creerMonde(largeur, graine);
      m.vague = 150;
      for (let i = 0; i < 40; i += 1) {
        m.objets = [];
        nouvelleVague(m, []);
        const file = m.file.slice();
        const lances = file.map((d) => lancer(m, d.type, d));
        lances.forEach((o) => {
          const vol = (2 * -o.vy) / o.g;
          assert.ok(vol >= DUREE_VOL_MIN - 1e-9, `vol ${vol}`);
        });
        if (m.motif === 'escorte') {
          file.forEach((d, k) => {
            if (d.type !== 'fragile') return;
            const f = lances[k];
            const fruit = lances.find((o, j) => (
              file[j].type === 'fruit' && file[j].delai === d.delai && file[j].sommet === d.sommet
            ));
            assert.ok(fruit, 'colis sans son fruit');
            const ecart = Math.abs(fruit.x - f.x);
            assert.ok(ecart > portee + 20, `escorte trop proche ${ecart}`);
            assert.ok(ecart <= ECART_ESCORTE + 1e-9);
            assert.ok(Math.abs(fruit.vx - f.vx) < 1e-9 && Math.abs(fruit.vy - f.vy) < 1e-9);
          });
        }
        m.objets = [];
      }
    }
  }
});

test('niveaux élevés faisables : un joueur parfait ne perd aucune vie, plusieurs graines', () => {
  for (const vague of [20, 60, 150]) {
    for (const graine of [5, 21, 314]) {
      const { m } = partieParfaite(90, graine, { vague, vies: 3, score: 0 }, 360);
      assert.equal(m.phase, 'jeu');
      assert.equal(m.rates, 0, `fruit perdu vague ${m.vague} graine ${graine}`);
      assert.ok(m.vague > vague + 15);
    }
  }
});

test('bonus : proposés dès la vague 4, jamais celui déjà actif', () => {
  assert.equal(probaBonus(VAGUE_PREMIER_BONUS - 1), 0);
  assert.ok(probaBonus(VAGUE_PREMIER_BONUS) > 0.2);
  const m = creerMonde(500, 1);
  assert.deepEqual(bonusPossibles(m), BONUS);
  m.bouclier = true;
  m.ralenti = 2;
  assert.deepEqual(bonusPossibles(m), ['etoile']);
});

test('glaçon : tout ralentit de moitié, puis s\'arrête', () => {
  const m = creerMonde(500, 3);
  m.vague = 10;
  const o = lancer(m, 'glacon');
  const ev = lame(m, o.x - 5, o.y, o.x + 5, o.y);
  assert.ok(ev.some((e) => e.type === 'bonus' && e.sorte === 'glacon'));
  assert.equal(m.ralenti, DUREE_RALENTI);
  const f = lancer(m, 'fruit');
  const y0 = f.y;
  avancer(m, 1 / 60);
  const lentDy = y0 - f.y;
  const m2 = creerMonde(500, 3);
  m2.vague = 10;
  m2.attente = 99;
  const f2 = lancer(m2, 'fruit');
  Object.assign(f2, { x: f.x, y: y0, vx: f.vx, vy: f.vy - f.g / 120, g: f.g });
  avancer(m2, 1 / 60);
  assert.ok(Math.abs(lentDy - (y0 - f2.y) / 2) < 1, 'moitié de vitesse');
  let fin = false;
  for (let i = 0; i < DUREE_RALENTI * 60 + 5; i += 1) if (avancer(m, 1 / 60).some((e) => e.type === 'finBonus')) fin = true;
  assert.ok(fin);
  assert.equal(m.ralenti, 0);
});

test('étoile : fruits à 2 points, combos inchangés', () => {
  const m = creerMonde(500, 5);
  m.vague = 10;
  const e = lancer(m, 'etoile');
  lame(m, e.x - 5, e.y, e.x + 5, e.y);
  assert.equal(m.double, DUREE_DOUBLE);
  const f = lancer(m, 'fruit');
  const ev = lame(m, f.x - 5, f.y, f.x + 5, f.y);
  assert.equal(ev.find((x) => x.type === 'tranche').points, 2);
  assert.equal(m.score, 2);
});

test('bouclier : un colis fragile pardonné, le suivant arrête la partie', () => {
  const m = creerMonde(500, 7);
  m.vague = 10;
  const b = lancer(m, 'bouclier');
  lame(m, b.x - 5, b.y, b.x + 5, b.y);
  assert.equal(m.bouclier, true);
  const c = lancer(m, 'fragile');
  const ev = lame(m, c.x - 5, c.y, c.x + 5, c.y);
  assert.ok(ev.some((e) => e.type === 'protege'));
  assert.equal(m.phase, 'jeu');
  assert.equal(m.bouclier, false);
  assert.ok(!m.objets.some((o) => o.id === c.id));
  const c2 = lancer(m, 'fragile');
  lame(m, c2.x - 5, c2.y, c2.x + 5, c2.y);
  assert.equal(m.phase, 'casse');
});

test('bonus raté : ne coûte rien', () => {
  const m = creerMonde(500, 9);
  m.vague = 10;
  m.attente = 999;
  for (const b of BONUS) lancer(m, b);
  for (let i = 0; i < 600; i += 1) avancer(m, 1 / 60);
  assert.equal(m.vies, VIES);
  assert.equal(m.objets.length, 0);
});

test('sauvegarde et reprise gardent les bonus actifs, bornés', () => {
  const m = creerMonde(500, 11);
  m.vague = 12;
  m.score = 321;
  m.vies = 2;
  m.bouclier = true;
  m.ralenti = 2.5;
  m.double = 4;
  const e = JSON.parse(JSON.stringify(etatSauvegarde(m)));
  const r = mondeRepris(500, e, 1);
  assert.equal(r.score, 321);
  assert.equal(r.vies, 2);
  assert.equal(r.bouclier, true);
  assert.equal(r.ralenti, 2.5);
  assert.equal(r.double, 4);
  const faux = mondeRepris(500, { vague: 3, score: 9e9, vies: 3, ralenti: 99, double: 99, bouclier: 'oui' }, 1);
  assert.equal(faux.score, SCORE_MAX);
  assert.equal(faux.ralenti, DUREE_RALENTI);
  assert.equal(faux.double, DUREE_DOUBLE);
  assert.equal(faux.bouclier, false);
  // Ancienne sauvegarde (avant les bonus) : rien d'actif.
  const ancien = mondeRepris(500, { vague: 5, score: 10, vies: 3 }, 1);
  assert.equal(ancien.bouclier, false);
  assert.equal(ancien.ralenti, 0);
  assert.equal(ancien.double, 0);
});

test('partie parfaite de 10 min : bonus tranchés, score très loin du plafond serveur', () => {
  const { m, ev, vagueA } = partieParfaite(600);
  assert.equal(m.phase, 'jeu');
  const sortes = new Set(ev.filter((e) => e.type === 'bonus').map((e) => e.sorte));
  BONUS.forEach((b) => assert.ok(sortes.has(b), `bonus ${b} jamais vu`));
  assert.ok(m.score < SCORE_MAX / 5, `score ${m.score}`);
  assert.ok(vagueA[60] >= 12 && vagueA[60] <= 30, `vague à 1 min : ${vagueA[60]}`);
  console.log(`vague à 1 min ${vagueA[60]}, 3 min ${vagueA[180]}, 10 min ${vagueA[600] ?? m.vague}, score 10 min ${m.score}, bonus ${m.bonus}`);
});

test('score jamais au-delà du plafond serveur', () => {
  const m = creerMonde(500, 13);
  m.vague = 10;
  m.score = SCORE_MAX - 1;
  m.double = 5;
  for (let i = 0; i < 3; i += 1) {
    const f = lancer(m, 'fruit');
    lame(m, f.x - 5, f.y, f.x + 5, f.y);
  }
  assert.equal(m.score, SCORE_MAX);
  assert.ok(estBonus('glacon') && !estBonus('coeur'));
});
