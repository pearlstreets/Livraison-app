// node --experimental-detect-module --test utils/__tests__/jeuPile.test.mjs
/**
 * Mini-jeu « Pile de colis » (utils/jeux/pile.js, logique pure reprise
 * d'AppUser) : partie neuve, découpe et pose parfaite, vies, fin de niveau,
 * score, niveaux toujours faisables (vitesse plafonnée, tolérance de pose
 * parfaite jamais sous une image de trajet), sauvegarde abîmée réparée.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// utils/jeux/pile.js importe AsyncStorage et ./commun (qui charge le compte
// livreur) : sous node, faux stockage vide et les deux fonctions utiles.
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
  if (specifier === './commun' && String(context.parentURL || '').endsWith('/utils/jeux/pile.js')) {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_COMMUN)}) };
  }
  return next(specifier, context);
}`));

const {
  LARGEUR, LARGEUR_PLEINE, VIES_PAR_NIVEAU, VITESSE_MAX, VITESSE_MINI, LARGEUR_DEPART_MINI, TEMPS_PARFAIT_MS, MAX_PILE,
  reglagesNiveau, bornesVitesse, vitesseColis, toleranceParfait, pointsPose, xMinColis, courseColis, demiPeriodeMs,
  normaliserP, avancerP, xDeP, pileDeBase, dessus, decouper, partieNeuve, nettoyerSauvegarde, cleSauvegarde,
  poser, niveauSuivant, recommencerNiveau, nouvellePartie,
} = await import('../jeux/pile.js');

/** Hasard rejouable. */
function graine(n) {
  let s = n >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('partie neuve : niveau 1, 3 vies, une base centrée, records gardés', () => {
  const e = partieNeuve({ meilleurScore: 120, meilleurNiveau: 4 });
  assert.equal(e.niveau, 1);
  assert.equal(e.score, 0);
  assert.equal(e.vies, VIES_PAR_NIVEAU);
  assert.equal(e.phase, 'accueil');
  assert.equal(e.pile.length, 1);
  assert.equal(e.pile[0].l, LARGEUR_PLEINE);
  assert.equal(e.pile[0].x, (LARGEUR - LARGEUR_PLEINE) / 2);
  assert.equal(e.colis, null);
  assert.equal(e.meilleurScore, 120);
  assert.equal(e.meilleurNiveau, 4);
  const n = nouvellePartie(e);
  assert.equal(n.phase, 'jeu');
  assert.ok(n.colis && n.colis.l === LARGEUR_PLEINE);
  assert.equal(n.meilleurScore, 120);
});

test('clé de sauvegarde par compte livreur', () => {
  assert.equal(cleSauvegarde(42), 'USER_JEU_PILE_V1_42');
  assert.equal(cleSauvegarde(null), 'USER_JEU_PILE_V1_local');
});

test('découpe : parfait, coupé, raté', () => {
  const dessous = { x: 100, l: 100 };
  const p = decouper(dessous, 102, 100, 3);
  assert.equal(p.issue, 'parfait');
  assert.deepEqual(p.bloc, { x: 100, l: 100 });
  assert.equal(p.tombe.length, 0);
  const c = decouper(dessous, 130, 100, 3);
  assert.equal(c.issue, 'coupe');
  assert.deepEqual(c.bloc, { x: 130, l: 70 });
  assert.deepEqual(c.tombe, [{ x: 200, l: 30 }]);
  const r = decouper(dessous, 250, 100, 3);
  assert.equal(r.issue, 'rate');
  assert.equal(r.bloc, null);
});

test('score : 10 points par niveau et par colis, doublés en pose parfaite', () => {
  assert.equal(pointsPose(1, false), 10);
  assert.equal(pointsPose(3, false), 30);
  assert.equal(pointsPose(3, true), 60);
  const e = nouvellePartie(partieNeuve());
  const x = dessus(e.pile).x;
  const res = poser(e, x, graine(1));
  assert.equal(res.issue, 'parfait');
  assert.equal(res.points, 20);
  assert.equal(res.etat.score, 20);
  assert.equal(res.etat.poses, 1);
  assert.equal(res.etat.hauteur, 2);
  assert.equal(res.etat.meilleurScore, 20);
});

test('colis à côté : une vie en moins, puis perdu à la troisième', () => {
  let e = nouvellePartie(partieNeuve());
  for (let i = 1; i <= VIES_PAR_NIVEAU; i++) {
    const res = poser(e, LARGEUR + 50, graine(i));
    assert.equal(res.issue, 'rate');
    e = res.etat;
    assert.equal(e.vies, VIES_PAR_NIVEAU - i);
  }
  assert.equal(e.phase, 'perdu');
  assert.equal(e.colis, null);
  const r = recommencerNiveau(e);
  assert.equal(r.phase, 'jeu');
  assert.equal(r.vies, VIES_PAR_NIVEAU);
  assert.equal(r.score, e.scoreDebutNiveau);
});

test('niveau fini après le bon nombre de colis, niveau suivant plus dur', () => {
  const h = graine(7);
  let e = nouvellePartie(partieNeuve());
  const total = reglagesNiveau(1).colis;
  for (let i = 0; i < total; i++) e = poser(e, dessus(e.pile).x, h).etat;
  assert.equal(e.phase, 'niveauFini');
  assert.equal(e.score, total * pointsPose(1, true));
  assert.equal(e.meilleurNiveau, 2);
  const s = niveauSuivant(e, h);
  assert.equal(s.niveau, 2);
  assert.equal(s.score, e.score);
  assert.equal(s.scoreDebutNiveau, e.score);
  assert.ok(reglagesNiveau(2).colis > reglagesNiveau(1).colis);
  assert.ok(reglagesNiveau(2).vitesse > reglagesNiveau(1).vitesse);
});

test('niveaux toujours faisables, du niveau 1 au niveau 60', () => {
  for (let n = 1; n <= 60; n++) {
    const r = reglagesNiveau(n);
    assert.ok(r.colis >= 8 && r.colis <= 30, `colis niveau ${n}`);
    assert.ok(r.vitesse <= VITESSE_MAX, `vitesse niveau ${n}`);
    assert.ok(r.largeur >= LARGEUR_DEPART_MINI && r.largeur <= LARGEUR_PLEINE, `largeur niveau ${n}`);
    const b = bornesVitesse(n);
    assert.ok(b.min >= VITESSE_MINI && b.max <= VITESSE_MAX && b.min <= b.max, `bornes niveau ${n}`);
    const h = graine(n);
    for (let poses = 0; poses < r.colis; poses++) {
      const v = vitesseColis(n, poses, h);
      assert.ok(v >= b.min && v <= b.max, `vitesse colis niveau ${n}`);
      // Pose parfaite : jamais moins d'une image (16 ms) de trajet.
      assert.ok(toleranceParfait(n, v) >= (v * TEMPS_PARFAIT_MS) / 1000 - 1e-9);
      assert.ok(toleranceParfait(n, v) >= 3);
    }
    // Base du niveau toujours entièrement sur la piste.
    for (let k = 0; k < 20; k++) {
      const [base] = pileDeBase(n, h);
      assert.ok(base.x >= 0 && base.x + base.l <= LARGEUR + 1e-9, `base niveau ${n}`);
    }
    // Un joueur parfait finit chaque niveau sans perdre de vie.
    let e = { ...partieNeuve(), niveau: n, phase: 'jeu' };
    e = recommencerNiveau({ ...e, scoreDebutNiveau: 0 });
    for (let i = 0; i < r.colis; i++) {
      const res = poser(e, dessus(e.pile).x, h);
      assert.equal(res.issue, 'parfait');
      e = res.etat;
    }
    assert.equal(e.phase, 'niveauFini');
    assert.equal(e.vies, VIES_PAR_NIVEAU);
    assert.ok(e.pile.length <= MAX_PILE);
  }
});

test('trajet : le colis dépasse des bords, aller-retour sur l\'horloge', () => {
  const l = 100;
  assert.equal(xDeP(0, l), xMinColis(l));
  assert.equal(xDeP(1, l), xMinColis(l) + courseColis(l));
  assert.equal(xDeP(2, l), xMinColis(l));
  // Il dépasse des bords aux trois quarts de sa largeur, des deux côtés.
  assert.equal(xMinColis(l), -0.75 * l);
  assert.equal(xMinColis(l) + courseColis(l) + l, LARGEUR + 0.75 * l);
  assert.equal(normaliserP(2.5), 0.5);
  assert.equal(normaliserP(-0.5), 1.5);
  assert.equal(normaliserP(NaN), 0);
  const demi = demiPeriodeMs(1, l);
  assert.ok(demi >= 120);
  assert.ok(Math.abs(avancerP(0, demi / 2, demi) - 0.5) < 1e-9);
});

test('sauvegarde abîmée : réparée, partie en cours remise en pause', () => {
  assert.equal(nettoyerSauvegarde(null).phase, 'accueil');
  assert.equal(nettoyerSauvegarde('texte').phase, 'accueil');
  const e = nettoyerSauvegarde({
    niveau: 3, score: 250, phase: 'jeu', vies: -2, poses: 999,
    pile: [{ x: 'a', l: 40 }], colis: { p: 'b', v: 99999 }, meilleurScore: 10,
  });
  assert.equal(e.niveau, 3);
  assert.equal(e.phase, 'pause');
  assert.equal(e.vies, 1);
  assert.equal(e.poses, reglagesNiveau(3).colis - 1);
  assert.equal(e.pile.length, 1);
  assert.equal(e.colis.p, 0);
  assert.ok(e.colis.v <= VITESSE_MAX);
  assert.equal(e.meilleurScore, 250);
});
