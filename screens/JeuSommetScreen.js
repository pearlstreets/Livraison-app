/**
 * Mini-jeu « Livraison au sommet » (clé sommet), même jeu que l'app cliente
 * (AppUser src/screens/Jeux/SommetScreen.js), pour patienter entre deux courses.
 *
 * Le livreur Pearl Streets grimpe la façade en rebondissant tout seul de
 * balcon en balcon. Le joueur ne fait que diriger : doigt posé sur un côté,
 * il part de ce côté tant que le doigt est posé ; un balayage lance un grand
 * écart ; doigt arrêté ou levé, il repart tout droit. Colis à ramasser (5 points),
 * pots de fleurs et pigeons à éviter (sauf en sautant dessus), stores qui
 * se déchirent, nacelles, matelas, monte-charge, et trois bonus : aimant à
 * colis, casque et filet de sécurité. Un palier tous les 50 étages.
 *
 * Boucle requestAnimationFrame (logique pure dans utils/jeux/sommet.js,
 * état dans une ref, 60 images par seconde au plus) qui ne tourne qu'en
 * phase « jeu ». Pause automatique (hooks/usePauseJeu.js) : bouton, retour,
 * app en arrière-plan, écran quitté, et nouvelle course annoncée (fiche de
 * la vraie course dans le jeu, components/AlerteCourseJeu.js). Partie
 * enregistrée à la pause, à la fin et toutes les 4 s ; reprise de moins de
 * 24 h avec choix Reprendre ou Recommencer (le livreur repart du trottoir
 * avec ses étages, colis et bonus). Records envoyés au classement des
 * livreurs (useEnvoiRecord).
 */
import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, PanResponder, Dimensions} from 'react-native';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../contexts/LanguageContext';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu, reprendreAncienRecord} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import useBandeauClassement from '../utils/jeux/useBandeauClassement';
import useReprise from '../utils/jeux/sauvegardePartie';
import useRecompenses from '../utils/jeux/useRecompenses';
import ClassementJeu from '../components/jeux/ClassementJeu';
import HudJeu from '../components/jeux/HudJeu';
import BandeauClassement, {formaterNombre} from '../components/jeux/BandeauClassement';
import {CouchePopups, BanniereRecompense, RecapRecompenses, OR_FONCE} from '../components/jeux/RecompensesJeu';
import FenetreReprise from '../components/jeux/FenetreReprise';
import IndiceGestes from '../components/jeux/IndiceGestes';
import SonJeux, {demarrerMusique, arreterMusique, bruit, ReglagesSon} from '../components/jeux/SonJeux';
import {
  Etage,
  Plateforme,
  Colis,
  ObjetBonus,
  Pot,
  Pigeon,
  Livreur,
  Filet,
  BONUS_VUE,
  OR_SOMMET,
  paletteSommet,
} from '../components/jeux/DecorSommet';
import {
  MONDE_L,
  ETAGE,
  JOUEUR_L,
  JOUEUR_H,
  POINTS_COLIS,
  BONUS,
  TYPES_BONUS,
  avancer,
  partieNeuve,
  reprendreCourse,
  instantaneCourse,
  niveauSommet,
  sauvegardeNeuve,
  cleSauvegarde,
  chargerPartie,
  enregistrerPartie,
  doigtPose,
  doigtGlisse,
  doigtLeve,
  doigtAvance,
} from '../utils/jeux/sommet';

const JEU = 'sommet';
// Parties fixes de l'écran (barre du haut, bandeau, aide aux gestes) :
// redessinées seulement quand ce qu'elles montrent change, pas à chaque image.
const memesBoosters = (a, b) =>
  a.length === b.length &&
  a.every((x, i) => x.cle === b[i].cle && Math.round(x.reste * 40) === Math.round(b[i].reste * 40));
