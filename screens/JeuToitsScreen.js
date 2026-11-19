/**
 * Mini-jeu « Tournée des toits », pour patienter entre deux courses. Même jeu
 * que l'app client (AppUser, screens/Jeux/ToitsScreen.js).
 *
 * Plateforme à défilement horizontal : le livreur saute de trottoir en toit,
 * d'échafaudage en auvent, ramasse des colis, frappe les caisses par dessous,
 * écarte chiens, pigeons et trottinettes en leur sautant dessus et livre le
 * colis à la porte du client. Niveaux générés et toujours faisables
 * (utils/jeux/toits.js), de plus en plus longs, sans fin. 3 vies par partie.
 *
 * Commandes au doigt, sans boutons : balayer à gauche ou à droite pour courir,
 * vers le haut pour sauter, vers le bas pour s'arrêter et s'accroupir, toucher
 * l'écran pour s'arrêter (utils/jeux/gestes.js).
 *
 * Spécifique livreur : pause automatique à l'annonce d'une course, avec la
 * fiche de la vraie course dans le jeu (hooks/usePauseJeu.js,
 * components/AlerteCourseJeu.js). usePauseJeu gère aussi l'arrière-plan,
 * l'écran quitté et le retour (Android et navigation) pendant la partie.
 *
 * Batterie : la boucle (requestAnimationFrame) ne tourne que pendant la
 * partie, plafonnée à 60 images par seconde ; arrêtée en pause, en fin de
 * niveau ou de partie, écran quitté et app en arrière-plan. Seuls les objets
 * à l'écran sont dessinés.
 *
 * Pause : app en arrière-plan, écran quitté, flèche ou geste retour. Partie
 * enregistrée à chaque pause et à chaque niveau, reprise au départ du niveau
 * en cours (moins de 24 h). Musique et bruitages (components/jeux/SonJeux.js),
 * bandeau rang et TOP 1, décor dans components/jeux/DecorToits.js.
 */
import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, Pressable, Alert, ActivityIndicator} from 'react-native';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../contexts/LanguageContext';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu, reprendreAncienRecord} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import ClassementJeu from '../components/jeux/ClassementJeu';
import HudJeu from '../components/jeux/HudJeu';
import SonJeux, {demarrerMusique, arreterMusique, bruit, ReglagesSon} from '../components/jeux/SonJeux';
import BandeauClassement, {formaterNombre} from '../components/jeux/BandeauClassement';
import FenetreReprise from '../components/jeux/FenetreReprise';
import IndiceGestes from '../components/jeux/IndiceGestes';
import useBandeauClassement from '../utils/jeux/useBandeauClassement';
import useReprise from '../utils/jeux/sauvegardePartie';
import useRecompenses from '../utils/jeux/useRecompenses';
import useBalayage from '../utils/jeux/gestes';
import {CouchePopups, BanniereRecompense, RecapRecompenses, OR_FONCE} from '../components/jeux/RecompensesJeu';
import {
  palette, pos, Decor, Dynamique, Eaux, PlongeesFond, PlongeesEau, Algues, Poissons, Tornades, Fond, Lointain, Nuages, Ciel, Livreur, Booster, ColisBrillant, Geneur, Boite,
  ETOILES, GOUTTES, OR, LARGEUR_VUE, HAUTEUR_VUE_MIN, TRANCHE, PARALLAXE, styles as stylesDecor,
} from '../components/jeux/DecorToits';
import {
  JEU_TOITS, HAUTEUR, LARGEUR, SOL_ECRAN, VIES, POINTS, PALIER_PIECES, DUREES, DUREE_SORTIE,
  creerMonde, pas, avancee, visibles, genererFond, genererElementsMonde, mondeParId, decorNiveau,
  reportPropre, partieNeuve, nettoyerSauvegarde, cleSauvegarde, chargerPartie, enregistrerPartie,
} from '../utils/jeux/toits';

// Vibration légère (Android) : facultative, le jeu marche sans.
let haptique = null;
try {
  // eslint-disable-next-line global-require
  haptique = require('../utils/jeux/haptique');
} catch (e) {
  haptique = null;
}
const MOTIFS = {perte: [0, 40, 50, 40], fort: [0, 25], leger: [0, 12], livre: [0, 30, 60, 30]};
function vibrer(type) {
  try {
    haptique?.vibrer?.(MOTIFS[type] || MOTIFS.leger);
  } catch (e) {
    // Sans vibration.
  }
}

// Musique : pas de morceau « toits » dans sonJeux.js, celui de la tournée est repris.
const MUSIQUE = 'tournee';
// Bruitage de chaque événement du jeu (utils/jeux/toits.js).
const SONS_TOITS = {
  touche: 'choc', chute: 'choc', temps: 'sirene', ecarte: 'tranche', boite: 'ramasse', colis: 'ramasse',
  accroupi: 'accroupi', bonus: 'booster', encaisse: 'choc', ressort: 'saut',
  plouf: 'tranche', conduit: 'accroupi', sortieConduit: 'saut', doubleSaut: 'saut', noyade: 'choc',
};
// Bonus en cours affichés sous le score et objets qui sortent des caisses (MaterialCommunityIcons).
const BOOSTERS = [
  {id: 'vol', icone: 'quadcopter', couleur: '#2D7FD3'},
  {id: 'etoile', icone: 'star', couleur: '#E0A100'},
  {id: 'aimant', icone: 'magnet', couleur: '#8E44AD'},
  {id: 'double', icone: 'numeric-2-circle', couleur: '#E8650F'},
  {id: 'sprint', icone: 'run-fast', couleur: '#D6336C'},
  {id: 'doubleSaut', icone: 'chevron-double-up', couleur: '#0E8C9C'},
];
// Super pouvoirs visibles sur le livreur : aura de la couleur du pouvoir, du plus fort au plus doux.
const AURAS = [
  {id: 'etoile', couleur: '#E0A100'},
  {id: 'vol', couleur: '#2D7FD3'},
  {id: 'sprint', couleur: '#D6336C'},
  {id: 'doubleSaut', couleur: '#0E8C9C'},
  {id: 'aimant', couleur: '#8E44AD'},
  {id: 'double', couleur: '#E8650F'},
];
const SORTIES = {
  colis: {icone: 'package-variant-closed', couleur: '#C8862F'},
  sprint: {icone: 'run-fast', couleur: '#D6336C'},
  doubleSaut: {icone: 'chevron-double-up', couleur: '#0E8C9C'},
  aimant: {icone: 'magnet', couleur: '#8E44AD'},
  taille: {icone: 'shield-star', couleur: '#0A9A78'},
  vol: {icone: 'quadcopter', couleur: '#2D7FD3'},
  etoile: {icone: 'star', couleur: '#E0A100'},
  chrono: {icone: 'clock-plus-outline', couleur: '#16A34A'},
  double: {icone: 'numeric-2-circle', couleur: '#E8650F'},
};
// Nom affiché de chaque monde (utils/jeux/toits.js, MONDES).
const CLE_MONDE = {
  ville: 'jeuxToitsMondeVille', port: 'jeuxToitsMondePort', neons: 'jeuxToitsMondeNeons', pluie: 'jeuxToitsMondePluie',
  hiver: 'jeuxToitsMondeHiver', chantier: 'jeuxToitsMondeChantier', marche: 'jeuxToitsMondeMarche',
  desert: 'jeuxToitsMondeDesert', jungle: 'jeuxToitsMondeJungle',
};
// Lampions du marché : guirlande fixe en haut de la scène.
const LAMPIONS = ['#E74C3C', '#F2B705', '#2D9CDB', '#E8650F', '#9B59B6', '#27AE60', '#E74C3C', '#F2B705', '#2D9CDB'];
// Particules à l'écran : chute (par défaut), vent (filent à l'horizontale) ou flotte (lucioles).
// double : une seconde série décalée ; grosses : une particule sur trois plus grande.
const PARTICULES = {
  neige: {couleur: '#FFFFFF', taille: 5, vitesse: 0.28, rond: true, double: true, grosses: true},
  feuilles: {couleur: '#D9822B', taille: 5, vitesse: 0.35, rond: false},
  sable: {couleur: '#C98A55', taille: 2.5, vitesse: 1.6, rond: true, mode: 'vent'},
  lucioles: {couleur: '#E4F55A', taille: 3.5, vitesse: 0.05, rond: true, mode: 'flotte'},
};
// Lianes qui pendent du haut de la scène (jungle) : position en %, longueur en points.
const LIANES = [{x: 6, l: 46}, {x: 23, l: 74}, {x: 47, l: 38}, {x: 68, l: 62}, {x: 89, l: 50}];
const IMAGE_MIN = 1000 / 60 - 1.5; // plafond : 60 images par seconde
const commandesVides = () => ({gauche: false, droite: false, sautTenu: false, sautAppui: false, bas: false, tenue: 0, basRestant: 0});

