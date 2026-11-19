/**
 * Petit indice animé des gestes, au début de la toute première partie d'un jeu
 * (puis mémorisé : `USER_JEU_INDICE_<JEU>` dans AsyncStorage).
 *
 *   <IndiceGestes jeu="slalom" gestes={['gauche', 'droite', 'haut', 'bas']} actif={phase === 'jeu'} />
 *   <IndiceGestes jeu="pile" gestes={['appui']} actif={phase === 'jeu'} />
 *
 * - `gestes` : 'gauche' | 'droite' | 'haut' | 'bas' | 'appui' (au moins un).
 * - `actif` : vrai pendant la partie ; l'indice s'affiche alors 4 s (flèches qui pulsent, légende
 *   « Glissez à gauche… »), puis disparaît et ne revient plus. Ne capte aucun toucher.
 * - Se place par-dessus la zone de jeu (position absolue, centré).
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';

const ICONES = {gauche: 'hand-left', droite: 'hand-right', haut: 'rocket', bas: 'body', appui: 'finger-print'};
const CHOIX = {gauche: 'jeuxGesteGauche', droite: 'jeuxGesteDroite', haut: 'jeuxGesteHaut', bas: 'jeuxGesteBas', appui: 'jeuxGesteAppui'};
const DUREE = 4000;

export default function IndiceGestes({jeu, gestes = ['appui'], actif = false}) {
  const {t} = useLanguage();
  const [visible, setVisible] = useState(false);
  const verifie = useRef(false);
  const opacite = useRef(new Animated.Value(0)).current;
  const pouls = useRef(new Animated.Value(0)).current;
  const cle = `USER_JEU_INDICE_${String(jeu).toUpperCase()}`;

  useEffect(() => {
    if (!actif || verifie.current) return undefined;
    verifie.current = true;
    let vivant = true;
    let minuteur = null;
    let boucle = null; // pulsation : arrêtée dès que l'indice disparaît (pas de boucle oubliée)
    AsyncStorage.getItem(cle)
      .then(vu => {
        if (!vivant || vu) return;
        AsyncStorage.setItem(cle, '1').catch(() => {});
        setVisible(true);
        Animated.timing(opacite, {toValue: 1, duration: 250, useNativeDriver: true}).start();
        boucle = Animated.loop(
          Animated.sequence([
            Animated.timing(pouls, {toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
            Animated.timing(pouls, {toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
          ]),
        );
        boucle.start();
        minuteur = setTimeout(() => {
          Animated.timing(opacite, {toValue: 0, duration: 300, useNativeDriver: true}).start(() => {
            boucle?.stop();
            if (vivant) setVisible(false);
          });
        }, DUREE);
      })
      .catch(() => {});
    return () => {
      vivant = false;
      clearTimeout(minuteur);
      if (boucle) {
        boucle.stop();
        setVisible(false);
      }
    };
  }, [actif, cle, opacite, pouls]);

  if (!visible) return null;
  const echelle = pouls.interpolate({inputRange: [0, 1], outputRange: [1, 1.22]});
  return (
    <Animated.View style={[styles.conteneur, {opacity: opacite}]} pointerEvents="none">
      <View style={styles.carte}>
        <View style={styles.fleches}>
          {gestes.map(g => (
            <Animated.View key={g} style={[styles.rond, {transform: [{scale: echelle}]}]}>
              <Ionicons name={ICONES[g] || ICONES.appui} size={26} color={C.blanc} />
            </Animated.View>
          ))}
        </View>
        <Text style={styles.legende}>{gestes.map(g => t(CHOIX[g] || CHOIX.appui)).join('\n')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  conteneur: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 20},
  carte: {backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1, borderColor: C.bordure},
  fleches: {flexDirection: 'row', gap: 12},
  rond: {width: 46, height: 46, borderRadius: 23, backgroundColor: C.marque, alignItems: 'center', justifyContent: 'center'},
  legende: {color: C.texte, fontSize: 14, fontWeight: '700', marginTop: 10, textAlign: 'center', lineHeight: 20},
});
