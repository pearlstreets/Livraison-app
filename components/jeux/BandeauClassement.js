/**
 * Bandeau haut toujours visible pendant la partie : rang et record du joueur à
 * gauche, premier du classement à droite.
 *
 *   const bandeau = useBandeauClassement('pile', {score, meilleurLocal, enPartie});
 *   <BandeauClassement bandeau={bandeau} />
 *
 * « Vous : 12e · record 1 840 » (ou « Pas encore classé ») et « TOP 1 : Karim B. · 5 200 ».
 * Quand le score dépasse le record ou le premier, la pastille de gauche devient
 * « Nouveau record ! » ou « Vous êtes TOP 1 » pendant 3 s. Une ligne de 30 px de haut,
 * ne capte aucun toucher (pointerEvents none), à poser au-dessus de la zone de jeu.
 * Voir utils/jeux/useBandeauClassement.js pour les données.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';

/** 1840 devient « 1 840 » (espace fine insécable). */
const ROUGE = '#DC2626';

export function formaterNombre(n) {
  return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function BandeauClassement({bandeau, style}) {
  const {t} = useLanguage();
  const pulse = useRef(new Animated.Value(1)).current;
  const annonce = bandeau?.annonce || null;
  useEffect(() => {
    if (!annonce) return;
    pulse.setValue(0.8);
    Animated.spring(pulse, {toValue: 1, friction: 4, tension: 120, useNativeDriver: true}).start();
  }, [annonce, pulse]);
  if (!bandeau) return null;

  const {rang, record, top1, classe, horsLigne} = bandeau;
  const texteRang = rang == null ? null : rang === 1 ? t('jeuxRang1') : t('jeuxRang', {n: rang});
  const gauche = classe && texteRang
    ? t('jeuxBandeauVous', {rang: texteRang, n: formaterNombre(record)})
    : record > 0
      ? t('jeuxBandeauVousSansRang', {n: formaterNombre(record)})
      : t('jeuxBandeauPasClasse');

  return (
    <View style={[styles.ligne, style]} pointerEvents="none">
      {horsLigne ? (
        // Livreur : envoi ou lecture sans réseau, bandeau rouge 3 s, le score reste gardé.
        <View style={[styles.pastille, styles.horsLigne]}>
          <Ionicons name="cloud-offline" size={13} color={C.blanc} />
          <Text style={[styles.texte, {color: C.blanc}]} numberOfLines={1}>
            {t('jeuxBandeauHorsLigne')}
          </Text>
        </View>
      ) : (
      <Animated.View
        style={[styles.pastille, annonce ? styles.annonce : styles.vous, {transform: [{scale: pulse}]}]}>
        {annonce ? <Ionicons name="sparkles" size={13} color={C.blanc} /> : null}
        <Text style={[styles.texte, annonce && {color: C.blanc}]} numberOfLines={1}>
          {annonce === 'top1' ? t('jeuxBandeauTop1Vous') : annonce === 'record' ? t('jeuxBandeauNouveauRecord') : gauche}
        </Text>
      </Animated.View>
      )}
      {top1 && !horsLigne && (
        <View style={[styles.pastille, styles.top1]}>
          <Ionicons name="trophy" size={13} color={C.or} />
          <Text style={styles.texte} numberOfLines={1}>
            {t('jeuxBandeauTop', {nom: top1.nom || t('jeuVous'), n: formaterNombre(top1.score)})}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, height: 30},
  pastille: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  vous: {backgroundColor: C.marqueClair, borderColor: C.marque},
  annonce: {backgroundColor: C.marque, borderColor: C.marque},
  horsLigne: {backgroundColor: ROUGE, borderColor: ROUGE},
  // Le premier reste toujours lisible : c'est la pastille « Vous » qui se resserre.
  top1: {backgroundColor: '#FFF6D6', borderColor: C.or, marginLeft: 'auto', flexShrink: 0, maxWidth: '60%'},
  texte: {flexShrink: 1, color: C.texte, fontSize: 11, fontWeight: '800'},
});