export default function JeuToitsScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser} = useCompteJeu();
  const cle = useMemo(() => cleSauvegarde(idUser), [idUser]);

  const [etat, setEtat] = useState(null); // null : chargement
  const etatRef = useRef(null);
  const [, setImage] = useState(0);
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [nouveauRecord, setNouveauRecord] = useState(false);
  const [dims, setDims] = useState({l: 0, h: 0});
  const dimsRef = useRef({l: 0, h: 0});
  const monteRef = useRef(true);

  const mondeRef = useRef(null);
  if (!mondeRef.current) mondeRef.current = creerMonde(1, {}, 2);
  const fondRef = useRef(null);
  if (!fondRef.current) fondRef.current = genererFond(1, mondeRef.current.longueur);
  const elementsRef = useRef(null);
  if (!elementsRef.current) elementsRef.current = genererElementsMonde(1, mondeRef.current.longueur);
  const camRef = useRef({x: -60, y: 0});
  const cmdRef = useRef(commandesVides());
  const rafRef = useRef(null);
  const dernierRef = useRef(null);

  const repriseRef = useRef({enregistrer: () => {}, effacer: () => {}});
  const popupsRef = useRef(null);
  const banniereRef = useRef(null);

  const decorNiv = mondeRef.current.decor;
  const motifNiv = mondeRef.current.motif;
  const mondeNiv = mondeRef.current.monde;
  // Couleurs du monde (ciel, immeubles, toits) par-dessus la palette de l'ambiance.
  const pal = useMemo(() => ({...palette(false, decorNiv, motifNiv), ...mondeParId(mondeNiv).couleurs}), [decorNiv, motifNiv, mondeNiv]);

  const m = mondeRef.current;
  const scoreVivant = etat?.phase === 'jeu' ? m.score : etat?.score || 0;

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    JEU_TOITS,
    etat?.meilleurScore || 0,
    etat?.meilleurNiveau || 1,
    etat?.phase === 'jeu',
    scoreVivant,
    etat?.niveau || 1,
  );

  const appliquer = useCallback(
    (nouvel, sauver = true) => {
      etatRef.current = nouvel;
      if (monteRef.current) setEtat(nouvel);
      if (sauver) {
        enregistrerPartie(cle, nouvel);
        if (nouvel.phase === 'jeu' || nouvel.phase === 'pause' || nouvel.phase === 'livre') {
          repriseRef.current.enregistrer(nouvel, {niveau: nouvel.niveau, score: nouvel.score});
        } else if (nouvel.phase === 'perdu') {
          repriseRef.current.effacer();
        }
      }
    },
    [cle],
  );

  const relacherTout = useCallback(() => {
    cmdRef.current = commandesVides();
  }, []);

  const echelle = useCallback(() => {
    const {l, h} = dimsRef.current;
    if (!l || !h) return null;
    const s = Math.min(l / LARGEUR_VUE, h / HAUTEUR_VUE_MIN);
    return {s, visW: l / s, visH: h / s};
  }, []);

  const cibleCamera = useCallback((mo, e) => {
    const j = mo.joueur;
    const xMax = mo.longueur - e.visW;
    const x = Math.max(-240, Math.min(xMax, j.x - e.visW * 0.36));
    const y = Math.max(0, j.y + HAUTEUR + 55 - (e.visH - SOL_ECRAN));
    return {x, y};
  }, []);

  const placerCamera = useCallback(() => {
    const e = echelle();
    if (!e || !mondeRef.current) return;
    camRef.current = cibleCamera(mondeRef.current, e);
  }, [cibleCamera, echelle]);

  /** Construit le monde du niveau (report au départ du niveau, graine de la partie). */
  const construire = useCallback(
    (niveau, debut, graine) => {
      mondeRef.current = creerMonde(niveau, debut, graine + niveau);
      fondRef.current = genererFond(niveau, mondeRef.current.longueur);
      elementsRef.current = genererElementsMonde(niveau, mondeRef.current.longueur);
      relacherTout();
      placerCamera();
    },
    [placerCamera, relacherTout],
  );

  /** Lance un niveau : monde neuf, report enregistré pour une reprise au départ du niveau. */
  const lancerNiveau = useCallback(
    (base, niveau, report) => {
      const debut = reportPropre(report, niveau);
      construire(niveau, debut, base.graine);
      appliquer({
        ...base,
        phase: 'jeu',
        niveau,
        debut,
        score: debut.score,
        meilleurNiveau: Math.max(base.meilleurNiveau || 1, niveau),
      });
    },
    [appliquer, construire],
  );

  const reprise = useReprise(JEU_TOITS, {
    surReprendre: sauvee => {
      const e = nettoyerSauvegarde({...sauvee, phase: 'pause'});
      lancerNiveau(e, e.niveau, e.debut);
    },
    surRecommencer: () => demarrerRef.current?.(),
  });
  repriseRef.current = reprise;
  const demarrerRef = useRef(null);
  const recompenses = useRecompenses({
    score: scoreVivant,
    enPartie: etat?.phase === 'jeu',
    meilleurScore: etat?.meilleurScore || 0,
    lireMaxMois,
    surAnnonce: a => {
      if (a.type === 'record') banniereRef.current?.annoncer({texte: t('jeuxBandeauNouveauRecord'), icone: 'trophy', couleur: OR_FONCE});
      else banniereRef.current?.annoncer({texte: t('jeuRecompPalier', {n: formaterNombre(a.n)}), icone: 'ribbon', couleur: C.marque});
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  const bandeau = useBandeauClassement(JEU_TOITS, {
    score: scoreVivant,
    meilleurLocal: etat ? etat.meilleurScore : null,
    enPartie: etat?.phase === 'jeu',
  });

  /** Partie perdue : score final, records, sauvegarde de reprise effacée. */
  const finir = useCallback(() => {
    const e = etatRef.current;
    const mo = mondeRef.current;
    if (!e) return;
    const record = mo.score > (e.meilleurScore || 0);
    setNouveauRecord(record);
    bruit('perdu');
    if (record) setTimeout(() => monteRef.current && bruit('record'), 600);
    appliquer({
      ...e,
      phase: 'perdu',
      score: mo.score,
      meilleurScore: Math.max(e.meilleurScore || 0, mo.score),
      meilleurNiveau: Math.max(e.meilleurNiveau || 1, mo.niveau),
    });
  }, [appliquer]);

  /** Colis livré : le niveau suivant est enregistré avec le report d'après la livraison. */
  const livrer = useCallback(() => {
    const e = etatRef.current;
    const mo = mondeRef.current;
    if (!e) return;
    const suivant = mo.niveau + 1;
    appliquer({
      ...e,
      phase: 'livre',
      niveau: suivant,
      scoreDebutNiveau: e.debut?.score || 0,
      debut: reportPropre({score: mo.score, vies: mo.vies, pieces: mo.pieces, grand: mo.grand}, suivant),
      score: mo.score,
      meilleurScore: Math.max(e.meilleurScore || 0, mo.score),
      meilleurNiveau: Math.max(e.meilleurNiveau || 1, suivant),
    });
  }, [appliquer]);

  const boucleRef = useRef(null);
  boucleRef.current = maintenant => {
    rafRef.current = null;
    if (etatRef.current?.phase !== 'jeu' || !monteRef.current) return;
    // Écran à 90 ou 120 Hz : une image sur deux est sautée (60 par seconde au plus).
    if (dernierRef.current != null && maintenant - dernierRef.current < IMAGE_MIN) {
      rafRef.current = requestAnimationFrame(ts => boucleRef.current(ts));
      return;
    }
    const mo = mondeRef.current;
    const dt = dernierRef.current == null ? 1 / 60 : Math.min(0.05, Math.max(0, (maintenant - dernierRef.current) / 1000));
    dernierRef.current = maintenant;
    const cmd = cmdRef.current;
    if (cmd.tenue > 0) {
      cmd.tenue -= dt;
      if (cmd.tenue <= 0) cmd.sautTenu = false;
    }
    if (cmd.basRestant > 0) {
      cmd.basRestant -= dt;
      if (cmd.basRestant <= 0) cmd.bas = false;
    }
    const evenements = pas(mo, dt, cmd);
    cmd.sautAppui = false;
    cmd.geste = false;
    for (let i = 0; i < evenements.length; i += 1) {
      const type = evenements[i].type;
      // Après une chute ou un coup : le livreur attend le prochain geste.
      if (type === 'touche' || type === 'chute') {
        cmd.gauche = false;
        cmd.droite = false;
        cmd.sautTenu = false;
        cmd.tenue = 0;
      }
      if (type === 'touche' || type === 'noyade' || type === 'chute' || type === 'temps') vibrer('perte');
      else if (type === 'bonus' || type === 'encaisse' || type === 'ecarte' || type === 'boite') vibrer('fort');
      else if (type === 'colis') vibrer('leger');
      if (SONS_TOITS[type]) bruit(SONS_TOITS[type]);
    }
    const e = echelle();
    if (e) {
      const c = cibleCamera(mo, e);
      const k = 1 - Math.exp(-dt * 8);
      camRef.current = {x: camRef.current.x + (c.x - camRef.current.x) * k, y: camRef.current.y + (c.y - camRef.current.y) * k};
    }
    if (mo.etat === 'livre') {
      vibrer('livre');
      bruit('niveau');
      relacherTout();
      livrer();
    } else if (mo.etat === 'perdu') {
      relacherTout();
      finir();
    }
    if (monteRef.current) setImage(i => (i + 1) % 1000000);
    if (etatRef.current?.phase === 'jeu') rafRef.current = requestAnimationFrame(ts => boucleRef.current(ts));
  };

  // La boucle tourne seulement pendant la partie.
  const phase = etat?.phase;
  useEffect(() => {
    if (phase !== 'jeu') return undefined;
    dernierRef.current = null;
    rafRef.current = requestAnimationFrame(ts => boucleRef.current(ts));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase]);

  /** Nouvelle partie depuis le niveau 1 : records gardés. */
  const demarrer = useCallback(() => {
    recompensesRef.current.debut(0);
    setNouveauRecord(false);
    const base = {...partieNeuve(etatRef.current || {}), graine: 1 + Math.floor(Math.random() * 1e6)};
    lancerNiveau(base, 1, {});
  }, [lancerNiveau]);
  demarrerRef.current = demarrer;

  const pause = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu') return;
    const mo = mondeRef.current;
    relacherTout();
    appliquer({
      ...e,
      phase: 'pause',
      score: mo.score,
      meilleurScore: Math.max(e.meilleurScore || 0, mo.score),
    });
  }, [appliquer, relacherTout]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  // Pause automatique : nouvelle course annoncée (fiche de la course dans le jeu),
  // app en arrière-plan, écran quitté, retour pendant la partie (hooks/usePauseJeu.js).
  const estEnPartie = useCallback(() => etatRef.current?.phase === 'jeu', []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || etatRef.current?.phase !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: etat?.phase === 'jeu' || (classementOuvert && etat?.phase === 'pause'),
    estEnJeu: estEnPartie,
    fermerPanneau,
  });

  // Chargement de la partie enregistrée : en pause, au départ du niveau en cours.
  useEffect(() => {
    let vivant = true;
    reprendreAncienRecord('toits', idUser).then(() => chargerPartie(cle)).then(e => {
      if (!vivant) return;
      if (e.phase === 'pause') construire(e.niveau, e.debut, e.graine);
      appliquer(e, false);
      if (e.phase === 'pause') {
        repriseRef.current.verifier().then(({proposition, expiree}) => {
          if (vivant && !proposition && expiree) appliquer(partieNeuve(e));
        });
      }
    });
    return () => {
      vivant = false;
    };
  }, [cle, appliquer, construire]);

  // Démontage : pause (arrière-plan et écran quitté : usePauseJeu).
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      monteRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  // Musique du jeu : seulement pendant la partie.
  const enMusique = phase === 'jeu';
  useEffect(() => {
    if (enMusique) demarrerMusique(MUSIQUE);
    else arreterMusique();
    return () => arreterMusique();
  }, [enMusique]);

  const reprendre = useCallback(() => {
    const e = etatRef.current;
    if (!e) return;
    relacherTout();
    appliquer({...e, phase: 'jeu'});
  }, [appliquer, relacherTout]);

  const niveauSuivant = useCallback(() => {
    const e = etatRef.current;
    if (!e) return;
    lancerNiveau(e, e.niveau, e.debut);
  }, [lancerNiveau]);

  const quitter = useCallback(() => {
    pause();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [navigation, pause]);

  // Fiche de la course annoncée : « Voir la course » mène aux courses, partie en pause.
  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [fermerAlerte, navigation, pause]);

  const ouvrirClassement = useCallback(() => {
    pause();
    setClassementOuvert(true);
  }, [pause]);

  const confirmerNouvellePartie = useCallback(() => {
    Alert.alert(t('jeuNouvellePartieTitre'), t('jeuNouvellePartieTexte'), [
      {text: t('jeuAnnuler'), style: 'cancel'},
      {text: t('jeuNouvellePartie'), style: 'destructive', onPress: demarrer},
    ]);
  }, [demarrer, t]);

  const surMesurePiste = useCallback(
    ev => {
      const l = Math.round(ev.nativeEvent.layout.width);
      const h = Math.round(ev.nativeEvent.layout.height);
      if (l !== dimsRef.current.l || h !== dimsRef.current.h) {
        dimsRef.current = {l, h};
        setDims({l, h});
        placerCamera();
      }
    },
    [placerCamera],
  );

  // Commandes au doigt : balayer gauche, droite, haut, bas ; toucher = s'arrêter.
  const balayage = useBalayage({
    actif: etat?.phase === 'jeu',
    seuil: 24,
    surGauche: () => {
      const c = cmdRef.current;
      c.gauche = true;
      c.droite = false;
      c.geste = true;
    },
    surDroite: () => {
      const c = cmdRef.current;
      c.droite = true;
      c.gauche = false;
      c.geste = true;
    },
    surHaut: () => {
      const c = cmdRef.current;
      c.geste = true;
      c.sautAppui = true;
      c.sautTenu = true; // une poussée complète : le saut va à sa hauteur normale
      c.tenue = 0.3;
      c.bas = false;
      c.basRestant = 0;
      if (mondeRef.current.joueur.sol || mondeRef.current.vol > 0) bruit('saut');
    },
    surBas: () => {
      // Glisser vers le bas : le livreur s'arrête (et s'accroupit un instant) ; dans l'eau il plonge en continuant d'avancer.
      const c = cmdRef.current;
      if (!mondeRef.current.joueur.dansEau) {
        c.gauche = false;
        c.droite = false;
      }
      c.bas = true;
      c.basRestant = 0.75;
      if (mondeRef.current.joueur.sol) vibrer('leger');
    },
    surAppui: () => {
      const c = cmdRef.current;
      c.gauche = false;
      c.droite = false;
    },
  });

  if (!etat) {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator color={C.marque} />
      </View>
    );
  }

  // ---- Rendu de la scène ----
  let monde = null;
  if (dims.l && dims.h) {
    const s = Math.min(dims.l / LARGEUR_VUE, dims.h / HAUTEUR_VUE_MIN);
    const visW = dims.l / s;
    const cam = camRef.current;
    const tranche = Math.floor(cam.x / TRANCHE);
    const x1 = tranche * TRANCHE - 120;
    const x2 = tranche * TRANCHE + visW + TRANCHE + 120;
    const fx = cam.x * PARALLAXE;
    const ftranche = Math.floor(fx / TRANCHE);
    const vx1 = cam.x - 60;
    const vx2 = cam.x + visW + 60;
    const j = m.joueur;
    const clignote = (m.invul > 0 || m.attente) && Math.floor(m.horloge * 12) % 2 === 0;
    const nx = cam.x * 0.08;
    const lx = cam.x * 0.2;
    const ntr = Math.floor(nx / TRANCHE);
    const ltr = Math.floor(lx / TRANCHE);
    monde = (
      <>
        <View style={[StyleSheet.absoluteFill, {transform: [{translateX: -nx * s}]}]} pointerEvents="none">
          <Nuages x1={ntr * TRANCHE - 120} x2={ntr * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
        </View>
        <View style={[StyleSheet.absoluteFill, {transform: [{translateX: -lx * s}, {translateY: cam.y * s * 0.12}]}]} pointerEvents="none">
          <Lointain x1={ltr * TRANCHE - 120} x2={ltr * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
          <ElementsMonde
            liste={elementsRef.current}
            x1={ltr * TRANCHE - 120}
            x2={ltr * TRANCHE + visW + TRANCHE + 120}
            s={s}
            pal={pal}
            mer={m.monde === 'port'}
            horloge={m.monde === 'jungle' ? m.horloge : 0}
          />
        </View>
        <View style={[StyleSheet.absoluteFill, {transform: [{translateX: -fx * s}, {translateY: cam.y * s * 0.3}]}]} pointerEvents="none">
          <Fond fond={fondRef.current} x1={ftranche * TRANCHE - 120} x2={ftranche * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
        </View>
        <View style={[StyleSheet.absoluteFill, {transform: [{translateX: -cam.x * s}, {translateY: cam.y * s}]}]} pointerEvents="none">
          <Decor plateformes={m.plateformesDecor || m.plateformes} porte={m.porte} x1={x1} x2={x2} s={s} pal={pal} motif={m.motif} monde={m.monde} />
          <Etages etages={m.etages} x1={x1} x2={x2} s={s} pal={pal} />
          <PlongeesFond plongees={m.plongees} x1={vx1} x2={vx2} s={s} pal={pal} horloge={m.horloge} />
          <Algues algues={m.algues} x1={vx1} x2={vx2} s={s} horloge={m.horloge} />
          <Poissons poissons={m.poissons} x1={vx1} x2={vx2} s={s} horloge={m.horloge} />
          {visibles(m.ressorts || [], vx1, vx2).map(r => (
            <Ressort key={`r${r.id}`} r={r} s={s} pal={pal} />
          ))}
          {visibles(m.baches || [], vx1, vx2).map(r => (
            <Bache key={`t${r.id}`} r={r} s={s} pal={pal} />
          ))}
          {visibles(m.plateformes, vx1, vx2).map(p =>
            p.mobile || p.fragile ? <Dynamique key={`d${p.id}`} p={p} s={s} pal={pal} motif={m.motif} monde={m.monde} horloge={m.horloge} /> : null,
          )}
          {visibles(m.boites, vx1, vx2).map(b => (
            <Boite key={`b${b.id}`} b={b} s={s} pal={pal} horloge={m.horloge} />
          ))}
          {visibles(m.colis, vx1, vx2).map(c => (c.pris ? null : <ColisBrillant key={`c${c.id}`} c={c} m={m} s={s} />))}
          {visibles(m.geneurs, vx1, vx2).map(g =>
            g.actif && g.type === 'chat' ? (
              <Chat key={`g${g.id}`} e={g} s={s} />
            ) : g.actif ? (
              <Geneur
                key={`g${g.id}`}
                e={g}
                s={s}
                aboie={g.type === 'chien' && Math.abs(g.x - j.x) < 150 && Math.floor(g.temps * 2.5) % 3 === 0}
              />
            ) : null,
          )}
          <Tornades tornades={m.tornades} x1={vx1} x2={vx2} s={s} horloge={m.horloge} />
          {!m.passage && <AuraPouvoirs m={m} j={j} s={s} />}
          {!m.passage && (
            <Livreur
              j={j}
              s={s}
              clignote={clignote}
              accroupi={!!j.accroupi}
              grand={m.grand}
              vol={m.vol > 0}
              etoile={m.etoile > 0}
              horloge={m.horloge}
            />
          )}
          <Eaux eaux={(m.env && m.env.eaux) || []} x1={vx1} x2={vx2} s={s} horloge={m.horloge} />
          <PlongeesEau plongees={m.plongees} x1={vx1} x2={vx2} s={s} horloge={m.horloge} />
          {m.sorties.map(o => (
            <Sortie key={o.id} o={o} s={s} />
          ))}
          {m.popups.map(p => (
            <Text
              key={p.id}
              style={[styles.popup, {left: p.x * s - 30, bottom: (p.y + SOL_ECRAN + p.age * 40) * s, opacity: Math.max(0, 1 - p.age / 0.9)}]}>
              {p.texte}
            </Text>
          ))}
        </View>
      </>
    );
  }

  const enJeu = etat.phase === 'jeu';
  const progression = avancee(m);
  const urgent = m.reste <= 10 && m.etat === 'jeu';
  const boosters = BOOSTERS.filter(b => m[b.id] > 0).map(b => ({...b, ratio: m[b.id] / DUREES[b.id]}));
  if (m.grand) boosters.push({id: 'grand', icone: 'shield-check', couleur: '#0A9A78', ratio: 1});
  const annonce = m.annonce;
  const oxygene = Math.max(0, Math.min(1, m.oxygene == null ? 1 : m.oxygene));
  const voirOxygene = !!(m.joueur && m.joueur.dansEau) || oxygene < 1;
  const couleurOxygene = oxygene < 0.25 ? C.danger : oxygene < 0.5 ? '#E8650F' : '#2D7FD3';
  const oxygeneClignote = oxygene < 0.25 && Math.floor((m.horloge || 0) * 6) % 2 === 0;
  const tempete = Math.max(0, Math.min(1, m.tempete || 0));
  const mondeInfo = mondeParId(m.monde);
  const recap = recompenses.recap(etat.score);

  return (
    <View style={[styles.ecran, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
      <HudJeu
        score={m.score}
        niveau={m.niveau}
        vies={m.vies}
        viesMax={VIES}
        objets={{n: m.pieces % PALIER_PIECES, total: PALIER_PIECES, icone: 'cube', libelle: t('jeuxToitsBonusLibelle')}}
        onPause={pause}
        onQuitter={quitter}
        pauseActive={enJeu}
      />
      <BandeauClassement bandeau={bandeau} style={styles.bandeau} />
      {/* Avancée dans le niveau, chrono et moment de la journée */}
      <View style={styles.ligneTemps}>
        <View style={styles.jauge}>
          <View style={[styles.jaugePleine, {width: `${progression * 100}%`}]} />
        </View>
        <Ionicons name="timer-outline" size={14} color={urgent ? C.danger : C.texteDiscret} />
        <Text style={[styles.chrono, urgent && {color: C.danger}]}>{Math.max(0, Math.ceil(m.reste))}</Text>
        <Text style={styles.decorNom} numberOfLines={1}>{t(CLE_MONDE[m.monde] || CLE_MONDE.ville)}</Text>
      </View>

      {/* Ville */}
      <View style={[styles.piste, {backgroundColor: pal.horizon}]} onLayout={surMesurePiste}>
        <Ciel pal={pal} decor={m.decor} />
        {m.decor === 'nuit' &&
          ETOILES.map(e2 => (
            <View
              key={e2.id}
              pointerEvents="none"
              style={[stylesDecor.etoile, {left: `${e2.x}%`, top: `${e2.y}%`, opacity: e2.o}]}
            />
          ))}
        {monde}
        {mondeParId(m.monde).lampions && (
          <View pointerEvents="none" style={styles.guirlande}>
            <View style={styles.guirlandeFil} />
            {LAMPIONS.map((c, i) => (
              <View key={i} style={[styles.lampion, {backgroundColor: c, marginTop: 4 + Math.sin((i / (LAMPIONS.length - 1)) * Math.PI) * 10}]} />
            ))}
          </View>
        )}
        {mondeInfo.lianes &&
          LIANES.map((l, i) => (
            <View
              key={`liane${i}`}
              pointerEvents="none"
              style={[styles.liane, {left: `${l.x}%`, height: l.l, transform: [{rotate: `${Math.sin(m.horloge * 0.9 + i * 1.7) * 4}deg`}]}]}>
              <View style={styles.lianeTige} />
              {[0.3, 0.6, 0.92].map((k, f) => (
                <View key={f} style={[styles.lianeFeuille, {top: l.l * k - 4, left: f % 2 ? 2 : -6, transform: [{rotate: f % 2 ? '-35deg' : '35deg'}]}]} />
              ))}
            </View>
          ))}
        {PARTICULES[mondeInfo.particules] &&
          (PARTICULES[mondeInfo.particules].double ? [0, 1] : [0]).map(serie =>
            GOUTTES.map(g => {
              const pa = PARTICULES[mondeInfo.particules];
              const decale = serie * 0.5;
              const k = (m.horloge * g.v * pa.vitesse + g.p + decale) % 1;
              const balance = Math.sin(m.horloge * 1.3 + g.p * 6.28) * 2.5;
              const taille = pa.grosses && g.id % 3 === 0 ? pa.taille * 1.6 : pa.taille;
              let left = `${(g.x + serie * 13 + balance + 100) % 100}%`;
              let top = `${-6 + k * 108}%`;
              let opacite;
              if (pa.mode === 'vent') {
                // Sable : file à l'horizontale, de droite à gauche, à hauteur fixe.
                left = `${106 - k * 112}%`;
                top = `${(g.x * 0.93 + g.p * 7 + serie * 41) % 100}%`;
              } else if (pa.mode === 'flotte') {
                // Lucioles : flottent lentement et s'allument tour à tour.
                left = `${(g.x + Math.sin(m.horloge * 0.5 + g.id) * 4 + 100) % 100}%`;
                top = `${(g.p * 90 + 5 + Math.cos(m.horloge * 0.4 + g.id * 1.3) * 5 + 100) % 100}%`;
                opacite = 0.35 + 0.65 * Math.abs(Math.sin(m.horloge * 1.2 + g.id));
              }
              return (
                <View
                  key={`${serie}_${g.id}`}
                  pointerEvents="none"
                  style={[
                    styles.particule,
                    pa.mode === 'flotte' && styles.luciole,
                    {
                      left,
                      top,
                      width: pa.mode === 'vent' ? taille * 2.4 : taille,
                      height: taille,
                      borderRadius: pa.rond ? taille / 2 : 1,
                      backgroundColor: pa.couleur,
                      transform: pa.rond ? undefined : [{rotate: `${Math.round(k * 720)}deg`}],
                    },
                    opacite != null && {opacity: opacite},
                  ]}
                />
              );
            }),
          )}
        {tempete > 0 && (
          <>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: '#C9944F', opacity: Math.min(0.5, 0.45 * tempete)}]} />
            {GOUTTES.slice(0, Math.round(6 + tempete * 20)).map(g => {
              const k = (m.horloge * g.v * (1.2 + tempete) + g.p) % 1;
              return (
                <View
                  key={`tr${g.id}`}
                  pointerEvents="none"
                  style={[styles.trainee, {left: `${110 - k * 140}%`, top: `${(g.x * 0.97 + g.p * 11) % 100}%`, width: 26 + (g.id % 4) * 12, opacity: 0.25 + tempete * 0.45}]}
                />
              );
            })}
          </>
        )}
        {m.decor === 'pluie' &&
          GOUTTES.map(g => {
            const k = (m.horloge * g.v + g.p) % 1;
            return (
              <View
                key={g.id}
                pointerEvents="none"
                style={[stylesDecor.goutte, {left: `${g.x}%`, top: `${-8 + k * 112}%`, opacity: 0.55}]}
              />
            );
          })}
        {/* En haut de la scène : bonus en cours puis annonce d'un bonus gagné, jamais au centre. */}
        <View style={styles.hud} pointerEvents="none">
          {voirOxygene && (
            <View style={[styles.oxygene, {opacity: oxygeneClignote ? 0.45 : 1}]}>
              <MaterialCommunityIcons name="diving-scuba-tank" size={16} color={couleurOxygene} />
              <Text style={[styles.oxygeneTexte, {color: couleurOxygene}]} numberOfLines={1}>
                {t('jeuxToitsOxygene')}
              </Text>
              <View style={styles.oxygeneFond}>
                <View style={[styles.oxygenePlein, {width: `${oxygene * 100}%`, backgroundColor: couleurOxygene}]} />
              </View>
            </View>
          )}
          {boosters.length > 0 && (
            <View style={styles.rangee}>
              {boosters.map(b => (
                <Booster key={b.id} icone={b.icone} couleur={b.couleur} ratio={b.ratio} />
              ))}
            </View>
          )}
          {annonce && (
            <View
              style={[
                styles.annonce,
                {
                  backgroundColor: annonce.couleur,
                  opacity: Math.min(1, (1.8 - annonce.age) / 0.4),
                  transform: [{scale: annonce.age < 0.15 ? 0.85 + annonce.age : 1}],
                },
              ]}>
              <MaterialCommunityIcons name={annonce.icone} size={16} color={C.blanc} />
              <Text style={styles.annonceTexte} numberOfLines={1}>
                {t(`jeuxToits${annonce.cle.charAt(0).toUpperCase()}${annonce.cle.slice(1)}`, {n: annonce.n})}
              </Text>
            </View>
          )}
        </View>
        <IndiceGestes jeu={JEU_TOITS} gestes={['gauche', 'droite', 'haut', 'bas']} actif={enJeu} />
        {/* Couche des gestes : toute la scène */}
        <View {...balayage.panHandlers} style={StyleSheet.absoluteFill} />
        <CouchePopups ref={popupsRef} />
        <BanniereRecompense ref={banniereRef} />
      </View>

      {/* Fenêtres : accueil, pause, colis livré, fin de partie */}
      {etat.phase !== 'jeu' && !classementOuvert && !reprise.proposition && !alerteCourse && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {etat.phase === 'accueil' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <MaterialCommunityIcons name="home-roof" size={44} color={C.marque} />
                <Text style={styles.titre}>{t('jeuxToitsTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxToitsRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxToitsAstuce')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxToitsAstuceDur')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxToitsAstuceBonus')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxToitsAstuceTerrain')}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuJouer')} onPress={demarrer} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'pause' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="pause-circle" size={44} color={C.marque} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', {n: m.score})}</Text>
                <Text style={styles.texteDiscret}>{t('jeuSauvegarde')}</Text>
                <Bouton texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton secondaire texte={t('jeuxToitsRejouer')} onPress={confirmerNouvellePartie} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'livre' && (
              <>
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <MaterialCommunityIcons name="package-variant-closed" size={46} color={C.marque} />
                <Text style={styles.titre}>{t('jeuxToitsLivre')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuNiveauReussi', {n: m.niveau})}</Text>
                {decorNiveau(etat.niveau).monde !== m.monde && (
                  <Text style={styles.texteDiscret}>
                    {t('jeuxToitsMondeSuivant', {nom: t(CLE_MONDE[decorNiveau(etat.niveau).monde] || CLE_MONDE.ville)})}
                  </Text>
                )}
                <View style={styles.lignes}>
                  <Text style={styles.texte}>{t('jeuxToitsColisNiveau', {n: m.colisNiveau})}</Text>
                  <Text style={styles.texte}>{t('jeuxToitsBonusLivraison', {n: POINTS.livraison})}</Text>
                  <Text style={styles.texte}>{t('jeuxToitsBonusTemps', {n: m.bonusTemps})}</Text>
                  <Text style={styles.scoreFort}>{t('jeuScore', {n: m.score})}</Text>
                </View>
                <RecapRecompenses record={recap.record} points={Math.max(0, m.score - (etat.scoreDebutNiveau || 0))} />
                <Bouton texte={t('jeuNiveauSuivant')} onPress={niveauSuivant} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'perdu' && (
              <>
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="heart-dislike" size={44} color={C.danger} />
                <Text style={styles.titre}>{t('jeuxToitsFin')}</Text>
                <Text style={styles.texte}>{t('jeuxToitsFinTexte', {n: m.niveau})}</Text>
                <Text style={styles.scoreFort}>{t('jeuScore', {n: etat.score})}</Text>
                {nouveauRecord && <Text style={styles.nouveauRecord}>{t('jeuxToitsNouveauRecord')}</Text>}
                <RecapRecompenses {...recap} />
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeuxToitsRejouer')} onPress={demarrer} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}

      <FenetreReprise
        proposition={alerteCourse ? null : reprise.proposition}
        onReprendre={reprise.reprendre}
        onRecommencer={reprise.recommencer}
      />
      <SonJeux />

      {/* Classement : le jeu reste en pause derrière. */}
      <ClassementJeu
        jeu={JEU_TOITS}
        visible={classementOuvert && etat.phase !== 'jeu'}
        onClose={() => setClassementOuvert(false)}
        avantChargement={envoyer}
      />
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
      )}
    </View>
  );
}

// Passerelles des étages : poteaux posés sur le toit, puis planches (dessin fixe, recalculé à chaque tranche).
const Etages = memo(function Etages({etages, x1, x2, s, pal}) {
  const liste = visibles(etages || [], x1, x2);
  if (!liste.length) return null;
  return (
    <>
      {liste.map(p => (
        <React.Fragment key={`pe${p.id}`}>
          <View style={[pos(p.x + 8, p.appui, 3, p.y - 8 - p.appui, s), {backgroundColor: pal.poteau}]} />
          <View style={[pos(p.x + p.w - 11, p.appui, 3, p.y - 8 - p.appui, s), {backgroundColor: pal.poteau}]} />
        </React.Fragment>
      ))}
      {liste.map(p => (
        <View
          key={`ep${p.id}`}
          style={[pos(p.x, p.y - 9, p.w, 9, s), {backgroundColor: pal.planche, borderRadius: 2 * s, borderWidth: 1, borderColor: pal.toitBord}]}>
          <View style={[styles.rivets, {paddingHorizontal: 4 * s}]}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={{width: 2.4 * s, height: 2.4 * s, borderRadius: 1.2 * s, backgroundColor: pal.toitBord}} />
            ))}
          </View>
        </View>
      ))}
    </>
  );
});

