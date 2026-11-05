import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { deliveryService } from '../services/deliveryService';

const BRAND = '#FF6A13';

export default function OpportunitiesScreen({ navigation }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const insets = useSafeAreaInsets();
  const { readOpportunities, markOpportunityRead, setOpportunityIds } = useAuth();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [essai, setEssai] = useState(0);

  // Relue à chaque retour sur l'écran ; échec = message et bouton Réessayer.
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        if (alive) setLoadError(false);
        const r = await deliveryService.getOpportunities();
        const brut = r && (r.data || r.results);
        // Réponse inattendue (objet, null) : liste vide plutôt qu'un plantage sur .map.
        const list = (Array.isArray(brut) ? brut : []).filter((o) => o && o.id != null);
        // Le badge du menu suit exactement cette liste.
        if (alive) setOpportunityIds(list.map((o) => String(o.id)));
        if (alive) setPromos(list.map((o) => ({
          id: String(o.id),
          title: o.title || '',
          desc: o.description || '',
          period: o.period_label || '',
          icon: o.icon || 'flash',
          // Couleur hexadécimale seulement (suffixe d'opacité « 20 » ajouté à l'affichage).
          color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : BRAND,
        })));
      } catch {
        if (alive) setLoadError(true);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [essai])); // eslint-disable-line react-hooks/exhaustive-deps

  function openPromo(promo) {
    markOpportunityRead(promo.id);
    navigation.navigate('OpportunityDetail', { promo });
  }

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('opportunitiesTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.subtitle}>{t('opportunitiesSub')}</Text>

      {loading && (
        <ActivityIndicator color={BRAND} style={{ marginTop: 24 }} />
      )}
      {!loading && loadError && promos.length === 0 && (
        <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 32 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.chevron} style={{ marginBottom: 10 }} />
          <Text style={{ color: colors.textFaint, textAlign: 'center' }}>{t('opportunitiesLoadError')}</Text>
          <Pressable onPress={() => { setLoading(true); setEssai((n) => n + 1); }} style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: BRAND }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('retry')}</Text>
          </Pressable>
        </View>
      )}
      {!loading && !loadError && promos.length === 0 && (
        <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 32 }}>
          <Ionicons name="sparkles-outline" size={36} color={colors.chevron} style={{ marginBottom: 10 }} />
          <Text style={{ color: colors.textFaint, textAlign: 'center' }}>{t('noOpportunities') || 'Aucune opportunité pour le moment'}</Text>
        </View>
      )}

      {promos.map((promo) => {
        const isRead = readOpportunities.includes(promo.id);
        return (
          <Pressable key={promo.id} style={s.card} onPress={() => openPromo(promo)}>
            <View style={[s.iconCircle, { backgroundColor: promo.color + '20' }]}>
              <Ionicons name={promo.icon} size={24} color={promo.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.cardTitle}>{promo.title}</Text>
                {!isRead && <View style={s.unreadDot} />}
              </View>
              <Text style={s.cardDesc}>{promo.desc}</Text>
              <Text style={[s.cardPeriod, { color: promo.color }]}>{promo.period}</Text>
            </View>
            <Ionicons name={dirIcon('chevron-forward')} size={18} color={colors.chevron} />
          </Pressable>
        );
      })}
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  subtitle: { color: c.dark ? c.textMuted : '#888', fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  card: { flexDirection: 'row', backgroundColor: c.card, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardTitle: { fontWeight: '800', fontSize: 16, color: c.text, marginBottom: 4 },
  cardDesc: { color: c.dark ? c.textSoft : '#555', fontSize: 13, marginBottom: 6 },
  cardPeriod: { fontWeight: '700', fontSize: 13 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e74c3c', marginLeft: 6 },
});

// Feuilles de style par thème (clair, sombre), créées une seule fois chacune.
const stylesParTheme = new Map();
function stylesPour(c) {
  if (!stylesParTheme.has(c)) stylesParTheme.set(c, makeStyles(c));
  return stylesParTheme.get(c);
}
