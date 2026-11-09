/**
 * Mini-jeu « Fruits express », pour patienter entre deux courses.
 *
 * Les fruits de la commande d'un client (smoothie, primeur) jaillissent du
 * bas de l'écran en arc. Le livreur les tranche en glissant le doigt (trace
 * de lame visible) : fruit tranché +1, plusieurs fruits d'un même geste =
 * bonus combo. Fruit retombé sans être tranché = une vie en moins (3 vies).
 * Colis fragile (carton avec pictogramme verre) tranché = fin de partie.
 * Au début facile (un fruit très lent), après difficile (plus de fruits,
 * plus rapides, colis fragiles de plus en plus fréquents).
 *
 * Logique pure dans utils/jeuCoupe.js. Boucle requestAnimationFrame, état
 * dans des refs, dessin par Animated.Value.setValue (aucun rendu React à
 * chaque image). Pause automatique (hooks/usePauseJeu.js) : arrière-plan,
 * écran quitté, flèche retour pendant la partie, nouvelle course. Aucun son.
 * Décor : étal du primeur avec l'enseigne Pearl Streets (components/FondJeu.js).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import FondJeu from '../components/FondJeu';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  HAUTEUR, VIES, FRUITS, POINTS_FRUIT,
  creerMonde, changerLargeur, avancer, lame, finGeste,
} from '../utils/jeuCoupe';

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
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const OR = '#F2B705';
const ROUGE = '#E74C3C';
const NB_SEGMENTS = 12; // morceaux de la trace de lame
const DUREE_TRACE = 150; // ms de trace visible derrière le doigt

// Fond : planche à découper (étal du primeur).
const PALETTE = {
  clair: { fond: '#F1DEC0', latte: '#E6CDA6', trace: '#FFFFFF', halo: 'rgba(255,255,255,0.45)' },
  sombre: { fond: '#2A2018', latte: '#33271D', trace: '#FFF6D6', halo: 'rgba(255,246,214,0.35)' },
};

function instantane(o, genre) {
  return { id: o.id, genre, sorte: o.sorte, cote: o.cote || 0, r: o.r, casse: !!o.casse };
}

export default function JeuCoupeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pal = dark ? PALETTE.sombre : PALETTE.clair;

  const [phase, setPhase] = useState('accueil'); // accueil, jeu, pause, reprise, fin
  const phaseRef = useRef('accueil');
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [liste, setListe] = useState([]);
  const [score, setScore] = useState(0);
  const [vies, setVies] = useState(VIES);
  const [vague, setVague] = useState(0);
  const [meilleur, setMeilleur] = useState(0);
  const [resultat, setResultat] = useState(null); // { score, tranches, combo, vague, raison, nouveauRecord }
  const [bulles, setBulles] = useState([]);
  const [jus, setJus] = useState([]);
  const [eclats, setEclats] = useState(null);
  const [classementOuvert, setClassementOuvert] = useState(false);

  const mondeRef = useRef(null);
  const kRef = useRef(1);
  const tailleRef = useRef({ l: 0, h: 0 });
  const animsRef = useRef(new Map());
  const rafRef = useRef(null);
  const dernierTsRef = useRef(null);
  const actifRef = useRef(false);
  const termineRef = useRef(false);
  const monteRef = useRef(true);
  const idEffetRef = useRef(0);
  const traceRef = useRef([]); // points du doigt { x, y, t } en pixels
  const doigtRef = useRef(null); // dernier point du doigt en unités

  const flash = useRef(new Animated.Value(0)).current;
  const segments = useRef(
    Array.from({ length: NB_SEGMENTS }, () => ({
      x: new Animated.Value(-1000), y: new Animated.Value(-1000), rot: new Animated.Value(0),
      sx: new Animated.Value(0.01), op: new Animated.Value(0),
    })),
  ).current;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  // Valeurs animées des objets et moitiés, créées à leur apparition, retirées à leur sortie.
  const synchroniserListe = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const anims = animsRef.current;
    const tous = [...m.objets, ...m.morceaux];
    const ids = new Set(tous.map((o) => o.id));
    for (const id of Array.from(anims.keys())) if (!ids.has(id)) anims.delete(id);
    for (const o of tous) {
      if (!anims.has(o.id)) {
        anims.set(o.id, { x: new Animated.Value(o.x * k), y: new Animated.Value(o.y * k), rot: new Animated.Value(o.rot) });
      }
    }
    if (monteRef.current) {
      setListe([
        ...m.objets.map((o) => instantane(o, o.type)),
        ...m.morceaux.map((o) => instantane(o, 'moitie')),
      ]);
    }
  }, []);

  // Trace de lame : segments entre les derniers points du doigt, du plus récent au plus ancien.
  const dessinerTrace = useCallback(() => {
    const maintenant = Date.now();
    const pts = traceRef.current.filter((p) => maintenant - p.t <= DUREE_TRACE);
    traceRef.current = pts;
    for (let i = 0; i < NB_SEGMENTS; i += 1) {
      const s = segments[i];
      const b = pts[pts.length - 1 - i];
      const a = pts[pts.length - 2 - i];
      if (!a || !b) {
        s.op.setValue(0);
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const longueur = Math.sqrt(dx * dx + dy * dy);
      s.x.setValue((a.x + b.x) / 2 - 50);
      s.y.setValue((a.y + b.y) / 2);
      s.rot.setValue((Math.atan2(dy, dx) * 180) / Math.PI);
      s.sx.setValue(Math.max(0.01, (longueur + 2) / 100));
      s.op.setValue(Math.max(0, 1 - (maintenant - b.t) / DUREE_TRACE) * (1 - i / NB_SEGMENTS));
    }
  }, [segments]);

  const dessiner = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const anims = animsRef.current;
    for (const o of m.objets) {
      const a = anims.get(o.id);
      if (a) { a.x.setValue(o.x * k); a.y.setValue(o.y * k); a.rot.setValue(o.rot); }
    }
    for (const o of m.morceaux) {
      const a = anims.get(o.id);
      if (a) { a.x.setValue(o.x * k); a.y.setValue(o.y * k); a.rot.setValue(o.rot); }
    }
    dessinerTrace();
  }, [dessinerTrace]);

  const effacerTrace = useCallback(() => {
    traceRef.current = [];
    doigtRef.current = null;
    for (const s of segments) s.op.setValue(0);
  }, [segments]);

  const arreterBoucle = useCallback(() => {
    actifRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dernierTsRef.current = null;
  }, []);

  const ajouterBulle = useCallback((texte, couleur, xU, yU, icone) => {
    if (!monteRef.current) return;
    idEffetRef.current += 1;
    const id = idEffetRef.current;
    const k = kRef.current;
    setBulles((b) => [...b.slice(-4), { id, texte, couleur, icone, x: xU * k, y: yU * k }]);
  }, []);
  const retirerBulle = useCallback((id) => {
    if (monteRef.current) setBulles((b) => b.filter((x) => x.id !== id));
  }, []);
  const ajouterJus = useCallback((xU, yU, couleur) => {
    if (!monteRef.current) return;
    idEffetRef.current += 1;
    const id = idEffetRef.current;
    const k = kRef.current;
    setJus((j) => [...j.slice(-9), { id, couleur, x: xU * k, y: yU * k }]);
  }, []);
  const retirerJus = useCallback((id) => {
    if (monteRef.current) setJus((j) => j.filter((x) => x.id !== id));
  }, []);

  const terminer = useCallback((raison) => {
    if (termineRef.current) return;
    termineRef.current = true;
    arreterBoucle();
    effacerTrace();
    const m = mondeRef.current;
    const res = {
      score: m?.score || 0, tranches: m?.tranches || 0, combo: m?.meilleurCombo || 0, vague: m?.vague || 0,
      raison: raison || (m && m.vies <= 0 ? 'vies' : 'casse'), nouveauRecord: false,
    };
    if (monteRef.current) setResultat(res);
    changerPhase('fin');
    finDePartie('coupe', user?.id, res.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setResultat((x) => (x ? { ...x, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [arreterBoucle, changerPhase, effacerTrace, user?.id]);

  const traiter = useCallback((evenements) => {
    const m = mondeRef.current;
    if (!m || !evenements.length) return;
    let changementListe = false;
    let points = false;
    for (const e of evenements) {
      if (e.type === 'liste') changementListe = true;
      else if (e.type === 'tranche') {
        points = true;
        ajouterJus(e.x, e.y, FRUITS[e.sorte]?.jus || ROUGE);
      } else if (e.type === 'combo') {
        points = true;
        vibrer(false);
        ajouterBulle(t('jeuxCoupeCombo', { n: e.n, bonus: e.bonus }), OR, e.x, e.y - 90);
      } else if (e.type === 'rate') {
        vibrer(false);
        if (monteRef.current) setVies(e.vies);
        ajouterBulle('', ROUGE, e.x, HAUTEUR - 130, 'heart-dislike');
      } else if (e.type === 'vague') {
        if (monteRef.current) setVague(e.n);
      } else if (e.type === 'casse') {
        vibrer(true);
        const k = kRef.current;
        if (monteRef.current) setEclats({ x: e.x * k, y: e.y * k, n: Date.now() });
        flash.setValue(0.75);
        Animated.timing(flash, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      } else if (e.type === 'fin') {
        terminer(e.raison);
      }
    }
    if (changementListe) synchroniserListe();
    if (points && monteRef.current) setScore(m.score);
  }, [ajouterBulle, ajouterJus, flash, synchroniserListe, t, terminer]);

  const boucleRef = useRef(null);
  boucleRef.current = (ts) => {
    rafRef.current = null;
    if (!actifRef.current || !mondeRef.current) return;
    const dt = dernierTsRef.current == null ? 1 / 60 : (ts - dernierTsRef.current) / 1000;
    dernierTsRef.current = ts;
    const ev = avancer(mondeRef.current, dt);
    if (ev.length) traiter(ev);
    dessiner();
    if (actifRef.current) rafRef.current = requestAnimationFrame((x) => boucleRef.current(x));
  };

  const demarrerBoucle = useCallback(() => {
    if (rafRef.current != null) return;
    actifRef.current = true;
    dernierTsRef.current = null;
    rafRef.current = requestAnimationFrame((x) => boucleRef.current(x));
  }, []);

  const nouveauMonde = useCallback(() => {
    const k = kRef.current;
    mondeRef.current = creerMonde(tailleRef.current.l / k, Date.now());
    animsRef.current = new Map();
    synchroniserListe();
    dessiner();
  }, [dessiner, synchroniserListe]);

  const jouer = useCallback(() => {
    if (!tailleRef.current.h) return;
    arreterBoucle();
    effacerTrace();
    termineRef.current = false;
    nouveauMonde();
    setScore(0);
    setVies(VIES);
    setVague(0);
    setResultat(null);
    setBulles([]);
    setJus([]);
    setEclats(null);
    setClassementOuvert(false);
    changerPhase('jeu');
    demarrerBoucle();
  }, [arreterBoucle, changerPhase, demarrerBoucle, effacerTrace, nouveauMonde]);

  // Doigt : la lame tranche dès le mouvement, sans attendre la boucle.
  const pointDoigt = useCallback((ev) => {
    const { locationX, locationY } = ev.nativeEvent;
    return { x: locationX, y: locationY };
  }, []);

  const doigtPose = useCallback((ev) => {
    const p = pointDoigt(ev);
    if (phaseRef.current === 'reprise') {
      changerPhase('jeu');
      demarrerBoucle();
    }
    if (phaseRef.current !== 'jeu') return;
    const k = kRef.current;
    traceRef.current = [{ x: p.x, y: p.y, t: Date.now() }];
    doigtRef.current = { x: p.x / k, y: p.y / k };
  }, [changerPhase, demarrerBoucle, pointDoigt]);

  const doigtBouge = useCallback((ev) => {
    const m = mondeRef.current;
    if (!m || phaseRef.current !== 'jeu') return;
    const p = pointDoigt(ev);
    const k = kRef.current;
    const u = { x: p.x / k, y: p.y / k };
    const avant = doigtRef.current;
    doigtRef.current = u;
    traceRef.current.push({ x: p.x, y: p.y, t: Date.now() });
    if (traceRef.current.length > NB_SEGMENTS + 1) traceRef.current.shift();
    if (avant) traiter(lame(m, avant.x, avant.y, u.x, u.y));
  }, [pointDoigt, traiter]);

  const doigtLeve = useCallback(() => {
    const m = mondeRef.current;
    doigtRef.current = null;
    if (m && phaseRef.current === 'jeu') traiter(finGeste(m));
  }, [traiter]);

  const pause = useCallback(() => {
    const p = phaseRef.current;
    const m = mondeRef.current;
    if (p === 'jeu' && m && (m.phase === 'casse' || m.phase === 'perdu' || m.phase === 'fini')) {
      terminer();
    } else if (p === 'jeu' || p === 'reprise') {
      arreterBoucle();
      if (m) traiter(finGeste(m));
      effacerTrace();
      dessiner();
      changerPhase('pause');
    }
  }, [arreterBoucle, changerPhase, dessiner, effacerTrace, terminer, traiter]);
  const enJeu = phase === 'jeu' || phase === 'reprise';
  const estEnJeu = useCallback(() => phaseRef.current === 'jeu' || phaseRef.current === 'reprise', []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation, enJeu: enJeu || (classementOuvert && phase === 'pause'), estEnJeu, fermerPanneau,
  });

  // Reprise : tout reste figé jusqu'au prochain toucher.
  const reprendre = useCallback(() => {
    changerPhase('reprise');
  }, [changerPhase]);

  useEffect(() => {
    let vivant = true;
    chargerRecord('coupe', user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); }).catch(() => {});
    return () => { vivant = false; };
  }, [user?.id]);

  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      actifRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const surMesure = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    if (!h || (l === tailleRef.current.l && h === tailleRef.current.h)) return;
    tailleRef.current = { l, h };
    kRef.current = h / HAUTEUR;
    if (mondeRef.current) {
      changerLargeur(mondeRef.current, l / kRef.current);
      animsRef.current = new Map();
      synchroniserListe();
      dessiner();
    } else {
      nouveauMonde();
    }
    setTaille({ l, h });
  }, [dessiner, nouveauMonde, synchroniserListe]);

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

  const avantClassement = useCallback(() => envoyerRecordEnAttente('coupe', user?.id), [user?.id]);

  const k = kRef.current;
  const lattes = taille.h ? Math.ceil(taille.h / 90) : 0;

  return (
    <View style={[styles.ecran, { backgroundColor: pal.fond }]}>
      {/* Monde : toute la hauteur sauf la zone basse du téléphone */}
      <View
        style={[styles.monde, { backgroundColor: pal.fond, marginBottom: insets.bottom }]}
        onLayout={surMesure}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={doigtPose}
        onResponderMove={doigtBouge}
        onResponderRelease={doigtLeve}
        onResponderTerminate={doigtLeve}
      >
        {taille.h > 0 && (
          <>
            {/* Planche à découper */}
            {Array.from({ length: lattes }).map((_, i) => (
              <View key={i} pointerEvents="none" style={[styles.latte, { top: i * 90 + 88, backgroundColor: pal.latte }]} />
            ))}
            {/* Étal du primeur : banne, enseigne Pearl Streets, cagettes */}
            <FondJeu variante="marche" dark={dark} haut={insets.top} />

            {jus.map((j) => (
              <Eclaboussure key={j.id} id={j.id} x={j.x} y={j.y} couleur={j.couleur} taille={124 * k} onFin={retirerJus} />
            ))}

            {liste.map((o) => {
              const a = animsRef.current.get(o.id);
              if (!a) return null;
              if (o.genre === 'moitie') return <Moitie key={o.id} o={o} a={a} k={k} />;
              if (o.genre === 'fragile') return <ColisFragile key={o.id} o={o} a={a} k={k} />;
              return <Fruit key={o.id} o={o} a={a} k={k} />;
            })}

            {/* Trace de lame */}
            {segments.map((s, i) => {
              const ep = Math.max(2, (10 - i * 0.6) * k * 1.4);
              const rotation = s.rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
              return (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={[styles.segment, {
                    height: ep, marginTop: -ep / 2, borderRadius: ep / 2, backgroundColor: pal.trace,
                    shadowColor: pal.trace, opacity: s.op,
                    transform: [{ translateX: s.x }, { translateY: s.y }, { rotate: rotation }, { scaleX: s.sx }],
                  }]}
                />
              );
            })}

            {eclats && <Eclats key={eclats.n} x={eclats.x} y={eclats.y} taille={146 * k} />}
            {bulles.map((b) => (
              <Bulle key={b.id} id={b.id} x={b.x} y={b.y} texte={b.texte} icone={b.icone} couleur={b.couleur} onFin={retirerBulle} />
            ))}
            {vague > 0 && enJeu && <BandeauVague key={vague} texte={t('jeuxCoupeVague', { n: vague })} haut={taille.h * 0.4} />}

            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />

            {phase === 'reprise' && (
              <View pointerEvents="none" style={[styles.consigne, { top: taille.h * 0.6 }]}>
                <MaterialCommunityIcons name="gesture-swipe" size={34} color={dark ? '#fff' : colors.text} />
                <Text style={[styles.consigneTexte, { color: dark ? '#fff' : colors.text }]}>{t('jeuxCoupeToucherReprendre')}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Barre du haut : quitter, score, vies, pause (au-dessus du monde, hors zone de geste) */}
      <View pointerEvents="box-none" style={[styles.haut, { top: insets.top + 8 }]}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View pointerEvents="none" style={styles.centreHaut}>
          <View style={styles.pastille}>
            <Ionicons name="nutrition" size={15} color={ROUGE} />
            <Text style={styles.pastilleTexte}>{score}</Text>
          </View>
          {vague > 0 && <Text style={styles.vague}>{t('jeuxCoupeVague', { n: vague })}</Text>}
        </View>
        <View pointerEvents="none" style={styles.vies}>
          {Array.from({ length: VIES }).map((_, i) => (
            <Ionicons key={i} name={i < vies ? 'heart' : 'heart-outline'} size={19} color={colors.danger} />
          ))}
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

      {/* Fenêtres : accueil, pause, fin */}
      {(phase === 'accueil' || phase === 'pause' || phase === 'fin') && !classementOuvert && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <Text style={styles.grosEmoji}>🍉</Text>
                <Text style={styles.titre}>{t('jeuxCoupeTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxCoupeRegle')}</Text>
                <View style={styles.ligneFragile}>
                  <View style={styles.miniColis}>
                    <MaterialCommunityIcons name="glass-fragile" size={16} color={ROUGE} />
                  </View>
                  <Text style={[styles.texteDiscret, styles.texteFragile]}>{t('jeuxCoupeFragile')}</Text>
                </View>
                <Text style={styles.texteDiscret}>{t('jeuxCoupeBonus', { n: POINTS_FRUIT })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} desactive={!taille.h} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: score })}</Text>
                {vague > 0 && <Text style={styles.texteDiscret}>{t('jeuxCoupeVague', { n: vague })}</Text>}
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxCoupeRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && (
              <>
                {resultat?.nouveauRecord
                  ? <MaterialCommunityIcons name="trophy" size={46} color={OR} />
                  : resultat?.raison === 'casse'
                    ? <MaterialCommunityIcons name="glass-fragile" size={46} color={ROUGE} />
                    : <Ionicons name="heart-dislike" size={44} color={colors.danger} />}
                <Text style={styles.titre}>{resultat?.raison === 'casse' ? t('jeuxCoupeFinCasse') : t('jeuxCoupeFinVies')}</Text>
                {resultat?.nouveauRecord && <Text style={styles.record}>{t('jeuxCoupeNouveauRecord')}</Text>}
                <Text style={styles.scoreFin}>{resultat?.score ?? score}</Text>
                <View style={styles.stats}>
                  <Stat icone="fruit-watermelon" n={resultat?.tranches ?? 0} styles={styles} couleur={ROUGE} />
                  <Stat icone="flash" n={`x${resultat?.combo ?? 0}`} styles={styles} couleur={OR} />
                  <Stat icone="layers-triple" n={resultat?.vague ?? 0} styles={styles} />
                </View>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxCoupeRejouer')} onPress={jouer} />
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
            jeu="coupe"
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

function useRotation(a) {
  return useMemo(() => a.rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }), [a]);
}

