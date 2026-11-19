/**
 * Rendu 3D du « Slalom urbain » : rue commerçante en perspective, vue de derrière le livreur.
 *
 * Aucune bibliothèque 3D : des View posées et mises à l'échelle par
 * Reanimated (fil d'interface, 60 images par seconde). Projection
 * « trou d'épingle » : un point (X latéral, Y hauteur, zr distance devant le
 * livreur) tombe à l'écran en x = cx + X * s, y = hy + (camH - Y) * s, avec
 * s = f / (zr + recul). La caméra est fixe, derrière et au-dessus du livreur.
 *
 * La route, les trottoirs et les façades sont des triangles fixes (bordures
 * de View) qui fuient vers le point de fuite ; ce qui défile (tirets, joints
 * du trottoir, fenêtres, lampadaires) est recyclé en boucle selon la seule
 * distance parcourue. Les objets du parcours (obstacles, véhicules en
 * tranches, colis, bonus) sont redessinés par React seulement quand la liste
 * change ; leur position est calculée à chaque image depuis `monde`.
 * Les passants, mamies et voitures qui traversent la rue se placent selon le
 * temps de jeu `monde.tj` (voir xMobile dans utils/jeux/slalom.js).
 *
 * Logo Pearl Streets, discret : un petit panneau translucide au bout de la
 * rue (fixe, dans le ciel entre les façades) et deux petites enseignes
 * drapeau translucides par côté, qui défilent comme les lampadaires.
 *
 * `geo` (partagé) : {W, H, cx, hy, f, camH, recul}. `monde` (partagé) :
 * {d, tj, jx, jy, sol, acc, tilt, aim, inv, t, pol, treb, vit}, écrit par l'écran
 * à chaque image (tj = temps de jeu pour la distance d, pol = secondes de
 * police restantes, vit = vitesse de course en m/s).
 */
import React, {memo} from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {Ionicons} from '@expo/vector-icons';
import {COULEURS_JEUX as C} from '../utils/jeux/commun';
import {PlaqueLogo, mesurePlaque, OPACITE_LOGO_DISCRET, LOGO_PEARL} from './jeux/FondJeu';
import {
  LARGEUR_VOIE,
  VOIES,
  VUE,
  H_ACCROUPI,
  H_DEBOUT,
  PORTEE_AIMANT,
  DUREE_POLICE,
  zRelatif,
} from '../utils/jeux/slalom';

export const RECUL = 7; // m entre la caméra et le coureur
const U = 40; // px par mètre des dessins de base (mis à l'échelle ensuite)
const DEMI_ROUTE = (VOIES * LARGEUR_VOIE) / 2;
const BORD_TROTTOIR = 0.18;
const FACADE = 6.4; // m : façades à cette distance de l'axe
const H_FACADE = 15;
const ROUTE = '#7A7F9C';
const ROUTE_BORD = '#F4F2EE';
const TROTTOIR = '#DCD5CA';
const CIEL = '#CFEAF8';
const CIEL_BAS = '#EAF6FC';
const MUR_DROITE = '#EBDCCB';
const MUR_GAUCHE = '#E2CDB6';
const VITRE = '#9FC9E3';
const ORANGE = '#FF6A13';
const BOIS = '#C98B4B';
const METAL = '#A9AFC2';
const CARROSSERIES = ['#E74C3C', '#2F80ED', '#F2B705', '#8E6CEF'];
const AUVENTS = ['#E74C3C', '#09D7AA', '#F2B705', '#8E6CEF', '#FF6A13'];
const CAMIONNETTES = ['#FFFFFF', '#F6F5F6', '#FFFFFF', '#EEF7FF'];

/** Géométrie de la scène selon la taille de la zone de jeu. */
export function geometrie(W, H) {
  const s0 = (0.88 * W) / (VOIES * LARGEUR_VOIE); // px par m à hauteur du livreur
  const hy = Math.round(H * 0.3);
  const yJoueur = H * 0.82;
  return {W, H, cx: W / 2, hy, f: s0 * RECUL, camH: (yJoueur - hy) / s0, recul: RECUL};
}

function clamp(x, a, b) {
  'worklet';
  return x < a ? a : x > b ? b : x;
}

/** Échelle (px par m) à la distance zr, ou 0 si derrière la caméra. */
function echelle(g, zr) {
  'worklet';
  const zc = zr + g.recul;
  return zc < 0.6 ? 0 : g.f / zc;
}

/** Brouillard au loin, effacement juste derrière le livreur. */
function visibilite(zr) {
  'worklet';
  return clamp((VUE + 6 - zr) / 18, 0, 1) * clamp((zr + 6.5) / 3, 0, 1);
}

/**
 * Transformations pour poser le bas-centre d'une View de base (bw x bh px)
 * au point écran (px, py), avec les échelles kx, ky.
 */
function poser(px, py, kx, ky, bw, bh) {
  'worklet';
  return [{translateX: px - bw / 2}, {translateY: py - bh / 2 - (ky * bh) / 2}, {scaleX: kx}, {scaleY: ky}];
}

/** Comme poser, suivi d'une rotation (un seul tableau, sans recopie). */
function poserTourne(px, py, kx, ky, bw, bh, rot) {
  'worklet';
  return [{translateX: px - bw / 2}, {translateY: py - bh / 2 - (ky * bh) / 2}, {scaleX: kx}, {scaleY: ky}, {rotate: `${rot}deg`}];
}

// Objets de style constants : Reanimated compare les styles par référence,
// renvoyer toujours le même objet évite toute mise à jour native.
const CACHE = {opacity: 0, transform: [{translateX: -9999}]};
// Membre au repos (rotation nulle), aussi pour un membre dont le parent est caché.
const IMMOBILE = {transform: [{rotate: '0deg'}]};

/** Distance devant le livreur (version worklet de zRelatif). */
function zObjet(o, d) {
  'worklet';
  return (o.z - d) * (1 + (o.r || 0));
}

function modulo(a, n) {
  'worklet';
  const m = a % n;
  return m < 0 ? m + n : m;
}

/**
 * Position latérale (m) d'un objet : voie fixe, ou position de l'obstacle qui
 * traverse la rue (selon le temps de jeu `tj`), plus le glissement d'un
 * obstacle écarté par un choc.
 */
function xMetres(o, m) {
  'worklet';
  let x = (o.voie - 1) * LARGEUR_VOIE;
  if (o.mobile) {
    const dt = m.tj - o.tau;
    const xv = o.x0 + o.vx * (dt > 0 ? dt : 0);
    const fin = 2 - o.x0;
    x = ((o.vx > 0 ? Math.min(xv, fin) : Math.max(xv, fin)) - 1) * LARGEUR_VOIE;
  }
  if (o.ej) x += o.ej.sens * Math.min(Math.max(0, m.t - o.ej.t0) * 6, 7);
  return x;
}

/** Inclinaison (degrés) et transparence d'un obstacle écarté par un choc. */
function chute(o, m) {
  'worklet';
  if (!o.ej) return {rot: 0, fondu: 1};
  const dt = Math.max(0, m.t - o.ej.t0);
  return {rot: o.ej.sens * Math.min(dt * 260, 75), fondu: clamp(1.6 - dt, 0, 1)};
}

/** Position recyclée d'un élément de décor : de -derriere à n * periode - derriere. */
function emplacement(j, periode, n, d, derriere) {
  'worklet';
  return modulo(j * periode - d, n * periode) - derriere;
}

// Décor fixe -------------------------------------------------------------

