// node --experimental-detect-module --test utils/__tests__/jeuToits.test.mjs
// Mêmes tests que l'app client (AppUser/__tests__/jeuToits.test.js), sans la sauvegarde.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAUT_MESURE, ECART_MAX, MONTEE_MAX, LARGEUR, VIES, PALIER_PIECES, DISTANCE_SURE, BORD_SUR,
  DEGAGEMENT_ATTERRISSAGE, genererNiveau, creerMonde, pas, etatsEntree, etatsSortie, hautDe,
  peutSauter, simulerSaut, MARGE_SAUT, pointDeReprise, reapparaitre, zoneGeneur, reglagesNiveau,
  BONUS_CAISSE, BONUS_CHRONO, DUREES, POINTS, RESSORT, MARCHE_ETAGE, peutMonter, decorNiveau,
  mondeParId, MONDES, NIVEAUX_PAR_MONDE, genererElementsMonde, peutGrimper, physiqueJoueur,
  nouveauJoueur, demanderSaut, NAGE, VITESSE, TERRAINS, terrainNiveau, HAUTEUR,
} from '../jeuToits.js';

const ECART = ECART_MAX;

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
      if (P[i + 1].gouttiere) {
        assert.ok(peutGrimper(P[i], P[i + 1]), `niveau ${n} graine ${g} plateforme ${i} : gouttière impossible`);
        continue;
      }
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
    const solides = m.plateformes.filter((p) => !p.flottante && !p.mobile && !p.fragile && p.type !== 'benne' && p.type !== 'bassin');
    for (let x = 0; x < m.longueur; x += 60) {
      m.dernierSol = solides.filter((p) => p.x <= x).pop() || solides[0];
      const { p, x: rx } = pointDeReprise(m, x);
      const ctx = `niveau ${n} graine ${g} x ${x}`;
      assert.ok(!p.flottante && !p.mobile && !p.fragile && p.type !== 'bassin', `${ctx} : sol non sûr`);
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
  assert.equal(m.annonce.cle, 'bonusVie');
  m.colis.push(...colis.map((c) => ({ ...c, id: c.id + 100, pris: false })));
  pas(m, 1 / 60, {});
  assert.ok(m.aimant > 0);
  assert.equal(m.annonce.cle, 'bonusAimant');
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
  assert.ok(m.annonce && /^bonus[A-Z]/.test(m.annonce.cle));
});

test('score d\'un niveau loin du plafond serveur (2 000 000)', () => {
  const m = creerMonde(15, {}, 9);
  // Points doublés partout (bonus « double ») et chrono rallongé par toutes les caisses : borne haute.
  const max = 2 * (m.colis.length * 10 + m.boites.length * 50 + m.geneurs.length * 150)
    + m.boites.length * 100 + 500 + (m.limite + m.boites.length * BONUS_CHRONO) * 20;
  assert.ok(max < 40000, `max ${max}`);
});

test('chrono de plus en plus serré, jamais intenable, plafond au niveau 20', () => {
  const r10 = reglagesNiveau(10);
  const r16 = reglagesNiveau(16);
  const r20 = reglagesNiveau(20);
  const parUnite = (r) => r.limite / r.longueur;
  assert.ok(parUnite(r20) < parUnite(r16) && parUnite(r16) < parUnite(r10), 'chrono de plus en plus serré');
  assert.ok(r20.probGeneur > r16.probGeneur && r16.probGeneur > r10.probGeneur);
  assert.ok(r20.vitesseGeneurs > r16.vitesseGeneurs && r16.vitesseGeneurs > r10.vitesseGeneurs);
  assert.ok(r20.probMobile > r10.probMobile && r20.probFragile > r10.probFragile);
  // Chrono jamais intenable : au moins 1,75 fois le temps de course sans faute.
  [1, 5, 10, 16, 20, 40].forEach((n) => {
    const r = reglagesNiveau(n);
    assert.ok(r.limite >= (r.longueur / 165) * 1.75, `niveau ${n} : chrono ${r.limite}`);
  });
  // Plafond : plus rien ne bouge après le niveau 20, gêneurs bornés.
  const r40 = reglagesNiveau(40);
  assert.deepEqual(r40, { ...r20, n: 40 });
  assert.deepEqual(reglagesNiveau(60), { ...r20, n: 60 });
  assert.ok(r40.probGeneur <= 0.92 + 1e-9 && r40.vitesseGeneurs <= 1.55 + 1e-9 && r40.ratioMax <= 0.72);
});

