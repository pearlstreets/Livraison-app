/**
 * Mini-jeu « Mémoire du livreur », pour patienter entre deux courses.
 *
 * Jeu de paires : les cartes sont posées face cachée, le livreur en retourne
 * deux ; même motif = elles restent visibles, sinon elles se recachent après
 * un court instant. Niveaux enchaînés, facile au début (2 paires), puis de
 * plus en plus de cartes et un chrono de plus en plus serré ; dans les
 * niveaux hauts, les cartes cachées bougent après une erreur et les motifs se
 * ressemblent. Chrono à zéro = fin de partie.
 *
 * Logique pure dans utils/jeuMemoire.js. Pause automatique
 * (hooks/usePauseJeu.js) : arrière-plan, écran quitté, flèche retour pendant
 * la partie, nouvelle course ; le chrono s'arrête et les cartes sont masquées
 * pendant la pause. Aucun son. Décor : la ville et le panneau Pearl Streets
 * (components/FondJeu.js).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import FondJeu, { reserveBasVille } from '../components/FondJeu';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  parametresNiveau, creerDonne, creerAlea, estPaire, melangerCachees, pointsPaire, bonusNiveau, dispositionGrille,
} from '../utils/jeuMemoire';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(fort) {
  try {
    if (!Haptics) return;
    const promesse = fort
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'memoire';
const OR = '#F2B705';
const VERT = '#2ecc71';
const ROUGE = '#e74c3c';
const ECART = 10;
const PAS_CHRONO = 100; // ms entre deux mises à jour du chrono
const DUREE_RETOURNEMENT = 280;

export default function JeuMemoireScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: largeurEcran } = useWindowDimensions();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil, jeu, palier, pause, fin
  const phaseRef = useRef('accueil');
  const [niveau, setNiveau] = useState(1);
  const [cartes, setCartes] = useState([]);
  const [retournees, setRetournees] = useState([]);
  const [score, setScore] = useState(0);
  const [meilleur, setMeilleur] = useState(0);
  const [secondes, setSecondes] = useState(() => parametresNiveau(1).duree);
  const [zone, setZone] = useState({ l: 0, h: 0 });
  const [palier, setPalier] = useState(null); // { niveau, paires, points, temps, sansErreur, suivant }
  const [resultat, setResultat] = useState(null); // { score, niveau, paires, nouveauRecord }
  const [bulles, setBulles] = useState([]);
  const [classementOuvert, setClassementOuvert] = useState(false);

  const monteRef = useRef(true);
  const cartesRef = useRef([]);
  const retourneesRef = useRef([]);
  const niveauRef = useRef(1);
  const paramsRef = useRef(parametresNiveau(1));
  const scoreRef = useRef(0);
  const pointsNiveauRef = useRef(0);
  const erreursRef = useRef(0);
  const pairesTotalRef = useRef(0);
  const restantRef = useRef(0); // ms
  const dernierTicRef = useRef(null);
  const chronoRef = useRef(null);
  const verrouRef = useRef(false);
  const minuteurErreurRef = useRef(null);
  const aleaRef = useRef(creerAlea(Date.now()));
  const idBulleRef = useRef(0);
  const termineRef = useRef(false);

  const progression = useRef(new Animated.Value(1)).current;
  const secousse = useRef(new Animated.Value(1)).current;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  const majCartes = useCallback((liste) => {
    cartesRef.current = liste;
    if (monteRef.current) setCartes(liste);
  }, []);

  const majRetournees = useCallback((liste) => {
    retourneesRef.current = liste;
    if (monteRef.current) setRetournees(liste);
  }, []);

  const majScore = useCallback((s) => {
    scoreRef.current = s;
    if (monteRef.current) setScore(s);
  }, []);

  const ajouterBulle = useCallback((texte, couleur) => {
    if (!monteRef.current) return;
    idBulleRef.current += 1;
    const id = idBulleRef.current;
    setBulles((b) => [...b.slice(-2), { id, texte, couleur }]);
  }, []);
  const retirerBulle = useCallback((id) => {
    if (monteRef.current) setBulles((b) => b.filter((x) => x.id !== id));
  }, []);

  // Chrono : décompte réel (Date.now), arrêté hors de la phase « jeu ».
  const arreterChrono = useCallback(() => {
    if (chronoRef.current) clearInterval(chronoRef.current);
    chronoRef.current = null;
    if (dernierTicRef.current != null) {
      restantRef.current = Math.max(0, restantRef.current - (Date.now() - dernierTicRef.current));
    }
    dernierTicRef.current = null;
  }, []);

  const afficherChrono = useCallback(() => {
    const duree = paramsRef.current.duree * 1000;
    progression.setValue(duree > 0 ? restantRef.current / duree : 0);
    const s = Math.ceil(restantRef.current / 1000);
    if (monteRef.current) setSecondes((x) => (x === s ? x : s));
  }, [progression]);

  const annulerErreurEnCours = useCallback(() => {
    if (minuteurErreurRef.current) clearTimeout(minuteurErreurRef.current);
    minuteurErreurRef.current = null;
    verrouRef.current = false;
  }, []);

  const terminer = useCallback(() => {
    if (termineRef.current) return;
    termineRef.current = true;
    arreterChrono();
    annulerErreurEnCours();
    restantRef.current = 0;
    afficherChrono();
    vibrer(true);
    const res = { score: scoreRef.current, niveau: niveauRef.current, paires: pairesTotalRef.current, nouveauRecord: false };
    if (monteRef.current) setResultat(res);
    changerPhase('fin');
    finDePartie(JEU, user?.id, res.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setResultat((x) => (x ? { ...x, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [afficherChrono, annulerErreurEnCours, arreterChrono, changerPhase, user?.id]);

  const tic = useCallback(() => {
    const maintenant = Date.now();
    if (dernierTicRef.current != null) restantRef.current -= maintenant - dernierTicRef.current;
    dernierTicRef.current = maintenant;
    if (restantRef.current <= 0) {
      restantRef.current = 0;
      afficherChrono();
      terminer();
      return;
    }
    afficherChrono();
  }, [afficherChrono, terminer]);

  const demarrerChrono = useCallback(() => {
    if (chronoRef.current) return;
    dernierTicRef.current = Date.now();
    chronoRef.current = setInterval(tic, PAS_CHRONO);
  }, [tic]);

  const demarrerNiveau = useCallback((n) => {
    arreterChrono();
    annulerErreurEnCours();
    const p = parametresNiveau(n);
    niveauRef.current = n;
    paramsRef.current = p;
    erreursRef.current = 0;
    pointsNiveauRef.current = 0;
    restantRef.current = p.duree * 1000;
    majRetournees([]);
    majCartes(creerDonne(n, Math.floor(aleaRef.current() * 1e9) + 1));
    if (monteRef.current) {
      setNiveau(n);
      setPalier(null);
      setBulles([]);
    }
    afficherChrono();
    changerPhase('jeu');
    demarrerChrono();
  }, [afficherChrono, annulerErreurEnCours, arreterChrono, changerPhase, demarrerChrono, majCartes, majRetournees]);

  const jouer = useCallback(() => {
    termineRef.current = false;
    aleaRef.current = creerAlea(Date.now());
    pairesTotalRef.current = 0;
    majScore(0);
    if (monteRef.current) {
      setResultat(null);
      setClassementOuvert(false);
    }
    demarrerNiveau(1);
  }, [demarrerNiveau, majScore]);

  const finirNiveau = useCallback(() => {
    arreterChrono();
    const n = niveauRef.current;
    const p = paramsRef.current;
    const bonus = bonusNiveau(n, restantRef.current / 1000, erreursRef.current);
    majScore(scoreRef.current + bonus.total);
    vibrer(false);
    const suivant = parametresNiveau(n + 1);
    if (monteRef.current) {
      setPalier({
        niveau: n,
        paires: p.paires,
        points: pointsNiveauRef.current,
        temps: bonus.temps,
        sansErreur: bonus.sansErreur,
        suivant: { niveau: suivant.niveau, paires: suivant.paires, duree: suivant.duree },
      });
    }
    changerPhase('palier');
  }, [arreterChrono, changerPhase, majScore]);

  // Mauvaise paire : les deux cartes se recachent, puis mélange éventuel.
  const recacher = useCallback(() => {
    minuteurErreurRef.current = null;
    verrouRef.current = false;
    majRetournees([]);
    const mode = paramsRef.current.melange;
    if (mode !== 'aucun') {
      const avant = cartesRef.current;
      const apres = melangerCachees(avant, mode, aleaRef.current);
      if (apres !== avant) {
        majCartes(apres);
        ajouterBulle(t('jeuxMemoireMelange'), BRAND);
        secousse.setValue(0.94);
        Animated.spring(secousse, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
      }
    }
  }, [ajouterBulle, majCartes, majRetournees, secousse, t]);

  const retourner = useCallback((id) => {
    if (phaseRef.current !== 'jeu' || verrouRef.current) return;
    const carte = cartesRef.current.find((c) => c.id === id);
    if (!carte || carte.trouvee) return;
    const deja = retourneesRef.current;
    if (deja.includes(id) || deja.length >= 2) return;
    const liste = [...deja, id];
    majRetournees(liste);
    if (liste.length < 2) {
      vibrer(false);
      return;
    }
    const premiere = cartesRef.current.find((c) => c.id === liste[0]);
    if (estPaire(premiere, carte)) {
      const n = niveauRef.current;
      const gain = pointsPaire(n);
      pointsNiveauRef.current += gain;
      pairesTotalRef.current += 1;
      majScore(scoreRef.current + gain);
      const nouvelles = cartesRef.current.map((c) => (c.paire === carte.paire ? { ...c, trouvee: true } : c));
      majCartes(nouvelles);
      majRetournees([]);
      vibrer(false);
      ajouterBulle(`+${gain}`, VERT);
      if (nouvelles.every((c) => c.trouvee)) finirNiveau();
      return;
    }
    erreursRef.current += 1;
    verrouRef.current = true;
    vibrer(true);
    minuteurErreurRef.current = setTimeout(recacher, paramsRef.current.delaiErreur);
  }, [ajouterBulle, finirNiveau, majCartes, majRetournees, majScore, recacher]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    arreterChrono();
    afficherChrono();
    // Une mauvaise paire en cours d'affichage est recachée tout de suite.
    if (minuteurErreurRef.current) {
      clearTimeout(minuteurErreurRef.current);
      recacher();
    } else {
      majRetournees([]);
    }
    changerPhase('pause');
  }, [afficherChrono, arreterChrono, changerPhase, majRetournees, recacher]);
  const estEnJeu = useCallback(() => phaseRef.current === 'jeu', []);
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, { navigation, enJeu: phase === 'jeu', estEnJeu });

  const reprendre = useCallback(() => {
    if (phaseRef.current !== 'pause') return;
    changerPhase('jeu');
    demarrerChrono();
  }, [changerPhase, demarrerChrono]);

  const niveauSuivant = useCallback(() => {
    if (phaseRef.current !== 'palier') return;
    demarrerNiveau(niveauRef.current + 1);
  }, [demarrerNiveau]);

  useEffect(() => {
    let vivant = true;
    chargerRecord(JEU, user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); }).catch(() => {});
    return () => { vivant = false; };
  }, [user?.id]);

  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      if (chronoRef.current) clearInterval(chronoRef.current);
      if (minuteurErreurRef.current) clearTimeout(minuteurErreurRef.current);
    };
  }, []);

  const surMesure = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    setZone((z) => (z.l === l && z.h === h ? z : { l, h }));
  }, []);

  // Quitter en cours de partie : le score déjà gagné compte pour le record.
  const quitter = useCallback(() => {
    const p = phaseRef.current;
    pause();
    if ((p === 'jeu' || p === 'pause' || p === 'palier') && !termineRef.current && scoreRef.current > 0) {
      termineRef.current = true;
      finDePartie(JEU, user?.id, scoreRef.current).catch(() => {});
    }
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [navigation, pause, user?.id]);

  // Rejouer depuis la pause : comme Quitter, le score déjà gagné compte.
  const rejouerPause = useCallback(() => {
    if (!termineRef.current && scoreRef.current > 0) {
      termineRef.current = true;
      finDePartie(JEU, user?.id, scoreRef.current).catch(() => {});
    }
    jouer();
  }, [jouer, user?.id]);

  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [fermerAlerte, navigation, pause]);

  const avantClassement = useCallback(() => envoyerRecordEnAttente(JEU, user?.id), [user?.id]);

  const enJeu = phase === 'jeu';
  const grilleVisible = phase === 'jeu' || phase === 'palier';
  const grille = useMemo(() => dispositionGrille(cartes.length || 4, zone.l, Math.max(0, zone.h - ECART), ECART), [cartes.length, zone]);
  const largeurGrille = grille.colonnes * grille.largeur + (grille.colonnes - 1) * ECART;
  const pressee = secondes <= Math.max(3, Math.ceil(paramsRef.current.duree * 0.25));
  const largeurBarre = progression.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  return (
    <View style={[styles.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      {/* Décor : la ville et le panneau Pearl Streets, sous la grille */}
      <FondJeu variante="ville" dark={dark} bas={insets.bottom} />
      {/* Barre du haut : quitter, niveau et score, pause */}
      <View style={styles.haut}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.pastille}>
          <Text style={styles.pastilleNiveau}>{t('jeuNiveauCourt', { n: niveau })}</Text>
          <View style={styles.pastilleSeparateur} />
          <Ionicons name="star" size={14} color={OR} />
          <Text style={styles.pastilleTexte}>{score}</Text>
        </View>
        <Pressable
          onPress={pause}
          disabled={!enJeu}
          style={[styles.rond, styles.rondPause, !enJeu && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityLabel={t('jeuPause')}
        >
          <Ionicons name="pause" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Chrono du niveau */}
      <View style={styles.chrono}>
        <Ionicons name="time" size={18} color={pressee && enJeu ? ROUGE : colors.textSoft} />
        <View style={styles.barreFond}>
          <Animated.View style={[styles.barre, { width: largeurBarre, backgroundColor: pressee ? ROUGE : BRAND }]} />
        </View>
        <Text style={[styles.chronoTexte, pressee && enJeu && { color: ROUGE }]}>{secondes}</Text>
      </View>

      {/* Cartes (masquées pendant la pause : pas de triche) */}
      <View style={[styles.zone, { marginBottom: Math.max(0, reserveBasVille(largeurEcran) - 4) }]} onLayout={surMesure}>
        {grilleVisible && zone.h > 0 && grille.largeur > 0 && (
          <Animated.View style={[styles.grille, { width: largeurGrille, transform: [{ scale: secousse }] }]}>
            {cartes.map((c, i) => (
              <Carte
                key={c.id}
                carte={c}
                visible={c.trouvee || retournees.includes(c.id)}
                largeur={grille.largeur}
                hauteur={grille.hauteur}
                marge={(i + 1) % grille.colonnes === 0 ? 0 : ECART}
                onRetourner={retourner}
                styles={styles}
              />
            ))}
          </Animated.View>
        )}
        {phase === 'pause' && (
          <View style={styles.cache}>
            <Ionicons name="eye-off" size={40} color={colors.textMuted} />
          </View>
        )}
        <View pointerEvents="none" style={styles.bulles}>
          {bulles.map((b) => (
            <Bulle key={b.id} id={b.id} texte={b.texte} couleur={b.couleur} onFin={retirerBulle} />
          ))}
        </View>
      </View>

      {/* Fenêtres : accueil, palier, pause, fin */}
      {(phase === 'accueil' || phase === 'palier' || phase === 'pause' || phase === 'fin') && !classementOuvert && !alerteCourse && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <Ionicons name="albums" size={46} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxMemoireTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxMemoireRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxMemoireBonus')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'palier' && palier && (
              <>
                <Ionicons name="checkmark-circle" size={46} color={VERT} />
                <Text style={styles.titre}>{t('jeuNiveauReussi', { n: palier.niveau })}</Text>
                <View style={styles.lignes}>
                  <Ligne styles={styles} texte={t('jeuxMemoirePaires', { n: palier.paires })} valeur={`+${palier.points}`} />
                  <Ligne styles={styles} texte={t('jeuxMemoireBonusTemps')} valeur={`+${palier.temps}`} />
                  <Ligne styles={styles} texte={t('jeuxMemoireBonusSansErreur')} valeur={`+${palier.sansErreur}`} couleur={palier.sansErreur > 0 ? VERT : undefined} />
                </View>
                <Text style={styles.scoreFin}>{score}</Text>
                <Text style={styles.texteDiscret}>
                  {t('jeuxMemoireProchain', { n: palier.suivant.niveau, p: palier.suivant.paires, s: palier.suivant.duree })}
                </Text>
                <Bouton styles={styles} texte={t('jeuNiveauSuivant')} onPress={niveauSuivant} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: score })}</Text>
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxMemoireRejouer')} onPress={rejouerPause} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && (
              <>
                <Ionicons name={resultat?.nouveauRecord ? 'trophy' : 'timer'} size={46} color={resultat?.nouveauRecord ? OR : BRAND} />
                <Text style={styles.titre}>{t('jeuxMemoireFin')}</Text>
                {resultat?.nouveauRecord && <Text style={styles.record}>{t('jeuxMemoireNouveauRecord')}</Text>}
                <Text style={styles.scoreFin}>{resultat?.score ?? score}</Text>
                <View style={styles.stats}>
                  <Stat icone="layers" n={t('jeuNiveauCourt', { n: resultat?.niveau ?? niveau })} styles={styles} />
                  <Stat icone="copy" n={resultat?.paires ?? 0} styles={styles} couleur={VERT} />
                </View>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxMemoireRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {classementOuvert && !enJeu && (
        <View style={styles.voile}>
          <ClassementJeu
            jeu={JEU}
            t={t}
            colors={colors}
            dark={dark}
            avantChargement={avantClassement}
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

// Carte à deux faces : dos Pearl Streets et motif, retournement en rotation Y.
const Carte = memo(function Carte({ carte, visible, largeur, hauteur, marge, onRetourner, styles }) {
  const rot = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(rot, {
      toValue: visible ? 1 : 0,
      duration: DUREE_RETOURNEMENT,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rot, visible]);

  useEffect(() => {
    if (!carte.trouvee) return;
    Animated.sequence([
      Animated.delay(DUREE_RETOURNEMENT * 0.6),
      Animated.spring(pop, { toValue: 1.1, friction: 3, tension: 160, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [carte.trouvee, pop]);

  const dos = {
    opacity: rot.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] }),
    transform: [{ perspective: 900 }, { rotateY: rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
  };
  const face = {
    opacity: rot.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] }),
    transform: [{ perspective: 900 }, { rotateY: rot.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }],
  };
  const icone = Math.min(largeur, hauteur) * 0.5;

  return (
    <Pressable
      onPressIn={() => onRetourner(carte.id)}
      style={{ width: largeur, height: hauteur, marginRight: marge, marginBottom: ECART }}
      accessibilityRole="button"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pop }] }]}>
        <Animated.View style={[styles.faceCarte, styles.dos, dos]}>
          <View style={styles.dosCadre}>
            <Ionicons name="cube" size={icone * 0.7} color="rgba(255,255,255,0.9)" />
          </View>
        </Animated.View>
        <Animated.View
          style={[styles.faceCarte, styles.face, carte.trouvee && { borderColor: VERT, borderWidth: 2 }, face]}
        >
          <Ionicons name={carte.icone} size={icone} color={carte.couleur} />
          {carte.trouvee && (
            <View style={styles.coche}>
              <Ionicons name="checkmark-circle" size={Math.max(14, icone * 0.32)} color={VERT} />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

function Bulle({ id, texte, couleur, onFin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onFin(id));
  }, [id, onFin, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [10, -40] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.Text style={[styles2.bulle, { color: couleur, opacity, transform: [{ translateY }] }]}>
      {texte}
    </Animated.Text>
  );
}

function Ligne({ texte, valeur, couleur, styles }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneTexte}>{texte}</Text>
      <Text style={[styles.ligneValeur, couleur && { color: couleur }]}>{valeur}</Text>
    </View>
  );
}

