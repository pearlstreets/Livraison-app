/**
 * Logique pure du mini-jeu « Rush en ville » (screens/JeuRushScreen.js),
 * sans React : le livreur court sur 3 voies, la rue défile.
 *
 * Unités : mètres et secondes. `pos` = position absolue dans la rue, le
 * livreur est à `distance`. Chaque rangée d'obstacles laisse toujours une
 * solution : jamais 3 obstacles pleins sur la même rangée.
 *
 * Types d'obstacle :
 *  - plein : voiture, trottinette, poubelle (changer de voie) ;
 *  - bas : barrière de chantier, plot (sauter) ;
 *  - haut : échafaudage (se baisser).
 *
 * Jeu dur : vitesse de départ haute et montée rapide, rangées rapprochées,
 * motifs combinés (sauter puis changer de voie, se baisser puis sauter...),
 * voitures qui mettent leur clignotant puis changent de voie, et un palier
 * (quartier) tous les 1000 m. Chaque rangée garde une solution, et l'écart
 * de temps entre deux rangées ne descend jamais sous TG_MIN (changer de deux
 * voies prend 0,25 s) ni sous TG_SAUTS entre deux rangées à sauter (un saut
 * dure 0,62 s et ne peut pas être relancé en l'air).
 *
 * L'état est modifié sur place (boucle à 60 images par seconde).
 */

export const VOIES = 3;
export const VITESSE_DEPART = 12; // m/s
export const VITESSE_MAX = 26;
export const DUREE_SAUT = 0.62; // s
export const DUREE_GLISSE = 0.62;
export const HAUTEUR_SAUT_SURE = 0.22; // hauteur relative (0 à 1) qui passe un obstacle bas
export const DUREE_AIMANT = 7;
export const VITESSE_CHANGEMENT_VOIE = 8; // voies par seconde
export const POINTS_COLIS = 10;
export const POINTS_EXPRESS = 50;
export const DEMI_LIVREUR = 0.4; // m
export const VUE_AVANT = 48; // m générés devant le livreur
export const LONGUEUR_PALIER = 1000; // m par palier (quartier)
export const NB_ZONES = 6; // décors différents, ils reviennent en boucle
export const DEBUT_MOBILES = 350; // m : à partir de là, des voitures changent de voie
export const TG_MIN = 0.42; // s entre deux rangées d'un motif combiné
export const TG_SAUTS = 0.6; // s minimum entre deux rangées à sauter
export const T_DECLENCHE = 1.05; // s avant le contact : la voiture met son clignotant
export const T_CLIGNOTANT = 0.5;
export const T_CHANGEMENT = 0.35;
const MARGE_ARRIERE = 6; // m gardés derrière avant recyclage

export const OBSTACLES = {
  voiture: { genre: 'plein', longueur: 3 },
  trottinette: { genre: 'plein', longueur: 1.3 },
  poubelle: { genre: 'plein', longueur: 1 },
  barriere: { genre: 'bas', longueur: 0.6 },
  plot: { genre: 'bas', longueur: 0.6 },
  echafaudage: { genre: 'haut', longueur: 1 },
};

const PLEINS = ['voiture', 'voiture', 'trottinette', 'poubelle'];
const BAS = ['barriere', 'plot'];

function choisir(liste, rnd) {
  return liste[Math.min(liste.length - 1, Math.floor(rnd() * liste.length))];
}

/** Vitesse selon la distance parcourue : départ rapide, montée vive puis plafond. */
export function vitessePour(distance) {
  const v = VITESSE_DEPART + Math.sqrt(Math.max(0, distance)) * 0.42;
  return Math.min(VITESSE_MAX, v);
}

/** Difficulté de 0 à 1 selon la distance. */
export function difficulte(distance) {
  return Math.max(0, Math.min(1, distance / 1800));
}

/** Numéro du palier (0 au départ, +1 tous les 1000 m). */
export function palierPour(distance) {
  return Math.floor(Math.max(0, distance) / LONGUEUR_PALIER);
}

/** Décor du palier (0 à NB_ZONES - 1), en boucle. */
export function zonePour(palier) {
  return Math.max(0, palier) % NB_ZONES;
}

