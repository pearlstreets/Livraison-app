import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

export default function OpportunityDetailScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = stylesPour(colors);
  const insets = useSafeAreaInsets();
  const promo = route.params?.promo || {};
  // Couleur hexadécimale seulement : une autre valeur donnerait une couleur invalide avec le suffixe d'opacité.
  const teinte = typeof promo.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(promo.color) ? promo.color : BRAND;

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('opportunitiesTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Icon hero */}
        <View style={s.heroWrap}>
          <View style={[s.heroCircle, { backgroundColor: teinte + '20' }]}>
            <Ionicons name={promo.icon || 'flash'} size={48} color={teinte} />
          </View>
        </View>

        <Text style={s.title}>{promo.title}</Text>
        <View style={[s.periodBadge, { backgroundColor: teinte + '15' }]}>
          <Ionicons name="time-outline" size={14} color={teinte} />
          <Text style={[s.periodText, { color: teinte }]}>{promo.period}</Text>
        </View>

        <View style={s.descCard}>
          <Text style={s.descTitle}>{t('descriptionLabel')}</Text>
          <Text style={s.descText}>{promo.desc}</Text>
        </View>

        {/* Conditions : seulement celles envoyées par le serveur, jamais de texte inventé. */}
        {Array.isArray(promo.conditions) && promo.conditions.filter(Boolean).length > 0 ? (
          <View style={s.descCard}>
            <Text style={s.descTitle}>{t('conditionsLabel')}</Text>
            {promo.conditions.filter(Boolean).map((c, i) => (
              <View key={i} style={s.condRow}>
                <Ionicons name="checkmark-circle" size={16} color={BRAND} />
                <Text style={s.condText}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: c.bg },
  headerTitle: { fontSize: 18, fontWeight: '800', color: c.text },

  heroWrap: { alignItems: 'center', marginTop: 20, marginBottom: 16 },
  heroCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },

  title: { fontSize: 22, fontWeight: '900', color: c.text, textAlign: 'center', paddingHorizontal: 24, marginBottom: 10 },

  periodBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, gap: 6, marginBottom: 20 },
  periodText: { fontSize: 13, fontWeight: '700' },

  descCard: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 12 },
  descTitle: { fontSize: 15, fontWeight: '800', color: c.text, marginBottom: 8 },
  descText: { fontSize: 14, color: c.dark ? c.textSoft : '#555', lineHeight: 21 },

  condRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  condText: { fontSize: 14, color: c.dark ? c.textSoft : '#555', flex: 1 },
});

// Feuilles de style par thème (clair, sombre), créées une seule fois chacune.
const stylesParTheme = new Map();
function stylesPour(c) {
  if (!stylesParTheme.has(c)) stylesParTheme.set(c, makeStyles(c));
  return stylesParTheme.get(c);
}
