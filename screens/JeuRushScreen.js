/**
 * Mini-jeu « Rush en ville », pour patienter entre deux courses.
 *
 * Course sans fin en 3D dans une rue de ville (Three.js dans une WebView,
 * page : utils/jeuRush3dPage.js). Gestes : glisser à gauche ou à droite pour
 * changer de voie, vers le haut pour sauter, vers le bas pour glisser. Colis
 * (10 points, doré 50), sept bonus (turbo, super saut, points x2, aimant,
 * casque, ralenti, colis en or), difficulté qui monte tout au long de la
 * course (utils/jeuRushDifficulte.js). Voitures et passants à éviter : un
 * choc lance une poursuite de police de 10 s (jauge discrète en haut à
 * gauche), un deuxième choc pendant la poursuite fait arrêter le livreur et
 * finit la partie (utils/jeuRushPolice.js). Le casque encaisse un choc.
 *
 * Cet écran garde le cadre : pause, accueil, fin, record et classement.
 * Haut d'écran : barre, bandeau classement (rang et record à gauche, TOP 1 à
 * droite), HUD commun avec compteur de colis « ramassés / vus » et jauges des
 * bonus (components/HudJeu.js). Annonces (palier, bonus, séries, points) :
 * toujours en haut de la piste, jamais au milieu. Musique du jeu « rush » et bruitages joués
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
import { BanniereRecompense, EtoilesFin, creerSuivi, suivreScore, etoilesPour, formaterNombre } from '../components/RecompensesJeu';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
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
const SCORE_MAX = 2000000; // Plafond serveur du score Rush (DeliveryApp/views_jeux.py)
const OR = '#F2B705';
// Bonus de la page : icône et couleur de la jauge dans le HUD.
const BONUS_HUD = {
  turbo: { icone: 'flash', couleur: '#FF7A1A' },
  saut: { icone: 'arrow-up-circle', couleur: '#34D058' },
  x2: { icone: 'star', couleur: '#E0A800' },
  aimant: { icone: 'magnet', couleur: '#E5383B' },
  casque: { icone: 'shield-checkmark', couleur: '#2D7FF9' },
  ralenti: { icone: 'hourglass', couleur: '#22B8CF' },
  or: { icone: 'cube', couleur: '#F2B705' },
};
// Scores annoncés en grand pendant la course.
const PALIERS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
const CLE_BONUS = {
  turbo: 'jeuRecompTurbo', saut: 'jeuRecompSaut', x2: 'jeuRecompX2', aimant: 'jeuRecompAimant', casque: 'jeuRecompCasque',
  ralenti: 'jeuxRushBonusRalenti', or: 'jeuxRushBonusOr',
};
// Annonces en haut de la piste : palier tout en haut, bonus et séries juste dessous.
const HAUT_BANNIERE = 6;
const HAUT_RECOMPENSE = 50;
const BLEU_POLICE = '#2D7FF9';

export default function JeuRushScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const idLivreur = user?.id;
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | choc | fin
  const phaseRef = useRef('accueil');
  const [affiche, setAffiche] = useState({ score: 0, colis: 0, total: 0, palier: 0, boosters: [], police: 0, policeS: 0 });
  const [reprise, setReprise] = useState(null); // sauvegarde trouvée à l'ouverture
  const [rafraichir, setRafraichir] = useState(0); // relance le bandeau classement
  const [meilleur, setMeilleur] = useState(0);
  const meilleurRef = useRef(0);
  meilleurRef.current = meilleur;
  const suiviRef = useRef(null);
  const recompRef = useRef(null);
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
    const s = Math.min(SCORE_MAX, Math.max(0, Math.floor(Number(m.score) || 0)));
    const base = { score: s, distance: Math.floor(Number(m.distance) || 0), colis: Number(m.pieces) || 0, total: Number(m.total) || 0, palier: Number(m.palier) || 1, nouveauRecord: false, etoiles: etoilesPour(s, meilleurRef.current, PALIERS) };
    suiviRef.current = null;
    recompRef.current?.cacher();
    setResultat(base);
    setAffiche((p) => ({ ...p, score: s, boosters: [], police: 0, policeS: 0 }));
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
      const pol = Math.max(0, Math.min(1, Number(m.police) || 0));
      const polS = Math.max(0, Math.floor(Number(m.policeS) || 0));
      const annonce = suivreScore(suiviRef.current, s);
      if (annonce?.type === 'record') {
        recompRef.current?.montrer({ texte: t('jeuRecompRecord'), icone: 'trophy', couleur: OR });
        jouerSon('record');
      } else if (annonce) {
        recompRef.current?.montrer({ texte: t('jeuRecompPalier', { n: formaterNombre(annonce.n) }), icone: 'ribbon', couleur: OR });
      }
      const bon = Array.isArray(m.boosters) ? m.boosters.filter((b) => BONUS_HUD[b?.id]).map((b) => ({
        id: b.id, ...BONUS_HUD[b.id], ratio: Math.max(0, Math.min(1, Number(b.ratio) || 0)),
      })) : [];
      setAffiche((p) => {
        const memeBonus = p.boosters.length === bon.length && p.boosters.every((b, i) => b.id === bon[i].id && Math.abs(b.ratio - bon[i].ratio) < 0.03);
        return p.score === s && p.colis === n && p.total === tot && p.palier === pal && memeBonus && p.police === pol && p.policeS === polS
          ? p : { score: s, colis: n, total: tot, palier: pal, boosters: memeBonus ? p.boosters : bon, police: pol, policeS: polS };
      });
    } else if (m.t === 'etat' && (phaseRef.current === 'pause' || phaseRef.current === 'jeu')) {
      // Course mémorisée (pause, nouveau palier) : reprise possible pendant 24 h.
      sauverPartie(JEU, idLivreur, {
        etat: m, score: Math.floor((Number(m.points) || 0) + (Number(m.ptsDist) || 0)), niveau: (Number(m.palier) || 0) + 1,
      });
    } else if (m.t === 'serie' && phaseRef.current === 'jeu') {
      recompRef.current?.montrer({ texte: t('jeuRecompSerie', { n: Number(m.n) || 0 }), icone: 'flame', couleur: '#FF7A1A' });
    } else if (m.t === 'bonus' && phaseRef.current === 'jeu' && CLE_BONUS[m.id]) {
      recompRef.current?.montrer({ texte: t(CLE_BONUS[m.id]), icone: BONUS_HUD[m.id].icone, couleur: BONUS_HUD[m.id].couleur });
    } else if (m.t === 'police' && phaseRef.current === 'jeu') {
      // Poursuite de police : annonces en haut de la piste.
      if (m.etat === 'poursuite') {
        vibrer();
        recompRef.current?.montrer({ texte: t('jeuxRushPolice'), icone: 'car-sport', couleur: BLEU_POLICE });
      } else if (m.etat === 'abandon') {
        recompRef.current?.montrer({ texte: t('jeuxRushPoliceAbandon'), icone: 'happy', couleur: '#0BB58E' });
      } else if (m.etat === 'arrete') {
        // Arrêté : la sauvegarde est effacée tout de suite, fermer le jeu pendant la scène n'annule rien.
        effacerPartie(JEU, idLivreur);
        vibrer();
        recompRef.current?.montrer({ texte: t('jeuxRushArrete'), icone: 'hand-left', couleur: '#E8433A' });
      }
    } else if (m.t === 'palier') {
      montrerBanniere(Number(m.palier) || 0);
      jouerSon('niveau');
    }
    else if (m.t === 'fin' && phaseRef.current === 'jeu') terminer(m);
  }, [idLivreur, montrerBanniere, synchroSon, t, terminer]);

  // etat : sauvegarde à reprendre (objet), ou rien pour une nouvelle course.
  const jouer = useCallback((etat) => {
    if (charge !== 'pret') return;
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    const reprend = etat && typeof etat === 'object' && etat.t === 'etat';
    if (!reprend) effacerPartie(JEU, idLivreur);
    setReprise(null);
    setResultat(null);
    setClassementOuvert(false);
    const depart = reprend ? Math.floor((Number(etat.points) || 0) + (Number(etat.ptsDist) || 0)) : 0;
    suiviRef.current = creerSuivi(PALIERS, meilleurRef.current, depart);
    recompRef.current?.cacher();
    setAffiche({ score: reprend ? Math.floor((Number(etat.points) || 0) + (Number(etat.ptsDist) || 0)) : 0, colis: 0, total: 0, palier: reprend ? Number(etat.palier) || 0 : 0, boosters: [], police: 0, policeS: 0 });
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
        {phase === 'jeu' && affiche.police > 0 && (
          <View pointerEvents="none" style={styles.police}>
            <Ionicons name="car-sport" size={14} color="#fff" />
            <View style={styles.policeBarre}>
              <View style={[styles.policeReste, { width: `${Math.round(affiche.police * 100)}%` }]} />
            </View>
            <Text style={styles.policeTexte}>{t('jeuxRushPoliceSecondes', { n: affiche.policeS })}</Text>
          </View>
        )}
        <BanniereRecompense ref={recompRef} haut={HAUT_RECOMPENSE} />
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
                <EtoilesFin n={resultat.etoiles} t={t} colors={colors} />
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
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
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
    position: 'absolute', alignSelf: 'center', top: HAUT_BANNIERE, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(12,28,56,0.78)', borderWidth: 2, alignItems: 'center', maxWidth: '70%',
  },
  banniereTitre: { color: '#fff', fontSize: 18, fontWeight: '900' },
  vue: { flex: 1, backgroundColor: '#7EC8FF' },
  chargement: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,28,56,0.35)' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(231,76,60,0.35)' },
  // Jauge discrète de la poursuite, en haut à gauche de la piste.
  police: {
    position: 'absolute', top: 6, left: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(31,60,143,0.82)',
  },
  policeBarre: { width: 46, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6, overflow: 'hidden' },
  policeReste: { height: 5, borderRadius: 3, backgroundColor: '#4DA3FF' },
  policeTexte: { color: '#fff', fontSize: 12, fontWeight: '800' },
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