// Fruit entier, centré sur (x, y).
const Fruit = memo(function Fruit({ o, a, k }) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles2.objet, { left: -d / 2, top: -d / 2, width: d, height: d, transform: [{ translateX: a.x }, { translateY: a.y }, { rotate }] }]}
    >
      <Text style={[styles2.emoji, { fontSize: d * 0.8, lineHeight: d }]}>{FRUITS[o.sorte]?.emoji}</Text>
    </Animated.View>
  );
});

// Moitié de fruit : la moitié gauche ou droite de l'emoji, bord de chair coloré.
const Moitie = memo(function Moitie({ o, a, k }) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  const gauche = o.cote < 0;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles2.moitie, { left: -d / 4, top: -d / 2, width: d / 2, height: d, transform: [{ translateX: a.x }, { translateY: a.y }, { rotate }] }]}
    >
      <View style={[styles2.objet, { left: gauche ? 0 : -d / 2, top: 0, width: d, height: d }]}>
        <Text style={[styles2.emoji, { fontSize: d * 0.8, lineHeight: d }]}>{FRUITS[o.sorte]?.emoji}</Text>
      </View>
      <View
        style={[styles2.chair, {
          [gauche ? 'right' : 'left']: 0, top: d * 0.18, bottom: d * 0.18, width: Math.max(2, 4 * k),
          backgroundColor: FRUITS[o.sorte]?.jus || ROUGE,
        }]}
      />
    </Animated.View>
  );
});

