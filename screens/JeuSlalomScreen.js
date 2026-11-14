/**
 * Mini-jeu « Slalom urbain » en 3D, pour patienter entre deux courses
 * (porté depuis l'app client).
 *
 * Le livreur file sur 3 voies, vu de derrière, dans une rue commerçante en
 * perspective (components/SceneSlalom3D.js, des View animées par Reanimated,
 * aucune bibliothèque 3D). Glisser à gauche ou à droite change de voie, vers
 * le haut il saute, vers le bas il se baisse (en l'air : il redescend vite).
 * Mamies, ouvriers, passants, voitures qui traversent, plots, barrières,
 * échafaudages : on esquive, on saute, on se baisse. Sacs d'achat (5 points),
 * étoiles (25 points) et boosters : turbo, super saut, x2, aimant, casque.
 *
 * Police : le premier choc ne termine pas la course. Le livreur trébuche et
 * un policier le poursuit pendant 10 secondes. Un second choc pendant ces
 * 10 secondes : arrêté, c'est perdu. Le casque absorbe un choc.
 *
 * Boucle requestAnimationFrame plafonnée à 60 images par seconde : la course
 * vit dans une ref (utils/jeuSlalom.js), la position est publiée à chaque
 * image dans une valeur partagée Reanimated lue par le rendu. React ne
 * redessine la scène que quand des objets apparaissent ou disparaissent, et
 * le HUD quelques fois par seconde.
 *
 * Pause automatique (hooks/usePauseJeu.js) : arrière-plan, écran quitté,
 * flèche retour, nouvelle course annoncée. Au retour, rien ne reprend seul ;
 * Reprendre lance un 3, 2, 1. Course sauvegardée à la pause et toutes les 4 s
 * (utils/partieSauvegardee.js, 24 h), jamais après une partie perdue. Record
 * et classement : utils/jeuxRecords.js, identifiant 'slalom'. Musique du jeu
 * et bruitages : components/SonJeux.js.
 */
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import SonJeux, { bruit } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import ReprisePartie from '../components/ReprisePartie';
import BandeauClassement from '../components/BandeauClassement';
import HudJeu from '../components/HudJeu';
import IndiceGestes from '../components/IndiceGestes';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import { BanniereRecompense, EtoilesFin, creerSuivi, suivreScore, etoilesPour, formaterNombre, OR_RECOMPENSE } from '../components/RecompensesJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import { useBalayage } from '../utils/gestes';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  VERSION,
  LARGEUR_VOIE,
  INVINCIBLE_REPRISE,
  avancer,
  baisser,
  boostersActifs,
  changerVoie,
  instantaneCourse,
  niveauPour,
  nouvelleCourse,
  nouvelleGraine,
  reprendreCourse,
  sauter,
  scoreCourse,
  tempsPour,
  vitesseCourse,
} from '../utils/jeuSlalom';
import { Decor, Objets, Coureur, Policier, geometrie } from '../components/SceneSlalom3D';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(fort) {
  try {
    if (!Haptics) return;
    const p = fort
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      : Haptics.selectionAsync();
    p?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'slalom';
const PERIODE_HUD = 220; // ms entre deux mises à jour du HUD (moins de rendus, moins de chauffe)
const IMAGE_MIN = 15; // ms : au plus 60 images calculées par seconde, même sur un écran 120 Hz
const SERIE_ECART = 2000; // ms : deux ramassages plus proches gardent la série
const SERIE_PAS = 5; // une annonce toutes les 5 prises d'affilée
const PERIODE_SAUVEGARDE = 4000; // ms
const PALIER_OBJETS = 50; // le compteur d'objets avance par paliers (course sans fin)
// Scores annoncés en grand pendant la course (et étoiles de fin).
const PALIERS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
const HAUT_RECOMPENSE = 50;
const VIOLET = '#8E6CEF';
const ROUGE = '#ff623d';
const VERT = '#0BB58E';

// Icône et couleur de chaque booster dans la jauge du HUD, texte de l'annonce.
const BOOSTERS = {
  turbo: { icone: 'flash', couleur: '#F26B3A', texte: 'jeuRecompTurbo' },
  superSaut: { icone: 'arrow-up-circle', couleur: '#2E9AE0', texte: 'jeuRecompSaut' },
  double: { icone: 'close', couleur: VIOLET, texte: 'jeuRecompX2' },
  aimant: { icone: 'magnet', couleur: ROUGE, texte: 'jeuRecompAimant' },
  casque: { icone: 'shield-checkmark', couleur: BRAND, texte: 'jeuRecompCasque' },
};

function hudDe(e) {
  return {
    score: e ? scoreCourse(e) : 0,
    niveau: e ? niveauPour(e.d) : 1,
    sacs: e ? e.sacs : 0,
    etoiles: e ? e.etoiles : 0,
    police: e ? Math.ceil(e.police) : 0,
    casque: !!e && e.casque > 0,
    boosters: boostersActifs(e).map((b) => ({
      id: b.cle, icone: BOOSTERS[b.cle].icone, couleur: BOOSTERS[b.cle].couleur, ratio: b.reste,
    })),
  };
}

export default function JeuSlalomScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const idLivreur = user?.id;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | fin
  const phaseRef = useRef('accueil');
  const courseRef = useRef(null);
  if (!courseRef.current) courseRef.current = nouvelleCourse(nouvelleGraine());
  const [scene, setScene] = useState(() => ({ objets: courseRef.current.objets, d: courseRef.current.d }));
  const [hud, setHud] = useState(() => hudDe(null));
  const [zone, setZone] = useState(null); // { W, H, g }
  const [compte, setCompte] = useState(0); // 3, 2, 1 avant la reprise
  const [resultat, setResultat] = useState(null); // { score, d, sacs, etoiles, nouveauRecord, etoilesFin }
  const [retour, setRetour] = useState(null); // { couleur, texte, n }
  const [reprise, setReprise] = useState(null); // sauvegarde trouvée à l'ouverture
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [meilleur, setMeilleur] = useState(0);
  const meilleurRef = useRef(0);
  meilleurRef.current = meilleur;
  const [rafraichir, setRafraichir] = useState(0); // relance le bandeau classement

  const geo = useSharedValue(geometrie(360, 600));
  const monde = useSharedValue({
    d: 0, tj: 0, jx: 0, jy: 0, sol: 0, acc: false, tilt: 0, aim: false, inv: 0, t: 0, pol: 0, treb: 0, vit: 0, cad: 8, jxp: 0,
  });

  const rafRef = useRef(null);
  const dernierRef = useRef(0);
  const hudRef = useRef(0);
  const sauveRef = useRef(0);
  const compteRef = useRef(null);
  const minuteurRetour = useRef(null);
  const monteRef = useRef(true);
  const suiviRef = useRef(null);
  const recompRef = useRef(null);
  const popupsRef = useRef(null);
  const serieRef = useRef({ n: 0, dernier: 0 });
  const zoneRef = useRef(null);
  zoneRef.current = zone;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  /** Position du livreur et distance, lues par le rendu à chaque image. */
  const publier = useCallback((e) => {
    const v = vitesseCourse(e);
    monde.value = {
      d: e.d,
      tj: tempsPour(e.d),
      jx: (e.x - 1) * LARGEUR_VOIE,
      jy: e.y,
      sol: e.sol,
      acc: e.acc > 0,
      tilt: Math.max(-16, Math.min(16, (e.voie - e.x) * 16)),
      aim: e.aimant > 0,
      inv: e.invincible,
      t: e.t,
      pol: e.police,
      treb: e.trebuche,
      vit: v,
      cad: 6 + v * 0.55,
      jxp: (e.xPolice - 1) * LARGEUR_VOIE,
    };
  }, [monde]);

  const redessiner = useCallback((e) => {
    if (!monteRef.current) return;
    setScene({ objets: e.objets, d: e.d });
    setHud(hudDe(e));
  }, []);

  const montrerRetour = useCallback((couleur, texte) => {
    if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    setRetour({ couleur, texte, n: Date.now() });
    minuteurRetour.current = setTimeout(() => {
      if (monteRef.current) setRetour(null);
    }, 1100);
  }, []);

  const arreterBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (compteRef.current) clearInterval(compteRef.current);
    compteRef.current = null;
    if (monteRef.current) setCompte(0);
  }, []);

  /** Course mémorisée pour la reprise (24 h). */
  const garder = useCallback((e) => {
    if (!e || e.fini) return;
    sauverPartie(JEU, idLivreur, { v: VERSION, course: instantaneCourse(e), niveau: niveauPour(e.d), score: scoreCourse(e) });
  }, [idLivreur]);

  useEffect(() => {
    monteRef.current = true;
    chargerRecord(JEU, idLivreur).then((r) => { if (monteRef.current) setMeilleur(r.meilleur); });
    envoyerRecordEnAttente(JEU, idLivreur).catch(() => {});
    let vivant = true;
    chargerPartie(JEU, idLivreur).then((d) => {
      if (vivant && d?.course && d.v === VERSION && phaseRef.current === 'accueil') setReprise(d);
    }).catch(() => {});
    return () => { vivant = false; };
  }, [idLivreur]);

  const terminer = useCallback(() => {
    const e = courseRef.current;
    arreterBoucle();
    if (!e) return;
    vibrer(true);
    const score = scoreCourse(e);
    suiviRef.current = null;
    recompRef.current?.cacher();
    bruit('sifflet');
    bruit('perdu');
    const base = {
      score, d: Math.floor(e.d), sacs: e.sacs, etoiles: e.etoiles, nouveauRecord: false,
      etoilesFin: etoilesPour(score, meilleurRef.current, PALIERS),
    };
    setResultat(base);
    redessiner(e);
    changerPhase('fin');
    // Partie perdue : plus de reprise.
    effacerPartie(JEU, idLivreur);
    finDePartie(JEU, idLivreur, score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setRafraichir((k) => k + 1);
      if (r.nouveauRecord) bruit('record');
      setResultat({ ...base, nouveauRecord: r.nouveauRecord });
    }).catch(() => {});
  }, [arreterBoucle, changerPhase, idLivreur, redessiner]);

  const image = useCallback((ts) => {
    const e = courseRef.current;
    if (!e || phaseRef.current !== 'jeu') {
      rafRef.current = null;
      return;
    }
    // Écran 120 Hz : une image sur deux est sautée (60 calculs par seconde au plus).
    if (dernierRef.current && ts - dernierRef.current < IMAGE_MIN) {
      rafRef.current = requestAnimationFrame(imageRef.current);
      return;
    }
    const dt = dernierRef.current ? (ts - dernierRef.current) / 1000 : 0;
    dernierRef.current = ts;
    const ev = avancer(e, dt);
    publier(e);
    if (ev.fin) {
      terminer();
      return;
    }
    if (ev.sacs || ev.etoiles) {
      bruit('ramasse');
      const z = zoneRef.current;
      if (z && ev.points > 0) {
        const double = e.double > 0;
        popupsRef.current?.ajouter({
          x: z.W / 2 + (e.x - 1) * z.W * 0.29,
          y: z.H * 0.7,
          texte: `+${ev.points}`,
          couleur: double ? VIOLET : ev.etoiles ? OR_RECOMPENSE : BRAND,
          icone: ev.etoiles ? 'star' : 'bag-handle',
          grand: ev.etoiles > 0 || double,
        });
      }
      const serie = serieRef.current;
      const avant = ts - serie.dernier < SERIE_ECART ? serie.n : 0;
      serie.n = avant + ev.sacs + ev.etoiles;
      serie.dernier = ts;
      if (Math.floor(serie.n / SERIE_PAS) > Math.floor(avant / SERIE_PAS)) {
        recompRef.current?.montrer({ texte: t('jeuRecompSerie', { n: serie.n }), icone: 'flame', couleur: '#F26B3A' });
      }
    }
    if (ev.bonus && BOOSTERS[ev.bonus]) {
      vibrer(false);
      bruit('booster');
      const b = BOOSTERS[ev.bonus];
      recompRef.current?.montrer({ texte: t(b.texte), icone: b.icone, couleur: b.couleur });
    } else if (ev.casqueAbsorbe) {
      vibrer(true);
      bruit('choc');
      montrerRetour(ROUGE, t('jeuxSlalomCasqueUtilise'));
    } else if (ev.choc) {
      vibrer(true);
      bruit('choc');
      bruit('sirene');
      montrerRetour(ROUGE, t('jeuxSlalomPoliceArrive'));
    } else if (ev.policePart) {
      montrerRetour(VERT, t('jeuxSlalomPolicePartie'));
    } else if (ev.niveau) {
      bruit('niveau');
      recompRef.current?.montrer({ texte: t('jeuNiveau', { n: ev.niveau }), icone: 'flag', couleur: BRAND });
    }
    if (ev.bosse) vibrer(false);
    // Paliers de score et record battu.
    const annonce = suivreScore(suiviRef.current, scoreCourse(e));
    if (annonce?.type === 'record') {
      recompRef.current?.montrer({ texte: t('jeuRecompRecord'), icone: 'trophy', couleur: OR_RECOMPENSE });
      bruit('record');
    } else if (annonce) {
      recompRef.current?.montrer({ texte: t('jeuRecompPalier', { n: formaterNombre(annonce.n) }), icone: 'ribbon', couleur: OR_RECOMPENSE });
    }
    if (ev.change) {
      redessiner(e);
      hudRef.current = ts;
    } else if (ts - hudRef.current > PERIODE_HUD) {
      hudRef.current = ts;
      if (monteRef.current) setHud(hudDe(e));
    }
    if (ts - sauveRef.current > PERIODE_SAUVEGARDE) {
      sauveRef.current = ts;
      garder(e);
    }
    rafRef.current = requestAnimationFrame(imageRef.current);
  }, [garder, montrerRetour, publier, redessiner, t, terminer]);
  const imageRef = useRef(image);
  imageRef.current = image;

  const lancerBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    dernierRef.current = 0;
    hudRef.current = 0;
    rafRef.current = requestAnimationFrame((ts) => {
      dernierRef.current = ts;
      sauveRef.current = ts;
      rafRef.current = requestAnimationFrame(imageRef.current);
    });
  }, []);

  const pause = useCallback(() => {
    const e = courseRef.current;
    const enCompte = !!compteRef.current;
    if (phaseRef.current !== 'jeu' && !enCompte) return;
    arreterBoucle();
    changerPhase('pause');
    if (e) {
      garder(e);
      redessiner(e);
    }
  }, [arreterBoucle, changerPhase, garder, redessiner]);

  /** Reprise après la pause : 3, 2, 1, puis la course repart. */
  const reprendre = useCallback(() => {
    const e = courseRef.current;
    if (!e || phaseRef.current !== 'pause') return;
    arreterBoucle();
    let n = 3;
    setCompte(n);
    compteRef.current = setInterval(() => {
      n -= 1;
      if (!monteRef.current) return;
      if (n > 0) {
        setCompte(n);
        return;
      }
      clearInterval(compteRef.current);
      compteRef.current = null;
      setCompte(0);
      e.invincible = Math.max(e.invincible, INVINCIBLE_REPRISE);
      changerPhase('jeu');
      lancerBoucle();
    }, 700);
  }, [arreterBoucle, changerPhase, lancerBoucle]);

  /** Prépare une course (neuve ou reprise) avant de jouer. */
  const preparer = useCallback((e) => {
    courseRef.current = e;
    setResultat(null);
    setRetour(null);
    setReprise(null);
    setClassementOuvert(false);
    serieRef.current = { n: 0, dernier: 0 };
    popupsRef.current?.vider();
    recompRef.current?.cacher();
    suiviRef.current = creerSuivi(PALIERS, meilleurRef.current, scoreCourse(e));
    publier(e);
    redessiner(e);
  }, [publier, redessiner]);

  const jouer = useCallback(() => {
    arreterBoucle();
    effacerPartie(JEU, idLivreur);
    preparer(nouvelleCourse(nouvelleGraine()));
    changerPhase('jeu');
    lancerBoucle();
  }, [arreterBoucle, changerPhase, idLivreur, lancerBoucle, preparer]);

  const reprendreSauvegarde = useCallback(() => {
    if (!reprise?.course) return;
    arreterBoucle();
    preparer(reprendreCourse(reprise.course));
    changerPhase('pause');
    reprendre();
  }, [arreterBoucle, changerPhase, preparer, reprendre, reprise]);

  const recommencerSauvegarde = useCallback(() => {
    effacerPartie(JEU, idLivreur);
    setReprise(null);
    jouer();
  }, [idLivreur, jouer]);

  const confirmerNouvellePartie = useCallback(() => {
    Alert.alert(t('jeuNouvellePartieTitre'), t('jeuNouvellePartieTexte'), [
      { text: t('jeuAnnuler'), style: 'cancel' },
      { text: t('jeuNouvellePartie'), style: 'destructive', onPress: jouer },
    ]);
  }, [jouer, t]);

  // Pause automatique : arrière-plan, écran quitté, retour, nouvelle course.
  const estEnJeu = useCallback(() => phaseRef.current === 'jeu' || !!compteRef.current, []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation, enJeu: phase === 'jeu' || compte > 0 || (classementOuvert && phase === 'pause'), estEnJeu, fermerPanneau,
  });

  useEffect(() => () => {
    monteRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (compteRef.current) clearInterval(compteRef.current);
    if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
  }, []);

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

  // Gestes : un balayage = une action (voie, saut ou se baisser).
  const enJeu = () => (phaseRef.current === 'jeu' ? courseRef.current : null);
  const gestes = useBalayage({
    actif: phase === 'jeu',
    onGauche: () => { const e = enJeu(); if (e) changerVoie(e, -1); },
    onDroite: () => { const e = enJeu(); if (e) changerVoie(e, 1); },
    onHaut: () => { const e = enJeu(); if (e && sauter(e)) bruit('saut'); },
    onBas: () => { const e = enJeu(); if (e && baisser(e)) bruit('accroupi'); },
  });

  const surMesure = useCallback((ev) => {
    const W = Math.round(ev.nativeEvent.layout.width);
    const H = Math.round(ev.nativeEvent.layout.height);
    if (W <= 0 || H <= 0) return;
    setZone((z) => {
      if (z && z.W === W && z.H === H) return z;
      const g = geometrie(W, H);
      geo.value = g;
      return { W, H, g };
    });
  }, [geo]);

  const enCourse = phase === 'jeu' || compte > 0;
  const nObjets = hud.sacs + hud.etoiles;
  const objets = {
    n: nObjets,
    total: Math.max(PALIER_OBJETS, Math.ceil((nObjets + 1) / PALIER_OBJETS) * PALIER_OBJETS),
    icone: 'bag-handle',
  };
  const montrerReprise = phase === 'accueil' && !!reprise && !classementOuvert;
  const fenetre = !enCourse && !classementOuvert && !montrerReprise;

  return (
    <View style={[styles.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <SonJeux jeu={JEU} actif={phase === 'jeu'} />
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
        score={hud.score}
        rafraichir={rafraichir}
        t={t}
        colors={colors}
        style={styles.bandeau}
      />
      <View pointerEvents="none" style={styles.hudLigne}>
        <HudJeu
          colors={colors}
          score={hud.score}
          niveauLibelle={t('jeuNiveauCourt', { n: hud.niveau })}
          objets={objets}
          boosters={hud.boosters}
        />
      </View>

      {/* Rue en 3D, gestes sur toute la zone */}
      <View style={styles.zone} onLayout={surMesure} {...gestes.panHandlers}>
        {zone && (
          <>
            <Decor key={`${zone.W}x${zone.H}`} g={zone.g} geo={geo} monde={monde} />
            <Objets objets={scene.objets} d={scene.d} geo={geo} monde={monde} />
            <Policier geo={geo} monde={monde} />
            <Coureur geo={geo} monde={monde} casque={hud.casque} />
          </>
        )}
        <IndiceGestes jeu={JEU} actif={phase === 'jeu'} gestes={['gauche', 'droite', 'haut', 'bas']} t={t} colors={colors} />
        {hud.police > 0 && enCourse && (
          <View pointerEvents="none" style={styles.policeZone}>
            <View style={styles.policeBadge}>
              <Ionicons name="alert-circle" size={16} color="#fff" />
              <Text style={styles.policeTexte}>{t('jeuxSlalomPoliceCompte', { n: hud.police })}</Text>
            </View>
          </View>
        )}
        <CouchePopups ref={popupsRef} />
        <BanniereRecompense ref={recompRef} haut={HAUT_RECOMPENSE} />
        {retour && (
          <View key={retour.n} pointerEvents="none" style={styles.retourZone}>
            <Text style={[styles.retour, { backgroundColor: retour.couleur }]}>{retour.texte}</Text>
          </View>
        )}
        {compte > 0 && (
          <View pointerEvents="none" style={styles.compteZone}>
            <View style={styles.compteRond}>
              <Text style={styles.compteTexte}>{compte}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Fenêtres : reprise, accueil, pause, fin */}
      {montrerReprise && (
        <ReprisePartie
          t={t}
          colors={colors}
          niveau={reprise.niveau > 0 ? reprise.niveau : null}
          score={reprise.score}
          onReprendre={reprendreSauvegarde}
          onRecommencer={recommencerSauvegarde}
        />
      )}
      {fenetre && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <Ionicons name="walk" size={42} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxSlalomTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxSlalomRegle')}</Text>
                <Legende t={t} styles={styles} />
                <Text style={styles.texteDiscret}>{t('jeuxSlalomReglePolice')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} compact />
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: hud.score })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} compact />
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxSlalomRejouer')} onPress={confirmerNouvellePartie} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && resultat && (
              <>
                <Ionicons name={resultat.nouveauRecord ? 'trophy' : 'alert-circle'} size={44} color={resultat.nouveauRecord ? OR_RECOMPENSE : colors.danger} />
                <Text style={styles.titre}>{t('jeuxSlalomFinTitre')}</Text>
                {resultat.nouveauRecord && <Text style={[styles.texte, styles.record]}>{t('jeuRecompRecord')}</Text>}
                <Text style={styles.texteFort}>{t('jeuScore', { n: resultat.score })}</Text>
                <EtoilesFin n={resultat.etoilesFin} t={t} colors={colors} />
                <Text style={styles.texteDiscret}>{t('jeuxSlalomDistance', { n: resultat.d })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSlalomSacs', { n: resultat.sacs })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSlalomEtoiles', { n: resultat.etoiles })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxSlalomRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {/* Classement : jamais ouvert pendant une partie. */}
      {classementOuvert && !enCourse && (
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

/** « +5 », « +25 » au-dessus du livreur, qui montent et s'effacent. */
const CouchePopups = memo(forwardRef(function CouchePopups(_props, ref) {
  const [liste, setListe] = useState([]);
  const nRef = useRef(0);
  useImperativeHandle(ref, () => ({
    ajouter(p) {
      nRef.current += 1;
      const id = nRef.current;
      setListe((l) => [...l.slice(-5), { ...p, id }]);
    },
    vider() { setListe([]); },
  }), []);
  const fini = useCallback((id) => setListe((l) => l.filter((p) => p.id !== id)), []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {liste.map((p) => <Popup key={p.id} p={p} onFini={fini} />)}
    </View>
  );
}));

const Popup = memo(function Popup({ p, onFini }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 850, useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) onFini(p.id); });
    return () => anim.stop();
  }, [onFini, p.id, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -46] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const taille = p.grand ? 20 : 16;
  return (
    <Animated.View style={[popupStyles.popup, { left: p.x - 50, top: p.y, opacity, transform: [{ translateY }] }]}>
      {p.icone ? <Ionicons name={p.icone} size={taille} color={p.couleur} /> : null}
      <Text style={[popupStyles.texte, { color: p.couleur, fontSize: taille }]}>{p.texte}</Text>
    </Animated.View>
  );
});