/** Triangle dont la pointe est au point de fuite et la base au bas de l'écran. */
function Triangle({g, demi, couleur}) {
  const bas = g.H - g.hy;
  const demiBas = (demi * bas) / g.camH;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: g.cx - demiBas,
        top: g.hy,
        width: 0,
        height: 0,
        borderLeftWidth: demiBas,
        borderRightWidth: demiBas,
        borderBottomWidth: bas,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: couleur,
      }}
    />
  );
}

/**
 * Façade d'un côté de la rue : un mur parallèle à la route, vu en fuite.
 * Triangle entre le point de fuite et le bord vertical du mur au premier plan.
 */
function Facade({g, cote}) {
  const s = g.f / 1.2; // mur coupé à 1,2 m devant la caméra
  const x = cote * FACADE * s;
  const yBas = g.camH * s;
  const yHaut = (g.camH - Math.max(H_FACADE, g.camH + 3)) * s;
  const style = {
    position: 'absolute',
    top: g.hy + yHaut,
    width: 0,
    height: 0,
    borderTopWidth: -yHaut,
    borderBottomWidth: yBas,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  };
  if (cote > 0) {
    Object.assign(style, {left: g.cx, borderRightWidth: x, borderRightColor: MUR_DROITE});
  } else {
    Object.assign(style, {left: g.cx + x, borderLeftWidth: -x, borderLeftColor: MUR_GAUCHE});
  }
  return <View pointerEvents="none" style={style} />;
}

/** Tiret blanc entre deux voies (segment de zr à zr + 2,6 m). */
const Tiret = memo(function Tiret({geo, monde, X, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 8, 12, monde.value.d, 8);
    // Hors champ (brouillard ou derrière) : rien à calculer ni à envoyer.
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const zr2 = zr + 2.6;
    const s1 = echelle(g, Math.max(zr, -g.recul + 1));
    const s2 = echelle(g, zr2);
    if (!s1 || !s2) return CACHE;
    const x1 = g.cx + X * s1;
    const y1 = g.hy + g.camH * s1;
    const x2 = g.cx + X * s2;
    const y2 = g.hy + g.camH * s2;
    const dx = x1 - x2;
    const dy = y1 - y2;
    const long = Math.sqrt(dx * dx + dy * dy);
    const large = 0.14 * (s1 + s2) * 0.5;
    return {
      opacity: vis * 0.9,
      transform: [
        {translateX: (x1 + x2) / 2 - 5},
        {translateY: (y1 + y2) / 2 - 50},
        {rotate: `${-Math.atan2(dx, dy)}rad`},
        {scaleX: large / 10},
        {scaleY: long / 100},
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.tiret, style]} />;
});

/** Joint du trottoir (ligne en travers de toute la largeur, sous la route). */
const Joint = memo(function Joint({geo, monde, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 3.2, 30, monde.value.d, 8);
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const s = echelle(g, zr);
    if (!s) return CACHE;
    return {
      opacity: vis,
      transform: [{translateY: g.hy + g.camH * s}, {scaleY: Math.max(1, 0.07 * s)}],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.joint, style]} />;
});

/** Travée de fenêtres sur une façade (rectangle étroit à la distance zr). */
const Fenetres = memo(function Fenetres({geo, monde, cote, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 5, 19, monde.value.d, 6) + (cote > 0 ? 0 : 2.5);
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const s1 = echelle(g, zr);
    const s2 = echelle(g, zr + 2.2);
    if (!s1 || !s2) return CACHE;
    const x1 = g.cx + cote * FACADE * s1;
    const x2 = g.cx + cote * FACADE * s2;
    const sm = (s1 + s2) / 2;
    const large = Math.abs(x1 - x2);
    return {
      opacity: vis,
      transform: poser((x1 + x2) / 2, g.hy + g.camH * sm, large / 40, (sm * H_FACADE) / (U * H_FACADE / 4), 40, (U * H_FACADE) / 4),
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.travee, style]}>
      {[0, 1, 2, 3].map(k => (
        <View key={k} style={[styles.fenetre, k === 3 && styles.vitrine, j % 3 === 0 && k === 3 && styles.porte]}>
          {k === 3 && <View style={[styles.auvent, {backgroundColor: AUVENTS[(j + (cote > 0 ? 2 : 0)) % AUVENTS.length]}]} />}
        </View>
      ))}
    </Animated.View>
  );
});

/** Lampadaire au bord du trottoir. */
const Lampadaire = memo(function Lampadaire({geo, monde, cote, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 22, 5, monde.value.d, 8) + (cote > 0 ? 0 : 11);
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const s = echelle(g, zr);
    if (!s) return CACHE;
    const k = s / U;
    return {
      opacity: vis,
      transform: poser(g.cx + cote * (DEMI_ROUTE + 1.1) * s, g.hy + g.camH * s, -cote * k, k, U, 4.6 * U),
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.lampadaire, style]}>
      <View style={styles.lampeBras} />
      <View style={styles.lampeTete} />
      <View style={styles.lampeMat} />
    </Animated.View>
  );
});

/**
 * Petit panneau du logo au bout de la rue, translucide : posé dans le ciel
 * visible entre les deux façades (le « V » qui s'ouvre vers le haut), sur un mât.
 */
function PanneauLoin({g}) {
  const s = g.f / 1.2;
  const x = FACADE * s;
  const yHaut = (g.camH - Math.max(H_FACADE, g.camH + 3)) * s;
  const yBas = Math.round(g.hy * 0.45); // bas du panneau
  const ciel = (2 * x * (g.hy - yBas)) / -yHaut; // largeur libre à cette hauteur
  const l = Math.min(ciel * 0.94, g.W * 0.17);
  const h = Math.max(24, Math.min((l - 8) / 1.82, yBas - 6));
  const m = mesurePlaque(h);
  return (
    <View pointerEvents="none" style={[styles.panneauLoin, {top: yBas - m.h, height: g.hy - yBas + m.h, opacity: OPACITE_LOGO_DISCRET}]}>
      <View style={[styles.mat, {top: m.h, height: g.hy - yBas}]} />
      <PlaqueLogo hauteur={m.h} />
    </View>
  );
}

const ENSEIGNE_M = 1.1; // m de large (petite, discrète)
const ENSEIGNE_OPACITE = 0.45;
const ENSEIGNE_BW = 200; // px du dessin de base
const ENSEIGNE_PLAQUE = mesurePlaque((ENSEIGNE_BW - 8) / 1.82).h;
const ENSEIGNE_BH = ENSEIGNE_PLAQUE + 16;

/** Petite enseigne drapeau translucide au logo, accrochée à une façade, face au livreur. */
const Enseigne = memo(function Enseigne({geo, monde, cote, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 52, 2, monde.value.d, 8) + (cote > 0 ? 6 : 32);
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const s = echelle(g, zr);
    if (!s) return CACHE;
    const k = (s * ENSEIGNE_M) / ENSEIGNE_BW;
    return {
      opacity: vis * ENSEIGNE_OPACITE,
      transform: poser(g.cx + cote * (FACADE - 1.5) * s, g.hy + (g.camH - 3.4) * s, k, k, ENSEIGNE_BW, ENSEIGNE_BH),
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.enseigne, style]}>
      <View style={[styles.potence, cote > 0 ? {right: -24} : {left: -24}]} />
      <View style={styles.chaines}>
        <View style={styles.chaine} />
        <View style={styles.chaine} />
      </View>
      <PlaqueLogo hauteur={ENSEIGNE_PLAQUE} />
    </Animated.View>
  );
});