function melanger(motif, rnd) {
  for (let i = motif.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = motif[i];
    motif[i] = motif[j];
    motif[j] = tmp;
  }
  return motif;
}

/**
 * Motif d'une rangée : tableau de 3 genres ('libre' | 'plein' | 'bas' | 'haut').
 * Toujours franchissable : au plus 2 voies pleines.
 */
export function motifRangee(diff, rnd = Math.random) {
  const r = rnd();
  let motif;
  if (diff < 0.08) {
    // Début : un seul obstacle, ou deux pleins avec une voie libre.
    if (r < 0.4) motif = ['plein', 'libre', 'libre'];
    else if (r < 0.7) motif = ['plein', 'plein', 'libre'];
    else if (r < 0.9) motif = ['bas', 'libre', 'libre'];
    else motif = ['haut', 'libre', 'libre'];
  } else if (r < 0.26) motif = ['plein', 'plein', 'libre'];
  else if (r < 0.42) motif = ['plein', 'bas', 'plein'];
  else if (r < 0.56) motif = ['plein', 'haut', 'plein'];
  else if (r < 0.66) motif = ['bas', 'bas', 'bas'];
  else if (r < 0.74 && diff > 0.2) motif = ['haut', 'haut', 'haut'];
  else if (r < 0.84) motif = ['plein', 'bas', 'libre'];
  else if (r < 0.93) motif = ['plein', 'haut', 'libre'];
  else motif = ['plein', 'libre', 'libre'];
  return melanger(motif, rnd);
}

/** Vrai si une rangée laisse au moins un passage. */
export function rangeeFranchissable(motif) {
  return motif.filter((g) => g === 'plein').length < VOIES;
}

function aBas(motif) {
  return motif.includes('bas');
}

/** Rangée où seule la voie `voie` passe (avec le genre donné), les autres sont pleines. */
function forcee(voie, genre) {
  const m = ['plein', 'plein', 'plein'];
  m[voie] = genre;
  return m;
}

function autreVoie(v, rnd) {
  const autres = [0, 1, 2].filter((x) => x !== v);
  return autres[Math.floor(rnd() * autres.length)];
}

function voieAlea(rnd) {
  return Math.min(VOIES - 1, Math.floor(rnd() * VOIES));
}

/** Écart de temps (s) entre deux rangées d'un motif combiné. */
function tgEntre(a, b, base) {
  return aBas(a) && aBas(b) ? Math.max(base, TG_SAUTS) : Math.max(base, TG_MIN);
}

/**
 * Bloc de rangées à poser : { type, rangees: [{ motif, mobile }], tg: [écarts en s entre rangées] }.
 * `mobile` = { voie, vers } pour une voiture qui change de voie.
 */
export function blocPour(distance, rnd = Math.random) {
  const diff = difficulte(distance);
  const pMobile = distance < DEBUT_MOBILES ? 0 : Math.min(0.42, 0.14 + (distance - DEBUT_MOBILES) / 3500);
  if (rnd() < pMobile) return blocMobile(diff, rnd);
  const pCombo = diff < 0.1 ? 0 : 0.3 + 0.3 * diff;
  if (rnd() < pCombo) return blocCombo(diff, rnd);
  return { type: 'simple', rangees: [{ motif: motifRangee(diff, rnd), mobile: null }], tg: [] };
}

function blocMobile(diff, rnd) {
  const origine = voieAlea(rnd);
  const vers = origine === 1 ? (rnd() < 0.5 ? 0 : 2) : 1;
  const reste = [0, 1, 2].find((v) => v !== origine && v !== vers);
  const motif = ['libre', 'libre', 'libre'];
  motif[origine] = 'plein';
  // La troisième voie : libre, ou un piège (plein) qui force la voie d'origine, une fois libérée.
  const r = rnd();
  if (diff > 0.3 && r < 0.45) motif[reste] = 'plein';
  else if (diff > 0.15 && r < 0.65) motif[reste] = rnd() < 0.5 ? 'bas' : 'haut';
  return { type: 'mobile', rangees: [{ motif, mobile: { voie: origine, vers } }], tg: [] };
}

