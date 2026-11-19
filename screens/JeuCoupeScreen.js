/**
 * Mini-jeu « Fruits express » (clé coupe), même jeu que l'app client
 * (AppUser, screens/Jeux/CoupeScreen.js), pour patienter entre deux courses.
 *
 * Les fruits d'une commande (smoothie, primeur) jaillissent du bas de
 * l'écran en arc. Le livreur les tranche en glissant le doigt (trace de lame
 * visible) : fruit tranché +1, plusieurs fruits d'un même geste = bonus
 * combo. Fruit retombé sans être tranché = une vie en moins (3 vies). Colis
 * fragile (carton avec pictogramme verre) tranché = fin de partie. Rythme
 * déjà soutenu au début (deux fruits), puis de plus en plus difficile.
 * Cœur doré : le trancher rend une vie (3 au plus), le rater ne coûte rien.
 * Bonus : glaçon (tout ralentit), étoile (points doublés), bouclier (un colis
 * fragile pardonné), jauges dans le HUD. Les annonces s'affichent en haut,
 * juste sous le HUD et le classement.
 *
 * Logique pure dans utils/jeux/coupe.js. Boucle requestAnimationFrame (60
 * images par seconde au plus), état dans des refs, dessin par
 * Animated.Value.setValue (aucun rendu React à chaque image).
 *
 * Batterie : la boucle s'arrête à la pause, en fin de partie, quand l'écran
 * est quitté et quand l'app passe en arrière-plan. Pause automatique
 * (hooks/usePauseJeu.js) : arrière-plan, écran quitté, geste ou flèche
 * retour pendant la partie, nouvelle course annoncée (fiche de la course :
 * components/AlerteCourseJeu.js). Partie enregistrée à chaque vague et à la
 * pause, reprise Reprendre ou Recommencer (moins de 24 h).
 * Décor : planche à découper et étal du primeur (components/jeux/DecorCoupe.js).
 */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../contexts/LanguageContext';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import {chargerRecord} from '../utils/jeuxRecords';
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import ClassementJeu from '../components/jeux/ClassementJeu';
import DecorCoupe from '../components/jeux/DecorCoupe';
import HudJeu from '../components/jeux/HudJeu';
import SonJeux, {
  demarrerMusique,
  arreterMusique,
  bruit,
  ReglagesSon,
} from '../components/jeux/SonJeux';
import BandeauClassement, {
  formaterNombre,
} from '../components/jeux/BandeauClassement';
import FenetreReprise from '../components/jeux/FenetreReprise';
import useBandeauClassement from '../utils/jeux/useBandeauClassement';
import useReprise from '../utils/jeux/sauvegardePartie';
import useRecompenses from '../utils/jeux/useRecompenses';
import {
  BanniereRecompense,
  RecapRecompenses,
  OR_FONCE,
} from '../components/jeux/RecompensesJeu';
import {
  JEU_COUPE,
  HAUTEUR,
  VIES,
  FRUITS,
  POINTS_FRUIT,
  DUREE_RALENTI,
  DUREE_DOUBLE,
  creerMonde,
  changerLargeur,
  avancer,
  lame,
  finGeste,
  etatSauvegarde,
  mondeRepris,
  cleSauvegarde,
  chargerRecords,
  enregistrerRecords,
  nettoyerRecords,
  recordsApres,
} from '../utils/jeux/coupe';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch (e) {
  Haptics = null;
}
function vibrer(fort) {
  try {
    if (!Haptics) return;
    const promesse = fort
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch (e) {
    // Sans vibration.
  }
}

const OR = '#F2B705';
const ROUGE = '#E74C3C';
const MUSIQUE = 'tournee'; // pas de musique propre à ce jeu dans SonJeux
const SERIE = 10; // fruits d'affilée sans en rater un : bannière « Série »
const IMAGE_MIN_MS = 15; // plafond d'environ 60 images par seconde (écrans 90 et 120 Hz)
const OR_COEUR = '#FFC83D';
const NB_SEGMENTS = 12; // morceaux de la trace de lame
const DUREE_TRACE = 150; // ms de trace visible derrière le doigt
const DELAI_ANNONCE_BONUS = 1500; // ms : une annonce de bonus n'est pas écrasée par un palier

// Trace de lame : cœur blanc, liseré orange et halo doré, lisible sur la planche.
const TRACE = {coeur: '#FFFFFF', lisere: '#FF8A00', halo: '#FFB300'};

// Bonus : couleur et icône (jauge du HUD, annonce), son existant.
const BLEU_GLACE = '#2E9BD6';
const VERT_BOUCLIER = '#16A34A';
const OR_ETOILE = '#E0A100';
const BONUS_INFO = {
  glacon: {
    couleur: BLEU_GLACE,
    icone: 'snow',
    son: 'booster',
    texte: 'jeuxCoupeAnnonceRalenti',
  },
  etoile: {
    couleur: OR_ETOILE,
    icone: 'star',
    son: 'booster',
    texte: 'jeuxCoupeAnnonceDouble',
  },
  bouclier: {
    couleur: VERT_BOUCLIER,
    icone: 'shield-checkmark',
    son: 'ramasse',
    texte: 'jeuxCoupeAnnonceBouclier',
  },
};
const SANS_BONUS = {ralenti: 0, double: 0, bouclier: false};

// Jauges des bonus actifs (secondes restantes), arrondies au quart de seconde.
function bonusActifs(m) {
  if (!m) return SANS_BONUS;
  return {
    ralenti: Math.ceil((m.ralenti || 0) * 4) / 4,
    double: Math.ceil((m.double || 0) * 4) / 4,
    bouclier: !!m.bouclier,
  };
}

function instantane(o, genre) {
  return {
    id: o.id,
    genre,
    sorte: o.sorte,
    cote: o.cote || 0,
    r: o.r,
    casse: !!o.casse,
  };
}

export default function JeuCoupeScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser, connecte} = useCompteJeu();
  const cle = cleSauvegarde(idUser);

  const [phase, setPhase] = useState('accueil'); // accueil, jeu, pause, reprise, fin
  const phaseRef = useRef('accueil');
  const [taille, setTaille] = useState({l: 0, h: 0});
  const [liste, setListe] = useState([]);
  const [score, setScore] = useState(0);
  const [vies, setVies] = useState(VIES);
  const [vague, setVague] = useState(0);
  const [records, setRecords] = useState(() => nettoyerRecords(null));
  const [resultat, setResultat] = useState(null); // {score, tranches, combo, vague, raison}
  const [bulles, setBulles] = useState([]);
  const [jus, setJus] = useState([]);
  const [eclats, setEclats] = useState(null);
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [actifs, setActifs] = useState(SANS_BONUS); // bonus en cours (jauges du HUD)
  const [basHaut, setBasHaut] = useState(0); // bas du HUD et du classement : les annonces s'affichent dessous

  const mondeRef = useRef(null);
  const kRef = useRef(1);
  const tailleRef = useRef({l: 0, h: 0});
  const animsRef = useRef(new Map());
  const rafRef = useRef(null);
  const dernierTsRef = useRef(null);
  const actifRef = useRef(false);
  const termineRef = useRef(false);
  const monteRef = useRef(true);
  const idEffetRef = useRef(0);
  const traceRef = useRef([]); // points du doigt {x, y, t} en pixels
  const doigtRef = useRef(null); // dernier point du doigt en unités
  const banniereRef = useRef(null);
  const serieRef = useRef(0); // fruits tranchés d'affilée
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const actifsRef = useRef(SANS_BONUS);
  const annonceBonusRef = useRef(0); // heure de la dernière annonce de bonus
  const repriseRef = useRef({
    enregistrer: () => {},
    effacer: () => {},
    verifier: () => Promise.resolve({}),
  });
  const demarrerRef = useRef(null);

  const flash = useRef(new Animated.Value(0)).current;
  const segments = useRef(
    Array.from({length: NB_SEGMENTS}, () => ({
      x: new Animated.Value(-1000),
      y: new Animated.Value(-1000),
      rot: new Animated.Value(0),
      sx: new Animated.Value(0.01),
      op: new Animated.Value(0),
    })),
  ).current;

  const enJeu = phase === 'jeu' || phase === 'reprise';

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    JEU_COUPE,
    records.meilleurScore,
    records.meilleurNiveau,
    phase === 'jeu',
    score,
    Math.max(1, vague),
  );

  const reprise = useReprise(JEU_COUPE, {
    surReprendre: sauvee => demarrerRef.current?.(sauvee),
    surRecommencer: () => demarrerRef.current?.(null),
  });
  repriseRef.current = reprise;

  // Bulle : en haut sous le HUD (points, combos, vague), ou au point donné (fruit raté, en bas).
  const ajouterBulle = useCallback((texte, couleur, xU, yU, icone) => {
    if (!monteRef.current) return;
    idEffetRef.current += 1;
    const id = idEffetRef.current;
    const k = kRef.current;
    const enHaut = xU == null;
    const nouvelle = {
      id,
      texte,
      couleur,
      icone,
      enHaut,
      x: enHaut ? 0 : xU * k,
      y: enHaut ? 0 : yU * k,
    };
    // Au plus 3 bulles en haut (toutes affichées, donc toutes retirées à la fin de leur animation).
    setBulles(b => {
      const haut = b.filter(x => x.enHaut);
      const bas = b.filter(x => !x.enHaut);
      return enHaut
        ? [...bas, ...haut.slice(-2), nouvelle]
        : [...bas.slice(-2), ...haut, nouvelle];
    });
  }, []);

  const recompenses = useRecompenses({
    score,
    enPartie: phase === 'jeu',
    meilleurScore: records.meilleurScore,
    lireMaxMois,
    surAnnonce: a => {
      const recent = Date.now() - annonceBonusRef.current < DELAI_ANNONCE_BONUS;
      if (a.type === 'record') {
        bruit('record');
        const texte = t('jeuRecompRecord');
        if (recent) ajouterBulle(texte, OR, null, null, 'trophy');
        else
          banniereRef.current?.annoncer({
            texte,
            icone: 'trophy',
            couleur: OR_FONCE,
          });
      } else {
        bruit('niveau');
        const texte = t('jeuRecompPalier', {n: formaterNombre(a.n)});
        if (recent) ajouterBulle(texte, OR, null, null, 'ribbon');
        else
          banniereRef.current?.annoncer({
            texte,
            icone: 'ribbon',
            couleur: C.marque,
          });
      }
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  const bandeau = useBandeauClassement(JEU_COUPE, {
    score,
    meilleurLocal: records.meilleurScore,
    enPartie: phase === 'jeu',
  });

  const changerPhase = useCallback(p => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  // Partie en cours enregistrée pour la reprise (rien à reprendre avant le premier point).
  const sauver = useCallback(() => {
    const m = mondeRef.current;
    if (!m || termineRef.current || (m.score <= 0 && m.vague <= 1)) return;
    repriseRef.current.enregistrer(etatSauvegarde(m), {
      niveau: m.vague,
      score: m.score,
    });
  }, []);

  // Valeurs animées des objets et moitiés, créées à leur apparition, retirées à leur sortie.
  const synchroniserListe = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const anims = animsRef.current;
    const tous = [...m.objets, ...m.morceaux];
    const ids = new Set(tous.map(o => o.id));
    for (const id of Array.from(anims.keys()))
      if (!ids.has(id)) anims.delete(id);
    for (const o of tous) {
      if (!anims.has(o.id)) {
        anims.set(o.id, {
          x: new Animated.Value(o.x * k),
          y: new Animated.Value(o.y * k),
          rot: new Animated.Value(o.rot),
        });
      }
    }
    if (monteRef.current) {
      setListe([
        ...m.objets.map(o => instantane(o, o.type)),
        ...m.morceaux.map(o => instantane(o, 'moitie')),
      ]);
    }
  }, []);

  // Trace de lame : segments entre les derniers points du doigt, du plus récent au plus ancien.
  const dessinerTrace = useCallback(() => {
    const maintenant = Date.now();
    const pts = traceRef.current.filter(p => maintenant - p.t <= DUREE_TRACE);
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
      s.op.setValue(
        Math.max(0, 1 - (maintenant - b.t) / DUREE_TRACE) *
          (1 - i / NB_SEGMENTS),
      );
    }
  }, [segments]);

  const dessiner = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const anims = animsRef.current;
    for (const o of m.objets) {
      const a = anims.get(o.id);
      if (a) {
        a.x.setValue(o.x * k);
        a.y.setValue(o.y * k);
        a.rot.setValue(o.rot);
      }
    }
    for (const o of m.morceaux) {
      const a = anims.get(o.id);
      if (a) {
        a.x.setValue(o.x * k);
        a.y.setValue(o.y * k);
        a.rot.setValue(o.rot);
      }
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

  const majActifs = useCallback(() => {
    const a = bonusActifs(mondeRef.current);
    const p = actifsRef.current;
    if (
      a.ralenti === p.ralenti &&
      a.double === p.double &&
      a.bouclier === p.bouclier
    )
      return;
    actifsRef.current = a;
    if (monteRef.current) setActifs(a);
  }, []);
  const retirerBulle = useCallback(id => {
    if (monteRef.current) setBulles(b => b.filter(x => x.id !== id));
  }, []);
  const ajouterJus = useCallback((xU, yU, couleur, angle = 0, gros = false) => {
    if (!monteRef.current) return;
    idEffetRef.current += 1;
    const id = idEffetRef.current;
    const k = kRef.current;
    setJus(j => [
      ...j.slice(-5),
      {id, couleur, angle, gros, x: xU * k, y: yU * k},
    ]);
  }, []);
  const retirerJus = useCallback(id => {
    if (monteRef.current) setJus(j => j.filter(x => x.id !== id));
  }, []);

  const terminer = useCallback(
    raison => {
      if (termineRef.current) return;
      termineRef.current = true;
      arreterBoucle();
      effacerTrace();
      const m = mondeRef.current;
      const res = {
        score: m?.score || 0,
        tranches: m?.tranches || 0,
        combo: m?.meilleurCombo || 0,
        vague: m?.vague || 0,
        raison: raison || (m && m.vies <= 0 ? 'vies' : 'casse'),
      };
      banniereRef.current?.effacer();
      if (monteRef.current) setResultat(res);
      changerPhase('fin');
      repriseRef.current.effacer(); // jamais de reprise après une partie perdue
      bruit('perdu');
      const avant = recordsRef.current;
      const apres = recordsApres(avant, res.score, res.vague);
      if (apres.meilleurScore > avant.meilleurScore && avant.meilleurScore > 0)
        bruit('record');
      if (
        apres.meilleurScore !== avant.meilleurScore ||
        apres.meilleurNiveau !== avant.meilleurNiveau
      ) {
        recordsRef.current = apres;
        if (monteRef.current) setRecords(apres);
        enregistrerRecords(cle, apres);
      }
    },
    [arreterBoucle, changerPhase, cle, effacerTrace],
  );

  const traiter = useCallback(
    evenements => {
      const m = mondeRef.current;
      if (!m || !evenements.length) return;
      let changementListe = false;
      let points = false;
      for (const e of evenements) {
        if (e.type === 'liste') changementListe = true;
        else if (e.type === 'tranche') {
          points = true;
          bruit('couteau');
          ajouterJus(e.x, e.y, FRUITS[e.sorte]?.jus || ROUGE, e.angle);
          ajouterBulle(
            `+${e.points || 1}`,
            e.points > POINTS_FRUIT ? OR_ETOILE : OR,
          );
          serieRef.current += 1;
          if (serieRef.current % SERIE === 0) {
            const texte = t('jeuRecompSerie', {n: serieRef.current});
            if (Date.now() - annonceBonusRef.current < DELAI_ANNONCE_BONUS) {
              ajouterBulle(texte, '#FF7A1A', null, null, 'flame');
            } else
              banniereRef.current?.annoncer({
                texte,
                icone: 'flame',
                couleur: '#FF7A1A',
              });
          }
        } else if (e.type === 'vie') {
          vibrer(false);
          bruit('vie');
          if (monteRef.current) setVies(e.vies);
          ajouterJus(e.x, e.y, OR_COEUR, 0, true);
          ajouterBulle('+1', OR_COEUR, null, null, 'heart');
        } else if (e.type === 'bonus') {
          const b = BONUS_INFO[e.sorte];
          if (b) {
            vibrer(false);
            bruit(b.son);
            ajouterJus(e.x, e.y, b.couleur, 0, true);
            banniereRef.current?.annoncer({
              texte: t(b.texte),
              icone: b.icone,
              couleur: b.couleur,
            });
            annonceBonusRef.current = Date.now();
          }
        } else if (e.type === 'protege') {
          vibrer(false);
          bruit('ramasse');
          const k = kRef.current;
          if (monteRef.current)
            setEclats({x: e.x * k, y: e.y * k, n: Date.now()});
          banniereRef.current?.annoncer({
            texte: t('jeuxCoupeAnnonceProtege'),
            icone: 'shield-checkmark',
            couleur: VERT_BOUCLIER,
          });
          annonceBonusRef.current = Date.now();
        } else if (e.type === 'combo') {
          points = true;
          vibrer(false);
          bruit('booster');
          ajouterBulle(t('jeuxCoupeCombo', {n: e.n, bonus: e.bonus}), OR);
        } else if (e.type === 'rate') {
          vibrer(false);
          bruit('choc');
          serieRef.current = 0;
          if (monteRef.current) setVies(e.vies);
          ajouterBulle('', ROUGE, e.x, HAUTEUR - 130, 'heart-dislike');
        } else if (e.type === 'vague') {
          if (monteRef.current) setVague(e.n);
          ajouterBulle(t('jeuxCoupeVague', {n: e.n}), '#0E7C66');
          sauver();
        } else if (e.type === 'casse') {
          vibrer(true);
          bruit('choc');
          const k = kRef.current;
          if (monteRef.current)
            setEclats({x: e.x * k, y: e.y * k, n: Date.now()});
          flash.setValue(0.75);
          Animated.timing(flash, {
            toValue: 0,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        } else if (e.type === 'fin') {
          terminer(e.raison);
        }
      }
      if (changementListe) synchroniserListe();
      majActifs();
      if (points && monteRef.current) setScore(m.score);
    },
    [
      ajouterBulle,
      ajouterJus,
      flash,
      majActifs,
      sauver,
      synchroniserListe,
      t,
      terminer,
    ],
  );

  const boucleRef = useRef(null);
  boucleRef.current = ts => {
    rafRef.current = null;
    if (!actifRef.current || !mondeRef.current) return;
    // Écran 90 ou 120 Hz : une image sur deux suffit, 60 par seconde au plus.
    if (
      dernierTsRef.current != null &&
      ts - dernierTsRef.current < IMAGE_MIN_MS
    ) {
      rafRef.current = requestAnimationFrame(x => boucleRef.current(x));
      return;
    }
    const dt =
      dernierTsRef.current == null
        ? 1 / 60
        : (ts - dernierTsRef.current) / 1000;
    dernierTsRef.current = ts;
    const ev = avancer(mondeRef.current, dt);
    if (ev.length) traiter(ev);
    majActifs(); // jauges des bonus, au quart de seconde
    dessiner();
    if (actifRef.current)
      rafRef.current = requestAnimationFrame(x => boucleRef.current(x));
  };

  const demarrerBoucle = useCallback(() => {
    if (rafRef.current != null || !monteRef.current) return;
    actifRef.current = true;
    dernierTsRef.current = null;
    rafRef.current = requestAnimationFrame(x => boucleRef.current(x));
  }, []);

  const nouveauMonde = useCallback(
    etat => {
      const k = kRef.current;
      mondeRef.current = etat
        ? mondeRepris(tailleRef.current.l / k, etat, Date.now())
        : creerMonde(tailleRef.current.l / k, Date.now());
      animsRef.current = new Map();
      synchroniserListe();
      dessiner();
    },
    [dessiner, synchroniserListe],
  );

  // Nouvelle partie (etat nul) ou partie reprise (etat sauvegardé : on attend un toucher).
  const demarrer = useCallback(
    etat => {
      if (!tailleRef.current.h) return;
      arreterBoucle();
      effacerTrace();
      termineRef.current = false;
      if (!etat) repriseRef.current.effacer();
      nouveauMonde(etat);
      const m = mondeRef.current;
      recompensesRef.current.debut(m.score);
      serieRef.current = 0;
      annonceBonusRef.current = 0;
      banniereRef.current?.effacer();
      setScore(m.score);
      setVies(m.vies);
      setVague(m.vague);
      majActifs();
      setResultat(null);
      setBulles([]);
      setJus([]);
      setEclats(null);
      setClassementOuvert(false);
      if (etat) {
        changerPhase('reprise');
      } else {
        changerPhase('jeu');
        demarrerBoucle();
      }
    },
    [
      arreterBoucle,
      changerPhase,
      demarrerBoucle,
      effacerTrace,
      majActifs,
      nouveauMonde,
    ],
  );
  demarrerRef.current = demarrer;
  const jouer = useCallback(() => demarrer(null), [demarrer]);

  // Doigt : la lame tranche dès le mouvement, sans attendre la boucle.
  const doigtPose = useCallback(
    ev => {
      const {locationX, locationY} = ev.nativeEvent;
      if (phaseRef.current === 'reprise') {
        changerPhase('jeu');
        demarrerBoucle();
      }
      if (phaseRef.current !== 'jeu') return;
      const k = kRef.current;
      traceRef.current = [{x: locationX, y: locationY, t: Date.now()}];
      doigtRef.current = {x: locationX / k, y: locationY / k};
    },
    [changerPhase, demarrerBoucle],
  );

  const doigtBouge = useCallback(
    ev => {
      const m = mondeRef.current;
      if (!m || phaseRef.current !== 'jeu') return;
      const {locationX, locationY} = ev.nativeEvent;
      const k = kRef.current;
      const u = {x: locationX / k, y: locationY / k};
      const avant = doigtRef.current;
      doigtRef.current = u;
      traceRef.current.push({x: locationX, y: locationY, t: Date.now()});
      if (traceRef.current.length > NB_SEGMENTS + 1) traceRef.current.shift();
      if (avant) traiter(lame(m, avant.x, avant.y, u.x, u.y));
    },
    [traiter],
  );

  const doigtLeve = useCallback(() => {
    const m = mondeRef.current;
    doigtRef.current = null;
    if (m && phaseRef.current === 'jeu') traiter(finGeste(m));
  }, [traiter]);

  const pause = useCallback(() => {
    const p = phaseRef.current;
    const m = mondeRef.current;
    if (
      p === 'jeu' &&
      m &&
      (m.phase === 'casse' || m.phase === 'perdu' || m.phase === 'fini')
    ) {
      terminer();
    } else if (p === 'jeu' || p === 'reprise') {
      arreterBoucle();
      if (m) traiter(finGeste(m));
      sauver();
      effacerTrace();
      dessiner();
      changerPhase('pause');
    }
  }, [
    arreterBoucle,
    changerPhase,
    dessiner,
    effacerTrace,
    sauver,
    terminer,
    traiter,
  ]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  const estEnPartie = useCallback(
    () => phaseRef.current === 'jeu' || phaseRef.current === 'reprise',
    [],
  );
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  // Pause automatique : arrière-plan, écran quitté, retour, nouvelle course.
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: enJeu || (classementOuvert && phase === 'pause'),
    estEnJeu: estEnPartie,
    fermerPanneau,
  });

  // Reprise après la pause : tout reste figé jusqu'au prochain toucher.
  const reprendre = useCallback(() => changerPhase('reprise'), [changerPhase]);

  // Records du compte, puis proposition de reprendre une partie de moins de 24 h.
  // Le record gardé par l'ancien écran livreur (utils/jeuxRecords.js) est repris.
  useEffect(() => {
    let vivant = true;
    Promise.all([
      chargerRecords(cle),
      chargerRecord(JEU_COUPE, idUser).catch(() => null),
    ]).then(([r, ancien]) => {
      if (!vivant) return;
      const avant = Math.floor(Number(ancien?.meilleur) || 0);
      const fusion =
        avant > r.meilleurScore ? {...r, meilleurScore: avant} : r;
      if (fusion !== r) enregistrerRecords(cle, fusion);
      recordsRef.current = fusion;
      setRecords(fusion);
      if (phaseRef.current === 'accueil') repriseRef.current.verifier();
    });
    return () => {
      vivant = false;
    };
  }, [cle, idUser]);

  // Pause au démontage (arrière-plan et écran quitté : usePauseJeu).
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      monteRef.current = false;
      actifRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  // Musique : seulement pendant la partie.
  const enMusique = phase === 'jeu';
  useEffect(() => {
    if (enMusique) demarrerMusique(MUSIQUE);
    else arreterMusique();
    return () => arreterMusique();
  }, [enMusique]);

  const surMesure = useCallback(
    ev => {
      const {width, height} = ev.nativeEvent.layout;
      const l = Math.round(width);
      const h = Math.round(height);
      if (!h || (l === tailleRef.current.l && h === tailleRef.current.h))
        return;
      tailleRef.current = {l, h};
      kRef.current = h / HAUTEUR;
      if (mondeRef.current) {
        changerLargeur(mondeRef.current, l / kRef.current);
        animsRef.current = new Map();
        synchroniserListe();
        dessiner();
      } else {
        nouveauMonde();
      }
      setTaille({l, h});
    },
    [dessiner, nouveauMonde, synchroniserListe],
  );

  const quitter = useCallback(() => {
    pause();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [navigation, pause]);

  // Fiche de la nouvelle course : « Voir la course » quitte le jeu, partie en pause.
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
      {text: t('jeuNouvellePartie'), style: 'destructive', onPress: jouer},
    ]);
  }, [jouer, t]);

  // Bas du bloc du haut (HUD, classement) : les annonces s'affichent juste dessous.
  const mesureHaut = useCallback(
    ev => {
      const {y, height} = ev.nativeEvent.layout;
      const bas = Math.round(y + height);
      if (bas !== basHaut) setBasHaut(bas);
    },
    [basHaut],
  );
  const yAnnonces = basHaut || insets.top + 110;

  const boosters = useMemo(() => {
    const l = [];
    if (actifs.ralenti > 0) {
      l.push({
        cle: 'glacon',
        icone: BONUS_INFO.glacon.icone,
        couleur: BLEU_GLACE,
        reste: actifs.ralenti / DUREE_RALENTI,
      });
    }
    if (actifs.double > 0) {
      l.push({
        cle: 'etoile',
        icone: BONUS_INFO.etoile.icone,
        couleur: OR_ETOILE,
        reste: actifs.double / DUREE_DOUBLE,
      });
    }
    if (actifs.bouclier)
      l.push({
        cle: 'bouclier',
        icone: BONUS_INFO.bouclier.icone,
        couleur: VERT_BOUCLIER,
        reste: 1,
      });
    return l;
  }, [actifs]);
  const bullesHaut = bulles.filter(b => b.enHaut);
  const recapFin =
    phase === 'fin' && resultat ? recompenses.recap(resultat.score) : null;

  const k = kRef.current;

  return (
    <View style={styles.ecran}>
      {/* Monde : toute la hauteur sauf la zone basse du téléphone */}
      <View
        style={[styles.monde, {marginBottom: insets.bottom}]}
        onLayout={surMesure}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={doigtPose}
        onResponderMove={doigtBouge}
        onResponderRelease={doigtLeve}
        onResponderTerminate={doigtLeve}>
        <DecorCoupe haut={insets.top} />
        {taille.h > 0 && (
          <>
            {jus.map(j => (
              <Eclaboussure
                key={j.id}
                id={j.id}
                x={j.x}
                y={j.y}
                couleur={j.couleur}
                angle={j.angle}
                gros={j.gros}
                taille={(j.gros ? 190 : 150) * k}
                onFin={retirerJus}
              />
            ))}

            {liste.map(o => {
              const a = animsRef.current.get(o.id);
              if (!a) return null;
              if (o.genre === 'moitie')
                return <Moitie key={o.id} o={o} a={a} k={k} />;
              if (o.genre === 'fragile')
                return <ColisFragile key={o.id} o={o} a={a} k={k} />;
              if (o.genre === 'coeur')
                return (
                  <Coeur key={o.id} o={o} a={a} k={k} anime={phase === 'jeu'} />
                );
              if (BONUS_INFO[o.genre])
                return <Bonus key={o.id} o={o} a={a} k={k} />;
              return <Fruit key={o.id} o={o} a={a} k={k} />;
            })}

            {/* Trace de lame */}
            {segments.map((s, i) => {
              const ep = Math.max(2, (10 - i * 0.6) * k * 1.4);
              const rotation = s.rot.interpolate({
                inputRange: [-360, 360],
                outputRange: ['-360deg', '360deg'],
              });
              return (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.segment,
                    {
                      height: ep,
                      marginTop: -ep / 2,
                      borderRadius: ep / 2,
                      opacity: s.op,
                      transform: [
                        {translateX: s.x},
                        {translateY: s.y},
                        {rotate: rotation},
                        {scaleX: s.sx},
                      ],
                    },
                  ]}
                />
              );
            })}

            {/* Glaçon : léger voile bleu fixe (aucune animation) */}
            {actifs.ralenti > 0 && enJeu && (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.voileGlace]}
              />
            )}
            {eclats && (
              <Eclats
                key={eclats.n}
                x={eclats.x}
                y={eclats.y}
                taille={146 * k}
              />
            )}
            {bulles
              .filter(b => !b.enHaut)
              .map(b => (
                <Bulle
                  key={b.id}
                  id={b.id}
                  x={b.x}
                  y={b.y}
                  texte={b.texte}
                  icone={b.icone}
                  couleur={b.couleur}
                  onFin={retirerBulle}
                />
              ))}
            {/* Annonces en haut : points, combos, vague, cœur */}
            <View
              pointerEvents="none"
              style={[styles.filHaut, {top: yAnnonces}]}>
              {bullesHaut.map(b => (
                <Bulle
                  key={b.id}
                  id={b.id}
                  enHaut
                  texte={b.texte}
                  icone={b.icone}
                  couleur={b.couleur}
                  onFin={retirerBulle}
                />
              ))}
            </View>

            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.flash, {opacity: flash}]}
            />
            <BanniereRecompense
              ref={banniereRef}
              style={{top: yAnnonces + 40}}
            />

            {phase === 'reprise' && (
              <View
                pointerEvents="none"
                style={[styles.consigne, {top: taille.h * 0.6}]}>
                <MaterialCommunityIcons
                  name="gesture-swipe"
                  size={34}
                  color={C.texte}
                />
                <Text style={styles.consigneTexte}>
                  {t('jeuxCoupeToucherReprendre')}
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Haut : quitter, score, vague, vies, pause, puis rang et TOP 1 (hors zone de geste) */}
      <View
        pointerEvents="box-none"
        style={[styles.haut, {top: insets.top + 8}]}
        onLayout={mesureHaut}>
        <HudJeu
          score={score}
          niveau={vague > 0 ? vague : undefined}
          vies={vies}
          viesMax={VIES}
          boosters={enJeu || phase === 'pause' ? boosters : []}
          onPause={pause}
          onQuitter={quitter}
          pauseActive={enJeu}
        />
        <BandeauClassement bandeau={bandeau} style={styles.bandeau} />
      </View>

      {/* Fenêtres : accueil, pause, fin */}
      {(phase === 'accueil' || phase === 'pause' || phase === 'fin') &&
        !classementOuvert &&
        !reprise.proposition && (
          <View style={styles.voile}>
            <View style={styles.carte}>
              {phase === 'accueil' && (
                <>
                  <ReglagesSon />
                  <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                  <Text style={styles.grosEmoji}>🍉</Text>
                  <Text style={styles.titre}>{t('jeuxCoupeTitre')}</Text>
                  <Text style={styles.texte}>{t('jeuxCoupeRegle')}</Text>
                  <View style={styles.ligneInfo}>
                    <View style={styles.miniColis}>
                      <MaterialCommunityIcons
                        name="glass-fragile"
                        size={16}
                        color={ROUGE}
                      />
                    </View>
                    <Text style={[styles.texteDiscret, styles.texteInfo]}>
                      {t('jeuxCoupeFragile')}
                    </Text>
                  </View>
                  <Text style={styles.texteDiscret}>
                    {t('jeuxCoupeBonus', {n: POINTS_FRUIT})}
                  </Text>
                  <View style={styles.ligneInfo}>
                    <Ionicons name="heart" size={20} color={OR_COEUR} />
                    <Text style={[styles.texteDiscret, styles.texteInfo]}>
                      {t('jeuxCoupeCoeur')}
                    </Text>
                  </View>
                  <View style={styles.ligneInfo}>
                    <View style={styles.iconesBonus}>
                      <Ionicons name="snow" size={17} color={BLEU_GLACE} />
                      <Ionicons name="star" size={17} color={OR_ETOILE} />
                      <Ionicons
                        name="shield-checkmark"
                        size={17}
                        color={VERT_BOUCLIER}
                      />
                    </View>
                    <Text style={[styles.texteDiscret, styles.texteInfo]}>
                      {t('jeuxCoupeBonusListe')}
                    </Text>
                  </View>
                  <Text style={styles.texteDiscret}>
                    {t('jeuMeilleurScore', {n: records.meilleurScore})}
                  </Text>
                  <Bouton
                    texte={t('jeuJouer')}
                    onPress={jouer}
                    desactive={!taille.h}
                  />
                  <Bouton
                    secondaire
                    texte={t('jeuQuitter')}
                    onPress={quitter}
                  />
                </>
              )}
              {phase === 'pause' && (
                <>
                  <ReglagesSon />
                  <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                  <Ionicons name="pause-circle" size={44} color={C.marque} />
                  <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                  <Text style={styles.texte}>
                    {t('jeuScore', {n: score})}
                  </Text>
                  {vague > 0 && (
                    <Text style={styles.texteDiscret}>
                      {t('jeuxCoupeVague', {n: vague})}
                    </Text>
                  )}
                  <Text style={styles.texteDiscret}>
                    {t('jeuSauvegarde')}
                  </Text>
                  <Bouton texte={t('jeuReprendre')} onPress={reprendre} />
                  <Bouton
                    secondaire
                    texte={t('jeuxCoupeRejouer')}
                    onPress={confirmerNouvellePartie}
                  />
                  <Bouton
                    secondaire
                    texte={t('jeuQuitter')}
                    onPress={quitter}
                  />
                </>
              )}
              {phase === 'fin' && (
                <>
                  <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                  {recapFin?.record ? (
                    <Ionicons name="trophy" size={46} color={OR} />
                  ) : resultat?.raison === 'casse' ? (
                    <MaterialCommunityIcons
                      name="glass-fragile"
                      size={46}
                      color={ROUGE}
                    />
                  ) : (
                    <Ionicons name="heart-dislike" size={44} color={C.danger} />
                  )}
                  <Text style={styles.titre}>
                    {resultat?.raison === 'casse'
                      ? t('jeuxCoupeFinCasse')
                      : t('jeuxCoupeFinVies')}
                  </Text>
                  {recapFin && (
                    <RecapRecompenses {...recapFin} connecte={connecte} />
                  )}
                  <Text style={styles.scoreFin}>
                    {resultat?.score ?? score}
                  </Text>
                  <View style={styles.stats}>
                    <Stat
                      icone="fruit-watermelon"
                      n={resultat?.tranches ?? 0}
                      couleur={ROUGE}
                    />
                    <Stat
                      icone="flash"
                      n={`x${resultat?.combo ?? 0}`}
                      couleur={OR}
                    />
                    <Stat icone="layers-triple" n={resultat?.vague ?? 0} />
                  </View>
                  <Text style={styles.texteDiscret}>
                    {t('jeuMeilleurScore', {n: records.meilleurScore})}
                  </Text>
                  <Bouton texte={t('jeuxCoupeRejouer')} onPress={jouer} />
                  <Bouton
                    secondaire
                    texte={t('jeuQuitter')}
                    onPress={quitter}
                  />
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

      {/* Classement : la partie reste en pause derrière. */}
      <ClassementJeu
        jeu={JEU_COUPE}
        visible={classementOuvert && !enJeu && !alerteCourse}
        onClose={() => setClassementOuvert(false)}
        avantChargement={envoyer}
      />

      {/* Nouvelle course pendant le jeu : la partie est en pause, fiche de la course. */}
      {!!alerteCourse && (
        <AlerteCourseJeu
          alerte={alerteCourse}
          t={t}
          navigation={navigation}
          onVoir={voirCourse}
          onRester={fermerAlerte}
        />
      )}
    </View>
  );
}

function useRotation(a) {
  return useMemo(
    () =>
      a.rot.interpolate({
        inputRange: [-360, 360],
        outputRange: ['-360deg', '360deg'],
      }),
    [a],
  );
}

// Fruit entier, centré sur (x, y).
const Fruit = memo(function Fruit({o, a, k}) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles2.objet,
        {
          left: -d / 2,
          top: -d / 2,
          width: d,
          height: d,
          transform: [{translateX: a.x}, {translateY: a.y}, {rotate}],
        },
      ]}>
      <Text style={[styles2.emoji, {fontSize: d * 0.8, lineHeight: d}]}>
        {FRUITS[o.sorte]?.emoji}
      </Text>
    </Animated.View>
  );
});