const HudFige = memo(
  HudJeu,
  (a, b) =>
    a.score === b.score &&
    a.niveau === b.niveau &&
    a.pauseActive === b.pauseActive &&
    a.onPause === b.onPause &&
    a.onQuitter === b.onQuitter &&
    a.objets.n === b.objets.n &&
    a.objets.total === b.objets.total &&
    a.objets.libelle === b.objets.libelle &&
    memesBoosters(a.boosters, b.boosters),
);
const BandeauFige = memo(
  BandeauClassement,
  (a, b) =>
    a.style === b.style &&
    ['rang', 'record', 'classe', 'annonce', 'recharger'].every(k => a.bandeau[k] === b.bandeau[k]) &&
    a.bandeau.top1?.score === b.bandeau.top1?.score &&
    a.bandeau.top1?.nom === b.bandeau.top1?.nom,
);
const IndiceFige = memo(IndiceGestes, (a, b) => a.jeu === b.jeu && a.actif === b.actif);


// Vibration légère (Android seulement), le jeu marche sans.
function vibrer(fort) {
  try {
    // eslint-disable-next-line global-require
    require('../utils/jeux/haptique').vibrer(fort ? [0, 40] : [0, 12]);
  } catch (e) {
    // Sans vibration.
  }
}

// Bruitage de chaque événement du jeu (utils/jeux/sommet.js). Pas de son
// « bonus » côté client : « vie » le remplace.
const SONS_SOMMET = {
  rebond: 'saut',
  store: 'saut',
  trampo: 'booster',
  monte: 'booster',
  colis: 'ramasse',
  pigeon: 'ramasse',
  touche: 'choc',
  palier: 'niveau',
  fin: 'perdu',
  aimant: 'vie',
  casque: 'vie',
  filet: 'vie',
  protege: 'choc',
  sauve: 'booster',
};

// Textes des bonus (contexts/traductionsJeux/sommet.js).
const TEXTES_BONUS = {
  aimant: {titre: 'jeuxSommetBonusAimant', texte: 'jeuxSommetBonusAimantTexte'},
  casque: {titre: 'jeuxSommetBonusCasque', texte: 'jeuxSommetBonusCasqueTexte'},
  filet: {titre: 'jeuxSommetBonusFilet', texte: 'jeuxSommetBonusFiletTexte'},
};
// Annonce d'un événement de bonus : bonus concerné et clé du texte.
const ANNONCES_BONUS = {
  aimant: {bonus: 'aimant'},
  casque: {bonus: 'casque'},
  filet: {bonus: 'filet'},
  protege: {bonus: 'casque', texte: 'jeuxSommetSauveCasque'},
  sauve: {bonus: 'filet', texte: 'jeuxSommetSauveFilet'},
};
// Jauge des bonus actifs dans le HUD (icônes Ionicons).
const BOOSTERS_HUD = {
  aimant: 'magnet',
  casque: 'shield-checkmark',
  filet: 'grid',
};

const DUREE_ANNONCE_BONUS = 2.2; // secondes de jeu
const HAUTEUR_MIN = 520; // hauteur de monde toujours visible (tablettes : façade centrée)
const IMAGE_MIN = 15; // ms : au plus 60 images calculées par seconde, même sur un écran 120 Hz
const PERIODE_SAUVEGARDE = 4000; // ms
const PALIER_OBJETS = 50; // le compteur de colis avance par paliers (partie sans fin)
const JOUEUR_DEPART = {x: MONDE_L / 2, y: 0, vx: 0, vy: 0, rot: 0, regard: 1};

