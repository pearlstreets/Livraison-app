/**
 * Décor de fond des mini-jeux 2D (Pile de colis, Tournée parfaite).
 *
 * Ciel de ville, soleil, nuages, ligne de toits et, selon le jeu, des étals
 * de marché aux auvents rayés et aux gros fruits. Le logo Pearl Streets reste
 * discret : petit, peu opaque, dans un coin (LogoDiscret), jamais un gros
 * panneau. Le joueur et les objets restent ce qui se voit le mieux.
 *
 * Dessin en View seulement, posé en absolu sous le jeu, sans toucher
 * (pointerEvents none) : il ne gêne ni la lecture ni les gestes.
 *
 * - variante : 'pile' (toits et cheminées) ou 'tournee' (marché du quartier).
 * - hautLogo, hautPlaque : gardés pour compatibilité, le logo discret a une taille fixe.
 * - sansLogo : pas de logo dans le coin (le jeu le montre déjà ailleurs).
 */
import React, {memo} from 'react';
import {View, Image, StyleSheet} from 'react-native';

export const LOGO_PEARL = require('../../assets/images/LogoNew.webp');
export const RATIO_LOGO = 3024 / 1415; // largeur / hauteur du logo
export const PLAQUE_LOGO = '#1E2A4A'; // bleu nuit, jamais noir
const VERT_LOGO = '#0BB58E';

const CIEL = ['#CFEAF8', '#D8EEF9', '#E2F2FB', '#EAF6FC'];
const FACADES = ['#EBDCCB', '#E2CDB6', '#F1E3D3', '#DDE6EE', '#E8D5C0', '#F3E8DA'];
const TOIT = '#A9B4C8';
const VITRE = '#BBD9EC';
const AUVENTS = ['#FF6A13', '#2F80ED', '#09D7AA', '#E74C3C'];
const FRUITS = ['#FF8A00', '#E74C3C', '#F2B705', '#7BC043', '#FF6A13', '#C0392B', '#F2B705', '#8BC34A'];

// Hauteurs des immeubles (part de la hauteur de la zone) et cheminées.
const IMMEUBLES_PILE = [0.34, 0.46, 0.3, 0.52, 0.38, 0.44, 0.32];
const IMMEUBLES_TOURNEE = [0.3, 0.4, 0.26, 0.36, 0.42, 0.28];

/** Mesures de la plaque du logo pour une hauteur donnée. */
export function mesurePlaque(hauteur) {
  const h = Math.max(24, Math.round(hauteur));
  const marge = Math.round(h * 0.14);
  const hLogo = h - 2 * marge;
  const lLogo = Math.round(hLogo * RATIO_LOGO);
  return {h, marge, hLogo, lLogo, l: lLogo + 2 * (marge + 4)};
}

/** Plaque bleu nuit avec le logo blanc et vert, liseré vert. */
export const PlaqueLogo = memo(function PlaqueLogo({hauteur, style}) {
  const {h, marge, hLogo, lLogo} = mesurePlaque(hauteur);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[styles.plaque, {height: h, paddingHorizontal: marge + 4, borderRadius: Math.round(h * 0.18)}, style]}>
      <Image source={LOGO_PEARL} style={{width: lLogo, height: hLogo}} resizeMode="contain" />
    </View>
  );
});

export const OPACITE_LOGO_DISCRET = 0.38;

/** Petit logo discret, peu opaque, posé dans un coin du décor. */
export const LogoDiscret = memo(function LogoDiscret({style}) {
  return (
    <View pointerEvents="none" accessible={false} style={[styles.logoDiscret, style]}>
      <PlaqueLogo hauteur={24} />
    </View>
  );
});

function Nuage({style}) {
  return (
    <View pointerEvents="none" style={[styles.nuage, style]}>
      <View style={styles.nuageBosse} />
      <View style={[styles.nuageBosse, styles.nuageBosse2]} />
    </View>
  );
}

