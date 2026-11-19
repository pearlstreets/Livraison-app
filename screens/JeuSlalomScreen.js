/**
 * Mini-jeu « Slalom urbain » en 3D.
 *
 * Le coureur Pearl Streets file sur 3 voies, vu de derrière, dans une rue
 * commerçante en perspective (components/SceneSlalom3D.js). Glisser à
 * gauche ou à droite change de voie, vers le haut il saute, vers le bas il se
 * baisse (en l'air : il redescend vite). Mamies, ouvriers, passants, voitures
 * qui traversent dans les deux sens, plots, barrières, échafaudages : on
 * esquive, on saute, on se baisse. On ramasse des sacs d'achat (5 points) et
 * des étoiles d'expérience (25 points), et des boosters : turbo, super saut,
 * x2, aimant et casque.
 *
 * Police : le premier choc ne termine pas la course. Le coureur trébuche et un
 * policier le poursuit pendant 10 secondes, puis disparaît. Un second choc
 * pendant ces 10 secondes : arrêté, c'est perdu. Le casque absorbe un choc.
 *
 * Boucle requestAnimationFrame : la course vit dans une ref (utils/jeux/
 * slalom.js), la position est publiée à chaque image dans une valeur
 * partagée Reanimated lue par le rendu. React ne redessine la scène que
 * quand des objets apparaissent ou disparaissent, et le bandeau du haut
 * quelques fois par seconde. Pause automatique (hooks/usePauseJeu.js) :
 * bouton, flèche ou geste retour pendant la course, app en arrière-plan,
 * écran quitté, nouvelle course annoncée (la fiche de la course s'ouvre dans
 * le jeu, components/AlerteCourseJeu.js) ; au retour, la fenêtre de pause
 * attend le livreur (jamais de reprise seule). Course enregistrée à la
 * pause, à la fin et toutes les 4 s. Musique de fond et bruitages
 * (components/jeux/SonJeux.js), bandeau rang et TOP 1, reprise de la partie
 * avec choix Reprendre ou Recommencer (moins de 24 h, jamais après une
 * partie perdue), indice des gestes.
 */
import React, {startTransition, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, Pressable, Alert, ActivityIndicator} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useFrameCallback, useSharedValue} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../contexts/LanguageContext';
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu, cleSauvegardeJeu, reprendreAncienRecord} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import useBalayage from '../utils/jeux/gestes';
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
  LARGEUR_VOIE,
  INVINCIBLE_REPRISE,
  avancer,
  baisser,
  boostersActifs,
  changerVoie,
  chargerPartie,
  enregistrerPartie,
  instantaneCourse,
  niveauPour,
  nouvelleCourse,
  nouvelleGraine,
  partieNeuve,
  reprendreCourse,
  sauter,
  scoreCourse,
  tempsPour,
  vitesseCourse,
  vitessePour,
} from '../utils/jeux/slalom';
import {Decor, Objets, Coureur, Policier, geometrie} from '../components/SceneSlalom3D';

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

const PERIODE_BANDEAU = 220; // ms entre deux mises à jour du bandeau (moins de rendus, moins de chauffe)
const IMAGE_MIN = 15; // ms : au plus 60 images calculées par seconde, même sur un écran 120 Hz
const SERIE_ECART = 2000; // ms : deux ramassages plus proches gardent la série
const SERIE_PAS = 5; // une annonce toutes les 5 prises d'affilée
const PERIODE_SAUVEGARDE = 4000; // ms
// Si le calcul JS prend du retard (rendu, sauvegarde), l'affichage continue
// d'avancer seul jusqu'à ce délai, puis le calcul rattrape le temps perdu.
const AVANCE_MAX = 0.5; // s
const PAS_RATTRAPAGE = 0.05; // s : pas de calcul maximal du moteur

/** Travail lourd (sauvegarde) quand le fil JS est libre, jamais pendant une image. */
function quandLibre(f) {
  if (typeof global.requestIdleCallback === 'function') global.requestIdleCallback(f, {timeout: 2000});
  else setTimeout(f, 0);
}