// Moitié de fruit : la moitié gauche ou droite de l'emoji, bord de chair coloré.
const Moitie = memo(function Moitie({o, a, k}) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  const gauche = o.cote < 0;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles2.moitie,
        {
          left: -d / 4,
          top: -d / 2,
          width: d / 2,
          height: d,
          transform: [{translateX: a.x}, {translateY: a.y}, {rotate}],
        },
      ]}>
      <View
        style={[
          styles2.objet,
          {left: gauche ? 0 : -d / 2, top: 0, width: d, height: d},
        ]}>
        <Text style={[styles2.emoji, {fontSize: d * 0.8, lineHeight: d}]}>
          {FRUITS[o.sorte]?.emoji}
        </Text>
      </View>
      <View
        style={[
          styles2.chair,
          {
            [gauche ? 'right' : 'left']: 0,
            top: d * 0.14,
            bottom: d * 0.14,
            width: Math.max(3, 7 * k),
            backgroundColor: '#FFF6E0',
          },
        ]}
      />
      <View
        style={[
          styles2.chair,
          {
            [gauche ? 'right' : 'left']: Math.max(1, 1.5 * k),
            top: d * 0.2,
            bottom: d * 0.2,
            width: Math.max(2, 4 * k),
            backgroundColor: FRUITS[o.sorte]?.jus || ROUGE,
            opacity: 1,
          },
        ]}
      />
    </Animated.View>
  );
});

