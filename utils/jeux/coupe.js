/**
 * Logique pure du mini-jeu « Fruits express » (clé coupe, screens/Jeux/CoupeScreen.js).
 *
 * Les fruits d'une commande (smoothie, primeur) jaillissent du bas de l'écran
 * en arc ; le joueur les tranche en glissant le doigt. Les colis fragiles
 * (verre) ne se tranchent pas : en couper un = fin de partie. Fruit retombé
 * sans être tranché = une vie en moins (3 vies).
 *
 * Monde en unités : la hauteur vaut toujours HAUTEUR (1000), la largeur
 * dépend de l'écran (largeur en pixels / échelle). Même difficulté sur tous
 * les téléphones. Le monde est muté sur place (boucle requestAnimationFrame
 * et gestes du doigt), aucun React ici.
 *
 * Cœur doré : de temps en temps un cœur passe parmi les fruits ; le trancher
 * rend une vie (3 au plus), le rater ne coûte rien. Rare au début, plus
 * fréquent quand la difficulté monte et surtout quand il ne reste qu'une vie.
 * Jamais proposé à pleine vie.
 *
 * Phases : 'jeu', 'casse' (colis fragile tranché, tout se fige), 'perdu'
 * (dernière vie perdue, courte attente), 'fini'.
 *
 * Bonus à trancher (rater un bonus ne coûte rien, un seul à la fois à
 * l'écran, au moins 2 vagues d'écart, à partir de la vague 4) :
 *   glaçon   : tout ralentit de moitié pendant DUREE_RALENTI secondes ;
 *   étoile   : fruits à 2 points pendant DUREE_DOUBLE secondes ;
 *   bouclier : gardé jusqu'au prochain colis fragile tranché, qui est alors
 *              pardonné (la partie continue).
 * Les minuteurs n'avancent qu'en jeu (pause = figés) et sont sauvegardés.
 *
 * Difficulté (16/11, le jeu était trop simple et toujours pareil) : courbe
 * raide pour qu'une partie ne dure que quelques minutes, chaque vague restant
 * faisable. Vague 1 : trois fruits, vol de 2,3 s, aucun colis fragile. Un
 * fruit de plus à chaque vague jusqu'à 8 (vague 6), puis jusqu'à 10 ; vols
 * de 1,75 s à la vague 8, 1,5 s à la 20, 1,4 s à la 40 et après ; colis
 * fragiles dès la vague 2, vite fréquents et nombreux (5 au plus) ; pauses
 * de plus en plus courtes. Aucun objet ne vole jamais en moins de
 * DUREE_VOL_MIN secondes (temps de réaction).
 *
 * Variété : chaque vague suit un motif de départs, jamais le même deux fois
 * de suite, un nouveau motif étant imposé la première fois qu'il apparaît.
 * Pluie (départs échelonnés), salve (tout part ensemble, vague 2), balayage
 * (d'un bord à l'autre, vague 3), croisés (des deux bords vers l'autre,
 * vague 4), éventail (du centre vers tout l'écran, vague 5), escorte (chaque
 * colis vole à côté d'un fruit, à distance sûre, vague 6), double salve
 * (vague 7), éclair (arcs bas et rapides, vague 9). Dès la vague 12, une
 * vague sur quatre environ (de plus en plus souvent) part aussi plus vite.
 *
 * Score borné à SCORE_MAX (plafond proposé au serveur pour 'coupe').
 *
 * Records du téléphone (fin du fichier) : un objet par compte,
 * USER_JEU_COUPE_V1_<idUser|local>, {meilleurScore, meilleurNiveau} (la
 * meilleure vague), lu aussi par l'écran Mini-jeux (lireMeilleurScore).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {cleSauvegardeJeu, entierJeu} from './commun';

export const JEU_COUPE = 'coupe';

export const HAUTEUR = 1000;
export const DT_MAX = 1 / 30; // dt borné : physique identique quel que soit le nombre d'images
export const VIES = 3;

export const RAYON_FRUIT = 62; // fruits bien visibles (46 avant le 09/11)
export const RAYON_FRAGILE = 56; // demi-côté du carton
export const RAYON_COEUR = 58; // cœur doré
export const VAGUES_ENTRE_COEURS = 3; // au moins 3 vagues entre deux cœurs
export const RAYON_BONUS = 56; // glaçon, étoile, bouclier
export const BONUS = ['glacon', 'etoile', 'bouclier'];
export const VAGUE_PREMIER_BONUS = 4;
export const VAGUES_ENTRE_BONUS = 2; // au moins 2 vagues entre deux bonus
export const DUREE_RALENTI = 5; // s de jeu
export const FACTEUR_RALENTI = 0.5;
export const DUREE_DOUBLE = 7; // s de jeu
export const DUREE_VOL_MIN = 1.28; // s : aucun vol plus court (borne de temps de réaction)
export const ECART_ESCORTE = 180; // distance entre un fruit et le colis qui l'escorte
export const SCORE_MAX = 50000; // plafond proposé au serveur (même valeur que côté livreur)
// Tolérance de la lame : un peu généreuse sur les fruits, indulgente sur les colis.
const MARGE_FRUIT = 1.12;
const MARGE_FRAGILE = 0.8;
const MARGE_COEUR = 1.2; // généreuse : le cœur est une récompense
const MARGE_BONUS = 1.2;

export function estBonus(type) {
  return BONUS.includes(type);
}

export const POINTS_FRUIT = 1;
export const FENETRE_COMBO = 0.3; // s entre deux fruits tranchés d'un même geste
export const COMBO_MIN = 2;

export const ATTENTE_CASSE = 0.9; // s figées après un colis fragile tranché
export const ATTENTE_PERDU = 0.7;

// Sortes de fruits : emoji et couleur du jus (éclaboussures).
export const FRUITS = [
  {emoji: '🍎', jus: '#E53935'},
  {emoji: '🍊', jus: '#FB8C00'},
  {emoji: '🍋', jus: '#FDD835'},
  {emoji: '🍉', jus: '#EF5350'},
  {emoji: '🍓', jus: '#E91E63'},
  {emoji: '🍍', jus: '#FBC02D'},
  {emoji: '🥝', jus: '#7CB342'},
  {emoji: '🍑', jus: '#FF8A65'},
  {emoji: '🍇', jus: '#8E24AA'},
  {emoji: '🥭', jus: '#FFA000'},
];

// Générateur pseudo-aléatoire reproductible (mulberry32).
function aleatoire(m) {
  m.graine = (m.graine + 0x6d2b79f5) | 0;
  let x = m.graine;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function borner(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Motifs de départs et vague où chacun apparaît.
export const MOTIFS = [
  {nom: 'pluie', des: 1},
  {nom: 'salve', des: 2},
  {nom: 'balayage', des: 3},
  {nom: 'croises', des: 4},
  {nom: 'eventail', des: 5},
  {nom: 'escorte', des: 6},
  {nom: 'double', des: 7},
  {nom: 'eclair', des: 9},
];

/**
 * Réglages d'une vague (numérotées à partir de 1).
 * duree : temps de vol d'un objet (montée + descente jusqu'au bas de l'écran).
 * fruits : nombre de fruits. probaFragile / maxFragiles : colis fragiles.
 * etalement : écart maximal entre deux départs d'une même vague (s).
 * pause : attente entre la fin d'une vague et la suivante (s).
 * motifs : motifs de départs possibles. rapide : chance que la vague parte
 * aussi plus vite (vols 12 % plus courts, jamais sous DUREE_VOL_MIN).
 */
