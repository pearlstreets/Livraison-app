/**
 * Décor et cartes de « Mémoire du livreur » (screens/Jeux/MemoireScreen.js),
 * portés de l'app livreur.
 *
 *   <DecorMemoire l h bas actif />                                  décor de fond
 *   <FaceCarte icone="pizza" couleur="#E63946" largeur hauteur />   face illustrée
 *   <DosCarte largeur hauteur />                                    dos Pearl Streets
 *
 * Décor dessiné en code : ciel du matin, soleil, nuages qui dérivent,
 * immeubles pastel, trottoir et petit logo Pearl Streets discret posé sur le
 * trottoir (RESERVE_BAS : hauteur gardée sous la grille pour le trottoir).
 * Toujours clair (jamais de fond sombre), ne capte jamais le toucher. Les
 * nuages tournent en pilote natif et s'arrêtent au démontage, quand l'app
 * passe en arrière-plan, quand l'écran n'est plus affiché et quand `actif`
 * vaut false (pause, fin), pour économiser la batterie.
 *
 * Faces : illustrations (assets/images/jeux/memoire/<clé>.webp, 320 x 320),
 * dans un cadre de la couleur du motif sur un fond teinté de cette couleur :
 * les niveaux à motifs proches déclinent la même illustration en plusieurs
 * couleurs, le cadre et le fond font la différence. Les clés sont celles de
 * MOTIFS (utils/jeux/memoire.js).
 *
 * Dos : bleu nuit, liseré vert et logo Pearl Streets en filigrane, discret.
 */