test('niveaux 16 à 24 : toujours faisables, gêneurs hors atterrissage', () => {
  [16, 19, 22, 24].forEach((n) => [3, 77, 2026].forEach((g) => {
    const niv = genererNiveau(n, g * 97 + n);
    const P = niv.plateformes;
    for (let i = 0; i + 1 < P.length; i += 1) {
      if (P[i + 1].gouttiere) {
        assert.ok(peutGrimper(P[i], P[i + 1]), `niveau ${n} graine ${g} plateforme ${i} : gouttière impossible`);
        continue;
      }
      etatsSortie(P[i]).forEach((a) => etatsEntree(P[i + 1]).forEach((b) => {
        const ctx = `niveau ${n} graine ${g} plateforme ${i}`;
        assert.ok(b.x - (a.x + a.w) <= ECART + 0.5, `${ctx} : trou`);
        assert.ok(Math.abs(b.y - hautDe(a)) <= MONTEE_MAX + 0.5, `${ctx} : marche`);
        assert.ok(peutSauter(a, b), `${ctx} : saut impossible`);
      }));
    }
    niv.geneurs.forEach((e) => {
      const p = P.find((q) => !q.flottante && e.y >= q.y - 0.5 && e.x >= q.x && e.x <= q.x + q.w);
      assert.ok(p && p.id !== 0 && !p.fragile && !p.arrivee, `niveau ${n} graine ${g} : gêneur mal placé`);
      assert.ok(zoneGeneur(e)[0] >= p.x + DEGAGEMENT_ATTERRISSAGE - 0.5);
    });
  }));
});

function frapperCaisse(m, caisse) {
  m.joueur = { ...m.joueur, x: caisse.x, y: caisse.y - 32, vy: 300, sol: null };
  for (let k = 0; k < 10 && !caisse.frappee; k += 1) pas(m, 1 / 60, {});
  assert.ok(caisse.frappee);
}

test('nouveaux bonus : drone, chrono et points doublés', () => {
  assert.deepEqual(BONUS_CAISSE, ['taille', 'vol', 'etoile', 'chrono', 'double']);
  // Drone (ancien parapluie) : le livreur vole et l'annonce montre un drone.
  let m = creerMonde(1, {}, 3);
  let caisse = m.boites.find((b) => b.bonus);
  caisse.bonus = 'vol';
  frapperCaisse(m, caisse);
  assert.ok(m.vol > 0 && m.joueur.vol);
  assert.equal(m.annonce.icone, 'quadcopter');
  assert.equal(m.annonce.cle, 'bonusVol');
  // Chrono : +10 s.
  m = creerMonde(1, {}, 3);
  caisse = m.boites.find((b) => b.bonus);
  caisse.bonus = 'chrono';
  const avant = m.reste;
  frapperCaisse(m, caisse);
  assert.ok(m.reste > avant + BONUS_CHRONO - 1, `chrono ${avant} puis ${m.reste}`);
  assert.equal(m.annonce.cle, 'bonusChrono');
  // Points doublés : un colis vaut 20 pendant DUREES.double secondes.
  m = creerMonde(1, {}, 3);
  caisse = m.boites.find((b) => b.bonus);
  caisse.bonus = 'double';
  frapperCaisse(m, caisse);
  assert.ok(m.double > DUREES.double - 1);
  assert.equal(m.annonce.cle, 'bonusDouble');
  const s0 = m.score;
  m.colis.push({ id: 5000, x: m.joueur.x, y: m.joueur.y + 4, pris: false });
  pas(m, 1 / 60, {});
  assert.equal(m.score - s0, POINTS.colis * 2);
  // Le bonus s'éteint seul.
  for (let k = 0; k < 60 * (DUREES.double + 1) && m.etat === 'jeu'; k += 1) pas(m, 1 / 60, {});
  assert.equal(m.double, 0);
  // Pendant l'attente après une chute, les points doublés ne s'écoulent pas.
  m = creerMonde(1, {}, 3);
  caisse = m.boites.find((b) => b.bonus);
  caisse.bonus = 'double';
  frapperCaisse(m, caisse);
  reapparaitre(m, m.joueur.x);
  assert.ok(m.attente);
  const restant = m.double;
  for (let k = 0; k < 60 * 4; k += 1) pas(m, 1 / 60, {});
  assert.equal(m.double, restant);
});

test('caisses bonus : les 5 bonus tournent au fil des niveaux', () => {
  const vus = new Set();
  for (let n = 1; n <= 6; n += 1) creerMonde(n, {}, 11 * n).boites.filter((b) => b.bonus).forEach((b) => vus.add(b.bonus));
  assert.equal(vus.size, BONUS_CAISSE.length);
});