// Ressort sur un toit : il s'écrase au rebond puis se redresse (r.comp, de 1 à 0).
// Objet qui jaillit d'une boîte ou d'une caisse : il monte en ralentissant, grossit d'un coup, étincelles autour.
function Sortie({o, s}) {
  const d = SORTIES[o.type] || SORTIES.etoile;
  const k = Math.min(1, o.age / DUREE_SORTIE);
  const montee = 62 * (1 - (1 - Math.min(1, k * 1.6)) ** 2);
  const echelle = k < 0.15 ? 0.5 + (k / 0.15) * 0.7 : k < 0.3 ? 1.2 - ((k - 0.15) / 0.15) * 0.2 : 1;
  const fondu = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
  const ecart = 8 + k * 18;
  return (
    <View style={[pos(o.x - 13, o.y + 4 + montee, 26, 26, s), {opacity: fondu}]} pointerEvents="none">
      <View style={[styles.sortieHalo, {backgroundColor: d.couleur, borderRadius: 20 * s, left: -7 * s, top: -7 * s, width: 40 * s, height: 40 * s, opacity: 0.22 * (1 - k)}]} />
      {[0, 1, 2, 3].map(i => {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        return (
          <View key={i} style={[styles.abs, {left: (9 + Math.cos(a) * ecart) * s, bottom: (9 + Math.sin(a) * ecart) * s, opacity: 1 - k}]}>
            <MaterialCommunityIcons name="star-four-points" size={8 * s} color={OR} />
          </View>
        );
      })}
      <View
        style={[
          styles.sortiePastille,
          {backgroundColor: d.couleur, width: 26 * s, height: 26 * s, borderRadius: 13 * s, borderWidth: Math.max(1.5, 2 * s), transform: [{scale: echelle}]},
        ]}>
        <MaterialCommunityIcons name={d.icone} size={15 * s} color={C.blanc} />
      </View>
    </View>
  );
}

