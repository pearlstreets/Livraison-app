/**
 * Écran « Mini-jeux » (onglet Profil) : les mini-jeux du livreur pour patienter
 * entre deux courses, avec le meilleur score de chacun sur ce téléphone.
 * Compte de démonstration (utils/simulation.js) : en tête, « Simuler une
 * course » ouvre l'accueil avec une course d'essai.
 * Chaque jeu se met en pause tout seul à l'annonce d'une nouvelle course.
 * Classement du mois (14/11/2026) : un bouton ouvre le classement tous jeux
 * (GET driver/jeux/classement-mois/, relu à chaque retour, erreurs
 * silencieuses) et chaque jeu montre la place du mois et ses points.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Image, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import { chargerRecord } from '../utils/jeuxRecords';
import { deliveryService } from '../services/deliveryService';
import { formaterNombre } from '../components/BandeauClassement';
import { peutSimuler } from '../utils/simulation';
import { chargerReglagesSon, changerReglageSon, reglagesSon } from '../utils/sonJeux';

const OR = '#F2B705';
const MEDAILLES = { 1: '#F2B705', 2: '#A7B1BC', 3: '#CD7F32' };

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
  const [mois, setMois] = useState({ charge: true, erreur: false, donnees: null });
  const [details, setDetails] = useState(false);

  useEffect(() => { chargerReglagesSon().then((r) => setSon(r)); }, []);
  const basculer = useCallback((cle, v) => {
    changerReglageSon(cle, v);
    setSon(reglagesSon());
  }, []);

  const chargerMois = useCallback((vivant = () => true) => {
    setMois((m) => ({ ...m, charge: true, erreur: false }));
    deliveryService.getClassementMoisJeux()
      .then((d) => { if (vivant()) setMois({ charge: false, erreur: false, donnees: d && typeof d === 'object' ? d : null }); })
      .catch(() => { if (vivant()) setMois((m) => ({ ...m, charge: false, erreur: true })); });
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
    chargerMois(() => vivant);
    return () => { vivant = false; };
  }, [user?.id, chargerMois]));

  const moi = mois.donnees?.moi && typeof mois.donnees.moi === 'object' ? mois.donnees.moi : null;
  const moisParJeu = moi?.jeux && typeof moi.jeux === 'object' ? moi.jeux : {};
  const liste = Array.isArray(mois.donnees?.classement) ? mois.donnees.classement : [];

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
        {peutSimuler(user) && (
          <Pressable
            onPress={() => navigation.navigate('Accueil', { screen: 'OrdersMain', params: { simulerCourse: Date.now() }, pop: true })}
            style={({ pressed }) => [s.carte, pressed && { opacity: 0.85 }]}
            accessibilityLabel={t('jeuxSimulerTitre')}
          >
            <View style={[s.pastille, { backgroundColor: BRAND }]}>
              <Ionicons name="flask-outline" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.nom}>{t('jeuxSimulerTitre')}</Text>
              <Text style={s.texte}>{t('jeuxSimulerTexte')}</Text>
            </View>
            <Ionicons name="play-circle" size={34} color={BRAND} />
          </Pressable>
        )}
        <Pressable
          onPress={() => setDetails(true)}
          style={({ pressed }) => [s.carte, pressed && { opacity: 0.85 }]}
          accessibilityLabel={t('moisTitre')}
        >
          <View style={[s.pastille, { backgroundColor: OR }]}>
            <Ionicons name="trophy" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nom}>{t('moisTitre')}</Text>
            <Text style={s.texte}>
              {moi ? t('moisMaPlace', { rang: moi.rang, points: formaterNombre(moi.points) }) : t('moisPasClasse')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
        </Pressable>
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
              {moisParJeu[j.id]?.rang > 0 && (
                <Text style={s.mois}>
                  {t('moisCarte', { rang: moisParJeu[j.id].rang, points: formaterNombre(moisParJeu[j.id].points) })}
                </Text>
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

      <Modal visible={details} transparent animationType="fade" onRequestClose={() => setDetails(false)}>
        <View style={s.voile}>
          <View style={[s.fenetre, { marginBottom: insets.bottom + 16 }]}>
            <View style={s.enteteFenetre}>
              <Ionicons name="trophy" size={22} color={OR} />
              <Text style={[s.titre, { flex: 1, marginLeft: 8 }]}>{t('moisTitre')}</Text>
              <Pressable onPress={() => setDetails(false)} hitSlop={10} accessibilityLabel={t('jeuFermer')}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
            <Text style={s.regle}>{t('moisRegle')}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {mois.charge && !mois.donnees ? (
                <ActivityIndicator color={BRAND} style={{ marginVertical: 24 }} />
              ) : mois.erreur && !mois.donnees ? (
                <View style={{ alignItems: 'center', marginVertical: 16 }}>
                  <Text style={s.texte}>{t('moisHorsLigne')}</Text>
                  <Pressable onPress={() => chargerMois()} hitSlop={8} style={s.boutonReessayer}>
                    <Text style={s.boutonReessayerTexte}>{t('moisReessayer')}</Text>
                  </Pressable>
                </View>
              ) : liste.length === 0 ? (
                <Text style={[s.texte, { textAlign: 'center', marginVertical: 20 }]}>{t('moisVide')}</Text>
              ) : (
                liste.map((l) => (
                  <View key={l.rang} style={[s.ligne, l.moi && s.ligneMoi]}>
                    <View style={[s.rang, MEDAILLES[l.rang] && { backgroundColor: MEDAILLES[l.rang] }]}>
                      <Text style={[s.rangTexte, MEDAILLES[l.rang] && { color: '#fff' }]}>{l.rang}</Text>
                    </View>
                    <Text style={[s.nomLigne, l.moi && { fontWeight: '800' }]} numberOfLines={1}>
                      {l.moi ? `${l.nom} (${t('moisVous')})` : l.nom}
                    </Text>
                    <Text style={s.pointsLigne}>{t('moisPoints', { n: formaterNombre(l.points) })}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            {moi && moi.rang > liste.length && (
              <View style={[s.ligne, s.ligneMoi, { marginTop: 8 }]}>
                <View style={s.rang}><Text style={s.rangTexte}>{moi.rang}</Text></View>
                <Text style={[s.nomLigne, { fontWeight: '800' }]}>{t('moisVous')}</Text>
                <Text style={s.pointsLigne}>{t('moisPoints', { n: formaterNombre(moi.points) })}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
    mois: { fontSize: 12, fontWeight: '700', color: dark ? OR : '#B7860B', marginTop: 2 },
    voile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', paddingHorizontal: 12 },
    fenetre: { backgroundColor: dark ? c.card : '#fff', borderRadius: 20, padding: 16 },
    enteteFenetre: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    regle: { fontSize: 13, color: c.textMuted, marginBottom: 12, lineHeight: 18 },
    ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12 },
    ligneMoi: { backgroundColor: dark ? 'rgba(242,183,5,0.15)' : '#FFF7DB' },
    rang: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? c.border : '#EEF0F3' },
    rangTexte: { fontSize: 13, fontWeight: '800', color: c.text },
    nomLigne: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
    pointsLigne: { fontSize: 14, fontWeight: '800', color: c.text },
    boutonReessayer: { marginTop: 10, backgroundColor: BRAND, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16 },
    boutonReessayerTexte: { color: '#fff', fontWeight: '800' },
    titreSection: { fontSize: 16, fontWeight: '800', color: c.text, marginTop: 10, marginBottom: 8 },
    reglages: { backgroundColor: dark ? c.card : '#fff', borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: dark ? c.border : '#E6E8EC' },
    ligneReglage: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    separateur: { borderTopWidth: 1, borderTopColor: dark ? c.border : '#E6E8EC' },
    libelle: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
  });
}