export function reglagesVague(v) {
  const n = Math.max(1, Math.floor(v));
  const p = borner((n - 1) / 7, 0, 1);
  const p2 = borner((n - 8) / 12, 0, 1);
  const p3 = borner((n - 20) / 20, 0, 1);
  return {
    // 2,3 s au départ, 1,75 s à la vague 8, 1,5 s à la 20, 1,4 s à la 40 et après
    duree: 2.3 - 0.55 * p - 0.25 * p2 - 0.1 * p3,
    fruits: n <= 6 ? 2 + n : Math.min(10, 8 + Math.floor((n - 6) / 4)),
    probaFragile: n < 2 ? 0 : Math.min(0.95, 0.4 + (n - 2) * 0.08),
    maxFragiles: n < 2 ? 0 : Math.min(5, 1 + Math.floor((n - 2) / 3)),
    etalement: Math.max(0.12, 0.55 - 0.04 * n),
    pause: Math.max(0.25, 0.75 - 0.06 * n),
    motifs: MOTIFS.filter(x => x.des <= n).map(x => x.nom),
    rapide:
      n < 12 ? 0 : Math.min(0.6, 0.25 + 0.35 * borner((n - 12) / 40, 0, 1)),
  };
}

/** Motif de la vague : le nouveau la première fois, sinon jamais le précédent. */
export function choisirMotif(m, n) {
  const neuf = MOTIFS.find(x => x.des === n);
  if (neuf) return neuf.nom;
  const r = reglagesVague(n);
  const choix = r.motifs.filter(x => x !== m.motif);
  const liste = choix.length ? choix : r.motifs;
  return liste[Math.floor(aleatoire(m) * liste.length)];
}