/** Passage piéton en travers de la rue (bandes blanches). */
const Zebra = memo(function Zebra({geo, monde, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 70, 2, monde.value.d, 8) + 20;
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const s1 = echelle(g, zr);
    const s2 = echelle(g, zr + 3);
    if (!s1 || !s2) return CACHE;
    const y1 = g.hy + g.camH * s1;
    const y2 = g.hy + g.camH * s2;
    const sm = (s1 + s2) / 2;
    return {
      opacity: vis,
      transform: [
        {translateX: g.cx - 50},
        {translateY: (y1 + y2) / 2 - 50},
        {scaleX: (2 * DEMI_ROUTE * sm) / 100},
        {scaleY: Math.max(2, y1 - y2) / 100},
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.zebra, style]}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => (
        <View key={k} style={[styles.zebraBande, k % 2 === 1 && {backgroundColor: 'transparent'}]} />
      ))}
    </Animated.View>
  );
});

const PARASOLS = ['#E74C3C', '#F2B705', '#09D7AA', '#8E6CEF'];

/** Terrasse de café sur le trottoir : table ronde et parasol. */
const Terrasse = memo(function Terrasse({geo, monde, cote, j}) {
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const zr = emplacement(j, 17, 6, monde.value.d, 8) + (cote > 0 ? 4 : 11);
    const vis = visibilite(zr);
    if (vis <= 0) return CACHE;
    const s = echelle(g, zr);
    if (!s) return CACHE;
    const k = s / U;
    return {
      opacity: vis,
      transform: poser(g.cx + cote * (DEMI_ROUTE + 2.1) * s, g.hy + g.camH * s, k, k, U * 1.6, U * 1.9),
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.terrasse, style]}>
      <View style={styles.pied1} />
      <View style={styles.table} />
      <View style={styles.chaise} />
      <View style={[styles.chaise, {left: undefined, right: 4}]} />
      <View style={styles.mat2} />
      <View style={[styles.parasol, {backgroundColor: PARASOLS[(j + (cote > 0 ? 1 : 0)) % PARASOLS.length]}]} />
    </Animated.View>
  );
});

const DECOR = {
  tirets: Array.from({length: 12}, (_, j) => j),
  joints: Array.from({length: 30}, (_, j) => j),
  fenetres: Array.from({length: 19}, (_, j) => j),
  lampadaires: Array.from({length: 5}, (_, j) => j),
  enseignes: [0, 1],
  terrasses: Array.from({length: 6}, (_, j) => j),
  zebras: [0, 1],
};

/** Ciel, sol, route, façades et tout ce qui défile : jamais redessiné. */
export const Decor = memo(function Decor({g, geo, monde}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.ciel, {height: g.hy + 2}]}>
        <View style={styles.cielBas} />
      </View>
      <View style={[styles.sol, {top: g.hy}]} />
      {DECOR.joints.map(j => (
        <Joint key={`j${j}`} geo={geo} monde={monde} j={j} />
      ))}
      <Triangle g={g} demi={DEMI_ROUTE + BORD_TROTTOIR} couleur={ROUTE_BORD} />
      <Triangle g={g} demi={DEMI_ROUTE} couleur={ROUTE} />
      {[-1, 1].map(c =>
        DECOR.tirets.map(j => <Tiret key={`t${c}${j}`} geo={geo} monde={monde} X={(c * LARGEUR_VOIE) / 2} j={j} />),
      )}
      {DECOR.zebras.map(j => (
        <Zebra key={`z${j}`} geo={geo} monde={monde} j={j} />
      ))}
      <View style={[styles.brume, {top: g.hy - 14}]} />
      <PanneauLoin g={g} />
      <Facade g={g} cote={-1} />
      <Facade g={g} cote={1} />
      {[-1, 1].map(c => DECOR.fenetres.map(j => <Fenetres key={`f${c}${j}`} geo={geo} monde={monde} cote={c} j={j} />))}
      {[-1, 1].map(c => DECOR.enseignes.map(j => <Enseigne key={`e${c}${j}`} geo={geo} monde={monde} cote={c} j={j} />))}
      {[-1, 1].map(c =>
        DECOR.terrasses.map(j => <Terrasse key={`r${c}${j}`} geo={geo} monde={monde} cote={c} j={j} />),
      )}
      {[-1, 1].map(c =>
        DECOR.lampadaires.map(j => <Lampadaire key={`l${c}${j}`} geo={geo} monde={monde} cote={c} j={j} />),
      )}
    </View>
  );
});

// Objets du parcours -----------------------------------------------------

/**
 * Tranche d'un objet en volume : face verticale (largeur x hauteur, en m) à
 * `decal` m derrière l'avant de l'objet. Un véhicule est une pile de
 * tranches dessinées du fond vers l'avant : le toit apparaît en escalier.
 */
const Tranche = memo(function Tranche({
  geo,
  monde,
  o,
  decal,
  largeur,
  hauteur,
  base = 0,
  style: styleBase,
  dessus,
  children,
}) {
  const bw = largeur * U;
  const bh = hauteur * U;
  // Dessus : bande entre le haut de cette tranche et celui de la suivante
  // (plus proche), posée sous la tranche. Près de la caméra, l'écart entre
  // deux tranches dépasse leur hauteur : sans elle, la route se voit à travers.
  const styleDessus = useAnimatedStyle(() => {
    if (!dessus) return CACHE;
    const g = geo.value;
    const m = monde.value;
    const z0 = zObjet(o, m.d);
    // Hors champ ou fondu terminé : rien à calculer ni à envoyer.
    const op = visibilite(z0 + decal) * chute(o, m).fondu;
    if (op <= 0) return CACHE;
    const X = xMetres(o, m);
    const s1 = echelle(g, z0 + decal);
    const s2 = echelle(g, z0 + dessus.decal);
    if (!s1 || !s2) return CACHE;
    const x1 = g.cx + X * s1;
    const y1 = g.hy + (g.camH - base - hauteur) * s1;
    const x2 = g.cx + X * s2;
    const y2 = g.hy + (g.camH - base - dessus.hauteur) * s2;
    const h = y2 - y1;
    if (h < 1) return CACHE;
    return {
      opacity: op,
      transform: [
        {translateX: (x1 + x2) / 2 - bw / 2},
        {translateY: (y1 + y2) / 2 - 50},
        {skewX: `${Math.atan2(x2 - x1, h)}rad`},
        {scaleX: (largeur * (s1 + s2)) / 2 / bw},
        {scaleY: h / 100},
      ],
    };
  });
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const m = monde.value;
    const zr = zObjet(o, m.d) + decal;
    const ch = chute(o, m);
    const op = visibilite(zr) * ch.fondu;
    if (op <= 0) return CACHE;
    const s = echelle(g, zr);
    if (!s) return CACHE;
    const X = xMetres(o, m);
    const k = s / U;
    return {
      opacity: op,
      transform: poserTourne(g.cx + X * s, g.hy + (g.camH - base) * s, k, k, bw, bh, ch.rot),
    };
  });
  return (
    <>
      {dessus && (
        <Animated.View
          pointerEvents="none"
          style={[styles.dessus, {width: bw, backgroundColor: dessus.couleur}, styleDessus]}>
          <View style={styles.dessusClair} />
        </Animated.View>
      )}
      <Animated.View pointerEvents="none" style={[styles.tranche, {width: bw, height: bh}, styleBase, style]}>
        {children}
      </Animated.View>
    </>
  );
});