export default function JeuSommetScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser, connecte} = useCompteJeu();
  const cle = useMemo(() => cleSauvegarde(idUser), [idUser]);

  const [etat, setEtat] = useState(null); // sauvegarde ; phase : accueil | jeu | pause | fin
  const etatRef = useRef(null);
  const courseRef = useRef(null);
  const [, setImage] = useState(0);
  const [taille, setTaille] = useState({l: 0, h: 0});
  const [fin, setFin] = useState(null); // {score, etage, colis, cause, record}
  const [classementOuvert, setClassementOuvert] = useState(false);

  const dirRef = useRef(0);
  const doigtRef = useRef(null);
  const dernierRef = useRef(0);
  const rafRef = useRef(null);
  const sauveRef = useRef(0);
  const monteRef = useRef(true);
  const annonceBonusRef = useRef(null); // {bonus, texte, fin} en secondes de jeu
  const popupsRef = useRef(null);
  const banniereRef = useRef(null);
  const repriseRef = useRef(null);
  const jouerRef = useRef(null);

  // Échelle : largeur du monde = largeur de la zone, mais toujours au moins
  // HAUTEUR_MIN unités visibles en hauteur.
  const s = taille.l > 0 ? Math.min(taille.l / MONDE_L, taille.h / HAUTEUR_MIN) : 1;
  const largeurMonde = MONDE_L * s;
  const decalage = (taille.l - largeurMonde) / 2;
  const visibleH = taille.h > 0 ? taille.h / s : 640;
  const visibleRef = useRef(visibleH);
  visibleRef.current = visibleH;
  const tailleRef = useRef(taille);
  tailleRef.current = taille;
  useEffect(() => {
    if (courseRef.current) courseRef.current.visibleH = visibleH;
  }, [visibleH]);

  const e = courseRef.current;
  const phase = etat?.phase || 'accueil';
  const enJeu = phase === 'jeu';
  const avecCourse = !!e && phase !== 'accueil';
  const score = avecCourse ? e.score : 0;
  const niveau = avecCourse ? niveauSommet(e.etage) : 1;

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    JEU,
    etat?.meilleurScore || 0,
    etat?.meilleurNiveau || 1,
    enJeu,
    enJeu ? 0 : score,
    enJeu ? 1 : niveau,
  );

  // Récompenses visibles : « +5 » au colis, paliers de score, record.
  const recompenses = useRecompenses({
    score,
    enPartie: enJeu,
    meilleurScore: etat?.meilleurScore || 0,
    lireMaxMois,
    surAnnonce: a => {
      if (a.type === 'record') {
        bruit('record');
        banniereRef.current?.annoncer({texte: t('jeuRecompRecord'), icone: 'trophy', couleur: OR_FONCE});
      } else {
        banniereRef.current?.annoncer({texte: t('jeuRecompPalier', {n: formaterNombre(a.n)}), icone: 'ribbon', couleur: C.marque});
      }
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  const bandeauClassement = useBandeauClassement(JEU, {
    score,
    meilleurLocal: etat ? etat.meilleurScore : null,
    enPartie: enJeu,
  });

  const appliquer = useCallback(
    (nouvel, sauver = true) => {
      etatRef.current = nouvel;
      if (monteRef.current) setEtat(nouvel);
      if (sauver) enregistrerPartie(cle, nouvel);
    },
    [cle],
  );

  /** Sauvegarde avec la course en cours et les records à jour. */
  const avecLaCourse = useCallback((base, course, nouvellePhase) => {
    return {
      ...base,
      phase: nouvellePhase,
      course: nouvellePhase === 'fin' ? null : instantaneCourse(course),
      meilleurScore: Math.max(base.meilleurScore || 0, course.score),
      meilleurNiveau: Math.max(base.meilleurNiveau || 1, niveauSommet(course.etage)),
    };
  }, []);

  /** Copie de la course pour la reprise (24 h), toujours en pause au retour. */
  const garderReprise = useCallback(
    (base, course) => {
      if (course.score <= 0) return;
      repriseRef.current?.enregistrer(avecLaCourse(base, course, 'pause'), {niveau: niveauSommet(course.etage), score: course.score});
    },
    [avecLaCourse],
  );

  const arreterBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dirRef.current = 0;
    doigtRef.current = null;
    arreterMusique();
  }, []);

  const redessiner = useCallback(() => {
    if (monteRef.current) setImage(n => (n + 1) % 1000000);
  }, []);

  const terminer = useCallback(() => {
    const course = courseRef.current;
    const base = etatRef.current;
    arreterBoucle();
    if (!course || !base) return;
    vibrer(true);
    const record = course.score > (base.meilleurScore || 0);
    if (record) bruit('record');
    annonceBonusRef.current = null;
    popupsRef.current?.vider();
    banniereRef.current?.effacer();
    setFin({score: course.score, etage: course.etage, colis: course.colis, cause: course.cause, record});
    appliquer(avecLaCourse(base, course, 'fin'));
    // Partie perdue : plus de reprise.
    repriseRef.current?.effacer();
    redessiner();
  }, [appliquer, arreterBoucle, avecLaCourse, redessiner]);

  const image = useCallback(
    ts => {
      const course = courseRef.current;
      if (!course || etatRef.current?.phase !== 'jeu') {
        rafRef.current = null;
        return;
      }
      // Écran 90 ou 120 Hz : 60 calculs par seconde au plus, moins de chauffe.
      if (dernierRef.current && ts - dernierRef.current < IMAGE_MIN) {
        rafRef.current = requestAnimationFrame(imageRef.current);
        return;
      }
      const dt = dernierRef.current ? (ts - dernierRef.current) / 1000 : 0;
      dernierRef.current = ts;
      const evts = avancer(course, dt, doigtRef.current ? doigtAvance(doigtRef.current, dt) : dirRef.current);
      for (let i = 0; i < evts.length; i += 1) {
        const ev = evts[i];
        if (ev === 'colis' || ev === 'trampo' || ev === 'monte' || ev === 'pigeon' || ANNONCES_BONUS[ev]) vibrer(ev === 'protege');
        else if (ev === 'touche') vibrer(true);
        if (SONS_SOMMET[ev]) bruit(SONS_SOMMET[ev]);
        if (ANNONCES_BONUS[ev]) annonceBonusRef.current = {...ANNONCES_BONUS[ev], fin: course.t + DUREE_ANNONCE_BONUS};
        if (ev === 'colis') {
          const z = tailleRef.current;
          const echelle = z.l > 0 ? Math.min(z.l / MONDE_L, z.h / HAUTEUR_MIN) : 1;
          const gauche = (z.l - MONDE_L * echelle) / 2;
          popupsRef.current?.ajouter({
            x: gauche + course.joueur.x * echelle,
            y: z.h - (course.joueur.y + JOUEUR_H + 10 - course.cam) * echelle,
            texte: `+${POINTS_COLIS}`,
            couleur: C.marque,
            icone: 'cube',
          });
        }
      }
      if (course.phase === 'fin') {
        terminer();
        return;
      }
      if (ts - sauveRef.current > PERIODE_SAUVEGARDE) {
        sauveRef.current = ts;
        enregistrerPartie(cle, avecLaCourse(etatRef.current, course, 'jeu'));
        garderReprise(etatRef.current, course);
      }
      redessiner();
      rafRef.current = requestAnimationFrame(imageRef.current);
    },
    [avecLaCourse, cle, garderReprise, redessiner, terminer],
  );
  const imageRef = useRef(image);
  imageRef.current = image;

  const lancerBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    dernierRef.current = 0;
    demarrerMusique(JEU);
    rafRef.current = requestAnimationFrame(ts => {
      dernierRef.current = ts;
      sauveRef.current = ts;
      rafRef.current = requestAnimationFrame(imageRef.current);
    });
  }, []);

  const pause = useCallback(() => {
    const base = etatRef.current;
    const course = courseRef.current;
    if (!base || !course || base.phase !== 'jeu') return;
    arreterBoucle();
    appliquer(avecLaCourse(base, course, 'pause'));
    garderReprise(base, course);
    redessiner();
  }, [appliquer, arreterBoucle, avecLaCourse, garderReprise, redessiner]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  // Pause automatique (retour, arrière-plan, écran quitté, annonce d'une course) : hooks/usePauseJeu.js.
  const estEnJeu = useCallback(() => etatRef.current?.phase === 'jeu', []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || etatRef.current?.phase !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: enJeu || (classementOuvert && phase === 'pause'),
    estEnJeu,
    fermerPanneau,
  });
  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [fermerAlerte, navigation, pause]);

  /** Reprise après la pause : la partie repart là où elle était. */
  const reprendre = useCallback(() => {
    const base = etatRef.current;
    if (!base || base.phase !== 'pause') return;
    // Course relue d'une sauvegarde : le livreur repart du trottoir.
    if (!courseRef.current) courseRef.current = reprendreCourse(base.course, visibleRef.current);
    dirRef.current = 0;
    doigtRef.current = null;
    appliquer({...base, phase: 'jeu'}, false);
    lancerBoucle();
  }, [appliquer, lancerBoucle]);

  const jouer = useCallback(() => {
    const base = etatRef.current;
    if (!base) return;
    arreterBoucle();
    const course = partieNeuve(visibleRef.current);
    courseRef.current = course;
    annonceBonusRef.current = null;
    setFin(null);
    setClassementOuvert(false);
    popupsRef.current?.vider();
    banniereRef.current?.effacer();
    recompensesRef.current.debut(0);
    repriseRef.current?.effacer();
    appliquer(avecLaCourse(base, course, 'jeu'));
    lancerBoucle();
  }, [appliquer, arreterBoucle, avecLaCourse, lancerBoucle]);
  jouerRef.current = jouer;

  const reprise = useReprise(JEU, {
    surReprendre: sauvee => {
      if (!sauvee?.course) {
        jouerRef.current?.();
        return;
      }
      const course = reprendreCourse(sauvee.course, visibleRef.current);
      courseRef.current = course;
      annonceBonusRef.current = null;
      setFin(null);
      popupsRef.current?.vider();
      banniereRef.current?.effacer();
      recompensesRef.current.debut(course.score);
      dirRef.current = 0;
      doigtRef.current = null;
      appliquer({...sauvee, phase: 'jeu'}, false);
      lancerBoucle();
    },
    surRecommencer: () => jouerRef.current?.(),
  });
  repriseRef.current = reprise;

  // Gestes : doigt posé sur un côté, le livreur va de ce côté ; un balayage
  // à gauche ou à droite lance un grand écart de ce côté,
  // le doigt posé continue de diriger ; ensuite (doigt levé, appui) tout droit.
  const enJeuRef = useRef(enJeu);
  enJeuRef.current = enJeu;
  const gestes = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enJeuRef.current,
        onMoveShouldSetPanResponder: () => enJeuRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_, g) => {
          // Appui sur la moitié gauche : à gauche ; sur la moitié droite : à droite.
          const cote = g.x0 < Dimensions.get('window').width / 2 ? -1 : 1;
          doigtRef.current = doigtPose(0, cote);
          dirRef.current = cote;
        },
        onPanResponderMove: (_, g) => {
          if (!enJeuRef.current || !doigtRef.current) return;
          dirRef.current = doigtGlisse(doigtRef.current, g.dx);
        },
        onPanResponderRelease: () => {
          dirRef.current = doigtLeve(doigtRef.current);
        },
        onPanResponderTerminate: () => {
          dirRef.current = doigtLeve(doigtRef.current);
        },
      }),
    [],
  );

  // Chargement de la partie enregistrée (une partie en cours revient en pause).
  useEffect(() => {
    let vivant = true;
    reprendreAncienRecord('sommet', idUser).then(() => chargerPartie(cle)).then(sauvegarde => {
      if (!vivant) return;
      courseRef.current = null;
      appliquer(sauvegarde, false);
      // Partie laissée en pause : Reprendre ou Recommencer (moins de 24 h), sinon départ à zéro.
      if (sauvegarde.phase === 'pause') {
        repriseRef.current?.verifier().then(({proposition, expiree}) => {
          if (!vivant || proposition || !expiree) return;
          appliquer(sauvegardeNeuve(sauvegarde));
        });
      }
    });
    return () => {
      vivant = false;
    };
  }, [cle, appliquer]);

  // Pause au démontage (le reste : usePauseJeu).
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      arreterMusique();
      monteRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const quitter = useCallback(() => {
    pause();
    if (navigation?.canGoBack?.()) navigation.goBack();
  }, [navigation, pause]);

  const confirmerNouvellePartie = useCallback(() => {
    Alert.alert(t('jeuNouvellePartieTitre'), t('jeuNouvellePartieTexte'), [
      {text: t('jeuAnnuler'), style: 'cancel'},
      {text: t('jeuNouvellePartie'), style: 'destructive', onPress: jouer},
    ]);
  }, [jouer, t]);

  const ouvrirClassement = useCallback(() => {
    pause();
    setClassementOuvert(true);
  }, [pause]);

  const surMesure = useCallback(ev => {
    const {width, height} = ev.nativeEvent.layout;
    setTaille(x => (Math.round(x.l) === Math.round(width) && Math.round(x.h) === Math.round(height) ? x : {l: width, h: height}));
  }, []);

  const palier = avecCourse ? e.palier : 0;
  const p = useMemo(() => paletteSommet(palier), [palier]);

  if (!etat) {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator color={C.marque} />
      </View>
    );
  }

  const cam = avecCourse ? e.cam : 0;
  const premierRang = Math.max(0, Math.floor(cam / ETAGE) - 1);
  const dernierRang = Math.floor((cam + visibleH) / ETAGE) + 1;
  const rangs = [];
  for (let r = premierRang; r <= dernierRang; r += 1) rangs.push(r);
  const joueur = avecCourse ? e.joueur : JOUEUR_DEPART;
  const casqueActif = avecCourse && (e.casque > 0 || e.invuln > 0);
  const aimantActif = avecCourse && e.aimant > 0;
  const ab = annonceBonusRef.current;
  const annonceBonus = avecCourse && ab && e.t < ab.fin ? ab : null;
  const decalageY = {transform: [{translateY: taille.h + cam * s}]};
  const fenetre = !enJeu && !classementOuvert && !reprise.proposition && !alerteCourse;
  const nColis = avecCourse ? e.colis : 0;
  const objets = {
    n: nColis,
    total: Math.max(PALIER_OBJETS, Math.ceil((nColis + 1) / PALIER_OBJETS) * PALIER_OBJETS),
    icone: 'cube',
    libelle: t('jeuxSommetColisRamasses', {n: nColis}),
  };
  const boosters = avecCourse
    ? TYPES_BONUS.filter(k => e[k] > 0).map(k => ({
        cle: k,
        icone: BOOSTERS_HUD[k],
        couleur: BONUS_VUE[k].couleur,
        reste: Math.max(0, Math.min(1, e[k] / BONUS[k].duree)),
      }))
    : [];
  const cause =
    fin?.cause === 'pot' ? 'jeuxSommetCausePot' : fin?.cause === 'pigeon' ? 'jeuxSommetCausePigeon' : 'jeuxSommetCauseChute';

  return (
    <View style={[styles.ecran, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
      <SonJeux />
      {/* Barre du haut commune : quitter, score, niveau, colis, bonus, pause */}
      <HudFige
        score={score}
        niveau={niveau}
        objets={objets}
        boosters={boosters}
        onPause={pause}
        onQuitter={quitter}
        pauseActive={enJeu}
      />
      <BandeauFige bandeau={bandeauClassement} style={styles.bandeau} />

      {/* Façade, plateformes, livreur, gêneurs ; gestes sur toute la zone */}
      <View style={[styles.zone, {backgroundColor: p.mur}]} onLayout={surMesure} {...gestes.panHandlers}>
        {taille.l > 0 && (
          <View
            pointerEvents="none"
            style={[styles.monde, {left: decalage, width: largeurMonde, height: taille.h, backgroundColor: p.mur}]}>
            <View style={[styles.calque, {width: largeurMonde}, decalageY]}>
              {rangs.map(r => (
                <Etage key={r} rang={r} s={s} p={p} />
              ))}
              {/* Trottoir et rue */}
              <View style={[styles.bande, {top: 0, height: 24 * s, backgroundColor: p.trottoir}]} />
              <View style={[styles.bande, {top: 24 * s, height: 400 * s, backgroundColor: p.route}]} />
            </View>
            <View style={[styles.calque, {width: largeurMonde}, decalageY]}>
              {avecCourse &&
                e.plateformes.map(pl => (
                  <Plateforme key={pl.id} type={pl.type} x={pl.x} y={pl.y} l={pl.l} rot={pl.rot} dechire={pl.dechire} s={s} p={p} />
                ))}
              {avecCourse && e.colisListe.map(c => <Colis key={c.id} x={c.x} y={c.y} s={s} p={p} />)}
              {avecCourse &&
                e.bonusListe.map(b => (
                  <ObjetBonus key={b.id} type={b.type} x={b.x} y={b.y + Math.sin(e.t * 4 + b.id) * 3} s={s} />
                ))}
              <Livreur x={joueur.x} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} casque={casqueActif} aimant={aimantActif} />
              {/* Copie du livreur au passage d'un bord */}
              {joueur.x < JOUEUR_L && (
                <Livreur
                  x={joueur.x + MONDE_L}
                  y={joueur.y}
                  rot={joueur.rot}
                  vx={joueur.vx}
                  s={s}
                  casque={casqueActif}
                  aimant={aimantActif}
                />
              )}
              {joueur.x > MONDE_L - JOUEUR_L && (
                <Livreur
                  x={joueur.x - MONDE_L}
                  y={joueur.y}
                  rot={joueur.rot}
                  vx={joueur.vx}
                  s={s}
                  casque={casqueActif}
                  aimant={aimantActif}
                />
              )}
              {/* Pots et pigeons par-dessus le reste */}
              {avecCourse &&
                e.pots.filter(pot => pot.alerte <= 0 && !pot.casse).map(pot => <Pot key={pot.id} x={pot.x} y={pot.y} s={s} p={p} />)}
              {avecCourse &&
                e.pigeons.map(g => <Pigeon key={g.id} x={g.x} y={g.y} regard={g.regard} mort={g.mort} s={s} p={p} />)}
            </View>
            {avecCourse && e.filet > 0 && <Filet s={s} />}
          </View>
        )}

        {/* Alerte : un pot va tomber ici */}
        {taille.l > 0 &&
          avecCourse &&
          e.pots
            .filter(pot => pot.alerte > 0)
            .map(pot => (
              <View key={pot.id} pointerEvents="none" style={[styles.alertePot, {left: decalage + pot.x * s - 13}]}>
                <Ionicons name="warning" size={26} color={OR_SOMMET} />
              </View>
            ))}

        {/* Étage atteint */}
        {avecCourse && (
          <View pointerEvents="none" style={styles.etageZone}>
            <Text style={styles.etage}>{t('jeuxSommetEtage', {n: e.etage})}</Text>
          </View>
        )}

        {/* Annonces empilées : bonus puis palier */}
        <View pointerEvents="none" style={styles.pileAnnonces}>
          {enJeu && annonceBonus && (
            <View style={[styles.annonce, {borderColor: BONUS_VUE[annonceBonus.bonus].couleur}]}>
              <View style={[styles.annonceIcone, {backgroundColor: BONUS_VUE[annonceBonus.bonus].couleur}]}>
                <MaterialCommunityIcons name={BONUS_VUE[annonceBonus.bonus].icone} size={16} color={C.blanc} />
              </View>
              <Text style={styles.annonceTexte} numberOfLines={2}>
                <Text style={styles.annonceTitre}>{`${t(TEXTES_BONUS[annonceBonus.bonus].titre)}. `}</Text>
                {t(annonceBonus.texte || TEXTES_BONUS[annonceBonus.bonus].texte)}
              </Text>
            </View>
          )}
          {enJeu && e && e.annonce > 0 && e.palier > 0 && (
            <View style={styles.annonce}>
              <View style={[styles.annonceIcone, {backgroundColor: C.marque}]}>
                <Ionicons name="flag" size={15} color={C.blanc} />
              </View>
              <Text style={styles.annonceTexte} numberOfLines={2}>
                <Text style={styles.annonceTitre}>{`${t('jeuxSommetPalier', {n: e.palier})}. `}</Text>
                {t(`jeuxSommetPiege${Math.min(e.palier, 5)}`)}
              </Text>
            </View>
          )}
        </View>

        <IndiceFige jeu={JEU} gestes={['gauche', 'droite', 'appui']} actif={enJeu} />
        <CouchePopups ref={popupsRef} />
        {/* Sous les annonces empilées (bonus, palier) : ne les recouvre pas */}
        <BanniereRecompense ref={banniereRef} style={styles.banniere} />
      </View>

      {/* Fenêtres : accueil, pause, fin de partie */}
      {fenetre && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeauClassement?.rang} record={bandeauClassement?.record} top1={bandeauClassement?.top1} />
                <Ionicons name="business" size={42} color={C.marque} />
                <Text style={styles.titre}>{t('jeuxSommetTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxSommetRegleCourte')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetResume')}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuJouer')} onPress={jouer} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeauClassement?.rang} record={bandeauClassement?.record} top1={bandeauClassement?.top1} />
                <Ionicons name="pause-circle" size={44} color={C.marque} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuSauvegarde')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuScore', {n: avecCourse ? e.score : etat.course?.score || 0})}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton secondaire texte={t('jeuxSommetRejouer')} onPress={confirmerNouvellePartie} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeauClassement?.rang} record={bandeauClassement?.record} top1={bandeauClassement?.top1} />
                <Ionicons name={fin?.record ? 'trophy' : 'alert-circle'} size={44} color={fin?.record ? C.or : C.danger} />
                <Text style={styles.titre}>{t('jeuxSommetFinTitre')}</Text>
                {fin?.record && <Text style={[styles.texte, styles.record]}>{t('jeuxSommetNouveauRecord')}</Text>}
                {fin && <Text style={styles.texte}>{t(cause)}</Text>}
                <Text style={styles.texte}>{t('jeuScore', {n: fin ? fin.score : score})}</Text>
                {fin && <Text style={styles.texteDiscret}>{t('jeuxSommetEtageAtteint', {n: fin.etage})}</Text>}
                {fin && <Text style={styles.texteDiscret}>{t('jeuxSommetColisRamasses', {n: fin.colis})}</Text>}
                {fin && <RecapRecompenses {...recompenses.recap(fin.score)} record={false} points={fin.score} connecte={connecte} />}
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuxSommetRejouer')} onPress={jouer} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      <FenetreReprise proposition={alerteCourse ? null : reprise.proposition} onReprendre={reprise.reprendre} onRecommencer={reprise.recommencer} />
      {/* Classement : le jeu reste en pause derrière. */}
      <ClassementJeu jeu={JEU} visible={classementOuvert && !enJeu && !alerteCourse} onClose={() => setClassementOuvert(false)} avantChargement={envoyer} />
      {/* Fiche de la vraie course annoncée pendant la partie. */}
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
      )}
    </View>
  );
}