import React, {memo, useEffect, useRef, useState} from 'react';
import {View, Image, Animated, Easing, StyleSheet, AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {LOGO_PEARL, RATIO_LOGO, PlaqueLogo} from './FondJeu';

export const BLEU_NUIT = '#16223F';
export const VERT_PEARL = '#0BB58E';
/** Hauteur gardée sous la grille de cartes pour le trottoir et le petit logo. */
export const RESERVE_BAS = 44;
const HAUTEUR_PLAQUE = 26;

const CIEL = ['#8FD6FF', '#A3DDFF', '#B8E5FF', '#CDEDFF', '#E1F4FF', '#F1F9FF', '#FFF6DC', '#FFEFC8'];
const PASTEL = ['#F7C9A3', '#BDE4D2', '#F4D5E6', '#C9D9F6', '#FBE3A6', '#D8CBF0'];
const IMMEUBLES = [
  [0.0, 0.15, 0.62], [0.14, 0.12, 1], [0.25, 0.16, 0.7], [0.4, 0.13, 0.9], [0.52, 0.16, 0.66],
  [0.67, 0.12, 1], [0.78, 0.14, 0.74], [0.9, 0.12, 0.95],
];
const NUAGES = [[0.06, 0.2, 1], [0.6, 0.08, 0.85], [0.36, 0.34, 0.6]];

export const IMAGES_MEMOIRE = {
  bicycle: require('../../assets/images/jeux/memoire/bicycle.webp'),
  car: require('../../assets/images/jeux/memoire/car.webp'),
  cube: require('../../assets/images/jeux/memoire/cube.webp'),
  pizza: require('../../assets/images/jeux/memoire/pizza.webp'),
  restaurant: require('../../assets/images/jeux/memoire/restaurant.webp'),
  home: require('../../assets/images/jeux/memoire/home.webp'),
  map: require('../../assets/images/jeux/memoire/map.webp'),
  navigate: require('../../assets/images/jeux/memoire/navigate.webp'),
  time: require('../../assets/images/jeux/memoire/time.webp'),
  wallet: require('../../assets/images/jeux/memoire/wallet.webp'),
  gift: require('../../assets/images/jeux/memoire/gift.webp'),
  cafe: require('../../assets/images/jeux/memoire/cafe.webp'),
  'fast-food': require('../../assets/images/jeux/memoire/fast-food.webp'),
  storefront: require('../../assets/images/jeux/memoire/storefront.webp'),
  key: require('../../assets/images/jeux/memoire/key.webp'),
  call: require('../../assets/images/jeux/memoire/call.webp'),
  bus: require('../../assets/images/jeux/memoire/bus.webp'),
  basket: require('../../assets/images/jeux/memoire/basket.webp'),
};

function Nuage({x, y, echelle, derive}) {
  const w = 74 * echelle;
  const dx = derive.interpolate({inputRange: [0, 1], outputRange: [-14 * echelle, 22 * echelle]});
  return (
    <Animated.View style={{position: 'absolute', left: x, top: y, width: w, height: w * 0.5, transform: [{translateX: dx}]}}>
      <View style={[styles.bosse, {left: 0, bottom: 0, width: w * 0.5, height: w * 0.32}]} />
      <View style={[styles.bosse, {left: w * 0.18, bottom: w * 0.08, width: w * 0.46, height: w * 0.42}]} />
      <View style={[styles.bosse, {left: w * 0.46, bottom: 0, width: w * 0.54, height: w * 0.34}]} />
    </Animated.View>
  );
}

/** Décor de fond : `bas` = marge du bas de l'écran (zone sûre et marge comprises). */
function DecorMemoire({l, h, bas = 0, actif = true}) {
  const derive = useRef(new Animated.Value(0)).current;
  const affiche = useIsFocused();
  const [premierPlan, setPremierPlan] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const abo = AppState.addEventListener('change', etat => setPremierPlan(etat === 'active'));
    return () => abo?.remove?.();
  }, []);
  const anime = actif && affiche && premierPlan;
  useEffect(() => {
    if (!anime) return undefined;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(derive, {toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true}),
        Animated.timing(derive, {toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true}),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [anime, derive]);

  if (!l || !h) return null;
  const sol = bas + RESERVE_BAS;
  const horizon = h - sol;
  const bande = Math.ceil(horizon / CIEL.length);
  const hImmeuble = Math.min(200, h * 0.26);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fond]}>
      {CIEL.map((c, i) => (
        <View key={i} style={{position: 'absolute', left: 0, right: 0, top: i * bande, height: bande + 1, backgroundColor: c}} />
      ))}
      <View style={[styles.halo, {left: l * 0.8 - 46, top: 70, width: 92, height: 92, borderRadius: 46, opacity: 0.35}]} />
      <View style={[styles.soleil, {left: l * 0.8 - 24, top: 92}]} />
      {NUAGES.map(([x, y, e], i) => (
        <Nuage key={i} x={x * l} y={80 + y * Math.max(60, horizon * 0.5)} echelle={e} derive={derive} />
      ))}
      {IMMEUBLES.map(([x, w, hh], i) => {
        const hauteur = hImmeuble * hh;
        return (
          <View
            key={i}
            style={[
              styles.immeuble,
              {left: x * l, top: horizon - hauteur, width: w * l + 1, height: hauteur, backgroundColor: PASTEL[i % PASTEL.length]},
            ]}>
            {Array.from({length: 8}).map((_, j) => (
              <View key={j} style={styles.fenetre} />
            ))}
          </View>
        );
      })}
      <View style={[styles.trottoir, {top: horizon, bottom: 0}]} />
      <View style={[styles.bordure, {top: horizon}]} />
      <View style={[styles.plaque, {bottom: bas + (RESERVE_BAS - HAUTEUR_PLAQUE) / 2 - 2}]}>
        <PlaqueLogo hauteur={HAUTEUR_PLAQUE} />
      </View>
    </View>
  );
}

export default memo(DecorMemoire);