/** Départs des fruits selon le motif : [{delai, type, x0?, xFin?, sommet?, vol?}]. */
function departsFruits(m, r, motif, nb, vol) {
  const l = m.largeur;
  const bord = Math.min(RAYON_FRUIT + 6, l / 2);
  const utile = Math.max(0, l - 2 * bord);
  const d = [];
  if (motif === 'balayage') {
    const gauche = aleatoire(m) < 0.5;
    const pas = 0.1 + aleatoire(m) * 0.06;
    for (let i = 0; i < nb; i += 1) {
      const f = nb > 1 ? i / (nb - 1) : 0.5;
      const x0 = bord + utile * (gauche ? f : 1 - f);
      d.push({delai: i * pas, x0, xFin: x0 + (aleatoire(m) - 0.5) * 0.1 * l});
    }
  } else if (motif === 'croises') {
    let delai = 0;
    for (let i = 0; i < nb; i += 1) {
      if (i > 0 && i % 2 === 0) delai += 0.25 + aleatoire(m) * r.etalement;
      const a = bord + aleatoire(m) * 0.15 * l;
      const b = l - bord - aleatoire(m) * 0.15 * l;
      d.push(i % 2 === 0 ? {delai, x0: a, xFin: b} : {delai, x0: b, xFin: a});
    }
  } else if (motif === 'eventail') {
    const pas = 0.14 + aleatoire(m) * 0.06;
    const gauche = aleatoire(m) < 0.5;
    for (let i = 0; i < nb; i += 1) {
      const f = nb > 1 ? i / (nb - 1) : 0.5;
      d.push({
        delai: i * pas,
        x0: l / 2 + (aleatoire(m) - 0.5) * 0.1 * l,
        xFin: bord + utile * (gauche ? f : 1 - f),
      });
    }
  } else if (motif === 'salve' || motif === 'double') {
    const moitie = motif === 'double' ? Math.ceil(nb / 2) : nb;
    let delai = 0;
    for (let i = 0; i < nb; i += 1) {
      if (i === moitie) delai += 0.55 + aleatoire(m) * 0.25;
      else if (i > 0) delai += aleatoire(m) * 0.08;
      d.push({delai});
    }
  } else {
    // pluie, escorte, éclair : départs échelonnés.
    let delai = 0;
    for (let i = 0; i < nb; i += 1) {
      if (i > 0) delai += 0.08 + aleatoire(m) * r.etalement;
      d.push(
        motif === 'eclair'
          ? {delai, sommet: 0.4 + aleatoire(m) * 0.2, vol: 0.85}
          : {delai},
      );
    }
  }
  return d.map(x => ({
    ...x,
    type: 'fruit',
    vol: (x.vol || 0.92 + aleatoire(m) * 0.16) * vol,
  }));
}

/**
 * Escorte : le colis vole à côté du fruit, même départ, même arc, même
 * durée, à ECART_ESCORTE unités (moins sur un écran étroit, toujours bien
 * au-delà de la portée de la lame) : le fruit reste tranchable.
 */
function escorter(m, depart) {
  const l = m.largeur;
  const bord = Math.min(RAYON_FRUIT + 6, l / 2);
  const ecart = Math.max(0, Math.min(ECART_ESCORTE, l - 2 * bord));
  const gauche = bord + aleatoire(m) * Math.max(0, l - 2 * bord - ecart);
  const droite = gauche + ecart;
  const fruitAGauche = aleatoire(m) < 0.5;
  const derive =
    (aleatoire(m) - 0.5) * 2 * Math.min(gauche - bord, l - bord - droite);
  depart.x0 = fruitAGauche ? gauche : droite;
  depart.xFin = depart.x0 + derive;
  depart.sommet = depart.sommet || 0.52 + aleatoire(m) * 0.33;
  const x0 = fruitAGauche ? droite : gauche;
  return {
    delai: depart.delai,
    type: 'fragile',
    x0,
    xFin: x0 + derive,
    sommet: depart.sommet,
    vol: depart.vol,
  };
}

