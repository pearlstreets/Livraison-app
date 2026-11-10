// node --experimental-detect-module --test utils/__tests__/jeuMemoire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parametresNiveau, creerDonne, creerAlea, melangerCachees, paireAimant, bonusDuNiveau, nombreBonus,
  scoreMaxNiveau, secondesParPaire, dispositionGrille, TYPES_BONUS, BONUS, PAIRES_MAX, secondesCombo,
} from '../jeuMemoire.js';

const NIVEAUX = Array.from({ length: 30 }, (_, i) => i + 1);

test('début inchangé et accessible : niveau 1 = 2 paires en 18 s, sans bonus ni mélange', () => {
  const p = parametresNiveau(1);
  assert.equal(p.paires, 2);
  assert.equal(p.duree, 18);
  assert.equal(p.echanges, 0);
  assert.equal(p.bonus, 0);
});

test('difficulté croissante : jamais plus facile d un niveau au suivant', () => {
  for (let n = 1; n < 30; n += 1) {
    const a = parametresNiveau(n);
    const b = parametresNiveau(n + 1);
    assert.ok(b.paires >= a.paires, `paires ${n}`);
    assert.ok(secondesParPaire(n + 1) <= secondesParPaire(n), `secondes par paire ${n}`);
    assert.ok(b.echanges >= a.echanges, `échanges ${n}`);
    assert.ok(b.variantes >= a.variantes, `variantes ${n}`);
    assert.ok(b.delaiErreur <= a.delaiErreur, `délai ${n}`);
    assert.ok(b.loupe <= a.loupe, `loupe ${n}`);
  }
});

test('pas de mur impossible : au moins 2 s par paire, 15 paires au plus, cartes assez grandes', () => {
  NIVEAUX.forEach((n) => {
    const p = parametresNiveau(n);
    assert.ok(secondesParPaire(n) >= 2, `niveau ${n}`);
    assert.ok(p.paires <= PAIRES_MAX);
    assert.ok(p.echanges <= 5);
    const g = dispositionGrille(p.cartes, 343, 430, 10);
    assert.ok(g.largeur >= 44, `niveau ${n} : cartes de ${g.largeur} px`);
  });
});

test('donne : chaque paire en 2 exemplaires, bonus sur des paires entières, nombre de bonus attendu', () => {
  NIVEAUX.forEach((n) => [1, 7, 42, 999].forEach((g) => {
    const d = creerDonne(n, g * 31 + n);
    const p = parametresNiveau(n);
    assert.equal(d.length, p.cartes);
    const parPaire = new Map();
    d.forEach((c) => parPaire.set(c.paire, [...(parPaire.get(c.paire) || []), c]));
    assert.equal(parPaire.size, p.paires);
    let bonus = 0;
    parPaire.forEach(([a, b]) => {
      assert.equal(a.bonus, b.bonus);
      if (a.bonus) {
        bonus += 1;
        assert.ok(TYPES_BONUS.includes(a.bonus));
        assert.ok(n >= BONUS[a.bonus].des, `${a.bonus} trop tôt au niveau ${n}`);
      }
    });
    assert.equal(bonus, nombreBonus(n));
  }));
});

test('bonus sans doublon tant que possible', () => {
  const t = bonusDuNiveau(12, creerAlea(5));
  assert.equal(new Set(t).size, 3);
  assert.deepEqual(bonusDuNiveau(2, creerAlea(5)), ['loupe']);
});

test('aimant : préfère une paire cachée sans bonus, rien s il ne reste rien', () => {
  const cartes = [
    { id: 0, paire: 0, trouvee: true, bonus: null }, { id: 1, paire: 0, trouvee: true, bonus: null },
    { id: 2, paire: 1, trouvee: false, bonus: 'loupe' }, { id: 3, paire: 1, trouvee: false, bonus: 'loupe' },
    { id: 4, paire: 2, trouvee: false, bonus: null }, { id: 5, paire: 2, trouvee: false, bonus: null },
  ];
  assert.equal(paireAimant(cartes, creerAlea(3)), 2);
  assert.equal(paireAimant(cartes.slice(0, 4), creerAlea(3)), 1);
  assert.equal(paireAimant(cartes.slice(0, 2), creerAlea(3)), null);
});

