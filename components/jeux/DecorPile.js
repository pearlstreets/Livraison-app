/**
 * Décor et pièces dessinées du jeu « Pile de colis » (dessin en View seulement).
 *
 * - DecorPile : rue commerçante par beau temps (ciel dégradé, soleil, nuages, guirlande de
 *   fanions, ligne d'immeubles, boutiques aux auvents rayés, trottoir avec bordure) et le logo
 *   Pearl Streets petit et discret dans un coin. Sans toucher (pointerEvents none).
 * - ColisCadeau : paquet cadeau (papier de couleur, couvercle, ruban, motif), avec un nœud
 *   quand il est au sommet de la pile ou suspendu au crochet.
 * - Etincelles : gerbe d'étoiles pour une pose parfaite.
 *
 * App livreur : pas de module de dégradé natif (et une mise à jour OTA ne peut
 * pas en ajouter), les dégradés d'AppUser (react-native-linear-gradient) sont
 * dessinés en fines bandes de couleur (Degrade ci-dessous), même rendu.
 */
import React, {memo, useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LogoDiscret} from './FondJeu';

export const H_COLIS = 30;

/** Couleur '#RRGGBB' vers [r, g, b]. */
function rvb(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
}

/** Dégradé vertical (haut vers bas) en bandes, à la place d'un dégradé natif. */
const Degrade = memo(function Degrade({colors, style, bandes = 24}) {
  const c = colors.map(rvb);
  const n = Math.max(2, bandes);
  return (
    <View pointerEvents="none" style={[style, {overflow: 'hidden'}]}>
      {Array.from({length: n}).map((_, i) => {
        const t = (i / (n - 1)) * (c.length - 1);
        const k = Math.min(c.length - 2, Math.floor(t));
        const f = t - k;
        const [r, g, b] = [0, 1, 2].map(j => Math.round(c[k][j] + (c[k + 1][j] - c[k][j]) * f));
        return <View key={i} style={{flex: 1, backgroundColor: `rgb(${r}, ${g}, ${b})`}} />;
      })}
    </View>
  );
});

/** Papiers cadeaux : couleur, reflet du couvercle, ombre du bas, ruban. */
export const PAPIERS = [
  {fond: '#FF6F91', clair: '#FF9DB4', ombre: '#D94872', ruban: '#FFF1B8'},
  {fond: '#4D9DE0', clair: '#7DB9EC', ombre: '#2F78B8', ruban: '#FFFFFF'},
  {fond: '#2BC4A0', clair: '#5ED9BC', ombre: '#1B9A7C', ruban: '#FFE08A'},
  {fond: '#FF9F43', clair: '#FFBC78', ombre: '#D97A1F', ruban: '#FFFFFF'},
  {fond: '#9B6DD6', clair: '#B994E6', ombre: '#7448AE', ruban: '#FFE08A'},
  {fond: '#F5C842', clair: '#FADB77', ombre: '#CB9F1C', ruban: '#E74C3C'},
];

export function papier(idx) {
  const n = PAPIERS.length;
  return PAPIERS[(((Math.floor(idx) || 0) % n) + n) % n];
}

/** Paquet cadeau : x (bord gauche), l (largeur), bas (px depuis le bas), idx (couleur stable). */
export const ColisCadeau = memo(function ColisCadeau({idx = 0, x, l, bas, noeud = false, corde = false}) {
  const p = papier(idx);
  const largeur = Math.max(2, l);
  const motif = Math.abs(Math.floor(idx) || 0) % 3; // 0 uni, 1 pois, 2 rayures
  return (
    <View style={[st.colis, {left: x, bottom: bas, width: largeur}]}>
      {corde && <View style={[st.corde, {left: largeur / 2 - 1}]} />}
      <View style={[st.boite, {backgroundColor: p.fond, borderBottomColor: p.ombre}]}>
        {largeur > 40 && motif === 1 && (
          <>
            <View style={[st.pois, {left: '12%', top: 14}]} />
            <View style={[st.pois, {left: '24%', top: 20, width: 4, height: 4}]} />
            <View style={[st.pois, {right: '12%', top: 15}]} />
            <View style={[st.pois, {right: '26%', top: 21, width: 4, height: 4}]} />
          </>
        )}
        {largeur > 40 && motif === 2 && (
          <>
            <View style={[st.rayure, {left: '22%'}]} />
            <View style={[st.rayure, {right: '22%'}]} />
          </>
        )}
        <View style={[st.couvercle, {backgroundColor: p.clair, borderBottomColor: p.ombre}]} />
        {largeur > 14 && <View style={[st.ruban, {backgroundColor: p.ruban}]} />}
      </View>
      {noeud && largeur > 26 && (
        <View style={[st.noeud, {left: largeur / 2}]}>
          <View style={[st.boucle, {left: -15, borderColor: p.ruban, transform: [{rotate: '-24deg'}]}]} />
          <View style={[st.boucle, {left: 1, borderColor: p.ruban, transform: [{rotate: '24deg'}]}]} />
          <View style={[st.cran, {backgroundColor: p.ruban, borderColor: p.ombre}]} />
        </View>
      )}
    </View>
  );
});

