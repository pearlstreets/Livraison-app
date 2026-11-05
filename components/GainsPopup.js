// Fenêtre « Mes gains » ouverte par le badge argent de la carte (05/11/2026).
// Totaux : weeklyEarnings (même calcul que MenuScreen, barres nettes par jour),
// pour que les chiffres concordent avec le menu et l'écran Revenus.
// Détail par course et par heure : deliveryHistory (paginé, dernières courses).
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDayMonth, formatTime, weekdayShortNames } from '../lib/i18nFormat';

const BRAND = '#FF6A13';
const PERIODES = ['day', 'week', 'month', 'year'];

function nombre(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function debutJour(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Lundi de la semaine de d (semaine du lundi au dimanche).
function lundiDe(d) {
  const j = debutJour(d);
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
  return j;
}

function cleJour(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateValide(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Bornes [debut, fin[ de la période choisie.
function bornes(periode, now) {
  if (periode === 'day') {
    const a = debutJour(now);
    return [a, new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1)];
  }
  if (periode === 'week') {
    const a = lundiDe(now);
    return [a, new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7)];
  }
  if (periode === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)];
}

// Nom court du mois dans la langue courante (« nov », « Nov », « 11月 »).
function nomMois(d) {
  return formatDayMonth(d).replace(/\d+日/, '').replace(/^\d+\.?\s*/, '').replace(/\s*\d+$/, '').trim();
}

export default function GainsPopup({ visible, onClose, navigation }) {
  const insets = useSafeAreaInsets();
  const { weeklyEarnings, deliveryHistory, currentEarningsCents, refreshEarnings } = useAuth();
  const { t } = useLanguage();
  const { fmtPrice } = useCurrency();
  const { colors } = useTheme();
  const [periode, setPeriode] = useState('day');

  // t() rend la clé si la traduction manque : texte français par défaut.
  const tr = (cle, fr) => {
    const v = t(cle);
    return v && v !== cle ? v : fr;
  };

  // Soldes et semaines relus à chaque ouverture (l'historique est déjà chargé).
  useEffect(() => {
    if (!visible) return;
    Promise.resolve(refreshEarnings?.()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Jours nets (dédoublonnés) et semaines du serveur, préparés une fois.
  const base = useMemo(() => {
    const jours = new Map(); // cleJour -> { d, v }
    const semaines = [];
    (Array.isArray(weeklyEarnings) ? weeklyEarnings : []).forEach((w) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(w?.start || ''));
      if (!m) return;
      const bars = Array.isArray(w.bars) ? w.bars : [];
      const liste = [];
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + i);
        const v = nombre(bars[i]);
        liste.push({ d, v });
        const k = cleJour(d);
        if (!jours.has(k)) jours.set(k, { d, v });
      }
      semaines.push({
        jours: liste,
        somme: liste.reduce((a, j) => a + j.v, 0),
        tips: nombre(w.tips),
        bonus: nombre(w.bonus),
        courses: nombre(w.courses),
      });
    });
    const courses = [];
    (Array.isArray(deliveryHistory) ? deliveryHistory : []).forEach((c, i) => {
      const d = dateValide(c?.completedAt || c?.cancelledAt);
      if (!d) return;
      courses.push({ c, d, k: `${c?.id ?? 'c'}-${i}` });
    });
    courses.sort((a, b) => b.d - a.d);
    const plusAncienne = courses.length ? courses[courses.length - 1].d : null;
    return { jours, semaines, courses, plusAncienne };
  }, [weeklyEarnings, deliveryHistory]);

  const vue = useMemo(() => {
    const now = new Date();
    const [debut, fin] = bornes(periode, now);
    const dans = (d) => d >= debut && d < fin;

    // Grand total : somme des jours nets de la période (comme MenuScreen).
    let total = 0;
    base.jours.forEach(({ d, v }) => { if (dans(d)) total += v; });

    // Pourboires, bonus et nombre de courses : au prorata de la part de
    // chaque semaine tombée dans la période (exact pour une semaine entière).
    let tips = 0;
    let bonus = 0;
    let coursesProrata = 0;
    base.semaines.forEach((s) => {
      const part = s.jours.reduce((a, j) => a + (dans(j.d) ? j.v : 0), 0);
      if (part <= 0 || s.somme <= 0) return;
      const r = Math.min(1, part / s.somme);
      tips += s.tips * r;
      bonus += s.bonus * r;
      coursesProrata += s.courses * r;
    });
    tips = Math.round(tips * 100) / 100;
    bonus = Math.round(bonus * 100) / 100;
    const net = Math.max(0, Math.round((total - tips - bonus) * 100) / 100);

    // Courses de la période dans l'historique (annulées exclues des montants).
    const listees = base.courses.filter((x) => dans(x.d));
    const faites = listees.filter((x) => x.c?.status !== 'cancelled');
    // L'historique couvre-t-il toute la période ? Sinon : détail partiel.
    const complet = !!base.plusAncienne && base.plusAncienne < debut;
    const nbCourses = complet ? faites.length : Math.max(faites.length, Math.round(coursesProrata));
    const moyenne = nbCourses > 0 ? total / nbCourses : 0;

    const montantCourse = (c) => nombre(c?.priceEur) + nombre(c?.tipEur) + nombre(c?.bonusEur);

    let barres = [];
    let lignes = [];
    if (periode === 'day') {
      const parHeure = new Map();
      faites.forEach((x) => {
        const h = x.d.getHours();
        parHeure.set(h, (parHeure.get(h) || 0) + montantCourse(x.c));
      });
      barres = [...parHeure.entries()].sort((a, b) => a[0] - b[0]).map(([h, v]) => ({ k: `h${h}`, label: `${h}h`, v }));
    } else if (periode === 'week') {
      const noms = weekdayShortNames() || [];
      barres = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
        return { k: `j${i}`, label: noms[i] || '', v: base.jours.get(cleJour(d))?.v || 0 };
      });
    } else if (periode === 'month') {
      // Une ligne par semaine (lundi à dimanche) qui touche le mois.
      const semaines = [];
      for (let l = lundiDe(debut); l < fin; l = new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7)) {
        let v = 0;
        for (let i = 0; i < 7; i += 1) {
          const d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + i);
          if (dans(d)) v += base.jours.get(cleJour(d))?.v || 0;
        }
        const affiche = l < debut ? debut : l;
        semaines.push({ k: `s${cleJour(l)}`, label: tr('gainsWeekOf', 'Semaine du {d}').replace('{d}', formatDayMonth(affiche)), v });
      }
      lignes = semaines;
      const jours = [];
      base.jours.forEach(({ d, v }) => { if (dans(d) && v > 0) jours.push({ k: `d${cleJour(d)}`, d, label: formatDayMonth(d), v }); });
      jours.sort((a, b) => b.d - a.d);
      barres = jours;
    } else {
      lignes = Array.from({ length: 12 }, (_, i) => {
        let v = 0;
        base.jours.forEach(({ d, v: x }) => { if (d.getFullYear() === debut.getFullYear() && d.getMonth() === i) v += x; });
        return { k: `m${i}`, label: nomMois(new Date(debut.getFullYear(), i, 1)), v };
      });
    }

    // Courses groupées par jour (aujourd'hui : un seul groupe).
    const groupes = [];
    if (periode === 'day' || periode === 'week') {
      listees.forEach((x) => {
        const k = cleJour(x.d);
        let g = groupes[groupes.length - 1];
        if (!g || g.k !== k) { g = { k, label: formatDayMonth(x.d), items: [] }; groupes.push(g); }
        g.items.push(x);
      });
    }

    const partiel = (periode === 'day' || periode === 'week') && listees.length > 0 && !complet;
    const vide = total <= 0 && listees.length === 0;
    return { total, net, tips, bonus, nbCourses, moyenne, barres, lignes, groupes, partiel, vide, montantCourse };
    // tr dépend de t (langue) : t suffit comme dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, periode, t]);

  const s = useMemo(() => makeStyles(colors), [colors]);
  const maxBarre = Math.max(1, ...vue.barres.map((b) => b.v));
  const maxLigne = Math.max(1, ...vue.lignes.map((b) => b.v));
  const solde = nombre(currentEarningsCents) / 100;

  const onglets = [
    // Libellés courts : 4 onglets sur une ligne sans que les textes se touchent.
    ['day', tr('gainsTabDay', 'Jour')],
    ['week', tr('gainsTabWeek', 'Semaine')],
    ['month', tr('gainsTabMonth', 'Mois')],
    ['year', tr('gainsTabYear', 'Année')],
  ];

  const ouvrirRevenus = () => {
    onClose?.();
    navigation?.navigate?.('Revenus', { screen: 'EarningsMain' });
  };

  const titreDetail = periode === 'day' ? tr('gainsByHour', 'Par heure')
    : periode === 'week' ? tr('gainsByDay', 'Par jour')
      : periode === 'month' ? tr('gainsByWeek', 'Par semaine') : tr('gainsByMonth', 'Par mois');

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.racine}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('close', 'Fermer')} />
        <View style={[s.feuille, { paddingBottom: insets.bottom + 12, maxHeight: '88%', marginTop: insets.top + 40 }]}>
          <View style={s.entete}>
            <Text style={s.titre} numberOfLines={1}>{tr('earnings', 'Revenus')}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={s.croix} accessibilityRole="button" accessibilityLabel={tr('close', 'Fermer')}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={s.onglets}>
            {onglets.map(([cle, label]) => (
              <Pressable key={cle} onPress={() => setPeriode(cle)} style={[s.onglet, periode === cle && s.ongletActif]}>
                <Text style={[s.ongletTxt, periode === cle && s.ongletTxtActif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={s.contenu} showsVerticalScrollIndicator={false}>
            <Text style={s.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmtPrice(vue.total)}</Text>

            <View style={s.carte}>
              <Ligne s={s} label={tr('gainsCoursesNet', 'Courses (net)')} valeur={fmtPrice(vue.net)} />
              <Ligne s={s} label={tr('tips', 'Pourboires')} valeur={fmtPrice(vue.tips)} />
              <Ligne s={s} label={tr('gainsBonus', 'Bonus')} valeur={fmtPrice(vue.bonus)} />
              <Ligne s={s} label={tr('courses', 'Courses')} valeur={String(vue.nbCourses)} />
              <Ligne s={s} label={tr('gainsAvgPerCourse', 'Moyenne par course')} valeur={vue.nbCourses > 0 ? fmtPrice(vue.moyenne) : '-'} />
              <Ligne s={s} label={tr('currentBalance', 'Solde actuel')} valeur={fmtPrice(solde)} fort dernier />
            </View>

            {vue.vide ? (
              <Text style={s.vide}>{tr('gainsEmpty', 'Aucune course sur cette période')}</Text>
            ) : (
              <>
                {/* Barres : par heure (jour), par jour (semaine), jours actifs (mois). */}
                {vue.barres.length > 0 && periode !== 'month' && (
                  <>
                    <Text style={s.section}>{titreDetail}</Text>
                    <View style={s.graphe}>
                      {vue.barres.map((b) => (
                        <View key={b.k} style={s.colonne}>
                          <Text style={s.barreVal} numberOfLines={1} adjustsFontSizeToFit>{b.v > 0 ? fmtPrice(b.v) : ''}</Text>
                          <View style={s.barreFond}>
                            <View style={[s.barre, { height: `${Math.max(b.v > 0 ? 4 : 0, (b.v / maxBarre) * 100)}%` }]} />
                          </View>
                          <Text style={s.barreLabel} numberOfLines={1}>{b.label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Lignes : par semaine (mois) ou par mois (année). */}
                {vue.lignes.length > 0 && (
                  <>
                    <Text style={s.section}>{titreDetail}</Text>
                    <View style={s.carte}>
                      {vue.lignes.map((l, i) => (
                        <LigneBarre key={l.k} s={s} label={l.label} valeur={fmtPrice(l.v)} ratio={l.v / maxLigne} dernier={i === vue.lignes.length - 1} />
                      ))}
                    </View>
                  </>
                )}

                {periode === 'month' && vue.barres.length > 0 && (
                  <>
                    <Text style={s.section}>{tr('gainsByDay', 'Par jour')}</Text>
                    <View style={s.carte}>
                      {vue.barres.map((l, i) => (
                        <LigneBarre key={l.k} s={s} label={l.label} valeur={fmtPrice(l.v)} ratio={l.v / maxBarre} dernier={i === vue.barres.length - 1} />
                      ))}
                    </View>
                  </>
                )}

                {/* Courses de la période, une ligne par course. */}
                {vue.groupes.length > 0 && (
                  <>
                    <Text style={s.section}>{tr('gainsCoursesList', 'Vos courses')}</Text>
                    {vue.groupes.map((g) => (
                      <View key={g.k} style={s.groupe}>
                        {periode === 'week' && <Text style={s.groupeTitre}>{g.label}</Text>}
                        <View style={s.carte}>
                          {g.items.map((x, i) => (
                            <LigneCourse key={x.k} s={s} x={x} fmtPrice={fmtPrice} tr={tr} total={vue.montantCourse(x.c)} dernier={i === g.items.length - 1} />
                          ))}
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {vue.partiel && <Text style={s.note}>{tr('gainsLatestOnly', 'Le détail montre vos dernières courses.')}</Text>}
              </>
            )}

            <Pressable style={s.bouton} onPress={ouvrirRevenus}>
              <Text style={s.boutonTxt}>{tr('gainsSeeAll', 'Voir tous mes revenus')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Ligne({ s, label, valeur, fort, dernier }) {
  return (
    <View style={[s.ligne, dernier && s.ligneDerniere]}>
      <Text style={[s.ligneLabel, fort && s.ligneFort]}>{label}</Text>
      <Text style={[s.ligneVal, fort && s.ligneFort]}>{valeur}</Text>
    </View>
  );
}

function LigneBarre({ s, label, valeur, ratio, dernier }) {
  const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return (
    <View style={[s.ligne, dernier && s.ligneDerniere]}>
      <Text style={[s.ligneLabel, { width: 120 }]} numberOfLines={1}>{label}</Text>
      <View style={s.ligneJauge}>
        <View style={[s.ligneJaugePlein, { width: `${r * 100}%` }]} />
      </View>
      <Text style={s.ligneVal}>{valeur}</Text>
    </View>
  );
}

function LigneCourse({ s, x, fmtPrice, tr, total, dernier }) {
  const c = x.c || {};
  const annulee = c.status === 'cancelled';
  const tip = nombre(c.tipEur);
  const bonus = nombre(c.bonusEur);
  const lieu = [c.restaurant, c.address].filter((v) => v && v !== '-').join(' · ');
  return (
    <View style={[s.course, dernier && s.ligneDerniere]}>
      <View style={s.courseHaut}>
        <Text style={s.courseHeure}>{c.time || formatTime(x.d)}</Text>
        <Text style={s.courseLieu} numberOfLines={2}>{lieu || '-'}</Text>
        <Text style={[s.courseTotal, annulee && s.annulee]}>{annulee ? tr('cancelledAt', 'Annulée') : fmtPrice(total)}</Text>
      </View>
      {!annulee && (
        <Text style={s.courseDetail}>
          {[
            c.distanceText || null,
            `${tr('gainsCourse', 'Course')} ${fmtPrice(nombre(c.priceEur))}`,
            tip > 0 ? `${tr('tip', 'Pourboire')} ${fmtPrice(tip)}` : null,
            bonus > 0 ? `${tr('gainsBonus', 'Bonus')} ${fmtPrice(bonus)}` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      )}
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    racine: { flex: 1, justifyContent: 'flex-end' },
    feuille: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
    entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    // Marge de la largeur de la croix : le titre ne passe jamais dessous.
    titre: { marginHorizontal: 36, fontSize: 17, fontWeight: '800', color: c.text },
    croix: { position: 'absolute', right: 14, top: 8, padding: 4 },
    onglets: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: c.bg, borderRadius: 12, padding: 3, gap: 4 },
    onglet: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center' },
    ongletActif: { backgroundColor: BRAND },
    ongletTxt: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    ongletTxtActif: { color: '#fff' },
    contenu: { paddingHorizontal: 16, paddingBottom: 8 },
    total: { fontSize: 34, fontWeight: '900', color: c.text, textAlign: 'center', marginVertical: 14 },
    carte: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
    ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
    ligneDerniere: { borderBottomWidth: 0 },
    ligneLabel: { flex: 1, fontSize: 14, color: c.textSoft },
    ligneVal: { fontSize: 14, fontWeight: '700', color: c.text },
    ligneFort: { fontWeight: '800', color: c.text },
    ligneJauge: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' },
    ligneJaugePlein: { height: 6, borderRadius: 3, backgroundColor: BRAND },
    section: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 18, marginBottom: 8, textTransform: 'uppercase' },
    graphe: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 6 },
    colonne: { flex: 1, alignItems: 'center', height: '100%' },
    barreVal: { fontSize: 9, fontWeight: '700', color: c.textMuted, height: 14 },
    barreFond: { flex: 1, width: '70%', justifyContent: 'flex-end' },
    barre: { width: '100%', backgroundColor: BRAND, borderRadius: 4 },
    barreLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted, marginTop: 4 },
    groupe: { marginBottom: 10 },
    groupeTitre: { fontSize: 13, fontWeight: '700', color: c.textSoft, marginBottom: 6 },
    course: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    courseHaut: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    courseHeure: { fontSize: 13, fontWeight: '700', color: c.text, width: 48 },
    courseLieu: { flex: 1, fontSize: 13, color: c.textSoft },
    courseTotal: { fontSize: 14, fontWeight: '800', color: c.text },
    annulee: { color: c.danger, fontWeight: '700', fontSize: 12 },
    courseDetail: { fontSize: 12, color: c.textMuted, marginTop: 4, marginLeft: 56 },
    vide: { textAlign: 'center', color: c.textMuted, fontSize: 14, marginVertical: 24 },
    note: { textAlign: 'center', color: c.textFaint, fontSize: 12, marginTop: 6 },
    bouton: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    boutonTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