// Colis fragile : carton, ruban adhésif, pictogramme verre. Fendu s'il est tranché.
const ColisFragile = memo(function ColisFragile({o, a, k}) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles2.colis,
        {
          left: -d / 2,
          top: -d / 2,
          width: d,
          height: d,
          borderRadius: d * 0.12,
          borderWidth: Math.max(1, 3 * k),
          transform: [{translateX: a.x}, {translateY: a.y}, {rotate}],
        },
      ]}>
      <View style={[styles2.ruban, {height: d * 0.16, top: d * 0.1}]} />
      <View
        style={[
          styles2.etiquette,
          {
            width: d * 0.56,
            height: d * 0.5,
            borderRadius: d * 0.08,
            marginTop: d * 0.12,
          },
        ]}>
        <MaterialCommunityIcons
          name="glass-fragile"
          size={d * 0.42}
          color={ROUGE}
        />
      </View>
      {o.casse && (
        <View style={StyleSheet.absoluteFill}>
          <MaterialCommunityIcons
            name="flash"
            size={d * 0.9}
            color="#3B2A1A"
            style={styles2.fente}
          />
        </View>
      )}
    </Animated.View>
  );
});

// Cœur doré : liseré brun, cœur or, reflet blanc, halo qui pulse et petites étoiles.
const Coeur = memo(function Coeur({o, a, k, anime}) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  const pouls = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!anime) return undefined;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(pouls, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pouls, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [pouls, anime]);
  const echelle = pouls.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.18],
  });
  const opacite = pouls.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 0.3],
  });
  const coeur = pouls.interpolate({inputRange: [0, 1], outputRange: [1, 1.07]});
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles2.objet,
        {
          left: -d / 2,
          top: -d / 2,
          width: d,
          height: d,
          transform: [{translateX: a.x}, {translateY: a.y}, {rotate}],
        },
      ]}>
      <Animated.View
        style={[
          styles2.haloCoeur,
          {
            width: d * 1.15,
            height: d * 1.15,
            borderRadius: d * 0.58,
            opacity: opacite,
            transform: [{scale: echelle}],
          },
        ]}
      />
      <Animated.View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{scale: coeur}],
        }}>
        <Ionicons name="heart" size={d * 0.98} color="#9A5B12" />
        <Ionicons
          name="heart"
          size={d * 0.82}
          color={OR_COEUR}
          style={styles2.surcouche}
        />
        <View
          style={[
            styles2.reflet,
            {
              left: d * 0.27,
              top: d * 0.26,
              width: d * 0.2,
              height: d * 0.11,
              borderRadius: d * 0.06,
            },
          ]}
        />
      </Animated.View>
      <MaterialCommunityIcons
        name="star-four-points"
        size={d * 0.26}
        color="#FFFFFF"
        style={{position: 'absolute', right: -d * 0.02, top: -d * 0.04}}
      />
      <MaterialCommunityIcons
        name="star-four-points"
        size={d * 0.18}
        color="#FFF3B0"
        style={{position: 'absolute', left: d * 0.02, bottom: d * 0.04}}
      />
    </Animated.View>
  );
});