// Aura des super pouvoirs autour du livreur : un anneau par pouvoir actif (deux au plus), qui pulse et
// clignote quand il va s'arrêter. Sprint : traînées derrière ; double saut : chevrons sous les pieds en l'air ;
// aimant : cercle de portée en pointillés.
function AuraPouvoirs({m, j, s}) {
  const actifs = AURAS.filter(a => m[a.id] > 0).slice(0, 2);
  if (!actifs.length) return null;
  const h = (j.accroupi ? HAUTEUR * 0.55 : HAUTEUR) * (m.grand ? 1.2 : 1);
  const cx = j.x + LARGEUR / 2;
  const cy = j.y + h / 2;
  const pouls = 0.5 + 0.5 * Math.sin(m.horloge * 7);
  return (
    <>
      {m.aimant > 0 && (
        <View style={[pos(cx - 60, cy - 60, 120, 120, s), styles.aimantPortee, {borderRadius: 60 * s, opacity: 0.35 + pouls * 0.2}]} pointerEvents="none" />
      )}
      {actifs.map((a, i) => {
        const fin = m[a.id] < 1.5 && Math.floor(m.horloge * 8) % 2 === 0;
        const r = 4 + i * 5 + pouls * 2;
        return (
          <View
            key={a.id}
            pointerEvents="none"
            style={[
              pos(j.x - r, j.y - 2 - r * 0.4, LARGEUR + r * 2, h + 4 + r * 1.4, s),
              styles.aura,
              {
                borderRadius: (LARGEUR / 2 + r) * s,
                borderColor: a.couleur,
                backgroundColor: i === 0 ? `${a.couleur}33` : 'transparent',
                borderWidth: Math.max(1.5, (i === 0 ? 2.5 : 1.5) * s),
                opacity: fin ? 0.3 : 0.9,
                shadowColor: a.couleur,
              },
              i === 0 && styles.auraPleine,
            ]}
          />
        );
      })}
      {m.sprint > 0 && Math.abs(j.vx) > 40 &&
        [0, 1, 2].map(i => {
          const lg = 14 + ((m.horloge * 40 + i * 7) % 10);
          const x = j.vx > 0 ? j.x - lg - 2 - i * 3 : j.x + LARGEUR + 2 + i * 3;
          return (
            <View
              key={`v${i}`}
              pointerEvents="none"
              style={[pos(x, j.y + 6 + i * 8, lg, 2.5, s), {backgroundColor: '#D6336C', borderRadius: 2 * s, opacity: 0.75 - i * 0.18}]}
            />
          );
        })}
      {m.doubleSaut > 0 && !j.sol && j.sautAir && (
        <View style={[pos(cx - 9, j.y - 16, 18, 16, s), stylesDecor.centre, {opacity: 0.6 + pouls * 0.4}]} pointerEvents="none">
          <MaterialCommunityIcons name="chevron-double-up" size={16 * s} color="#0E8C9C" />
        </View>
      )}
    </>
  );
}