test('la difficulté monte dès le niveau 1, chaque niveau plus dur que le précédent', () => {
  // Niveau 1 plus dur que l'ancien (trous 0,42, gêneurs 0,28, 1 600 de long, 44 s).
  const r1 = reglagesNiveau(1);
  assert.ok(r1.ratioMax > 0.42 && r1.probGeneur > 0.28 && r1.longueur > 1600 && r1.limite / r1.longueur < 44 / 1600);
  assert.ok(r1.probMobile > 0 && r1.probFragile > 0 && r1.diff > 0.3);
  assert.deepEqual(r1.types, ['chien']);
  // Montée régulière, sans palier, jusqu'au niveau 20.
  for (let n = 1; n < 20; n += 1) {
    const a = reglagesNiveau(n);
    const b = reglagesNiveau(n + 1);
    const ctx = `niveau ${n} puis ${n + 1}`;
    assert.ok(b.vitesseGeneurs > a.vitesseGeneurs, `${ctx} : vitesse des gêneurs`);
    assert.ok(b.probGeneur > a.probGeneur, `${ctx} : gêneurs`);
    assert.ok(b.ratioMax > a.ratioMax, `${ctx} : trous`);
    assert.ok(b.probMobile > a.probMobile && b.probFragile > a.probFragile, `${ctx} : nacelles et toits fragiles`);
    assert.ok(b.limite / b.longueur < a.limite / a.longueur, `${ctx} : chrono`);
    if (n < 8) {
      assert.ok(b.diff > a.diff && b.ratioMin > a.ratioMin && b.largeurMax < a.largeurMax, `${ctx} : difficulté`);
      assert.ok(b.longueur > a.longueur, `${ctx} : longueur`);
    }
  }
  // Mesuré sur les niveaux générés : trous plus larges et plus de gêneurs.
  const mesure = (n) => {
    let trous = 0;
    let nbTrous = 0;
    let geneurs = 0;
    GRAINES.forEach((g) => {
      const niv = genererNiveau(n, g * 97 + n);
      const P = niv.plateformes;
      for (let i = 0; i + 1 < P.length; i += 1) {
        const ecart = P[i + 1].x - (P[i].x + P[i].w);
        if (P[i].mobile || P[i + 1].mobile || ecart < 1) continue;
        trous += ecart;
        nbTrous += 1;
      }
      geneurs += niv.geneurs.length / niv.longueur;
    });
    return { trou: trous / nbTrous, geneurs };
  };
  const m1 = mesure(1);
  const m4 = mesure(4);
  const m8 = mesure(8);
  const m12 = mesure(12);
  assert.ok(m1.trou < m4.trou && m4.trou < m8.trou && m8.trou < m12.trou + 4, `trous ${m1.trou} ${m4.trou} ${m8.trou} ${m12.trou}`);
  assert.ok(m1.geneurs < m4.geneurs && m4.geneurs < m8.geneurs, `gêneurs ${m1.geneurs} ${m4.geneurs} ${m8.geneurs}`);
  // Dès le niveau 3 : une nacelle mobile ; dès le 2 : un toit fragile.
  GRAINES.slice(0, 3).forEach((g) => {
    assert.ok(genererNiveau(3, g).plateformes.some((p) => p.mobile && !p.mobile.ascenseur), `graine ${g} : pas de nacelle au niveau 3`);
    assert.ok(genererNiveau(2, g).plateformes.some((p) => p.fragile), `graine ${g} : pas de toit fragile au niveau 2`);
  });
});

function verifierEtages(niv, ctx) {
  const toits = niv.plateformes.filter((p) => p.etage);
  assert.ok(toits.length >= 1, `${ctx} : aucune section à étages`);
  assert.equal(niv.ressorts.length, toits.length, `${ctx} : un ressort par section`);
  toits.forEach((toit) => {
    const pile = niv.etages.filter((e) => e.x >= toit.x && e.x + e.w <= toit.x + toit.w).sort((a, b) => a.etage - b.etage);
    assert.ok(pile.length >= 2 && pile.length <= 3, `${ctx} : ${pile.length} étages`);
    // Passerelles loin des bords du toit : le chemin du bas et les sauts de la chaîne restent libres.
    pile.forEach((e) => {
      assert.ok(e.flottante, `${ctx} : passerelle pleine`);
      assert.ok(e.x >= toit.x + DEGAGEMENT_ATTERRISSAGE && e.x + e.w <= toit.x + toit.w - 110, `${ctx} : passerelle trop près du bord`);
    });
    // On monte d'un étage à l'autre d'un simple saut.
    assert.ok(peutMonter(toit, pile[0]), `${ctx} : premier étage hors d'atteinte`);
    for (let k = 0; k + 1 < pile.length; k += 1) assert.ok(peutMonter(pile[k], pile[k + 1]), `${ctx} : étage ${k + 2} hors d'atteinte`);
    // Aucun gêneur sur un toit à étages, ressort loin des bords.
    niv.geneurs.forEach((e) => assert.ok(!(e.x >= toit.x && e.x <= toit.x + toit.w && e.y === toit.y), `${ctx} : gêneur sous les étages`));
    const r = niv.ressorts.find((x) => x.x >= toit.x && x.x <= toit.x + toit.w);
    assert.ok(r && r.y === toit.y && r.x >= toit.x + 200 && r.x + r.w <= toit.x + toit.w - 200, `${ctx} : ressort mal placé`);
  });
}

