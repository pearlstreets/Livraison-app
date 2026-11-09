/**
 * Deux interrupteurs « Musique » et « Bruitages » (réglages gardés sur le
 * téléphone, voir utils/sonJeux.js). À poser dans la fenêtre de pause et sur
 * l'accueil de chaque jeu :
 *
 *   <ReglagesSon t={t} colors={colors} />
 *
 * Props : t (traduction), colors (thème), compact (une seule ligne, deux
 * boutons ronds, pour les fenêtres étroites).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '../contexts/ThemeContext';
import { chargerReglagesSon, changerReglageSon, ecouterReglagesSon, reglagesSon } from '../utils/sonJeux';

export default function ReglagesSon({ t, colors, compact = false }) {
  const [r, setR] = useState(reglagesSon());
  useEffect(() => {
    chargerReglagesSon().then(setR);
    return ecouterReglagesSon(setR);
  }, []);

  if (compact) {
    return (
      <View style={styles.compact}>
        <Rond icone={r.musique ? 'musical-notes' : 'volume-mute'} actif={r.musique} label={t('jeuxSonMusique')} colors={colors}
          onPress={() => changerReglageSon('musique', !r.musique)} />
        <Rond icone={r.bruitages ? 'volume-high' : 'volume-mute'} actif={r.bruitages} label={t('jeuxSonBruitages')} colors={colors}
          onPress={() => changerReglageSon('bruitages', !r.bruitages)} />
      </View>
    );
  }
  return (
    <View style={styles.bloc}>
      <Ligne icone="musical-notes" texte={t('jeuxSonMusique')} valeur={r.musique} colors={colors}
        onChange={(v) => changerReglageSon('musique', v)} />
      <Ligne icone="volume-high" texte={t('jeuxSonBruitages')} valeur={r.bruitages} colors={colors}
        onChange={(v) => changerReglageSon('bruitages', v)} />
    </View>
  );
}

function Ligne({ icone, texte, valeur, onChange, colors }) {
  return (
    <View style={styles.ligne}>
      <Ionicons name={icone} size={20} color={valeur ? BRAND : colors.textMuted} />
      <Text style={[styles.texte, { color: colors.text }]}>{texte}</Text>
      <Switch value={valeur} onValueChange={onChange} trackColor={{ true: BRAND, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

function Rond({ icone, actif, onPress, label, colors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={[styles.rond, { backgroundColor: actif ? BRAND : colors.card, borderColor: actif ? BRAND : colors.border }]}
    >
      <Ionicons name={icone} size={20} color={actif ? '#fff' : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bloc: { alignSelf: 'stretch', marginTop: 12, gap: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  texte: { flex: 1, fontSize: 15, fontWeight: '600' },
  compact: { flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'center' },
  rond: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