/**
 * Chance qu'un bonus (glaçon, étoile, bouclier) se joigne à la vague `v` :
 * 0 avant la vague 4, puis 22 % qui montent avec la difficulté (40 % au plus).
 */
export function probaBonus(v) {
  const n = Math.max(1, Math.floor(v));
  if (n < VAGUE_PREMIER_BONUS) return 0;
  return Math.min(
    0.4,
    0.22 + 0.18 * borner((n - VAGUE_PREMIER_BONUS) / 40, 0, 1),
  );
}

/** Bonus proposables : jamais celui qui est déjà actif (bouclier gardé, minuteur en cours). */
export function bonusPossibles(m) {
  return BONUS.filter(
    b =>
      (b !== 'bouclier' || !m.bouclier) &&
      (b !== 'glacon' || m.ralenti <= 0) &&
      (b !== 'etoile' || m.double <= 0),
  );
}

/** Ajoute des points sans jamais dépasser SCORE_MAX. */
function marquer(m, n) {
  m.score = Math.min(SCORE_MAX, m.score + n);
}

/**
 * Chance qu'un cœur doré se joigne à la vague `v` quand il reste `vies` vies.
 * 0 avant la vague 4 et à pleine vie ; ensuite 6 % qui montent avec la
 * difficulté (jusqu'à 18 %), +5 % à 2 vies, +30 % à 1 vie.
 */
export function probaCoeur(v, vies) {
  const n = Math.max(1, Math.floor(v));
  if (n < 4 || vies >= VIES) return 0;
  const p = borner((n - 1) / 30, 0, 1);
  const urgence = vies <= 1 ? 0.3 : 0.05;
  return Math.min(0.6, 0.06 + 0.12 * p + urgence);
}

export function creerMonde(largeur, graine = Date.now()) {
  return {
    largeur: Math.max(300, largeur || 500),
    graine: graine | 0,
    phase: 'jeu',
    t: 0,
    score: 0,
    vies: VIES,
    vague: 0,
    tranches: 0, // fruits tranchés
    rates: 0, // fruits retombés
    coeurs: 0, // cœurs dorés tranchés
    meilleurCombo: 0,
    bonus: 0, // bonus tranchés (glaçon, étoile, bouclier)
    ralenti: 0, // s de ralenti restantes
    double: 0, // s de points doublés restantes
    bouclier: false, // un colis fragile sera pardonné
    vagueBonus: -99, // dernière vague où un bonus est parti
    objets: [], // fruits et colis fragiles entiers
    morceaux: [], // moitiés de fruits qui retombent
    file: [], // départs prévus de la vague en cours { delai, type }
    tVague: 0,
    vagueCoeur: -99, // dernière vague où un cœur est parti
    attente: 0.8, // avant la première vague
    gravite: 0,
    combo: {n: 0, dernier: 0, x: 0, y: 0},
    tempsArret: 0,
    prochainId: 1,
  };
}

export function changerLargeur(m, largeur) {
  m.largeur = Math.max(300, largeur || m.largeur);
}

function rayonType(type) {
  return type === 'fragile'
    ? RAYON_FRAGILE
    : type === 'coeur'
      ? RAYON_COEUR
      : estBonus(type)
        ? RAYON_BONUS
        : RAYON_FRUIT;
}

/** Tire ce qui manque au trajet (mêmes lois que lancer), pour le connaître d'avance. */
function completerTrajet(m, d, r) {
  const l = m.largeur;
  const debutant = m.vague <= 1;
  const bord = Math.min(rayonType(d.type) + 6, l / 2);
  d.x0 = borner(
    d.x0 ??
      l * (debutant ? 0.3 + aleatoire(m) * 0.4 : 0.12 + aleatoire(m) * 0.76),
    bord,
    l - bord,
  );
  d.xFin = borner(
    d.xFin ??
      l * (debutant ? 0.35 + aleatoire(m) * 0.3 : 0.1 + aleatoire(m) * 0.8),
    bord,
    l - bord,
  );
  d.sommet = d.sommet ?? 0.52 + aleatoire(m) * 0.33;
  d.vol = d.vol ?? 0.92 + aleatoire(m) * 0.16;
  d.duree = Math.max(DUREE_VOL_MIN, r.duree * d.vol);
  return d;
}

