/**
 * Fenêtre « Recommencer », « Reprendre la partie » ou « Retour » (niveau et score affichés).
 *
 *   <FenetreReprise proposition={proposition} onReprendre={reprendre} onRecommencer={recommencer} />
 *
 * `onRetour` (facultatif) : par défaut, retour à l'écran précédent.
 *
 * `proposition` : {niveau, score} (null : fenêtre fermée). Voir utils/jeux/sauvegardePartie.js.
 * Se pose sur tout l'écran du jeu (voile, carte blanche, bouton vert texte blanc).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {useNavigation} from '@react-navigation/native';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';

export default function FenetreReprise({proposition, onReprendre, onRecommencer, onRetour}) {
  const {t} = useLanguage();
  const navigation = useNavigation();
  // Retour : quitte le jeu (la partie reste proposée à la prochaine visite).
  const retour = () => {
    if (onRetour) onRetour();
    else if (navigation.canGoBack()) navigation.goBack();
  };
  if (!proposition) return null;
  return (
    <View style={styles.voile}>
      <View style={styles.carte}>
        <Ionicons name="play-circle" size={46} color={C.marque} />
        <Text style={styles.titre}>{t('jeuxRepriseTitre')}</Text>
        <Text style={styles.texte}>
          {t('jeuxRepriseTexteNiveau', {n: proposition.niveau, s: proposition.score})}
        </Text>
        <Pressable onPress={onRecommencer} style={({pressed}) => [styles.bouton, styles.secondaire, styles.premier, pressed && {opacity: 0.8}]}>
          <Text style={[styles.boutonTexte, {color: C.texte}]}>{t('jeuxRepriseRecommencer')}</Text>
        </Pressable>
        <Pressable onPress={onReprendre} style={({pressed}) => [styles.bouton, pressed && {opacity: 0.8}]}>
          <Text style={styles.boutonTexte}>{t('jeuxRepriseReprendre')}</Text>
        </Pressable>
        <Pressable onPress={retour} style={({pressed}) => [styles.bouton, styles.secondaire, pressed && {opacity: 0.8}]}>
          <Text style={[styles.boutonTexte, {color: C.texte}]}>{t('jeuQuitter')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: {...StyleSheet.absoluteFillObject, backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50},
  carte: {width: '100%', maxWidth: 380, backgroundColor: C.fond, borderRadius: 20, padding: 22, alignItems: 'center'},
  titre: {color: C.texte, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center'},
  texte: {color: C.texteDoux, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21},
  bouton: {alignSelf: 'stretch', marginTop: 14, backgroundColor: C.marque, borderRadius: 14, paddingVertical: 14, alignItems: 'center'},
  secondaire: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.bordureForte, marginTop: 10},
  premier: {marginTop: 14},
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
});
