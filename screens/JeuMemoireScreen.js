/**
 * Mini-jeu « Mémoire du livreur » (clé memoire), pour patienter entre deux
 * courses. Écran identique à AppUser (screens/Jeux/MemoireScreen.js) :
 * logique, niveaux, décor, sons et rendu ; seule la plomberie diffère.
 *
 * Jeu de paires : les cartes sont posées face cachée, le livreur en retourne
 * deux ; même motif = elles restent visibles, sinon elles se recachent après
 * un court instant. Niveaux enchaînés, facile au début, puis de plus en plus
 * de cartes et un chrono de plus en plus serré ; dans les niveaux hauts, les
 * motifs se ressemblent. Chrono à zéro = fin de partie.
 *
 * Logique pure dans utils/jeux/memoire.js, décor et cartes dans
 * components/jeux/DecorMemoire.js. Pause automatique (hooks/usePauseJeu.js) :
 * arrière-plan, écran quitté, flèche ou geste retour pendant la partie, et
 * nouvelle course annoncée, avec la fiche de la vraie course dans le jeu
 * (components/AlerteCourseJeu.js) ; le chrono s'arrête et les cartes sont
 * masquées pendant la pause. Musique et bruitages (components/jeux/SonJeux.js),
 * bandeau rang et TOP 1, reprise de la partie enregistrée (moins de 24 h,
 * utils/jeux/sauvegardePartie.js). Textes : contexts/traductionsJeux/memoire.js.
 * Récompenses : « +N », combo de paires d'affilée (points et secondes en
 * plus), paires bonus au cadre doré (loupe, sablier, aimant), étoiles et
 * confettis au niveau gagné, record et paliers (RecompensesJeu).
 * Batterie : aucune boucle d'images. Chrono à une mise à jour par seconde
 * dans son propre composant, barre animée par le pilote natif, tout arrêté
 * en pause, en fin de partie, écran quitté et en arrière-plan.
 */
import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, Pressable, Animated, Easing, Alert} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../contexts/LanguageContext';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu, reprendreAncienRecord} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import ClassementJeu from '../components/jeux/ClassementJeu';
import DecorMemoire, {FaceCarte, DosCarte, rayonCarte, RESERVE_BAS, BLEU_NUIT} from '../components/jeux/DecorMemoire';
import HudJeu from '../components/jeux/HudJeu';
import SonJeux, {demarrerMusique, arreterMusique, bruit, ReglagesSon} from '../components/jeux/SonJeux';
import BandeauClassement, {formaterNombre} from '../components/jeux/BandeauClassement';
import FenetreReprise from '../components/jeux/FenetreReprise';
import useBandeauClassement from '../utils/jeux/useBandeauClassement';
import useReprise from '../utils/jeux/sauvegardePartie';
import useRecompenses from '../utils/jeux/useRecompenses';
import {BanniereRecompense, RecapRecompenses, OR_FONCE} from '../components/jeux/RecompensesJeu';
import {
  JEU_MEMOIRE, parametresNiveau, creerDonne, creerAlea, estPaire, melangerCachees, pointsPaire, bonusNiveau,
  dispositionGrille, bonusCombo, secondesCombo, etoilesNiveau, paireAimant, BONUS, SECONDES_SABLIER,
  SCORE_MAX_SERVEUR, cleSauvegarde, chargerRecords, enregistrerRecords, majRecords,
} from '../utils/jeux/memoire';

// Vibration légère : module natif facultatif (expo-haptics), le jeu marche sans.
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
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch (e) {
    // Sans vibration.
  }
}

const OR = '#F2B705';
const VERT = '#2ecc71';
const ROUGE = '#e74c3c';
const ECART = 10;
const BLEU_TEMPS = '#1E88E5';
const VIOLET_LOUPE = '#8E44AD';
const ROSE_AIMANT = '#D81B60';
const DUREE_RETOURNEMENT = 340;
const TEXTE_CLAIR = '#16324A';