function Records({etat, t}) {
  return (
    <View style={styles.records}>
      <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', {n: etat.meilleurScore})}</Text>
      <Text style={styles.texteDiscret}>{t('jeuMeilleurNiveau', {n: etat.meilleurNiveau})}</Text>
    </View>
  );
}

function Bouton({texte, onPress, secondaire}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.bouton, secondaire && styles.boutonSecondaire, pressed && {opacity: 0.8}]}>
      <Text style={[styles.boutonTexte, secondaire && styles.boutonTexteSecondaire]}>{texte}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ecran: {flex: 1, backgroundColor: C.fond, paddingHorizontal: 16},
  centre: {alignItems: 'center', justifyContent: 'center'},
  bandeau: {marginTop: 8},
  zone: {
    flex: 1,
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: C.bordureForte,
    overflow: 'hidden',
  },
  monde: {position: 'absolute', top: 0, overflow: 'hidden'},
  calque: {position: 'absolute', left: 0, top: 0, height: 0},
  bande: {position: 'absolute', left: 0, right: 0},
  alertePot: {position: 'absolute', top: 6},
  etageZone: {position: 'absolute', top: 8, left: 8},
  etage: {
    color: C.texte,
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  banniere: {top: 150},
  pileAnnonces: {position: 'absolute', top: 40, left: 10, right: 10, alignItems: 'center', gap: 6},
  annonce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 340,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.marque,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  annonceIcone: {width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center'},
  annonceTexte: {flexShrink: 1, color: C.texte, fontSize: 13, lineHeight: 17},
  annonceTitre: {fontWeight: '800'},
  voile: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.voile,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carte: {width: '100%', maxWidth: 380, backgroundColor: C.fond, borderRadius: 20, padding: 22, alignItems: 'center'},
  titre: {color: C.texte, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center'},
  texte: {color: C.texteDoux, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21},
  texteDiscret: {color: C.texteDiscret, fontSize: 13, marginTop: 6, textAlign: 'center'},
  record: {color: C.or, fontWeight: '800'},
  records: {marginTop: 6, marginBottom: 4},
  bouton: {
    alignSelf: 'stretch',
    marginTop: 14,
    backgroundColor: C.marque,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  boutonSecondaire: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.bordureForte, marginTop: 10},
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
  boutonTexteSecondaire: {color: C.texte},
});