function Voiture({geo, monde, o}) {
  const corps = CARROSSERIES[o.variante % CARROSSERIES.length];
  const enFace = o.r > 0;
  const n = 5;
  const tranches = [];
  for (let i = 0; i < n; i += 1) {
    const decal = (o.longueur * (n - 1 - i)) / (n - 1);
    const avant = i === n - 1;
    // Le toit est plus court que la caisse : capot et coffre plus bas.
    const milieu = i > 0 && i < n - 1;
    const hauteurDe = j => (j > 0 && j < n - 1 ? o.h : o.h * 0.62);
    tranches.push(
      <Tranche
        key={i}
        geo={geo}
        monde={monde}
        o={o}
        decal={decal}
        largeur={1.8}
        hauteur={milieu ? o.h : o.h * 0.62}
        dessus={avant ? null : {decal: (o.longueur * (n - 2 - i)) / (n - 1), hauteur: hauteurDe(i + 1), couleur: corps}}
        style={{backgroundColor: corps}}>
        <View style={styles.toitClair} />
        {avant && (
          <>
            <View style={[styles.feux, {backgroundColor: enFace ? '#FFF6C2' : '#FF4D3D'}]} />
            <View style={[styles.feux, styles.feuDroit, {backgroundColor: enFace ? '#FFF6C2' : '#FF4D3D'}]} />
            <View style={styles.plaque} />
            <View style={styles.roue} />
            <View style={[styles.roue, styles.roueDroite]} />
          </>
        )}
        {i === n - 2 && <View style={styles.pareBrise} />}
      </Tranche>,
    );
  }
  return tranches;
}

function Camionnette({geo, monde, o}) {
  const corps = CAMIONNETTES[o.variante % CAMIONNETTES.length];
  const enFace = o.r > 0;
  const n = 7;
  const tranches = [];
  for (let i = 0; i < n; i += 1) {
    const decal = (o.longueur * (n - 1 - i)) / (n - 1);
    const avant = i === n - 1;
    tranches.push(
      <Tranche
        key={i}
        geo={geo}
        monde={monde}
        o={o}
        decal={decal}
        largeur={2.0}
        hauteur={o.h}
        dessus={avant ? null : {decal: (o.longueur * (n - 2 - i)) / (n - 1), hauteur: o.h, couleur: '#E3E5EC'}}
        style={{backgroundColor: corps, borderColor: C.bordureForte, borderWidth: 1}}>
        <View style={styles.toitCamion} />
        <View style={styles.bandeMarque} />
        {avant && (
          <>
            {enFace ? (
              <View style={styles.pareBriseCamion} />
            ) : (
              <View style={styles.portesArriere}>
                <Text style={styles.logoCamion}>P</Text>
              </View>
            )}
            <View style={[styles.feux, styles.feuxCamion, {backgroundColor: enFace ? '#FFF6C2' : '#FF4D3D'}]} />
            <View
              style={[styles.feux, styles.feuxCamion, styles.feuDroit, {backgroundColor: enFace ? '#FFF6C2' : '#FF4D3D'}]}
            />
            <View style={styles.roue} />
            <View style={[styles.roue, styles.roueDroite]} />
          </>
        )}
      </Tranche>
    );
  }
  return tranches;
}

function Rampe({geo, monde, o}) {
  const n = 6;
  const tranches = [];
  for (let i = 0; i < n; i += 1) {
    const f = (n - i) / n; // du haut (fond) vers le bas (avant)
    const f2 = (n - i - 1) / n;
    const couleur = i % 2 ? '#F2B705' : '#E0A800';
    tranches.push(
      <Tranche
        key={i}
        geo={geo}
        monde={monde}
        o={o}
        decal={o.longueur * f - 0.05}
        largeur={1.9}
        hauteur={Math.max(0.08, o.h * f)}
        dessus={i < n - 1 ? {decal: o.longueur * f2 - 0.05, hauteur: Math.max(0.08, o.h * f2), couleur} : null}
        style={{backgroundColor: couleur}}>
        <View style={styles.rampeBord} />
      </Tranche>,
    );
  }
  return tranches;
}

const MANTEAUX = ['#B55D86', '#6BA7C9', '#C9A34E', '#8E6CEF'];
const VESTES = ['#E74C3C', '#2F80ED', '#F2B705', '#30334F'];
const CHEVEUX = ['#3A2A1E', '#C98B4B', '#1E1E24', '#7B4B2A'];
const PEAU = '#F1C7A0';
const JEAN = '#3A3D6B';

/** Vrai si le personnage est dessiné (mêmes conditions que son style). */
function persoVisible(o, g, m) {
  'worklet';
  const zr = zObjet(o, m.d);
  return visibilite(zr) * chute(o, m).fondu > 0 && echelle(g, zr) > 0;
}

/** Mamie, passant ou ouvrier de chantier : un petit personnage qui marche. */
const Personnage = memo(function Personnage({geo, monde, o}) {
  const bw = 28;
  const bh = o.h * U;
  const mam = o.type === 'mamie';
  const ouv = o.type === 'ouvrier';
  const v = o.variante % 4;
  const haut = ouv ? '#FF6A13' : mam ? MANTEAUX[v] : VESTES[v];
  const cheveux = mam ? '#E8E8EE' : CHEVEUX[v];
  const jambe = bh * 0.46;
  const cadence = mam ? 4 : 7;
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const m = monde.value;
    const zr = zObjet(o, m.d);
    const ch = chute(o, m);
    const op = visibilite(zr) * ch.fondu;
    if (op <= 0) return CACHE;
    const s = echelle(g, zr);
    if (!s) return CACHE;
    const X = xMetres(o, m);
    const k = s / U;
    const bond = ouv ? 0 : 0.05 * Math.abs(Math.sin(m.t * cadence + o.id));
    return {
      opacity: op,
      transform: poserTourne(g.cx + X * s, g.hy + (g.camH - bond) * s, k, k, bw, bh, ch.rot),
    };
  });
  // Jambes : immobiles (même objet, aucune mise à jour) pour l'ouvrier et
  // tant que le personnage est caché.
  const jambeG = useAnimatedStyle(() => {
    if (ouv || !persoVisible(o, geo.value, monde.value)) return IMMOBILE;
    const a = Math.sin(monde.value.t * cadence + o.id) * (mam ? 14 : 28);
    return {transform: [{translateY: -jambe / 2}, {rotate: `${a}deg`}, {translateY: jambe / 2}]};
  });
  const jambeD = useAnimatedStyle(() => {
    if (ouv || !persoVisible(o, geo.value, monde.value)) return IMMOBILE;
    const a = -Math.sin(monde.value.t * cadence + o.id) * (mam ? 14 : 28);
    return {transform: [{translateY: -jambe / 2}, {rotate: `${a}deg`}, {translateY: jambe / 2}]};
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.perso, {width: bw, height: bh}, style]}>
      <Animated.View style={[styles.jambe, {left: 6, top: bh * 0.52, height: jambe, backgroundColor: mam ? '#D9C9B6' : JEAN}, jambeG]}>
        <View style={styles.chaussure} />
      </Animated.View>
      <Animated.View style={[styles.jambe, {left: 14, top: bh * 0.52, height: jambe, backgroundColor: mam ? '#D9C9B6' : JEAN}, jambeD]}>
        <View style={styles.chaussure} />
      </Animated.View>
      <View style={[styles.torse, {top: 12, height: bh * (mam ? 0.46 : 0.36), backgroundColor: haut, borderBottomLeftRadius: mam ? 2 : 6, borderBottomRightRadius: mam ? 2 : 6, left: mam ? 3 : 4, right: mam ? 3 : 4}]}>
        {ouv && (
          <>
            <View style={styles.bandeGilet} />
            <View style={[styles.bandeGilet, {top: 16}]} />
          </>
        )}
      </View>
      <View style={[styles.bras, {left: 0, top: 14, height: bh * 0.3, backgroundColor: haut}]} />
      <View style={[styles.bras, {left: 23, top: 14, height: bh * 0.3, backgroundColor: haut}]} />
      <View style={styles.tete} />
      <View style={[styles.cheveux, {backgroundColor: ouv ? '#F2B705' : cheveux, height: ouv ? 8 : 6, top: ouv ? -1 : 0, left: ouv ? 6 : 7.5, width: ouv ? 16 : 13}]} />
      {mam && <View style={styles.chignon} />}
      {mam && <View style={styles.canne} />}
      {mam && <View style={styles.sacMain} />}
      {ouv && <View style={styles.pelle} />}
    </Animated.View>
  );
});

