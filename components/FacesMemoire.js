/**
 * Cartes de « Mémoire du livreur » (screens/JeuMemoireScreen.js), dessinées en
 * code : rien à télécharger.
 *
 *   <Dessin icone="pizza" couleur="#E63946" taille={64} />   illustration d'une face
 *   <DosCarte largeur hauteur />                              dos Pearl Streets
 *
 * Chaque illustration est dessinée dans un carré de 100 x 100 (rectangles,
 * cercles, traits et triangles) puis mise à l'échelle. La couleur du motif
 * sert aux pièces principales : les niveaux à motifs proches déclinent la
 * même illustration en plusieurs couleurs. Les clés sont celles de MOTIFS
 * (utils/jeuMemoire.js).
 */
import React, { memo } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LOGO_PEARL, RATIO_LOGO, BLEU_NUIT, VERT_PEARL } from './FondJeu';

const B = '#FFFFFF';
const N = '#2B3A55'; // bleu nuit des contours et des roues
const GRIS = '#E3E8EF';
const VITRE = '#CFE9FF';
const OR = '#FFD54A';
const ORANGE = '#FF7A1A';
const CARTON = '#C98F55';
const CREME = '#FFF1D6';

// Pièces de dessin : chacune rend un style de View en position absolue dans le carré de 100.
const R = (x, y, w, h, c, r = 0, extra) => ({
  position: 'absolute', left: x, top: y, width: w, height: h, backgroundColor: c, borderRadius: r, ...extra,
});
const C = (cx, cy, r, c, extra) => R(cx - r, cy - r, 2 * r, 2 * r, c, r, extra);
const Ring = (cx, cy, r, ep, c) => C(cx, cy, r, 'transparent', { borderWidth: ep, borderColor: c });
// Trait épais d'un point à un autre.
const L = (x1, y1, x2, y2, ep, c) => {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const longueur = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return R(cx - longueur / 2, cy - ep / 2, longueur, ep, c, ep / 2, { transform: [{ rotate: `${angle}deg` }] });
};
// Triangle pointe en haut (demi-base `dem`, hauteur `ht`), coin haut-gauche de sa boîte en (x, y).
const T = (x, y, dem, ht, c, extra) => ({
  position: 'absolute', left: x, top: y, width: 0, height: 0,
  borderLeftWidth: dem, borderRightWidth: dem, borderBottomWidth: ht,
  borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: c, ...extra,
});