// Événements booléens cumulés pendant un rattrapage (liste créée une seule fois).
const EVENEMENTS = ['choc', 'casqueAbsorbe', 'arrete', 'policePart', 'bosse', 'atterri', 'fin', 'change'];
// Aucun objet pris récemment : même tableau vide à chaque image.
const AUCUN_PRIS = [];

/** Identifiants des objets pris depuis moins de 3 m (sans tableau intermédiaire). */
function prisRecents(e) {
  if (e.pris.size === 0) return AUCUN_PRIS;
  let ids = null;
  const seuil = e.d - 3;
  for (const [id, z] of e.pris) {
    if (z > seuil) {
      if (!ids) ids = [];
      ids.push(id);
    }
  }
  return ids || AUCUN_PRIS;
}

/** Avance de dt secondes, en plusieurs pas si le calcul a pris du retard. */
function avancerRattrape(e, dt) {
  let reste = Math.min(dt, AVANCE_MAX);
  const ev = avancer(e, Math.min(reste, PAS_RATTRAPAGE));
  reste -= PAS_RATTRAPAGE;
  while (reste > 0.001 && !ev.fin) {
    const s = avancer(e, Math.min(reste, PAS_RATTRAPAGE));
    reste -= PAS_RATTRAPAGE;
    ev.sacs += s.sacs;
    ev.etoiles += s.etoiles;
    ev.points += s.points;
    ev.bonus = s.bonus || ev.bonus;
    ev.niveau = Math.max(ev.niveau, s.niveau);
    for (let i = 0; i < EVENEMENTS.length; i += 1) {
      if (s[EVENEMENTS[i]]) ev[EVENEMENTS[i]] = true;
    }
  }
  return ev;
}
const PALIER_OBJETS = 50; // le compteur d'objets avance par paliers (course sans fin)
const VIOLET = '#8E6CEF';
const OR = '#F2B33D';

// Icône et couleur de chaque booster dans la jauge du HUD.
const BOOSTERS = {
  turbo: {icone: 'flash', couleur: '#F26B3A'},
  superSaut: {icone: 'arrow-up-circle', couleur: '#2E9AE0'},
  double: {icone: 'close', couleur: VIOLET},
  aimant: {icone: 'magnet', couleur: C.danger},
  casque: {icone: 'shield-checkmark', couleur: C.marque},
};
const CLES_BONUS = {
  turbo: 'jeuxSlalomBonusTurbo',
  superSaut: 'jeuxSlalomBonusSuperSaut',
  double: 'jeuxSlalomBonusDouble',
  aimant: 'jeuxSlalomBonusAimant',
  casque: 'jeuxSlalomBonusCasque',
};

function bandeauDe(e) {
  const sacs = e ? e.sacs : 0;
  const etoiles = e ? e.etoiles : 0;
  return {
    score: e ? scoreCourse(e) : 0,
    niveau: e ? niveauPour(e.d) : 1,
    sacs,
    etoiles,
    police: e ? Math.ceil(e.police) : 0,
    casque: !!e && e.casque > 0,
    boosters: boostersActifs(e).map(b => ({...b, ...BOOSTERS[b.cle]})),
  };
}

