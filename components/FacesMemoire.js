/**
 * Cartes de « Mémoire du livreur » (screens/JeuMemoireScreen.js).
 *
 *   <FaceCarte icone="pizza" couleur="#E63946" largeur hauteur />   face illustrée
 *   <DosCarte largeur hauteur />                                   dos Pearl Streets
 *
 * Faces : illustrations 3D (assets/images/jeux/memoire/<clé>.webp, 320 x 320),
 * dans un cadre de la couleur du motif sur un fond teinté de cette couleur :
 * les niveaux à motifs proches déclinent la même illustration en plusieurs
 * couleurs, le cadre et le fond font la différence. Les clés sont celles de
 * MOTIFS (utils/jeuMemoire.js). Images locales via expo-image (cache mémoire :
 * chaque illustration est décodée une seule fois pour toutes les cartes).
 *
 * Dos : bleu nuit, liseré vert et logo Pearl Streets en filigrane, discret.
 */
import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LOGO_PEARL, RATIO_LOGO, BLEU_NUIT, VERT_PEARL } from './FondJeu';

export const IMAGES_MEMOIRE = {
  bicycle: require('../assets/images/jeux/memoire/bicycle.webp'),
  car: require('../assets/images/jeux/memoire/car.webp'),
  cube: require('../assets/images/jeux/memoire/cube.webp'),
  pizza: require('../assets/images/jeux/memoire/pizza.webp'),
  restaurant: require('../assets/images/jeux/memoire/restaurant.webp'),
  home: require('../assets/images/jeux/memoire/home.webp'),
  map: require('../assets/images/jeux/memoire/map.webp'),
  navigate: require('../assets/images/jeux/memoire/navigate.webp'),
  time: require('../assets/images/jeux/memoire/time.webp'),
  wallet: require('../assets/images/jeux/memoire/wallet.webp'),
  gift: require('../assets/images/jeux/memoire/gift.webp'),
  cafe: require('../assets/images/jeux/memoire/cafe.webp'),
  'fast-food': require('../assets/images/jeux/memoire/fast-food.webp'),
  storefront: require('../assets/images/jeux/memoire/storefront.webp'),
  key: require('../assets/images/jeux/memoire/key.webp'),
  call: require('../assets/images/jeux/memoire/call.webp'),
  bus: require('../assets/images/jeux/memoire/bus.webp'),
  basket: require('../assets/images/jeux/memoire/basket.webp'),
};

// Mélange une couleur #RRGGBB avec du blanc (part = part de blanc, 0 à 1).
const cacheTeintes = new Map();
export function teinteClaire(hex, part = 0.84) {
  const cle = `${hex}|${part}`;
  if (cacheTeintes.has(cle)) return cacheTeintes.get(cle);
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return '#FFFFFF';
  const m = (v) => Math.round(v + (255 - v) * part);
  const res = `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
  cacheTeintes.set(cle, res);
  return res;
}

/** Rayon des coins d'une carte (faces et ombre de la carte). */
export const rayonCarte = (largeur, hauteur) => Math.max(10, Math.min(largeur, hauteur) * 0.16);

/** Face illustrée : fond teinté, cadre et pastille de la couleur du motif. */
export const FaceCarte = memo(function FaceCarte({ icone, couleur, largeur, hauteur }) {
  const cote = Math.min(largeur, hauteur);
  const rayon = rayonCarte(largeur, hauteur);
  const bord = Math.max(2.5, cote * 0.045);
  const image = Math.min(largeur - 2 * bord - cote * 0.1, hauteur * 0.74);
  const pastille = Math.max(7, cote * 0.1);
  return (
    <View style={[styles.face, { borderRadius: rayon, borderWidth: bord, borderColor: couleur, backgroundColor: teinteClaire(couleur) }]}>
      <View style={[styles.cadreImage, { width: image, height: image, borderRadius: rayon * 0.75, marginBottom: pastille * 1.2 }]}>
        <Image
          source={IMAGES_MEMOIRE[icone] || IMAGES_MEMOIRE.cube}
          style={{ width: image, height: image }}
          contentFit="cover"
          cachePolicy="memory"
          transition={0}
        />
      </View>
      <View style={[styles.pastille, { width: pastille, height: pastille, borderRadius: pastille / 2, backgroundColor: couleur, bottom: cote * 0.05 }]} />
    </View>
  );
});

/** Dos de carte Pearl Streets : bleu nuit, liseré vert, logo en filigrane discret. */
export const DosCarte = memo(function DosCarte({ largeur, hauteur }) {
  const cote = Math.min(largeur, hauteur);
  const rayon = rayonCarte(largeur, hauteur);
  const marge = Math.max(4, cote * 0.075);
  const logoL = largeur * 0.56;
  const logoH = logoL / RATIO_LOGO;
  return (
    <View style={[styles.dos, { borderRadius: rayon }]}>
      <View style={[styles.cadre, { margin: marge, borderRadius: rayon * 0.7 }]}>
        <View style={[styles.reflet, { width: largeur * 1.4, height: hauteur * 0.32, top: -hauteur * 0.08, left: -largeur * 0.3 }]} />
        <Image source={LOGO_PEARL} style={{ width: logoL, height: logoH, opacity: 0.22 }} contentFit="contain" cachePolicy="memory" transition={0} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  face: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cadreImage: { overflow: 'hidden', backgroundColor: '#FFFFFF' },
  pastille: { position: 'absolute', alignSelf: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  dos: {
    ...StyleSheet.absoluteFillObject, backgroundColor: BLEU_NUIT, borderWidth: 2, borderColor: VERT_PEARL, overflow: 'hidden',
  },
  cadre: {
    flex: 1, backgroundColor: '#1D2D52', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  reflet: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.05)', transform: [{ rotate: '-18deg' }] },
});