// Bonus à trancher : glaçon (cube bleu, flocon), étoile x2 (or), bouclier (disque blanc, bouclier vert).
// Aucune animation propre (batterie) : il suit seulement sa trajectoire.
const Bonus = memo(function Bonus({o, a, k}) {
  const d = o.r * 2 * k;
  const rotate = useRotation(a);
  let contenu;
  if (o.genre === 'glacon') {
    contenu = (
      <View
        style={[
          styles2.glacon,
          {
            width: d * 0.9,
            height: d * 0.9,
            borderRadius: d * 0.2,
            borderWidth: Math.max(2, 3 * k),
          },
        ]}>
        <Ionicons name="snow" size={d * 0.6} color={BLEU_GLACE} />
        <View
          style={[
            styles2.reflet,
            {
              left: d * 0.12,
              top: d * 0.1,
              width: d * 0.24,
              height: d * 0.1,
              borderRadius: d * 0.05,
            },
          ]}
        />
      </View>
    );
  } else if (o.genre === 'etoile') {
    contenu = (
      <View style={styles2.centre}>
        <Ionicons name="star" size={d * 1.02} color="#9A5B12" />
        <Ionicons
          name="star"
          size={d * 0.86}
          color={OR_COEUR}
          style={styles2.surcouche}
        />
        <Text style={[styles2.x2, {fontSize: d * 0.26}]}>x2</Text>
      </View>
    );
  } else {
    contenu = (
      <View
        style={[
          styles2.disqueBouclier,
          {
            width: d * 0.92,
            height: d * 0.92,
            borderRadius: d * 0.46,
            borderWidth: Math.max(2, 3 * k),
          },
        ]}>
        <MaterialCommunityIcons
          name="shield-check"
          size={d * 0.66}
          color={VERT_BOUCLIER}
        />
      </View>
    );
  }
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles2.objet,
        {
          left: -d / 2,
          top: -d / 2,
          width: d,
          height: d,
          transform: [{translateX: a.x}, {translateY: a.y}, {rotate}],
        },
      ]}>
      {contenu}
      <MaterialCommunityIcons
        name="star-four-points"
        size={d * 0.24}
        color="#FFFFFF"
        style={{position: 'absolute', right: -d * 0.02, top: -d * 0.04}}
      />
    </Animated.View>
  );
});

