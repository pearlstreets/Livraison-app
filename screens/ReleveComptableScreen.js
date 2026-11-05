import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dirIcon } from '../lib/rtl';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';
const URL_RELEVE = '/api/v1/delivery/driver/releve-comptable/';

// Année en cours et les trois précédentes.
function anneesProposees() {
  const courante = new Date().getFullYear();
  return [0, 1, 2, 3].map((i) => courante - i).filter((a) => a >= 2020);
}

function nombre(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nomMois(t, mois) {
  const noms = t('releveMonthNames');
  return Array.isArray(noms) && noms[mois - 1] ? noms[mois - 1] : String(mois);
}

function Ligne({ s, c, label, value, fort, couleur, moins }) {
  return (
    <View style={s.detailRow}>
      <Text style={[s.detailLabel, fort && { fontWeight: '800', color: c.text }]}>{label}</Text>
      <Text style={[s.detailValue, couleur && { color: couleur }, fort && { fontWeight: '900', fontSize: 16 }]}>
        {moins ? `- ${value}` : value}
      </Text>
    </View>
  );
}

function Detail({ s, c, ligne, t, fmtPrice, totalAnnee }) {
  return (
    <>
      <Ligne s={s} c={c} label={t('releveCourses')} value={String(nombre(ligne.courses))} />
      <Ligne s={s} c={c} label={t('releveDeliveryFees')} value={fmtPrice(nombre(ligne.frais))} />
      <Ligne s={s} c={c} label={t('releveBonus')} value={fmtPrice(nombre(ligne.bonus))} />
      <Ligne s={s} c={c} label={t('releveTips')} value={fmtPrice(nombre(ligne.pourboires))} couleur={BRAND} />
      <View style={s.divider} />
      <Ligne s={s} c={c} label={t('releveGross')} value={fmtPrice(nombre(ligne.brut))} />
      <Ligne s={s} c={c} label={t('releveCommission')} value={fmtPrice(nombre(ligne.commission))} moins={nombre(ligne.commission) > 0} />
      <Ligne s={s} c={c} label={t('releveUrssaf')} value={fmtPrice(nombre(ligne.urssaf))} moins={nombre(ligne.urssaf) > 0} />
      <View style={s.divider} />
      <Ligne s={s} c={c} label={t('releveNet')} value={fmtPrice(nombre(ligne.net))} fort couleur={totalAnnee ? BRAND : undefined} />
    </>
  );
}

export default function ReleveComptableScreen({ navigation }) {
  const { t } = useLanguage();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const annees = anneesProposees();
  const [annee, setAnnee] = useState(annees[0]);
  const [releve, setReleve] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [export_, setExport] = useState(false);
  const [erreurExport, setErreurExport] = useState(false);
  const demande = useRef(0);
  // Écran quitté pendant un export : plus de mise à jour d'état.
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);

  const charger = useCallback(async (a) => {
    const id = ++demande.current;
    setChargement(true);
    setErreur(false);
    try {
      const { data } = await api.get(URL_RELEVE, { params: { annee: a } });
      if (id !== demande.current) return;
      setReleve(data && Array.isArray(data.mois) ? data : null);
      if (!data || !Array.isArray(data.mois)) setErreur(true);
    } catch (e) {
      if (id !== demande.current) return;
      setReleve(null);
      setErreur(true);
    } finally {
      if (id === demande.current) setChargement(false);
    }
  }, []);

  useEffect(() => { charger(annee); }, [annee, charger]);

  async function exporter() {
    if (export_) return;
    setExport(true);
    setErreurExport(false);
    try {
      const { data } = await api.get(URL_RELEVE, {
        params: { annee, format: 'csv' },
        responseType: 'text',
        transformResponse: [(d) => d],
      });
      const texte = typeof data === 'string' ? data.replace(/^﻿/, '') : '';
      if (!texte) throw new Error('csv vide');
      await Share.share({ message: texte, title: `releve-comptable-${annee}.csv` });
    } catch (e) {
      if (monte.current) setErreurExport(true);
    } finally {
      if (monte.current) setExport(false);
    }
  }

  const moisAvecCourses = (releve?.mois || []).filter((m) => nombre(m?.courses) > 0);
  const vide = !chargement && !erreur && releve && moisAvecCourses.length === 0;

  return (
    <View style={s.container}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('releveComptable')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.anneesRow} style={{ flexGrow: 0 }}>
        {annees.map((a) => (
          <Pressable key={a} onPress={() => setAnnee(a)} style={[s.anneeChip, a === annee && s.anneeChipActive]}>
            <Text style={[s.anneeTxt, a === annee && s.anneeTxtActive]}>{a}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {chargement ? (
          <ActivityIndicator size="large" color={BRAND} style={{ marginTop: 40 }} />
        ) : erreur ? (
          <View style={s.centre}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textFaint} />
            <Text style={s.centreTxt}>{t('releveError')}</Text>
            <Pressable style={s.retryBtn} onPress={() => charger(annee)}>
              <Text style={s.retryTxt}>{t('releveRetry')}</Text>
            </Pressable>
          </View>
        ) : vide ? (
          <View style={s.centre}>
            <Ionicons name="document-text-outline" size={40} color={colors.textFaint} />
            <Text style={s.centreTxt}>{t('releveEmpty')}</Text>
          </View>
        ) : releve ? (
          <>
            <View style={s.detailCard}>
              <Text style={s.detailCardTitle}>{t('releveYearTotal', { year: annee })}</Text>
              <Detail s={s} c={colors} ligne={releve.total || {}} t={t} fmtPrice={fmtPrice} totalAnnee />
              <Text style={s.note}>{t('releveNote')}</Text>
            </View>

            {moisAvecCourses.map((m, i) => (
              <View key={m.mois ?? `i${i}`} style={s.detailCard}>
                <Text style={s.detailCardTitle}>{`${nomMois(t, m.mois)} ${annee}`}</Text>
                <Detail s={s} c={colors} ligne={m} t={t} fmtPrice={fmtPrice} />
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {releve && !vide && !chargement && !erreur && (
        <View style={[s.bottomWrap, { paddingBottom: insets.bottom || 10 }]}>
          {erreurExport && <Text style={s.erreurExport}>{t('releveExportError')}</Text>}
          <Pressable style={[s.exportBtn, export_ && { opacity: 0.6 }]} onPress={exporter} disabled={export_}>
            {export_ ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={s.exportTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('releveExportCsv')}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Couleurs : en clair, valeurs d'origine à l'identique ; en sombre, celles du thème.
const makeStyles = (c) => {
  const p = (clair, sombre) => (c.dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8, fontSize: 18, fontWeight: '800', color: c.text },

  anneesRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  anneeChip: { backgroundColor: c.card, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: c.borderStrong },
  anneeChipActive: { backgroundColor: BRAND, borderColor: BRAND },
  anneeTxt: { fontSize: 14, fontWeight: '700', color: p('#555', c.textSoft) },
  anneeTxtActive: { color: '#fff' },

  detailCard: { backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12 },
  detailCardTitle: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  detailLabel: { fontSize: 14, color: p('#888', c.textMuted), flex: 1, paddingRight: 8 },
  detailValue: { fontSize: 14, fontWeight: '700', color: c.text, flexShrink: 0 },
  note: { fontSize: 12, color: p('#888', c.textMuted), lineHeight: 17, marginTop: 8 },
  divider: { height: 1, backgroundColor: p('#f0f0f0', c.border), marginVertical: 6 },

  centre: { alignItems: 'center', paddingHorizontal: 32, marginTop: 48, gap: 12 },
  centreTxt: { fontSize: 15, color: p('#666', c.textMuted), textAlign: 'center', lineHeight: 21 },
  retryBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  bottomWrap: { paddingTop: 6, paddingHorizontal: 16 },
  erreurExport: { fontSize: 13, color: p('#888', c.textMuted), textAlign: 'center', marginBottom: 6 },
  exportBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12 },
  exportTxt: { color: '#fff', fontWeight: '800', fontSize: 16, flexShrink: 1 },
  });
};