const popupStyles = StyleSheet.create({
  popup: { position: 'absolute', width: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  texte: { fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 3 },
});

/** Petits dessins de la fenêtre d'accueil : sac d'achat, étoile, booster, police. */
function Legende({ t, styles }) {
  const items = [
    { cle: 'jeuxSlalomLegSac', rendu: <View style={styles.legSac}><View style={styles.legAnse} /></View> },
    { cle: 'jeuxSlalomLegEtoile', rendu: <Ionicons name="star" size={28} color={OR_RECOMPENSE} /> },
    { cle: 'jeuxSlalomLegBooster', rendu: <View style={styles.legBooster}><Ionicons name="flash" size={18} color="#fff" /></View> },
    { cle: 'jeuxSlalomLegPolice', rendu: <View style={styles.legPolice}><Ionicons name="alert-circle" size={20} color="#fff" /></View> },
  ];
  return (
    <View style={styles.legende}>
      {items.map((it) => (
        <View key={it.cle} style={styles.legendeItem}>
          <View style={styles.legendeDessin}>{it.rendu}</View>
          <Text style={styles.legendeTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t(it.cle)}</Text>
        </View>
      ))}
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

const makeStyles = (c) => StyleSheet.create({
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
  zone: {
    flex: 1, marginTop: 14, borderRadius: 18, overflow: 'hidden', direction: 'ltr',
    borderWidth: 1, borderColor: c.border, backgroundColor: '#DCD5CA',
  },
  policeZone: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  policeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: ROUGE, borderWidth: 2, borderColor: '#fff',
  },
  policeTexte: { color: '#fff', fontSize: 14, fontWeight: '800' },
  retourZone: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center' },
  retour: {
    color: '#fff', fontSize: 20, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, overflow: 'hidden',
  },
  compteZone: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  compteRond: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: BRAND, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  compteTexte: { color: '#fff', fontSize: 48, fontWeight: '900' },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteFort: { color: c.text, fontSize: 19, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  record: { color: OR_RECOMPENSE, fontWeight: '800' },
  legende: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 14, gap: 6 },
  legendeItem: { flex: 1, alignItems: 'center' },
  legendeDessin: { height: 34, alignItems: 'center', justifyContent: 'center' },
  legendeTexte: { color: c.textSoft, fontSize: 12, fontWeight: '600', marginTop: 4 },
  legSac: { width: 24, height: 26, borderRadius: 4, backgroundColor: BRAND, alignItems: 'center' },
  legAnse: {
    position: 'absolute', top: -6, width: 12, height: 10, borderTopLeftRadius: 6, borderTopRightRadius: 6,
    borderWidth: 2, borderBottomWidth: 0, borderColor: BRAND,
  },
  legBooster: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F26B3A', alignItems: 'center', justifyContent: 'center' },
  legPolice: { width: 30, height: 30, borderRadius: 15, backgroundColor: ROUGE, alignItems: 'center', justifyContent: 'center' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
