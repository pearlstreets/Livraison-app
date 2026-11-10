/**
 * Récompenses visibles des mini-jeux livreur (Rush, Sommet, Drone, Coupe).
 *
 * Suivi pendant la partie (aucun rendu React) :
 *   const suivi = creerSuivi(PALIERS, meilleur, scoreDepart);
 *   suivreScore(suivi, score)  rend les annonces à faire : palier franchi
 *   ({ type: 'palier', n }) et record battu ({ type: 'record' }), une fois chacune.
 *
 * <BanniereRecompense ref={banniereRef} haut={...} />
 *   banniereRef.current.montrer({ texte, icone, couleur })  grande annonce
 *   au centre (palier, record, série, bonus), animée par le pilote natif.
 *
 * <EtoilesFin n={0..3} t={t} colors={colors} />  récap de fin : 3 étoiles
 * qui s'allument l'une après l'autre et un mot d'encouragement.
 * etoilesPour(score, meilleurAvant, paliers) donne le nombre d'étoiles.
 *
 * Même style que la bannière de palier du Rush : bleu nuit translucide,
 * liseré doré, texte blanc. Jamais de fond noir.
 */
import React, { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const OR_RECOMPENSE = '#F2B705';
const FOND_BANNIERE = 'rgba(12,28,56,0.82)';

// 1 000, 25 000 : espace insécable entre les milliers.
export function formaterNombre(n) {
  return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function creerSuivi(paliers, meilleur = 0, scoreDepart = 0) {
  let prochain = 0;
  while (prochain < paliers.length && scoreDepart >= paliers[prochain]) prochain += 1;
  return {
    paliers,
    meilleur: Number(meilleur) || 0,
    prochain,
    recordAnnonce: (Number(meilleur) || 0) > 0 && scoreDepart > meilleur,
  };
}

export function suivreScore(suivi, score) {
  if (!suivi) return null;
  let annonce = null;
  while (suivi.prochain < suivi.paliers.length && score >= suivi.paliers[suivi.prochain]) {
    annonce = { type: 'palier', n: suivi.paliers[suivi.prochain] };
    suivi.prochain += 1;
  }
  // Le record battu passe devant un palier franchi au même moment.
  if (!suivi.recordAnnonce && suivi.meilleur > 0 && score > suivi.meilleur) {
    suivi.recordAnnonce = true;
    annonce = { type: 'record' };
  }
  return annonce;
}

export function etoilesPour(score, meilleurAvant, paliers) {
  if (!(score > 0)) return 0;
  const m = Number(meilleurAvant) || 0;
  if ((m > 0 && score > m) || score >= paliers[2]) return 3;
  if ((m > 0 && score >= m * 0.6) || score >= paliers[1]) return 2;
  return 1;
}

export const BanniereRecompense = forwardRef(function BanniereRecompense({ haut = '24%' }, ref) {
  const [contenu, setContenu] = useState(null);
  const v = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);
  useImperativeHandle(ref, () => ({
    montrer(c) {
      animRef.current?.stop();
      setContenu({ ...c, n: Date.now() });
    },
    cacher() {
      animRef.current?.stop();
      v.setValue(0);
      setContenu(null);
    },
  }), [v]);
  useEffect(() => {
    if (!contenu) return undefined;
    v.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(v, { toValue: 2, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    animRef.current = anim;
    anim.start(({ finished }) => { if (finished) setContenu(null); });
    return () => anim.stop();
  }, [contenu, v]);
  if (!contenu) return null;
  const couleur = contenu.couleur || OR_RECOMPENSE;
  const scale = v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.5, 1, 1.08] });
  const opacity = v.interpolate({ inputRange: [0, 0.4, 1, 1.6, 2], outputRange: [0, 1, 1, 1, 0] });
  const translateY = v.interpolate({ inputRange: [0, 1, 2], outputRange: [18, 0, -14] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banniere, { top: haut, borderColor: couleur, opacity, transform: [{ translateY }, { scale }] }]}
    >
      {contenu.icone ? <Ionicons name={contenu.icone} size={26} color={couleur} /> : null}
      <Text style={styles.banniereTexte} numberOfLines={1} adjustsFontSizeToFit>{contenu.texte}</Text>
    </Animated.View>
  );
});

const Etoile = memo(function Etoile({ allumee, delai }) {
  const v = useRef(new Animated.Value(allumee ? 0 : 1)).current;
  useEffect(() => {
    if (!allumee) return undefined;
    v.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(delai),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [allumee, delai, v]);
  const scale = allumee ? v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) : 1;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={allumee ? 'star' : 'star-outline'} size={38} color={allumee ? OR_RECOMPENSE : '#B8C0CC'} />
    </Animated.View>
  );
});

export const EtoilesFin = memo(function EtoilesFin({ n, t, colors }) {
  const nb = Math.max(0, Math.min(3, n || 0));
  return (
    <View style={styles.etoiles} accessibilityLabel={t('jeuRecompEtoiles', { n: nb })}>
      <View style={styles.rangee}>
        {[0, 1, 2].map((i) => <Etoile key={i} allumee={i < nb} delai={150 + i * 220} />)}
      </View>
      {nb > 0 ? <Text style={[styles.bravo, { color: colors.text }]}>{t(`jeuRecompBravo${nb}`)}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  banniere: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 16, borderWidth: 2,
    backgroundColor: FOND_BANNIERE, maxWidth: '90%',
  },
  banniereTexte: { color: '#fff', fontSize: 23, fontWeight: '900', flexShrink: 1 },
  etoiles: { alignItems: 'center', marginTop: 8 },
  rangee: { flexDirection: 'row', gap: 6 },
  bravo: { fontSize: 15, fontWeight: '800', marginTop: 4 },
});
