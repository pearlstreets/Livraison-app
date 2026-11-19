// node --experimental-detect-module --test utils/__tests__/jeuSlalom.test.mjs
/**
 * Mini-jeu « Slalom urbain » (utils/jeux/slalom.js, logique pure) : courbe de
 * difficulté plus raide niveau après niveau, variété des rangées, et parcours
 * toujours faisable (une voie franchissable et tolérante, écart minimal tenu,
 * changement de voie possible à temps), sur plusieurs graines.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// utils/jeux/slalom.js importe AsyncStorage (sauvegarde de partie) : sous
// node, ce module React Native est remplacé par un faux stockage vide.
const FAUX_STOCKAGE = 'export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_STOCKAGE)}) };
  }
  return next(specifier, context);
}`));

const {
  vitessePour, difficulte, pression, niveauPour, creerGenerateur, genererRangee, rangeeSure,
  rangeeFranchissable, toutesRangees, ECART_MIN, VMAX, RATIO_MAX, VITESSE_VOIE, OBSTACLES,
  LONGUEUR_NIVEAU, nouvelleCourse, reprendreCourse, instantaneCourse,
} = await import('../jeux/slalom.js');

const GRAINES = [1, 7, 42, 1234, 99991, 2026111, 31337, 555];
const FIN = 9 * LONGUEUR_NIVEAU; // jusqu'au bout du niveau 9

/** Rangées générées jusqu'à FIN : motif final, vitesse, écart en temps, longueur. */
function rangees(graine) {
  const gen = creerGenerateur(graine);
  const liste = [];
  while (gen.z < FIN) {
    const z = gen.z;
    const reserve = gen.reserve.slice();
    const sortie = [];
    genererRangee(gen, sortie);
    const obs = sortie.filter(o => o.genre === 'obstacle');
    const longueur = obs.reduce((m, o) => Math.max(m, o.z - z + (o.r ? o.longueur / (1 + o.r) : o.longueur)), 0);
    liste.push({ z, reserve, motif: gen.dernier, v: vitessePour(z), espace: gen.z - z, longueur, obs });
  }
  return liste;
}

const parNiveau = GRAINES.map(rangees);

function moyenneNiveau(n, f) {
  const vals = [];
  parNiveau.forEach(l => l.forEach(r => niveauPour(r.z) === n && vals.push(f(r))));
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

// Charge : voies occupées (obstacle ou véhicule en face) par seconde de
// course, pondérée par la vitesse (moins de temps pour réagir).
const charge = r => (r.motif.filter((m, i) => m !== 'libre' || r.reserve[i] > r.z).length / (r.espace / r.v)) * (r.v / VMAX);

test('vitesse, difficulté et pression ne baissent jamais, bornées', () => {
  let av = 0;
  for (let d = 0; d <= 8000; d += 25) {
    assert.ok(vitessePour(d) >= av);
    av = vitessePour(d);
    assert.ok(av <= VMAX);
    assert.ok(difficulte(d) >= difficulte(Math.max(0, d - 25)));
    assert.ok(pression(d) >= pression(Math.max(0, d - 25)));
  }
  assert.equal(difficulte(1300), 1); // motifs de base tous ouverts au niveau 3
  assert.equal(pression(4000), 1); // pression maximale au niveau 9
  assert.equal(niveauPour(0), 1);
  assert.equal(niveauPour(4000), 9);
});

test('chaque niveau est plus chargé que le précédent (1 à 9)', () => {
  const charges = [];
  for (let n = 1; n <= 9; n += 1) charges.push(moyenneNiveau(n, charge));
  for (let n = 1; n < charges.length; n += 1) assert.ok(charges[n] > charges[n - 1], `niveau ${n + 1}`);
  // Le niveau 9 est bien plus dur que le niveau 1.
  assert.ok(charges[8] > 2.5 * charges[0]);
});

test('variété : nouvelles rangées à chaque niveau, peu de répétition', () => {
  const vues = new Set();
  for (let n = 1; n <= 9; n += 1) {
    const ici = new Set();
    parNiveau.forEach(l => l.forEach(r => niveauPour(r.z) === n && ici.add(r.motif.join())));
    const nouvelles = [...ici].filter(k => !vues.has(k));
    if (n >= 2) assert.ok(nouvelles.length > 0, `niveau ${n}`);
    ici.forEach(k => vues.add(k));
  }
  parNiveau.forEach(l => {
    let memes = 0;
    for (let i = 1; i < l.length; i += 1) if (l[i].motif.join() === l[i - 1].motif.join() && l[i].motif.some(m => m !== 'libre')) memes += 1;
    assert.ok(memes / l.length < 0.05);
  });
});

test('chaque rangée prévue garde une voie franchissable et tolérante', () => {
  toutesRangees().forEach(m => {
    assert.equal(rangeeFranchissable(m), true);
    assert.equal(rangeeSure(m), true);
  });
});

GRAINES.forEach(graine => {
  test(`graine ${graine} : écarts, véhicules et changements de voie tenables`, () => {
    const l = rangees(graine);
    let voies = [0, 1, 2]; // voies où le coureur peut être après la rangée d'avant
    let tempsAvant = Infinity;
    l.forEach(r => {
      assert.equal(rangeeFranchissable(r.motif), true);
      assert.equal(rangeeSure(r.motif), true);
      assert.ok(r.espace - r.longueur >= r.v * ECART_MIN - 1e-6);
      r.obs.forEach(o => assert.ok((o.r || 0) <= RATIO_MAX));
      // Voies sûres de la rangée, atteignables à temps depuis la rangée d'avant.
      const sures = [0, 1, 2].filter(v => rangeeSure([r.motif[v]]));
      const atteintes = sures.filter(v => voies.some(a => Math.abs(a - v) / VITESSE_VOIE <= tempsAvant));
      assert.ok(atteintes.length > 0, `z ${r.z}`);
      voies = [0, 1, 2].filter(v => !['camionnette', 'camionnetteMobile'].includes(r.motif[v]));
      tempsAvant = (r.espace - r.longueur) / r.v;
    });
  });
});

test('les obstacles fixes restent ceux du décor existant', () => {
  parNiveau.forEach(l => l.forEach(r => r.obs.forEach(o => assert.ok(OBSTACLES[o.type]))));
});

test('reprise inchangée : même parcours après reprise', () => {
  const e = nouvelleCourse(4242);
  e.d = 2600;
  const c = instantaneCourse(e);
  const a = reprendreCourse(c);
  const b = reprendreCourse(c);
  assert.deepEqual(a.objets.map(o => [o.id, o.type, o.voie, o.z]), b.objets.map(o => [o.id, o.type, o.voie, o.z]));
  assert.equal(a.d, 2600);
});
