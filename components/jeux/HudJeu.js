/**
 * HUD commun des mini-jeux : pastilles score, niveau, vies, compteur d'objets
 * et boosters actifs avec jauge de temps. Composants indépendants, à assembler.
 *
 *   <HudJeu score={1240} niveau={3} vies={2} viesMax={3}
 *           objets={{n: 3, total: 8, icone: 'cube', libelle: 'Colis'}}
 *           boosters={[{cle: 'aimant', icone: 'magnet', couleur: '#8E44AD', reste: 0.6}]}
 *           onPause={pause} pauseActive />
 *
 * Props de HudJeu (toutes facultatives) :
 *   score, niveau, vies + viesMax (cœurs pleins et vides), objets {n, total, icone, libelle}
 *   (compteur « 3 / 8 », se remplit en vert et pulse quand n augmente), boosters
 *   [{cle, icone (Ionicons), couleur, reste (0 à 1, part de temps restante)}],
 *   onPause (bouton rond vert, icône blanche), onQuitter (bouton rond), pauseActive.
 *
 * Exportés séparément : PastilleScore, Vies, CompteurObjets, Boosters.
 * Aucun fond noir, texte blanc sur fond coloré, tout reste lisible sur un décor chargé.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';

export function PastilleScore({score = 0, niveau}) {
  const {t} = useLanguage();
  return (
    <View style={[styles.pastille, {backgroundColor: C.marque}]}>
      {niveau != null && <Text style={styles.niveau}>{t('jeuNiveauCourt', {n: niveau})}</Text>}
      <Text style={styles.score}>{String(Math.floor(score)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}</Text>
    </View>
  );
}

export function Vies({vies = 0, viesMax = 3}) {
  return (
    <View style={[styles.pastille, styles.blanche]}>
      {Array.from({length: viesMax}).map((_, i) => (
        <Ionicons key={i} name={i < vies ? 'heart' : 'heart-outline'} size={18} color={C.danger} />
      ))}
    </View>
  );
}

export function CompteurObjets({n = 0, total = 0, icone = 'cube', libelle}) {
  const echelle = useRef(new Animated.Value(1)).current;
  const avant = useRef(n);
  useEffect(() => {
    if (n > avant.current) {
      echelle.setValue(1.3);
      Animated.spring(echelle, {toValue: 1, friction: 4, tension: 140, useNativeDriver: true}).start();
    }
    avant.current = n;
  }, [n, echelle]);
  const part = total > 0 ? Math.min(1, n / total) : 0;
  return (
    <Animated.View style={[styles.pastille, styles.blanche, styles.objets, {transform: [{scale: echelle}]}]} accessibilityLabel={libelle}>
      <View style={styles.iconeObjet}>
        <Ionicons name={icone} size={16} color={C.blanc} />
      </View>
      <View>
        <Text style={styles.compte}>
          {n} / {total}
        </Text>
        <View style={styles.rail}>
          <View style={[styles.railPlein, {width: `${part * 100}%`}]} />
        </View>
      </View>
    </Animated.View>
  );
}

export function Boosters({liste = []}) {
  if (!liste.length) return null;
  return (
    <View style={styles.boosters}>
      {liste.map(b => (
        <View key={b.cle} style={[styles.booster, {backgroundColor: b.couleur || C.marque}]}>
          <Ionicons name={b.icone || 'flash'} size={16} color={C.blanc} />
          <View style={styles.jaugeBooster}>
            <View style={[styles.jaugeBoosterPleine, {width: `${Math.max(0, Math.min(1, b.reste)) * 100}%`}]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function HudJeu({score, niveau, vies, viesMax, objets, boosters, onPause, onQuitter, pauseActive = true}) {
  const {t} = useLanguage();
  return (
    <View>
      <View style={styles.ligne}>
        {onQuitter && (
          <Pressable onPress={onQuitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
            <Ionicons name="arrow-back" size={20} color={C.texte} />
          </Pressable>
        )}
        {score != null && <PastilleScore score={score} niveau={niveau} />}
        <View style={{flex: 1}} />
        {objets && <CompteurObjets {...objets} />}
        {vies != null && <Vies vies={vies} viesMax={viesMax ?? Math.max(3, vies)} />}
        {onPause && (
          <Pressable
            onPress={onPause}
            disabled={!pauseActive}
            style={[styles.rond, styles.rondPause, !pauseActive && {opacity: 0.4}]}
            hitSlop={10}
            accessibilityLabel={t('jeuPause')}>
            <Ionicons name="pause" size={20} color={C.blanc} />
          </Pressable>
        )}
      </View>
      <Boosters liste={boosters} />
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {flexDirection: 'row', alignItems: 'center', gap: 8},
  pastille: {flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18},
  blanche: {backgroundColor: C.fond, borderWidth: 1, borderColor: C.bordure},
  niveau: {color: C.blanc, fontSize: 11, fontWeight: '800', opacity: 0.9},
  score: {color: C.blanc, fontSize: 18, fontWeight: '900'},
  objets: {paddingHorizontal: 8},
  iconeObjet: {width: 24, height: 24, borderRadius: 12, backgroundColor: C.marque, alignItems: 'center', justifyContent: 'center'},
  compte: {color: C.texte, fontSize: 14, fontWeight: '900'},
  rail: {width: 44, height: 4, borderRadius: 2, backgroundColor: C.bordure, marginTop: 2, overflow: 'hidden'},
  railPlein: {height: 4, borderRadius: 2, backgroundColor: C.marque},
  rond: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.bordure},
  rondPause: {backgroundColor: C.marque, borderColor: C.marque},
  boosters: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6},
  booster: {flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 8, borderRadius: 13},
  jaugeBooster: {width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', overflow: 'hidden'},
  jaugeBoosterPleine: {height: 5, borderRadius: 3, backgroundColor: C.blanc},
});
