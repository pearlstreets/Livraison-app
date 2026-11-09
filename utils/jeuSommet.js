/**
 * Mini-jeu « Livraison au sommet » : logique pure (sans React).
 *
 * Le livreur grimpe la façade en rebondissant tout seul sur chaque balcon
 * touché par le dessus. Le joueur ne fait que diriger (gauche, droite).
 * Monde en unités fixes : largeur MONDE_L, axe y vers le HAUT (y = hauteur),
 * l'écran convertit avec une échelle. L'état est muté sur place par
 * `avancer` (appelé à chaque image depuis une ref) pour rester fluide.
 *
 * Garantie de jeu : deux plateformes successives de la « chaîne » ne sont
 * jamais plus espacées que ECART_MAX_RATIO x la hauteur d'un saut normal, et
 * la vitesse latérale permet d'atteindre n'importe quelle abscisse pendant
 * ce saut (vérifiable avec peutAtteindre).
 */

export const MONDE_L = 360;
export const GRAVITE = 2200;
export const V_SAUT = 900;
export const V_TRAMPO = 1350;
export const V_MONTE = 1900;
export const ACC_X = 1900;
export const VX_MAX = 340;
export const ETAGE = 60;
export const POINTS_COLIS = 5;
export const ECART_MAX_RATIO = 0.86;
export const ETAGES_PALIER = 50;
export const VENT_MAX = 520;
export const DUREE_ANNONCE = 4;
export const JOUEUR_L = 34;
export const JOUEUR_H = 46;
export const PIED = 13; // demi-largeur des pieds pour les rebonds
export const PLAT_H = 12;
export const DT_MAX = 1 / 30;
export const RALENTI = 0.7;
const PAS = 1 / 120;

export const LARGEURS = { sol: MONDE_L, balcon: 74, nacelle: 70, store: 80, trampo: 74, monte: 84 };

export function hauteurSaut(v = V_SAUT) {
  return (v * v) / (2 * GRAVITE);
}
const H_SAUT = hauteurSaut(V_SAUT);

/** Difficulté 0 (début) vers 1 (très haut), progressive. */
export function difficulte(hauteur) {
  return 1 - Math.exp(-Math.max(0, hauteur) / 3000);
}