export default function JeuMemoireScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser} = useCompteJeu();
  const cle = useMemo(() => cleSauvegarde(idUser), [idUser]);

  const [phase, setPhase] = useState('accueil'); // accueil, jeu, palier, pause, fin
  const phaseRef = useRef('accueil');
  const [niveau, setNiveau] = useState(1);
  const [cartes, setCartes] = useState([]);
  const [retournees, setRetournees] = useState([]);
  const [score, setScore] = useState(0);
  const [records, setRecords] = useState(null); // {meilleurScore, meilleurNiveau}, null : chargement
  const recordsRef = useRef(null);
  const [zone, setZone] = useState({l: 0, h: 0});
  const [ecran, setEcran] = useState({l: 0, h: 0});
  const [palier, setPalier] = useState(null); // { niveau, paires, points, combo, temps, sansErreur, etoiles, suivant }
  const [resultat, setResultat] = useState(null); // { score, niveau, paires }
  const [bulles, setBulles] = useState([]);
  const [apercu, setApercu] = useState(false); // loupe : toutes les cartes visibles un instant
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
  const termineRef = useRef(false); // record de la partie déjà compté
  const comboRef = useRef(0); // paires d'affilée sans erreur
  const pointsComboRef = useRef(0); // points de combo du niveau
  const afficheSecondesRef = useRef(null); // setter du composant Chrono
  const minuteurLoupeRef = useRef(null);
  const finLoupeRef = useRef(0); // heure de fin de la loupe en cours
  const resteLoupeRef = useRef(0); // ms de loupe restantes après une pause
  const banniereRef = useRef(null);

  const progression = useRef(new Animated.Value(1)).current;
  const secousse = useRef(new Animated.Value(1)).current;

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    JEU_MEMOIRE,
    records?.meilleurScore || 0,
    records?.meilleurNiveau || 1,
    phase === 'jeu',
    score,
    phase === 'palier' ? niveau + 1 : niveau,
  );

  const recompenses = useRecompenses({
    score,
    enPartie: phase === 'jeu',
    meilleurScore: records?.meilleurScore || 0,
    lireMaxMois,
    surAnnonce: a => {
      if (a.type === 'record') banniereRef.current?.annoncer({texte: t('jeuxMemoireNouveauRecord'), icone: 'trophy', couleur: OR_FONCE});
      else banniereRef.current?.annoncer({texte: t('jeuxMemoirePalier', {n: formaterNombre(a.n)}), icone: 'ribbon', couleur: C.marque});
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  const bandeau = useBandeauClassement(JEU_MEMOIRE, {
    score,
    meilleurLocal: records ? records.meilleurScore : null,
    enPartie: phase === 'jeu',
  });

  const repriseRef = useRef({enregistrer: () => {}, effacer: () => {}, verifier: () => Promise.resolve({})});
  const surReprendreRef = useRef(null);
  const reprise = useReprise(JEU_MEMOIRE, {
    surReprendre: sauvee => surReprendreRef.current?.(sauvee),
    surRecommencer: () => {},
  });
  repriseRef.current = reprise;

  const changerPhase = useCallback(p => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  const majCartes = useCallback(liste => {
    cartesRef.current = liste;
    if (monteRef.current) setCartes(liste);
  }, []);

  const majRetournees = useCallback(liste => {
    retourneesRef.current = liste;
    if (monteRef.current) setRetournees(liste);
  }, []);

  const majScore = useCallback(valeur => {
    const s = Math.min(SCORE_MAX_SERVEUR, valeur);
    scoreRef.current = s;
    if (monteRef.current) setScore(s);
  }, []);

  /** Enregistre la partie en cours pour la reprise (niveau à rejouer, score, paires). */
  const sauver = useCallback(n => {
    const etat = {niveau: n, score: scoreRef.current, paires: pairesTotalRef.current};
    repriseRef.current.enregistrer(etat, {niveau: n, score: scoreRef.current});
  }, []);

  /** Records du téléphone après la partie (score atteint, dernier niveau joué). */
  const compterRecord = useCallback(
    (s, n) => {
      const avant = recordsRef.current || {meilleurScore: 0, meilleurNiveau: 1};
      const apres = majRecords(avant, s, n);
      recordsRef.current = apres;
      if (monteRef.current) setRecords(apres);
      enregistrerRecords(cle, apres);
      return apres.meilleurScore > avant.meilleurScore;
    },
    [cle],
  );

  // Annonce (points, combo, bonus) : toujours en haut, dans la bande sous le chrono.
  const ajouterBulle = useCallback((texte, couleur, gros = false) => {
    if (!monteRef.current) return;
    idBulleRef.current += 1;
    const id = idBulleRef.current;
    setBulles(b => [...b.slice(-2), {id, texte, couleur, gros}]);
  }, []);
  const retirerBulle = useCallback(id => {
    if (monteRef.current) setBulles(b => b.filter(x => x.id !== id));
  }, []);

  // Chrono : décompte réel (Date.now), arrêté hors de la phase « jeu ».
  // Une minuterie par seconde seulement ; la barre glisse seule (pilote natif).
  const arreterChrono = useCallback(() => {
    if (chronoRef.current) clearTimeout(chronoRef.current);
    chronoRef.current = null;
    if (dernierTicRef.current != null) {
      restantRef.current = Math.max(0, restantRef.current - (Date.now() - dernierTicRef.current));
    }
    dernierTicRef.current = null;
    progression.stopAnimation();
    const duree = paramsRef.current.duree * 1000;
    progression.setValue(duree > 0 ? Math.min(1, restantRef.current / duree) : 0);
  }, [progression]);

  const afficherChrono = useCallback(() => {
    const s = Math.ceil(restantRef.current / 1000);
    afficheSecondesRef.current?.(s);
  }, []);

  const annulerErreurEnCours = useCallback(() => {
    if (minuteurErreurRef.current) clearTimeout(minuteurErreurRef.current);
    minuteurErreurRef.current = null;
    if (minuteurLoupeRef.current) clearTimeout(minuteurLoupeRef.current);
    minuteurLoupeRef.current = null;
    resteLoupeRef.current = 0;
    verrouRef.current = false;
    if (monteRef.current) setApercu(false);
  }, []);

  const terminer = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    arreterChrono();
    annulerErreurEnCours();
    restantRef.current = 0;
    afficherChrono();
    vibrer(true);
    const res = {score: scoreRef.current, niveau: niveauRef.current, paires: pairesTotalRef.current};
    if (monteRef.current) {
      setResultat(res);
      setBulles([]);
    }
    changerPhase('fin');
    repriseRef.current.effacer();
    bruit(res.score > 0 ? 'perdu' : 'choc');
    if (!termineRef.current) {
      termineRef.current = true;
      if (compterRecord(res.score, res.niveau)) {
        setTimeout(() => {
          if (monteRef.current) bruit('record');
        }, 600);
      }
    }
  }, [afficherChrono, annulerErreurEnCours, arreterChrono, changerPhase, compterRecord]);

  const ticRef = useRef(null);
  const planifierTic = useCallback(() => {
    const reste = restantRef.current % 1000 || 1000;
    chronoRef.current = setTimeout(() => ticRef.current?.(), reste + 4);
  }, []);

  const tic = useCallback(() => {
    chronoRef.current = null;
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
    planifierTic();
  }, [afficherChrono, planifierTic, terminer]);
  ticRef.current = tic;

  const demarrerChrono = useCallback(() => {
    if (chronoRef.current) return;
    dernierTicRef.current = Date.now();
    const duree = paramsRef.current.duree * 1000;
    progression.setValue(duree > 0 ? Math.min(1, restantRef.current / duree) : 0);
    Animated.timing(progression, {
      toValue: 0,
      duration: Math.max(0, restantRef.current),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
    planifierTic();
  }, [planifierTic, progression]);

  const demarrerNiveau = useCallback(
    n => {
      arreterChrono();
      annulerErreurEnCours();
      const p = parametresNiveau(n);
      niveauRef.current = n;
      paramsRef.current = p;
      erreursRef.current = 0;
      pointsNiveauRef.current = 0;
      comboRef.current = 0;
      pointsComboRef.current = 0;
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
    },
    [afficherChrono, annulerErreurEnCours, arreterChrono, changerPhase, demarrerChrono, majCartes, majRetournees],
  );

  const jouer = useCallback(() => {
    repriseRef.current.effacer();
    termineRef.current = false;
    aleaRef.current = creerAlea(Date.now());
    pairesTotalRef.current = 0;
    majScore(0);
    recompensesRef.current.debut(0);
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
    bruit('niveau');
    sauver(n + 1);
    const suivant = parametresNiveau(n + 1);
    if (monteRef.current) {
      setPalier({
        niveau: n,
        paires: p.paires,
        points: pointsNiveauRef.current - pointsComboRef.current,
        combo: pointsComboRef.current,
        temps: bonus.temps,
        sansErreur: bonus.sansErreur,
        etoiles: etoilesNiveau(p.paires, erreursRef.current),
        suivant: {niveau: suivant.niveau, paires: suivant.paires, duree: suivant.duree},
      });
      setBulles([]);
    }
    changerPhase('palier');
  }, [arreterChrono, changerPhase, majScore, sauver]);

  // Mauvaise paire : les deux cartes se recachent, puis mélange éventuel.
  const recacher = useCallback(() => {
    minuteurErreurRef.current = null;
    verrouRef.current = false;
    majRetournees([]);
    const mode = paramsRef.current.melange;
    if (mode !== 'aucun') {
      const avant = cartesRef.current;
      const apres = melangerCachees(avant, mode, aleaRef.current, paramsRef.current.echanges);
      if (apres !== avant) {
        majCartes(apres);
        ajouterBulle(t('jeuxMemoireMelange'), C.marque, true);
        secousse.setValue(0.94);
        Animated.spring(secousse, {toValue: 1, friction: 4, tension: 120, useNativeDriver: true}).start();
      }
    }
  }, [ajouterBulle, majCartes, majRetournees, secousse, t]);

  // Loupe : toutes les cartes visibles `duree` ms, le toucher bloqué pendant ce temps.
  const lancerLoupe = useCallback(duree => {
    verrouRef.current = true;
    if (monteRef.current) setApercu(true);
    finLoupeRef.current = Date.now() + duree;
    minuteurLoupeRef.current = setTimeout(() => {
      minuteurLoupeRef.current = null;
      verrouRef.current = false;
      if (monteRef.current) setApercu(false);
    }, duree);
  }, []);

  const retourner = useCallback(
    id => {
      if (phaseRef.current !== 'jeu' || verrouRef.current) return;
      const carte = cartesRef.current.find(c => c.id === id);
      if (!carte || carte.trouvee) return;
      const deja = retourneesRef.current;
      if (deja.includes(id) || deja.length >= 2) return;
      const liste = [...deja, id];
      majRetournees(liste);
      if (liste.length < 2) {
        vibrer(false);
        bruit('carte');
        return;
      }
      const premiere = cartesRef.current.find(c => c.id === liste[0]);
      if (estPaire(premiere, carte)) {
        const n = niveauRef.current;
        comboRef.current += 1;
        const combo = comboRef.current;
        const extra = bonusCombo(combo);
        const gain = pointsPaire(n) + extra;
        pointsNiveauRef.current += gain;
        pointsComboRef.current += extra;
        pairesTotalRef.current += 1;
        majScore(scoreRef.current + gain);
        const nouvelles = cartesRef.current.map(c => (c.paire === carte.paire ? {...c, trouvee: true} : c));
        majCartes(nouvelles);
        majRetournees([]);
        vibrer(false);
        bruit(combo >= 2 ? 'booster' : 'ramasse');
        ajouterBulle(`+${gain}`, VERT, combo >= 2);
        const offert = secondesCombo(combo);
        // Une seule annonce pour le combo et ses secondes offertes (la bande n'en garde que 3).
        if (combo >= 2) {
          ajouterBulle(
            offert > 0 ? `${t('jeuxMemoireCombo', {n: combo})} +${offert} s` : t('jeuxMemoireCombo', {n: combo}),
            OR,
            true,
          );
        }
        if (nouvelles.every(c => c.trouvee)) {
          finirNiveau();
          return;
        }
        // Secondes offertes (combo, sablier) : le chrono repart du nouveau temps, plafonné à la durée du niveau.
        const ajouterSecondes = s => {
          arreterChrono();
          restantRef.current = Math.min(paramsRef.current.duree * 1000, restantRef.current + s * 1000);
          afficherChrono();
          demarrerChrono();
        };
        if (offert > 0) ajouterSecondes(offert);
        if (carte.bonus === 'sablier') {
          ajouterSecondes(SECONDES_SABLIER);
          bruit('vie');
          ajouterBulle(t('jeuxMemoireSablier', {n: SECONDES_SABLIER}), BLEU_TEMPS, true);
        } else if (carte.bonus === 'loupe') {
          bruit('booster');
          ajouterBulle(t('jeuxMemoireLoupe'), VIOLET_LOUPE, true);
          lancerLoupe(paramsRef.current.loupe);
        } else if (carte.bonus === 'aimant') {
          // Une autre paire encore cachée trouvée d'office (points d'une paire, sans combo).
          const cible = paireAimant(nouvelles, aleaRef.current);
          if (cible != null) {
            const points = pointsPaire(n);
            pointsNiveauRef.current += points;
            pairesTotalRef.current += 1;
            majScore(scoreRef.current + points);
            const apres = nouvelles.map(c => (c.paire === cible ? {...c, trouvee: true} : c));
            majCartes(apres);
            bruit('booster');
            ajouterBulle(`${t('jeuxMemoireAimant')} +${points}`, ROSE_AIMANT, true);
            if (apres.every(c => c.trouvee)) finirNiveau();
          }
        }
        return;
      }
      comboRef.current = 0;
      erreursRef.current += 1;
      verrouRef.current = true;
      vibrer(true);
      bruit('choc');
      minuteurErreurRef.current = setTimeout(recacher, paramsRef.current.delaiErreur);
    },
    [afficherChrono, ajouterBulle, arreterChrono, demarrerChrono, finirNiveau, lancerLoupe, majCartes, majRetournees, majScore, recacher, t],
  );

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    sauver(niveauRef.current);
    arreterChrono();
    afficherChrono();
    // Loupe en cours : arrêtée (les cartes sont masquées pendant la pause), le reste repart à la reprise.
    if (minuteurLoupeRef.current) {
      clearTimeout(minuteurLoupeRef.current);
      minuteurLoupeRef.current = null;
      resteLoupeRef.current = Math.max(0, finLoupeRef.current - Date.now());
      verrouRef.current = false;
      if (monteRef.current) setApercu(false);
    }
    // Une mauvaise paire en cours d'affichage est recachée tout de suite.
    if (minuteurErreurRef.current) {
      clearTimeout(minuteurErreurRef.current);
      recacher();
    } else {
      majRetournees([]);
    }
    if (monteRef.current) setBulles([]);
    changerPhase('pause');
  }, [afficherChrono, arreterChrono, changerPhase, majRetournees, recacher, sauver]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  const estEnJeu = useCallback(() => phaseRef.current === 'jeu', []);
  // Retour avec le classement ouvert hors partie : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current === 'jeu') return false;
    setClassementOuvert(false);
    return true;
  };
  // Arrière-plan, écran quitté, retour pendant la partie et nouvelle course : pause.
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: phase === 'jeu' || (classementOuvert && phase === 'pause'),
    estEnJeu,
    fermerPanneau,
  });

  const reprendre = useCallback(() => {
    if (phaseRef.current !== 'pause') return;
    changerPhase('jeu');
    if (resteLoupeRef.current > 0) {
      const reste = resteLoupeRef.current;
      resteLoupeRef.current = 0;
      lancerLoupe(reste);
    }
    demarrerChrono();
  }, [changerPhase, demarrerChrono, lancerLoupe]);

  const niveauSuivant = useCallback(() => {
    if (phaseRef.current !== 'palier') return;
    demarrerNiveau(niveauRef.current + 1);
  }, [demarrerNiveau]);

  // Partie enregistrée reprise : le niveau en cours repart avec une donne neuve.
  surReprendreRef.current = p => {
    termineRef.current = false;
    aleaRef.current = creerAlea(Date.now());
    pairesTotalRef.current = Math.max(0, Math.floor(Number(p?.paires) || 0));
    majScore(Math.max(0, Math.floor(Number(p?.score) || 0)));
    setResultat(null);
    demarrerNiveau(Math.max(1, Math.floor(Number(p?.niveau) || 1)));
  };

  // Records du téléphone, puis proposition de reprise (moins de 24 h).
  useEffect(() => {
    let vivant = true;
    reprendreAncienRecord('memoire', idUser).then(() => chargerRecords(cle)).then(r => {
      if (!vivant) return;
      recordsRef.current = r;
      setRecords(r);
      repriseRef.current.verifier();
    });
    return () => {
      vivant = false;
    };
  }, [cle]);

  // Démontage (arrière-plan et écran quitté : usePauseJeu).
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      monteRef.current = false;
      if (chronoRef.current) clearTimeout(chronoRef.current);
      chronoRef.current = null;
      progression.stopAnimation();
      if (minuteurErreurRef.current) clearTimeout(minuteurErreurRef.current);
      if (minuteurLoupeRef.current) clearTimeout(minuteurLoupeRef.current);
    };
  }, [progression]);

  // Musique du jeu : seulement pendant la partie.
  const enJeu = phase === 'jeu';
  useEffect(() => {
    if (enJeu) demarrerMusique(JEU_MEMOIRE);
    else arreterMusique();
    return () => arreterMusique();
  }, [enJeu]);

  const surMesure = useCallback(ev => {
    const {width, height} = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    setZone(z => (z.l === l && z.h === h ? z : {l, h}));
  }, []);

  const surEcran = useCallback(ev => {
    const {width, height} = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    setEcran(z => (z.l === l && z.h === h ? z : {l, h}));
  }, []);

  /** Score déjà gagné d'une partie laissée en cours : il compte pour le record. */
  const compterPartieEnCours = useCallback(() => {
    const p = phaseRef.current;
    if ((p === 'pause' || p === 'palier') && !termineRef.current && scoreRef.current > 0) {
      termineRef.current = true;
      compterRecord(scoreRef.current, p === 'palier' ? niveauRef.current + 1 : niveauRef.current);
    }
  }, [compterRecord]);

  // Quitter en cours de partie : partie gardée pour la reprise, le score déjà gagné compte pour le record.
  const quitter = useCallback(() => {
    pause();
    compterPartieEnCours();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [compterPartieEnCours, navigation, pause]);

  // Rejouer depuis la pause : comme Quitter, le score déjà gagné compte.
  const confirmerNouvellePartie = useCallback(() => {
    Alert.alert(t('jeuNouvellePartieTitre'), t('jeuNouvellePartieTexte'), [
      {text: t('jeuAnnuler'), style: 'cancel'},
      {
        text: t('jeuNouvellePartie'),
        style: 'destructive',
        onPress: () => {
          compterPartieEnCours();
          jouer();
        },
      },
    ]);
  }, [compterPartieEnCours, jouer, t]);

  // Fiche de la course annoncée : « Voir la course » quitte le jeu, partie gardée en pause.
  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    compterPartieEnCours();
    navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [compterPartieEnCours, fermerAlerte, navigation, pause]);

  const ouvrirClassement = useCallback(() => {
    pause();
    setClassementOuvert(true);
  }, [pause]);

  const pairesTrouvees = cartes.filter(c => c.trouvee).length / 2;
  const pairesTotal = cartes.length / 2;
  const grilleVisible = phase === 'jeu' || phase === 'palier';
  const grille = useMemo(() => dispositionGrille(cartes.length || 4, zone.l, Math.max(0, zone.h - ECART), ECART), [cartes.length, zone]);
  const largeurGrille = grille.colonnes * grille.largeur + (grille.colonnes - 1) * ECART;
  const fenetre = phase !== 'jeu' && !classementOuvert && !reprise.proposition && !alerteCourse;
  const meilleur = records?.meilleurScore || 0;

  return (
    <View style={[styles.ecran, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]} onLayout={surEcran}>
      {/* Décor lumineux : la ville et le petit logo Pearl Streets, sous la grille */}
      <DecorMemoire l={ecran.l} h={ecran.h} bas={insets.bottom} actif={enJeu} />

      <HudJeu
        score={score}
        niveau={niveau}
        objets={{n: pairesTrouvees, total: pairesTotal, icone: 'copy'}}
        onPause={pause}
        onQuitter={quitter}
        pauseActive={enJeu}
      />
      <BandeauClassement bandeau={bandeau} style={styles.bandeau} />

      {/* Chrono du niveau */}
      <Chrono progression={progression} enregistrer={afficheSecondesRef} duree={parametresNiveau(niveau).duree} enJeu={enJeu} />

      {/* Annonces (points, combo, bonus) : en haut, sous le chrono, jamais sur les cartes */}
      <View pointerEvents="none" style={styles.bulles}>
        {bulles.map(b => (
          <Bulle key={b.id} id={b.id} texte={b.texte} couleur={b.couleur} gros={b.gros} onFin={retirerBulle} />
        ))}
      </View>
      {/* Record et paliers : dans la bande des annonces, jamais sur le score ni le classement */}
      <View pointerEvents="none" style={styles.ancreBanniere}>
        <BanniereRecompense ref={banniereRef} style={styles.banniere} />
      </View>

      {/* Cartes (masquées pendant la pause : pas de triche) */}
      <View style={[styles.zone, {marginBottom: Math.max(0, RESERVE_BAS - 12)}]} onLayout={surMesure}>
        {grilleVisible && zone.h > 0 && grille.largeur > 0 && (
          <Animated.View style={[styles.grille, {width: largeurGrille, transform: [{scale: secousse}]}]}>
            {cartes.map((c, i) => (
              <Carte
                key={c.id}
                carte={c}
                visible={c.trouvee || apercu || retournees.includes(c.id)}
                largeur={grille.largeur}
                hauteur={grille.hauteur}
                marge={(i + 1) % grille.colonnes === 0 ? 0 : ECART}
                onRetourner={retourner}
              />
            ))}
          </Animated.View>
        )}
        {phase === 'pause' && (
          <View style={styles.cache}>
            <Ionicons name="eye-off" size={40} color={TEXTE_CLAIR} />
          </View>
        )}
      </View>

      {phase === 'palier' && palier && fenetre && <Confettis cle={palier.niveau} l={ecran.l} h={ecran.h} />}
      {/* Fenêtres : accueil, palier, pause, fin */}
      {fenetre && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="albums" size={46} color={C.marque} />
                <Text style={styles.titre}>{t('jeuxMemoireTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxMemoireRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxMemoireBonus')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxMemoireComboRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxMemoireBonusCartes')}</Text>
                <Records records={records} t={t} />
                <Bouton texte={t('jeuJouer')} onPress={jouer} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'palier' && palier && (
              <>
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Etoiles n={palier.etoiles} />
                <Text style={styles.titre}>{t('jeuNiveauReussi', {n: palier.niveau})}</Text>
                {palier.etoiles === 3 && <Text style={styles.record}>{t('jeuxMemoireParfait')}</Text>}
                <View style={styles.lignes}>
                  <Ligne texte={t('jeuxMemoirePaires', {n: palier.paires})} valeur={`+${palier.points}`} />
                  {palier.combo > 0 && <Ligne texte={t('jeuxMemoireBonusCombo')} valeur={`+${palier.combo}`} couleur={OR} />}
                  <Ligne texte={t('jeuxMemoireBonusTemps')} valeur={`+${palier.temps}`} />
                  <Ligne
                    texte={t('jeuxMemoireBonusSansErreur')}
                    valeur={`+${palier.sansErreur}`}
                    couleur={palier.sansErreur > 0 ? VERT : undefined}
                  />
                </View>
                <Text style={styles.scoreFin}>{score}</Text>
                <Text style={styles.texteDiscret}>
                  {t('jeuxMemoireProchain', {n: palier.suivant.niveau, p: palier.suivant.paires, s: palier.suivant.duree})}
                </Text>
                <Bouton texte={t('jeuNiveauSuivant')} onPress={niveauSuivant} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="pause-circle" size={44} color={C.marque} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                <Text style={styles.texte}>{t('jeuScore', {n: score})}</Text>
                <Text style={styles.texteDiscret}>{t('jeuSauvegarde')}</Text>
                <Bouton texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton secondaire texte={t('jeuxMemoireRejouer')} onPress={confirmerNouvellePartie} />
                <Bouton secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && (
              <>
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="timer" size={46} color={C.marque} />
                <Text style={styles.titre}>{t('jeuxMemoireFin')}</Text>
                <Text style={styles.scoreFin}>{resultat?.score ?? score}</Text>
                <View style={styles.stats}>
                  <Stat icone="layers" n={t('jeuNiveauCourt', {n: resultat?.niveau ?? niveau})} />
                  <Stat icone="copy" n={resultat?.paires ?? 0} />
                </View>
                <RecapRecompenses {...recompenses.recap(resultat?.score ?? score)} />
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', {n: meilleur})}</Text>
                <Bouton texte={t('jeuxMemoireRejouer')} onPress={jouer} />
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
        jeu={JEU_MEMOIRE}
        visible={classementOuvert && phase !== 'jeu' && !alerteCourse}
        onClose={() => setClassementOuvert(false)}
        avantChargement={envoyer}
      />

      {/* Nouvelle course annoncée : la partie est en pause, fiche de la vraie course. */}
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
      )}
    </View>
  );
}

// Carte à deux faces : dos Pearl Streets et motif, retournement en rotation Y.
const Carte = memo(function Carte({carte, visible, largeur, hauteur, marge, onRetourner}) {
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
      Animated.spring(pop, {toValue: 1.1, friction: 3, tension: 160, useNativeDriver: true}),
      Animated.spring(pop, {toValue: 1, friction: 5, tension: 120, useNativeDriver: true}),
    ]).start();
  }, [carte.trouvee, pop]);

  const dos = {
    opacity: rot.interpolate({inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0]}),
    transform: [{perspective: 900}, {rotateY: rot.interpolate({inputRange: [0, 1], outputRange: ['0deg', '180deg']})}],
  };
  const face = {
    opacity: rot.interpolate({inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1]}),
    transform: [{perspective: 900}, {rotateY: rot.interpolate({inputRange: [0, 1], outputRange: ['180deg', '360deg']})}],
  };
  const coche = Math.max(16, Math.min(largeur, hauteur) * 0.22);
  const rayon = rayonCarte(largeur, hauteur);

  return (
    <Pressable
      onPressIn={() => onRetourner(carte.id)}
      style={{width: largeur, height: hauteur, marginRight: marge, marginBottom: ECART}}
      accessibilityRole="button">
      <Animated.View style={[StyleSheet.absoluteFill, {transform: [{scale: pop}]}]}>
        <Animated.View style={[styles.faceCarte, styles.dosCarte, {borderRadius: rayon}, dos]}>
          <DosCarte largeur={largeur} hauteur={hauteur} />
        </Animated.View>
        <Animated.View style={[styles.faceCarte, {borderRadius: rayon, backgroundColor: carte.couleur}, face]}>
          <FaceCarte icone={carte.icone} couleur={carte.couleur} largeur={largeur} hauteur={hauteur} />
          {!!carte.bonus && <View pointerEvents="none" style={[styles.cadreBonus, {borderRadius: rayon}]} />}
          {!!carte.bonus && BONUS[carte.bonus] && (
            <View style={[styles.badgeBonus, {width: coche + 6, height: coche + 6, borderRadius: (coche + 6) / 2}]}>
              <Ionicons name={BONUS[carte.bonus].icone} size={coche * 0.7} color={C.blanc} />
            </View>
          )}
          {carte.trouvee && (
            <View style={styles.coche}>
              <Ionicons name="checkmark-circle" size={coche} color={VERT} />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

// Chrono : seul composant redessiné chaque seconde, la barre glisse par le pilote natif.
const Chrono = memo(function Chrono({progression, enregistrer, duree, enJeu}) {
  const [secondes, setSecondes] = useState(duree);
  useEffect(() => {
    enregistrer.current = s => setSecondes(x => (x === s ? x : s));
    return () => {
      enregistrer.current = null;
    };
  }, [enregistrer]);
  const pressee = secondes <= Math.max(3, Math.ceil(duree * 0.25));
  return (
    <View style={styles.chrono}>
      <Ionicons name="time" size={18} color={pressee && enJeu ? ROUGE : TEXTE_CLAIR} />
      <View style={styles.barreFond}>
        <Animated.View style={[styles.barre, {backgroundColor: pressee ? ROUGE : C.marque, transform: [{scaleX: progression}]}]} />
      </View>
      <Text style={[styles.chronoTexte, pressee && enJeu && {color: ROUGE}]}>{secondes}</Text>
    </View>
  );
});

// Annonce de la bande du haut : jaillit, grossit puis s'efface sur place (pilote natif).
function Bulle({id, texte, couleur, gros, onFin}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {toValue: 1, duration: gros ? 1400 : 1000, easing: Easing.out(Easing.quad), useNativeDriver: true}).start(() =>
      onFin(id),
    );
  }, [gros, id, onFin, v]);
  const translateY = v.interpolate({inputRange: [0, 1], outputRange: [4, -3]});
  const scale = v.interpolate({inputRange: [0, 0.18, 0.32, 1], outputRange: [0.5, gros ? 1.2 : 1.12, 1, 1]});
  const opacity = v.interpolate({inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0]});
  return (
    <Animated.Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[styles.bulle, gros && styles.bulleGrosse, {color: couleur, opacity, transform: [{translateY}, {scale}]}]}>
      {texte}
    </Animated.Text>
  );
}