/** Position (unités) d'un départ complété au temps de vague t, null hors vol. */
function positionDepart(d, t) {
  const u = t - d.delai;
  if (u < 0 || u > d.duree) return null;
  const demi = d.duree / 2;
  const s = HAUTEUR * d.sommet;
  const g = (2 * s) / (demi * demi);
  return {
    x: d.x0 + ((d.xFin - d.x0) / d.duree) * u,
    y: HAUTEUR + rayonType(d.type) - (g * demi * u - (g * u * u) / 2),
  };
}

// Fruit tranchable : bien visible, à plus de la portée de la lame (marges
// comprises, plus une aisance) de tout colis, pendant au moins FENETRE_SURE s.
const PORTEE_SURE =
  RAYON_FRUIT * MARGE_FRUIT + RAYON_FRAGILE * MARGE_FRAGILE + 25;
export const FENETRE_SURE = 0.3;

function fruitsTranchables(fruits, colis) {
  const pas = 1 / 60;
  return fruits.every(f => {
    let suite = 0;
    for (let u = 0; u <= f.duree; u += pas) {
      const t = f.delai + u;
      const p = positionDepart(f, t);
      const visible = p && p.y > 120 && p.y < 930;
      const libre =
        visible &&
        colis.every(c => {
          const q = positionDepart(c, t);
          return !q || Math.hypot(q.x - p.x, q.y - p.y) > PORTEE_SURE;
        });
      suite = libre ? suite + pas : 0;
      if (suite >= FENETRE_SURE) return true;
    }
    return false;
  });
}

/** Prépare la vague suivante (file de départs, triée par délai). */
export function nouvelleVague(m, ev) {
  m.vague += 1;
  m.tVague = 0;
  m.attente = null;
  const r = reglagesVague(m.vague);
  const motif = choisirMotif(m, m.vague);
  m.motif = motif;
  let nbFragiles = 0;
  if (r.maxFragiles > 0 && aleatoire(m) < r.probaFragile)
    nbFragiles = 1 + Math.floor(aleatoire(m) * r.maxFragiles);
  if (motif === 'escorte')
    nbFragiles = Math.max(1, Math.min(nbFragiles, r.fruits));
  const vol = aleatoire(m) < r.rapide ? 0.88 : 1;
  const fruits = departsFruits(m, r, motif, r.fruits, vol);
  const escortes =
    motif === 'escorte'
      ? fruits.slice(0, nbFragiles).map(f => escorter(m, f))
      : [];
  const fin0 = fruits.reduce((a, x) => Math.max(a, x.delai), 0) + 0.2;
  fruits.forEach(f => completerTrajet(m, f, r));
  // Colis : chacun gardé seulement s'il laisse à chaque fruit un moment
  // tranchable, sinon redessiné (8 essais) puis abandonné.
  const colis = [];
  for (let i = 0; i < nbFragiles; i += 1) {
    for (let essai = 0; essai < 8; essai += 1) {
      const c = completerTrajet(
        m,
        escortes[i] || {type: 'fragile', delai: aleatoire(m) * fin0},
        r,
      );
      if (fruitsTranchables(fruits, colis.concat([c]))) {
        colis.push(c);
        break;
      }
      if (escortes[i]) break;
    }
  }
  const autres = colis.slice();
  if (
    m.vague - m.vagueCoeur > VAGUES_ENTRE_COEURS &&
    !m.objets.some(o => o.type === 'coeur') &&
    aleatoire(m) < probaCoeur(m.vague, m.vies)
  ) {
    autres.push({type: 'coeur'});
    m.vagueCoeur = m.vague;
  }
  const possibles = bonusPossibles(m);
  if (
    possibles.length &&
    m.vague - m.vagueBonus > VAGUES_ENTRE_BONUS &&
    !m.objets.some(o => estBonus(o.type)) &&
    aleatoire(m) < probaBonus(m.vague)
  ) {
    autres.push({type: possibles[Math.floor(aleatoire(m) * possibles.length)]});
    m.vagueBonus = m.vague;
  }
  // Cœur et bonus : n'importe quand pendant la vague.
  for (const x of autres) if (x.delai == null) x.delai = aleatoire(m) * fin0;
  m.file = fruits.concat(autres).sort((a, b) => a.delai - b.delai);
  ev.push({type: 'vague', n: m.vague});
}

