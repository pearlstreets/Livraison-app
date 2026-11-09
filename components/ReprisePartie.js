/**
 * Fenêtre « Reprendre la partie » / « Recommencer » (voile plein écran).
 *
 *   {reprise && (
 *     <ReprisePartie
 *       t={t} colors={colors}
 *       niveau={reprise.niveau} score={reprise.score}
 *       onReprendre={...} onRecommencer={...}
 *     />
 *   )}
 *
 * Le jeu charge la sauvegarde avec chargerPartie (utils/partieSauvegardee.js)
 * à l'ouverture ; `onRecommencer` doit appeler effacerPartie. Fond de la
 * fenêtre : colors.card (jamais noir), bouton principal BRAND, texte blanc.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '../contexts/ThemeContext';

export default function ReprisePartie({ t, colors, niveau, score, onReprendre, onRecommencer }) {
  return (
    <View style={[styles.voile, { backgroundColor: colors.overlay }]}>
      <View style={[styles.carte, { backgroundColor: colors.card }]}>
        <View style={styles.rond}>
          <Ionicons name="play" size={30} color="#fff" />
        </View>
        <Text style={[styles.titre, { color: colors.text }]}>{t('jeuxRepriseTitre')}</Text>
        <Text style={[styles.texte, { color: colors.textSoft }]}>
          {niveau != null ? t('jeuxRepriseTexteNiveau', { n: niveau, s: score ?? 0 }) : t('jeuxRepriseTexte', { s: score ?? 0 })}
        </Text>
        <Pressable onPress={onReprendre} style={({ pressed }) => [styles.bouton, pressed && { opacity: 0.8 }]}>
          <Text style={styles.boutonTexte}>{t('jeuxRepriseReprendre')}</Text>
        </Pressable>
        <Pressable
          onPress={onRecommencer}
          style={({ pressed }) => [styles.bouton, styles.secondaire, { borderColor: colors.border }, pressed && { opacity: 0.8 }]}
        >
          <Text style={[styles.boutonTexte, { color: colors.text }]}>{t('jeuxRepriseRecommencer')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 },
  carte: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 22, alignItems: 'center' },
  rond: { width: 62, height: 62, borderRadius: 31, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  titre: { fontSize: 21, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  texte: { fontSize: 15, marginTop: 8, marginBottom: 6, textAlign: 'center', lineHeight: 21 },
  bouton: { alignSelf: 'stretch', marginTop: 10, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  secondaire: { backgroundColor: 'transparent', borderWidth: 1.5 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
