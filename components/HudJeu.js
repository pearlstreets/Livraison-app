/**
 * HUD commun des mini-jeux : pastilles de score, vies, compteur d'objets
 * « 3 / 8 » et boosters actifs avec jauge de temps.
 *
 *   <HudJeu
 *     colors={colors}
 *     score={score}                       // pastille score (étoile)
 *     niveau={niveau}                     // facultatif, pastille « Niv. n » via niveauLibelle
 *     niveauLibelle={t('jeuNiveauCourt', { n: niveau })}
 *     vies={vies} viesMax={3}             // facultatif, coeurs
 *     objets={{ n: 3, total: 8, icone: 'cube', libelle: t('...') }}   // facultatif
 *     boosters={[{ id: 'aimant', icone: 'magnet', couleur: '#8E44AD', ratio: 0.6 }]}  // ratio 0..1
 *   />
 *
 * Composants isolés : PastilleScore, Vies, CompteurObjets, BoosterJauge.
 * Ne capte pas le toucher. Textes blancs sur fond de couleur, jamais de noir.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '../contexts/ThemeContext';

const OR = '#F2B705';
const ROUGE = '#E74C3C';
const VERT = '#16A34A';

export function PastilleScore({ valeur, icone = 'star', couleur = OR, libelle, colors }) {
  const pop = useRef(new Animated.Value(1)).current;
  const avant = useRef(valeur);
  useEffect(() => {
    if (avant.current !== valeur) {
      avant.current = valeur;
      pop.setValue(1.25);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
  }, [valeur, pop]);
  return (
    <Animated.View style={[styles.pastille, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: pop }] }]}>
      {libelle ? <Text style={styles.niveau}>{libelle}</Text> : null}
      {libelle ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
      <Ionicons name={icone} size={16} color={couleur} />
      <Text style={[styles.valeur, { color: colors.text }]}>{valeur}</Text>
    </Animated.View>
  );
}

export function Vies({ vies, max = 3, colors }) {
  return (
    <View style={[styles.pastille, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {Array.from({ length: max }).map((_, i) => (
        <Ionicons key={i} name={i < vies ? 'heart' : 'heart-outline'} size={18} color={i < vies ? ROUGE : colors.textMuted} />
      ))}
    </View>
  );
}

export function CompteurObjets({ n, total, icone = 'cube', libelle, colors }) {
  const fini = total > 0 && n >= total;
  const ratio = total > 0 ? Math.min(1, n / total) : 0;
  return (
    <View style={[styles.compteur, { backgroundColor: fini ? VERT : colors.card, borderColor: fini ? VERT : colors.border }]}>
      <Ionicons name={icone} size={17} color={fini ? '#fff' : BRAND} />
      <Text style={[styles.valeur, { color: fini ? '#fff' : colors.text }]}>{n} / {total}</Text>
      {libelle ? <Text style={[styles.libelle, { color: fini ? '#fff' : colors.textSoft }]} numberOfLines={1}>{libelle}</Text> : null}
      <View style={[styles.jauge, { backgroundColor: fini ? 'rgba(255,255,255,0.35)' : colors.border }]}>
        <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: fini ? '#fff' : BRAND, borderRadius: 3 }} />
      </View>
    </View>
  );
}

export function BoosterJauge({ icone, couleur = BRAND, ratio = 1 }) {
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <View style={[styles.booster, { backgroundColor: couleur }]}>
      <Ionicons name={icone} size={16} color="#fff" />
      <View style={styles.boosterFond}>
        <View style={{ width: `${r * 100}%`, height: '100%', backgroundColor: '#fff', borderRadius: 3 }} />
      </View>
    </View>
  );
}

export default function HudJeu({ colors, score, niveauLibelle, vies, viesMax = 3, objets, boosters = [] }) {
  return (
    <View pointerEvents="none" style={styles.hud}>
      <View style={styles.rangee}>
        <PastilleScore valeur={score} libelle={niveauLibelle} colors={colors} />
        {vies != null ? <Vies vies={vies} max={viesMax} colors={colors} /> : null}
        {objets ? <CompteurObjets {...objets} colors={colors} /> : null}
      </View>
      {boosters.length > 0 && (
        <View style={styles.rangee}>
          {boosters.map((b) => <BoosterJauge key={b.id} icone={b.icone} couleur={b.couleur} ratio={b.ratio} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { gap: 6 },
  rangee: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  pastille: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, paddingHorizontal: 11, height: 34, borderWidth: 1,
  },
  niveau: { color: BRAND, fontWeight: '900', fontSize: 14 },
  sep: { width: 1, height: 14 },
  valeur: { fontWeight: '900', fontSize: 15 },
  compteur: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, paddingHorizontal: 11, height: 34, borderWidth: 1,
    overflow: 'hidden',
  },
  libelle: { fontSize: 12, fontWeight: '700', maxWidth: 90 },
  jauge: { width: 38, height: 6, borderRadius: 3, overflow: 'hidden' },
  booster: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 9, height: 28 },
  boosterFond: { width: 44, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
});