/**
 * Lance un objet du bas de l'écran, en arc, pour retomber dans l'écran.
 * `trajet` (facultatif, donné par le motif) : x0, xFin en unités, sommet en
 * part de la hauteur, vol en multiple de la durée de la vague.
 */
export function lancer(m, type, trajet = {}) {
  const r = reglagesVague(m.vague);
  const l = m.largeur;
  const debutant = m.vague <= 1; // départs resserrés au centre, première vague seulement
  const rayon =
    type === 'fragile'
      ? RAYON_FRAGILE
      : type === 'coeur'
        ? RAYON_COEUR
        : estBonus(type)
          ? RAYON_BONUS
          : RAYON_FRUIT;
  // Départ et arrivée bornés : l'objet entier reste dans la largeur de l'écran.
  const bord = Math.min(rayon + 6, l / 2);
  const x0 = borner(
    trajet.x0 ??
      l * (debutant ? 0.3 + aleatoire(m) * 0.4 : 0.12 + aleatoire(m) * 0.76),
    bord,
    l - bord,
  );
  const xFin = borner(
    trajet.xFin ??
      l * (debutant ? 0.35 + aleatoire(m) * 0.3 : 0.1 + aleatoire(m) * 0.8),
    bord,
    l - bord,
  );
  // Sommet entre 52 % et 85 % de la hauteur (mesuré depuis le bas), sauf motif.
  const sommet = HAUTEUR * (trajet.sommet ?? 0.52 + aleatoire(m) * 0.33);
  const duree = Math.max(
    DUREE_VOL_MIN,
    r.duree * (trajet.vol ?? 0.92 + aleatoire(m) * 0.16),
  );
  const demi = duree / 2;
  const g = (2 * sommet) / (demi * demi);
  const o = {
    id: m.prochainId,
    type,
    sorte: type === 'fruit' ? Math.floor(aleatoire(m) * FRUITS.length) : 0,
    r: rayon,
    x: x0,
    y: HAUTEUR + rayon,
    vx: (xFin - x0) / duree,
    vy: -g * demi,
    g,
    rot:
      type === 'coeur' || estBonus(type)
        ? (aleatoire(m) - 0.5) * 30
        : aleatoire(m) * 360,
    vr:
      (aleatoire(m) - 0.5) *
      (type === 'fragile'
        ? 160
        : type === 'coeur' || estBonus(type)
          ? 90
          : 320),
  };
  m.prochainId += 1;
  m.gravite = g;
  m.objets.push(o);
  return o;
}

/** Distance du point (cx, cy) au segment [a, b] inférieure ou égale à r. */
export function segmentTouche(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let u = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  u = borner(u, 0, 1);
  const px = ax + u * dx - cx;
  const py = ay + u * dy - cy;
  return px * px + py * py <= r * r;
}

function couper(m, o, angle, ev) {
  // Normale à la lame : les deux moitiés s'écartent de part et d'autre.
  const rad = (angle * Math.PI) / 180;
  const nx = Math.sin(rad);
  const ny = -Math.cos(rad);
  for (const cote of [-1, 1]) {
    m.morceaux.push({
      id: m.prochainId,
      sorte: o.sorte,
      cote,
      r: o.r,
      x: o.x + cote * nx * o.r * 0.5,
      y: o.y + cote * ny * o.r * 0.5,
      vx: o.vx + cote * nx * 130,
      vy: Math.min(o.vy, 0) * 0.3 + cote * ny * 130,
      g: Math.max(o.g, 900),
      rot: angle - 90,
      vr: cote * (90 + aleatoire(m) * 140),
    });
    m.prochainId += 1;
  }
  m.tranches += 1;
  const points = POINTS_FRUIT * (m.double > 0 ? 2 : 1);
  marquer(m, points);
  const c = m.combo;
  if (c.n > 0 && m.t - c.dernier <= FENETRE_COMBO) c.n += 1;
  else {
    finirCombo(m, ev);
    c.n = 1;
  }
  c.dernier = m.t;
  c.x = o.x;
  c.y = o.y;
  ev.push({type: 'tranche', x: o.x, y: o.y, sorte: o.sorte, angle, points});
}

/** Clôt le combo en cours : bonus égal au nombre de fruits (2 ou plus). */
export function finirCombo(m, ev) {
  const c = m.combo;
  if (c.n >= COMBO_MIN) {
    const bonus = c.n;
    marquer(m, bonus);
    m.meilleurCombo = Math.max(m.meilleurCombo, c.n);
    ev.push({type: 'combo', n: c.n, bonus, x: c.x, y: c.y});
  }
  c.n = 0;
}