test('sections à étages dès le niveau 1 : passerelles empilées accessibles, ressort, colis en haut', () => {
  [1, 2, 3, 4].forEach((n) => GRAINES.forEach((g) => {
    const niv = genererNiveau(n, g * 97 + n);
    verifierEtages(niv, `niveau ${n} graine ${g}`);
    // Colis de récompense posés sur l'étage le plus haut.
    const haut = niv.etages.reduce((a, b) => (b.y > a.y ? b : a));
    assert.ok(niv.colis.some((c) => c.x >= haut.x - 30 && c.x <= haut.x + haut.w && c.y > haut.y), `niveau ${n} graine ${g} : pas de colis en haut`);
  }));
  assert.ok(Array.from({ length: 12 }, (_, i) => genererNiveau(5, i + 1)).some((niv) => niv.etages.some((e) => e.etage === 3)), 'jamais 3 étages');
  // Reproductible pour un même (niveau, graine).
  assert.deepEqual(genererNiveau(4, 321), genererNiveau(4, 321));
});

test('ressort : rebond bien plus haut qu\'un saut normal, retombée sans chute', () => {
  [1, 4, 9].forEach((n) => {
    const m = creerMonde(n, {}, 600 + n);
    const r = m.ressorts[0];
    const toit = m.plateformes.find((p) => p.etage && r.x >= p.x && r.x <= p.x + p.w);
    m.joueur.x = r.x - LARGEUR - 6;
    m.joueur.y = toit.y;
    m.joueur.sol = toit;
    m.dernierSol = toit;
    const cmd = { droite: true, gauche: false, sautTenu: false, sautAppui: false, bas: false, geste: true };
    let haut = 0;
    let rebond = false;
    for (let k = 0; k < 60 * 2; k += 1) {
      const ev = pas(m, 1 / 60, cmd);
      if (ev.some((e) => e.type === 'ressort')) rebond = true;
      assert.ok(!ev.some((e) => e.type === 'chute'), `niveau ${n} : chute après le ressort`);
      if (!rebond) continue;
      haut = Math.max(haut, m.joueur.y - toit.y);
    }
    assert.ok(rebond, `niveau ${n} : pas de rebond`);
    assert.ok(haut > SAUT_MESURE.hauteur * 1.4, `niveau ${n} : rebond de ${haut}`);
    assert.ok(haut > MARCHE_ETAGE * 3, `niveau ${n} : le rebond n'atteint pas le 3e étage`);
    assert.ok(m.joueur.sol, `niveau ${n} : toujours en l'air`);
    assert.equal(m.vies, VIES);
  });
  assert.ok((RESSORT * RESSORT) / (2 * 1900) > SAUT_MESURE.hauteur * 1.4);
});

test('niveaux 1 à 40 : toujours faisables (chaîne, étages, reprise hors ressort)', () => {
  for (let n = 1; n <= 40; n += 1) {
    [3, 77, 2026].forEach((g) => {
      const niv = genererNiveau(n, g * 131 + n);
      const P = niv.plateformes;
      const ctx0 = `niveau ${n} graine ${g}`;
      for (let i = 0; i + 1 < P.length; i += 1) {
        if (P[i + 1].gouttiere) {
          assert.ok(peutGrimper(P[i], P[i + 1]), `${ctx0} plateforme ${i} : gouttière impossible`);
          continue;
        }
        etatsSortie(P[i]).forEach((a) => etatsEntree(P[i + 1]).forEach((b) => {
          const ctx = `${ctx0} plateforme ${i}`;
          assert.ok(b.x - (a.x + a.w) <= ECART + 0.5, `${ctx} : trou`);
          assert.ok(Math.abs(b.y - hautDe(a)) <= MONTEE_MAX + 0.5, `${ctx} : marche`);
          assert.ok(peutSauter(a, b), `${ctx} : saut impossible`);
          assert.ok(simulerSaut(a, b, MARGE_SAUT, null, niv.boites), `${ctx} : saut gêné par une boîte`);
        }));
      }
      niv.geneurs.forEach((e) => {
        const p = P.find((q) => !q.flottante && e.y >= q.y - 0.5 && e.x >= q.x && e.x <= q.x + q.w);
        assert.ok(p && p.id !== 0 && !p.fragile && !p.arrivee && !p.etage, `${ctx0} : gêneur mal placé`);
        assert.ok(zoneGeneur(e)[0] >= p.x + DEGAGEMENT_ATTERRISSAGE - 0.5, `${ctx0} : gêneur à l'atterrissage`);
      });
      verifierEtages(niv, ctx0);
      if (g === 3) {
        const m = creerMonde(n, {}, g * 131 + n);
        for (let x = 0; x < m.longueur; x += 90) {
          const { x: rx } = pointDeReprise(m, x);
          m.ressorts.forEach((r) => assert.ok(rx + LARGEUR <= r.x - BORD_SUR + 0.5 || rx >= r.x + r.w + BORD_SUR - 0.5, `${ctx0} x ${x} : reprise sur un ressort`));
        }
      }
    });
  }
});