const DESSINS = {
  // Livreur à vélo avec sa boîte
  bicycle: (c) => [
    R(5, 30, 28, 24, ORANGE, 5), R(5, 39, 28, 5, B), R(10, 24, 18, 6, '#E86A0E', 3),
    Ring(22, 68, 15, 5, N), Ring(78, 68, 15, 5, N), C(22, 68, 3, GRIS), C(78, 68, 3, GRIS),
    L(22, 68, 47, 68, 4, c), L(47, 68, 38, 42, 4, c), L(38, 42, 66, 42, 4, c), L(66, 42, 47, 68, 4, c), L(66, 42, 78, 68, 4, c),
    L(66, 42, 63, 31, 4, N), L(57, 30, 71, 30, 4, N), R(30, 37, 15, 5, N, 3), C(47, 68, 4, OR),
  ],
  // Voiture de livraison avec son panneau de toit
  car: (c) => [
    R(38, 18, 24, 12, ORANGE, 4), R(38, 22, 24, 3, B),
    R(26, 30, 50, 24, c, 10), R(8, 46, 84, 26, c, 9),
    R(31, 34, 18, 15, VITRE, 3), R(53, 34, 18, 15, VITRE, 3), R(8, 60, 84, 4, 'rgba(255,255,255,0.35)'),
    C(88, 56, 4, OR), C(12, 56, 3, '#FF5A4D'),
    C(28, 74, 11, N), C(72, 74, 11, N), C(28, 74, 4.5, GRIS), C(72, 74, 4.5, GRIS),
  ],
  // Colis fermé au ruban adhésif
  cube: (c) => [
    R(18, 30, 64, 54, CARTON, 5), R(18, 30, 64, 14, '#DBA46B', 5), R(18, 43, 64, 3, '#A9743F'),
    R(43, 30, 14, 54, c, 2), R(60, 62, 17, 14, B, 2), R(63, 66, 11, 2.5, '#B6C0CE', 1), R(63, 71, 8, 2.5, '#B6C0CE', 1),
    C(30, 70, 5, 'rgba(255,255,255,0.35)'),
  ],
  // Pizza entière
  pizza: (c) => [
    C(50, 52, 37, '#D9953C'), C(50, 52, 31, '#F6CF74'), C(50, 52, 22, '#F2BF55', { opacity: 0.55 }),
    C(38, 40, 7, c), C(60, 44, 7, c), C(46, 62, 7, c), C(66, 64, 5, c), C(32, 58, 5, c),
    C(38, 40, 2.5, 'rgba(255,255,255,0.35)'), C(60, 44, 2.5, 'rgba(255,255,255,0.35)'), C(46, 62, 2.5, 'rgba(255,255,255,0.35)'),
    L(50, 21, 50, 83, 2.5, 'rgba(176,112,40,0.45)'), L(19, 52, 81, 52, 2.5, 'rgba(176,112,40,0.45)'),
    C(70, 34, 3, '#6BBF59'), C(30, 70, 3, '#6BBF59'),
  ],
  // Cloche de plat
  restaurant: (c) => [
    C(50, 25, 6, GRIS), R(16, 30, 68, 40, c, 0, { borderTopLeftRadius: 34, borderTopRightRadius: 34 }),
    L(28, 52, 34, 42, 4, 'rgba(255,255,255,0.55)'), R(8, 70, 84, 9, GRIS, 4.5), R(14, 79, 72, 4, '#B6C0CE', 2),
  ],
  // Maison et sa porte
  home: (c) => [
    R(62, 20, 9, 20, '#B5654A', 1), R(22, 46, 56, 40, CREME, 3), T(10, 18, 40, 30, c),
    R(43, 58, 15, 28, c, 3), C(54, 73, 1.8, OR), R(28, 56, 12, 12, VITRE, 2), R(63, 56, 10, 12, VITRE, 2),
  ],
  // Plan plié et épingle
  map: (c) => [
    R(12, 28, 26, 52, '#DDF0D8', 3), R(36, 28, 28, 52, '#F6F1D8', 0), R(62, 28, 26, 52, '#CFE6F7', 3),
    L(16, 70, 36, 56, 3, B), L(40, 44, 62, 70, 3, B), L(66, 40, 84, 58, 3, B),
    R(42, 38, 16, 16, c, 3, { transform: [{ rotate: '45deg' }] }), C(50, 34, 14, c), C(50, 34, 5.5, B),
  ],
  // Flèche d'itinéraire
  navigate: (c) => [
    C(50, 50, 38, c), C(50, 50, 31, 'rgba(255,255,255,0.22)'),
    T(38, 22, 12, 56, B, { transform: [{ rotate: '40deg' }] }), T(38, 52, 12, 26, 'rgba(255,255,255,0.55)', { transform: [{ rotate: '220deg' }] }),
  ],
  // Réveil
  time: (c) => [
    C(25, 22, 11, c), C(75, 22, 11, c), C(50, 54, 36, c), C(50, 54, 29, B),
    L(50, 54, 50, 33, 4.5, N), L(50, 54, 66, 62, 4.5, c), C(50, 54, 4.5, N),
    R(48, 28, 4, 5, '#B6C0CE', 2), R(48, 76, 4, 5, '#B6C0CE', 2), R(24, 52, 5, 4, '#B6C0CE', 2), R(71, 52, 5, 4, '#B6C0CE', 2),
    L(30, 86, 36, 78, 4, N), L(70, 86, 64, 78, 4, N),
  ],
  // Porte-monnaie avec pièce
  wallet: (c) => [
    C(34, 30, 13, OR), C(34, 30, 8, '#F2B705'),
    R(12, 36, 76, 46, c, 10), R(12, 36, 76, 16, 'rgba(255,255,255,0.22)', 10),
    R(58, 54, 32, 18, CREME, 9), C(70, 63, 3.5, c),
  ],
  // Cadeau et nœud
  gift: (c) => [
    R(20, 50, 60, 34, c, 4), R(14, 38, 72, 15, c, 4), R(14, 38, 72, 15, 'rgba(255,255,255,0.22)', 4),
    R(44, 38, 12, 46, OR, 1), Ring(38, 31, 10, 4.5, OR), Ring(62, 31, 10, 4.5, OR), C(50, 36, 6, OR),
  ],
  // Tasse de café fumante
  cafe: (c) => [
    L(38, 32, 42, 18, 3.5, '#B9C4D2'), L(52, 34, 57, 18, 3.5, '#B9C4D2'),
    Ring(76, 56, 11, 5.5, c),
    R(22, 38, 52, 40, c, 0, { borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4 }),
    R(22, 38, 52, 9, '#7A4B2A', 3), R(22, 38, 52, 4, '#A9733F', 2), L(30, 56, 30, 66, 4, 'rgba(255,255,255,0.5)'),
    R(10, 78, 76, 7, GRIS, 3.5),
  ],
  // Burger
  'fast-food': (c) => [
    R(16, 22, 68, 32, '#F0A33A', 0, { borderTopLeftRadius: 34, borderTopRightRadius: 34 }),
    R(32, 30, 5, 3, CREME, 1.5), R(46, 26, 5, 3, CREME, 1.5), R(60, 31, 5, 3, CREME, 1.5), R(52, 38, 5, 3, CREME, 1.5), R(26, 40, 5, 3, CREME, 1.5),
    R(12, 54, 76, 8, '#5BBE5B', 4), R(16, 60, 68, 6, c, 3), R(14, 65, 72, 12, '#7A4B2A', 6),
    R(16, 77, 68, 10, '#F0A33A', 0, { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }),
  ],
  // Boutique et sa banne rayée
  storefront: (c) => [
    R(18, 40, 64, 46, CREME, 3), R(24, 54, 18, 32, c, 3), C(38, 70, 1.8, OR), R(48, 54, 28, 20, VITRE, 3), R(48, 54, 28, 4, 'rgba(255,255,255,0.5)', 2),
    R(10, 22, 80, 22, B, 4),
    ...[0, 1, 2, 3, 4].map((i) => R(10 + i * 16, 22, 16, 22, i % 2 ? B : c, 0)),
    ...[0, 1, 2, 3, 4].map((i) => C(18 + i * 16, 44, 8, i % 2 ? B : c)),
  ],
  // Clé
  key: (c) => [
    Ring(30, 50, 19, 9, c), C(30, 50, 7, 'rgba(255,255,255,0.35)'),
    R(46, 45, 42, 10, c, 4), R(66, 54, 9, 14, c, 2), R(79, 54, 9, 11, c, 2),
    L(48, 47, 84, 47, 2.5, 'rgba(255,255,255,0.4)'), C(22, 38, 3, 'rgba(255,255,255,0.7)'),
  ],
  // Téléphone et touche d'appel
  call: (c) => [
    R(30, 12, 40, 76, N, 9), R(34, 22, 32, 56, '#DFF3FF', 3), R(42, 16, 16, 3, '#6B7A93', 1.5),
    C(50, 50, 13, c), R(44, 44, 12, 4, B, 2, { transform: [{ rotate: '-35deg' }] }), R(44, 52, 12, 4, B, 2, { transform: [{ rotate: '35deg' }] }),
    R(38, 68, 24, 5, c, 2.5), C(50, 83, 2.5, '#6B7A93'),
  ],
  // Bus de ville
  bus: (c) => [
    R(34, 14, 32, 9, OR, 3), R(12, 24, 76, 52, c, 9), R(12, 56, 76, 5, 'rgba(255,255,255,0.7)'),
    ...[0, 1, 2, 3].map((i) => R(18 + i * 17, 31, 13, 17, VITRE, 3)),
    R(14, 64, 72, 3, 'rgba(0,0,0,0.12)'), C(88, 66, 3.5, OR), C(31, 77, 10, N), C(69, 77, 10, N), C(31, 77, 4, GRIS), C(69, 77, 4, GRIS),
  ],
  // Panier de courses
  basket: (c) => [
    Ring(50, 40, 25, 5.5, '#9A6A38'),
    C(36, 42, 11, '#E53935'), C(54, 38, 12, '#7CB342'), C(68, 44, 10, '#FB8C00'),
    R(11, 46, 78, 9, c, 4.5), R(17, 55, 66, 30, '#D9A464', 9),
    R(17, 62, 66, 3, '#B07A45'), R(17, 72, 66, 3, '#B07A45'), L(35, 56, 35, 84, 3, '#B07A45'), L(50, 56, 50, 84, 3, '#B07A45'), L(65, 56, 65, 84, 3, '#B07A45'),
  ],
};