// Bâche tendue sur le toit : deux piquets, toile rayée qui s'écrase quand le livreur rebondit.
function Bache({r, s, pal}) {
  const c = r.comp || 0;
  const bandes = 5;
  return (
    <View style={pos(r.x - 3, r.y, r.w + 6, r.h + 2, s)} pointerEvents="none">
      <View style={[styles.abs, {left: 0, bottom: 0, width: 3 * s, height: (r.h + 2) * s, borderRadius: 1.5 * s, backgroundColor: pal.poteau, transform: [{rotate: `${c * 12}deg`}]}]} />
      <View style={[styles.abs, {right: 0, bottom: 0, width: 3 * s, height: (r.h + 2) * s, borderRadius: 1.5 * s, backgroundColor: pal.poteau, transform: [{rotate: `${-c * 12}deg`}]}]} />
      <View style={[styles.abs, {left: 2 * s, right: 2 * s, bottom: (r.h - 1) * s, height: 1, backgroundColor: pal.poteau, opacity: 0.6}]} />
      <View style={[styles.abs, styles.bacheToile, {left: 2 * s, right: 2 * s, bottom: (1 - c) * s, height: (4 - c * 1.5) * s, borderRadius: 2 * s}]}>
        {Array.from({length: bandes}, (_, i) => (
          <View key={i} style={{flex: 1, backgroundColor: i % 2 ? pal.rayure : '#E74C3C'}} />
        ))}
      </View>
    </View>
  );
}