/** Voiture qui traverse la rue : vue de côté, deux tranches de caisse et une cabine. */
function VoitureTravers({geo, monde, o}) {
  const corps = CARROSSERIES[o.variante % CARROSSERIES.length];
  const avantDroite = o.sens > 0;
  return (
    <>
      <Tranche geo={geo} monde={monde} o={o} decal={1.9} largeur={4.4} hauteur={0.8} style={{backgroundColor: corps}} />
      <Tranche
        geo={geo}
        monde={monde}
        o={o}
        decal={1.35}
        largeur={2.6}
        hauteur={o.h}
        dessus={{decal: 0.6, hauteur: 0.85, couleur: corps}}
        style={{backgroundColor: corps}}>
        <View style={styles.toitClair} />
        <View style={styles.vitresCote} />
      </Tranche>
      <Tranche geo={geo} monde={monde} o={o} decal={0.6} largeur={4.5} hauteur={0.85} style={{backgroundColor: corps}}>
        <View style={styles.toitClair} />
        <View style={[styles.phareCote, avantDroite ? {right: 4, backgroundColor: '#FFF6C2'} : {left: 4, backgroundColor: '#FFF6C2'}]} />
        <View style={[styles.phareCote, avantDroite ? {left: 4, backgroundColor: '#FF4D3D'} : {right: 4, backgroundColor: '#FF4D3D'}]} />
        <View style={styles.poignee} />
        <View style={[styles.roue, {left: 26, width: 30, height: 16, borderRadius: 8}]} />
        <View style={[styles.roue, {left: undefined, right: 26, width: 30, height: 16, borderRadius: 8}]} />
      </Tranche>
    </>
  );
}

// Mémorisé : quand la liste d'objets change, les obstacles déjà là ne sont
// pas redessinés (leurs tranches et leurs styles animés restent en place).
const Obstacle = memo(function Obstacle({geo, monde, o}) {
  if (o.type === 'mamie' || o.type === 'passant' || o.type === 'ouvrier') return <Personnage geo={geo} monde={monde} o={o} />;
  if (o.type === 'voitureTraverse') return <VoitureTravers geo={geo} monde={monde} o={o} />;
  if (o.type === 'voiture') return <Voiture geo={geo} monde={monde} o={o} />;
  if (o.type === 'camionnette') return <Camionnette geo={geo} monde={monde} o={o} />;
  if (o.type === 'rampe') return <Rampe geo={geo} monde={monde} o={o} />;
  if (o.type === 'plot') {
    return (
      <Tranche geo={geo} monde={monde} o={o} decal={0.25} largeur={0.7} hauteur={o.h}>
        <View style={styles.plot} />
        <View style={styles.plotBande} />
        <View style={styles.plotSocle} />
      </Tranche>
    );
  }
  if (o.type === 'barriere') {
    return (
      <Tranche geo={geo} monde={monde} o={o} decal={0.2} largeur={1.9} hauteur={o.h}>
        <View style={[styles.barreHaut, styles.rayures]}>
          {[0, 1, 2, 3, 4].map(k => (
            <View key={k} style={[styles.rayure, k % 2 === 0 && {backgroundColor: '#E74C3C'}]} />
          ))}
        </View>
        <View style={[styles.pied, {left: 6}]} />
        <View style={[styles.pied, {right: 6}]} />
      </Tranche>
    );
  }
  if (o.type === 'barrierePied') {
    // Barre suspendue : on passe dessous en se baissant (ou par-dessus).
    return (
      <Tranche geo={geo} monde={monde} o={o} decal={0.2} largeur={2.05} hauteur={o.haut}>
        <View style={[styles.barreSuspendue, {height: (o.haut - o.bas) * U}]}>
          {[0, 1, 2, 3, 4, 5].map(k => (
            <View key={k} style={[styles.rayure, {backgroundColor: k % 2 ? C.texte : C.or}]} />
          ))}
        </View>
        <View style={[styles.poteau, {left: 0}]} />
        <View style={[styles.poteau, {right: 0}]} />
      </Tranche>
    );
  }
  // Échafaudage : plancher et tubes au-dessus, passage libre en bas.
  return (
    <>
      <Tranche geo={geo} monde={monde} o={o} decal={o.longueur} largeur={2.1} hauteur={o.haut}>
        <View style={[styles.poteau, styles.tube, {left: 0}]} />
        <View style={[styles.poteau, styles.tube, {right: 0}]} />
      </Tranche>
      <Tranche geo={geo} monde={monde} o={o} decal={0} largeur={2.1} hauteur={o.haut}>
        <View style={[styles.echafaudage, {height: (o.haut - o.bas) * U}]}>
          <View style={styles.planche} />
          <View style={styles.croix} />
          <View style={[styles.croix, styles.croixInverse]} />
          <View style={[styles.planche, styles.plancheBas]} />
        </View>
        <View style={[styles.poteau, styles.tube, {left: 0}]} />
        <View style={[styles.poteau, styles.tube, {right: 0}]} />
      </Tranche>
    </>
  );
});

const COULEURS_BONUS = {turbo: '#FF6A13', superSaut: '#2F80ED', double: '#8E6CEF', aimant: C.danger, casque: C.marque};
const ICONES_BONUS = {turbo: 'flash', superSaut: 'arrow-up', aimant: 'magnet', casque: 'shield-checkmark'};
const SACS = ['#09D7AA', '#FF6A13', '#8E6CEF', '#2F80ED'];

/** Sac d'achat, étoile ou booster flottant (léger balancement, attiré par l'aimant). */
const Objet = memo(function Objet({geo, monde, o}) {
  const X = (o.voie - 1) * LARGEUR_VOIE;
  const bonus = o.genre === 'bonus';
  const etoile = o.genre === 'etoile';
  const taille = bonus ? 0.8 : etoile ? 0.7 : 0.6;
  const bw = taille * U;
  const style = useAnimatedStyle(() => {
    const g = geo.value;
    const m = monde.value;
    if (m.pris && m.pris.indexOf(o.id) >= 0) return CACHE;
    const zr = o.z - m.d;
    let x = X;
    let y = o.y - taille / 2 + 0.08 * Math.sin(m.t * 4 + o.id);
    let z = zr;
    if (m.aim && !bonus && zr < PORTEE_AIMANT && zr > -1) {
      // Aimant : l'objet glisse vers le coureur.
      const a = clamp(1 - zr / PORTEE_AIMANT, 0, 1);
      x += (m.jx - x) * a;
      y += (m.jy + 0.7 - y) * a;
      z = zr * (1 - a * 0.6);
    }
    const vis = visibilite(z);
    if (vis <= 0) return CACHE;
    const s = echelle(g, z);
    if (!s) return CACHE;
    const k = s / U;
    const tourne = etoile ? 14 * Math.sin(m.t * 3 + o.id) : bonus ? 0 : 8 * Math.sin(m.t * 3 + o.id);
    return {
      opacity: vis,
      transform: poserTourne(g.cx + x * s, g.hy + (g.camH - y) * s, k, k, bw, bw, tourne),
    };
  });
  if (bonus) {
    const fond = COULEURS_BONUS[o.type];
    return (
      <Animated.View pointerEvents="none" style={[styles.bonus, {width: bw, height: bw, backgroundColor: fond}, style]}>
        {o.type === 'double' ? (
          <Text style={[styles.bonusTexte, {fontSize: bw * 0.46}]}>x2</Text>
        ) : (
          <Ionicons name={ICONES_BONUS[o.type]} size={bw * 0.6} color={C.blanc} />
        )}
      </Animated.View>
    );
  }
  if (etoile) {
    return (
      <Animated.View pointerEvents="none" style={[styles.etoile, {width: bw, height: bw}, style]}>
        <Ionicons name="star" size={bw * 1.05} color={C.or} />
      </Animated.View>
    );
  }
  const couleur = SACS[o.id % SACS.length];
  return (
    <Animated.View pointerEvents="none" style={[styles.sac, {width: bw, height: bw}, style]}>
      <View style={[styles.sacAnse, {borderColor: couleur}]} />
      <View style={[styles.sacCorps, {backgroundColor: couleur}]}>
        <View style={styles.sacLogo} />
      </View>
    </Animated.View>
  );
});

