/**
 * Écran « Jeux » (onglet Profil) : les mini-jeux du livreur pour patienter
 * entre deux courses, avec le meilleur score de chacun sur ce téléphone.
 * Chaque jeu se met en pause tout seul à l'annonce d'une nouvelle course.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import { chargerPartie, cleSauvegarde } from '../utils/jeuTri';
import { chargerRecord } from '../utils/jeuxRecords';

const LISTE = [
  { id: 'rush', route: 'JeuRush', icone: 'walk', couleur: '#FF6A13', titre: 'jeuxRushTitre', texte: 'jeuxRushTexte' },
  { id: 'toits', route: 'JeuToits', icone: 'bicycle', couleur: '#2E86DE', titre: 'jeuxToitsTitre', texte: 'jeuxToitsTexte' },
  { id: 'sommet', route: 'JeuSommet', icone: 'business', couleur: '#8E44AD', titre: 'jeuxSommetTitre', texte: 'jeuxSommetTexte' },
  { id: 'drone', route: 'JeuDrone', icone: 'airplane', couleur: '#16A085', titre: 'jeuxDroneTitre', texte: 'jeuxDroneTexte' },
  { id: 'tri', route: 'JeuTri', icone: 'cube', couleur: '#E67E22', titre: 'jeuTitre', texte: 'jeuxTriTexte' },
];

export default function JeuxScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const s = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [records, setRecords] = useState({});

  useFocusEffect(useCallback(() => {
    let vivant = true;
    (async () => {
      const r = {};
      const tri = await chargerPartie(cleSauvegarde(user?.id)).catch(() => null);
      r.tri = Number(tri?.meilleurScore) || 0;
      for (const j of LISTE) {
        if (j.id === 'tri') continue;
        r[j.id] = (await chargerRecord(j.id, user?.id)).meilleur;
      }
      if (vivant) setRecords(r);
    })();
    return () => { vivant = false; };
  }, [user?.id]));

  return (
    <View style={[s.ecran, { paddingTop: insets.top + 8 }]}>
      <View style={s.entete}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel={t('jeuFermer')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={s.titre}>{t('jeuxTitre')}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={s.intro}>{t('jeuxIntro')}</Text>
        {LISTE.map((j) => (
          <Pressable
            key={j.id}
            onPress={() => navigation.navigate(j.route)}
            style={({ pressed }) => [s.carte, pressed && { opacity: 0.85 }]}
            accessibilityLabel={t(j.titre)}
          >
            <View style={[s.pastille, { backgroundColor: j.couleur }]}>
              <Ionicons name={j.icone} size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.nom}>{t(j.titre)}</Text>
              <Text style={s.texte}>{t(j.texte)}</Text>
              {records[j.id] > 0 && (
                <Text style={s.record}>{t('jeuxRecord', { n: records[j.id] })}</Text>
              )}
            </View>
            <Ionicons name="play-circle" size={34} color={BRAND} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c, dark) {
  return StyleSheet.create({
    ecran: { flex: 1, backgroundColor: c.bg },
    entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
    titre: { fontSize: 20, fontWeight: '800', color: c.text },
    intro: { color: c.textMuted, fontSize: 14, marginBottom: 14 },
    carte: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: dark ? c.card : '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: dark ? c.border : '#E6E8EC' },
    pastille: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    nom: { fontSize: 16, fontWeight: '800', color: c.text },
    texte: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    record: { fontSize: 12, fontWeight: '700', color: BRAND, marginTop: 4 },
  });
}