export default function SlalomScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser, connecte} = useCompteJeu();
  const cle = useMemo(() => cleSauvegardeJeu('slalom', idUser), [idUser]);

  const [etat, setEtat] = useState(null); // sauvegarde ; phase : accueil | jeu | pause | fin
  const etatRef = useRef(null);
  const courseRef = useRef(null);
  const [scene, setScene] = useState({objets: [], d: 0});
  const [bandeau, setBandeau] = useState(bandeauDe(null));
  const [zone, setZone] = useState(null); // {W, H, g}
  const [compte, setCompte] = useState(0); // 3, 2, 1 avant la reprise
  const [fin, setFin] = useState(null); // {score, d, sacs, etoiles, record}
  const [retour, setRetour] = useState(null); // {couleur, texte, n}
  const [classementOuvert, setClassementOuvert] = useState(false);

  const geo = useSharedValue(geometrie(360, 600));
  const monde = useSharedValue({
    d: 0,
    tj: 0,
    jx: 0,
    jy: 0,
    sol: 0,
    acc: false,
    tilt: 0,
    aim: false,
    inv: 0,
    t: 0,
    pol: 0,
    treb: 0,
    vit: 0,
    cad: 8,
    jxp: 0,
    vb: 1,
    n: 0,
    jeu: false,
  });
  // Ce que dessine l'écran : la course publiée, prolongée sur le fil
  // d'affichage tant que le calcul suivant n'est pas arrivé (jamais d'arrêt d'image).
  const vue = useSharedValue(monde.value);
  const nVu = useSharedValue(-1);
  const tsBase = useSharedValue(0);
  const tsMaj = useSharedValue(0);
  const nPublieRef = useRef(0);
  useFrameCallback(({timestamp}) => {
    'worklet';
    const m = monde.value;
    if (m.n !== nVu.value) {
      nVu.value = m.n;
      tsBase.value = timestamp;
      tsMaj.value = timestamp;
      vue.value = m;
      return;
    }
    if (!m.jeu || timestamp - tsMaj.value < IMAGE_MIN) return;
    tsMaj.value = timestamp;
    const ecoule = Math.min(AVANCE_MAX, (timestamp - tsBase.value) / 1000);
    vue.value = {...m, d: m.d + m.vit * ecoule, t: m.t + ecoule, tj: m.tj + (ecoule * m.vit) / m.vb};
  });

  const rafRef = useRef(null);
  const dernierRef = useRef(0);
  const bandeauRef = useRef(0);
  const sauveRef = useRef(0);
  const vuImageRef = useRef(0);
  const compteRef = useRef(null);
  const minuteurRetour = useRef(null);
  const monteRef = useRef(true);
  const repriseRef = useRef(null);
  const reprendreRef = useRef(null);

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    'slalom',
    etat?.meilleurScore || 0,
    etat?.meilleurNiveau || 1,
    etat?.phase === 'jeu',
    etat?.phase === 'jeu' ? 0 : bandeau.score,
    etat?.phase === 'jeu' ? 1 : bandeau.niveau,
  );

  // Récompenses visibles : « +N » au-dessus du coureur, séries, paliers, record.
  const popupsRef = useRef(null);
  const banniereRef = useRef(null);
  const serieRef = useRef({n: 0, dernier: 0});
  const zoneRef = useRef(null);
  zoneRef.current = zone;
  const recompenses = useRecompenses({
    score: bandeau.score,
    enPartie: etat?.phase === 'jeu',
    meilleurScore: etat?.meilleurScore || 0,
    lireMaxMois,
    surAnnonce: a => {
      if (a.type === 'record') banniereRef.current?.annoncer({texte: t('jeuRecompRecord'), icone: 'trophy', couleur: OR_FONCE});
      else banniereRef.current?.annoncer({texte: t('jeuRecompPalier', {n: formaterNombre(a.n)}), icone: 'ribbon', couleur: C.marque});
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  const reprise = useReprise('slalom', {
    surReprendre: sauvee => {
      if (!sauvee?.course) return;
      courseRef.current = reprendreCourse(sauvee.course);
      publierRef.current(courseRef.current);
      redessinerRef.current(courseRef.current);
      setFin(null);
      appliquer({...sauvee, phase: 'pause'}, false);
      reprendreRef.current?.();
    },
    surRecommencer: () => jouerRef.current?.(),
  });
  repriseRef.current = reprise;
  const publierRef = useRef(null);
  const redessinerRef = useRef(null);
  const jouerRef = useRef(null);

  const appliquer = useCallback(
    (nouvel, sauver = true) => {
      etatRef.current = nouvel;
      if (monteRef.current) setEtat(nouvel);
      if (sauver) enregistrerPartie(cle, nouvel);
    },
    [cle],
  );

  const bandeauClassement = useBandeauClassement('slalom', {
    score: bandeau.score,
    meilleurLocal: etat ? etat.meilleurScore : null,
    enPartie: etat?.phase === 'jeu',
  });

  /** Position du coureur et distance, lues par le rendu à chaque image. */
  const publier = useCallback(
    (e, enJeu = false) => {
      const v = vitesseCourse(e);
      nPublieRef.current += 1;
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
        vb: Math.max(0.1, vitessePour(e.d)),
        n: nPublieRef.current,
        jeu: enJeu,
        // Objets pris à l'instant : cachés tout de suite par l'affichage,
        // sans attendre que la scène soit redessinée.
        pris: prisRecents(e),
      };
    },
    [monde],
  );
  publierRef.current = publier;

  const redessiner = useCallback(e => {
    if (!monteRef.current) return;
    setScene({objets: e.objets, d: e.d});
    setBandeau(bandeauDe(e));
  }, []);
  redessinerRef.current = redessiner;

  /**
   * Pendant la course : la scène (obstacles, objets) est redessinée tout de
   * suite, seul le bandeau passe en arrière-plan. Une scène en arrière-plan
   * n'était plus jamais redessinée en course : plus aucun obstacle après ~10 s.
   */
  const redessinerFond = useCallback(e => {
    if (!monteRef.current) return;
    setScene({objets: e.objets, d: e.d});
    const b = bandeauDe(e);
    startTransition(() => setBandeau(b));
  }, []);

  const montrerRetour = useCallback((couleur, texte) => {
    if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    setRetour({couleur, texte, n: Date.now()});
    minuteurRetour.current = setTimeout(() => {
      if (monteRef.current) setRetour(null);
    }, 1100);
  }, []);

  const arreterBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // L'affichage cesse de prolonger la course.
    if (courseRef.current) publierRef.current?.(courseRef.current);
    if (compteRef.current) clearInterval(compteRef.current);
    compteRef.current = null;
    arreterMusique();
    if (monteRef.current) setCompte(0);
  }, []);

  /** Sauvegarde avec la course en cours et les records à jour. */
  const avecCourse = useCallback((base, e, phase) => {
    const score = scoreCourse(e);
    return {
      ...base,
      phase,
      course: phase === 'fin' ? null : instantaneCourse(e),
      meilleurScore: Math.max(base.meilleurScore || 0, score),
      meilleurNiveau: Math.max(base.meilleurNiveau || 1, niveauPour(e.d)),
    };
  }, []);

  /** Copie de la course pour la reprise (24 h), toujours en pause au retour. */
  const garderReprise = useCallback(
    (base, e) => {
      repriseRef.current?.enregistrer(avecCourse(base, e, 'pause'), {niveau: niveauPour(e.d), score: scoreCourse(e)});
    },
    [avecCourse],
  );

  const terminer = useCallback(() => {
    const e = courseRef.current;
    const base = etatRef.current;
    arreterBoucle();
    if (!e || !base) return;
    vibrer(true);
    const score = scoreCourse(e);
    const record = score > (base.meilleurScore || 0);
    bruit('sifflet');
    bruit('perdu');
    if (record) bruit('record');
    setFin({score, d: Math.floor(e.d), sacs: e.sacs, etoiles: e.etoiles, record});
    redessiner(e);
    appliquer(avecCourse(base, e, 'fin'));
    // Partie perdue : plus de reprise.
    repriseRef.current?.effacer();
  }, [appliquer, arreterBoucle, avecCourse, redessiner]);

  /** Calcul d'une image. Renvoie faux quand la course s'arrête (fin). */
  const calculerImage = useCallback(
    ts => {
      const e = courseRef.current;
      // Écran 120 Hz : une image sur deux est sautée (60 calculs par seconde au plus).
      if (dernierRef.current && ts - dernierRef.current < IMAGE_MIN) return true;
      const dt = dernierRef.current ? (ts - dernierRef.current) / 1000 : 0;
      dernierRef.current = ts;
      const ev = avancerRattrape(e, dt);
      publier(e, !ev.fin);
      if (ev.fin) {
        terminer();
        return false;
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
            couleur: double ? VIOLET : ev.etoiles ? OR_FONCE : C.marque,
            icone: ev.etoiles ? 'star' : 'bag-handle',
            grand: ev.etoiles > 0 || double,
          });
        }
        const serie = serieRef.current;
        const avant = ts - serie.dernier < SERIE_ECART ? serie.n : 0;
        serie.n = avant + ev.sacs + ev.etoiles;
        serie.dernier = ts;
        if (Math.floor(serie.n / SERIE_PAS) > Math.floor(avant / SERIE_PAS)) {
          banniereRef.current?.annoncer({texte: t('jeuRecompSerie', {n: serie.n}), icone: 'flame', couleur: '#F26B3A'});
        }
      }
      if (ev.bonus) {
        vibrer(false);
        bruit('booster');
        const b = BOOSTERS[ev.bonus];
        banniereRef.current?.annoncer({texte: t(CLES_BONUS[ev.bonus]), icone: b.icone, couleur: b.couleur});
      } else if (ev.casqueAbsorbe) {
        vibrer(true);
        bruit('choc');
        montrerRetour(C.danger, t('jeuxSlalomCasqueUtilise'));
      } else if (ev.choc) {
        vibrer(true);
        bruit('choc');
        bruit('sirene');
        montrerRetour(C.danger, t('jeuxSlalomPoliceArrive'));
      } else if (ev.policePart) {
        montrerRetour(C.marque, t('jeuxSlalomPolicePartie'));
      } else if (ev.niveau) {
        bruit('niveau');
        banniereRef.current?.annoncer({texte: t('jeuNiveau', {n: ev.niveau}), icone: 'flag', couleur: C.marque});
      }
      if (ev.bosse) vibrer(false);
      if (ev.change) {
        redessinerFond(e);
        bandeauRef.current = ts;
      } else if (ts - bandeauRef.current > PERIODE_BANDEAU) {
        bandeauRef.current = ts;
        if (monteRef.current) {
          const b = bandeauDe(e);
          startTransition(() => setBandeau(b));
        }
      }
      if (ts - sauveRef.current > PERIODE_SAUVEGARDE) {
        sauveRef.current = ts;
        quandLibre(() => {
          // La partie a pu se terminer ou être mise en pause entre-temps.
          if (courseRef.current !== e || e.fini || etatRef.current?.phase !== 'jeu') return;
          enregistrerPartie(cle, avecCourse(etatRef.current, e, 'jeu'));
          garderReprise(etatRef.current, e);
        });
      }
      return true;
    },
    [avecCourse, cle, garderReprise, montrerRetour, publier, redessinerFond, t, terminer],
  );

  // Une erreur dans une image (son, bannière, sauvegarde) ne fige jamais la
  // course : elle est signalée et l'image suivante est toujours demandée.
  const image = useCallback(
    ts => {
      vuImageRef.current = Date.now();
      if (!courseRef.current || etatRef.current?.phase !== 'jeu') {
        rafRef.current = null;
        return;
      }
      let suite = true;
      try {
        suite = calculerImage(ts);
      } catch (erreur) {
        dernierRef.current = ts;
        if (__DEV__) console.warn('[slalom] image', erreur);
      }
      if (suite && etatRef.current?.phase === 'jeu') rafRef.current = requestAnimationFrame(imageRef.current);
      else if (suite) rafRef.current = null;
    },
    [calculerImage],
  );
  const imageRef = useRef(image);
  imageRef.current = image;

  const lancerBoucle = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    dernierRef.current = 0;
    bandeauRef.current = 0;
    vuImageRef.current = Date.now();
    demarrerMusique('slalom');
    rafRef.current = requestAnimationFrame(ts => {
      dernierRef.current = ts;
      sauveRef.current = ts;
      rafRef.current = requestAnimationFrame(imageRef.current);
    });
  }, []);
  const lancerBoucleRef = useRef(lancerBoucle);
  lancerBoucleRef.current = lancerBoucle;

  const pause = useCallback(() => {
    const base = etatRef.current;
    const e = courseRef.current;
    if (!base || !e) return;
    const enCompte = !!compteRef.current;
    if (base.phase !== 'jeu' && !enCompte) return;
    arreterBoucle();
    if (base.phase === 'jeu') {
      appliquer(avecCourse(base, e, 'pause'));
      garderReprise(base, e);
    }
    redessiner(e);
  }, [appliquer, arreterBoucle, avecCourse, garderReprise, redessiner]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  // Pause automatique (hooks/usePauseJeu.js) : flèche ou geste retour pendant
  // la course (ou le 3, 2, 1), app en arrière-plan, écran quitté, nouvelle
  // course annoncée (sa fiche s'ouvre par-dessus le jeu).
  const estEnCourse = useCallback(() => etatRef.current?.phase === 'jeu' || !!compteRef.current, []);
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: etat?.phase === 'jeu' || compte > 0,
    estEnJeu: estEnCourse,
  });

  /** Reprise après la pause : 3, 2, 1, puis la course repart. */
  const reprendre = useCallback(() => {
    const e = courseRef.current;
    if (!e || etatRef.current?.phase !== 'pause') return;
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
      appliquer({...etatRef.current, phase: 'jeu'}, false);
      lancerBoucle();
    }, 700);
  }, [appliquer, arreterBoucle, lancerBoucle]);
  reprendreRef.current = reprendre;

  const jouer = useCallback(() => {
    const base = etatRef.current;
    if (!base) return;
    arreterBoucle();
    const e = nouvelleCourse(nouvelleGraine());
    courseRef.current = e;
    setFin(null);
    setRetour(null);
    serieRef.current = {n: 0, dernier: 0};
    popupsRef.current?.vider();
    banniereRef.current?.effacer();
    recompensesRef.current.debut(0);
    publier(e);
    redessiner(e);
    appliquer(avecCourse(base, e, 'jeu'));
    lancerBoucle();
  }, [appliquer, arreterBoucle, avecCourse, lancerBoucle, publier, redessiner]);
  jouerRef.current = jouer;

  // Gestes : un balayage = une action (voie, saut ou se baisser).
  const enJeu = useCallback(() => (etatRef.current?.phase === 'jeu' ? courseRef.current : null), []);
  const gestes = useBalayage({
    actif: etat?.phase === 'jeu',
    surGauche: () => {
      const e = enJeu();
      if (e) changerVoie(e, -1);
    },
    surDroite: () => {
      const e = enJeu();
      if (e) changerVoie(e, 1);
    },
    surHaut: () => {
      const e = enJeu();
      if (e && sauter(e)) bruit('saut');
    },
    surBas: () => {
      const e = enJeu();
      if (e && baisser(e)) bruit('accroupi');
    },
  });

  // Chargement de la partie enregistrée (une course en cours revient en pause).
  useEffect(() => {
    let vivant = true;
    reprendreAncienRecord('slalom', idUser).then(() => chargerPartie(cle)).then(sauvegarde => {
      if (!vivant) return;
      const e = sauvegarde.course ? reprendreCourse(sauvegarde.course) : nouvelleCourse(nouvelleGraine());
      courseRef.current = e;
      publier(e);
      redessiner(e);
      appliquer(sauvegarde, false);
      // Course laissée en pause : Reprendre ou Recommencer (moins de 24 h), sinon départ à zéro.
      if (sauvegarde.phase === 'pause') {
        repriseRef.current?.verifier().then(({proposition, expiree}) => {
          if (!vivant || proposition || !expiree) return;
          const neuve = nouvelleCourse(nouvelleGraine());
          courseRef.current = neuve;
          publier(neuve);
          redessiner(neuve);
          appliquer(partieNeuve(sauvegarde));
        });
      }
    });
    return () => {
      vivant = false;
    };
  }, [cle, appliquer, publier, redessiner]);

  // Garde : en course, si plus aucune image n'arrive depuis 1,5 s (boucle
  // coupée par le système), la boucle repart d'elle-même, sans saut.
  useEffect(() => {
    const garde = setInterval(() => {
      if (!monteRef.current || etatRef.current?.phase !== 'jeu' || compteRef.current) return;
      if (Date.now() - vuImageRef.current > 1500) lancerBoucleRef.current?.();
    }, 1000);
    return () => clearInterval(garde);
  }, []);

  // Démontage : pause (course enregistrée), musique et minuteurs arrêtés.
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      arreterMusique();
      monteRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (compteRef.current) clearInterval(compteRef.current);
      if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    };
  }, []);

  const quitter = useCallback(() => {
    pause();
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate?.('Accueil', {screen: 'OrdersMain'});
  }, [navigation, pause]);

  // Fiche de la course annoncée : « Voir la course » quitte le jeu (en pause).
  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation?.navigate?.('Accueil', {screen: 'OrdersMain'});
  }, [fermerAlerte, navigation, pause]);

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

  const surMesure = useCallback(
    ev => {
      const W = Math.round(ev.nativeEvent.layout.width);
      const H = Math.round(ev.nativeEvent.layout.height);
      if (W <= 0 || H <= 0) return;
      setZone(z => {
        if (z && z.W === W && z.H === H) return z;
        const g = geometrie(W, H);
        geo.value = g;
        return {W, H, g};
      });
    },
    [geo],
  );

  if (!etat) {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator color={C.marque} />
      </View>
    );
  }

  const enCourse = etat.phase === 'jeu' || compte > 0;
  const fenetre = !enCourse && !classementOuvert && !reprise.proposition;
  const nObjets = bandeau.sacs + bandeau.etoiles;
  const objets = {
    n: nObjets,
    total: Math.max(PALIER_OBJETS, Math.ceil((nObjets + 1) / PALIER_OBJETS) * PALIER_OBJETS),
    icone: 'bag-handle',
    libelle: t('jeuxSlalomObjetsRamasses', {n: nObjets}),
  };

  return (
    <View style={[styles.ecran, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
      <SonJeux />
      {/* Barre du haut commune : quitter, score, niveau, objets, boosters, pause */}
      <HudJeu
        score={bandeau.score}
        niveau={bandeau.niveau}
        objets={objets}
        boosters={bandeau.boosters}
        onPause={pause}
        onQuitter={quitter}
        pauseActive={etat.phase === 'jeu'}
      />
      <BandeauClassement bandeau={bandeauClassement} style={styles.bandeau} />

      {/* Rue en 3D, gestes sur toute la zone */}
      <View style={styles.zone} onLayout={surMesure} {...gestes.panHandlers}>
        {zone && (
          <>
            <Decor key={`${zone.W}x${zone.H}`} g={zone.g} geo={geo} monde={vue} />
            <Objets objets={scene.objets} d={scene.d} geo={geo} monde={vue} />
            <Policier geo={geo} monde={vue} />
            <Coureur geo={geo} monde={vue} casque={bandeau.casque} />
          </>
        )}
        <IndiceGestes jeu="slalom" gestes={['gauche', 'droite', 'haut', 'bas']} actif={etat.phase === 'jeu'} />
        {bandeau.police > 0 && enCourse && (
          <View pointerEvents="none" style={styles.policeZone}>
            <View style={styles.policeBadge}>
              <Ionicons name="alert-circle" size={16} color={C.blanc} />
              <Text style={styles.policeTexte}>{t('jeuxSlalomPoliceCompte', {n: bandeau.police})}</Text>
            </View>
          </View>
        )}
        <CouchePopups ref={popupsRef} />
        <BanniereRecompense ref={banniereRef} />
        {retour && (
          <View key={retour.n} pointerEvents="none" style={styles.retourZone}>
            <Text style={[styles.retour, {backgroundColor: retour.couleur}]}>{retour.texte}</Text>
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

      {/* Fenêtres : accueil, pause, fin de course */}
      {fenetre && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {etat.phase === 'accueil' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeauClassement?.rang} record={bandeauClassement?.record} top1={bandeauClassement?.top1} />
                <Ionicons name="walk" size={42} color={C.marque} />
                <Text style={styles.titre}>{t('jeuxSlalomTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxSlalomRegle')}</Text>
                <Legende t={t} />
                <Text style={styles.texteDiscret}>{t('jeuxSlalomReglePolice')}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuJouer')} onPress={jouer} />
                <Bouton secondaire texte={t('jeuxSlalomQuitterJeu')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'pause' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeauClassement?.rang} record={bandeauClassement?.record} top1={bandeauClassement?.top1} />
                <Ionicons name="pause-circle" size={44} color={C.marque} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuSauvegarde')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuScore', {n: bandeau.score})}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton secondaire texte={t('jeuxSlalomRejouer')} onPress={confirmerNouvellePartie} />
                <Bouton secondaire texte={t('jeuxSlalomQuitterJeu')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'fin' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeauClassement?.rang} record={bandeauClassement?.record} top1={bandeauClassement?.top1} />
                <Ionicons name={fin?.record ? 'trophy' : 'alert-circle'} size={44} color={fin?.record ? C.or : C.danger} />
                <Text style={styles.titre}>{t('jeuxSlalomFinTitre')}</Text>
                {fin?.record && <Text style={[styles.texte, styles.record]}>{t('jeuxSlalomNouveauRecord')}</Text>}
                <Text style={styles.texte}>{t('jeuScore', {n: fin ? fin.score : bandeau.score})}</Text>
                {fin && <Text style={styles.texteDiscret}>{t('jeuxSlalomDistance', {n: fin.d})}</Text>}
                {fin && <Text style={styles.texteDiscret}>{t('jeuxSlalomSacs', {n: fin.sacs})}</Text>}
                {fin && <Text style={styles.texteDiscret}>{t('jeuxSlalomEtoiles', {n: fin.etoiles})}</Text>}
                {fin && <RecapRecompenses {...recompenses.recap(fin.score)} record={false} points={fin.score} connecte={connecte} />}
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuxSlalomRejouer')} onPress={jouer} />
                <Bouton secondaire texte={t('jeuxSlalomQuitterJeu')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {/* Fenêtres du dessus cachées pendant la fiche d'une course annoncée. */}
      <FenetreReprise
        proposition={alerteCourse ? null : reprise.proposition}
        onReprendre={reprise.reprendre}
        onRecommencer={reprise.recommencer}
      />
      {/* Classement : le jeu reste en pause derrière. */}
      <ClassementJeu
        jeu="slalom"
        visible={classementOuvert && !enCourse && !alerteCourse}
        onClose={() => setClassementOuvert(false)}
        avantChargement={envoyer}
      />
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
      )}
    </View>
  );
}

/** Petits dessins de la fenêtre d'accueil : sac d'achat, étoile, booster, police. */
function Legende({t}) {
  const items = [
    {
      cle: 'jeuxSlalomLegSac',
      rendu: (
        <View style={styles.legSac}>
          <View style={styles.legAnse} />
        </View>
      ),
    },
    {cle: 'jeuxSlalomLegEtoile', rendu: <Ionicons name="star" size={28} color={OR} />},
    {
      cle: 'jeuxSlalomLegBooster',
      rendu: (
        <View style={styles.legBooster}>
          <Ionicons name="flash" size={18} color={C.blanc} />
        </View>
      ),
    },
    {
      cle: 'jeuxSlalomLegPolice',
      rendu: (
        <View style={styles.legPolice}>
          <Ionicons name="alert-circle" size={20} color={C.blanc} />
        </View>
      ),
    },
  ];
  return (
    <View style={styles.legende}>
      {items.map(it => (
        <View key={it.cle} style={styles.legendeItem}>
          <View style={styles.legendeDessin}>{it.rendu}</View>
          <Text style={styles.legendeTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {t(it.cle)}
          </Text>
        </View>
      ))}
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
    backgroundColor: '#DCD5CA',
  },
  policeZone: {position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center'},
  policeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: C.danger,
    borderWidth: 2,
    borderColor: C.blanc,
  },
  policeTexte: {color: C.blanc, fontSize: 14, fontWeight: '800'},
  retourZone: {position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center'},
  retour: {
    color: C.blanc,
    fontSize: 20,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  compteZone: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
  compteRond: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.marque,
    borderWidth: 4,
    borderColor: C.blanc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteTexte: {color: C.blanc, fontSize: 48, fontWeight: '900'},
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
  legende: {flexDirection: 'row', alignSelf: 'stretch', marginTop: 14, gap: 6},
  legendeItem: {flex: 1, alignItems: 'center'},
  legendeDessin: {height: 34, alignItems: 'center', justifyContent: 'center'},
  legendeTexte: {color: C.texteDoux, fontSize: 12, fontWeight: '600', marginTop: 4},
  legSac: {width: 24, height: 26, borderRadius: 4, backgroundColor: C.marque, alignItems: 'center'},
  legAnse: {
    position: 'absolute',
    top: -6,
    width: 12,
    height: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: C.marque,
  },
  legBooster: {width: 30, height: 30, borderRadius: 15, backgroundColor: '#F26B3A', alignItems: 'center', justifyContent: 'center'},
  legPolice: {width: 30, height: 30, borderRadius: 15, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center'},
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