/**
 * Passage de la lame du point a au point b (unités). Rend les événements :
 * tranche, combo, casse, liste.
 */
export function lame(m, ax, ay, bx, by) {
  const ev = [];
  if (m.phase !== 'jeu') return ev;
  if (Math.abs(bx - ax) + Math.abs(by - ay) < 2) return ev;
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const restants = [];
  let changement = false;
  for (const o of m.objets) {
    const marge =
      o.type === 'fragile'
        ? MARGE_FRAGILE
        : o.type === 'coeur'
          ? MARGE_COEUR
          : estBonus(o.type)
            ? MARGE_BONUS
            : MARGE_FRUIT;
    if (
      m.phase === 'jeu' &&
      segmentTouche(ax, ay, bx, by, o.x, o.y, o.r * marge)
    ) {
      changement = true;
      if (o.type === 'fragile' && m.bouclier) {
        // Bouclier : le colis est pardonné (il disparaît), la partie continue.
        m.bouclier = false;
        ev.push({type: 'protege', x: o.x, y: o.y, id: o.id});
      } else if (o.type === 'fragile') {
        m.phase = 'casse';
        m.tempsArret = 0;
        finirCombo(m, ev);
        ev.push({type: 'casse', x: o.x, y: o.y, id: o.id});
        restants.push(o); // le carton reste affiché, fendu
        o.casse = true;
      } else if (o.type === 'coeur') {
        // Cœur doré tranché : une vie de plus (3 au plus), il disparaît.
        m.vies = Math.min(VIES, m.vies + 1);
        m.coeurs += 1;
        ev.push({type: 'vie', x: o.x, y: o.y, vies: m.vies});
      } else if (estBonus(o.type)) {
        m.bonus += 1;
        if (o.type === 'glacon') m.ralenti = DUREE_RALENTI;
        else if (o.type === 'etoile') m.double = DUREE_DOUBLE;
        else m.bouclier = true;
        ev.push({type: 'bonus', sorte: o.type, x: o.x, y: o.y});
      } else {
        couper(m, o, angle, ev);
      }
    } else {
      restants.push(o);
    }
  }
  m.objets = restants;
  if (changement) ev.push({type: 'liste'});
  return ev;
}

/** État à sauvegarder (partie en cours, à la pause) : on repart au début de la vague. */
export function etatSauvegarde(m) {
  return {
    vague: Math.max(1, m.vague, m.vagueReprise || 0),
    score: m.score,
    vies: m.vies,
    bouclier: !!m.bouclier,
    ralenti: Math.max(0, m.ralenti || 0),
    double: Math.max(0, m.double || 0),
  };
}

/** Monde repris d'une sauvegarde : même score, mêmes vies, la vague recommence. */
export function mondeRepris(largeur, etat, graine = Date.now()) {
  const m = creerMonde(largeur, graine);
  const e = etat || {};
  m.vagueReprise = Math.max(1, Math.floor(Number(e.vague) || 1));
  m.vague = m.vagueReprise - 1;
  m.score = borner(Math.floor(Number(e.score) || 0), 0, SCORE_MAX);
  m.vies = borner(Math.floor(Number(e.vies) || VIES), 1, VIES);
  m.bouclier = e.bouclier === true;
  m.ralenti = borner(Number(e.ralenti) || 0, 0, DUREE_RALENTI);
  m.double = borner(Number(e.double) || 0, 0, DUREE_DOUBLE);
  return m;
}

/** Doigt levé : le combo du geste est clos. */
export function finGeste(m) {
  const ev = [];
  if (m.phase === 'jeu') finirCombo(m, ev);
  return ev;
}

/**
 * Avance le monde de `dt` secondes (borné à DT_MAX). Rend la liste des
 * événements : vague, liste, rate (vie perdue), combo, finBonus, fin.
 */