// Éclaboussure de jus : tache, balafre le long de la lame et gouttes projetées.
const GOUTTES = Array.from({length: 14}, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.25 : -0.18);
  return {
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    loin: 0.55 + ((i * 37) % 10) / 16,
    taille: 0.06 + ((i * 5) % 4) * 0.032,
  };
});
function Eclaboussure({
  id,
  x,
  y,
  couleur,
  angle = 0,
  gros = false,
  taille,
  onFin,
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: gros ? 900 : 700,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(() => onFin(id));
    return () => anim.stop();
  }, [id, gros, onFin, v]);
  const tache = v.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0, 0.5, 0],
  });
  const echelle = v.interpolate({inputRange: [0, 1], outputRange: [0.45, 1.2]});
  const opaciteGoutte = v.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [1, 0.9, 0],
  });
  const balafre = v.interpolate({
    inputRange: [0, 0.12, 0.45],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });
  const longueur = v.interpolate({inputRange: [0, 1], outputRange: [0.4, 1.3]});
  return (
    <View pointerEvents="none" style={[styles2.jus, {left: x, top: y}]}>
      <Animated.View
        style={{
          position: 'absolute',
          left: -taille / 2,
          top: -taille / 2,
          width: taille,
          height: taille,
          borderRadius: taille / 2,
          backgroundColor: couleur,
          opacity: tache,
          transform: [{scale: echelle}],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          left: -taille * 0.2,
          top: -taille * 0.46,
          width: taille * 0.62,
          height: taille * 0.62,
          borderRadius: taille * 0.31,
          backgroundColor: couleur,
          opacity: tache,
          transform: [{scale: echelle}],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          left: -taille * 0.5,
          top: -taille * 0.03,
          width: taille,
          height: taille * 0.06,
          borderRadius: taille * 0.03,
          backgroundColor: '#FFFFFF',
          opacity: balafre,
          transform: [{rotate: `${angle}deg`}, {scaleX: longueur}],
        }}
      />
      {GOUTTES.map((g, i) => {
        const s = taille * g.taille * (gros ? 0.9 : 1);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: -s / 2,
              top: -s / 2,
              width: s,
              height: s,
              borderRadius: s / 2,
              backgroundColor: gros && i % 3 === 0 ? '#FFF3B0' : couleur,
              opacity: opaciteGoutte,
              transform: [
                {
                  translateX: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, g.dx * taille * g.loin],
                  }),
                },
                {
                  translateY: v.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [
                      0,
                      g.dy * taille * g.loin * 0.8,
                      g.dy * taille * g.loin + taille * 0.35,
                    ],
                  }),
                },
                {
                  scale: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.55],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// Éclats de verre quand un colis fragile est tranché.