function blocCombo(diff, rnd) {
  const base = Math.max(TG_MIN + 0.03, 0.56 - 0.1 * diff + rnd() * 0.08);
  const r = rnd();
  const L1 = voieAlea(rnd);
  const L2 = autreVoie(L1, rnd);
  let motifs;
  let type;
  if (r < 0.3) {
    // Sauter, puis changer de voie tout de suite.
    type = 'saut-voie';
    motifs = [forcee(L1, 'bas'), forcee(L2, 'libre')];
  } else if (r < 0.55) {
    // Se baisser entre deux voitures, puis changer de voie.
    type = 'glisse-voie';
    motifs = [forcee(L1, 'haut'), forcee(L2, 'libre')];
  } else if (r < 0.7) {
    // Sauter puis se baisser.
    type = 'saut-glisse';
    motifs = [['bas', 'bas', 'bas'], ['haut', 'haut', 'haut']];
  } else if (r < 0.82) {
    // Se baisser puis sauter.
    type = 'glisse-saut';
    motifs = [['haut', 'haut', 'haut'], ['bas', 'bas', 'bas']];
  } else {
    // Slalom : trois rangées, une voie différente à chaque fois.
    type = 'slalom';
    const L3 = autreVoie(L2, rnd);
    const genres = ['libre', 'libre', 'bas', 'haut'];
    motifs = [forcee(L1, choisir(genres, rnd)), forcee(L2, choisir(genres, rnd)), forcee(L3, choisir(genres, rnd))];
  }
  const tg = [];
  for (let i = 1; i < motifs.length; i += 1) tg.push(tgEntre(motifs[i - 1], motifs[i], base));
  return { type, rangees: motifs.map((motif) => ({ motif, mobile: null })), tg };
}

/** Écart de temps (s) vers le bloc suivant, selon la difficulté. */
export function tgBloc(distance, rnd = Math.random) {
  if (distance < 150) return 1.1 + rnd() * 0.4;
  const diff = difficulte(distance);
  return Math.max(TG_SAUTS, 0.82 - 0.24 * diff + rnd() * 0.28);
}

/** Position de la rangée suivante pour garder `tg` secondes entre les deux zones de contact. */
export function posApres(pos, longueurMax, tg) {
  const marge = longueurMax + 2 * DEMI_LIVREUR;
  let suivante = pos + marge + vitessePour(pos) * tg;
  suivante = pos + marge + vitessePour(suivante) * tg;
  return suivante;
}

function typePour(genre, rnd) {
  if (genre === 'plein') return choisir(PLEINS, rnd);
  if (genre === 'bas') return choisir(BAS, rnd);
  return 'echafaudage';
}

export function nouvellePartie() {
  return {
    distance: 0,
    vitesse: VITESSE_DEPART,
    temps: 0,
    voie: 1, // voie visée
    x: 1, // position affichée (glisse entre les voies)
    saut: 0, // temps restant en l'air
    glisse: 0, // temps restant baissé
    aimant: 0, // temps restant d'aimant
    obstacles: [], // { id, type, voie, pos, longueur, couleur }
    colis: [], // { id, voie, pos, express, aimant }
    prochaine: 36, // position du prochain bloc de rangées
    palier: 0,
    nbColis: 0,
    nbExpress: 0,
    idSuivant: 1,
    fini: false,
  };
}

export function score(e) {
  return Math.floor(e.distance) + POINTS_COLIS * e.nbColis + POINTS_EXPRESS * e.nbExpress;
}

/** Hauteur relative du saut (0 au sol, 1 au sommet). */
export function hauteurSaut(e) {
  if (e.saut <= 0) return 0;
  const p = 1 - e.saut / DUREE_SAUT;
  return Math.sin(Math.PI * p);
}

export function gauche(e) {
  if (!e.fini && e.voie > 0) e.voie -= 1;
}
export function droite(e) {
  if (!e.fini && e.voie < VOIES - 1) e.voie += 1;
}
export function sauter(e) {
  if (e.fini || e.saut > 0) return;
  e.glisse = 0;
  e.saut = DUREE_SAUT;
}
export function glisser(e) {
  if (e.fini) return;
  // En l'air : il redescend aussitôt et se baisse.
  e.saut = 0;
  e.glisse = DUREE_GLISSE;
}

