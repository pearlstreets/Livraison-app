import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import useSecureScreen from '../hooks/useSecureScreen';

const BRAND = '#FF6A13';

// Mapping champ backend → clé i18n du label
const DOC_FIELDS = [
  // Effacée par le serveur dès la validation du compte (RGPD, 27/10/2026).
  { field: 'id_card_front_url', labelKey: 'idCardFront', effaceeApresValidation: true },
  { field: 'id_card_back_url', labelKey: 'idCardBack', effaceeApresValidation: true },
  { field: 'driver_license_url', labelKey: 'driverLicense' },
  { field: 'rc_pro_url', labelKey: 'insurance' },
  { field: 'urssaf_doc_url', labelKey: 'urssaf' },
  { field: 'kbis_doc_url', labelKey: 'kbis' },
  { field: 'iban_doc_url', labelKey: 'ibanDoc' },
];

function buildDocs(user, t) {
  if (!user) return DOC_FIELDS.map(d => ({
    labelKey: d.labelKey,
    field: d.field,
    provided: false,
    icon: 'alert-circle-outline',
    color: '#ccc',
    statusText: t('missing') || 'Manquant',
    url: null,
  }));
  return DOC_FIELDS.map(d => {
    const provided = typeof user[d.field] === 'string' && user[d.field].trim().length > 0;
    // Compte validé, pièce effacée : ni « Manquant » ni demande de la renvoyer.
    if (!provided && d.effaceeApresValidation && user.is_verified === true) {
      return {
        labelKey: d.labelKey,
        field: d.field,
        provided: false,
        icon: 'shield-checkmark-outline',
        color: BRAND,
        statusText: t('docErasedAfterValidation'),
        statusKey: 'validated',
        url: null,
      };
    }
    return {
      labelKey: d.labelKey,
      field: d.field,
      provided,
      icon: provided ? 'checkmark-circle' : 'alert-circle-outline',
      color: provided ? BRAND : '#f5a623',
      statusText: provided ? (t('provided') || 'Fourni') : (t('missing') || 'Manquant'),
      url: provided ? user[d.field] : null,
    };
  });
}

export default function DocumentsScreen({ navigation }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  // Pièces du livreur : identité, permis, justificatifs.
  useSecureScreen('Documents');
  const scrollRef = useRef(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  const docs = buildDocs(user, t);
  const isVerified = user?.is_verified === true;

  return (
    <>
    <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{t('documentsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Badge vérification global */}
      <View style={[s.verifiedBadge, { backgroundColor: dark ? (isVerified ? colors.cardAlt : '#3a2e14') : (isVerified ? '#FFF1E8' : '#fff8e1') }]}>
        <Ionicons
          name={isVerified ? 'shield-checkmark' : 'shield-outline'}
          size={20}
          color={isVerified ? BRAND : '#f5a623'}
          style={{ marginRight: 8 }}
        />
        <Text style={[s.verifiedText, { color: isVerified ? BRAND : '#f5a623' }]}>
          {isVerified ? (t('accountVerified') || 'Compte vérifié') : (t('verificationPending') || 'Vérification en attente')}
        </Text>
      </View>

      <Text style={s.subtitle}>{t('documentsVerified')}</Text>

      {docs.map((doc) => (
        <Pressable
          key={doc.field}
          style={s.docRow}
          onPress={() => navigation.navigate('DocumentDetail', {
            doc: { ...doc, label: t(doc.labelKey) || doc.labelKey, status: doc.statusText },
          })}
        >
          <Ionicons name={doc.icon} size={24} color={doc.color} style={{ marginRight: 14 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.docLabel}>{t(doc.labelKey) || doc.labelKey}</Text>
            <Text style={[s.docStatus, { color: doc.color }]}>{doc.statusText}</Text>
          </View>
          <Ionicons name={dirIcon('chevron-forward')} size={18} color={colors.chevron} />
        </Pressable>
      ))}
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

// Styles selon le mode : en clair, valeurs d'origine à l'identique.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: k('#f5f5f5', c.bg) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: k('#111', c.text), flex: 1, textAlign: 'center', marginHorizontal: 8 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  verifiedText: { fontWeight: '700', fontSize: 14, flexShrink: 1 },
  subtitle: { color: k('#888', c.textFaint), fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: k('#fff', c.card), paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: k('#f0f0f0', c.border) },
  docLabel: { fontWeight: '700', fontSize: 15, color: k('#111', c.text) },
  docStatus: { fontSize: 13, marginTop: 2 },
  });
};