test('mondes : thème différent d\'un monde à l\'autre, motif différent d\'un niveau à l\'autre', () => {
  assert.ok(MONDES.length >= 6);
  const ids = MONDES.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let k = 0; k < MONDES.length; k += 1) {
    const n = 1 + k * NIVEAUX_PAR_MONDE;
    const d = decorNiveau(n);
    assert.equal(d.monde, ids[k]);
    assert.equal(decorNiveau(n + 1).monde, d.monde, 'deux niveaux par monde');
    assert.notEqual(decorNiveau(n + 1).motif, d.motif, `monde ${d.monde} : même motif sur ses deux niveaux`);
    assert.notEqual(decorNiveau(n + NIVEAUX_PAR_MONDE).monde, d.monde);
    assert.equal(genererNiveau(n, 5).monde, d.monde);
  }
  // Thèmes vraiment différents : ambiance, couleurs, éléments de fond.
  const signature = (id) => JSON.stringify([mondeParId(id).decor, mondeParId(id).couleurs, mondeParId(id).particules, mondeParId(id).elements]);
  assert.equal(new Set(ids.map(signature)).size, ids.length);
  assert.notEqual(signature(decorNiveau(1).monde), signature(decorNiveau(3).monde));
  // Le tour recommence après le dernier monde ; id inconnu : la ville.
  assert.equal(decorNiveau(1 + MONDES.length * NIVEAUX_PAR_MONDE).monde, 'ville');
  assert.equal(mondeParId('inconnu').id, 'ville');
  // Éléments de fond propres au monde, reproductibles.
  const grues = genererElementsMonde(11, 4000);
  assert.ok(grues.length > 0 && grues.every((e) => e.type === 'grue'));
  assert.deepEqual(genererElementsMonde(11, 4000), grues);
  assert.deepEqual(genererElementsMonde(1, 4000), []);
});

test('terrains : un terrain différent à chaque niveau, passages obligés posés', () => {
  const ids = TERRAINS.map((t) => t.id);
  assert.equal(new Set(ids).size, TERRAINS.length);
  for (let n = 1; n <= TERRAINS.length; n += 1) assert.equal(genererNiveau(n, 5).terrain, ids[n - 1]);
  const signature = (niv) => `${niv.terrain}|${[...new Set(niv.segments)].sort().join(',')}`;
  for (let n = 1; n < 24; n += 1) {
    assert.notEqual(genererNiveau(n, 5).terrain, genererNiveau(n + 1, 5).terrain, `niveaux ${n} et ${n + 1} : même terrain`);
    assert.notEqual(signature(genererNiveau(n, 5)), signature(genererNiveau(n + 1, 5)));
  }
  // Chaque niveau a ses passages obligés (ascenseur, bassin, gouttière, bouche d'aération, étages).
  for (let n = 1; n <= 24; n += 1) {
    GRAINES.forEach((g) => {
      const niv = genererNiveau(n, g * 97 + n);
      const reste = niv.segments.slice();
      terrainNiveau(n).obligatoires.forEach((o) => {
        const k = reste.indexOf(o);
        assert.ok(k >= 0, `niveau ${n} graine ${g} : ${o} manquant`);
        reste.splice(k, 1);
      });
    });
  }
  // Au fil des 8 premiers niveaux : les nouveaux éléments apparaissent tous.
  const tous = new Set();
  for (let n = 1; n <= 8; n += 1) genererNiveau(n, 5).segments.forEach((s) => tous.add(s));
  ['ascenseur', 'eau', 'gouttiere', 'bouche', 'etage'].forEach((s) => assert.ok(tous.has(s), `${s} jamais posé`));
  // Plusieurs hauteurs : toits plus hauts au fil des terrains.
  const haut = (n) => Math.max(...genererNiveau(n, 5).plateformes.map((p) => p.y));
  assert.ok(haut(6) > haut(1));
});

const ENV_BASSIN = () => {
  const a = { id: 1, x: 0, w: 200, y: 60, flottante: false };
  const b = { id: 2, x: 200, w: 220, y: 0, flottante: false, type: 'bassin', eau: 52 };
  const c = { id: 3, x: 420, w: 200, y: 60, flottante: false };
  return { a, b, c, env: { eaux: [{ x: b.x, w: b.w, y: b.y, eau: b.eau }], gouttieres: [] } };
};