function Eclats({x, y, taille}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [v]);
  const opacite = v.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0.2],
  });
  return (
    <View pointerEvents="none" style={[styles2.jus, {left: x, top: y}]}>
      {Array.from({length: 10}).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const s = taille * (0.1 + (i % 3) * 0.04);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: -s / 2,
              top: -s / 2,
              width: s,
              height: s * 0.6,
              backgroundColor: '#CFEFFF',
              borderWidth: 1,
              borderColor: '#7FB7D6',
              opacity: opacite,
              transform: [
                {
                  translateX: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(angle) * taille * 0.9],
                  }),
                },
                {
                  translateY: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(angle) * taille * 0.9],
                  }),
                },
                {rotate: `${i * 47}deg`},
              ],
            }}
          />
        );
      })}
      <Animated.View
        style={{
          position: 'absolute',
          left: -taille / 2,
          top: -taille / 2,
          width: taille,
          height: taille,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: opacite,
        }}>
        <MaterialCommunityIcons
          name="star-four-points"
          size={taille * 0.8}
          color={OR}
        />
      </Animated.View>
    </View>
  );
}

function Bulle({id, x, y, texte, icone, couleur, onFin, enHaut}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(() => onFin(id));
    return () => anim.stop();
  }, [id, onFin, v]);
  const translateY = v.interpolate({
    inputRange: [0, 1],
    outputRange: enHaut ? [6, -6] : [0, -50],
  });
  const opacity = v.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        enHaut ? styles2.bulleHaut : [styles2.bulle, {left: x - 90, top: y}],
        {opacity, transform: [{translateY}]},
      ]}>
      {icone ? (
        <Ionicons name={icone} size={enHaut ? 22 : 30} color={couleur} />
      ) : null}
      {texte ? (
        <Text
          style={[
            styles2.bulleTexte,
            enHaut && styles2.bulleTexteHaut,
            {color: couleur},
          ]}
          numberOfLines={1}>
          {texte}
        </Text>
      ) : null}
    </Animated.View>
  );
}