// Étoiles du niveau gagné : apparaissent l'une après l'autre.
function Etoiles({n}) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      180,
      vals.map(v => Animated.spring(v, {toValue: 1, friction: 4, tension: 140, useNativeDriver: true})),
    ).start();
  }, [vals]);
  return (
    <View style={styles.etoiles}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{transform: [{scale: v}, {translateY: i === 1 ? -8 : 0}]}}>
          <Ionicons name={i < n ? 'star' : 'star-outline'} size={i === 1 ? 46 : 36} color={i < n ? OR : '#C8D1DC'} />
        </Animated.View>
      ))}
    </View>
  );
}

// Confettis du niveau gagné : une seule animation native, jouée une fois.
const COULEURS_CONFETTIS = [OR, VERT, '#FF6A13', '#1E88E5', '#E63946', '#8E44AD'];
const NB_CONFETTIS = 22;
const Confettis = memo(function Confettis({cle, l, h}) {
  const v = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(
    () =>
      Array.from({length: NB_CONFETTIS}, (_, i) => {
        const angle = (i / NB_CONFETTIS) * Math.PI * 2 + (i % 3) * 0.3;
        const force = 0.28 + ((i * 37) % 10) / 30;
        return {
          dx: Math.cos(angle) * l * force,
          dy: Math.sin(angle) * h * force * 0.6,
          chute: h * (0.18 + ((i * 13) % 7) / 40),
          tour: `${(i % 2 ? 1 : -1) * (240 + i * 20)}deg`,
          couleur: COULEURS_CONFETTIS[i % COULEURS_CONFETTIS.length],
          rond: i % 3 === 0,
        };
      }),
    [l, h],
  );
  useEffect(() => {
    v.setValue(0);
    const a = Animated.timing(v, {toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true});
    a.start();
    return () => a.stop();
  }, [cle, v]);
  if (!l || !h) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.confettis]}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.confetti,
            p.rond && styles.confettiRond,
            {
              left: l / 2 - 5,
              top: h * 0.34,
              backgroundColor: p.couleur,
              opacity: v.interpolate({inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0]}),
              transform: [
                {translateX: v.interpolate({inputRange: [0, 1], outputRange: [0, p.dx]})},
                {translateY: v.interpolate({inputRange: [0, 0.5, 1], outputRange: [0, p.dy, p.dy + p.chute]})},
                {rotate: v.interpolate({inputRange: [0, 1], outputRange: ['0deg', p.tour]})},
              ],
            },
          ]}
        />
      ))}
    </View>
  );
});