function Stat({ icone, n, styles, couleur }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icone} size={20} color={couleur || BRAND} />
      <Text style={styles.statTexte}>{n}</Text>
    </View>
  );
}

function Bouton({ texte, onPress, secondaire, styles, desactive }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => [styles.bouton, secondaire && styles.boutonSecondaire, (pressed || desactive) && { opacity: 0.7 }]}
    >
      <Text style={[styles.boutonTexte, secondaire && styles.boutonTexteSecondaire]}>{texte}</Text>
    </Pressable>
  );
}

const styles2 = StyleSheet.create({
  bulle: {
    position: 'absolute', alignSelf: 'center', textAlign: 'center', fontSize: 24, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
});

const makeStyles = (c, dark) => StyleSheet.create({
  ecran: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  pastille: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border,
  },
  pastilleNiveau: { color: BRAND, fontWeight: '800', fontSize: 15 },
  pastilleSeparateur: { width: 1, height: 14, backgroundColor: c.border, marginHorizontal: 2 },
  pastilleTexte: { color: c.text, fontWeight: '800', fontSize: 15 },
  chrono: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  barreFond: { flex: 1, height: 10, borderRadius: 5, backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  barre: { height: '100%', borderRadius: 5 },
  chronoTexte: { color: c.text, fontWeight: '800', fontSize: 15, minWidth: 26, textAlign: 'right' },
  zone: { flex: 1, marginTop: 16, alignItems: 'center', justifyContent: 'center' },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  cache: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  bulles: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  faceCarte: {
    ...StyleSheet.absoluteFillObject, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden',
    shadowColor: '#000', shadowOpacity: dark ? 0.4 : 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  dos: { backgroundColor: BRAND, padding: 6 },
  dosCadre: {
    flex: 1, alignSelf: 'stretch', borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  face: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  coche: { position: 'absolute', top: 6, right: 6 },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  record: { color: OR, fontSize: 16, fontWeight: '800', marginTop: 6 },
  scoreFin: { color: c.text, fontSize: 48, fontWeight: '900', marginTop: 4 },
  lignes: { alignSelf: 'stretch', marginTop: 12, gap: 6 },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ligneTexte: { color: c.textSoft, fontSize: 15, flexShrink: 1 },
  ligneValeur: { color: c.text, fontSize: 15, fontWeight: '800', marginLeft: 12 },
  stats: { flexDirection: 'row', gap: 18, marginTop: 4, marginBottom: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statTexte: { color: c.text, fontSize: 16, fontWeight: '700' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