function Immeuble({part, couleur, cheminee, fenetres = 2}) {
  return (
    <View style={[styles.immeuble, {height: `${part * 100}%`}]}>
      {cheminee && <View style={styles.cheminee} />}
      <View style={styles.toit} />
      <View style={[styles.facade, {backgroundColor: couleur}]}>
        {Array.from({length: 4}).map((_, r) => (
          <View key={r} style={styles.rangee}>
            {Array.from({length: fenetres}).map((__, k) => (
              <View key={k} style={styles.fenetre} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Étal de marché : auvent rayé, comptoir et gros fruits. */
function Etal({i}) {
  const couleur = AUVENTS[i % AUVENTS.length];
  return (
    <View style={styles.etal}>
      <View style={styles.auvent}>
        {Array.from({length: 5}).map((_, k) => (
          <View key={k} style={[styles.rayure, {backgroundColor: k % 2 ? '#FFFFFF' : couleur}]} />
        ))}
      </View>
      <View style={styles.festons}>
        {Array.from({length: 5}).map((_, k) => (
          <View key={k} style={[styles.feston, {backgroundColor: k % 2 ? '#FFFFFF' : couleur}]} />
        ))}
      </View>
      <View style={styles.montants}>
        <View style={styles.montant} />
        <View style={styles.montant} />
      </View>
      <View style={styles.fruits}>
        {[0, 1, 2].map(k => (
          <View key={k} style={[styles.fruit, {backgroundColor: FRUITS[(i * 3 + k) % FRUITS.length]}]}>
            <View style={styles.reflet} />
          </View>
        ))}
      </View>
      <View style={styles.comptoir} />
    </View>
  );
}

export default memo(function FondJeu({variante = 'pile', sansLogo = false}) {
  const tournee = variante === 'tournee';
  const immeubles = tournee ? IMMEUBLES_TOURNEE : IMMEUBLES_PILE;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Ciel en bandes douces */}
      <View style={StyleSheet.absoluteFill}>
        {CIEL.map(c => (
          <View key={c} style={[styles.bandeCiel, {backgroundColor: c}]} />
        ))}
      </View>
      <View style={styles.soleil} />
      <Nuage style={{top: '16%', left: '6%'}} />
      <Nuage style={{top: '26%', right: '8%', transform: [{scale: 0.8}]}} />

      {/* Ligne de toits */}
      <View style={[styles.rue, {height: tournee ? '46%' : '58%'}]}>
        {immeubles.map((p, i) => (
          <Immeuble
            key={i}
            part={p / (tournee ? 0.46 : 0.58)}
            couleur={FACADES[i % FACADES.length]}
            cheminee={!tournee && i % 2 === 0}
            fenetres={i % 3 === 0 ? 3 : 2}
          />
        ))}
      </View>

      {/* Marché du quartier, au premier plan */}
      {tournee && (
        <View style={styles.marche}>
          {[0, 1, 2, 3].map(i => (
            <Etal key={i} i={i} />
          ))}
        </View>
      )}

      {/* Logo Pearl Streets, petit et discret dans un coin */}
      {!sansLogo && <LogoDiscret />}
    </View>
  );
});

const styles = StyleSheet.create({
  logoDiscret: {position: 'absolute', top: 8, right: 8, opacity: OPACITE_LOGO_DISCRET},
  bandeCiel: {flex: 1},
  soleil: {
    position: 'absolute',
    top: '7%',
    right: '12%',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFE38A',
    borderWidth: 6,
    borderColor: 'rgba(255, 227, 138, 0.45)',
  },
  nuage: {position: 'absolute', width: 78, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', opacity: 0.9},
  nuageBosse: {position: 'absolute', left: 14, top: -12, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF'},
  nuageBosse2: {left: 36, top: -8, width: 24, height: 24, borderRadius: 12},
  rue: {position: 'absolute', left: -6, right: -6, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 3},
  immeuble: {flex: 1, alignItems: 'stretch'},
  cheminee: {position: 'absolute', top: -10, right: '22%', width: 9, height: 14, borderRadius: 2, backgroundColor: '#C98B4B'},
  toit: {height: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: TOIT},
  facade: {flex: 1, paddingTop: 8, paddingHorizontal: 6, justifyContent: 'flex-start', gap: 8},
  rangee: {flexDirection: 'row', justifyContent: 'space-around'},
  fenetre: {width: 10, height: 14, borderRadius: 2, backgroundColor: VITRE, borderWidth: 1.5, borderColor: '#FFFFFF'},
  marche: {position: 'absolute', left: 0, right: 0, bottom: 0, height: '26%', flexDirection: 'row', gap: 6, paddingHorizontal: 6},
  etal: {flex: 1, justifyContent: 'flex-end'},
  auvent: {height: 18, flexDirection: 'row', borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: 'hidden'},
  rayure: {flex: 1},
  festons: {height: 8, flexDirection: 'row'},
  feston: {flex: 1, borderBottomLeftRadius: 6, borderBottomRightRadius: 6},
  montants: {flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 3},
  montant: {width: 4, backgroundColor: '#8A6A4A'},
  fruits: {flexDirection: 'row', justifyContent: 'center', gap: 2, marginBottom: -6, zIndex: 1},
  fruit: {width: 22, height: 22, borderRadius: 11},
  reflet: {position: 'absolute', left: 5, top: 4, width: 7, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)'},
  comptoir: {height: 16, borderRadius: 3, backgroundColor: '#C98B4B'},
  plaque: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PLAQUE_LOGO,
    borderWidth: 2,
    borderColor: VERT_LOGO,
  },
});