export const Dessin = memo(function Dessin({ icone, couleur, taille }) {
  const pieces = (DESSINS[icone] || DESSINS.cube)(couleur);
  const decalage = (taille - 100) / 2;
  return (
    <View style={{ width: taille, height: taille }}>
      <View style={{ position: 'absolute', left: decalage, top: decalage, width: 100, height: 100, transform: [{ scale: taille / 100 }] }}>
        {pieces.map((p, i) => <View key={i} style={p} />)}
      </View>
    </View>
  );
});

/** Dos de carte Pearl Streets : bleu nuit, liseré vert, losanges et logo au centre. */
export const DosCarte = memo(function DosCarte({ largeur, hauteur }) {
  const cote = Math.min(largeur, hauteur);
  const marge = Math.max(4, cote * 0.07);
  const colonnes = 3;
  const lignes = 4;
  const logoL = Math.min(largeur - 2 * marge - 10, largeur * 0.74);
  const logoH = logoL / RATIO_LOGO;
  return (
    <View style={[styles.dos, { borderRadius: Math.max(10, cote * 0.16) }]}>
      <View style={[styles.cadre, { margin: marge, borderRadius: Math.max(7, cote * 0.11) }]}>
        {Array.from({ length: lignes * colonnes }).map((_, i) => {
          const col = i % colonnes;
          const lig = Math.floor(i / colonnes);
          const d = cote * 0.17;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: ((col + 0.5) / colonnes) * (largeur - 2 * marge) - d / 2 - 2,
                top: ((lig + 0.5) / lignes) * (hauteur - 2 * marge) - d / 2 - 2,
                width: d, height: d, borderRadius: d * 0.2,
                backgroundColor: (col + lig) % 2 ? '#26407A' : 'rgba(11,181,142,0.28)',
                transform: [{ rotate: '45deg' }],
              }}
            />
          );
        })}
        <View style={[styles.plaque, { width: logoL + 12, height: logoH + 12, borderRadius: 9 }]}>
          <Image source={LOGO_PEARL} style={{ width: logoL, height: logoH }} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dos: {
    ...StyleSheet.absoluteFillObject, backgroundColor: BLEU_NUIT, borderWidth: 2.5, borderColor: VERT_PEARL, overflow: 'hidden',
  },
  cadre: {
    flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  plaque: { backgroundColor: BLEU_NUIT, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: VERT_PEARL },
});
