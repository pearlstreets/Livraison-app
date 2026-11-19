/**
 * Décor du mini-jeu « Fruits express » (clé coupe), dessiné en View seulement.
 *
 *   <DecorCoupe haut={insets.top} />
 *
 * Planche à découper (lattes de bois clair), banne rayée vert et crème au
 * bord festonné, petite enseigne Pearl Streets suspendue (discrète) et
 * cagettes de l'étal du primeur en bas. Mesure sa propre taille, aucun état
 * de jeu, aucun toucher. Fond clair, jamais de fond noir.
 */
import React, {memo, useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {PlaqueLogo} from './FondJeu';

export const FOND_PLANCHE = '#F1DEC0';
const LATTE_PLANCHE = '#E6CDA6';
const RAYURE_A = '#0BB58E';
const RAYURE_B = '#FFF8EC';
const BOIS = '#C99A5B';
const LATTE = '#B3864C';
const CORDON = '#7A5A3A';
const LARGEUR_RAYURE = 34;
const HAUTEUR_PLAQUE = 26;
const LONGUEUR_CORDON = 10;

const Marche = memo(function Marche({l, h, haut}) {
  const hBanne = haut + 46;
  const nb = Math.ceil(l / LARGEUR_RAYURE) + 1;
  const hCagette = Math.max(34, h * 0.06);
  const nbCagettes = Math.max(3, Math.round(l / 110));
  const lCagette = l / nbCagettes;
  const nbLattes = Math.ceil(h / 90);
  const topEnseigne = hBanne + LARGEUR_RAYURE / 2 - 2;
  return (
    <>
      {/* Planche à découper */}
      {Array.from({length: nbLattes}).map((_, i) => (
        <View key={`l${i}`} style={[styles.latte, {top: i * 90 + 88}]} />
      ))}
      {/* Banne rayée et son bord festonné */}
      <View style={[styles.rangee, {top: 0, height: hBanne}]}>
        {Array.from({length: nb}).map((_, i) => (
          <View
            key={i}
            style={{
              width: LARGEUR_RAYURE,
              height: hBanne,
              backgroundColor: i % 2 ? RAYURE_B : RAYURE_A,
            }}
          />
        ))}
      </View>
      <View
        style={[
          styles.rangee,
          {top: hBanne - LARGEUR_RAYURE / 2, height: LARGEUR_RAYURE},
        ]}>
        {Array.from({length: nb}).map((_, i) => (
          <View
            key={i}
            style={[
              styles.feston,
              {backgroundColor: i % 2 ? RAYURE_B : RAYURE_A},
            ]}
          />
        ))}
      </View>
      <View style={[styles.ombreBanne, {top: hBanne + LARGEUR_RAYURE / 2}]} />
      {/* Petite enseigne suspendue sous la banne */}
      <View style={[styles.enseigne, {top: topEnseigne}]}>
        <View style={styles.cordons}>
          <View style={styles.cordon} />
          <View style={styles.cordon} />
        </View>
        <PlaqueLogo hauteur={HAUTEUR_PLAQUE} />
      </View>
      {/* Cagettes de l'étal */}
      <View style={[styles.rangee, {bottom: 0, height: hCagette}]}>
        {Array.from({length: nbCagettes}).map((_, i) => (
          <View
            key={i}
            style={[styles.cagette, {width: lCagette - 6, height: hCagette}]}>
            <View style={styles.latteCagette} />
            <View style={styles.latteCagette} />
          </View>
        ))}
      </View>
    </>
  );
});

export default memo(function DecorCoupe({haut = 0}) {
  const [taille, setTaille] = useState({l: 0, h: 0});
  const mesurer = useCallback(ev => {
    const {width, height} = ev.nativeEvent.layout;
    setTaille(t =>
      Math.round(t.l) === Math.round(width) &&
      Math.round(t.h) === Math.round(height)
        ? t
        : {l: width, h: height},
    );
  }, []);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={styles.fond}
      onLayout={mesurer}>
      {taille.l > 0 && <Marche l={taille.l} h={taille.h} haut={haut} />}
    </View>
  );
});

const styles = StyleSheet.create({
  fond: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: FOND_PLANCHE,
    overflow: 'hidden',
  },
  latte: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: LATTE_PLANCHE,
  },
  rangee: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  feston: {
    width: LARGEUR_RAYURE,
    height: LARGEUR_RAYURE,
    borderRadius: LARGEUR_RAYURE / 2,
  },
  ombreBanne: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  enseigne: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    opacity: 0.6,
  },
  cordons: {flexDirection: 'row', justifyContent: 'space-between', width: 56},
  cordon: {width: 2, height: LONGUEUR_CORDON, backgroundColor: CORDON},
  cagette: {
    marginHorizontal: 3,
    backgroundColor: BOIS,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    justifyContent: 'space-evenly',
  },
  latteCagette: {height: 3, backgroundColor: LATTE},
});