function Records({records, t}) {
  return (
    <View style={styles.records}>
      <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', {n: records?.meilleurScore || 0})}</Text>
      <Text style={styles.texteDiscret}>{t('jeuMeilleurNiveau', {n: records?.meilleurNiveau || 1})}</Text>
    </View>
  );
}

function Ligne({texte, valeur, couleur}) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneTexte}>{texte}</Text>
      <Text style={[styles.ligneValeur, couleur && {color: couleur}]}>{valeur}</Text>
    </View>
  );
}

function Stat({icone, n, couleur}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icone} size={20} color={couleur || C.marque} />
      <Text style={styles.statTexte}>{n}</Text>
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
  bandeau: {marginTop: 8},
  chrono: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12},
  barreFond: {flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(48, 51, 79, 0.12)', overflow: 'hidden'},
  barre: {width: '100%', height: '100%', borderRadius: 5, transformOrigin: 'left'},
  chronoTexte: {color: TEXTE_CLAIR, fontWeight: '800', fontSize: 15, minWidth: 26, textAlign: 'right'},
  zone: {flex: 1, marginTop: 4, alignItems: 'center', justifyContent: 'center'},
  grille: {flexDirection: 'row', flexWrap: 'wrap'},
  cache: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
  ancreBanniere: {height: 0, zIndex: 5},
  banniere: {top: -37, left: 0, right: 0},
  bulles: {
    height: 30, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden',
  },
  bulle: {
    flexShrink: 1, textAlign: 'center', fontSize: 17, fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.35)', textShadowRadius: 4, textShadowOffset: {width: 0, height: 1},
  },
  bulleGrosse: {fontSize: 19},
  faceCarte: {
    ...StyleSheet.absoluteFillObject, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden',
    shadowColor: C.texte, shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: {width: 0, height: 3}, elevation: 3,
  },
  dosCarte: {backgroundColor: BLEU_NUIT},
  coche: {position: 'absolute', top: 6, right: 6},
  cadreBonus: {...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: OR},
  badgeBonus: {
    position: 'absolute', top: 5, left: 5, backgroundColor: OR, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.blanc,
  },
  etoiles: {flexDirection: 'row', alignItems: 'flex-end', gap: 6},
  confettis: {zIndex: 5},
  confetti: {position: 'absolute', width: 10, height: 14, borderRadius: 2},
  confettiRond: {width: 10, height: 10, borderRadius: 5},
  voile: {
    ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: {width: '100%', maxWidth: 380, backgroundColor: C.fond, borderRadius: 20, padding: 22, alignItems: 'center'},
  titre: {color: C.texte, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center'},
  texte: {color: C.texteDoux, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21},
  texteDiscret: {color: C.texteDiscret, fontSize: 13, marginTop: 6, textAlign: 'center'},
  records: {marginTop: 6, marginBottom: 4},
  record: {color: OR_FONCE, fontSize: 16, fontWeight: '800', marginTop: 6},
  scoreFin: {color: C.texte, fontSize: 48, fontWeight: '900', marginTop: 4},
  lignes: {alignSelf: 'stretch', marginTop: 12, gap: 6},
  ligne: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  ligneTexte: {color: C.texteDoux, fontSize: 15, flexShrink: 1},
  ligneValeur: {color: C.texte, fontSize: 15, fontWeight: '800', marginLeft: 12},
  stats: {flexDirection: 'row', gap: 18, marginTop: 4, marginBottom: 2},
  stat: {flexDirection: 'row', alignItems: 'center', gap: 5},
  statTexte: {color: C.texte, fontSize: 16, fontWeight: '700'},
  bouton: {alignSelf: 'stretch', marginTop: 14, backgroundColor: C.marque, borderRadius: 14, paddingVertical: 14, alignItems: 'center'},
  boutonSecondaire: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.bordureForte, marginTop: 10},
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
  boutonTexteSecondaire: {color: C.texte},
});