function Stat({icone, n, couleur}) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons
        name={icone}
        size={20}
        color={couleur || C.marque}
      />
      <Text style={styles.statTexte}>{n}</Text>
    </View>
  );
}

function Bouton({texte, onPress, secondaire, desactive}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      style={({pressed}) => [
        styles.bouton,
        secondaire && styles.boutonSecondaire,
        (pressed || desactive) && {opacity: 0.7},
      ]}>
      <Text
        style={[
          styles.boutonTexte,
          secondaire && styles.boutonTexteSecondaire,
        ]}>
        {texte}
      </Text>
    </Pressable>
  );
}

const styles2 = StyleSheet.create({
  objet: {position: 'absolute', alignItems: 'center', justifyContent: 'center'},
  emoji: {textAlign: 'center', includeFontPadding: false},
  moitie: {position: 'absolute', overflow: 'hidden'},
  chair: {position: 'absolute', borderRadius: 2, opacity: 0.85},
  colis: {
    position: 'absolute',
    backgroundColor: '#B07A45',
    borderColor: '#7A5230',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ruban: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,236,190,0.75)',
  },
  etiquette: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fente: {position: 'absolute', alignSelf: 'center', top: '5%'},
  jus: {position: 'absolute', width: 0, height: 0},
  bulle: {position: 'absolute', width: 180, alignItems: 'center'},
  bulleHaut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: 6,
    flexShrink: 1,
    maxWidth: '33%',
  },
  bulleTexteHaut: {
    fontSize: 20,
    flexShrink: 1,
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowRadius: 6,
  },
  bulleTexte: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '900',
    textShadowColor: 'rgba(60,35,0,0.75)',
    textShadowRadius: 5,
    textShadowOffset: {width: 0, height: 1},
  },
  haloCoeur: {position: 'absolute', backgroundColor: '#FFE27A'},
  surcouche: {position: 'absolute'},
  centre: {alignItems: 'center', justifyContent: 'center'},
  x2: {
    position: 'absolute',
    color: '#5A3300',
    fontWeight: '900',
    includeFontPadding: false,
  },
  glacon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6F1FF',
    borderColor: BLEU_GLACE,
  },
  disqueBouclier: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: VERT_BOUCLIER,
  },
  reflet: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.75)',
    transform: [{rotate: '-35deg'}],
  },
});