// Mélange une couleur #RRGGBB avec du blanc (part = part de blanc, 0 à 1).
const cacheTeintes = new Map();
export function teinteClaire(hex, part = 0.84) {
  const cle = `${hex}|${part}`;
  if (cacheTeintes.has(cle)) return cacheTeintes.get(cle);
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return '#FFFFFF';
  const m = v => Math.round(v + (255 - v) * part);
  const res = `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
  cacheTeintes.set(cle, res);
  return res;
}

/** Rayon des coins d'une carte (faces et ombre de la carte). */
export const rayonCarte = (largeur, hauteur) => Math.max(10, Math.min(largeur, hauteur) * 0.16);

/** Face illustrée : fond teinté, cadre et pastille de la couleur du motif. */
export const FaceCarte = memo(function FaceCarte({icone, couleur, largeur, hauteur}) {
  const cote = Math.min(largeur, hauteur);
  const rayon = rayonCarte(largeur, hauteur);
  const bord = Math.max(2.5, cote * 0.045);
  const image = Math.min(largeur - 2 * bord - cote * 0.1, hauteur * 0.74);
  const pastille = Math.max(7, cote * 0.1);
  return (
    <View style={[styles.face, {borderRadius: rayon, borderWidth: bord, borderColor: couleur, backgroundColor: teinteClaire(couleur)}]}>
      <View style={[styles.cadreImage, {width: image, height: image, borderRadius: rayon * 0.75, marginBottom: pastille * 1.2}]}>
        <Image source={IMAGES_MEMOIRE[icone] || IMAGES_MEMOIRE.cube} style={{width: image, height: image}} resizeMode="cover" fadeDuration={0} />
      </View>
      <View
        style={[styles.pastille, {width: pastille, height: pastille, borderRadius: pastille / 2, backgroundColor: couleur, bottom: cote * 0.05}]}
      />
    </View>
  );
});

/** Dos de carte Pearl Streets : bleu nuit, liseré vert, logo en filigrane discret. */
export const DosCarte = memo(function DosCarte({largeur, hauteur}) {
  const cote = Math.min(largeur, hauteur);
  const rayon = rayonCarte(largeur, hauteur);
  const marge = Math.max(4, cote * 0.075);
  const logoL = largeur * 0.56;
  const logoH = logoL / RATIO_LOGO;
  return (
    <View style={[styles.dos, {borderRadius: rayon}]}>
      <View style={[styles.cadre, {margin: marge, borderRadius: rayon * 0.7}]}>
        <View style={[styles.reflet, {width: largeur * 1.4, height: hauteur * 0.32, top: -hauteur * 0.08, left: -largeur * 0.3}]} />
        <Image source={LOGO_PEARL} style={{width: logoL, height: logoH, opacity: 0.22}} resizeMode="contain" fadeDuration={0} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  fond: {overflow: 'hidden', backgroundColor: '#F4E7CC'},
  halo: {position: 'absolute', backgroundColor: '#FFE9A0'},
  soleil: {position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFD54A'},
  bosse: {position: 'absolute', borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.92)'},
  immeuble: {
    position: 'absolute',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: 10,
    gap: 7,
    overflow: 'hidden',
  },
  fenetre: {width: 7, height: 10, borderRadius: 1.5, backgroundColor: '#FFFFFFAA'},
  trottoir: {position: 'absolute', left: 0, right: 0, backgroundColor: '#F2E4C6'},
  bordure: {position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: '#D9C8A3'},
  plaque: {position: 'absolute', left: 0, right: 0, alignItems: 'center', opacity: 0.85},
  face: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  cadreImage: {overflow: 'hidden', backgroundColor: '#FFFFFF'},
  pastille: {position: 'absolute', alignSelf: 'center', borderWidth: 1.5, borderColor: '#FFFFFF'},
  dos: {...StyleSheet.absoluteFillObject, backgroundColor: BLEU_NUIT, borderWidth: 2, borderColor: VERT_PEARL, overflow: 'hidden'},
  cadre: {
    flex: 1,
    backgroundColor: '#1D2D52',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reflet: {position: 'absolute', backgroundColor: 'rgba(255,255,255,0.05)', transform: [{rotate: '-18deg'}]},
});