// Colis fragile : carton, ruban adhésif, pictogramme verre. Fendu s'il est tranché.
const ColisFragile = memo(function ColisFragile({ o, a, k }) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles2.colis, { left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d * 0.12, borderWidth: Math.max(1, 3 * k), transform: [{ translateX: a.x }, { translateY: a.y }, { rotate }] }]}
    >
      <View style={[styles2.ruban, { height: d * 0.16, top: d * 0.1 }]} />
      <View style={[styles2.etiquette, { width: d * 0.56, height: d * 0.5, borderRadius: d * 0.08, marginTop: d * 0.12 }]}>
        <MaterialCommunityIcons name="glass-fragile" size={d * 0.42} color={ROUGE} />
      </View>
      {o.casse && (
        <View style={StyleSheet.absoluteFill}>
          <MaterialCommunityIcons name="flash" size={d * 0.9} color="#3B2A1A" style={styles2.fente} />
        </View>
      )}
    </Animated.View>
  );
});

// Éclaboussure de jus : tache qui s'estompe et gouttes projetées.
const GOUTTES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 + (i % 2 ? 0.3 : -0.2);
  return { dx: Math.cos(angle), dy: Math.sin(angle), loin: 0.6 + ((i * 37) % 10) / 20, taille: 0.11 + (i % 3) * 0.035 };
});
function Eclaboussure({ id, x, y, couleur, taille, onFin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start(() => onFin(id));
    return () => anim.stop();
  }, [id, onFin, v]);
  const tache = v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.35, 0] });
  const echelle = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] });
  const opaciteGoutte = v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.9, 0] });
  return (
    <View pointerEvents="none" style={[styles2.jus, { left: x, top: y }]}>
      <Animated.View
        style={{
          position: 'absolute', left: -taille / 2, top: -taille / 2, width: taille, height: taille, borderRadius: taille / 2,
          backgroundColor: couleur, opacity: tache, transform: [{ scale: echelle }],
        }}
      />
      {GOUTTES.map((g, i) => {
        const s = taille * g.taille;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: -s / 2, top: -s / 2, width: s, height: s, borderRadius: s / 2, backgroundColor: couleur,
              opacity: opaciteGoutte,
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, g.dx * taille * g.loin] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, g.dy * taille * g.loin + taille * 0.25] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// Éclats de verre quand un colis fragile est tranché.
function Eclats({ x, y, taille }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v]);
  const opacite = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0.2] });
  return (
    <View pointerEvents="none" style={[styles2.jus, { left: x, top: y }]}>
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const s = taille * (0.1 + (i % 3) * 0.04);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: -s / 2, top: -s / 2, width: s, height: s * 0.6, backgroundColor: '#CFEFFF',
              borderWidth: 1, borderColor: '#7FB7D6', opacity: opacite,
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * taille * 0.9] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * taille * 0.9] }) },
                { rotate: `${i * 47}deg` },
              ],
            }}
          />
        );
      })}
      <Animated.View style={{ position: 'absolute', left: -taille / 2, top: -taille / 2, width: taille, height: taille, alignItems: 'center', justifyContent: 'center', opacity: opacite }}>
        <MaterialCommunityIcons name="star-four-points" size={taille * 0.8} color={OR} />
      </Animated.View>
    </View>
  );
}