function nager(j, P, env, cmd, duree, geste = 0) {
  let vmax = 0;
  let min = Infinity;
  let dernier = -1;
  for (let t = 0; t < duree; t += 1 / 120) {
    if (geste && t - dernier >= geste) {
      demanderSaut(j);
      dernier = t;
    }
    physiqueJoueur(j, P, [], { ...cmd, sautTenu: geste ? t - dernier < 0.3 : false }, 1 / 120, env);
    if (j.dansEau) {
      vmax = Math.max(vmax, Math.abs(j.vx));
      min = Math.min(min, j.y);
    }
    if (cmd.fin && cmd.fin(j)) return { vmax, min, ok: true };
  }
  return { vmax, min, ok: false };
}

test('eau : le livreur nage plus lentement, flotte, et ressort des deux côtés', () => {
  const { a, b, c, env } = ENV_BASSIN();
  const P = [a, b, c];
  // Il saute dedans depuis le bord.
  let j = nouveauJoueur(150, 60);
  j.sol = a;
  let r = nager(j, P, env, { droite: true }, 1.2);
  assert.ok(r.vmax > 0 && r.vmax <= VITESSE * NAGE.vitesse + 0.5, `vitesse dans l'eau ${r.vmax}`);
  assert.ok(j.dansEau, 'pas dans l\'eau');
  // Sans geste : il flotte, la tête hors de l'eau, sans toucher le fond.
  j = nouveauJoueur(290, 30);
  j.vy = -300;
  r = nager(j, P, env, {}, 3);
  assert.ok(r.min > b.y, `touche le fond (${r.min})`);
  assert.ok(j.dansEau && j.y + HAUTEUR > b.eau && j.y < b.eau, `ne flotte pas (${j.y})`);
  assert.ok(Math.abs(j.vy) < 20, `ne se stabilise pas (${j.vy})`);
  // Glisser vers le bas : il plonge.
  r = nager(j, P, env, { bas: true }, 1);
  assert.ok(r.min < b.eau - HAUTEUR, `ne plonge pas (${r.min})`);
  // Il ressort à droite comme à gauche, d'un geste vers le haut.
  j = nouveauJoueur(290, 30);
  r = nager(j, P, env, { droite: true, fin: (x) => x.sol === c }, 5, 0.4);
  assert.ok(r.ok, 'sortie à droite impossible');
  j = nouveauJoueur(290, 30);
  r = nager(j, P, env, { gauche: true, fin: (x) => x.sol === a }, 5, 0.4);
  assert.ok(r.ok, 'sortie à gauche impossible');
  // Sans environnement (simulations de la génération) : tout reste sec.
  j = nouveauJoueur(290, 30);
  physiqueJoueur(j, P, [], {}, 1 / 120);
  assert.ok(!j.dansEau);
});

test('bassins des niveaux : on en ressort toujours, jamais de reprise dedans', () => {
  let vus = 0;
  for (let n = 1; n <= 24; n += 1) {
    GRAINES.slice(0, 3).forEach((g) => {
      const niv = genererNiveau(n, g * 97 + n);
      const P = niv.plateformes;
      const env = { eaux: niv.eaux, gouttieres: niv.gouttieres };
      P.forEach((b, i) => {
        if (b.type !== 'bassin') return;
        vus += 1;
        const ctx = `niveau ${n} graine ${g} bassin ${i}`;
        assert.ok(b.eau - b.y >= 26 && P[i - 1].y > b.eau && P[i + 1].y > b.eau, `${ctx} : bassin mal formé`);
        [[P[i + 1], { droite: true }], [P[i - 1], { gauche: true }]].forEach(([but, cmd]) => {
          const j = nouveauJoueur(b.x + b.w / 2 - LARGEUR / 2, b.eau - 10);
          const r = nager(j, [P[i - 1], b, P[i + 1]], env, { ...cmd, fin: (x) => x.sol === but }, 6, 0.4);
          assert.ok(r.ok, `${ctx} : sortie impossible`);
        });
      });
      const m = creerMonde(n, {}, g * 97 + n);
      for (let x = 0; x < m.longueur; x += 120) assert.notEqual(pointDeReprise(m, x).p.type, 'bassin');
    });
  }
  assert.ok(vus > 10, `${vus} bassins`);
});

