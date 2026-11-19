// node --experimental-detect-module --test utils/__tests__/jeuDrone.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// utils/jeux/drone.js importe AsyncStorage (records) et ./commun (compte,
// couleurs, contextes React) : sous node, ces deux modules sont remplacés
// par un faux stockage vide et les deux petites fonctions pures utilisées.
const FAUX_STOCKAGE = 'export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };';
const FAUX_COMMUN = [
  'export function cleSauvegardeJeu(jeu, idUser) { const s = idUser != null && idUser !== "" ? String(idUser) : "local"; return "USER_JEU_" + String(jeu).toUpperCase() + "_V1_" + s; }',
  'export function entierJeu(x, min = 0) { const n = Math.floor(Number(x)); return Number.isFinite(n) && n >= min ? n : min; }',
].join('\n');
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_STOCKAGE)}) };
  }
  if (specifier === './commun' && String(context.parentURL || '').endsWith('/utils/jeux/drone.js')) {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_COMMUN)}) };
  }
  return next(specifier, context);
}`));

const {
  HAUTEUR, SOL, DRONE_DX, DRONE_DY, LARGEUR_OBSTACLE, MARGE, POINTS_COLIS, POINTS_CLIENT, IMPULSION,
  DUREE_AIMANT, DUREE_DOUBLE, BONUS_RANG_MIN, BONUS_ECART, BONUS, PALIER, MOTIFS,
  reglages, ecartAtteignable, bornesCentre, creerMonde, avancer, impulsion, nouvelObstacle, centreObstacle, bonusActifs, multiplicateur,
} = await import('../jeux/drone.js');

const GRAINES = [1, 7, 42, 999, 31337, 123456];

test('difficulté croissante et bornée, plus dure dès le début', () => {
  let avant = reglages(0);
  assert.equal(avant.vitesse, 370);
  assert.equal(avant.ecart, 225);
  assert.equal(avant.probaMouvement, 0);
  assert.ok(reglages(2).probaMouvement > 0, 'obstacles mobiles dès le 2e passage');
  for (let p = 1; p <= 800; p += 1) {
    const r = reglages(p);
    assert.ok(r.vitesse >= avant.vitesse, `vitesse ${p}`);
    assert.ok(r.ecart <= avant.ecart, `écart ${p}`);
    assert.ok(r.espacement <= avant.espacement, `espacement ${p}`);
    assert.ok(r.amplitude >= avant.amplitude, `amplitude ${p}`);
    assert.ok(r.probaMouvement >= avant.probaMouvement, `mobiles ${p}`);
    assert.ok(r.franc >= avant.franc, `franc ${p}`);
    avant = r;
  }
  assert.ok(reglages(130).probaMouvement < reglages(230).probaMouvement, 'plafond relevé après le niveau 12');
  const fin = reglages(10000);
  assert.deepEqual(fin, reglages(240));
  assert.ok(fin.vitesse <= 590 && fin.ecart >= 175 && fin.espacement >= 380, 'plafonds');
  assert.ok(fin.ecart >= 4 * DRONE_DY, 'passage toujours plus de 4 fois la hauteur du drone');
});

// Indice de difficulté d'un niveau (1 au départ) : vitesse, passage plus étroit,
// immeubles plus serrés, obstacles mobiles plus fréquents et plus amples.
function durete(niveau) {
  const r = reglages((niveau - 1) * PALIER);
  return r.vitesse / 370 + 225 / r.ecart + 460 / r.espacement + r.probaMouvement + r.amplitude / 46;
}

test('chaque niveau plus dur que le précédent, niveau 9 déjà proche du plus dur', () => {
  for (let n = 1; n < 25; n += 1) assert.ok(durete(n + 1) > durete(n), `niveau ${n + 1}`);
  assert.equal(durete(26), durete(25));
  // Niveau 9 (80 passages) : ancien réglage 418 de vitesse et 250 de passage.
  const r9 = reglages(80);
  assert.ok(r9.vitesse >= 550 && r9.ecart <= 185);
  assert.ok(r9.probaMouvement >= 0.5);
  // Partie courte : moins de 2 min de vol pour atteindre le niveau 9.
  let s = 0;
  for (let p = 0; p < 80; p += 1) s += reglages(p).espacement / reglages(p).vitesse;
  assert.ok(s < 120, `${s.toFixed(0)} s`);
});

test('motifs variés : jamais deux fois le même de suite, débloqués au fil des niveaux, suites différentes selon la graine', () => {
  const suites = new Set();
  GRAINES.forEach((g) => {
    const m = creerMonde(800, g);
    const vus = [];
    for (let i = 0; i < 400; i += 1) {
      const avantMotif = m.motif;
      const avantReste = m.motifReste;
      nouvelObstacle(m);
      const rang = m.obstacles.length - 1;
      assert.ok(rang >= MOTIFS[m.motif], `${m.motif} trop tôt`);
      if (!(avantReste > 0)) {
        assert.notEqual(m.motif, avantMotif);
        vus.push(m.motif);
      }
    }
    assert.equal(new Set(vus).size, Object.keys(MOTIFS).length);
    suites.add(vus.slice(0, 12).join(','));
    // Au début, seulement les motifs simples.
    const m2 = creerMonde(800, g);
    for (let i = 0; i < 8; i += 1) {
      nouvelObstacle(m2);
      assert.ok(['libre', 'zigzag'].includes(m2.motif));
    }
  });
  assert.equal(suites.size, GRAINES.length);
});

function suite(g, passes, nb) {
  const m = creerMonde(800, g);
  m.passes = passes;
  const l = [];
  for (let i = 0; i < nb; i += 1) {
    const r = reglages(m.passes + m.obstacles.length);
    const prec = m.obstacles[m.obstacles.length - 1];
    const avant = { centre: m.dernierCentre, amp: m.dernierAmp };
    const o = nouvelObstacle(m);
    // Distance réelle au précédent (les motifs serre et large la changent).
    const espace = prec ? o.x - prec.x : r.espacement;
    l.push({ o, r, avant, espace, motif: m.motif });
  }
  return l;
}

test('motifs : vague et large mobiles, serre rapproché, escalier et serre fixes, large espacé', () => {
  const vus = {};
  GRAINES.forEach((g) => {
    let prec = null;
    suite(g, 60, 500).forEach(({ o, r, motif, espace }) => {
      vus[motif] = (vus[motif] || 0) + 1;
      if (motif === 'vague' || motif === 'large') assert.ok(o.amp > 0);
      if (motif === 'serre' || motif === 'escalier') assert.equal(o.amp, 0);
      if (motif === 'serre' && prec && !prec.amp) assert.ok(espace < r.espacement);
      if (motif === 'large') assert.ok(espace > r.espacement);
      prec = o;
    });
  });
  Object.keys(MOTIFS).forEach((k) => assert.ok(vus[k] > 20, `${k} : ${vus[k]}`));
});

test('montée et descente entre deux passages toujours atteignables (ecartAtteignable)', () => {
  GRAINES.forEach((g) => {
    [0, 10, 20, 30, 50, 80, 120, 180, 240, 5000].forEach((passes) => {
      suite(g, passes, 150).forEach(({ o, r, avant, espace }, i) => {
        if (i === 0) return;
        assert.ok(espace >= 0.85 * r.espacement - 0.01);
        const { montee, descente } = ecartAtteignable(espace, r.vitesse, r.ecart);
        const reserve = o.amp + avant.amp;
        // Départ : hauteur précédente ramenée dans les bornes du nouveau passage.
        const b = bornesCentre(r.ecart, o.amp);
        const d = o.centre - Math.max(b.min, Math.min(b.max, avant.centre));
        if (d < 0) assert.ok(-d <= Math.max(20, montee - reserve) + 0.5, `montée ${g} ${passes}`);
        else assert.ok(d <= Math.max(20, descente - reserve) + 0.5, `descente ${g} ${passes}`);
      });
    });
  });
});

// Joueur simulé à cadence humaine (au plus un toucher toutes les 0,25 s), sans bonus.
function joueurSimule(graine, passes0, nb) {
  const m = creerMonde(800, graine);
  m.passes = passes0;
  impulsion(m);
  let dernierToucher = m.t;
  let mobiles = 0;
  const deja = new Set();
  for (let i = 0; i < 60 * 900 && m.passes < passes0 + nb; i += 1) {
    const d = m.drone;
    m.bouclier = false;
    const v = reglages(m.passes).vitesse;
    const viser = (x) => centreObstacle(x, m.t + Math.min(0.1, Math.max(0, (x.x - (d.x + DRONE_DX)) / v)));
    const o = m.obstacles.find((x) => x.x + x.largeur > d.x - DRONE_DX);
    let cible = o ? viser(o) : (HAUTEUR - SOL) / 2;
    if (o) {
      if (!deja.has(o.id)) {
        deja.add(o.id);
        if (o.amp) mobiles += 1;
      }
      const suivant = m.obstacles[m.obstacles.indexOf(o) + 1];
      if (suivant && o.x <= d.x + DRONE_DX) {
        const marge = Math.max(0, o.ecart / 2 - DRONE_DY - 60);
        cible = Math.max(cible - marge, Math.min(cible + marge, viser(suivant)));
      }
    }
    if (d.y > cible + 20 && d.vy > 0 && m.t - dernierToucher >= 0.25) {
      impulsion(m);
      dernierToucher = m.t;
    }
    const ev = avancer(m, 1 / 60);
    if (ev.some((e) => e.type === 'crash' || e.type === 'bouclierPerdu')) return { ok: false, passes: m.passes, mobiles };
  }
  return { ok: m.passes >= passes0 + nb, passes: m.passes, mobiles };
}

test('toujours faisable : un joueur simulé à cadence humaine passe à tous les niveaux', () => {
  let mobiles = 0;
  [1, 7, 42, 999, 31337, 123456, 2026, 15841].forEach((g) => {
    [0, 10, 20, 30, 40, 60, 80, 120, 180, 240, 3000].forEach((passes) => {
      const r = joueurSimule(g, passes, 80);
      assert.ok(r.ok, `graine ${g}, niveau ${passes} : chute au passage ${r.passes}`);
      mobiles += r.mobiles;
    });
  });
  assert.ok(mobiles > 500, `${mobiles} obstacles mobiles`);
});

test('passages toujours dans l’écran et sous les bornes, à tous les niveaux', () => {
  GRAINES.forEach((g) => {
    [0, 10, 30, 60, 120, 240, 800].forEach((passes) => {
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
  // 1 s : choc encaissé, invincibilité (1,2 s) encore active, avant l'immeuble suivant.
  const ev = voler(m, 1);
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

test('ancienne sauvegarde sans motif : un motif est tiré, la partie continue', () => {
  const m = creerMonde(800, 11);
  impulsion(m);
  delete m.motif; delete m.motifReste; delete m.dernierPhi; delete m.dernierSens;
  const copie = { ...JSON.parse(JSON.stringify(m)), motif: 'inconnu', motifReste: NaN };
  const o = nouvelObstacle(copie);
  assert.ok(Object.prototype.hasOwnProperty.call(MOTIFS, copie.motif));
  assert.ok(Number.isFinite(o.centre) && Number.isFinite(o.phi));
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

test('plafond serveur 200 000 hors de portée : plus de 1 h 30 de partie parfaite au plus dur', () => {
  const r = reglages(100000);
  const passagesParS = r.vitesse / r.espacement;
  // Pire cas : chaque passage avec colis et client, toujours points doublés (impossible en vrai).
  const pointsParPassage = 2 * (1 + POINTS_COLIS + POINTS_CLIENT);
  const heures = 200000 / (passagesParS * pointsParPassage) / 3600;
  assert.ok(heures > 1.5, `${heures.toFixed(1)} h`);
  assert.ok(centreObstacle({ centre: 1, amp: 0 }, 0) === 1);
});

test('records locaux et reprise : valeurs abîmées corrigées, partie terminée jamais reprise', async () => {
  const { recordsApres, nettoyerRecords, nettoyerMonde, niveauJeu, cleSauvegarde } = await import('../jeux/drone.js');
  assert.deepEqual(nettoyerRecords(null), { meilleurScore: 0, meilleurNiveau: 1 });
  assert.deepEqual(nettoyerRecords({ meilleurScore: -4, meilleurNiveau: 'x' }), { meilleurScore: 0, meilleurNiveau: 1 });
  assert.deepEqual(recordsApres({ meilleurScore: 30, meilleurNiveau: 2 }, 12, 35), { meilleurScore: 30, meilleurNiveau: niveauJeu(35) });
  assert.equal(niveauJeu(0), 1);
  assert.equal(niveauJeu(PALIER), 2);
  assert.equal(cleSauvegarde(42), 'USER_JEU_DRONE_V1_42');
  assert.equal(cleSauvegarde(null), 'USER_JEU_DRONE_V1_local');

  const m = creerMonde(500, 7);
  impulsion(m);
  for (let i = 0; i < 30; i += 1) avancer(m, 1 / 60);
  const relu = nettoyerMonde(JSON.parse(JSON.stringify(m)));
  assert.ok(relu, 'monde en vol relu');
  assert.equal(relu.score, m.score);
  assert.equal(relu.obstacles.length, m.obstacles.length);
  assert.equal(nettoyerMonde({ ...m, phase: 'fini' }), null, 'partie terminée : pas de reprise');
  assert.equal(nettoyerMonde({ ...m, drone: { x: NaN, y: 0 } }), null, 'monde abîmé : pas de reprise');
  assert.ok(nettoyerMonde({ ...m, score: 10 ** 9 }).score < 10 ** 9, 'score impossible plafonné');
});
