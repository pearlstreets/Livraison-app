// node --experimental-detect-module --test utils/__tests__/jeuSommet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// utils/jeux/sommet.js importe AsyncStorage (partie enregistrée) et ./commun
// (compte, couleurs, contextes React) : sous node, ces deux modules sont
// remplacés par un faux stockage en mémoire et les deux petites fonctions pures utilisées.
const FAUX_STOCKAGE = [
  'const m = new Map();',
  'export default { getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, String(v)); }, removeItem: async (k) => { m.delete(k); } };',
].join('\n');
const FAUX_COMMUN = [
  'export function cleSauvegardeJeu(jeu, idUser) { const s = idUser != null && idUser !== "" ? String(idUser) : "local"; return "USER_JEU_" + String(jeu).toUpperCase() + "_V1_" + s; }',
  'export function entierJeu(x, min = 0) { const n = Math.floor(Number(x)); return Number.isFinite(n) && n >= min ? n : min; }',
].join('\n');
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_STOCKAGE)}) };
  }
  if (specifier === './commun' && String(context.parentURL || '').endsWith('/utils/jeux/sommet.js')) {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(FAUX_COMMUN)}) };
  }
  return next(specifier, context);
}`));

const S = await import('../jeux/sommet.js');
const {
  MONDE_L, V_SAUT, V_MONTE, JOUEUR_H, ECART_MAX_RATIO, LARGEURS, BONUS, TYPES_BONUS, BONUS_ECART_MIN,
  SURCHARGE_MAX, VENT_MAX, difficulte, ecarts, hauteurSaut, peutAtteindre, surcharge, ventMax,
  reglagesPieges, partieNeuve, genererJusqua, avancer, hasardGraine, bonusActifs, restaurerBonus,
} = S;

const GRAINES = [1, 7, 42, 999, 31337];
const H_SAUT = hauteurSaut(V_SAUT);

test('difficulté : nulle au départ, croissante, bornée', () => {
  assert.equal(difficulte(0), 0);
  let avant = -1;
  for (let h = 0; h <= 20000; h += 500) {
    const d = difficulte(h);
    assert.ok(d > avant && d < 1, `hauteur ${h}`);
    avant = d;
  }
  const debut = ecarts(0);
  assert.ok(debut.min === 48 && debut.max === 84);
  assert.ok(ecarts(1).max <= ECART_MAX_RATIO * H_SAUT + 1e-9);
});

test('pièges de plus en plus durs, sans jamais devenir impossibles', () => {
  let avant = reglagesPieges(0);
  for (let h = 600; h <= 30000; h += 600) {
    const r = reglagesPieges(h);
    const ctx = `hauteur ${h}`;
    assert.ok(r.intervallePot <= avant.intervallePot + 1e-9, ctx);
    assert.ok(r.intervallePigeon <= avant.intervallePigeon + 1e-9, ctx);
    assert.ok(r.vitessePot >= avant.vitessePot - 1e-9, ctx);
    assert.ok(r.vitessePigeon >= avant.vitessePigeon - 1e-9, ctx);
    assert.ok(r.vent >= avant.vent - 1e-9, ctx);
    assert.ok(r.alertePot >= S.ALERTE_MIN - 1e-9, `${ctx} : alerte trop courte`);
    assert.ok(r.intervallePot >= 1.9 / (1 + SURCHARGE_MAX) - 1e-9, ctx);
    assert.ok(r.intervallePigeon >= 2.4 / (1 + SURCHARGE_MAX) - 1e-9, ctx);
    assert.ok(r.vitesseNacelle <= S.V_NACELLE_MAX + 1e-9 && S.V_NACELLE_MAX < S.VX_MAX, ctx);
    avant = r;
  }
  assert.equal(surcharge(0), 0);
  assert.ok(surcharge(1) > 0, 'surcharge dès le niveau 2');
  assert.equal(surcharge(100), SURCHARGE_MAX);
  assert.equal(ventMax(0), 0);
  assert.equal(ventMax(1), VENT_MAX);
  assert.ok(ventMax(100) <= VENT_MAX * 1.3 + 1e-9);
});

test('le plus grand écart reste atteignable même contre le vent le plus fort', () => {
  const gap = ecarts(1, 100).max;
  [0, 90, MONDE_L / 2].forEach((dx) => {
    assert.ok(peutAtteindre(gap, dx, S.largeurPlateforme('balcon', ['etroit']), 0), `balcon étroit dx ${dx}`);
    assert.ok(peutAtteindre(gap, dx, S.largeurPlateforme('store', ['etroit']), 0), `store étroit dx ${dx}`);
  });
  const vent = ventMax(1000);
  [0, 90, MONDE_L / 2].forEach((dx) => {
    assert.ok(peutAtteindre(gap, dx, LARGEURS.balcon, 0), `sans vent dx ${dx}`);
    assert.ok(peutAtteindre(gap, dx, LARGEURS.balcon, vent), `vent + dx ${dx}`);
    assert.ok(peutAtteindre(gap, dx, LARGEURS.balcon, -vent), `vent - dx ${dx}`);
  });
});

test('chaîne de plateformes : écarts sous la borne sur une très haute tour', () => {
  GRAINES.forEach((g) => {
    const e = partieNeuve(640, hasardGraine(g));
    genererJusqua(e, 30000);
    const chaine = e.plateformes.filter((p) => p.chaine).sort((a, b) => a.y - b.y);
    for (let i = 1; i < chaine.length; i += 1) {
      const ecart = chaine[i].y - chaine[i - 1].y;
      assert.ok(ecart <= ECART_MAX_RATIO * H_SAUT + 1e-6, `graine ${g} : écart ${ecart}`);
    }
  });
});

test('bonus : réguliers, espacés, variés, posés au-dessus d\'un balcon de la chaîne', () => {
  GRAINES.forEach((g) => {
    const e = partieNeuve(640, hasardGraine(g));
    genererJusqua(e, 30000);
    const liste = e.bonusListe;
    assert.ok(liste.length >= 15, `graine ${g} : seulement ${liste.length} bonus`);
    const vus = new Set();
    for (let i = 0; i < liste.length; i += 1) {
      const b = liste[i];
      vus.add(b.type);
      assert.ok(TYPES_BONUS.includes(b.type));
      assert.ok(b.y - 40 >= BONUS[b.type].des, `graine ${g} : ${b.type} trop bas`);
      const support = e.plateformes.find((p) => p.chaine && p.type === 'balcon' && Math.abs(p.y - (b.y - 40)) < 1e-6 && Math.abs(p.x + p.l / 2 - b.x) < 1e-6);
      assert.ok(support, `graine ${g} : bonus ${i} sans balcon`);
      if (i > 0) {
        assert.ok(b.y - liste[i - 1].y >= BONUS_ECART_MIN - 1e-6, `graine ${g} : bonus trop proches`);
        assert.notEqual(b.type, liste[i - 1].type, `graine ${g} : deux fois le même bonus`);
      }
    }
    assert.equal(vus.size, TYPES_BONUS.length);
  });
});

function partieTest() {
  const e = partieNeuve(640, hasardGraine(3));
  e.plateformes = [];
  e.colisListe = [];
  e.bonusListe = [];
  e.prochainY = 1e9; // rien de nouveau
  e.hautMax = 100; // pas de gêneurs
  e.joueur = { x: 180, y: 300, vx: 0, vy: 0, regard: 1, rot: 0 };
  e.cam = 0;
  return e;
}

test('ramasser un bonus l\'active pour sa durée', () => {
  TYPES_BONUS.forEach((type) => {
    const e = partieTest();
    e.bonusListe.push({ id: 999, type, x: 180, y: 320, pris: false });
    const evts = avancer(e, 1 / 60, 0);
    assert.ok(evts.includes(type), type);
    assert.ok(e[type] > BONUS[type].duree - 0.1 && e[type] <= BONUS[type].duree, `${type} ${e[type]}`);
  });
});

test('casque : pare un pot, puis s\'use', () => {
  const e = partieTest();
  e.casque = 5;
  e.pots.push({ id: 50, x: 180, y: 320, vy: 0, alerte: 0, casse: false });
  const evts = avancer(e, 1 / 60, 0);
  assert.ok(evts.includes('protege'));
  assert.equal(e.phase, 'jeu');
  assert.equal(e.casque, 0);
  assert.ok(e.pots[0].casse);
  // Sans casque ni répit, le pot suivant arrête la tournée.
  e.invuln = 0;
  e.joueur.y = 300;
  e.joueur.vy = 0;
  e.pots.push({ id: 51, x: 180, y: 320, vy: 0, alerte: 0, casse: false });
  const evts2 = avancer(e, 1 / 60, 0);
  assert.ok(evts2.includes('touche'));
  assert.equal(e.phase, 'chute');
});

test('casque : pare aussi un pigeon touché de côté', () => {
  const e = partieTest();
  e.casque = 5;
  e.joueur.vy = 300;
  e.pigeons.push({ id: 60, x: 180, y: 320, vx: 0, regard: 1, mort: false, vyMort: 0 });
  const evts = avancer(e, 1 / 60, 0);
  assert.ok(evts.includes('protege'));
  assert.equal(e.phase, 'jeu');
  assert.ok(e.pigeons[0].mort);
});

test('filet : rattrape une chute une seule fois', () => {
  const e = partieTest();
  e.cam = 1000;
  e.joueur.y = 1000 - JOUEUR_H - 25;
  e.joueur.vy = -800;
  e.filet = 5;
  const evts = avancer(e, 1 / 60, 0);
  assert.ok(evts.includes('sauve'));
  assert.equal(e.phase, 'jeu');
  assert.equal(e.filet, 0);
  assert.ok(e.joueur.vy > V_MONTE * 0.9);
  // Sans filet : fin de partie.
  e.joueur.y = e.cam - JOUEUR_H - 25;
  e.joueur.vy = -800;
  const evts2 = avancer(e, 1 / 60, 0);
  assert.ok(evts2.includes('fin'));
  assert.equal(e.phase, 'fin');
});

test('aimant : attire un colis proche, pas un colis lointain', () => {
  const e = partieTest();
  e.aimant = 8;
  e.joueur.vy = 0;
  e.colisListe.push({ id: 70, x: 180 + 120, y: 323, pris: false });
  e.colisListe.push({ id: 71, x: 180, y: 900, pris: false });
  let pris = 0;
  for (let i = 0; i < 30; i += 1) {
    e.joueur.y = 300;
    e.joueur.vy = 0;
    if (avancer(e, 1 / 60, 0).includes('colis')) pris += 1;
  }
  assert.equal(pris, 1);
  assert.equal(e.colis, 1);
  assert.ok(e.colisListe.some((c) => c.id === 71 && c.x === 180 && c.y === 900));
});

test('bonus actifs sauvegardés et restaurés (bornés)', () => {
  const e = partieTest();
  e.aimant = 3.27;
  e.casque = 0;
  e.filet = 12;
  const sauve = JSON.parse(JSON.stringify(bonusActifs(e)));
  assert.deepEqual(sauve, { aimant: 3.3, casque: 0, filet: 12 });
  const f = partieNeuve(640, hasardGraine(5));
  restaurerBonus(f, { ...sauve, casque: 999, filet: 'x' });
  assert.equal(f.aimant, 3.3);
  assert.equal(f.casque, BONUS.casque.duree);
  assert.equal(f.filet, 0);
  restaurerBonus(f, undefined);
  assert.equal(f.aimant, 3.3);
});

test('partie neuve accessible : premier bonus vers le 11e étage, aucun gêneur au départ', () => {
  const e = partieNeuve(640, hasardGraine(11));
  assert.ok(e.bonusListe.every((x) => x.y >= 650));
  assert.equal(e.bonusListe[0]?.type, 'aimant');
  for (let i = 0; i < 60; i += 1) avancer(e, 1 / 60, 0);
  assert.equal(e.pots.length, 0);
  assert.equal(e.pigeons.length, 0);
});

const PAL = S.ETAGE * S.ETAGES_PALIER; // hauteur d'un niveau

test('niveau N+1 plus dur que N, nettement plus dur qu avant dès le niveau 3', () => {
  for (let pal = 0; pal < 15; pal += 1) {
    const a = reglagesPieges(pal * PAL + PAL / 2);
    const b = reglagesPieges((pal + 1) * PAL + PAL / 2);
    const ctx = `niveau ${pal + 1}`;
    // Pression : pots et pigeons par seconde ; au moins un réglage strictement plus dur.
    const pa = a.nbPots / a.intervallePot + a.nbPigeons / a.intervallePigeon;
    const pb = b.nbPots / b.intervallePot + b.nbPigeons / b.intervallePigeon;
    if (pal < 7) assert.ok(pb > pa, `${ctx} : pression ${pa} puis ${pb}`);
    else assert.ok(pb >= pa - 1e-9, ctx);
    assert.ok(b.vitessePot >= a.vitessePot - 1e-9 && b.vitessePigeon >= a.vitessePigeon - 1e-9, ctx);
    assert.ok(b.ecarts.min >= a.ecarts.min - 1e-9, ctx);
  }
  // Niveau 3 : déjà plus d'un pot toutes les 2 s.
  const n3 = reglagesPieges(2 * PAL + PAL / 2);
  assert.ok(n3.nbPots / n3.intervallePot > 1 / 2, 'niveau 3 trop doux');
  assert.ok(S.probasTypes(1, 9 * PAL, []).pTrampo < S.probasTypes(1, 1000, []).pTrampo, 'moins de matelas en haut');
});

test('accents : aucun au niveau 1, jamais le même mélange deux niveaux de suite, tous utilisés', () => {
  GRAINES.forEach((g) => {
    const ordre = S.ordreAccents(hasardGraine(g));
    assert.deepEqual([...ordre].sort(), [...S.ACCENTS].sort());
    assert.deepEqual(S.accentsNiveau(0, ordre), []);
    const vus = new Set();
    let avant = null;
    for (let pal = 1; pal < 40; pal += 1) {
      const acc = S.accentsNiveau(pal, ordre);
      assert.ok(acc.length >= 1 && acc.length <= 3);
      assert.equal(new Set(acc).size, acc.length);
      const cle = [...acc].sort().join(',');
      assert.notEqual(cle, avant, `graine ${g} niveau ${pal + 1}`);
      avant = cle;
      acc.forEach((a) => vus.add(a));
    }
    assert.equal(vus.size, S.ACCENTS.length);
  });
  assert.notDeepEqual(S.ordreAccents(hasardGraine(1)), S.ordreAccents(hasardGraine(2)));
});

test('chaîne toujours faisable avec chaque accent, toutes graines, très haut', () => {
  S.ACCENTS.forEach((accent) => {
    GRAINES.forEach((g) => {
      const e = partieNeuve(640, hasardGraine(g));
      e.ordre = Array(8).fill(accent);
      genererJusqua(e, 40000);
      const chaine = e.plateformes.filter((p) => p.chaine).sort((a, b) => a.y - b.y);
      for (let i = 1; i < chaine.length; i += 1) {
        const ecart = chaine[i].y - chaine[i - 1].y;
        assert.ok(ecart <= ECART_MAX_RATIO * H_SAUT + 1e-6, `${accent} graine ${g} : écart ${ecart}`);
        assert.ok(peutAtteindre(ecart, S.dxBoucle(chaine[i - 1].x + chaine[i - 1].l / 2, chaine[i].x + chaine[i].l / 2), chaine[i].l), `${accent} graine ${g} : plateforme ${i}`);
      }
      e.plateformes.filter((p) => p.type === 'nacelle').forEach((p) => assert.ok(Math.abs(p.vx) <= S.V_NACELLE_MAX + 1e-9));
    });
  });
});

test('variété : la chaîne ne se ressemble pas d un niveau à l autre, sur plusieurs graines', () => {
  GRAINES.forEach((graine) => {
    const e = partieNeuve(640, hasardGraine(graine));
    genererJusqua(e, 10 * PAL);
    const mix = [];
    for (let pal = 1; pal < 10; pal += 1) {
      const ps = e.plateformes.filter((p) => p.chaine && p.y >= pal * PAL && p.y < (pal + 1) * PAL);
      const part = (t) => ps.filter((p) => p.type === t).length / ps.length;
      mix.push([part('balcon'), part('store'), part('nacelle')].map((v) => Math.round(v * 10)).join(','));
    }
    assert.ok(new Set(mix).size >= 4, `graine ${graine}, mélanges : ${mix.join(' | ')}`);
  });
});

function simulerPieges(accent, pal, secondes, graine) {
  const e = partieNeuve(640, hasardGraine(graine));
  e.ordre = Array(8).fill(accent);
  e.plateformes = [];
  e.prochainY = 1e9;
  e.hBase = pal * PAL;
  e.hautMax = 2000;
  e.cam = 1700;
  e.invuln = 1e9; // invincible : on observe les pièges
  const pots = new Map(); // id : [image d'apparition, pot]
  const pigeons = new Map();
  let image = 0;
  for (let t = 0; t < secondes; t += 1 / 60) {
    e.joueur.y = 2000;
    e.joueur.vy = 0;
    avancer(e, 1 / 60, 0);
    image += 1;
    e.pots.forEach((p) => { if (!pots.has(p.id)) pots.set(p.id, [image, p]); });
    e.pigeons.forEach((p) => { if (!pigeons.has(p.id)) pigeons.set(p.id, p); });
  }
  return { pots: [...pots.values()], pigeons: [...pigeons.values()] };
}

test('rideau de pots : toujours un trou assez large, préavis allongé', () => {
  GRAINES.forEach((g) => {
    const { pots } = simulerPieges('rideau', 8, 20, g);
    const vagues = new Map();
    pots.forEach(([img, p]) => {
      if (!vagues.has(img)) vagues.set(img, []);
      vagues.get(img).push(p);
    });
    const rideaux = [...vagues.values()].filter((l) => l.length === 6);
    assert.ok(rideaux.length > 0, `graine ${g} : aucun rideau`);
    rideaux.forEach((l) => {
      const xs = l.map((p) => p.x).sort((a, b) => a - b);
      let vide = xs[0] + S.MONDE_L - xs[xs.length - 1];
      for (let i = 1; i < xs.length; i += 1) vide = Math.max(vide, xs[i] - xs[i - 1]);
      assert.ok(vide - 2 * (S.JOUEUR_L / 2 + 12 - 4) >= 80, `graine ${g} : trou trop étroit`);
      l.forEach((p) => assert.ok(p.alerte >= S.ALERTE_RIDEAU - 1e-9 || p.alerte <= 0));
    });
  });
  assert.ok(S.ALERTE_RIDEAU >= S.ALERTE_MIN);
});

test('pigeons : nuées des deux côtés et vols qui ondulent selon l accent', () => {
  const nuee = simulerPieges('nuee', 8, 20, 3).pigeons;
  assert.ok(nuee.some((p) => p.vx > 0) && nuee.some((p) => p.vx < 0));
  const vague = simulerPieges('vague', 8, 20, 3).pigeons;
  assert.ok(vague.some((p) => p.amp > 0));
  assert.ok(vague.every((p) => Math.abs(p.vx) <= reglagesPieges(1e6).vitessePigeon + 1e-9));
});

test('reprise : la course reprise garde la difficulté de son niveau, avec le répit du départ', () => {
  const e = partieNeuve(640, hasardGraine(5), 400 * S.ETAGE);
  assert.equal(e.hBase, 400 * S.ETAGE);
  const chaine = e.plateformes.filter((p) => p.chaine && p.y > 300).sort((a, b) => a.y - b.y);
  const ecart = chaine[1].y - chaine[0].y;
  assert.ok(ecart > ecarts(0).max, `écart ${ecart} : difficulté du niveau gardée`);
  for (let i = 0; i < 60; i += 1) avancer(e, 1 / 60, 0);
  assert.equal(e.pots.length, 0);
  assert.equal(e.pigeons.length, 0);
});

// Commande au doigt : le doigt posé dirige, doigt levé le livreur repart tout droit.
const PAS = 1 / 60;
const livreurAuCentre = () => ({ x: S.MONDE_L / 2, y: 0, vx: 0, vy: S.V_SAUT, regard: 1, rot: 0 });
const courir = (j, dir, secondes) => {
  for (let t = 0; t < secondes; t += PAS) S.pasJoueur(j, dir, PAS);
};

test('doigt : appui simple tout droit, glissé dirige, retour en arrière redresse puis change de côté', () => {
  const d = S.doigtPose();
  assert.equal(d.dir, 0);
  assert.equal(S.doigtLeve(d), 0);
  const g = S.doigtPose();
  assert.equal(S.doigtGlisse(g, 4), 0, 'petit tremblement ignoré');
  assert.equal(S.doigtGlisse(g, 12), 0, 'frôlement au premier appui ignoré');
  assert.equal(S.doigtGlisse(g, 40), 1);
  assert.equal(S.doigtGlisse(g, 40), 1, 'doigt à peine arrêté : direction tenue');
  assert.equal(S.doigtGlisse(g, 22), 0, 'léger retour : tout droit');
  assert.equal(S.doigtGlisse(g, -10), -1, 'retour franc : autre côté');
  assert.equal(S.doigtGlisse(g, -60), -1);
  assert.equal(S.doigtLeve(g), -1, 'levé pendant l élan : le grand écart continue');
  assert.equal(S.doigtAvance(g, S.ELAN_DOIGT), 0, 'élan fini : tout droit');
  assert.equal(g.dir, 0);
});

test('relâché = tout droit, aucune dérive', () => {
  const j = livreurAuCentre();
  const d = S.doigtPose();
  courir(j, S.doigtLeve(d), 3);
  assert.equal(j.x, S.MONDE_L / 2);
  assert.equal(j.vx, 0);
});

test('balayage rapide : grand écart de ce côté, puis tout droit', () => {
  const j = livreurAuCentre();
  const d = S.doigtPose();
  assert.equal(S.doigtGlisse(d, -50), -1);
  S.doigtLeve(d);
  const depart = j.x;
  for (let t = 0; t < 1.5; t += 1 / 60) S.pasJoueur(j, S.doigtAvance(d, 1 / 60), 1 / 60);
  const ecart = S.dxBoucle(depart, j.x);
  assert.ok(ecart > 100, `grand écart ${ecart}`);
  assert.equal(S.doigtAvance(d, 0.1), 0, 'élan fini : tout droit');
  assert.ok(Math.abs(j.vx) < 1, `vitesse latérale résiduelle ${j.vx}`);
  const pose = j.x;
  courir(j, S.doigtAvance(d, 0.1), 3);
  assert.ok(Math.abs(S.dxBoucle(pose, j.x)) < 1, 'plus aucune dérive ensuite');
});

test('doigt tenu puis levé après l élan : tout droit aussitôt', () => {
  const d = S.doigtPose();
  S.doigtGlisse(d, 50);
  for (let t = 0; t < 1; t += 0.05) {
    S.doigtGlisse(d, 50 + t * 100);
    assert.equal(S.doigtAvance(d, 0.05), 1, 'doigt qui glisse : il continue');
  }
  assert.equal(S.doigtLeve(d), 0);
  assert.equal(S.doigtAvance(d, 1 / 60), 0);
});

test('long glissé puis doigt arrêté mais posé : tout droit, puis repart si le doigt reglisse', () => {
  const d = S.doigtPose();
  for (let x = 0; x > -200; x -= 5) {
    S.doigtGlisse(d, x);
    S.doigtAvance(d, 1 / 60);
  }
  assert.equal(d.dir, -1, 'pendant le glissé : à gauche');
  for (let i = 0; i < 6; i += 1) S.doigtAvance(d, 1 / 60);
  assert.equal(d.dir, -1, 'arrêt très court toléré');
  for (let i = 0; i < 12; i += 1) S.doigtAvance(d, 1 / 60);
  assert.equal(d.dir, 0, 'doigt arrêté : tout droit');
  assert.equal(S.doigtGlisse(d, -210), -1, 'il reglisse : repart à gauche');
  assert.equal(S.doigtAvance(d, 1 / 60), -1);
});

test('appui sur un côté : part aussitôt de ce côté, doigt levé tout droit', () => {
  const d = S.doigtPose(0, -1);
  assert.equal(S.doigtAvance(d, 1 / 60), -1, 'aussitôt à gauche');
  assert.equal(S.doigtGlisse(d, 3), -1, 'tremblement ignoré');
  for (let i = 0; i < 120; i += 1) assert.equal(S.doigtAvance(d, 1 / 60), -1, 'doigt tenu immobile : il continue');
  assert.equal(S.doigtLeve(d), 0);
  assert.equal(S.doigtAvance(d, 1 / 60), 0);
  const j = livreurAuCentre();
  const dr = S.doigtPose(0, 1);
  const depart = j.x;
  for (let i = 0; i < 12; i += 1) S.pasJoueur(j, S.doigtAvance(dr, 1 / 60), 1 / 60);
  assert.ok(j.x > depart + 10, 'appui à droite : il part à droite');
  assert.equal(S.doigtGlisse(dr, -40), -1, 'un vrai glissé prend la main');
  const meme = S.doigtPose(0, 1);
  S.doigtGlisse(meme, 40);
  assert.equal(S.doigtLeve(meme), 1, 'balayage du côté de l appui : grand écart gardé');
});

test('doigt arrêté : aucun vent ne fait glisser le livreur', () => {
  const e = S.partieNeuve(640, () => 0.5);
  e.phase = 'jeu';
  e.palier = 5;
  const x0 = e.joueur.x;
  for (let i = 0; i < 60; i += 1) S.avancer(e, 1 / 60, 0);
  assert.ok(Math.abs(e.joueur.vx) < 1e-6, `vitesse latérale ${e.joueur.vx}`);
  assert.ok(Math.abs(S.dxBoucle(x0, e.joueur.x)) < 1e-6, 'aucune dérive');
});

test('sauvegarde : valeurs abîmées nettoyées, partie en cours reprise en pause', () => {
  assert.deepEqual(S.nettoyerSauvegarde(null), S.sauvegardeNeuve());
  assert.deepEqual(S.nettoyerSauvegarde([1, 2]), S.sauvegardeNeuve());
  const propre = S.nettoyerSauvegarde({
    phase: 'jeu', meilleurScore: 'abc', meilleurNiveau: -4,
    course: {etage: 120.7, colis: 3, bonus: {aimant: 999, casque: 'x'}},
  });
  assert.equal(propre.phase, 'pause');
  assert.equal(propre.course.etage, 120);
  assert.equal(propre.course.score, 120 + 3 * S.POINTS_COLIS);
  assert.equal(propre.course.bonus.aimant, BONUS.aimant.duree);
  assert.equal(propre.course.bonus.casque, 0);
  assert.ok(propre.meilleurScore >= propre.course.score);
  // Pause sans course : retour à l'accueil.
  assert.equal(S.nettoyerSauvegarde({phase: 'pause', course: null}).phase, 'accueil');
});

test('reprise : le livreur repart avec ses étages, colis et bonus', () => {
  const e = S.reprendreCourse({etage: 80, colis: 4, bonus: {casque: 1}}, 640, hasardGraine(3));
  assert.equal(e.etage, 80);
  assert.equal(e.colis, 4);
  assert.equal(e.score, 80 + 4 * S.POINTS_COLIS);
  const inst = S.instantaneCourse(e);
  assert.equal(inst.etage, 80);
  assert.equal(inst.colis, 4);
  assert.equal(S.instantaneCourse(null), null);
});

test('enregistrement puis relecture de la partie, clé par compte', async () => {
  const cle = S.cleSauvegarde(42);
  assert.equal(cle, 'USER_JEU_SOMMET_V1_42');
  assert.deepEqual(await S.chargerPartie(cle), S.sauvegardeNeuve());
  const etat = {...S.sauvegardeNeuve({meilleurScore: 500, meilleurNiveau: 2}), phase: 'accueil'};
  await S.enregistrerPartie(cle, etat);
  const relu = await S.chargerPartie(cle);
  assert.equal(relu.meilleurScore, 500);
  assert.equal(relu.meilleurNiveau, 2);
});

test('pigeon tout juste apparu : délai de grâce avant de blesser', () => {
  assert.ok(S.PIGEON_VU_MIN > 0 && S.PIGEON_VU_MIN < 1);
});