// Chat de gouttière : tigré orange, il bondit en patrouillant (même cadre que les autres gêneurs).
function Chat({e, s}) {
  const u = v => v * s;
  const ecarte = e.ecarte > 0;
  const t = e.temps || 0;
  const enBond = e.y > (e.base || e.y) + 1;
  const pa = enBond ? 35 : Math.sin(t * 14) * 28;
  const queue = Math.sin(t * 6) * 18;
  const roux = '#E08A2E';
  const fonce = '#A85A17';
  const clair = '#F6C88E';
  const patte = (x, angle, couleur) => (
    <View style={{position: 'absolute', left: u(x), bottom: 0, width: u(2.6), height: u(10), transform: [{rotate: `${angle}deg`}]}}>
      <View style={{position: 'absolute', left: 0, bottom: 0, width: u(2.6), height: u(5.5), borderRadius: u(1.3), backgroundColor: couleur}} />
    </View>
  );
  return (
    <View
      pointerEvents="none"
      style={[
        pos(e.x, e.y, e.w, e.h, s),
        {opacity: ecarte ? Math.max(0, 1 - e.ecarte / 0.7) : 1, transform: [{scaleX: e.dir > 0 ? 1 : -1}, {rotate: ecarte ? '180deg' : '0deg'}]},
      ]}>
      <View style={{position: 'absolute', left: u(-1), bottom: u(8), width: u(2.6), height: u(11), borderRadius: u(1.3), backgroundColor: roux, transform: [{rotate: `${-30 + queue}deg`}]}} />
      {patte(4, -pa, fonce)}
      {patte(14, pa, fonce)}
      <View style={{position: 'absolute', left: u(2), bottom: u(4), width: u(16), height: u(8), borderRadius: u(4), backgroundColor: roux}}>
        <View style={{position: 'absolute', left: u(4), top: 0, width: u(2), height: u(4), backgroundColor: fonce, opacity: 0.7}} />
        <View style={{position: 'absolute', left: u(8), top: 0, width: u(2), height: u(4), backgroundColor: fonce, opacity: 0.7}} />
        <View style={{position: 'absolute', left: u(2), right: u(3), bottom: 0, height: u(2.5), borderRadius: u(1.2), backgroundColor: clair}} />
      </View>
      {patte(6.5, pa, roux)}
      {patte(16, -pa, roux)}
      <View style={{position: 'absolute', left: u(14), bottom: u(8), width: u(9), height: u(8), borderRadius: u(4), backgroundColor: roux}} />
      <View style={{position: 'absolute', left: u(14.5), bottom: u(14), width: 0, height: 0, borderLeftWidth: u(2), borderRightWidth: u(2), borderBottomWidth: u(4), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: fonce}} />
      <View style={{position: 'absolute', left: u(19), bottom: u(14), width: 0, height: 0, borderLeftWidth: u(2), borderRightWidth: u(2), borderBottomWidth: u(4), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: fonce}} />
      <View style={{position: 'absolute', left: u(19.5), bottom: u(9), width: u(4), height: u(3), borderRadius: u(1.5), backgroundColor: clair}} />
      <View style={{position: 'absolute', left: u(20), bottom: u(12), width: u(1.8), height: u(2.4), borderRadius: u(0.9), backgroundColor: '#2E7D32'}} />
      <View style={{position: 'absolute', left: u(16.5), bottom: u(12), width: u(1.8), height: u(2.4), borderRadius: u(0.9), backgroundColor: '#2E7D32'}} />
      <View style={{position: 'absolute', left: u(22.5), bottom: u(10.5), width: u(1.4), height: u(1.2), borderRadius: u(0.7), backgroundColor: '#D9467A'}} />
    </View>
  );
}

