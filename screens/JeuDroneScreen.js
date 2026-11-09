/**
 * Mini-jeu « Drone express », pour patienter entre deux courses.
 *
 * Un drone de livraison Pearl Streets, colis accroché dessous, traverse la
 * ville. Chaque toucher le fait monter, la gravité le fait descendre : il
 * passe entre les immeubles (en bas) et les grues, enseignes, câbles (en
 * haut). Passage franchi +1, colis attrapé +5, client servi en passant bas
 * devant son balcon +3. Jeu dur dès le départ, de plus en plus serré.
 *
 * Logique pure dans utils/jeuDrone.js. Boucle requestAnimationFrame, état
 * dans des refs, dessin par Animated.Value.setValue (aucun rendu React à
 * chaque image). Pause automatique (hooks/usePauseJeu.js) : arrière-plan,
 * écran quitté, flèche retour pendant la partie, nouvelle course. Aucun son.
 * Décor : panneau Pearl Streets sur les toits de la ville (components/FondJeu.js).
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
import { EnseignePearl, mesuresEnseigne } from '../components/FondJeu';
import SonJeux, { jouerSon } from '../components/SonJeux';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  HAUTEUR, SOL, DRONE_DESSIN, TAILLE_BONUS, POINTS_COLIS, POINTS_CLIENT,
  creerMonde, changerLargeur, avancer, impulsion, centreObstacle, niveauPalier, medaille, decorNiveau,
} from '../utils/jeuDrone';

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
const VERT = '#2ecc71';
const COULEUR_MEDAILLE = { bronze: '#CD7F32', argent: '#C0C6CE', or: OR };
const CLE_MEDAILLE = { bronze: 'jeuxDroneBronze', argent: 'jeuxDroneArgent', or: 'jeuxDroneOr' };
// Décors successifs (un nouveau tous les 10 passages) : ciel et silhouettes.
const DECORS = {
  clair: [{}, { ciel: '#F7D9B5', loin: '#D9B49A', proche: '#B98C7A' }, { ciel: '#BFE9D6', loin: '#9CC7B4', proche: '#7BA896' }, { ciel: '#D7C8EE', loin: '#B5A4D2', proche: '#9484B8' }],
  sombre: [{}, { ciel: '#2A1A22', loin: '#3A2530', proche: '#4A303D' }, { ciel: '#0D2220', loin: '#173432', proche: '#1F4542' }, { ciel: '#1A1530', loin: '#271F45', proche: '#33295A' }],
};
const PERIODE_RUE = 90; // unités entre deux traits de la chaussée

const PALETTE = {
  clair: {
    ciel: '#CFE6FA', loin: '#B3C9DE', proche: '#93ADC7', rue: '#5B6470', trottoir: '#9AA3AD', trait: '#ECECEC',
    immeubles: ['#C8553D', '#3D5A80', '#2A9D8F', '#6D597A'], toit: 'rgba(0,0,0,0.22)',
    fenetre: '#FFF6D6', fenetreEteinte: '#E3E8EE', cable: '#2B2F36', poteau: '#5E6670',
  },
  sombre: {
    ciel: '#0E1622', loin: '#1A2636', proche: '#243246', rue: '#2A2F36', trottoir: '#3A4048', trait: '#8A8F96',
    immeubles: ['#9E3F2C', '#2E4663', '#1F786D', '#54445F'], toit: 'rgba(0,0,0,0.35)',
    fenetre: '#F6C453', fenetreEteinte: '#1B2430', cable: '#0B0D10', poteau: '#3F4650',
  },
};

// Silhouettes du décor (parallaxe), tirées une fois par largeur d'écran.
function silhouettes(largeurPx, hauteurMin, hauteurMax, graine) {
  const liste = [];
  let x = 0;
  let g = graine;
  const alea = () => {
    g = (g * 9301 + 49297) % 233280;
    return g / 233280;
  };
  while (x < largeurPx) {
    const l = 28 + alea() * 46;
    liste.push({ x, l: Math.min(l, largeurPx - x), h: hauteurMin + alea() * (hauteurMax - hauteurMin), antenne: alea() < 0.25 });
    x += l + 2;
  }
  return liste;
}

function instantane(o) {
  return {
    id: o.id, largeur: o.largeur, ecart: o.ecart, centre: o.centre, amp: o.amp, haut: o.haut,
    teinte: o.teinte, colis: o.colis, colisPris: o.colisPris, client: o.client, livre: o.livre,
  };
}

export default function JeuDroneScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [niveau, setNiveau] = useState(0);
  const palBase = dark ? PALETTE.sombre : PALETTE.clair;
  const pal = useMemo(() => ({ ...palBase, ...(dark ? DECORS.sombre : DECORS.clair)[decorNiveau(niveau)] }), [palBase, dark, niveau]);

  const [phase, setPhase] = useState('accueil'); // accueil, pret, vol, chute, pause, reprise, fin
  const phaseRef = useRef('accueil');
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [liste, setListe] = useState([]);
  const [score, setScore] = useState(0);
  const [meilleur, setMeilleur] = useState(0);
  const [resultat, setResultat] = useState(null); // { score, passes, colis, clients, nouveauRecord }
  const [bulles, setBulles] = useState([]);
  const [impact, setImpact] = useState(null);
  const [classementOuvert, setClassementOuvert] = useState(false);

  const mondeRef = useRef(null);
  const kRef = useRef(1);
  const tailleRef = useRef({ l: 0, h: 0 });
  const animsRef = useRef(new Map());
  const rafRef = useRef(null);
  const dernierTsRef = useRef(null);
  const actifRef = useRef(false);
  const termineRef = useRef(false);
  const minuteurFinRef = useRef(null);
  const monteRef = useRef(true);
  const idBulleRef = useRef(0);

  const droneY = useRef(new Animated.Value(0)).current;
  const droneRot = useRef(new Animated.Value(0)).current;
  const decorLoin = useRef(new Animated.Value(0)).current;
  const decorProche = useRef(new Animated.Value(0)).current;
  const rue = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  // Valeurs animées des obstacles, créées à leur apparition, retirées à leur sortie.
  const synchroniserListe = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const anims = animsRef.current;
    const ids = new Set(m.obstacles.map((o) => o.id));
    for (const id of Array.from(anims.keys())) if (!ids.has(id)) anims.delete(id);
    for (const o of m.obstacles) {
      if (!anims.has(o.id)) {
        anims.set(o.id, { x: new Animated.Value(o.x * k), y: new Animated.Value(centreObstacle(o, m.t) * k) });
      }
    }
    if (monteRef.current) setListe(m.obstacles.map(instantane));
  }, []);

  const dessiner = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const lPx = tailleRef.current.l || 1;
    droneY.setValue((m.drone.y - DRONE_DESSIN / 2) * k);
    droneRot.setValue(m.drone.angle);
    const anims = animsRef.current;
    for (const o of m.obstacles) {
      const a = anims.get(o.id);
      if (a) {
        a.x.setValue(o.x * k);
        a.y.setValue(centreObstacle(o, m.t) * k);
      }
    }
    decorLoin.setValue(-((m.decor * k * 0.15) % lPx));
    decorProche.setValue(-((m.decor * k * 0.4) % lPx));
    rue.setValue(-((m.decor * k) % (PERIODE_RUE * k)));
  }, [decorLoin, decorProche, droneRot, droneY, rue]);

  const arreterBoucle = useCallback(() => {
    actifRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dernierTsRef.current = null;
  }, []);

  const ajouterBulle = useCallback((texte, couleur) => {
    const m = mondeRef.current;
    if (!m || !monteRef.current) return;
    idBulleRef.current += 1;
    const id = idBulleRef.current;
    const k = kRef.current;
    setBulles((b) => [...b.slice(-3), { id, texte, couleur, x: m.drone.x * k, y: (m.drone.y - DRONE_DESSIN) * k }]);
  }, []);
  const retirerBulle = useCallback((id) => {
    if (monteRef.current) setBulles((b) => b.filter((x) => x.id !== id));
  }, []);

  const terminer = useCallback(() => {
    if (termineRef.current) return;
    termineRef.current = true;
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    minuteurFinRef.current = null;
    arreterBoucle();
    const m = mondeRef.current;
    const res = { score: m?.score || 0, passes: m?.passes || 0, colis: m?.colis || 0, clients: m?.clients || 0, nouveauRecord: false };
    if (monteRef.current) setResultat(res);
    changerPhase('fin');
    finDePartie('drone', user?.id, res.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setResultat((x) => (x ? { ...x, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [arreterBoucle, changerPhase, user?.id]);

  const traiter = useCallback((evenements) => {
    const m = mondeRef.current;
    let changementListe = false;
    let points = false;
    for (const e of evenements) {
      if (e.type === 'liste') changementListe = true;
      else if (e.type === 'passage') points = true;
      else if (e.type === 'palier') {
        vibrer(false);
        jouerSon('palier');
        if (monteRef.current) setNiveau(e.niveau);
        ajouterBulle(t(CLE_MEDAILLE[e.medaille]), COULEUR_MEDAILLE[e.medaille]);
      }
      else if (e.type === 'colis') {
        points = true;
        vibrer(false);
        jouerSon('piece');
        ajouterBulle(`+${POINTS_COLIS}`, OR);
      } else if (e.type === 'client') {
        points = true;
        vibrer(false);
        jouerSon('bonus');
        ajouterBulle(`${t('jeuxDroneLivre')} +${POINTS_CLIENT}`, VERT);
      } else if (e.type === 'crash') {
        vibrer(true);
        jouerSon('choc');
        changerPhase('chute');
        flash.setValue(0.7);
        Animated.timing(flash, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      } else if (e.type === 'sol') {
        const k = kRef.current;
        if (monteRef.current) setImpact({ x: m.drone.x * k, y: (HAUTEUR - SOL) * k, n: Date.now() });
        actifRef.current = false;
        minuteurFinRef.current = setTimeout(() => terminer(), 650);
      }
    }
    if (changementListe) synchroniserListe();
    if (points && monteRef.current) setScore(m.score);
  }, [ajouterBulle, changerPhase, flash, synchroniserListe, t, terminer]);

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
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    minuteurFinRef.current = null;
    termineRef.current = false;
    nouveauMonde();
    setScore(0);
    setNiveau(0);
    setResultat(null);
    setBulles([]);
    setImpact(null);
    setClassementOuvert(false);
    changerPhase('pret');
    demarrerBoucle();
  }, [arreterBoucle, changerPhase, demarrerBoucle, nouveauMonde]);

  // Toucher : réaction immédiate (onTouchStart), aucune attente de rendu.
  const toucher = useCallback(() => {
    const m = mondeRef.current;
    const p = phaseRef.current;
    if (!m) return;
    if (p === 'pret' || p === 'vol' || p === 'reprise') jouerSon('tap');
    if (p === 'pret') {
      impulsion(m);
      synchroniserListe();
      changerPhase('vol');
    } else if (p === 'vol') {
      impulsion(m);
    } else if (p === 'reprise') {
      impulsion(m);
      changerPhase('vol');
      demarrerBoucle();
    }
  }, [changerPhase, demarrerBoucle, synchroniserListe]);

  const pause = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'pret' || p === 'vol' || p === 'reprise') {
      arreterBoucle();
      dessiner();
      changerPhase('pause');
    } else if (p === 'chute') {
      terminer();
    }
  }, [arreterBoucle, changerPhase, dessiner, terminer]);
  const estEnJeu = useCallback(() => ['pret', 'vol', 'reprise', 'chute'].includes(phaseRef.current), []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation,
    enJeu: phase === 'pret' || phase === 'vol' || phase === 'chute' || phase === 'reprise' || (classementOuvert && phase === 'pause'),
    estEnJeu,
    fermerPanneau,
  });

  // Reprise : le drone reste figé jusqu'au prochain toucher.
  const reprendre = useCallback(() => {
    const m = mondeRef.current;
    changerPhase(m && m.phase === 'pret' ? 'pret' : 'reprise');
    if (m && m.phase === 'pret') demarrerBoucle();
  }, [changerPhase, demarrerBoucle]);

  useEffect(() => {
    let vivant = true;
    chargerRecord('drone', user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); }).catch(() => {});
    return () => { vivant = false; };
  }, [user?.id]);

  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      actifRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
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
      const anims = animsRef.current;
      animsRef.current = new Map();
      anims.clear();
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

  const avantClassement = useCallback(() => envoyerRecordEnAttente('drone', user?.id), [user?.id]);

  const k = kRef.current;
  const D = DRONE_DESSIN * k;
  const droneGauche = mondeRef.current ? (mondeRef.current.drone.x - DRONE_DESSIN / 2) * k : 0;
  const solPx = SOL * k;
  const enJeu = phase === 'pret' || phase === 'vol' || phase === 'chute' || phase === 'reprise';
  const rotation = droneRot.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] });

  const loin = useMemo(() => (taille.l ? silhouettes(taille.l, taille.h * 0.22, taille.h * 0.42, 17) : []), [taille]);
  const proche = useMemo(() => (taille.l ? silhouettes(taille.l, taille.h * 0.12, taille.h * 0.28, 71) : []), [taille]);

  return (
    <View style={[styles.ecran, { backgroundColor: pal.rue }]}>
      <SonJeux actif={phase === 'pret' || phase === 'vol' || phase === 'reprise'} />
      {/* Monde : toute la hauteur sauf la zone basse du téléphone */}
      <View
        style={[styles.monde, { backgroundColor: pal.ciel, marginBottom: insets.bottom }]}
        onLayout={surMesure}
        onTouchStart={toucher}
      >
        {taille.h > 0 && (
          <>
            <Couche liste={loin} decalage={decorLoin} couleur={pal.loin} largeur={taille.l} bas={solPx} />
            <Couche liste={proche} decalage={decorProche} couleur={pal.proche} largeur={taille.l} bas={solPx} enseigne={LARGEUR_ENSEIGNE} />

            {liste.map((o) => {
              const a = animsRef.current.get(o.id);
              return a ? <Obstacle key={o.id} o={o} a={a} k={k} hPx={taille.h} pal={pal} dark={dark} /> : null;
            })}

            {/* Rue */}
            <View pointerEvents="none" style={[styles.rue, { height: solPx, backgroundColor: pal.rue }]}>
              <View style={[styles.trottoir, { height: Math.max(3, 10 * k), backgroundColor: pal.trottoir }]} />
              <Animated.View style={[styles.traits, { top: solPx * 0.55, width: taille.l + PERIODE_RUE * k * 2, transform: [{ translateX: rue }] }]}>
                {Array.from({ length: Math.ceil(taille.l / (PERIODE_RUE * k)) + 2 }).map((_, i) => (
                  <View key={i} style={{ width: PERIODE_RUE * k * 0.5, height: Math.max(2, 5 * k), marginRight: PERIODE_RUE * k * 0.5, backgroundColor: pal.trait, borderRadius: 2 }} />
                ))}
              </Animated.View>
            </View>

            {/* Drone */}
            <Animated.View
              pointerEvents="none"
              style={[styles.drone, { left: droneGauche, width: D, height: D, transform: [{ translateY: droneY }, { rotate: rotation }] }]}
            >
              <MaterialCommunityIcons name="quadcopter" size={D * 0.62} color={BRAND} />
              <View style={[styles.fil, { height: D * 0.1, backgroundColor: dark ? '#C9CED6' : '#444' }]} />
              <View style={[styles.colisDrone, { width: D * 0.3, height: D * 0.24, borderRadius: D * 0.04 }]}>
                <MaterialCommunityIcons name="package-variant-closed" size={D * 0.2} color="#fff" />
              </View>
            </Animated.View>

            {impact && <Impact key={impact.n} x={impact.x} y={impact.y} taille={D} />}
            {bulles.map((b) => (
              <Bulle key={b.id} id={b.id} x={b.x} y={b.y} texte={b.texte} couleur={b.couleur} onFin={retirerBulle} />
            ))}

            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />

            {enJeu && (
              <Text pointerEvents="none" style={[styles.scoreGros, { top: insets.top + 58 }]}>{score}</Text>
            )}
            {enJeu && niveau > 0 && (
              <View pointerEvents="none" style={[styles.medailleHud, { top: insets.top + 122 }]}>
                <MaterialCommunityIcons name="medal" size={26} color={COULEUR_MEDAILLE[medaille(niveau)]} />
              </View>
            )}
            {(phase === 'pret' || phase === 'reprise') && (
              <View pointerEvents="none" style={[styles.consigne, { top: taille.h * 0.62 }]}>
                <MaterialCommunityIcons name="gesture-tap" size={34} color="#fff" />
                <Text style={styles.consigneTexte}>
                  {phase === 'pret' ? t('jeuxDroneToucher') : t('jeuxDroneToucherReprendre')}
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Barre du haut : quitter, meilleur score, pause (au-dessus du monde, hors zone de toucher) */}
      <View pointerEvents="box-none" style={[styles.haut, { top: insets.top + 8 }]}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View pointerEvents="none" style={styles.pastille}>
          <Ionicons name="trophy" size={14} color={OR} />
          <Text style={styles.pastilleTexte}>{meilleur}</Text>
        </View>
        <Pressable
          onPress={pause}
          disabled={!enJeu || phase === 'chute'}
          style={[styles.rond, styles.rondPause, (!enJeu || phase === 'chute') && { opacity: 0.4 }]}
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
                <MaterialCommunityIcons name="quadcopter" size={46} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxDroneTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxDroneRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxDroneBonus')}</Text>
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
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxDroneRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && (
              <>
                <MaterialCommunityIcons name={resultat?.nouveauRecord ? 'trophy' : 'package-variant-closed'} size={46} color={resultat?.nouveauRecord ? OR : BRAND} />
                <Text style={styles.titre}>{t('jeuxDroneFin')}</Text>
                {resultat?.nouveauRecord && <Text style={styles.record}>{t('jeuxDroneNouveauRecord')}</Text>}
                {niveauPalier(resultat?.passes ?? 0) > 0 && (
                  <MaterialCommunityIcons name="medal" size={30} color={COULEUR_MEDAILLE[medaille(niveauPalier(resultat.passes))]} />
                )}
                <Text style={styles.scoreFin}>{resultat?.score ?? score}</Text>
                <View style={styles.stats}>
                  <Stat icone="office-building" n={resultat?.passes ?? 0} styles={styles} />
                  <Stat icone="package-variant-closed" n={resultat?.colis ?? 0} styles={styles} couleur={OR} />
                  <Stat icone="account-check" n={resultat?.clients ?? 0} styles={styles} couleur={VERT} />
                </View>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxDroneRejouer')} onPress={jouer} />
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
            jeu="drone"
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

// Couche de décor : deux copies de la même bande qui défilent en boucle.
// `enseigne` (largeur) : panneau Pearl Streets sur pieds, posé sur le toit de
// l'immeuble le plus proche du milieu de chaque bande.
const LARGEUR_ENSEIGNE = 110;
const PIEDS_ENSEIGNE = 12;
const Couche = memo(function Couche({ liste, decalage, couleur, largeur, bas, enseigne = 0 }) {
  const porteur = useMemo(() => {
    if (!enseigne || !liste.length) return -1;
    let meilleur = 0;
    liste.forEach((b, i) => {
      const ecart = Math.abs(b.x + b.l / 2 - largeur / 2);
      if (ecart < Math.abs(liste[meilleur].x + liste[meilleur].l / 2 - largeur / 2)) meilleur = i;
    });
    return meilleur;
  }, [enseigne, liste, largeur]);
  const hEnseigne = enseigne ? mesuresEnseigne(enseigne, true).hauteur + PIEDS_ENSEIGNE : 0;
  const bande = (cle) => (
    <View key={cle} style={{ width: largeur, height: '100%' }}>
      {liste.map((b, i) => (
        <View key={i} style={{ position: 'absolute', left: b.x, bottom: bas, width: b.l, height: b.h, backgroundColor: couleur }}>
          {b.antenne && i !== porteur && <View style={{ position: 'absolute', top: -14, left: b.l / 2 - 1, width: 2, height: 14, backgroundColor: couleur }} />}
        </View>
      ))}
      {porteur >= 0 && (
        <EnseignePearl
          largeur={enseigne}
          compacte
          pieds={PIEDS_ENSEIGNE}
          couleurSupport={couleur}
          style={{
            position: 'absolute', left: liste[porteur].x + liste[porteur].l / 2 - enseigne / 2,
            bottom: bas + liste[porteur].h, height: hEnseigne,
          }}
        />
      )}
    </View>
  );
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row', width: largeur * 2, transform: [{ translateX: decalage }] }}>
      {bande('a')}
      {bande('b')}
    </Animated.View>
  );
});

// Obstacle : morceau du haut (grue, enseigne ou câbles) et immeuble en bas,
// déplacés ensemble ; le centre du passage est à mi-hauteur de la vue.
const Obstacle = memo(function Obstacle({ o, a, k, hPx, pal, dark }) {
  const w = o.largeur * k;
  const ep = o.ecart * k;
  const hautVisible = (o.centre + o.amp - o.ecart / 2) * k; // plus grande partie visible en haut
  const basVisible = (HAUTEUR - SOL - (o.centre - o.amp + o.ecart / 2)) * k;
  const couleur = pal.immeubles[o.teinte % pal.immeubles.length];
  const rangees = Math.max(0, Math.min(10, Math.floor((basVisible - 14 * k) / (64 * k))));
  const b = TAILLE_BONUS * k;

  let haut;
  if (o.haut === 'grue') {
    const barres = Math.max(1, Math.min(12, Math.floor(hautVisible / (44 * k))));
    haut = (
      <View style={[styles2.morceau, { height: hPx - ep / 2, width: w, backgroundColor: OR, borderColor: '#8A6A00', borderWidth: Math.max(1, 3 * k) }]}>
        {Array.from({ length: barres }).map((_, i) => (
          <View key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: 34 * k + i * 44 * k, height: Math.max(2, 6 * k), backgroundColor: '#8A6A00' }} />
        ))}
        <View style={[styles2.crochet, { height: 28 * k, backgroundColor: '#3B3F46' }]}>
          <MaterialCommunityIcons name="hook" size={24 * k} color={OR} />
        </View>
      </View>
    );
  } else if (o.haut === 'enseigne') {
    haut = (
      <View style={[styles2.morceau, { height: hPx - ep / 2, width: w, backgroundColor: pal.poteau }]}>
        <View style={[styles2.enseigne, { height: 74 * k, borderRadius: 10 * k }]}>
          <MaterialCommunityIcons name="storefront-outline" size={40 * k} color="#fff" />
        </View>
      </View>
    );
  } else {
    haut = (
      <View style={[styles2.morceau, { height: hPx - ep / 2, width: w, flexDirection: 'row', justifyContent: 'space-between' }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: w * 0.21, height: '100%', backgroundColor: pal.cable, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />
        ))}
        <View style={[styles2.boitier, { height: 40 * k, backgroundColor: dark ? '#4A515B' : '#7D8794', borderColor: pal.cable }]}>
          <MaterialCommunityIcons name="flash" size={22 * k} color={OR} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: -hPx, width: w, height: 2 * hPx + ep, transform: [{ translateX: a.x }, { translateY: a.y }] }}
    >
      {haut}
      <View style={[styles2.immeuble, { top: hPx + ep / 2, height: hPx, width: w, backgroundColor: couleur }]}>
        <View style={{ height: Math.max(4, 12 * k), backgroundColor: pal.toit }} />
        <View style={[styles2.fenetres, { paddingTop: 14 * k, paddingHorizontal: w * 0.16 }]}>
          {Array.from({ length: rangees * 2 }).map((_, i) => (
            <View
              key={i}
              style={{
                width: w * 0.26, height: 34 * k, marginBottom: 30 * k, borderRadius: 3,
                backgroundColor: (i + o.id) % 3 === 0 ? pal.fenetreEteinte : pal.fenetre,
              }}
            />
          ))}
        </View>
      </View>
      {o.client && (
        <View style={[styles2.client, { top: hPx + ep / 2 - 44 * k, width: w, height: 44 * k }]}>
          {!o.livre && (
            <View style={[styles2.demande, { top: -26 * k, width: 26 * k, height: 22 * k, borderRadius: 6 * k }]}>
              <MaterialCommunityIcons name="package-variant" size={16 * k} color="#fff" />
            </View>
          )}
          <MaterialCommunityIcons name={o.livre ? 'account-check' : 'human-greeting-variant'} size={40 * k} color={o.livre ? VERT : '#fff'} />
          <View style={{ position: 'absolute', bottom: 0, left: w * 0.12, right: w * 0.12, height: Math.max(3, 6 * k), backgroundColor: '#E8E8E8', borderRadius: 2 }} />
        </View>
      )}
      {o.colis && !o.colisPris && (
        <View style={[styles2.bonus, { top: hPx - b / 2, left: w / 2 - b / 2, width: b, height: b, borderRadius: b * 0.22 }]}>
          <MaterialCommunityIcons name="package-variant-closed" size={b * 0.68} color="#fff" />
        </View>
      )}
    </Animated.View>
  );
});