test('échanges après erreur : les cartes trouvées ne bougent pas, aucune carte perdue', () => {
  const d = creerDonne(17, 77).map((c, i) => (i < 6 ? { ...c, trouvee: true } : c));
  const apres = melangerCachees(d, 'echange', creerAlea(9), 5);
  assert.equal(apres.length, d.length);
  for (let i = 0; i < 6; i += 1) assert.equal(apres[i], d[i]);
  assert.deepEqual(apres.map((c) => c.id).sort((a, b) => a - b), d.map((c) => c.id).sort((a, b) => a - b));
  assert.ok(apres.some((c, i) => c !== d[i]));
});

test('score : sous le plafond serveur (10 000) jusqu au niveau 15 même en partie parfaite', () => {
  let total = 0;
  for (let n = 1; n <= 15; n += 1) total += scoreMaxNiveau(n);
  assert.ok(total < 10000, `total ${total}`);
});

// Joueur à mémoire parfaite (oublie seulement les cartes déplacées), `parCarte` s par carte retournée, sans bonus.
function reussite(n, parCarte, donnes = 150) {
  const p = parametresNiveau(n);
  let ok = 0;
  for (let g = 1; g <= donnes; g += 1) {
    const alea = creerAlea(g * 7 + 3);
    let c = creerDonne(n, g * 13 + n);
    let t = p.duree;
    let combo = 0;
    const vu = new Set();
    let gagne = true;
    while (c.some((x) => !x.trouvee)) {
      const h = c.map((_, i) => i).filter((i) => !c[i].trouvee);
      let a = null;
      let b = null;
      for (const i of h) for (const j of h) if (a == null && i < j && vu.has(i) && vu.has(j) && c[i].paire === c[j].paire) { a = i; b = j; }
      if (a == null) {
        a = h.find((i) => !vu.has(i));
        vu.add(a);
        b = h.find((j) => j !== a && vu.has(j) && c[j].paire === c[a].paire);
        if (b == null) { b = h.find((j) => j !== a && !vu.has(j)); vu.add(b); }
      }
      t -= 2 * parCarte;
      if (t < 0) { gagne = false; break; }
      if (c[a].paire === c[b].paire) {
        const pr = c[a].paire;
        c = c.map((x) => (x.paire === pr ? { ...x, trouvee: true } : x));
        combo += 1;
        t = Math.min(p.duree, t + secondesCombo(combo));
      } else {
        combo = 0;
        t -= p.delaiErreur / 1000;
        const avant = c;
        c = melangerCachees(c, p.melange, alea, p.echanges);
        c.forEach((x, i) => { if (x !== avant[i]) vu.delete(i); });
      }
    }
    if (gagne) ok += 1;
  }
  return ok / donnes;
}

test('pas de mur : joueur à mémoire parfaite, au moins 50 % jusqu au niveau 13, jamais 0 ensuite, baisse progressive', () => {
  for (let n = 1; n <= 13; n += 1) assert.ok(reussite(n, 0.45) >= 0.5, `niveau ${n} : ${reussite(n, 0.45)}`);
  const haut = reussite(19, 0.45);
  assert.ok(haut > 0, `niveau 19 : ${haut}`);
  assert.ok(haut < reussite(10, 0.45), 'plus dur au niveau 19 qu au niveau 10');
  assert.ok(reussite(19, 0.35) >= 0.2, 'niveau 19 encore jouable pour un joueur rapide');
});

test('loupe : au moins 1,3 s (retournement compris) à tous les niveaux', () => {
  NIVEAUX.forEach((n) => assert.ok(parametresNiveau(n).loupe >= 1300, `niveau ${n}`));
});