/** Objets du parcours, du plus loin au plus près (redessinés quand la liste change). */
export const Objets = memo(function Objets({objets, d, geo, monde}) {
  // Clé de tri calculée une fois par objet (même ordre qu'avant).
  const cles = new Map();
  for (let i = 0; i < objets.length; i += 1) {
    const o = objets[i];
    cles.set(o, zRelatif(o, d) + (o.longueur || 0) * 0.5);
  }
  const tries = objets.slice().sort((a, b) => cles.get(b) - cles.get(a));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tries.map(o =>
        o.genre === 'obstacle' ? (
          <Obstacle key={o.id} geo={geo} monde={monde} o={o} />
        ) : (
          <Objet key={o.id} geo={geo} monde={monde} o={o} />
        ),
      )}
    </View>
  );
});

// Coureur et policier ---------------------------------------------------

const JOUEUR_L = 0.95;
const JOUEUR_H = H_DEBOUT;
const JAMBE = 28; // px
const BRAS = 24; // px

function pivotHaut(h, deg) {
  'worklet';
  return {transform: [{translateY: -h / 2}, {rotate: `${deg}deg`}, {translateY: h / 2}]};
}

// Membres en l'air : poses fixes, calculées une fois (aucune mise à jour pendant le saut).
const SAUT_JAMBE_G = pivotHaut(JAMBE, 38);
const SAUT_JAMBE_D = pivotHaut(JAMBE, -32);
const SAUT_BRAS_G = pivotHaut(BRAS, -70);
const SAUT_BRAS_D = pivotHaut(BRAS, 70);

/** Visibilité du policier (0 : absent), selon les secondes de police restantes. */
function visPolice(m) {
  'worklet';
  const arrive = clamp((DUREE_POLICE - m.pol) / 1.4, 0, 1);
  const part = clamp(m.pol / 1.2, 0, 1);
  return m.pol > 0 ? arrive * part : 0;
}

/**
 * Personnage vu de dos qui court : proportions humaines, jambes et bras qui
 * balancent selon le temps (plus vite quand la course accélère). `tenue`
 * donne les couleurs ; `casque` dessine le casque booster.
 */
const Silhouette = memo(function Silhouette({monde, tenue, casque, dephase = 0, bw, bh, policier = false}) {
  // Policier absent (presque toute la course) : membres figés, aucune mise à jour.
  const jambeG = useAnimatedStyle(() => {
    const m = monde.value;
    if (policier && visPolice(m) <= 0.01) return IMMOBILE;
    if (m.jy - m.sol > 0.08) return SAUT_JAMBE_G;
    return pivotHaut(JAMBE, Math.sin(m.t * m.cad + dephase) * 42);
  });
  const jambeD = useAnimatedStyle(() => {
    const m = monde.value;
    if (policier && visPolice(m) <= 0.01) return IMMOBILE;
    if (m.jy - m.sol > 0.08) return SAUT_JAMBE_D;
    return pivotHaut(JAMBE, -Math.sin(m.t * m.cad + dephase) * 42);
  });
  const brasG = useAnimatedStyle(() => {
    const m = monde.value;
    if (policier && visPolice(m) <= 0.01) return IMMOBILE;
    if (m.jy - m.sol > 0.08) return SAUT_BRAS_G;
    return pivotHaut(BRAS, -Math.sin(m.t * m.cad + dephase) * 38);
  });
  const brasD = useAnimatedStyle(() => {
    const m = monde.value;
    if (policier && visPolice(m) <= 0.01) return IMMOBILE;
    if (m.jy - m.sol > 0.08) return SAUT_BRAS_D;
    return pivotHaut(BRAS, Math.sin(m.t * m.cad + dephase) * 38);
  });
  const buste = useAnimatedStyle(() => {
    const m = monde.value;
    if (policier && visPolice(m) <= 0.01) return IMMOBILE;
    return {transform: [{rotate: `${Math.sin(m.t * m.cad + dephase) * 3}deg`}]};
  });
  return (
    <View style={{width: bw, height: bh, alignItems: 'center'}}>
      <Animated.View style={[styles.jambeCoureur, {left: bw / 2 - 11, top: bh * 0.5, backgroundColor: tenue.pantalon}, jambeG]}>
        <View style={[styles.basket, {backgroundColor: tenue.chaussures}]} />
      </Animated.View>
      <Animated.View style={[styles.jambeCoureur, {left: bw / 2 + 2, top: bh * 0.5, backgroundColor: tenue.pantalon}, jambeD]}>
        <View style={[styles.basket, {backgroundColor: tenue.chaussures}]} />
      </Animated.View>
      <Animated.View style={[styles.buste, {top: 15, backgroundColor: tenue.haut}, buste]}>
        {tenue.sac && <View style={[styles.sacDos, {backgroundColor: tenue.sac}]} />}
        {tenue.badge && <View style={[styles.rayureHaut, {backgroundColor: tenue.badge}]} />}
        {tenue.sacPearl && (
          <>
            <View style={[styles.bretelle, {left: 3}]} />
            <View style={[styles.bretelle, {right: 3}]} />
            <View style={[styles.sacPearl, {backgroundColor: tenue.sacPearl}]}>
              <View style={styles.rabatSac} />
              <View style={styles.cadreLogoSac}>
                <Image source={LOGO_PEARL} style={styles.logoSac} resizeMode="contain" />
              </View>
            </View>
          </>
        )}
      </Animated.View>
      <Animated.View style={[styles.brasCoureur, {left: bw / 2 - 17, top: 17, backgroundColor: tenue.haut}, brasG]}>
        <View style={[styles.main, {backgroundColor: PEAU}]} />
      </Animated.View>
      <Animated.View style={[styles.brasCoureur, {left: bw / 2 + 11, top: 17, backgroundColor: tenue.haut}, brasD]}>
        <View style={[styles.main, {backgroundColor: PEAU}]} />
        {tenue.sacMain && <View style={[styles.sacMainCoureur, {backgroundColor: tenue.sacMain}]} />}
      </Animated.View>
      <View style={styles.cou} />
      {tenue.capuche && <View style={[styles.capuche, {backgroundColor: tenue.capuche}]} />}
      <View style={[styles.teteCoureur, {backgroundColor: PEAU}]} />
      <View style={[styles.cheveuxCoureur, {backgroundColor: tenue.cheveux}]} />
      {tenue.casquette && <View style={[styles.casquette, {backgroundColor: tenue.casquette}]} />}
      {casque && <View style={styles.casqueBooster} />}
    </View>
  );
});