const styles = StyleSheet.create({
  ecran: {flex: 1, backgroundColor: C.fond},
  monde: {flex: 1, overflow: 'hidden'},
  segment: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 100,
    backgroundColor: TRACE.coeur,
    borderWidth: 1.5,
    borderColor: TRACE.lisere,
    shadowColor: TRACE.halo,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 0},
    elevation: 4,
  },
  flash: {backgroundColor: '#ff4d3d'},
  voileGlace: {backgroundColor: 'rgba(120,200,255,0.14)'},
  filHaut: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 36,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconesBonus: {flexDirection: 'row', gap: 2},
  consigne: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  consigneTexte: {
    color: C.texte,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  haut: {position: 'absolute', left: 16, right: 16},
  bandeau: {marginTop: 8},
  voile: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.voile,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carte: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.fond,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  grosEmoji: {fontSize: 44, lineHeight: 52},
  titre: {
    color: C.texte,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  texte: {
    color: C.texteDoux,
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 21,
  },
  texteDiscret: {
    color: C.texteDiscret,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  ligneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 6,
  },
  texteInfo: {marginTop: 0, flexShrink: 1, textAlign: 'left'},
  miniColis: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#B07A45',
    borderWidth: 2,
    borderColor: '#7A5230',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreFin: {color: C.texte, fontSize: 48, fontWeight: '900', marginTop: 4},
  stats: {flexDirection: 'row', gap: 18, marginTop: 4, marginBottom: 2},
  stat: {flexDirection: 'row', alignItems: 'center', gap: 5},
  statTexte: {color: C.texte, fontSize: 16, fontWeight: '700'},
  bouton: {
    alignSelf: 'stretch',
    marginTop: 14,
    backgroundColor: C.marque,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  boutonSecondaire: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.bordureForte,
    marginTop: 10,
  },
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
  boutonTexteSecondaire: {color: C.texte},
});
