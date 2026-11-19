/**
 * Récompenses visibles des mini-jeux (Slalom, Pile, Tournée).
 *
 * - CouchePopups (ref) : petits « +N » qui montent et s'effacent là où l'on
 *   ramasse ou pose quelque chose. `ref.current.ajouter({x, y, texte, couleur, icone, grand})`.
 *   6 au plus en même temps, animation native (aucun rendu React par image).
 * - BanniereRecompense (ref) : pastille centrée sous la rangée d'infos du haut de
 *   la zone de jeu (série, combo, palier, nouveau record, booster), 1,5 s. Elle ne
 *   recouvre jamais le score, le bandeau du classement ni les pastilles du haut.
 *   `ref.current.annoncer({texte, icone, couleur})`.
 * - RecapRecompenses : bas de la fenêtre de fin, étoiles qui apparaissent une
 *   à une, « Nouveau record ! », points gagnés et points du classement du mois.
 *
 * Fond coloré = texte blanc, jamais de fond noir. Rien ne capte le toucher.
 */
import React, {forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';
import {formaterNombre} from './BandeauClassement';

export const OR_FONCE = '#D99A00'; // or lisible avec un texte blanc
const MAX_POPUPS = 6;

const Popup = memo(function Popup({p, onFin}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(a, {toValue: 1, duration: p.grand ? 1100 : 850, easing: Easing.out(Easing.cubic), useNativeDriver: true});
    anim.start(() => onFin(p.n));
    return () => anim.stop();
  }, [a, onFin, p.grand, p.n]);
  return (
    <Animated.View
      style={[
        styles.popupZone,
        {
          left: p.x - 70,
          top: p.y - 18,
          opacity: a.interpolate({inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0]}),
          transform: [
            {translateY: a.interpolate({inputRange: [0, 1], outputRange: [0, p.grand ? -70 : -52]})},
            {scale: a.interpolate({inputRange: [0, 0.15, 0.3, 1], outputRange: [0.5, 1.2, 1, 1]})},
          ],
        },
      ]}>
      <View style={[styles.popup, {backgroundColor: p.couleur || C.marque}, p.grand && styles.popupGrand]}>
        {p.icone ? <Ionicons name={p.icone} size={p.grand ? 18 : 14} color={C.blanc} /> : null}
        <Text style={[styles.popupTexte, p.grand && styles.popupTexteGrand]} numberOfLines={1}>
          {p.texte}
        </Text>
      </View>
    </Animated.View>
  );
});

export const CouchePopups = memo(
  forwardRef(function CouchePopups(_props, ref) {
    const [liste, setListe] = useState([]);
    const compteur = useRef(0);
    const monte = useRef(true);
    useEffect(
      () => () => {
        monte.current = false;
      },
      [],
    );
    useImperativeHandle(
      ref,
      () => ({
        ajouter: ({x = 0, y = 0, texte, couleur, icone, grand = false}) => {
          if (!monte.current || texte == null) return;
          compteur.current += 1;
          const n = compteur.current;
          setListe(l => [...l.slice(-(MAX_POPUPS - 1)), {n, x, y, texte: String(texte), couleur, icone, grand}]);
        },
        vider: () => monte.current && setListe([]),
      }),
      [],
    );
    const retirer = useCallback(n => {
      if (monte.current) setListe(l => l.filter(p => p.n !== n));
    }, []);
    if (!liste.length) return null;
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {liste.map(p => (
          <Popup key={p.n} p={p} onFin={retirer} />
        ))}
      </View>
    );
  }),
);

export const BanniereRecompense = memo(
  forwardRef(function BanniereRecompense({style}, ref) {
    const [msg, setMsg] = useState(null);
    const a = useRef(new Animated.Value(0)).current;
    const minuteur = useRef(null);
    const monte = useRef(true);
    useEffect(
      () => () => {
        monte.current = false;
        clearTimeout(minuteur.current);
      },
      [],
    );
    useImperativeHandle(
      ref,
      () => ({
        annoncer: ({texte, icone = 'sparkles', couleur = C.marque, duree = 1500}) => {
          if (!monte.current || !texte) return;
          clearTimeout(minuteur.current);
          setMsg({texte: String(texte), icone, couleur, n: Date.now()});
          a.stopAnimation();
          a.setValue(0);
          Animated.spring(a, {toValue: 1, friction: 5, tension: 140, useNativeDriver: true}).start();
          minuteur.current = setTimeout(() => {
            Animated.timing(a, {toValue: 0, duration: 220, useNativeDriver: true}).start(({finished}) => {
              if (finished && monte.current) setMsg(null);
            });
          }, duree);
        },
        effacer: () => {
          clearTimeout(minuteur.current);
          a.stopAnimation();
          if (monte.current) setMsg(null);
        },
      }),
      [a],
    );
    if (!msg) return null;
    return (
      <View pointerEvents="none" style={[styles.banniereZone, style]}>
        <Animated.View
          style={[
            styles.banniere,
            {
              backgroundColor: msg.couleur,
              opacity: a,
              transform: [{scale: a.interpolate({inputRange: [0, 1], outputRange: [0.6, 1]})}],
            },
          ]}>
          <View style={styles.banniereIcone}>
            <Ionicons name={msg.icone} size={16} color={C.blanc} />
          </View>
          <Text style={styles.banniereTexte} numberOfLines={2}>
            {msg.texte}
          </Text>
        </Animated.View>
      </View>
    );
  }),
);