test('ascenseur : il emporte le livreur d\'en bas jusqu\'en haut', () => {
  let vus = 0;
  [2, 6, 8, 10].forEach((n) => {
    const m = creerMonde(n, {}, 40 + n);
    const l = m.plateformes.find((p) => p.mobile && p.mobile.ascenseur);
    if (!l) return;
    vus += 1;
    const mo = l.mobile;
    const periode = (2 * Math.PI) / mo.vit;
    // Horloge réglée sur l'ascenseur en bas, livreur posé dessus.
    m.horloge = ((((3 * Math.PI) / 2 - mo.phase) / mo.vit) % periode + periode) % periode;
    l.y = mo.y0 - mo.amp;
    m.attente = false;
    m.invul = 99;
    m.joueur = nouveauJoueur(l.x + l.w / 2 - LARGEUR / 2, l.y);
    m.joueur.sol = l;
    let haut = -Infinity;
    for (let k = 0; k < 60 * periode * 0.6; k += 1) {
      const ev = pas(m, 1 / 60, {});
      assert.ok(!ev.some((e) => e.type === 'chute'), `niveau ${n} : chute de l'ascenseur`);
      haut = Math.max(haut, m.joueur.y);
    }
    assert.ok(haut >= mo.y0 + mo.amp - 1, `niveau ${n} : monté à ${haut} au lieu de ${mo.y0 + mo.amp}`);
    assert.ok(m.joueur.sol === l, `niveau ${n} : plus sur l'ascenseur`);
  });
  assert.ok(vus >= 2, 'aucun ascenseur');
});

test('gouttière : on grimpe plus haut qu\'un saut, on glisse au lieu de tomber', () => {
  let vus = 0;
  for (let n = 1; n <= 24; n += 1) {
    GRAINES.slice(0, 3).forEach((g) => {
      const niv = genererNiveau(n, g * 97 + n);
      niv.plateformes.forEach((b, i) => {
        if (!b.gouttiere) return;
        vus += 1;
        const a = niv.plateformes[i - 1];
        assert.ok(b.y - a.y > MONTEE_MAX && b.x === a.x + a.w, `niveau ${n} : gouttière mal placée`);
        assert.ok(peutGrimper(a, b), `niveau ${n} graine ${g} : gouttière impossible`);
        assert.ok(niv.gouttieres.some((x) => x.x === b.x && x.haut === b.y));
      });
    });
  }
  assert.ok(vus > 10, `${vus} gouttières`);
  // Sans gouttière, le même mur est trop haut.
  const a = { x: 0, w: 200, y: 0 };
  const b = { x: 200, w: 200, y: 150 };
  assert.ok(peutGrimper(a, b) && !peutSauter(a, b));
  // Contre la gouttière, la chute est freinée.
  const env = { eaux: [], gouttieres: [{ x: 200, bas: 0, haut: 150 }] };
  const j = nouveauJoueur(180, 120);
  j.vy = -400;
  physiqueJoueur(j, [a, b], [], { droite: true }, 1 / 120, env);
  physiqueJoueur(j, [a, b], [], { droite: true }, 1 / 120, env);
  assert.ok(j.vy >= -60.5, `glisse à ${j.vy}`);
});

test('bouche d\'aération : glisser vers le bas mène au bout du conduit, sans danger', () => {
  let vus = 0;
  [4, 5, 12, 13].forEach((n) => {
    const m = creerMonde(n, {}, 70 + n);
    const entree = m.plateformes.find((p) => p.bouche);
    if (!entree) return;
    vus += 1;
    const sortie = m.plateformes.find((p) => p.sortieConduit && p.x > entree.x);
    m.attente = false;
    m.joueur = nouveauJoueur(entree.bouche.x + entree.bouche.w / 2 - LARGEUR / 2, entree.y);
    m.joueur.sol = entree;
    const ev = pas(m, 1 / 60, { bas: true });
    assert.ok(ev.some((e) => e.type === 'conduit'), `niveau ${n} : bouche fermée`);
    assert.ok(m.passage);
    for (let k = 0; k < 120 && m.joueur.sol !== sortie; k += 1) pas(m, 1 / 60, {});
    assert.equal(m.joueur.sol, sortie, `niveau ${n} : pas arrivé à la sortie`);
    assert.equal(m.vies, VIES);
    assert.ok(!m.passage);
  });
  assert.ok(vus >= 2, 'aucune bouche');
});

// ---- Plus dur et plus varié (comme l'app client, demande du 16/11 : « trop simple, toujours la même chose ») ----