function BandeauVague({ texte, haut }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const scale = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.7, 1, 1.05] });
  return (
    <Animated.Text pointerEvents="none" style={[styles2.bandeau, { top: haut, opacity, transform: [{ scale }] }]}>
      {texte}
    </Animated.Text>
  );
}

function Bulle({ id, x, y, texte, icone, couleur, onFin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start(() => onFin(id));
    return () => anim.stop();
  }, [id, onFin, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const opacity = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={[styles2.bulle, { left: x - 90, top: y, opacity, transform: [{ translateY }] }]}>
      {icone ? <Ionicons name={icone} size={30} color={couleur} /> : null}
      {texte ? <Text style={[styles2.bulleTexte, { color: couleur }]}>{texte}</Text> : null}
    </Animated.View>
  );
}

function Stat({ icone, n, styles, couleur }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icone} size={20} color={couleur || BRAND} />
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
  objet: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  emoji: { textAlign: 'center', includeFontPadding: false },
  moitie: { position: 'absolute', overflow: 'hidden' },
  chair: { position: 'absolute', borderRadius: 2, opacity: 0.85 },
  colis: {
    position: 'absolute', backgroundColor: '#B07A45', borderColor: '#7A5230', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ruban: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,236,190,0.75)' },
  etiquette: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  fente: { position: 'absolute', alignSelf: 'center', top: '5%' },
  jus: { position: 'absolute', width: 0, height: 0 },
  bandeau: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 34, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 },
  },
  bulle: { position: 'absolute', width: 180, alignItems: 'center' },
  bulleTexte: {
    textAlign: 'center', fontSize: 22, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
});

