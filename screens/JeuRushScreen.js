/**
 * Mini-jeu « Rush en ville », pour patienter entre deux courses.
 *
 * Course sans fin en 3D dans un monde de plateformes coloré (Three.js dans une
 * WebView, page : utils/jeuRush3dPage.js). Glisser le doigt à gauche ou à
 * droite pour déplacer le livreur, vers le haut pour sauter. Pièces (10
 * points), étoiles (50 points), vitesse qui monte, fin au premier obstacle.
 *
 * Cet écran garde le cadre : score, pause, accueil, fin, record et
 * classement. Musique de fond et bruitages joués dans la page, réglables
 * dans l'écran Jeux (utils/sonJeux.js). Pause automatique (hooks/usePauseJeu.js),
 * flèche retour comprise pendant la partie. Panneaux Pearl Streets le long de
 * la piste (utils/jeuRush3dPage.js).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import { PAGE_RUSH_3D } from '../utils/jeuRush3dPage';
import { chargerReglagesSon, ecouterReglagesSon, reglagesSon } from '../utils/sonJeux';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer() {
  try {
    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Error)?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'rush';
const OR = '#F2B705';

export default function JeuRushScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const idLivreur = user?.id;
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | choc | fin
  const phaseRef = useRef('accueil');
  const [affiche, setAffiche] = useState({ score: 0, colis: 0, palier: 0 });
  const [meilleur, setMeilleur] = useState(0);
  const [resultat, setResultat] = useState(null); // { score, distance, colis, palier, nouveauRecord }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [charge, setCharge] = useState('chargement'); // chargement | pret | erreur
  const [cle, setCle] = useState(0); // recharge la page après une erreur
  const vueRef = useRef(null);
  const minuteurFinRef = useRef(null);
  const monteRef = useRef(true);
  const [banniere, setBanniere] = useState(-1);
  const banniereOpacite = useRef(new Animated.Value(0)).current;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  const injecter = useCallback((code) => {
    try { vueRef.current?.injectJavaScript(`${code};true;`); } catch { /* rien */ }
  }, []);

  const synchroSon = useCallback(() => {
    injecter(`window.sonJeu&&(window.sonJeu.reglages(${JSON.stringify(reglagesSon())}),window.sonJeu.musique(${phaseRef.current === 'jeu' ? 'true' : 'false'}))`);
  }, [injecter]);

  useEffect(() => {
    monteRef.current = true;
    chargerRecord(JEU, idLivreur).then((r) => { if (monteRef.current) setMeilleur(r.meilleur); });
    envoyerRecordEnAttente(JEU, idLivreur).catch(() => {});
    chargerReglagesSon().then(synchroSon);
    const stop = ecouterReglagesSon(synchroSon);
    return () => {
      monteRef.current = false;
      stop();
      if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    };
  }, [idLivreur, synchroSon]);

  useEffect(() => { synchroSon(); }, [phase, synchroSon]);

  const montrerBanniere = useCallback((palier) => {
    setBanniere(palier);
    banniereOpacite.stopAnimation();
    banniereOpacite.setValue(0);
    Animated.sequence([
      Animated.timing(banniereOpacite, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(banniereOpacite, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [banniereOpacite]);

  const terminer = useCallback((m) => {
    vibrer();
    changerPhase('choc');
    const s = Math.max(0, Math.floor(Number(m.score) || 0));
    const base = { score: s, distance: Math.floor(Number(m.distance) || 0), colis: Number(m.pieces) || 0, palier: Number(m.palier) || 1, nouveauRecord: false };
    setResultat(base);
    setAffiche((p) => ({ ...p, score: s }));
    finDePartie(JEU, idLivreur, s).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setResultat({ ...base, nouveauRecord: r.nouveauRecord });
    }).catch(() => {});
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    minuteurFinRef.current = setTimeout(() => {
      if (monteRef.current && phaseRef.current === 'choc') changerPhase('fin');
    }, 800);
  }, [changerPhase, idLivreur]);

  const surMessage = useCallback((ev) => {
    let m = null;
    try { m = JSON.parse(ev.nativeEvent.data); } catch { return; }
    if (!m) return;
    if (m.t === 'pret') { setCharge('pret'); synchroSon(); } else if (m.t === 'erreur') setCharge('erreur');
    else if (m.t === 'score' && phaseRef.current === 'jeu') {
      const s = Number(m.score) || 0;
      const n = Number(m.pieces) || 0;
      const pal = Number(m.palier) || 0;
      setAffiche((p) => (p.score === s && p.colis === n && p.palier === pal ? p : { score: s, colis: n, palier: pal }));
    } else if (m.t === 'palier') montrerBanniere(Number(m.palier) || 0);
    else if (m.t === 'fin' && phaseRef.current === 'jeu') terminer(m);
  }, [montrerBanniere, synchroSon, terminer]);

  const jouer = useCallback(() => {
    if (charge !== 'pret') return;
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    setResultat(null);
    setClassementOuvert(false);
    setAffiche({ score: 0, colis: 0, palier: 0 });
    montrerBanniere(0);
    changerPhase('jeu');
    injecter('window.sonJeu&&window.sonJeu.reveil();window.jeu&&window.jeu.demarrer()');
  }, [charge, changerPhase, injecter, montrerBanniere]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    injecter('window.jeu&&window.jeu.pause()');
    changerPhase('pause');
  }, [changerPhase, injecter]);

  const reprendre = useCallback(() => {
    if (phaseRef.current !== 'pause') return;
    changerPhase('jeu');
    injecter('window.jeu&&window.jeu.reprendre()');
  }, [changerPhase, injecter]);

  const estEnJeu = useCallback(() => phaseRef.current === 'jeu', []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation, enJeu: phase === 'jeu' || (classementOuvert && phase === 'pause'), estEnJeu, fermerPanneau,
  });

  const quitter = useCallback(() => {
    pause();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [navigation, pause]);

  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [fermerAlerte, navigation, pause]);

  const reessayer = useCallback(() => { setCharge('chargement'); setCle((k) => k + 1); }, []);

  return (
    <View style={[styles.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      {/* Barre du haut : quitter, score, pièces, pause */}
      <View style={styles.haut}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.infos}>
          <Text style={styles.titreJeu} numberOfLines={1}>{t('jeuScore', { n: affiche.score })}</Text>
          <View style={styles.ligneColis}>
            <MaterialCommunityIcons name="circle-multiple" size={15} color={OR} />
            <Text style={styles.sousTitre}>{affiche.colis}</Text>
            <Text style={styles.palierHud} numberOfLines={1}>{t('jeuxRushPalier', { n: affiche.palier + 1 })}</Text>
          </View>
        </View>
        <Pressable
          onPress={pause}
          disabled={phase !== 'jeu'}
          style={[styles.rond, styles.rondPause, phase !== 'jeu' && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityLabel={t('jeuPause')}
        >
          <Ionicons name="pause" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Le monde en 3D */}
      <View style={styles.piste}>
        <WebView
          key={cle}
          ref={vueRef}
          originWhitelist={['*']}
          source={{ html: PAGE_RUSH_3D, baseUrl: 'https://localhost/' }}
          onMessage={surMessage}
          onError={() => setCharge('erreur')}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          style={styles.vue}
        />
        {charge === 'chargement' && (
          <View style={styles.chargement} pointerEvents="none">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {banniere >= 0 && (
          <Animated.View pointerEvents="none" style={[styles.banniere, { opacity: banniereOpacite, borderColor: OR }]}>
            <Text style={styles.banniereTitre}>{t('jeuxRushPalier', { n: banniere + 1 })}</Text>
          </Animated.View>
        )}
        {phase === 'choc' && <View pointerEvents="none" style={styles.flash} />}
      </View>

      {charge === 'erreur' && phase !== 'jeu' && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            <Ionicons name="cloud-offline" size={44} color={BRAND} />
            <Text style={styles.texte}>{t('jeuxRushHorsLigne')}</Text>
            <Bouton styles={styles} texte={t('jeuxRushRejouer')} onPress={reessayer} />
            <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
          </View>
        </View>
      )}

      {/* Fenêtres : accueil, pause, fin */}
      {(phase === 'accueil' || phase === 'pause' || phase === 'fin') && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <MaterialCommunityIcons name="run-fast" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxRushTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxRushRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxRushBonus')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: affiche.score })}</Text>
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxRushRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && resultat && (
              <>
                <Ionicons name={resultat.nouveauRecord ? 'trophy' : 'alert-circle'} size={44} color={resultat.nouveauRecord ? OR : colors.danger} />
                <Text style={styles.titre}>{resultat.nouveauRecord ? t('jeuxRushNouveauRecord') : t('jeuxRushChoc')}</Text>
                <Text style={styles.texteFort}>{t('jeuScore', { n: resultat.score })}</Text>
                <Text style={styles.texteDiscret}>
                  {t('jeuxRushDistance', { n: resultat.distance })}  ·  {t('jeuxRushPieces', { n: resultat.colis })}  ·  {t('jeuxRushPalier', { n: resultat.palier })}
                </Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxRushRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {/* Classement : jamais ouvert pendant une partie. */}
      {classementOuvert && phase !== 'jeu' && phase !== 'choc' && (
        <View style={styles.voile}>
          <ClassementJeu
            jeu={JEU}
            t={t}
            colors={colors}
            dark={dark}
            avantChargement={() => envoyerRecordEnAttente(JEU, idLivreur)}
            onFermer={() => setClassementOuvert(false)}
          />
        </View>
      )}
      {alerteCourse && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            <Ionicons name="bicycle" size={44} color={BRAND} />
            <Text style={styles.titre}>{t('jeuNouvelleCourse')}</Text>
            <Text style={styles.texte}>{t('jeuNouvelleCourseTexte')}</Text>
            <Bouton styles={styles} texte={t('jeuVoirCourse')} onPress={voirCourse} />
            <Bouton styles={styles} secondaire texte={t('jeuResterIci')} onPress={fermerAlerte} />
          </View>
        </View>
      )}
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
  haut: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  infos: { flex: 1 },
  titreJeu: { color: c.text, fontSize: 17, fontWeight: '800' },
  ligneColis: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sousTitre: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
  palierHud: { color: c.textMuted, fontSize: 12, fontWeight: '700', marginLeft: 10, flexShrink: 1 },
  banniere: {
    position: 'absolute', alignSelf: 'center', top: '22%', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.62)', borderWidth: 2, alignItems: 'center', maxWidth: '90%',
  },
  banniereTitre: { color: '#fff', fontSize: 24, fontWeight: '900' },
  banniereZone: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },
  pastilleAimant: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 10, backgroundColor: '#E74C3C', flexShrink: 1,
  },
  pastilleAimantTexte: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  vue: { flex: 1, backgroundColor: '#7EC8FF' },
  chargement: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(231,76,60,0.35)' },
  piste: {
    flex: 1, marginTop: 14, borderRadius: 18, overflow: 'hidden', direction: 'ltr',
    borderWidth: 1, borderColor: c.border,
  },
  calque: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  trottoir: { position: 'absolute', top: 0, bottom: 0, backgroundColor: dark ? '#4B4F57' : '#C9CDD3' },
  trait: { position: 'absolute', width: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  bordure: { position: 'absolute', width: 3, backgroundColor: dark ? '#6B7079' : '#E9ECEF' },
  objet: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  colis: {
    backgroundColor: '#E0A96D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#B37B3F',
  },
  colisExpress: { backgroundColor: OR, borderColor: '#fff' },
  bonus: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E74C3C' },
  voiture: {
    flex: 1, alignSelf: 'stretch', borderRadius: 12, alignItems: 'center', paddingHorizontal: '14%',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  vitre: { alignSelf: 'stretch', borderRadius: 4, backgroundColor: 'rgba(20,30,45,0.75)' },
  toit: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)' },
  feux: { position: 'absolute', bottom: 4, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' },
  feu: { width: 10, height: 5, borderRadius: 2, backgroundColor: '#FFE08A' },
  barriere: {
    flex: 1, alignSelf: 'stretch', flexDirection: 'row', borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: '#B71C1C',
  },
  rayure: { flex: 1 },
  echafaudage: { flex: 1, alignSelf: 'stretch' },
  poutre: { height: 10, flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
  pieds: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  pied: { width: 5, backgroundColor: '#9AA0A6' },
  tuile: { flex: 1, alignSelf: 'stretch', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tuilePlot: { borderRadius: 0 },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteFort: { color: c.text, fontSize: 19, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