test('courbe raide : dur dès les niveaux 3 et 4, chaque niveau plus dur que le précédent', () => {
  const r1 = reglagesNiveau(1);
  const r4 = reglagesNiveau(4);
  const r9 = reglagesNiveau(9);
  // Ancien niveau 4 : diff 0,65, trous jusqu'à 0,61 de la portée.
  assert.ok(r4.diff >= 0.8 && r4.probGeneur >= 0.65 && r4.ratioMax >= 0.67, `niveau 4 : ${r4.diff} ${r4.probGeneur} ${r4.ratioMax}`);
  // Ancien niveau 9 : gêneurs 0,72, vitesse 1,29, chrono facteur 1,91.
  assert.ok(r9.probGeneur >= 0.8 && r9.vitesseGeneurs >= 1.35 && r9.facteur < 1.75, `niveau 9 : ${r9.probGeneur} ${r9.vitesseGeneurs} ${r9.facteur}`);
  assert.ok(r1.diff >= 0.5 && r1.defis === 0 && r4.defis >= 2);
  for (let n = 1; n < 20; n += 1) {
    const a = reglagesNiveau(n);
    const b = reglagesNiveau(n + 1);
    assert.ok(b.repitFragile <= a.repitFragile && b.probEnchaine > a.probEnchaine && b.defis >= a.defis, `niveau ${n} puis ${n + 1}`);
    assert.ok(b.repitFragile >= 0.6, `niveau ${n + 1} : toit fragile trop rapide`);
  }
  // Partie courte : les 8 premiers niveaux tiennent en quelques minutes de course, aucun chrono au-delà de 4 min.
  let course = 0;
  for (let n = 1; n <= 8; n += 1) {
    const niv = genererNiveau(n, 5);
    course += niv.longueur / VITESSE;
    assert.ok(niv.limite <= 240, `niveau ${n} : chrono ${niv.limite} s`);
  }
  assert.ok(course < 6 * 60, `course cumulée des niveaux 1 à 8 : ${Math.round(course)} s`);
});

test('variété : défis et combinaisons différents d\'un niveau à l\'autre et d\'une partie à l\'autre', () => {
  const vus = new Set();
  for (let n = 3; n <= 12; n += 1) {
    const sig = new Set();
    [1, 2, 3, 4].forEach((g) => {
      const niv = genererNiveau(n, g * 97 + n);
      niv.segments.forEach((s) => vus.add(s));
      sig.add(niv.segments.join(','));
    });
    assert.ok(sig.size >= 3, `niveau ${n} : ${sig.size} enchaînements pour 4 parties`);
  }
  ['mixte', 'gardes', 'nacelles'].forEach((s) => assert.ok(vus.has(s), `${s} jamais posé`));
  // Chaque niveau élevé mêle au moins 6 sortes de passages.
  [6, 9, 12, 18].forEach((n) => [3, 77].forEach((g) => {
    const sortes = new Set(genererNiveau(n, g * 131 + n).segments);
    assert.ok(sortes.size >= 6, `niveau ${n} graine ${g} : ${[...sortes].join(' ')}`);
  }));
});

test('toits gardés : au moins deux gêneurs, hors atterrissage ; jamais une nacelle à attendre sur un toit fragile', () => {
  let gardes = 0;
  for (let n = 3; n <= 24; n += 1) {
    [3, 77, 2026, 9].forEach((g) => {
      const niv = genererNiveau(n, g * 131 + n);
      const P = niv.plateformes;
      P.filter((p) => p.garde).forEach((p) => {
        gardes += 1;
        const sur = niv.geneurs.filter((e) => e.y >= p.y - 0.5 && e.y < p.y + 60 && e.x >= p.x && e.x <= p.x + p.w);
        assert.ok(sur.length >= 2, `niveau ${n} graine ${g} : toit gardé avec ${sur.length} gêneur(s)`);
        sur.forEach((e) => assert.ok(zoneGeneur(e)[0] >= p.x + DEGAGEMENT_ATTERRISSAGE - 0.5));
      });
      for (let i = 0; i + 1 < P.length; i += 1) {
        assert.ok(!(P[i].fragile && P[i + 1].mobile), `niveau ${n} graine ${g} plateforme ${i} : nacelle après un toit fragile`);
      }
    });
  }
  assert.ok(gardes >= 8, `${gardes} toits gardés seulement`);
});

test('niveaux 3 à 14 sur 10 graines : chaque saut faisable, même déclenché tôt', () => {
  for (let n = 3; n <= 14; n += 1) {
    [11, 23, 57, 101, 404, 808, 1234, 5555, 7777, 90001].forEach((g) => {
      const niv = genererNiveau(n, g);
      const P = niv.plateformes;
      for (let i = 0; i + 1 < P.length; i += 1) {
        const ctx = `niveau ${n} graine ${g} plateforme ${i}`;
        if (P[i + 1].gouttiere) { assert.ok(peutGrimper(P[i], P[i + 1]), `${ctx} : gouttière`); continue; }
        etatsSortie(P[i]).forEach((a) => etatsEntree(P[i + 1]).forEach((b) => {
          assert.ok(b.x - (a.x + a.w) <= ECART_MAX + 0.5, `${ctx} : trou`);
          assert.ok(Math.abs(b.y - hautDe(a)) <= MONTEE_MAX + 0.5, `${ctx} : marche`);
          assert.ok(simulerSaut(a, b, MARGE_SAUT, null, niv.boites), `${ctx} : saut impossible`);
        }));
      }
    });
  }
});