function Bulle({ id, x, y, texte, couleur, onFin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start(() => onFin(id));
    return () => anim.stop();
  }, [id, onFin, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -46] });
  const opacity = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.Text pointerEvents="none" style={[styles2.bulle, { left: x - 80, top: y, color: couleur, opacity, transform: [{ translateY }] }]}>
      {texte}
    </Animated.Text>
  );
}

function Impact({ x, y, taille }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(2)), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.3] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - taille / 2, top: y - taille * 0.8, width: taille, height: taille, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
      <MaterialCommunityIcons name="star-four-points" size={taille} color={OR} />
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
  morceau: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  crochet: { position: 'absolute', left: '22%', right: '22%', bottom: 0, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  enseigne: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  boitier: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 2 },
  immeuble: { position: 'absolute', left: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' },
  fenetres: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  client: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'flex-end' },
  demande: { position: 'absolute', backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  bonus: {
    position: 'absolute', backgroundColor: OR, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  bulle: {
    position: 'absolute', width: 160, textAlign: 'center', fontSize: 22, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
});

const makeStyles = (c) => StyleSheet.create({
  ecran: { flex: 1 },
  monde: { flex: 1, overflow: 'hidden' },
  rue: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  trottoir: { position: 'absolute', left: 0, right: 0, top: 0 },
  traits: { position: 'absolute', left: 0, flexDirection: 'row' },
  drone: { position: 'absolute', top: 0, alignItems: 'center' },
  fil: { width: 2 },
  colisDrone: { backgroundColor: '#B07A45', alignItems: 'center', justifyContent: 'center' },
  flash: { backgroundColor: '#fff' },
  scoreGros: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 52, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 },
  },
  medailleHud: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  consigne: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  consigneTexte: {
    color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6, textAlign: 'center', paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 },
  },
  haut: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  pastille: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border,
  },
  pastilleTexte: { color: c.text, fontWeight: '800', fontSize: 15 },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
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