const makeStyles = (c) => StyleSheet.create({
  ecran: { flex: 1 },
  monde: { flex: 1, overflow: 'hidden' },
  latte: { position: 'absolute', left: 0, right: 0, height: 2 },
  segment: {
    position: 'absolute', left: 0, top: 0, width: 100,
    shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  flash: { backgroundColor: '#ff4d3d' },
  consigne: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  consigneTexte: { fontSize: 18, fontWeight: '800', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
  haut: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  centreHaut: { flex: 1, alignItems: 'center' },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND, marginLeft: 10 },
  pastille: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: c.border, marginTop: 2,
  },
  pastilleTexte: { color: c.text, fontWeight: '900', fontSize: 18 },
  vague: { color: c.textSoft, fontWeight: '800', fontSize: 13, marginTop: 4 },
  vies: {
    flexDirection: 'row', gap: 2, alignItems: 'center', height: 42, paddingHorizontal: 8,
    backgroundColor: c.card, borderRadius: 21, borderWidth: 1, borderColor: c.border,
  },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  grosEmoji: { fontSize: 44, lineHeight: 52 },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  ligneFragile: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 6 },
  texteFragile: { marginTop: 0, flexShrink: 1, textAlign: 'left' },
  miniColis: {
    width: 26, height: 26, borderRadius: 5, backgroundColor: '#B07A45', borderWidth: 2, borderColor: '#7A5230',
    alignItems: 'center', justifyContent: 'center',
  },
  record: { color: OR, fontSize: 16, fontWeight: '800', marginTop: 6 },
  scoreFin: { color: c.text, fontSize: 48, fontWeight: '900', marginTop: 4 },
  stats: { flexDirection: 'row', gap: 18, marginTop: 4, marginBottom: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statTexte: { color: c.text, fontSize: 16, fontWeight: '700' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