export function avancer(m, dtBrut) {
  const ev = [];
  const dt = borner(Number(dtBrut) || 0, 0, DT_MAX);
  if (m.phase === 'fini') return ev;
  m.t += dt;

  if (m.phase === 'casse' || m.phase === 'perdu') {
    m.tempsArret += dt;
    // Les moitiés finissent de tomber, le reste est figé.
    if (m.phase === 'perdu' && bougerMorceaux(m, dt)) ev.push({type: 'liste'});
    const casse = m.phase === 'casse';
    if (m.tempsArret >= (casse ? ATTENTE_CASSE : ATTENTE_PERDU)) {
      m.phase = 'fini';
      ev.push({type: 'fin', raison: casse ? 'casse' : 'vies'});
    }
    return ev;
  }

  // Combo clos si plus rien n'est tranché pendant la fenêtre.
  if (m.combo.n > 0 && m.t - m.combo.dernier > FENETRE_COMBO) finirCombo(m, ev);

  // Bonus à durée : minuteurs en temps de jeu réel, le monde ralentit sous le glaçon.
  const lent = m.ralenti > 0;
  if (m.ralenti > 0) {
    m.ralenti = Math.max(0, m.ralenti - dt);
    if (m.ralenti === 0) ev.push({type: 'finBonus', sorte: 'glacon'});
  }
  if (m.double > 0) {
    m.double = Math.max(0, m.double - dt);
    if (m.double === 0) ev.push({type: 'finBonus', sorte: 'etoile'});
  }
  const dm = lent ? dt * FACTEUR_RALENTI : dt; // temps du monde

  // Vagues : départs prévus, puis attente avant la suivante.
  let changement = false;
  if (m.file.length) {
    m.tVague += dm;
    while (m.file.length && m.file[0].delai <= m.tVague) {
      const depart = m.file.shift();
      lancer(m, depart.type, depart);
      changement = true;
    }
  } else if (m.objets.length === 0) {
    if (m.attente == null) m.attente = reglagesVague(m.vague).pause;
    m.attente -= dm;
    if (m.attente <= 0) nouvelleVague(m, ev);
  }

  // Objets entiers.
  const restants = [];
  for (const o of m.objets) {
    o.vy += o.g * dm;
    o.x += o.vx * dm;
    o.y += o.vy * dm;
    o.rot += o.vr * dm;
    if (o.vy > 0 && o.y - o.r > HAUTEUR) {
      changement = true;
      if (o.type === 'fruit') {
        m.vies = Math.max(0, m.vies - 1);
        m.rates += 1;
        ev.push({
          type: 'rate',
          x: borner(o.x, o.r, m.largeur - o.r),
          sorte: o.sorte,
          vies: m.vies,
        });
      }
    } else {
      restants.push(o);
    }
  }
  m.objets = restants;
  if (bougerMorceaux(m, dm)) changement = true;
  if (changement) ev.push({type: 'liste'});

  if (m.vies <= 0) {
    finirCombo(m, ev);
    m.phase = 'perdu';
    m.tempsArret = 0;
  }
  return ev;
}

function bougerMorceaux(m, dt) {
  const avant = m.morceaux.length;
  for (const p of m.morceaux) {
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  m.morceaux = m.morceaux.filter(p => p.y - p.r < HAUTEUR + 40);
  return m.morceaux.length !== avant;
}

// ---- Records du téléphone ----

/** Records vides ou réparés : {meilleurScore, meilleurNiveau}. */
export function nettoyerRecords(brut) {
  const r =
    brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  return {
    meilleurScore: Math.min(SCORE_MAX, entierJeu(r.meilleurScore)),
    meilleurNiveau: Math.max(1, entierJeu(r.meilleurNiveau, 1)),
  };
}

/** Records après une partie (score et vague atteinte), jamais en baisse. */
export function recordsApres(records, score, vague) {
  const r = nettoyerRecords(records);
  return {
    meilleurScore: Math.max(
      r.meilleurScore,
      Math.min(SCORE_MAX, entierJeu(score)),
    ),
    meilleurNiveau: Math.max(r.meilleurNiveau, entierJeu(vague, 1)),
  };
}

/** Une sauvegarde par compte client : USER_JEU_COUPE_V1_<idUser|local>. */
export function cleSauvegarde(idUser) {
  return cleSauvegardeJeu(JEU_COUPE, idUser);
}

export async function chargerRecords(cle) {
  try {
    const texte = await AsyncStorage.getItem(cle);
    if (!texte) return nettoyerRecords(null);
    return nettoyerRecords(JSON.parse(texte));
  } catch (e) {
    return nettoyerRecords(null);
  }
}

export async function enregistrerRecords(cle, records) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(nettoyerRecords(records)));
  } catch (e) {
    // Mémoire indisponible : nouvel essai à la prochaine partie.
  }
}
