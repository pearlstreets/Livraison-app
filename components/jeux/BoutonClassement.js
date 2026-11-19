/**
 * Bouton « Classement » posé tout en haut des fenêtres de jeu (accueil, pause, fin)
 * et de l'écran Mini-jeux : fond blanc, texte foncé, coupe orange, et la place du
 * joueur visible sans ouvrir le détail (« Vous êtes 3e · 2 706 points »), et le
 * premier du classement quand il est connu (« TOP 1 : Karim B. · 5 200 »).
 *
 *   Dans un jeu : <BoutonClassement onPress={ouvrir} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
 *   (« Vous êtes 3e · record 2 706 », le score du jeu).
 *   Écran Mini-jeux : <BoutonClassement rang={moi.rang} points={moi.points} />
 *   (« Vous êtes 1er · 300 points », les points du classement du mois).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {COULEURS_JEUX as C, entierJeu} from '../../utils/jeux/commun';
import {formaterNombre} from './BandeauClassement';

const ORANGE = '#F28C28';
const OR = '#D99A00';

export default function BoutonClassement({onPress, titre, rang, points, record, top1, style}) {
  const {t} = useLanguage();
  const n = entierJeu(rang);
  const texteRang = n === 1 ? t('jeuxRang1') : t('jeuxRang', {n});
  // Score d'un jeu = « record », points du classement du mois = « points » :
  // jamais le même mot pour deux choses différentes.
  const place = n <= 0
    ? t('jeuxBandeauPasClasse')
    : record !== undefined
      ? t('jeuxMaPlaceRecord', {rang: texteRang, score: formaterNombre(record)})
      : t('jeuxMaPlace', {rang: texteRang, points: formaterNombre(points)});
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.bouton, pressed && {opacity: 0.85}, style]}
      accessibilityRole="button">
      <View style={styles.coupe}>
        <Ionicons name="trophy" size={22} color={ORANGE} />
      </View>
      <View style={styles.textes}>
        <Text style={styles.titre} numberOfLines={1}>
          {titre || t('jeuClassement')}
        </Text>
        <Text style={[styles.place, n > 0 && styles.placeClasse]} numberOfLines={1}>
          {place}
        </Text>
        {top1 && entierJeu(top1.score) > 0 && (
          <View style={styles.premier}>
            <Ionicons name="trophy" size={12} color={OR} />
            <Text style={styles.premierTexte} numberOfLines={1}>
              {t('jeuxBandeauTop', {nom: top1.nom || t('jeuVous'), n: formaterNombre(top1.score)})}
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.texte} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bouton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.bordure,
  },
  coupe: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF1E3',
  },
  textes: {flex: 1},
  titre: {color: C.texte, fontSize: 16, fontWeight: '800'},
  place: {color: C.texteDoux, fontSize: 13, fontWeight: '600', marginTop: 2},
  placeClasse: {color: ORANGE, fontWeight: '800'},
  premier: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%',
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: '#FFF6D6', borderWidth: 1, borderColor: OR,
  },
  premierTexte: {flexShrink: 1, color: C.texte, fontSize: 12, fontWeight: '800'},
});
