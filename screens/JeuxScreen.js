/**
 * Écran « Jeux » (onglet Profil) : les mini-jeux du livreur pour patienter
 * entre deux courses, avec le meilleur score de chacun sur ce téléphone.
 * Chaque jeu se met en pause tout seul à l'annonce d'une nouvelle course.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import { chargerRecord } from '../utils/jeuxRecords';
import { chargerReglagesSon, changerReglageSon, reglagesSon } from '../utils/sonJeux';

const LISTE = [
  { id: 'rush', image: require('../assets/images/jeux/rush.webp'), route: 'JeuRush', icone: 'walk', couleur: '#FF6A13', titre: 'jeuxRushTitre', texte: 'jeuxRushTexte' },
  { id: 'toits', image: require('../assets/images/jeux/toits.webp'), route: 'JeuToits', icone: 'bicycle', couleur: '#2E86DE', titre: 'jeuxToitsTitre', texte: 'jeuxToitsTexte' },
  { id: 'sommet', image: require('../assets/images/jeux/sommet.webp'), route: 'JeuSommet', icone: 'business', couleur: '#8E44AD', titre: 'jeuxSommetTitre', texte: 'jeuxSommetTexte' },
  { id: 'drone', image: require('../assets/images/jeux/drone.webp'), route: 'JeuDrone', icone: 'airplane', couleur: '#16A085', titre: 'jeuxDroneTitre', texte: 'jeuxDroneTexte' },
  { id: 'coupe', image: require('../assets/images/jeux/coupe.webp'), route: 'JeuCoupe', icone: 'nutrition', couleur: '#E74C3C', titre: 'jeuxCoupeTitre', texte: 'jeuxCoupeTexte' },
  { id: 'memoire', image: require('../assets/images/jeux/memoire.webp'), route: 'JeuMemoire', icone: 'albums', couleur: '#F2B705', titre: 'jeuxMemoireTitre', texte: 'jeuxMemoireTexte' },
  { id: 'basket', image: require('../assets/images/jeux/basket.webp'), route: 'JeuBasket', icone: 'basketball', couleur: '#E67E22', titre: 'jeuxBasketTitre', texte: 'jeuxBasketTexte' },
];

export default function JeuxScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const s = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [records, setRecords] = useState({});
  const [son, setSon] = useState(reglagesSon());

  useEffect(() => { chargerReglagesSon().then((r) => setSon(r)); }, []);
  const basculer = useCallback((cle, v) => {
    changerReglageSon(cle, v);
    setSon(reglagesSon());
  }, []);

  useFocusEffect(useCallback(() => {
    let vivant = true;
    (async () => {
      const r = {};
      for (const j of LISTE) {
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
              <Image source={j.image} style={s.illustration} resizeMode="cover" />
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

        {/* Réglages du son de tous les jeux */}
        <Text style={s.titreSection}>{t('jeuxSon')}</Text>
        <View style={s.reglages}>
          <View style={s.ligneReglage}>
            <Ionicons name="musical-notes" size={20} color={BRAND} />
            <Text style={s.libelle}>{t('jeuxSonMusique')}</Text>
            <Switch value={son.musique} onValueChange={(v) => basculer('musique', v)} trackColor={{ true: BRAND }} accessibilityLabel={t('jeuxSonMusique')} />
          </View>
          <View style={[s.ligneReglage, s.separateur]}>
            <Ionicons name="volume-high" size={20} color={BRAND} />
            <Text style={s.libelle}>{t('jeuxSonBruitages')}</Text>
            <Switch value={son.bruitages} onValueChange={(v) => basculer('bruitages', v)} trackColor={{ true: BRAND }} accessibilityLabel={t('jeuxSonBruitages')} />
          </View>
        </View>
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
    pastille: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    illustration: { width: '100%', height: '100%' },
    nom: { fontSize: 16, fontWeight: '800', color: c.text },
    texte: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    record: { fontSize: 12, fontWeight: '700', color: BRAND, marginTop: 4 },
    titreSection: { fontSize: 16, fontWeight: '800', color: c.text, marginTop: 10, marginBottom: 8 },
    reglages: { backgroundColor: dark ? c.card : '#fff', borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: dark ? c.border : '#E6E8EC' },
    ligneReglage: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    separateur: { borderTopWidth: 1, borderTopColor: dark ? c.border : '#E6E8EC' },
    libelle: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
  });
}