/** Palier atteint (tous les ETAGES_PALIER étages) : 0, 1, 2... */
export function palierDe(hauteur) {
  return Math.floor(Math.max(0, hauteur) / (ETAGE * ETAGES_PALIER));
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

/** Écart vertical entre deux plateformes de la chaîne, selon la difficulté. */
export function ecarts(d) {
  return {
    min: lerp(48, 0.62 * H_SAUT, d),
    max: Math.min(ECART_MAX_RATIO * H_SAUT, lerp(84, ECART_MAX_RATIO * H_SAUT, d)),
  };
}

/** Hasard reproductible (tests). */
export function hasardGraine(graine = 1) {
  let a = graine >>> 0;
  return function hasard() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance horizontale en tenant compte du passage d'un bord à l'autre. */
export function dxBoucle(a, b) {
  const d = Math.abs(a - b) % MONDE_L;
  return Math.min(d, MONDE_L - d);
}

function choisirType(d, hauteur, r) {
  const x = r();
  const pMonte = hauteur > 1500 ? 0.01 : 0;
  const pTrampo = hauteur > 400 ? 0.04 : 0;
  const pStore = hauteur > 300 ? lerp(0.08, 0.36, d) : 0;
  const pNacelle = hauteur > 200 ? lerp(0.08, 0.34, d) : 0;
  if (x < pMonte) return 'monte';
  if (x < pMonte + pTrampo) return 'trampo';
  if (x < pMonte + pTrampo + pStore) return 'store';
  if (x < pMonte + pTrampo + pStore + pNacelle) return 'nacelle';
  return 'balcon';
}

function creerPlateforme(e, type, x, y, chaine) {
  const l = LARGEURS[type];
  const p = { id: e.idSuivant++, type, x, y, l, chaine, dechire: false, vy: 0, rot: 0 };
  if (type === 'nacelle') {
    const d = difficulte(y);
    const amplitude = lerp(60, 130, d) + e.hasard() * 30;
    p.xMin = Math.max(0, x - amplitude);
    p.xMax = Math.min(MONDE_L - l, x + amplitude);
    p.vx = (e.hasard() < 0.5 ? -1 : 1) * lerp(70, 190, d) * (palierDe(y) >= 4 ? 1.25 : 1);
  }
  e.plateformes.push(p);
  return p;
}

/** Ajoute des plateformes jusqu'à la hauteur yMax. */
export function genererJusqua(e, yMax) {
  const r = e.hasard;
  while (e.prochainY < yMax) {
    const y = e.prochainY;
    const d = difficulte(y);
    const type = choisirType(d, y, r);
    const l = LARGEURS[type];
    const x = r() * (MONDE_L - l);
    const p = creerPlateforme(e, type, x, y, true);
    if ((type === 'balcon' || type === 'nacelle') && r() < 0.12) {
      e.colisListe.push({ id: e.idSuivant++, x: p.x + l / 2, y: y + 34, pris: false });
    }
    const { min, max } = ecarts(d);
    const ecart = lerp(min, max, r());
    // Leurre ou appui de plus entre deux plateformes de la chaîne.
    if (ecart > 55 && r() < lerp(0.3, 0.6, d)) {
      const leurre = r() < lerp(0.4, 0.85, d) ? 'store' : 'balcon';
      const ll = LARGEURS[leurre];
      let lx = r() * (MONDE_L - ll);
      if (Math.abs(lx - x) < ll + 12) lx = (x + MONDE_L / 2) % (MONDE_L - ll);
      creerPlateforme(e, leurre, lx, y + ecart * lerp(0.35, 0.65, r()), false);
    }
    // Colis isolé en l'air, à aller chercher.
    if (y > 500 && r() < 0.05) {
      e.colisListe.push({ id: e.idSuivant++, x: 30 + r() * (MONDE_L - 60), y: y + ecart * 0.5, pris: false });
    }
    e.prochainY = y + ecart;
  }
}

/** Partie neuve : le livreur part du trottoir. `visibleH` : hauteur d'écran en unités. */
export function partieNeuve(visibleH = 640, hasard = Math.random) {
  const e = {
    phase: 'jeu', // jeu | chute | fin
    joueur: { x: MONDE_L / 2, y: 0, vx: 0, vy: V_SAUT, regard: 1, rot: 0 },
    cam: 0,
    visibleH,
    hautMax: 0,
    colis: 0,
    score: 0,
    etage: 0,
    etageBase: 0, // étages déjà gagnés avant une reprise de partie
    plateformes: [],
    colisListe: [],
    pots: [],
    pigeons: [],
    hasard,
    idSuivant: 1,
    prochainY: 70,
    minPot: 4,
    minPigeon: 6,
    palier: 0,
    annonce: 0,
    vent: 0,
    cause: null,
    t: 0,
  };
  e.plateformes.push({ id: e.idSuivant++, type: 'sol', x: 0, y: 0, l: MONDE_L, chaine: true, dechire: false, vy: 0, rot: 0 });
  genererJusqua(e, visibleH * 2);
  return e;
}

/** Un pas de physique du livreur seul (servira aussi aux tests). */
export function pasJoueur(j, dir, dt, vent = 0) {
  if (dir !== 0) {
    const inverse = j.vx * dir < 0;
    j.vx += dir * ACC_X * (inverse ? 1.6 : 1) * dt;
    j.regard = dir;
  } else {
    j.vx *= Math.exp(-7 * dt);
  }
  j.vx += vent * dt;
  if (j.vx > VX_MAX) j.vx = VX_MAX;
  if (j.vx < -VX_MAX) j.vx = -VX_MAX;
  j.x += j.vx * dt;
  if (j.x < 0) j.x += MONDE_L;
  if (j.x >= MONDE_L) j.x -= MONDE_L;
  j.vy -= GRAVITE * dt;
  j.y += j.vy * dt;
}

/**
 * Le livreur, parti d'un rebond normal, peut-il se poser sur une plateforme
 * `ecart` plus haut, décalée de `dx` (après passage de bord), de largeur `l` ?
 */
export function peutAtteindre(ecart, dx, l = LARGEURS.nacelle, vent = 0) {
  const j = { x: 0, y: 0, vx: 0, vy: V_SAUT, regard: 1 };
  const cible = dx;
  for (let i = 0; i < 2000; i += 1) {
    const avant = j.y;
    const reste = ((cible - j.x + 1.5 * MONDE_L) % MONDE_L) - MONDE_L / 2;
    const dir = Math.abs(reste) < (vent ? 0.5 : 2) ? 0 : Math.sign(reste);
    pasJoueur(j, dir, PAS, vent);
    if (j.vy < 0 && avant >= ecart && j.y <= ecart && dxBoucle(j.x, cible) <= l / 2 + PIED) return true;
    if (j.vy < 0 && j.y < ecart) return false;
  }
  return false;
}

function rebondir(e, v) {
  e.joueur.vy = v;
}

function toucheCorps(j, cx, cy, demiL, demiH) {
  return Math.abs(j.x - cx) < JOUEUR_L / 2 + demiL - 4
    && j.y < cy + demiH && j.y + JOUEUR_H > cy - demiH;
}

/**
 * Avance la partie de dt secondes (borné). `dir` : -1 gauche, 0, 1 droite.
 * Rend la liste des événements de l'image : 'rebond', 'trampo', 'monte',
 * 'store', 'colis', 'pigeon', 'palier', 'touche', 'fin'.
 */
export function avancer(e, dtBrut, dir) {
  const evts = [];
  if (e.phase === 'fin') return evts;
  // Jeu ralenti : tout le monde avance à 70 % du temps réel.
  let dt = Math.min(DT_MAX, Math.max(0, dtBrut || 0)) * RALENTI;
  const r = e.hasard;
  const j = e.joueur;
  while (dt > 1e-6) {
    const h = Math.min(PAS, dt);
    dt -= h;
    e.t += h;
    const d = difficulte(e.hautMax);

    // Plateformes mobiles et stores déchirés.
    for (const p of e.plateformes) {
      if (p.type === 'nacelle') {
        p.x += p.vx * h;
        if (p.x < p.xMin) { p.x = p.xMin; p.vx = Math.abs(p.vx); }
        if (p.x > p.xMax) { p.x = p.xMax; p.vx = -Math.abs(p.vx); }
      }
      if (p.dechire) {
        p.vy -= GRAVITE * 0.7 * h;
        p.y += p.vy * h;
        p.rot += 160 * h;
      }
    }

    const piedsAvant = j.y;
    e.vent = e.palier >= 1 ? Math.sin(e.t * 0.7) * VENT_MAX : 0;
    pasJoueur(j, e.phase === 'jeu' ? dir : 0, h, e.phase === 'jeu' ? e.vent : 0);
    if (e.annonce > 0) e.annonce -= h;
    if (e.phase === 'chute') j.rot += 500 * h;

    if (e.phase === 'jeu') {
      // Rebond sur une plateforme, seulement en descendant et par le dessus.
      if (j.vy < 0) {
        for (const p of e.plateformes) {
          if (p.dechire) continue;
          if (piedsAvant >= p.y && j.y <= p.y && dxBoucle(j.x, p.x + p.l / 2) <= p.l / 2 + PIED) {
            j.y = p.y;
            if (p.type === 'trampo') { rebondir(e, V_TRAMPO); evts.push('trampo'); }
            else if (p.type === 'monte') { rebondir(e, V_MONTE); evts.push('monte'); }
            else { rebondir(e, V_SAUT); evts.push('rebond'); }
            if (p.type === 'store') { p.dechire = true; p.vy = 0; evts.push('store'); }
            break;
          }
        }
      }

      // Colis.
      for (const c of e.colisListe) {
        if (!c.pris && dxBoucle(j.x, c.x) < JOUEUR_L / 2 + 12 && j.y < c.y + 14 && j.y + JOUEUR_H > c.y - 14) {
          c.pris = true;
          e.colis += 1;
          evts.push('colis');
        }
      }

      // Pigeons : rebond par le dessus, sinon fin.
      for (const g of e.pigeons) {
        if (g.mort) continue;
        if (j.vy < 0 && piedsAvant >= g.y && j.y <= g.y + 10 && Math.abs(j.x - g.x) < 17 + PIED) {
          g.mort = true;
          j.y = Math.max(j.y, g.y);
          rebondir(e, V_SAUT);
          evts.push('pigeon');
        } else if (toucheCorps(j, g.x, g.y, 16, 9)) {
          e.phase = 'chute';
          e.cause = 'pigeon';
          j.vy = Math.min(j.vy, 200);
          evts.push('touche');
        }
      }

      // Pots de fleurs.
      for (const pot of e.pots) {
        if (pot.alerte <= 0 && !pot.casse && toucheCorps(j, pot.x, pot.y, 12, 13)) {
          e.phase = 'chute';
          e.cause = 'pot';
          j.vy = Math.min(j.vy, 0);
          evts.push('touche');
        }
      }

      // Caméra : monte seulement.
      if (e.phase === 'jeu') {
        const visee = j.y - e.visibleH * 0.45;
        if (visee > e.cam) e.cam = visee;
        if (j.y > e.hautMax) e.hautMax = j.y;
        const pal = palierDe(e.hautMax);
        if (pal > e.palier) {
          e.palier = pal;
          e.annonce = DUREE_ANNONCE;
          evts.push('palier');
        }
      }
    }

    // Gêneurs.
    const haut = e.cam + e.visibleH;
    for (const pot of e.pots) {
      if (pot.alerte > 0) {
        pot.alerte -= h;
        pot.y = haut + 30;
      } else {
        pot.y += pot.vy * h;
      }
    }
    for (const g of e.pigeons) {
      if (g.mort) { g.vyMort -= GRAVITE * h; g.y += g.vyMort * h; }
      else g.x += g.vx * h;
    }
    if (e.phase === 'jeu') {
      if (e.hautMax > 900) {
        e.minPot -= h;
        if (e.minPot <= 0) {
          e.minPot = lerp(6, 2, d) * (0.7 + r() * 0.6);
          const nb = e.palier >= 3 ? 2 : 1; // palier 3 : rafales de pots
          for (let k = 0; k < nb; k += 1) {
            e.pots.push({ id: e.idSuivant++, x: 24 + r() * (MONDE_L - 48), y: haut + 30, vy: -lerp(300, 520, d), alerte: lerp(0.9, 0.6, d), casse: false });
          }
        }
      }
      if (e.hautMax > 1400) {
        e.minPigeon -= h;
        if (e.minPigeon <= 0) {
          e.minPigeon = lerp(8, 2.8, d) * (0.7 + r() * 0.6);
          const gauche = r() < 0.5;
          const nb = e.palier >= 2 ? 2 : 1; // palier 2 : escadrilles de pigeons
          for (let k = 0; k < nb; k += 1) {
            e.pigeons.push({
              id: e.idSuivant++,
              x: (gauche ? -30 : MONDE_L + 30) + (gauche ? -1 : 1) * k * 70,
              y: e.cam + e.visibleH * lerp(0.5, 0.85, r()),
              vx: (gauche ? 1 : -1) * lerp(130, 250, d),
              regard: gauche ? 1 : -1,
              mort: false,
              vyMort: 0,
            });
          }
        }
      }
    }

    // Fin : sous le bas de l'écran.
    if (j.y + JOUEUR_H < e.cam - 20) {
      e.phase = 'fin';
      if (!e.cause) e.cause = 'chute';
      evts.push('fin');
      break;
    }
  }

  // Recyclage : ce qui est passé sous l'écran disparaît, la suite est générée.
  const bas = e.cam - 120;
  e.plateformes = e.plateformes.filter((p) => p.y > bas);
  e.colisListe = e.colisListe.filter((c) => !c.pris && c.y > bas);
  e.pots = e.pots.filter((p) => p.y > bas);
  e.pigeons = e.pigeons.filter((g) => g.y > bas && g.x > -160 && g.x < MONDE_L + 160);
  genererJusqua(e, e.cam + e.visibleH * 1.6);

  e.etage = Math.floor(e.hautMax / ETAGE) + (e.etageBase || 0);
  e.score = e.etage + e.colis * POINTS_COLIS;
  return evts;
}