function Ressort({r, s, pal}) {
  const h = r.h * (1 - 0.5 * (r.comp || 0));
  const spire = (h - 6) / 3;
  return (
    <View style={pos(r.x, r.y, r.w, h, s)} pointerEvents="none">
      <View style={[styles.ressortPlaque, {bottom: 0, height: 3 * s, backgroundColor: pal.toitBord}]} />
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            styles.ressortSpire,
            {bottom: (3 + i * spire) * s, height: Math.max(1, spire * s), borderColor: '#C0392B', transform: [{skewX: i % 2 ? '-18deg' : '18deg'}]},
          ]}
        />
      ))}
      <View style={[styles.ressortPlaque, {top: 0, height: 3.5 * s, backgroundColor: '#E74C3C'}]} />
    </View>
  );
}

// Éléments du fond propres au monde (grues, bateaux, enseignes, sapins, dunes, temples, cascades...), au loin.
// horloge : seulement en jungle (cascades), 0 ailleurs pour ne pas redessiner à chaque image.
const ElementsMonde = memo(function ElementsMonde({liste, x1, x2, s, pal, mer, horloge}) {
  const vis = visibles(liste || [], x1, x2);
  return (
    <>
      {mer && <View style={[pos(x1, -40, x2 - x1, 58, s), {backgroundColor: pal.mer || '#3E6E8E'}]} />}
      {mer && <View style={[pos(x1, 16, x2 - x1, 2, s), {backgroundColor: pal.merClair || '#F6B07A', opacity: 0.7}]} />}
      {vis.map(e => {
        if (e.type === 'grue') {
          const h = 120 + e.h;
          return (
            <View key={e.id} style={pos(e.x, 14, 90, h + 6, s)}>
              <View style={[styles.abs, {left: 18 * s, bottom: 0, width: 5 * s, height: h * s, backgroundColor: '#E0A100'}]} />
              <View style={[styles.abs, {left: 0, bottom: (h - 4) * s, width: 90 * s, height: 4 * s, backgroundColor: '#E0A100'}]} />
              <View style={[styles.abs, {left: 70 * s, bottom: (h - 34) * s, width: 1, height: 30 * s, backgroundColor: pal.toitBord}]} />
              <View style={[styles.abs, {left: 66 * s, bottom: (h - 40) * s, width: 9 * s, height: 6 * s, backgroundColor: pal.toitBord}]} />
            </View>
          );
        }
        if (e.type === 'enseigne') {
          const c = e.v < 0.5 ? '#FF4FD8' : '#3FF0FF';
          return (
            <View key={e.id} style={pos(e.x, 14, 40, 40 + e.h, s)}>
              <View style={[styles.abs, {left: 18 * s, bottom: 0, width: 3 * s, height: e.h * s, backgroundColor: pal.fondHaut}]} />
              <View style={[styles.abs, styles.enseigne, {left: 0, bottom: e.h * s, width: 40 * s, height: 22 * s, borderColor: c, shadowColor: c}]} />
            </View>
          );
        }
        if (e.type === 'dune') {
          // Dunes : deux plans de sable arrondis.
          const lg = 150 + e.h * 1.4;
          const ht = 26 + e.h * 0.35;
          return (
            <View key={e.id} style={pos(e.x - 30, 0, lg + 60, ht + 14, s)}>
              <View style={[styles.abs, {left: 0, bottom: 0, width: lg * 0.75 * s, height: (ht + 12) * s, borderTopLeftRadius: lg * 0.4 * s, borderTopRightRadius: lg * 0.4 * s, backgroundColor: pal.duneLoin || '#E6C48E'}]} />
              <View style={[styles.abs, {left: lg * 0.3 * s, bottom: 0, width: lg * s, height: ht * s, borderTopLeftRadius: lg * 0.5 * s, borderTopRightRadius: lg * 0.5 * s, backgroundColor: pal.dune || '#D9A866'}]}>
                <View style={[styles.abs, {left: lg * 0.2 * s, top: 3 * s, width: lg * 0.35 * s, height: 2 * s, borderRadius: s, backgroundColor: 'rgba(255,255,255,0.3)'}]} />
              </View>
            </View>
          );
        }
        if (e.type === 'temple') {
          // Temple : pyramide à étages en pierre moussue, porte sombre au sommet.
          const base = 80 + e.h * 0.4;
          const etages = 4;
          const he = 14 + e.h * 0.06;
          return (
            <View key={e.id} style={pos(e.x, 12, base, etages * he + 16, s)}>
              {Array.from({length: etages}).map((_, i) => {
                const lg = base * (1 - i * 0.2);
                return (
                  <View key={i} style={[styles.abs, {left: ((base - lg) / 2) * s, bottom: i * he * s, width: lg * s, height: he * s, backgroundColor: i % 2 ? '#8E8C74' : '#9C9A80', borderTopWidth: 3 * s, borderColor: '#5E7F45'}]} />
                );
              })}
              <View style={[styles.abs, {left: (base / 2 - 9) * s, bottom: etages * he * s, width: 18 * s, height: 14 * s, backgroundColor: '#8E8C74', borderTopLeftRadius: 2 * s, borderTopRightRadius: 2 * s}]}>
                <View style={[styles.abs, {left: 5 * s, bottom: 0, width: 8 * s, height: 9 * s, borderTopLeftRadius: 4 * s, borderTopRightRadius: 4 * s, backgroundColor: '#3A3A2E'}]} />
              </View>
              <View style={[styles.abs, {left: (base / 2 - 2) * s, bottom: 0, width: 4 * s, height: etages * he * s, backgroundColor: 'rgba(0,0,0,0.12)'}]} />
            </View>
          );
        }
        if (e.type === 'cascade') {
          // Cascade : falaise, chute d'eau claire qui défile, écume en bas.
          const ht = 90 + e.h;
          const t = horloge || 0;
          return (
            <View key={e.id} style={pos(e.x, 12, 46, ht, s)}>
              <View style={[styles.abs, {left: 0, bottom: 0, width: 46 * s, height: ht * s, borderTopLeftRadius: 10 * s, borderTopRightRadius: 6 * s, backgroundColor: '#6E7A5E'}]} />
              <View style={[styles.abs, {left: 0, top: 0, width: 46 * s, height: 8 * s, borderTopLeftRadius: 10 * s, borderTopRightRadius: 6 * s, backgroundColor: '#4E8A3A'}]} />
              <View style={[styles.abs, {left: 14 * s, bottom: 4 * s, width: 18 * s, height: (ht - 6) * s, backgroundColor: 'rgba(205,236,250,0.9)', overflow: 'hidden'}]}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={[styles.abs, {left: (3 + i * 5) * s, top: (((t * 70 + i * 37) % ht) - 20) * s, width: 2 * s, height: 20 * s, borderRadius: s, backgroundColor: '#FFFFFF', opacity: 0.8}]} />
                ))}
              </View>
              {[0, 1, 2].map(i => (
                <View key={`e${i}`} style={[styles.abs, {left: (9 + i * 9) * s, bottom: 0, width: 10 * s, height: 8 * s, borderRadius: 5 * s, backgroundColor: '#FFFFFF', opacity: 0.6 + 0.3 * Math.sin(t * 6 + i * 2), transform: [{scale: 0.85 + 0.2 * Math.sin(t * 5 + i)}]}]} />
              ))}
            </View>
          );
        }
        const icone = {bateau: 'sail-boat', sapin: 'pine-tree', antenne: 'radio-tower', arbre: 'tree', cactus: 'cactus', palmier: 'palm-tree'}[e.type];
        if (!icone) return null;
        const couleur = {
          bateau: '#FFFFFF', sapin: '#2E6B4F', antenne: pal.loin, arbre: e.v < 0.5 ? '#D9822B' : '#B84A1F', cactus: '#4F8F3A', palmier: '#3E8A3A',
        }[e.type];
        const taille = e.type === 'bateau' ? 34 : 30 + e.h * 0.4;
        return (
          <View key={e.id} style={pos(e.x, e.type === 'bateau' ? 10 : 12, taille, taille, s)}>
            <MaterialCommunityIcons name={icone} size={taille * s} color={couleur} />
            {e.type === 'sapin' && (
              // Sapin enneigé : le haut du sapin repeint en blanc, petit tas de neige au pied.
              <>
                <View style={[styles.abs, {left: 0, top: 0, width: taille * s, height: taille * 0.42 * s, overflow: 'hidden', opacity: 0.9}]}>
                  <MaterialCommunityIcons name="pine-tree" size={taille * s} color="#FFFFFF" />
                </View>
                <View style={[styles.abs, {left: taille * 0.15 * s, bottom: 0, width: taille * 0.7 * s, height: 5 * s, borderRadius: 3 * s, backgroundColor: '#FFFFFF'}]} />
              </>
            )}
          </View>
        );
      })}
    </>
  );
});

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
  ligneTemps: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10},
  jauge: {flex: 1, height: 6, borderRadius: 3, backgroundColor: C.bordure, overflow: 'hidden', marginRight: 4},
  jaugePleine: {height: 6, borderRadius: 3, backgroundColor: C.marque},
  chrono: {color: C.texteDiscret, fontSize: 13, fontWeight: '800', minWidth: 22},
  decorNom: {color: C.texteDiscret, fontSize: 12, fontWeight: '600', flexShrink: 1},
  abs: {position: 'absolute'},
  rivets: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  ressortPlaque: {position: 'absolute', left: 0, right: 0, borderRadius: 2},
  bacheToile: {flexDirection: 'row', overflow: 'hidden'},
  sortieHalo: {position: 'absolute'},
  sortiePastille: {position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', borderColor: '#FFFFFF'},
  aura: {position: 'absolute'},
  auraPleine: {shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: {width: 0, height: 0}},
  aimantPortee: {borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8E44AD'},
  ressortSpire: {position: 'absolute', left: '15%', right: '15%', borderWidth: 2, borderRadius: 2},
  enseigne: {borderWidth: 3, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: {width: 0, height: 0}},
  guirlande: {position: 'absolute', top: 0, left: 0, right: 0, height: 26, flexDirection: 'row', justifyContent: 'space-around'},
  guirlandeFil: {position: 'absolute', top: 6, left: 0, right: 0, height: 1, backgroundColor: 'rgba(48, 51, 79, 0.35)'},
  lampion: {width: 9, height: 11, borderRadius: 4.5, opacity: 0.95},
  particule: {position: 'absolute', opacity: 0.85},
  luciole: {shadowColor: '#E4F55A', shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: {width: 0, height: 0}},
  trainee: {position: 'absolute', height: 1.5, borderRadius: 1, backgroundColor: '#F1D2A0'},
  liane: {position: 'absolute', top: -4, width: 6},
  lianeTige: {position: 'absolute', left: 1.5, top: 0, bottom: 0, width: 3, borderRadius: 1.5, backgroundColor: '#3F7A2A'},
  lianeFeuille: {position: 'absolute', width: 10, height: 5, borderRadius: 3, backgroundColor: '#5DAA3C'},
  oxygene: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 28,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)',
  },
  oxygeneTexte: {fontSize: 12, fontWeight: '800'},
  oxygeneFond: {width: 64, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(48,51,79,0.15)', overflow: 'hidden'},
  oxygenePlein: {height: '100%', borderRadius: 3.5},
  piste: {flex: 1, marginTop: 8, borderRadius: 18, borderWidth: 1, borderColor: C.bordure, overflow: 'hidden'},
  hud: {position: 'absolute', top: 8, left: 8, right: 8, gap: 6},
  rangee: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6},
  annonce: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 28,
    borderRadius: 14, maxWidth: '100%',
  },
  annonceTexte: {color: C.blanc, fontSize: 13, fontWeight: '800', flexShrink: 1},
  popup: {
    position: 'absolute', width: 60, textAlign: 'center', color: OR, fontSize: 15, fontWeight: '900',
    textShadowColor: 'rgba(48, 51, 79, 0.35)', textShadowRadius: 2,
  },
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
  texteDiscret: {color: C.texteDiscret, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18},
  lignes: {marginTop: 4, alignItems: 'center'},
  scoreFort: {color: C.texte, fontSize: 18, fontWeight: '800', marginTop: 10, textAlign: 'center'},
  nouveauRecord: {color: OR_FONCE, fontSize: 17, fontWeight: '800', marginTop: 10, textAlign: 'center'},
  records: {marginTop: 6, marginBottom: 4},
  bouton: {alignSelf: 'stretch', marginTop: 14, backgroundColor: C.marque, borderRadius: 14, paddingVertical: 14, alignItems: 'center'},
  boutonSecondaire: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.bordureForte, marginTop: 10},
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
  boutonTexteSecondaire: {color: C.texte},
});
