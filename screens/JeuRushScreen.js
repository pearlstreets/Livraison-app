/**
 * Mini-jeu « Rush en ville », pour patienter entre deux courses.
 *
 * Course sans fin en 3D dans une rue de ville (Three.js dans une WebView,
 * page : utils/jeuRush3dPage.js). Gestes : glisser à gauche ou à droite pour
 * changer de voie, vers le haut pour sauter, vers le bas pour glisser. Colis
 * (10 points, doré 50), cinq bonus (turbo, super saut, points x2, aimant,
 * casque), vitesse qui monte, fin au premier obstacle sans casque.
 *
 * Cet écran garde le cadre : pause, accueil, fin, record et classement.
 * Haut d'écran : barre, bandeau classement (rang et record à gauche, TOP 1 à
 * droite), HUD commun avec compteur de colis « ramassés / vus » et jauges des
 * bonus (components/HudJeu.js). Musique du jeu « rush » et bruitages joués
 * dans la page, réglables dans l'écran Jeux (utils/sonJeux.js).
 * Sauvegarde : l'état de la course est mémorisé en pause, « Reprendre ou
 * Recommencer » à la réouverture dans les 24 h, jamais après une partie perdue.
 * Pause automatique (hooks/usePauseJeu.js), flèche retour comprise.
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
import SonJeux, { jouerSon } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import ReprisePartie from '../components/ReprisePartie';
import BandeauClassement from '../components/BandeauClassement';
import HudJeu from '../components/HudJeu';
import IndiceGestes from '../components/IndiceGestes';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';
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
// Bonus de la page : icône et couleur de la jauge dans le HUD.
const BONUS_HUD = {
  turbo: { icone: 'flash', couleur: '#FF7A1A' },
  saut: { icone: 'arrow-up-circle', couleur: '#34D058' },
  x2: { icone: 'star', couleur: '#E0A800' },
  aimant: { icone: 'magnet', couleur: '#E5383B' },
  casque: { icone: 'shield-checkmark', couleur: '#2D7FF9' },
};

export default function JeuRushScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const idLivreur = user?.id;
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | choc | fin
  const phaseRef = useRef('accueil');
  const [affiche, setAffiche] = useState({ score: 0, colis: 0, total: 0, palier: 0, boosters: [] });
  const [reprise, setReprise] = useState(null); // sauvegarde trouvée à l'ouverture
  const [rafraichir, setRafraichir] = useState(0); // relance le bandeau classement
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
    const base = { score: s, distance: Math.floor(Number(m.distance) || 0), colis: Number(m.pieces) || 0, total: Number(m.total) || 0, palier: Number(m.palier) || 1, nouveauRecord: false };
    setResultat(base);
    setAffiche((p) => ({ ...p, score: s, boosters: [] }));
    effacerPartie(JEU, idLivreur);
    jouerSon('perdu');
    finDePartie(JEU, idLivreur, s).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setRafraichir((k) => k + 1);
      if (r.nouveauRecord) jouerSon('record');
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
      const tot = Number(m.total) || 0;
      const pal = Number(m.palier) || 0;
      const bon = Array.isArray(m.boosters) ? m.boosters.filter((b) => BONUS_HUD[b?.id]).map((b) => ({
        id: b.id, ...BONUS_HUD[b.id], ratio: Math.max(0, Math.min(1, Number(b.ratio) || 0)),
      })) : [];
      setAffiche((p) => {
        const memeBonus = p.boosters.length === bon.length && p.boosters.every((b, i) => b.id === bon[i].id && Math.abs(b.ratio - bon[i].ratio) < 0.03);
        return p.score === s && p.colis === n && p.total === tot && p.palier === pal && memeBonus
          ? p : { score: s, colis: n, total: tot, palier: pal, boosters: memeBonus ? p.boosters : bon };
      });
    } else if (m.t === 'etat' && (phaseRef.current === 'pause' || phaseRef.current === 'jeu')) {
      // Course mémorisée (pause, nouveau palier) : reprise possible pendant 24 h.
      sauverPartie(JEU, idLivreur, {
        etat: m, score: Math.floor((Number(m.points) || 0) + (Number(m.ptsDist) || 0)), niveau: (Number(m.palier) || 0) + 1,
      });
    } else if (m.t === 'palier') {
      montrerBanniere(Number(m.palier) || 0);
      jouerSon('niveau');
    }
    else if (m.t === 'fin' && phaseRef.current === 'jeu') terminer(m);
  }, [idLivreur, montrerBanniere, synchroSon, terminer]);

  // etat : sauvegarde à reprendre (objet), ou rien pour une nouvelle course.
  const jouer = useCallback((etat) => {
    if (charge !== 'pret') return;
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    const reprend = etat && typeof etat === 'object' && etat.t === 'etat';
    if (!reprend) effacerPartie(JEU, idLivreur);
    setReprise(null);
    setResultat(null);
    setClassementOuvert(false);
    setAffiche({ score: reprend ? Math.floor((Number(etat.points) || 0) + (Number(etat.ptsDist) || 0)) : 0, colis: 0, total: 0, palier: reprend ? Number(etat.palier) || 0 : 0, boosters: [] });
    montrerBanniere(reprend ? Number(etat.palier) || 0 : 0);
    changerPhase('jeu');
    injecter(`window.sonJeu&&window.sonJeu.reveil();window.jeu&&window.jeu.demarrer(${reprend ? JSON.stringify(etat) : ''})`);
  }, [charge, changerPhase, idLivreur, injecter, montrerBanniere]);
  const jouerNeuf = useCallback(() => jouer(), [jouer]);
  const reprendreSauvegarde = useCallback(() => { if (reprise?.etat) jouer(reprise.etat); }, [jouer, reprise]);
  const recommencerSauvegarde = useCallback(() => { effacerPartie(JEU, idLivreur); setReprise(null); jouer(); }, [idLivreur, jouer]);

  useEffect(() => {
    let vivant = true;
    chargerPartie(JEU, idLivreur).then((d) => {
      if (vivant && d?.etat && phaseRef.current === 'accueil') setReprise(d);
    }).catch(() => {});
    return () => { vivant = false; };
  }, [idLivreur]);

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
      <SonJeux jeu={JEU} actif={false} />
      {/* Barre du haut : quitter, pause */}
      <View style={styles.haut}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.infos} />
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

      {/* Classement (rang et record, TOP 1) puis HUD commun */}
      <BandeauClassement
        jeu={JEU}
        idLivreur={idLivreur}
        score={affiche.score}
        rafraichir={rafraichir}
        t={t}
        colors={colors}
        style={styles.bandeau}
      />
      <View pointerEvents="none" style={styles.hudLigne}>
        <HudJeu
          colors={colors}
          score={affiche.score}
          niveauLibelle={t('jeuxRushPalier', { n: affiche.palier + 1 })}
          objets={{ n: affiche.colis, total: affiche.total, icone: 'cube' }}
          boosters={affiche.boosters}
        />
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
        <IndiceGestes jeu={JEU} actif={phase === 'jeu'} gestes={['gauche', 'droite', 'haut', 'bas']} t={t} colors={colors} />
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

      {/* Fenêtres : reprise, accueil, pause, fin */}
      {phase === 'accueil' && reprise && charge === 'pret' && !classementOuvert && (
        <ReprisePartie
          t={t}
          colors={colors}
          niveau={reprise.niveau > 0 ? reprise.niveau : null}
          score={reprise.score}
          onReprendre={reprendreSauvegarde}
          onRecommencer={recommencerSauvegarde}
        />
      )}
      {(phase === 'accueil' || phase === 'pause' || phase === 'fin') && !classementOuvert && !(phase === 'accueil' && reprise && charge === 'pret') && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <MaterialCommunityIcons name="run-fast" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxRushTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxRushRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxRushBonus')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} compact />
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouerNeuf} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: affiche.score })}</Text>
                <ReglagesSon t={t} colors={colors} compact />
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxRushRejouer')} onPress={jouerNeuf} />
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
                  {t('jeuxRushDistance', { n: resultat.distance })}  ·  {t('jeuxRushColis', { n: resultat.total > 0 ? `${resultat.colis} / ${resultat.total}` : resultat.colis })}  ·  {t('jeuxRushPalier', { n: resultat.palier })}
                </Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxRushRejouer')} onPress={jouerNeuf} />
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
  bandeau: { marginTop: 10 },
  hudLigne: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  banniere: {
    position: 'absolute', alignSelf: 'center', top: '22%', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 16,
    backgroundColor: 'rgba(12,28,56,0.78)', borderWidth: 2, alignItems: 'center', maxWidth: '90%',
  },
  banniereTitre: { color: '#fff', fontSize: 24, fontWeight: '900' },
  vue: { flex: 1, backgroundColor: '#7EC8FF' },
  chargement: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,28,56,0.35)' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(231,76,60,0.35)' },
  piste: {
    flex: 1, marginTop: 14, borderRadius: 18, overflow: 'hidden', direction: 'ltr',
    borderWidth: 1, borderColor: c.border,
  },
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
