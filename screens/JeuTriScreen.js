/**
 * Mini-jeu « Tri express », pour patienter entre deux courses.
 *
 * Un colis tombe : le livreur touche la zone de la même couleur avant qu'il
 * touche le sol. Niveaux sans fin (plus de zones, de colis, de vitesse).
 *
 * Jamais de course ratée : le jeu se met en pause dès qu'une nouvelle course
 * est annoncée (services/sonCourse.js), quand l'app passe en arrière-plan ou
 * quand on quitte l'écran. Partie enregistrée sur le téléphone après chaque
 * colis et à chaque pause (utils/jeuTri.js). Aucun son.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, AppState, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import { ecouterNouvelleCourse } from '../services/sonCourse';
import {
  ZONES, VIES_PAR_NIVEAU, reglagesNiveau, pointsColis, nouveauColis, cleSauvegarde,
  chargerPartie, enregistrerPartie, apresBonTri, apresErreur, niveauSuivant,
  recommencerNiveau, nouvellePartie,
} from '../utils/jeuTri';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(ok) {
  try {
    if (!Haptics) return;
    const promesse = ok
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const TAILLE_COLIS = 76;
const OR = '#F2B705';

export default function JeuTriScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const cle = useMemo(() => cleSauvegarde(user?.id), [user?.id]);

  const [etat, setEtat] = useState(null); // null : chargement
  const etatRef = useRef(null);
  const [hauteur, setHauteur] = useState(0);
  const hauteurRef = useRef(0);
  const [alerteCourse, setAlerteCourse] = useState(false);
  const [retour, setRetour] = useState(null); // { ok, texte, n }
  const minuteurRetour = useRef(null);

  const progression = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);
  const chuteRef = useRef(null); // { debut, pDepart, dureeTotale }
  const jetonRef = useRef(0); // invalide la fin d'une chute arrêtée
  const monteRef = useRef(true);

  const appliquer = useCallback((nouvel, sauver = true) => {
    etatRef.current = nouvel;
    if (monteRef.current) setEtat(nouvel);
    if (sauver) enregistrerPartie(cle, nouvel);
  }, [cle]);

  // Position du colis (0 en haut, 1 au sol), calculée sur l'horloge :
  // fiable même au passage en arrière-plan.
  const positionActuelle = useCallback(() => {
    const e = etatRef.current;
    const c = chuteRef.current;
    if (!c) return e?.colis?.p || 0;
    return Math.min(0.98, c.pDepart + (Date.now() - c.debut) / c.dureeTotale);
  }, []);

  const arreterChute = useCallback(() => {
    jetonRef.current += 1;
    animRef.current?.stop();
    animRef.current = null;
    chuteRef.current = null;
  }, []);

  const montrerRetour = useCallback((ok, texte) => {
    if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    setRetour({ ok, texte, n: Date.now() });
    minuteurRetour.current = setTimeout(() => {
      if (monteRef.current) setRetour(null);
    }, 700);
  }, []);

  const erreur = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu' || !e.colis) return;
    arreterChute();
    vibrer(false);
    montrerRetour(false, t('jeuRate'));
    let n = apresErreur(e);
    if (n.phase === 'jeu') n = { ...n, colis: nouveauColis(n.niveau, e.colis.zone) };
    appliquer(n);
  }, [appliquer, arreterChute, montrerRetour, t]);
  const erreurRef = useRef(erreur);
  erreurRef.current = erreur;

  const lancerChute = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu' || !e.colis || hauteurRef.current <= 0) return;
    const r = reglagesNiveau(e.niveau);
    const dureeTotale = e.colis.express ? r.duree * 0.75 : r.duree;
    // Chute déjà en cours (écran redimensionné) : elle reprend où elle en était.
    const pDepart = chuteRef.current ? positionActuelle() : (e.colis.p || 0);
    arreterChute();
    progression.setValue(pDepart);
    chuteRef.current = { debut: Date.now(), pDepart, dureeTotale };
    const jeton = jetonRef.current;
    const anim = Animated.timing(progression, {
      toValue: 1,
      duration: Math.max(60, dureeTotale * (1 - pDepart)),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      // Colis arrivé au sol sans être trié.
      if (finished && jeton === jetonRef.current) erreurRef.current();
    });
  }, [arreterChute, positionActuelle, progression]);

  const pause = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu') return;
    const p = positionActuelle();
    arreterChute();
    progression.setValue(p);
    appliquer({ ...e, phase: 'pause', colis: e.colis ? { ...e.colis, p } : nouveauColis(e.niveau) });
  }, [appliquer, arreterChute, positionActuelle, progression]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  const trier = useCallback((indexZone) => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu' || !e.colis) return;
    if (indexZone !== e.colis.zone) {
      erreur();
      return;
    }
    arreterChute();
    vibrer(true);
    montrerRetour(true, `+${pointsColis(e.niveau, e.colis.express)}`);
    let n = apresBonTri(e, e.colis.express);
    if (n.phase === 'jeu') n = { ...n, colis: nouveauColis(n.niveau, e.colis.zone) };
    appliquer(n);
  }, [appliquer, arreterChute, erreur, montrerRetour]);

  // Chargement de la partie enregistrée.
  useEffect(() => {
    let vivant = true;
    chargerPartie(cle).then((e) => {
      if (!vivant) return;
      if (e.colis) progression.setValue(e.colis.p || 0);
      appliquer(e, false);
    });
    return () => { vivant = false; };
  }, [cle, appliquer, progression]);

  // Une chute démarre à chaque nouveau colis ou à la reprise.
  useEffect(() => {
    if (etat?.phase === 'jeu' && etat?.colis && hauteur > 0) lancerChute();
  }, [etat?.phase, etat?.colis, hauteur, lancerChute]);

  // Pause : app en arrière-plan, écran quitté, nouvelle course.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (prochain) => {
      if (prochain !== 'active') pauseRef.current();
    });
    const desabonner = ecouterNouvelleCourse(() => {
      pauseRef.current();
      if (monteRef.current) setAlerteCourse(true);
    });
    return () => {
      abonnement?.remove?.();
      desabonner();
    };
  }, []);
  useFocusEffect(useCallback(() => () => pauseRef.current(), []));
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      monteRef.current = false;
      jetonRef.current += 1;
      animRef.current?.stop();
      if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    };
  }, []);

  const quitter = useCallback(() => {
    pause();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('OrdersMain');
  }, [navigation, pause]);

  const voirCourse = useCallback(() => {
    setAlerteCourse(false);
    pause();
    navigation.navigate('OrdersMain');
  }, [navigation, pause]);

  const confirmerNouvellePartie = useCallback(() => {
    Alert.alert(t('jeuNouvellePartieTitre'), t('jeuNouvellePartieTexte'), [
      { text: t('jeuAnnuler'), style: 'cancel' },
      { text: t('jeuNouvellePartie'), style: 'destructive', onPress: () => appliquer(nouvellePartie(etatRef.current)) },
    ]);
  }, [appliquer, t]);

  const surMesure = useCallback((ev) => {
    const h = Math.round(ev.nativeEvent.layout.height);
    if (h !== hauteurRef.current) {
      hauteurRef.current = h;
      setHauteur(h);
    }
  }, []);

  if (!etat) {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  const r = reglagesNiveau(etat.niveau);
  const zones = ZONES.slice(0, r.zones);
  const zoneColis = etat.colis ? ZONES[etat.colis.zone] || ZONES[0] : null;
  const descente = Math.max(0, hauteur - TAILLE_COLIS - 8);
  const translateY = progression.interpolate({ inputRange: [0, 1], outputRange: [0, descente] });
  const avancee = r.colis > 0 ? Math.min(1, etat.tries / r.colis) : 0;

  return (
    <View style={[styles.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      {/* Barre du haut : quitter, niveau, score, vies, pause */}
      <View style={styles.haut}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.infos}>
          <Text style={styles.niveau}>{t('jeuNiveau', { n: etat.niveau })}</Text>
          <Text style={styles.score}>{t('jeuScore', { n: etat.score })}</Text>
        </View>
        <View style={styles.vies}>
          {Array.from({ length: VIES_PAR_NIVEAU }).map((_, i) => (
            <Ionicons key={i} name={i < etat.vies ? 'heart' : 'heart-outline'} size={18} color={colors.danger} />
          ))}
        </View>
        <Pressable
          onPress={pause}
          disabled={etat.phase !== 'jeu'}
          style={[styles.rond, styles.rondPause, etat.phase !== 'jeu' && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityLabel={t('jeuPause')}
        >
          <Ionicons name="pause" size={22} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.jauge}>
        <View style={[styles.jaugePleine, { width: `${avancee * 100}%` }]} />
      </View>

      {/* Piste de chute */}
      <View style={styles.piste} onLayout={surMesure}>
        {zoneColis && (etat.phase === 'jeu' || etat.phase === 'pause') && (
          <Animated.View
            style={[
              styles.colis,
              { backgroundColor: zoneColis.couleur, transform: [{ translateY }] },
              etat.colis.express && styles.colisExpress,
            ]}
          >
            <Ionicons name={zoneColis.icone} size={34} color="#fff" />
            {etat.colis.express && (
              <View style={styles.pastilleExpress}>
                <Ionicons name="flash" size={14} color="#fff" />
              </View>
            )}
          </Animated.View>
        )}
        {retour && (
          <Text key={retour.n} style={[styles.retour, { color: retour.ok ? colors.success : colors.danger }]}>
            {retour.texte}
          </Text>
        )}
        <View style={styles.sol} />
      </View>

      {/* Zones de tri */}
      <View style={styles.zones}>
        {zones.map((z, i) => (
          <Pressable
            key={z.cle}
            onPressIn={() => trier(i)}
            disabled={etat.phase !== 'jeu'}
            style={({ pressed }) => [styles.zone, { backgroundColor: z.couleur }, pressed && { opacity: 0.75 }]}
            accessibilityLabel={t(`jeuZone_${z.cle}`)}
          >
            <Ionicons name={z.icone} size={30} color="#fff" />
            <Text style={styles.zoneTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t(`jeuZone_${z.cle}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Fenêtres : accueil, pause, niveau réussi, niveau raté, nouvelle course */}
      {etat.phase !== 'jeu' && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {etat.phase === 'accueil' && (
              <>
                <Ionicons name="cube" size={40} color={BRAND} />
                <Text style={styles.titre}>{t('jeuTitre')}</Text>
                <Text style={styles.texte}>{t('jeuRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuRegleExpress')}</Text>
                <Records etat={etat} t={t} styles={styles} />
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={() => appliquer(nouvellePartie(etat))} />
              </>
            )}
            {etat.phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuSauvegarde')}</Text>
                <Records etat={etat} t={t} styles={styles} />
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={() => appliquer({ ...etat, phase: 'jeu' })} />
                <Bouton styles={styles} secondaire texte={t('jeuNouvellePartie')} onPress={confirmerNouvellePartie} />
              </>
            )}
            {etat.phase === 'niveauFini' && (
              <>
                <Ionicons name="trophy" size={44} color={OR} />
                <Text style={styles.titre}>{t('jeuNiveauReussi', { n: etat.niveau })}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: etat.score })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuNiveauSuivantInfo')}</Text>
                <Bouton styles={styles} texte={t('jeuNiveauSuivant')} onPress={() => appliquer(niveauSuivant(etat))} />
              </>
            )}
            {etat.phase === 'perdu' && (
              <>
                <Ionicons name="heart-dislike" size={44} color={colors.danger} />
                <Text style={styles.titre}>{t('jeuPlusDeVies')}</Text>
                <Text style={styles.texte}>{t('jeuPlusDeViesTexte', { n: etat.niveau })}</Text>
                <Records etat={etat} t={t} styles={styles} />
                <Bouton styles={styles} texte={t('jeuRecommencerNiveau', { n: etat.niveau })} onPress={() => appliquer(recommencerNiveau(etat))} />
                <Bouton styles={styles} secondaire texte={t('jeuNouvellePartie')} onPress={confirmerNouvellePartie} />
              </>
            )}
          </View>
        </View>
      )}
      {alerteCourse && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            <Ionicons name="bicycle" size={44} color={BRAND} />
            <Text style={styles.titre}>{t('jeuNouvelleCourse')}</Text>
            <Text style={styles.texte}>{t('jeuNouvelleCourseTexte')}</Text>
            <Bouton styles={styles} texte={t('jeuVoirCourse')} onPress={voirCourse} />
            <Bouton styles={styles} secondaire texte={t('jeuResterIci')} onPress={() => setAlerteCourse(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

function Records({ etat, t, styles }) {
  return (
    <View style={styles.records}>
      <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: etat.meilleurScore })}</Text>
      <Text style={styles.texteDiscret}>{t('jeuMeilleurNiveau', { n: etat.meilleurNiveau })}</Text>
    </View>
  );
}

function Bouton({ texte, onPress, secondaire, styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bouton, secondaire && styles.boutonSecondaire, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.boutonTexte, secondaire && styles.boutonTexteSecondaire]}>{texte}</Text>
    </Pressable>
  );
}

const makeStyles = (c, dark) => StyleSheet.create({
  ecran: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  infos: { flex: 1 },
  niveau: { color: c.text, fontSize: 17, fontWeight: '800' },
  score: { color: c.textMuted, fontSize: 14, fontWeight: '600', marginTop: 1 },
  vies: { flexDirection: 'row', gap: 2 },
  jauge: { height: 6, borderRadius: 3, backgroundColor: dark ? c.borderStrong : '#E6E8EB', marginTop: 12, overflow: 'hidden' },
  jaugePleine: { height: 6, borderRadius: 3, backgroundColor: BRAND },
  piste: {
    flex: 1, marginTop: 14, marginBottom: 14, borderRadius: 18, backgroundColor: c.card,
    borderWidth: 1, borderColor: c.border, alignItems: 'center', paddingTop: 8, overflow: 'hidden',
  },
  colis: {
    width: TAILLE_COLIS, height: TAILLE_COLIS, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  colisExpress: { borderWidth: 4, borderColor: OR },
  pastilleExpress: {
    position: 'absolute', top: -10, right: -10, width: 24, height: 24, borderRadius: 12,
    backgroundColor: OR, alignItems: 'center', justifyContent: 'center',
  },
  retour: { position: 'absolute', top: '40%', fontSize: 26, fontWeight: '800' },
  sol: { position: 'absolute', left: 16, right: 16, bottom: 6, height: 2, borderRadius: 1, backgroundColor: c.borderStrong },
  zones: { flexDirection: 'row', gap: 10 },
  zone: { flex: 1, height: 96, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  zoneTexte: { color: '#fff', fontWeight: '700', fontSize: 13, marginTop: 4 },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  records: { marginTop: 6, marginBottom: 4 },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