/** Pose une rangée d'obstacles à `pos` ; rend la longueur du plus long obstacle. */
function poserRangee(e, rangee, pos, rnd) {
  let longueurMax = 1;
  rangee.motif.forEach((genre, voie) => {
    if (genre === 'libre') return;
    const mobile = !!rangee.mobile && rangee.mobile.voie === voie;
    const type = mobile ? 'voiture' : typePour(genre, rnd);
    const { longueur } = OBSTACLES[type];
    longueurMax = Math.max(longueurMax, longueur);
    e.obstacles.push({
      id: e.idSuivant,
      type,
      voie,
      pos,
      longueur,
      couleur: Math.floor(rnd() * 5),
      x: voie, // position réelle (une voiture qui change de voie glisse)
      mobile,
      vers: mobile ? rangee.mobile.vers : voie,
      etat: 0, // 0 attend, 1 clignotant, 2 change de voie, 3 fini
      minuteur: 0,
    });
    e.idSuivant += 1;
  });
  return longueurMax;
}

/** Ajoute un bloc de rangées d'obstacles et les colis de l'espace qui le suit. */
function genererRangee(e, rnd) {
  const bloc = blocPour(e.prochaine, rnd);
  let pos = e.prochaine;
  let motif = null;
  let longueurMax = 1;
  let debutColis = pos;
  bloc.rangees.forEach((rangee, k) => {
    motif = rangee.motif;
    longueurMax = poserRangee(e, rangee, pos, rnd);
    debutColis = pos + longueurMax + 1.5;
    if (k < bloc.rangees.length - 1) pos = posApres(pos, longueurMax, bloc.tg[k]);
  });
  const suivante = posApres(pos, longueurMax, tgBloc(pos, rnd));

  // Ligne de colis dans une voie, entre ce bloc et le suivant.
  if (rnd() < 0.7) {
    const libres = motif.map((g, i) => (g === 'plein' ? -1 : i)).filter((i) => i >= 0);
    const voie = rnd() < 0.6 && libres.length ? choisir(libres, rnd) : Math.floor(rnd() * VOIES);
    const fin = suivante - 2;
    const nb = Math.max(0, Math.min(6, Math.floor((fin - debutColis) / 2.2)));
    const indexExpress = rnd() < 0.08 ? Math.floor(rnd() * Math.max(1, nb)) : -1;
    for (let i = 0; i < nb; i += 1) {
      e.colis.push({ id: e.idSuivant, voie, pos: debutColis + i * 2.2, express: i === indexExpress, aimant: false });
      e.idSuivant += 1;
    }
  } else if (rnd() < 0.18 && e.aimant <= 0) {
    // Aimant à colis posé au milieu de l'espace.
    e.colis.push({ id: e.idSuivant, voie: Math.floor(rnd() * VOIES), pos: (pos + longueurMax + suivante) / 2, express: false, aimant: true });
    e.idSuivant += 1;
  }
  e.prochaine = suivante;
}

/** Remplit la rue devant le livreur (sans chevauchement). Rend vrai si quelque chose est ajouté. */
export function remplir(e, rnd = Math.random) {
  let ajoute = false;
  while (e.prochaine < e.distance + VUE_AVANT) {
    genererRangee(e, rnd);
    ajoute = true;
  }
  return ajoute;
}

/** Vrai si l'obstacle touche le livreur dans sa position actuelle. */
export function touche(e, o) {
  // Pendant un changement de voie, le livreur n'est dans la nouvelle voie qu'à mi-chemin.
  if (Math.abs(e.x - (o.x == null ? o.voie : o.x)) > 0.42) return false;
  const debut = e.distance - DEMI_LIVREUR;
  const fin = e.distance + DEMI_LIVREUR;
  if (fin < o.pos || debut > o.pos + o.longueur) return false;
  const { genre } = OBSTACLES[o.type];
  if (genre === 'bas') return hauteurSaut(e) < HAUTEUR_SAUT_SURE;
  if (genre === 'haut') return e.glisse <= 0;
  return true;
}