// Livreur Pearl : sweat à capuche, casquette et sac isotherme orange au logo Pearl.
const ORANGE_PEARL = '#FF6A13';
const TENUE_CLIENT = {
  haut: '#232A3B',
  capuche: '#2E3649',
  pantalon: '#2A3142',
  chaussures: ORANGE_PEARL,
  cheveux: '#3B2A1E',
  casquette: ORANGE_PEARL,
  sacPearl: ORANGE_PEARL,
};
const TENUE_POLICIER = {
  haut: '#2B3A67',
  pantalon: '#1F2A4F',
  chaussures: '#30334F',
  cheveux: '#2B3A67',
  casquette: '#2B3A67',
  badge: '#F2B705',
};

/** Coureur (le livreur), vu de dos, avec son ombre. */
export const Coureur = memo(function Coureur({geo, monde, casque}) {
  const bw = JOUEUR_L * U;
  const bh = JOUEUR_H * U;
  const ombre = useAnimatedStyle(() => {
    const g = geo.value;
    const m = monde.value;
    const s = g.f / g.recul;
    const haut = clamp(1 - (m.jy - m.sol) / 3, 0.35, 1);
    return {
      opacity: 0.25 * haut,
      transform: poser(g.cx + m.jx * s, g.hy + (g.camH - m.sol) * s + 0.12 * s, (s * 1.1 * haut) / 40, (s * 0.3) / 12, 40, 12),
    };
  });
  const corps = useAnimatedStyle(() => {
    const g = geo.value;
    const m = monde.value;
    const s = g.f / g.recul;
    const k = s / U;
    const ky = m.acc ? (k * H_ACCROUPI) / H_DEBOUT : k;
    return {
      opacity: m.inv > 0 ? 0.55 + 0.45 * Math.cos(m.t * 40) : 1,
      transform: poserTourne(g.cx + m.jx * s, g.hy + (g.camH - m.jy) * s, k, ky, bw, bh, m.tilt),
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.ombre, ombre]} />
      <Animated.View pointerEvents="none" style={[styles.coureur, {width: bw, height: bh}, corps]}>
        <Silhouette monde={monde} tenue={TENUE_CLIENT} casque={casque} bw={bw} bh={bh} />
      </Animated.View>
    </>
  );
});

const GYRO_FIGE = {backgroundColor: '#FF3B30'};

/**
 * Policier à ses trousses : apparaît derrière le coureur au premier choc,
 * rattrape pendant la poursuite (gyrophare), puis s'éloigne et disparaît.
 */