/** Gerbe d'étoiles autour de (x, bas), rejouée à chaque nouveau `n`. */
export function Etincelles({x, bas, n}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start();
  }, [n, anim]);
  return (
    <View pointerEvents="none" style={{position: 'absolute', left: x, bottom: bas + H_COLIS / 2, width: 0, height: 0}}>
      {Array.from({length: 8}).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const d = 36 + (i % 2) * 16;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: -8,
              top: -8,
              opacity: anim.interpolate({inputRange: [0, 0.15, 1], outputRange: [0, 1, 0]}),
              transform: [
                {translateX: anim.interpolate({inputRange: [0, 1], outputRange: [0, Math.cos(a) * d]})},
                {translateY: anim.interpolate({inputRange: [0, 1], outputRange: [0, Math.sin(a) * d]})},
                {scale: anim.interpolate({inputRange: [0, 1], outputRange: [0.5, 1.25]})},
              ],
            }}>
            <Ionicons name="star" size={16} color={i % 2 ? '#F2B705' : '#FF6F91'} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const IMMEUBLES = [
  {h: 0.5, c: '#E9DDE9'}, {h: 0.62, c: '#DCE7F0'}, {h: 0.42, c: '#F1E6D2'},
  {h: 0.7, c: '#E2E9DA'}, {h: 0.48, c: '#F0DDDD'}, {h: 0.58, c: '#DDE3F2'}, {h: 0.44, c: '#EFE7D8'},
];
const BOUTIQUES = [
  {facade: '#F8E7DA', couleur: '#E74C3C', icone: 'gift'},
  {facade: '#DDEBF6', couleur: '#2F80ED', icone: 'cafe'},
  {facade: '#F7EDCB', couleur: '#09D7AA', icone: 'shirt'},
  {facade: '#EBDDF2', couleur: '#FF9F43', icone: 'flower'},
];
const FANIONS = ['#FF6F91', '#F5C842', '#4D9DE0', '#2BC4A0', '#9B6DD6', '#FF9F43'];

