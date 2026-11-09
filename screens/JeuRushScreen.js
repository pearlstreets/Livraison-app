/**
 * Mini-jeu « Rush en ville », pour patienter entre deux courses.
 *
 * Le livreur court dans une rue à 3 voies qui défile : glisser à gauche ou à
 * droite pour changer de voie, vers le haut pour sauter (barrières, plots),
 * vers le bas pour se baisser (échafaudages). Il ramasse les colis (10
 * points), le colis doré (50 points) et l'aimant à colis. Vitesse qui monte,
 * fin au premier obstacle touché. Jeu dur : vitesse qui monte vite, motifs
 * combinés, voitures qui mettent leur clignotant puis changent de voie, un
 * palier (décor et couleurs du quartier) tous les 1000 m annoncé à l'écran.
 * Logique pure : utils/jeuRush.js.
 *
 * Rendu : l'état vit dans des refs, la boucle (requestAnimationFrame) ne
 * déplace que des Animated.Value ; React ne redessine qu'à l'arrivée ou au
 * départ d'un objet et pour le score (10 fois par seconde au plus).
 * Pause automatique (hooks/usePauseJeu.js). Aucun son.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  VOIES, nouvellePartie, remplir, avancer, score as scorePartie, hauteurSaut,
  gauche, droite, sauter, glisser, clignotant, zonePour,
} from '../utils/jeuRush';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(genre) {
  try {
    if (!Haptics) return;
    const promesse = genre === 'choc'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'rush';
const OR = '#F2B705';
const METRES_VISIBLES = 34; // longueur de rue visible (assez pour lire les clignotants)
const METRES_DERRIERE = 3.2; // rue visible derrière le livreur
const TROTTOIR = 14;
const SEUIL_GESTE = 22; // px
const TAILLE_LIVREUR = 46;
const COULEURS_VOITURE = ['#2F80ED', '#E74C3C', '#27AE60', '#8E44AD', '#F2994A'];
const ORANGE_CLIGNOTANT = '#FF9F1A';
// Un décor par quartier : centre, port, zone industrielle, gare, périphérique, nuit.
const ZONES = [
  { route: '#4A4F58', routeSombre: '#2B2E34', trottoir: '#C9CDD3', trottoirSombre: '#4B4F57', trait: 'rgba(255,255,255,0.75)' },
  { route: '#3E5C76', routeSombre: '#223648', trottoir: '#B7C9D6', trottoirSombre: '#3C5568', trait: 'rgba(227,242,253,0.85)' },
  { route: '#5B5346', routeSombre: '#33302A', trottoir: '#CBB994', trottoirSombre: '#6B5E43', trait: 'rgba(255,213,79,0.9)' },
  { route: '#4F4A6B', routeSombre: '#2B2840', trottoir: '#CFC8E6', trottoirSombre: '#5A5478', trait: 'rgba(255,255,255,0.8)' },
  { route: '#3F4A44', routeSombre: '#222B27', trottoir: '#AEC4B5', trottoirSombre: '#46594D', trait: 'rgba(197,225,165,0.9)' },
  { route: '#1F2433', routeSombre: '#10131C', trottoir: '#6C7596', trottoirSombre: '#2F3550', trait: 'rgba(255,183,77,0.9)' },
];

export default function JeuRushScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const idLivreur = user?.id;
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | choc | fin
  const phaseRef = useRef('accueil');
  const [, setVersion] = useState(0);
  const [affiche, setAffiche] = useState({ score: 0, colis: 0, aimant: false, palier: 0 });
  const [meilleur, setMeilleur] = useState(0);
  const [resultat, setResultat] = useState(null); // { score, distance, colis, nouveauRecord }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const tailleRef = useRef({ l: 0, h: 0 });

  const partieRef = useRef(nouvellePartie());
  const rafRef = useRef(null);
  const dernierRef = useRef(null);
  const dernierAffichageRef = useRef(0);
  const minuteurFinRef = useRef(null);
  const monteRef = useRef(true);

  // Valeurs animées : livreur, marquage au sol, un couple (x, y) par objet.
  const livreurX = useRef(new Animated.Value(0)).current;
  const livreurLeve = useRef(new Animated.Value(0)).current;
  const livreurEchelle = useRef(new Animated.Value(1)).current;
  const livreurEcrase = useRef(new Animated.Value(1)).current;
  const ombreEchelle = useRef(new Animated.Value(1)).current;
  const marquage = useRef(new Animated.Value(0)).current;
  const valeursRef = useRef(new Map()); // id -> { x, y, clig }
  const [banniere, setBanniere] = useState(-1); // palier annoncé à l'écran (-1 = rien)
  const banniereOpacite = useRef(new Animated.Value(0)).current;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  useEffect(() => {
    monteRef.current = true;
    chargerRecord(JEU, idLivreur).then((r) => { if (monteRef.current) setMeilleur(r.meilleur); });
    envoyerRecordEnAttente(JEU, idLivreur).catch(() => {});
    return () => {
      monteRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    };
  }, [idLivreur]);

  // Géométrie de la rue.
  const geo = useCallback(() => {
    const { l, h } = tailleRef.current;
    const route = Math.max(1, l - TROTTOIR * 2);
    const voie = route / VOIES;
    const ppm = h / METRES_VISIBLES;
    const yLivreur = h - METRES_DERRIERE * ppm; // ligne du livreur (en px depuis le haut)
    return { route, voie, ppm, yLivreur, centre: (x) => TROTTOIR + voie * (x + 0.5) };
  }, []);

  const valeur = useCallback((id) => {
    let v = valeursRef.current.get(id);
    if (!v) {
      v = { x: new Animated.Value(0), y: new Animated.Value(-9999), clig: new Animated.Value(0) };
      valeursRef.current.set(id, v);
    }
    return v;
  }, []);

  // Place tous les objets à l'écran (appelé à chaque image).
  const positionner = useCallback(() => {
    const e = partieRef.current;
    const g = geo();
    if (tailleRef.current.h <= 0) return;
    const vus = new Set();
    for (let i = 0; i < e.obstacles.length; i += 1) {
      const o = e.obstacles[i];
      vus.add(o.id);
      const v = valeur(o.id);
      v.y.setValue(g.yLivreur - (o.pos + o.longueur - e.distance) * g.ppm);
      if (o.mobile) {
        // Voiture qui change de voie : elle glisse et son clignotant s'allume.
        v.x.setValue((o.x - o.voie) * g.voie);
        v.clig.setValue(clignotant(e, o) ? 1 : 0);
      }
    }
    for (let i = 0; i < e.colis.length; i += 1) {
      const c = e.colis[i];
      vus.add(c.id);
      const v = valeur(c.id);
      const z = c.pos - e.distance;
      v.y.setValue(g.yLivreur - z * g.ppm);
      // Aimant : les colis proches glissent vers le livreur.
      let x = c.voie;
      if (e.aimant > 0 && !c.aimant && z < 9) {
        const k = Math.max(0, Math.min(1, 1 - z / 9));
        x = c.voie + (e.x - c.voie) * k;
      }
      v.x.setValue(g.centre(x));
    }
    valeursRef.current.forEach((_, id) => { if (!vus.has(id)) valeursRef.current.delete(id); });

    livreurX.setValue(g.centre(e.x) - TAILLE_LIVREUR / 2);
    const h = hauteurSaut(e);
    livreurLeve.setValue(-h * g.ppm * 1.4);
    livreurEchelle.setValue(1 + h * 0.35);
    ombreEchelle.setValue(1 - h * 0.45);
    livreurEcrase.setValue(e.glisse > 0 ? 0.55 : 1);
    const pas = g.ppm * 4;
    marquage.setValue(pas > 0 ? (e.distance * g.ppm) % pas : 0);
  }, [geo, valeur, livreurX, livreurLeve, livreurEchelle, ombreEchelle, livreurEcrase, marquage]);

  const montrerBanniere = useCallback((palier) => {
    setBanniere(palier);
    banniereOpacite.stopAnimation();
    banniereOpacite.setValue(0);
    Animated.sequence([
      Animated.timing(banniereOpacite, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1700),
      Animated.timing(banniereOpacite, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [banniereOpacite]);

  const arreterBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dernierRef.current = null;
  }, []);

  const terminer = useCallback(() => {
    arreterBoucle();
    vibrer('choc');
    const e = partieRef.current;
    const s = scorePartie(e);
    changerPhase('choc');
    const base = { score: s, distance: Math.floor(e.distance), colis: e.nbColis + e.nbExpress, palier: e.palier + 1, nouveauRecord: false };
    setResultat(base);
    finDePartie(JEU, idLivreur, s).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setResultat({ ...base, nouveauRecord: r.nouveauRecord });
    }).catch(() => {});
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    minuteurFinRef.current = setTimeout(() => {
      if (monteRef.current && phaseRef.current === 'choc') changerPhase('fin');
    }, 650);
  }, [arreterBoucle, changerPhase, idLivreur]);

  const image = useCallback((ts) => {
    rafRef.current = null;
    if (phaseRef.current !== 'jeu') return;
    const e = partieRef.current;
    const dt = dernierRef.current == null ? 0 : (ts - dernierRef.current) / 1000;
    dernierRef.current = ts;
    const res = avancer(e, dt);
    positionner();
    if (res.fin) {
      setVersion((v) => v + 1);
      terminer();
      return;
    }
    if (res.palier) montrerBanniere(res.palier);
    if (res.express || res.aimant) vibrer('bonus');
    if (res.change) setVersion((v) => v + 1);
    if (res.change || ts - dernierAffichageRef.current > 100) {
      dernierAffichageRef.current = ts;
      const s = scorePartie(e);
      const n = e.nbColis + e.nbExpress;
      const a = e.aimant > 0;
      const pal = e.palier;
      setAffiche((p) => (p.score === s && p.colis === n && p.aimant === a && p.palier === pal ? p : { score: s, colis: n, aimant: a, palier: pal }));
    }
    rafRef.current = requestAnimationFrame(imageRef.current);
  }, [positionner, terminer, montrerBanniere]);
  const imageRef = useRef(image);
  imageRef.current = image;

  const lancerBoucle = useCallback(() => {
    arreterBoucle();
    rafRef.current = requestAnimationFrame((ts) => imageRef.current(ts));
  }, [arreterBoucle]);

  const jouer = useCallback(() => {
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    const e = nouvellePartie();
    remplir(e);
    partieRef.current = e;
    valeursRef.current.clear();
    setResultat(null);
    setClassementOuvert(false);
    setAffiche({ score: 0, colis: 0, aimant: false, palier: 0 });
    montrerBanniere(0);
    positionner();
    setVersion((v) => v + 1);
    changerPhase('jeu');
    lancerBoucle();
  }, [changerPhase, lancerBoucle, positionner, montrerBanniere]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    arreterBoucle();
    changerPhase('pause');
  }, [arreterBoucle, changerPhase]);

  const reprendre = useCallback(() => {
    if (phaseRef.current !== 'pause') return;
    changerPhase('jeu');
    lancerBoucle();
  }, [changerPhase, lancerBoucle]);

  const { alerteCourse, fermerAlerte } = usePauseJeu(pause);

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

  // Gestes : un seul mouvement par glissé, décidé dès le seuil franchi.
  const gesteFait = useRef(false);
  const gestes = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => phaseRef.current === 'jeu',
    onMoveShouldSetPanResponder: () => phaseRef.current === 'jeu',
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { gesteFait.current = false; },
    onPanResponderMove: (_, g) => {
      if (gesteFait.current || phaseRef.current !== 'jeu') return;
      const ax = Math.abs(g.dx);
      const ay = Math.abs(g.dy);
      if (Math.max(ax, ay) < SEUIL_GESTE) return;
      gesteFait.current = true;
      const e = partieRef.current;
      if (ax > ay) {
        if (g.dx < 0) gauche(e); else droite(e);
      } else if (g.dy < 0) sauter(e);
      else glisser(e);
    },
    onPanResponderRelease: () => { gesteFait.current = false; },
    onPanResponderTerminate: () => { gesteFait.current = false; },
  }), []);

  const surMesure = useCallback((ev) => {
    const l = Math.round(ev.nativeEvent.layout.width);
    const h = Math.round(ev.nativeEvent.layout.height);
    if (l !== tailleRef.current.l || h !== tailleRef.current.h) {
      tailleRef.current = { l, h };
      setTaille({ l, h });
      positionner();
    }
  }, [positionner]);

  const g = geo();
  const e = partieRef.current;
  const pret = taille.h > 0 && taille.l > 0;
  const largeurObjet = g.voie * 0.76;
  const pas = g.ppm * 4;
  const nbTraits = pas > 0 ? Math.ceil(taille.h / pas) + 2 : 0;
  const tailleColis = Math.max(26, Math.min(40, g.voie * 0.34));
  const zone = ZONES[zonePour(affiche.palier)];
  const couleurRoute = dark ? zone.routeSombre : zone.route;
  const couleurTrottoir = dark ? zone.trottoirSombre : zone.trottoir;
  const zoneBanniere = ZONES[zonePour(Math.max(0, banniere))];

  return (
    <View style={[styles.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      {/* Barre du haut : quitter, score, colis, pause */}
      <View style={styles.haut}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.infos}>
          <Text style={styles.titreJeu} numberOfLines={1}>{t('jeuScore', { n: affiche.score })}</Text>
          <View style={styles.ligneColis}>
            <MaterialCommunityIcons name="package-variant-closed" size={15} color={BRAND} />
            <Text style={styles.sousTitre}>{affiche.colis}</Text>
            <Text style={styles.palierHud} numberOfLines={1}>
              {t('jeuxRushPalier', { n: affiche.palier + 1 })} · {t(`jeuxRushZone${zonePour(affiche.palier)}`)}
            </Text>
            {affiche.aimant && (
              <View style={styles.pastilleAimant}>
                <MaterialCommunityIcons name="magnet" size={13} color="#fff" />
                <Text style={styles.pastilleAimantTexte} numberOfLines={1}>{t('jeuxRushAimant')}</Text>
              </View>
            )}
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

      {/* La rue */}
      <View
        style={[styles.piste, { backgroundColor: couleurRoute }]}
        onLayout={surMesure}
        {...gestes.panHandlers}
      >
        {pret && (
          <>
            <View style={[styles.trottoir, { left: 0, width: TROTTOIR, backgroundColor: couleurTrottoir }]} />
            <View style={[styles.trottoir, { right: 0, width: TROTTOIR, backgroundColor: couleurTrottoir }]} />
            {/* Marquage des voies */}
            <Animated.View
              pointerEvents="none"
              style={[styles.calque, { top: -pas, transform: [{ translateY: marquage }] }]}
            >
              {[1, 2].map((k) => Array.from({ length: nbTraits }).map((_, i) => (
                <View
                  key={`${k}-${i}`}
                  style={[styles.trait, {
                    backgroundColor: zone.trait,
                    left: TROTTOIR + g.voie * k - 2,
                    top: i * pas,
                    height: pas * 0.5,
                  }]}
                />
              )))}
              {[0, 1].map((k) => Array.from({ length: nbTraits }).map((_, i) => (
                <View
                  key={`b${k}-${i}`}
                  style={[styles.bordure, {
                    left: k === 0 ? TROTTOIR - 3 : taille.l - TROTTOIR,
                    top: i * pas,
                    height: pas * 0.5,
                  }]}
                />
              )))}
            </Animated.View>

            {/* Colis et bonus */}
            {e.colis.map((c) => {
              const v = valeur(c.id);
              return (
                <Animated.View
                  key={c.id}
                  pointerEvents="none"
                  style={[styles.objet, {
                    width: tailleColis,
                    height: tailleColis,
                    marginLeft: -tailleColis / 2,
                    marginTop: -tailleColis / 2,
                    transform: [{ translateX: v.x }, { translateY: v.y }],
                  }]}
                >
                  <Colis colis={c} taille={tailleColis} styles={styles} />
                </Animated.View>
              );
            })}

            {/* Obstacles */}
            {e.obstacles.map((o) => {
              const v = valeur(o.id);
              const haut = Math.max(16, o.longueur * g.ppm);
              return (
                <Animated.View
                  key={o.id}
                  pointerEvents="none"
                  style={[styles.objet, {
                    left: TROTTOIR + g.voie * o.voie + (g.voie - largeurObjet) / 2,
                    width: largeurObjet,
                    height: haut,
                    transform: [{ translateX: v.x }, { translateY: v.y }],
                  }]}
                >
                  <Obstacle obstacle={o} largeur={largeurObjet} hauteur={haut} styles={styles} clig={v.clig} />
                </Animated.View>
              );
            })}

            {/* Annonce du palier */}
            {banniere >= 0 && (
              <Animated.View
                pointerEvents="none"
                style={[styles.banniere, { opacity: banniereOpacite, borderColor: zoneBanniere.trait }]}
              >
                <Text style={styles.banniereTitre} numberOfLines={1}>{t('jeuxRushPalier', { n: banniere + 1 })}</Text>
                <Text style={styles.banniereZone} numberOfLines={1}>{t(`jeuxRushZone${zonePour(banniere)}`)}</Text>
              </Animated.View>
            )}

            {/* Livreur */}
            <Animated.View
              pointerEvents="none"
              style={[styles.ombre, {
                top: g.yLivreur + TAILLE_LIVREUR / 2 - 8,
                transform: [{ translateX: livreurX }, { scale: ombreEchelle }],
              }]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.livreur, {
                top: g.yLivreur - TAILLE_LIVREUR / 2,
                transform: [
                  { translateX: livreurX },
                  { translateY: livreurLeve },
                  { scale: livreurEchelle },
                  { scaleY: livreurEcrase },
                ],
              }, phase === 'choc' && { backgroundColor: colors.danger }]}
            >
              <MaterialCommunityIcons name="run-fast" size={30} color="#fff" />
            </Animated.View>
          </>
        )}
      </View>

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
                <Text style={styles.texteDiscret}>{t('jeuxRushAstuce')}</Text>
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
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && resultat && (
              <>
                <Ionicons name={resultat.nouveauRecord ? 'trophy' : 'alert-circle'} size={44} color={resultat.nouveauRecord ? OR : colors.danger} />
                <Text style={styles.titre}>{resultat.nouveauRecord ? t('jeuxRushNouveauRecord') : t('jeuxRushChoc')}</Text>
                <Text style={styles.texteFort}>{t('jeuScore', { n: resultat.score })}</Text>
                <Text style={styles.texteDiscret}>
                  {t('jeuxRushDistance', { n: resultat.distance })}  ·  {t('jeuxRushColis', { n: resultat.colis })}  ·  {t('jeuxRushPalier', { n: resultat.palier })}
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

const Colis = React.memo(function Colis({ colis, taille, styles }) {
  if (colis.aimant) {
    return (
      <View style={[styles.bonus, { width: taille, height: taille, borderRadius: taille / 2 }]}>
        <MaterialCommunityIcons name="magnet" size={taille * 0.62} color="#E74C3C" />
      </View>
    );
  }
  return (
    <View style={[styles.colis, colis.express && styles.colisExpress, { width: taille, height: taille, borderRadius: taille * 0.22 }]}>
      <MaterialCommunityIcons name="package-variant-closed" size={taille * 0.7} color={colis.express ? '#fff' : '#7A4A1E'} />
    </View>
  );
});

const Obstacle = React.memo(function Obstacle({ obstacle, largeur, hauteur, styles, clig }) {
  const { type, couleur } = obstacle;
  if (type === 'voiture') {
    const fond = COULEURS_VOITURE[couleur % COULEURS_VOITURE.length];
    return (
      <View style={[styles.voiture, { backgroundColor: fond }]}>
        <View style={[styles.vitre, { height: hauteur * 0.18, marginTop: hauteur * 0.12 }]} />
        <View style={[styles.toit, { height: hauteur * 0.34 }]} />
        <View style={[styles.vitre, { height: hauteur * 0.12 }]} />
        <View style={styles.feux}>
          <View style={styles.feu} />
          <View style={styles.feu} />
        </View>
        {obstacle.mobile && (
          <>
            <Animated.View
              style={[styles.clignotant, { opacity: clig, bottom: 2 }, obstacle.vers > obstacle.voie ? { right: -4 } : { left: -4 }]}
            />
            <Animated.View
              style={[styles.clignotant, { opacity: clig, top: 2 }, obstacle.vers > obstacle.voie ? { right: -4 } : { left: -4 }]}
            />
          </>
        )}
      </View>
    );
  }
  if (type === 'barriere') {
    return (
      <View style={styles.barriere}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.rayure, { backgroundColor: i % 2 ? '#fff' : '#E53935' }]} />
        ))}
      </View>
    );
  }
  if (type === 'echafaudage') {
    return (
      <View style={styles.echafaudage}>
        <View style={styles.poutre}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.rayure, { backgroundColor: i % 2 ? '#222' : OR }]} />
          ))}
        </View>
        <View style={styles.pieds}>
          <View style={styles.pied} />
          <View style={styles.pied} />
        </View>
      </View>
    );
  }
  const icones = {
    trottinette: { nom: 'scooter-electric', fond: '#16A085' },
    poubelle: { nom: 'trash-can', fond: '#2E7D32' },
    plot: { nom: 'traffic-cone', fond: 'transparent' },
  };
  const i = icones[type] || icones.poubelle;
  const taille = Math.min(largeur, Math.max(hauteur, 26)) * 0.8;
  return (
    <View style={[styles.tuile, { backgroundColor: i.fond }, type === 'plot' && styles.tuilePlot]}>
      <MaterialCommunityIcons name={i.nom} size={taille} color={type === 'plot' ? '#FF7A1A' : '#fff'} />
    </View>
  );
});

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
  clignotant: {
    position: 'absolute', width: 11, height: 9, borderRadius: 3, backgroundColor: ORANGE_CLIGNOTANT,
    borderWidth: 1, borderColor: '#fff',
  },
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
  ombre: {
    position: 'absolute', left: 0, width: TAILLE_LIVREUR, height: 12, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  livreur: {
    position: 'absolute', left: 0, width: TAILLE_LIVREUR, height: TAILLE_LIVREUR, borderRadius: TAILLE_LIVREUR / 2,
    backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
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