export const Policier = memo(function Policier({geo, monde}) {
  const bw = JOUEUR_L * U;
  const bh = JOUEUR_H * U;
  const poursuite = useAnimatedStyle(() => {
    const g = geo.value;
    const m = monde.value;
    const vis = visPolice(m);
    if (vis <= 0.01) return CACHE;
    const zr = -2.4 - 3.2 * (1 - vis);
    const s = echelle(g, zr);
    if (!s) return CACHE;
    const k = s / U;
    return {
      opacity: vis,
      transform: poser(g.cx + m.jxp * s, g.hy + g.camH * s, k, k, bw, bh),
    };
  });
  // Gyrophare : couleur figée tant que le policier est absent.
  const gyro = useAnimatedStyle(() => {
    if (visPolice(monde.value) <= 0.01) return GYRO_FIGE;
    return {backgroundColor: Math.sin(monde.value.t * 16) > 0 ? '#FF3B30' : '#2F80ED'};
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.coureur, {width: bw, height: bh}, poursuite]}>
      <Silhouette monde={monde} tenue={TENUE_POLICIER} casque={false} dephase={1.2} bw={bw} bh={bh} policier />
      <Animated.View style={[styles.gyrophare, gyro]} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  ciel: {position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: CIEL, justifyContent: 'flex-end'},
  cielBas: {height: '35%', backgroundColor: CIEL_BAS},
  sol: {position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: TROTTOIR},
  brume: {position: 'absolute', left: 0, right: 0, height: 22, backgroundColor: 'rgba(234,246,252,0.75)'},
  joint: {position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: 'rgba(48,51,79,0.10)'},
  tiret: {position: 'absolute', left: 0, top: 0, width: 10, height: 100, borderRadius: 2, backgroundColor: '#FFFFFF'},
  travee: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 40,
    height: (U * H_FACADE) / 4,
    justifyContent: 'space-around',
    paddingHorizontal: 5,
  },
  fenetre: {height: 22, borderRadius: 2, backgroundColor: VITRE, borderWidth: 2, borderColor: '#FFFFFF'},
  vitrine: {height: 26, backgroundColor: '#B8DDF0'},
  porte: {backgroundColor: C.marque, borderColor: '#FFFFFF'},
  lampadaire: {position: 'absolute', left: 0, top: 0, width: U, height: 4.6 * U},
  auvent: {position: 'absolute', left: -2, right: -2, top: -5, height: 7, borderRadius: 2},
  zebra: {position: 'absolute', left: 0, top: 0, width: 100, height: 100, flexDirection: 'row'},
  zebraBande: {flex: 1, backgroundColor: 'rgba(255,255,255,0.92)'},
  terrasse: {position: 'absolute', left: 0, top: 0, width: U * 1.6, height: U * 1.9},
  pied1: {position: 'absolute', left: U * 0.75, bottom: 0, width: 4, height: 22, backgroundColor: '#5B6080'},
  table: {position: 'absolute', left: U * 0.5, bottom: 20, width: 24, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.bordureForte},
  chaise: {position: 'absolute', left: 4, bottom: 0, width: 12, height: 20, borderRadius: 3, backgroundColor: '#8A5A2B'},
  mat2: {position: 'absolute', left: U * 0.78, bottom: 24, width: 3, height: 40, backgroundColor: '#8D93AE'},
  parasol: {position: 'absolute', left: 2, right: 2, top: 4, height: 18, borderTopLeftRadius: 30, borderTopRightRadius: 30},
  panneauLoin: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  mat: {position: 'absolute', width: 4, borderRadius: 2, backgroundColor: '#8D93AE'},
  enseigne: {position: 'absolute', left: 0, top: 0, width: ENSEIGNE_BW, height: ENSEIGNE_BH, alignItems: 'center'},
  potence: {position: 'absolute', top: 0, left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: '#5B6080'},
  chaines: {width: '70%', height: 10, flexDirection: 'row', justifyContent: 'space-between', marginTop: 6},
  chaine: {width: 3, height: 10, backgroundColor: '#5B6080'},
  lampeMat: {position: 'absolute', left: U / 2 - 3, top: 10, bottom: 0, width: 6, borderRadius: 3, backgroundColor: '#5B6080'},
  lampeBras: {position: 'absolute', left: U / 2 - 2, top: 8, width: U / 2 + 2, height: 5, borderRadius: 2, backgroundColor: '#5B6080'},
  lampeTete: {position: 'absolute', right: -6, top: 6, width: 16, height: 9, borderRadius: 4, backgroundColor: '#FFF3B0'},
  tranche: {position: 'absolute', left: 0, top: 0, borderRadius: 6, overflow: 'hidden'},
  dessus: {position: 'absolute', left: 0, top: 0, height: 100},
  dessusClair: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.35)'},
  toitClair: {position: 'absolute', left: 0, right: 0, top: 0, height: 8, backgroundColor: 'rgba(255,255,255,0.35)'},
  toitCamion: {position: 'absolute', left: 0, right: 0, top: 0, height: 10, backgroundColor: '#E3E5EC'},
  bandeMarque: {position: 'absolute', left: 0, right: 0, top: 30, height: 10, backgroundColor: C.marque},
  pareBrise: {position: 'absolute', left: 8, right: 8, top: 10, height: 18, borderRadius: 4, backgroundColor: VITRE},
  pareBriseCamion: {position: 'absolute', left: 8, right: 8, top: 46, height: 24, borderRadius: 4, backgroundColor: VITRE},
  portesArriere: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 46,
    bottom: 22,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: C.bordureForte,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.marque,
  },
  logoCamion: {color: '#FFFFFF', fontSize: 22, fontWeight: '900'},
  feux: {position: 'absolute', left: 4, bottom: 14, width: 12, height: 7, borderRadius: 2},
  feuDroit: {left: undefined, right: 4},
  feuxCamion: {bottom: 12},
  plaque: {position: 'absolute', alignSelf: 'center', left: 26, right: 26, bottom: 12, height: 7, borderRadius: 1, backgroundColor: '#FFFFFF'},
  roue: {position: 'absolute', left: 6, bottom: 0, width: 14, height: 9, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#3A3D55'},
  roueDroite: {left: undefined, right: 6},
  rampeBord: {position: 'absolute', left: 0, right: 0, top: 0, height: 5, backgroundColor: '#FFFFFF'},
  plot: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: ORANGE,
  },
  plotBande: {position: 'absolute', left: 11, bottom: 13, width: 6, height: 4, backgroundColor: '#FFFFFF'},
  plotSocle: {position: 'absolute', left: 3, right: 3, bottom: 0, height: 5, borderRadius: 2, backgroundColor: ORANGE},
  barreHaut: {position: 'absolute', left: 0, right: 0, top: 0, height: 14},
  rayures: {flexDirection: 'row', borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF'},
  rayure: {flex: 1, backgroundColor: '#FFFFFF'},
  pied: {position: 'absolute', top: 12, bottom: 0, width: 6, backgroundColor: METAL},
  barreSuspendue: {position: 'absolute', left: 4, right: 4, top: 0, flexDirection: 'row', borderRadius: 3, overflow: 'hidden'},
  poteau: {position: 'absolute', top: 0, bottom: 0, width: 6, backgroundColor: METAL},
  tube: {width: 7},
  echafaudage: {position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: 'rgba(169,175,194,0.25)'},
  planche: {position: 'absolute', left: 0, right: 0, top: 0, height: 10, backgroundColor: BOIS},
  plancheBas: {top: undefined, bottom: 0, height: 12},
  croix: {
    position: 'absolute',
    left: '50%',
    top: '10%',
    width: 5,
    height: '80%',
    marginLeft: -2,
    backgroundColor: METAL,
    transform: [{rotate: '40deg'}],
  },
  croixInverse: {transform: [{rotate: '-40deg'}]},
  bonus: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ombre: {position: 'absolute', left: 0, top: 0, width: 40, height: 12, borderRadius: 6, backgroundColor: '#30334F'},
  coureur: {position: 'absolute', left: 0, top: 0, alignItems: 'center'},
  bonusTexte: {color: '#FFFFFF', fontWeight: '900'},
  etoile: {position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center'},
  sac: {position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'flex-end'},
  sacAnse: {
    position: 'absolute',
    top: 0,
    width: '46%',
    height: '38%',
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 99,
    borderTopRightRadius: 99,
  },
  sacCorps: {width: '100%', height: '76%', borderRadius: 4, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  sacLogo: {width: '34%', height: '34%', borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.85)'},
  perso: {position: 'absolute', left: 0, top: 0},
  jambe: {position: 'absolute', width: 8, borderRadius: 3},
  chaussure: {position: 'absolute', left: -1, right: -1, bottom: -1, height: 5, borderRadius: 2, backgroundColor: '#30334F'},
  torse: {position: 'absolute', borderTopLeftRadius: 7, borderTopRightRadius: 7, overflow: 'hidden'},
  bandeGilet: {position: 'absolute', left: 0, right: 0, top: 6, height: 3, backgroundColor: '#FFFFFF'},
  bras: {position: 'absolute', width: 5, borderRadius: 3},
  tete: {position: 'absolute', left: 7.5, top: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: PEAU},
  cheveux: {position: 'absolute', borderTopLeftRadius: 8, borderTopRightRadius: 8},
  chignon: {position: 'absolute', left: 3, top: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E8EE'},
  canne: {position: 'absolute', left: 25, top: 28, width: 2, height: 30, borderRadius: 1, backgroundColor: '#8A5A2B'},
  sacMain: {position: 'absolute', left: 21, top: 30, width: 8, height: 9, borderRadius: 2, backgroundColor: '#7B4B2A'},
  pelle: {position: 'absolute', left: 25, top: 4, width: 3, height: 52, borderRadius: 1, backgroundColor: '#8A5A2B'},
  vitresCote: {position: 'absolute', left: 8, right: 8, top: 12, height: 20, borderRadius: 4, backgroundColor: VITRE},
  phareCote: {position: 'absolute', top: 6, width: 8, height: 7, borderRadius: 2},
  poignee: {position: 'absolute', left: 80, top: 8, width: 14, height: 3, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.7)'},
  jambeCoureur: {position: 'absolute', width: 9, height: JAMBE, borderRadius: 4},
  basket: {position: 'absolute', left: -1, right: -1, bottom: -2, height: 7, borderRadius: 3},
  buste: {position: 'absolute', width: 24, height: 27, borderRadius: 9, alignSelf: 'center', overflow: 'hidden'},
  sacDos: {position: 'absolute', left: 4, right: 4, top: 3, bottom: 3, borderRadius: 5},
  rayureHaut: {position: 'absolute', left: 0, right: 0, top: 4, height: 3},
  bretelle: {position: 'absolute', top: 0, width: 3, height: 8, backgroundColor: '#1A1F2C'},
  sacPearl: {position: 'absolute', left: 2, right: 2, top: 3, bottom: 1, borderRadius: 4, overflow: 'hidden', alignItems: 'center', borderWidth: 1, borderColor: '#D9560B'},
  rabatSac: {position: 'absolute', left: 0, right: 0, top: 0, height: 5, backgroundColor: '#E85D0C'},
  cadreLogoSac: {position: 'absolute', top: 8, width: 18, height: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
  logoSac: {width: 54, height: 25},
  capuche: {position: 'absolute', top: 9, width: 18, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 4, borderBottomRightRadius: 4},
  brasCoureur: {position: 'absolute', width: 6, height: BRAS, borderRadius: 3},
  main: {position: 'absolute', left: 0, bottom: -3, width: 6, height: 6, borderRadius: 3},
  sacMainCoureur: {position: 'absolute', left: -4, bottom: -17, width: 12, height: 14, borderRadius: 3, borderWidth: 1, borderColor: '#FFFFFF'},
  cou: {position: 'absolute', top: 11, width: 6, height: 6, backgroundColor: PEAU},
  teteCoureur: {position: 'absolute', top: 0, width: 14, height: 14, borderRadius: 7},
  cheveuxCoureur: {position: 'absolute', top: -1, width: 15, height: 11, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 5, borderBottomRightRadius: 5},
  casquette: {position: 'absolute', top: -3, width: 16, height: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8},
  casqueBooster: {position: 'absolute', top: -4, width: 20, height: 12, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: C.or, borderWidth: 2, borderColor: '#FFFFFF'},
  gyrophare: {position: 'absolute', top: -9, width: 12, height: 6, borderRadius: 3, borderWidth: 1, borderColor: '#FFFFFF'},
});
