import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { lirePreferences, modifierPreference, normaliserPreferences, sonCourseActif } from '../services/preferencesNotifications';

const BRAND = '#FF6A13';

// Réglages des notifications, comme Uber Eats : en ligne, les nouvelles
// courses arrivent toujours (seul leur son se coupe) ; hors ligne, chaque
// type d'alerte se règle. Compte, paiements et support sont toujours reçus.
const EN_LIGNE = [
  { cle: 'son_course', libelle: 'notifSonCourse' },
  { cle: 'messages_clients', libelle: 'notifMessagesClients' },
];
const HORS_LIGNE = [
  { cle: 'forte_demande', libelle: 'notifForteDemande' },
  { cle: 'bonus_promos', libelle: 'notifBonusPromos' },
  { cle: 'recap_gains', libelle: 'notifRecapGains' },
];

export default function NotificationsReglagesScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  const [prefs, setPrefs] = useState(() => normaliserPreferences({}));
  const monte = useRef(true);

  useEffect(() => {
    monte.current = true;
    // Valeur du téléphone d'abord, puis celle du serveur.
    sonCourseActif().then((son) => {
      if (monte.current) setPrefs((p) => ({ ...p, son_course: son }));
    }).catch(() => {});
    lirePreferences().then((p) => {
      if (monte.current) setPrefs(p);
    }).catch(() => {
      // Hors réseau : valeurs par défaut affichées, enregistrées à la bascule.
    });
    return () => { monte.current = false; };
  }, []);

  async function basculer(cle, valeur) {
    const avant = prefs[cle];
    setPrefs((p) => ({ ...p, [cle]: valeur }));
    try {
      const p = await modifierPreference(cle, valeur);
      if (monte.current) setPrefs(p);
    } catch (e) {
      if (monte.current) setPrefs((p) => ({ ...p, [cle]: avant }));
      Alert.alert(t('error'), e?.serverMessage || (e?.isNetworkError ? t('errorNetwork') : t('notifEnregistrementEchec')));
    }
  }

  const ligneInterrupteur = ({ cle, libelle }, derniere) => (
    <View key={cle} style={[s.ligne, !derniere && s.ligneBord]}>
      <Text style={s.libelle}>{t(libelle)}</Text>
      <Switch
        value={!!prefs[cle]}
        onValueChange={(v) => basculer(cle, v)}
        trackColor={{ false: dark ? colors.borderStrong : '#d1d1d6', true: BRAND }}
        thumbColor="#fff"
        ios_backgroundColor={dark ? colors.borderStrong : '#d1d1d6'}
        accessibilityLabel={t(libelle)}
      />
    </View>
  );

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{t('notifReglagesTitre')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.sectionTitre}>{t('notifSectionEnLigne')}</Text>
      <View style={s.carte}>
        <View style={[s.ligne, s.ligneBord]}>
          <Text style={s.libelle}>{t('notifNouvellesCourses')}</Text>
          <Text style={s.toujours}>{t('notifToujours')}</Text>
        </View>
        {EN_LIGNE.map((r, i) => ligneInterrupteur(r, i === EN_LIGNE.length - 1))}
      </View>

      <Text style={s.sectionTitre}>{t('notifSectionHorsLigne')}</Text>
      <View style={s.carte}>
        {HORS_LIGNE.map((r, i) => ligneInterrupteur(r, i === HORS_LIGNE.length - 1))}
      </View>

      <Text style={s.piedPage}>{t('notifToujoursRecus')}</Text>
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

// Styles selon le mode, au même style que l'écran Véhicule.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: k('#f5f5f5', c.bg) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 18, fontWeight: '800', color: k('#111', c.text) },
  sectionTitre: { color: k('#888', c.textFaint), fontSize: 14, fontWeight: '600', paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  carte: { backgroundColor: k('#fff', c.card), borderRadius: 16, marginHorizontal: 16, marginBottom: 16, paddingHorizontal: 16 },
  ligne: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10 },
  ligneBord: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: k('#e0e0e0', c.border) },
  libelle: { flex: 1, marginRight: 12, fontSize: 16, fontWeight: '600', color: k('#111', c.text) },
  toujours: { fontSize: 15, fontWeight: '600', color: k('#888', c.textMuted) },
  piedPage: { color: k('#888', c.textFaint), fontSize: 13, paddingHorizontal: 16, marginTop: 4 },
  });
};