/** Vrai si la voiture mobile affiche son clignotant à cet instant (il clignote). */
export function clignotant(e, o) {
  return !!o.mobile && (o.etat === 1 || o.etat === 2) && Math.floor(e.temps * 8) % 2 === 0;
}

/** Voitures qui signalent puis changent de voie, assez tôt pour que le joueur réagisse. */
function animerVoitures(e, pas) {
  for (let i = 0; i < e.obstacles.length; i += 1) {
    const o = e.obstacles[i];
    if (!o.mobile || o.etat >= 3) continue;
    if (o.etat === 0 && o.pos - e.distance - DEMI_LIVREUR <= e.vitesse * T_DECLENCHE) {
      o.etat = 1;
      o.minuteur = T_CLIGNOTANT;
    }
    if (o.etat === 1) {
      o.minuteur -= pas;
      if (o.minuteur <= 0) {
        o.etat = 2;
        o.minuteur = T_CHANGEMENT;
      }
    } else if (o.etat === 2) {
      o.minuteur = Math.max(0, o.minuteur - pas);
      const p = 1 - o.minuteur / T_CHANGEMENT;
      o.x = o.voie + (o.vers - o.voie) * (p * p * (3 - 2 * p));
      if (o.minuteur <= 0) {
        o.x = o.vers;
        o.etat = 3;
      }
    }
  }
}

/**
 * Avance la partie de `dt` secondes.
 * Rend { change, ramasses, express, aimant, fin, palier } :
 * `change` = obstacles ou colis ajoutés ou retirés (l'écran se redessine).
 */
export function avancer(e, dt, rnd = Math.random) {
  const res = { change: false, ramasses: 0, express: 0, aimant: false, fin: false, palier: 0 };
  if (e.fini) return res;
  const pas = Math.max(0, Math.min(0.05, dt));
  e.temps += pas;
  e.vitesse = vitessePour(e.distance);
  e.distance += e.vitesse * pas;
  if (e.saut > 0) e.saut = Math.max(0, e.saut - pas);
  if (e.glisse > 0) e.glisse = Math.max(0, e.glisse - pas);
  if (e.aimant > 0) e.aimant = Math.max(0, e.aimant - pas);

  // Glissement vers la voie visée.
  const ecart = e.voie - e.x;
  const deplacement = VITESSE_CHANGEMENT_VOIE * pas;
  e.x = Math.abs(ecart) <= deplacement ? e.voie : e.x + Math.sign(ecart) * deplacement;

  const nouveauPalier = palierPour(e.distance);
  if (nouveauPalier > e.palier) {
    e.palier = nouveauPalier;
    res.palier = nouveauPalier;
  }

  if (remplir(e, rnd)) res.change = true;
  animerVoitures(e, pas);

  // Collisions.
  for (let i = 0; i < e.obstacles.length; i += 1) {
    if (touche(e, e.obstacles[i])) {
      e.fini = true;
      res.fin = true;
      return res;
    }
  }

  // Colis ramassés (aussi en l'air ou baissé).
  const voieLivreur = Math.round(e.x);
  const garde = [];
  for (let i = 0; i < e.colis.length; i += 1) {
    const c = e.colis[i];
    const z = c.pos - e.distance;
    const attire = e.aimant > 0 && !c.aimant && z < 1.2 && z > -1;
    const dansVoie = c.voie === voieLivreur && Math.abs(z) < 0.9;
    if (attire || dansVoie) {
      res.change = true;
      if (c.aimant) {
        e.aimant = DUREE_AIMANT;
        res.aimant = true;
      } else if (c.express) {
        e.nbExpress += 1;
        res.express += 1;
      } else {
        e.nbColis += 1;
        res.ramasses += 1;
      }
    } else if (z > -MARGE_ARRIERE) {
      garde.push(c);
    } else {
      res.change = true;
    }
  }
  e.colis = garde;

  // Recyclage des obstacles passés.
  const avant = e.obstacles.length;
  e.obstacles = e.obstacles.filter((o) => o.pos + o.longueur - e.distance > -MARGE_ARRIERE);
  if (e.obstacles.length !== avant) res.change = true;
  return res;
}