function Boutique({b, i}) {
  return (
    <View style={[st.boutique, {backgroundColor: b.facade}]}>
      <View style={[st.enseigne, {backgroundColor: b.couleur}]}>
        <Ionicons name={b.icone} size={12} color="#FFFFFF" />
      </View>
      <View style={st.auvent}>
        {Array.from({length: 6}).map((_, k) => (
          <View key={k} style={{flex: 1, backgroundColor: k % 2 ? '#FFFFFF' : b.couleur}} />
        ))}
      </View>
      <View style={st.festons}>
        {Array.from({length: 6}).map((_, k) => (
          <View key={k} style={[st.feston, {backgroundColor: k % 2 ? '#FFFFFF' : b.couleur}]} />
        ))}
      </View>
      <View style={st.vitrine}>
        <View style={st.reflet} />
        <View style={st.produits}>
          {[0, 1, 2].map(k => (
            <View key={k} style={[st.produit, {height: 9 + ((i + k) % 3) * 6, backgroundColor: papier(i + k).fond}]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function Nuage({style}) {
  return (
    <View pointerEvents="none" style={[st.nuage, style]}>
      <View style={st.nuageBosse} />
      <View style={[st.nuageBosse, {left: 38, top: -8, width: 26, height: 26, borderRadius: 13}]} />
    </View>
  );
}

export const DecorPile = memo(function DecorPile({sol = 14}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Degrade colors={['#A9DBF5', '#D3EEFB', '#FFF4DE']} style={StyleSheet.absoluteFill} />
      <View style={st.soleil}>
        <View style={st.soleilCoeur} />
      </View>
      <Nuage style={{top: '22%', left: '5%'}} />
      <Nuage style={{top: '31%', right: '6%', transform: [{scale: 0.8}]}} />

      {/* Guirlande de fanions */}
      <View style={st.guirlande}>
        {Array.from({length: 12}).map((_, k) => (
          <View key={k} style={{transform: [{translateY: Math.sin((k / 11) * Math.PI) * 9}]}}>
            <View style={[st.fanionHaut, {backgroundColor: FANIONS[k % FANIONS.length]}]} />
            <View style={[st.fanion, {borderTopColor: FANIONS[k % FANIONS.length]}]} />
          </View>
        ))}
      </View>

      {/* Immeubles du fond */}
      <View style={[st.immeubles, {bottom: sol}]}>
        {IMMEUBLES.map((im, i) => (
          <View key={i} style={[st.immeuble, {height: `${im.h * 62}%`, backgroundColor: im.c}]}>
            {Array.from({length: 3}).map((_, r) => (
              <View key={r} style={st.fenetres}>
                <View style={st.fenetre} />
                <View style={st.fenetre} />
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Boutiques */}
      <View style={[st.rangeeBoutiques, {bottom: sol}]}>
        {BOUTIQUES.map((b, i) => (
          <Boutique key={i} b={b} i={i} />
        ))}
      </View>

      {/* Trottoir */}
      <Degrade colors={['#E6DFD3', '#C9C0B1']} bandes={6} style={[st.trottoir, {height: sol}]} />

      {/* Logo Pearl Streets : petit et discret, dans un coin */}
      <LogoDiscret />
    </View>
  );
});

const st = StyleSheet.create({
  colis: {position: 'absolute', height: H_COLIS},
  boite: {flex: 1, borderRadius: 4, borderBottomWidth: 3, overflow: 'hidden', alignItems: 'center'},
  couvercle: {position: 'absolute', top: 0, left: 0, right: 0, height: 9, borderBottomWidth: 1},
  ruban: {position: 'absolute', top: 0, bottom: 0, width: 9, opacity: 0.95},
  pois: {position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)'},
  rayure: {position: 'absolute', top: 10, bottom: 0, width: 3, backgroundColor: 'rgba(255,255,255,0.28)'},
  corde: {position: 'absolute', bottom: H_COLIS + 2, width: 2, height: 700, backgroundColor: 'rgba(91, 96, 128, 0.55)'},
  noeud: {position: 'absolute', bottom: H_COLIS - 4, width: 0, height: 0},
  boucle: {position: 'absolute', bottom: -1, width: 15, height: 10, borderRadius: 6, borderWidth: 3},
  cran: {position: 'absolute', left: -4, bottom: -3, width: 8, height: 8, borderRadius: 4, borderWidth: 1},
  soleil: {
    position: 'absolute', top: '17%', right: '10%', width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255, 227, 138, 0.45)', alignItems: 'center', justifyContent: 'center',
  },
  soleilCoeur: {width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFD966'},
  nuage: {position: 'absolute', width: 78, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', opacity: 0.92},
  nuageBosse: {position: 'absolute', left: 12, top: -12, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF'},
  guirlande: {position: 'absolute', top: 0, left: 4, right: 4, flexDirection: 'row', justifyContent: 'space-between'},
  fanionHaut: {width: 16, height: 3},
  fanion: {
    width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  immeubles: {position: 'absolute', left: 0, right: 0, height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingHorizontal: 2},
  immeuble: {flex: 1, borderTopLeftRadius: 5, borderTopRightRadius: 5, paddingTop: 8, gap: 9, opacity: 0.85},
  fenetres: {flexDirection: 'row', justifyContent: 'space-around'},
  fenetre: {width: 8, height: 11, borderRadius: 2, backgroundColor: '#C7E2F2'},
  rangeeBoutiques: {position: 'absolute', left: 0, right: 0, height: '34%', flexDirection: 'row', alignItems: 'stretch', gap: 3, paddingHorizontal: 3},
  boutique: {flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'stretch'},
  enseigne: {alignSelf: 'center', marginTop: 5, width: 28, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center'},
  auvent: {height: 12, flexDirection: 'row', marginTop: 5},
  festons: {height: 6, flexDirection: 'row'},
  feston: {flex: 1, borderBottomLeftRadius: 6, borderBottomRightRadius: 6},
  vitrine: {flex: 1, margin: 5, marginTop: 4, borderRadius: 4, backgroundColor: '#CFE8F7', borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden', justifyContent: 'flex-end'},
  reflet: {position: 'absolute', top: -6, left: '30%', width: 8, height: 60, backgroundColor: 'rgba(255,255,255,0.5)', transform: [{rotate: '20deg'}]},
  produits: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-evenly', paddingBottom: 3},
  produit: {width: 10, borderRadius: 2},
  trottoir: {position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 2, borderTopColor: '#F2EDE4'},
});
