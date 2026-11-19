// node --experimental-detect-module --test utils/__tests__/jeuMemoire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// utils/jeux/memoire.js (logique identique à AppUser) importe AsyncStorage et
// ./commun (records du téléphone) : sous node, AsyncStorage est remplacé par un
// faux stockage vide et ./commun par ses deux fonctions pures utilisées ici.
const FAUX_STOCKAGE = 'export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };';
const FAUX_COMMUN = `
export function cleSauvegardeJeu(jeu, idUser) {
  const suffixe = idUser != null && idUser !== '' ? String(idUser) : 'local';
  return 'USER_JEU_' + String(jeu).toUpperCase() + '_V1_' + suffixe;
}
export function entierJeu(x, min = 0) {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n >= min ? n : min;
}`;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_STOCKAGE)}) };
  }
  if (specifier === './commun' && String(context.parentURL || '').endsWith('/utils/jeux/memoire.js')) {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_COMMUN)}) };
  }
  return next(specifier, context);
}`));

const {
  parametresNiveau, creerDonne, creerAlea, melangerCachees, paireAimant, bonusDuNiveau, nombreBonus,
  scoreMaxNiveau, secondesParPaire, dispositionGrille, TYPES_BONUS, BONUS, PAIRES_MAX, secondesCombo,
  motifsNiveau, PIEGES, MOTIFS, SCORE_MAX_SERVEUR, cleSauvegarde, nettoyerRecords, majRecords,
} = await import('../jeux/memoire.js');

const NIVEAUX = Array.from({ length: 30 }, (_, i) => i + 1);

test('début court mais déjà pas trivial : niveau 1 = 3 paires en 16 s, sans bonus ni mélange', () => {
  const p = parametresNiveau(1);
  assert.equal(p.paires, 3);
  assert.equal(p.duree, 16);
  assert.equal(p.echanges, 0);
  assert.equal(p.bonus, 0);
  assert.equal(p.piege, 'distincts');
});

test('difficulté croissante : jamais plus facile d un niveau au suivant', () => {
  for (let n = 1; n < 30; n += 1) {
    const a = parametresNiveau(n);
    const b = parametresNiveau(n + 1);
    assert.ok(b.paires >= a.paires, `paires ${n}`);
    assert.ok(secondesParPaire(n + 1) <= secondesParPaire(n), `secondes par paire ${n}`);
    assert.ok(b.echanges >= a.echanges, `échanges ${n}`);
    assert.ok(b.delaiErreur <= a.delaiErreur, `délai ${n}`);
    assert.ok(b.loupe <= a.loupe, `loupe ${n}`);
    // Plus dur : plus de cartes ou moins de secondes par paire, jusqu au plafond.
    if (n < 13) {
      assert.ok(
        b.paires > a.paires || secondesParPaire(n + 1) < secondesParPaire(n),
        `niveau ${n + 1} pas plus dur que ${n}`,
      );
    }
  }
});

test('courbe raide : 15 paires dès le niveau 6, 18 dès le 8, chrono serré', () => {
  assert.equal(parametresNiveau(6).paires, 15);
  assert.equal(parametresNiveau(8).paires, 18);
  assert.ok(secondesParPaire(4) <= 3);
  assert.ok(secondesParPaire(9) <= 2.1);
  assert.equal(parametresNiveau(6).delaiErreur, 400);
});

test('variété : un piège dès le niveau 3, jamais le même deux niveaux de suite', () => {
  for (let n = 3; n <= 60; n += 1) {
    const a = parametresNiveau(n);
    assert.notEqual(a.piege, 'distincts', `niveau ${n}`);
    assert.ok(PIEGES.includes(a.piege));
    if (n > 3) assert.notEqual(a.piege, parametresNiveau(n - 1).piege, `niveau ${n}`);
  }
  const vus = new Set(NIVEAUX.map((n) => parametresNiveau(n).piege));
  assert.equal(vus.size, 4);
});

test('motifs : jamais deux paires identiques à l oeil, piège respecté, sur plusieurs graines', () => {
  NIVEAUX.forEach((n) => [1, 7, 42, 999, 31337].forEach((g) => {
    const p = parametresNiveau(n);
    const m = motifsNiveau(n, creerAlea(g * 17 + n));
    assert.equal(m.length, p.paires);
    const cles = new Set(m.map((x) => `${x.icone}|${x.couleur}`));
    assert.equal(cles.size, p.paires, `doublon niveau ${n} graine ${g}`);
    const icones = new Set(m.map((x) => x.icone));
    const couleurs = new Set(m.map((x) => x.couleur));
    if (p.piege === 'distincts') assert.equal(icones.size, p.paires);
    if (p.piege === 'sosies') assert.ok(icones.size < p.paires);
    if (p.piege === 'teintes') {
      assert.equal(icones.size, p.paires);
      assert.ok(couleurs.size <= p.variantes);
    }
    if (p.piege === 'mixte') {
      assert.ok(icones.size < p.paires);
      assert.ok(couleurs.size <= p.variantes);
    }
  }));
});

test('donnes variées : deux graines donnent rarement les mêmes motifs', () => {
  [3, 8, 15].forEach((n) => {
    const vues = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((g) => motifsNiveau(n, creerAlea(g))
      .map((x) => `${x.icone}|${x.couleur}`).sort().join(',')));
    assert.ok(vues.size >= 6, `niveau ${n} : ${vues.size} donnes différentes sur 8`);
  });
});

test('pas de mur impossible : au moins 2 s par paire, 18 paires au plus, cartes assez grandes', () => {
  NIVEAUX.forEach((n) => {
    const p = parametresNiveau(n);
    assert.ok(secondesParPaire(n) >= 2, `niveau ${n}`);
    assert.ok(p.paires <= PAIRES_MAX);
    assert.ok(p.paires <= MOTIFS.length);
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
  assert.equal(new Set(t).size, 2);
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

test('les cartes ne changent jamais de place (comme AppUser, depuis le 15/11/2026)', () => {
  for (let n = 1; n <= 60; n += 1) {
    const p = parametresNiveau(n);
    assert.equal(p.melange, 'aucun', `niveau ${n}`);
    assert.equal(p.echanges, 0, `niveau ${n}`);
  }
});

test('mélange des cartes cachées (fonction gardée) : les cartes trouvées ne bougent pas, aucune carte perdue', () => {
  const d = creerDonne(17, 77).map((c, i) => (i < 6 ? { ...c, trouvee: true } : c));
  const apres = melangerCachees(d, 'echange', creerAlea(9), 5);
  assert.equal(apres.length, d.length);
  for (let i = 0; i < 6; i += 1) assert.equal(apres[i], d[i]);
  assert.deepEqual(apres.map((c) => c.id).sort((a, b) => a - b), d.map((c) => c.id).sort((a, b) => a - b));
  assert.ok(apres.some((c, i) => c !== d[i]));
});

test('score : sous le plafond serveur (50 000) jusqu au niveau 13 même en partie parfaite', () => {
  let total = 0;
  for (let n = 1; n <= 13; n += 1) total += scoreMaxNiveau(n);
  assert.ok(total < SCORE_MAX_SERVEUR, `total ${total}`);
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

test('toujours faisable : joueur rapide à mémoire parfaite, au moins 50 % à chaque niveau jusqu au 30', () => {
  for (let n = 1; n <= 30; n += 1) {
    const r = reussite(n, 0.45, 100);
    assert.ok(r >= 0.5, `niveau ${n} : ${r}`);
  }
});

test('plus serré : tout le monde passe le niveau 1, un joueur moyen (0,85 s par carte) cale vers 8 à 10, un lent (1 s) dès le 8', () => {
  assert.ok(reussite(1, 1) === 1, 'niveau 1 pour tous');
  assert.ok(reussite(4, 0.7, 100) >= 0.8, 'niveau 4 à 0,7 s');
  const moyen = reussite(10, 0.85, 100);
  assert.ok(moyen > 0.1 && moyen < 0.7, `niveau 10 à 0,85 s : ${moyen}`);
  const lent = reussite(8, 1, 100);
  assert.ok(lent < 0.3, `niveau 8 à 1 s : ${lent}`);
});

test('loupe : au moins 1,3 s (retournement compris) à tous les niveaux', () => {
  NIVEAUX.forEach((n) => assert.ok(parametresNiveau(n).loupe >= 1300, `niveau ${n}`));
});

test('records du téléphone : clé par compte, valeurs abîmées remplacées, plafond serveur livreur (50 000)', () => {
  assert.equal(SCORE_MAX_SERVEUR, 50000);
  assert.equal(cleSauvegarde(12), 'USER_JEU_MEMOIRE_V1_12');
  assert.equal(cleSauvegarde(null), 'USER_JEU_MEMOIRE_V1_local');
  assert.deepEqual(nettoyerRecords(null), { meilleurScore: 0, meilleurNiveau: 1 });
  assert.deepEqual(nettoyerRecords({ meilleurScore: 'x', meilleurNiveau: -3 }), { meilleurScore: 0, meilleurNiveau: 1 });
  assert.deepEqual(majRecords({ meilleurScore: 500, meilleurNiveau: 4 }, 300, 6), { meilleurScore: 500, meilleurNiveau: 6 });
  assert.deepEqual(majRecords(null, 99999, 2), { meilleurScore: SCORE_MAX_SERVEUR, meilleurNiveau: 2 });
});