/** Trois étoiles qui apparaissent l'une après l'autre. */
function EtoilesAnimees({n, taille = 34}) {
  const {t} = useLanguage();
  const valeurs = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    valeurs.forEach(v => v.setValue(0));
    const anim = Animated.stagger(
      180,
      valeurs.map(v => Animated.spring(v, {toValue: 1, friction: 4, tension: 160, useNativeDriver: true})),
    );
    anim.start();
    return () => anim.stop();
  }, [n, valeurs]);
  return (
    <View style={styles.etoiles} accessible accessibilityLabel={t('jeuRecompEtoiles', {n})}>
      {valeurs.map((v, k) => (
        <Animated.View key={k} style={{opacity: v, transform: [{scale: v.interpolate({inputRange: [0, 1], outputRange: [0.3, 1]})}]}}>
          <Ionicons
            name={k < n ? 'star' : 'star-outline'}
            size={k === 1 ? taille + 8 : taille}
            color={k < n ? C.or : C.bordureForte}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Récap de fin : étoiles (0 à 3, null = sans étoiles), nouveau record, points
 * gagnés, classement du mois (gainMois > 0 : points ajoutés ; sinon meilleur
 * score du mois ; connecte faux : invitation à se connecter).
 */
export function RecapRecompenses({etoiles = null, record = false, points = 0, gainMois = null, meilleurMois = null, connecte = true}) {
  const {t} = useLanguage();
  return (
    <View style={styles.recap}>
      {etoiles != null && <EtoilesAnimees n={Math.max(0, Math.min(3, etoiles))} />}
      <View style={styles.pastilles}>
        {record && (
          <View style={[styles.pastille, {backgroundColor: OR_FONCE}]}>
            <Ionicons name="trophy" size={15} color={C.blanc} />
            <Text style={styles.pastilleTexte}>{t('jeuxBandeauNouveauRecord')}</Text>
          </View>
        )}
        {points > 0 && (
          <View style={[styles.pastille, {backgroundColor: C.marque}]}>
            <Ionicons name="add-circle" size={15} color={C.blanc} />
            <Text style={styles.pastilleTexte}>{t('jeuRecompPoints', {n: formaterNombre(points)})}</Text>
          </View>
        )}
      </View>
      {connecte && gainMois > 0 && (
        <View style={styles.mois}>
          <Ionicons name="calendar" size={15} color={C.marque} />
          <Text style={styles.moisTexte}>{t('jeuRecompGainMois', {n: formaterNombre(gainMois)})}</Text>
        </View>
      )}
      {connecte && !(gainMois > 0) && meilleurMois > 0 && (
        <Text style={styles.discret}>{t('jeuRecompMeilleurMois', {n: formaterNombre(meilleurMois)})}</Text>
      )}
      {!connecte && <Text style={styles.discret}>{t('jeuRecompConnecterMois')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  popupZone: {position: 'absolute', width: 140, alignItems: 'center'},
  popup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.blanc,
  },
  popupGrand: {paddingHorizontal: 14, paddingVertical: 5, borderRadius: 18},
  popupTexte: {color: C.blanc, fontSize: 16, fontWeight: '900'},
  popupTexteGrand: {fontSize: 22},
  // Sous la rangée de pastilles du haut de la scène (étage, colis, bonus en cours).
  banniereZone: {position: 'absolute', top: 84, left: 24, right: 24, alignItems: 'center'},
  banniere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingLeft: 6,
    paddingRight: 16,
    paddingVertical: 6,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: C.blanc,
    shadowColor: '#30334F',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 5,
  },
  banniereIcone: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  banniereTexte: {flexShrink: 1, color: C.blanc, fontSize: 16, fontWeight: '900', textAlign: 'center'},
  recap: {alignSelf: 'stretch', alignItems: 'center', marginTop: 8},
  etoiles: {flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4},
  pastilles: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 6},
  pastille: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14},
  pastilleTexte: {color: C.blanc, fontSize: 14, fontWeight: '800'},
  mois: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: C.fond,
    borderWidth: 1,
    borderColor: C.marque,
  },
  moisTexte: {color: C.texte, fontSize: 13, fontWeight: '800'},
  discret: {color: C.texteDiscret, fontSize: 12, marginTop: 6, textAlign: 'center'},
});
