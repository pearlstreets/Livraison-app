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
 * pendant la pause. Son : musique propre au jeu et bruitages (components/SonJeux.js),
 * bandeau de classement en haut, reprise de la partie sauvegardée (24 h). En haut :
 * niveau, score et paires trouvées (components/HudJeu.js). Cartes dessinées en
 * illustrées (components/FacesMemoire.js : dos au logo Pearl Streets en
 * filigrane, faces illustrées thème livraison).
 * Récompenses : « +N », combo de paires d'affilée (points et secondes en
 * plus), paires bonus au cadre doré (loupe, sablier, aimant), étoiles et
 * confettis au niveau gagné. Toutes les annonces s'affichent en haut, dans la
 * bande juste sous le chrono, jamais sur les cartes.
 * Batterie : chrono à une mise à jour par seconde dans son propre composant
 * (la grille ne se redessine pas), barre animée par le pilote natif, tout
 * arrêté en pause et en arrière-plan (usePauseJeu).
 * Décor lumineux : ville et panneau Pearl Streets (components/DecorMemoire.js).
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
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import { reserveBasVille } from '../components/FondJeu';
import DecorMemoire from '../components/DecorMemoire';
import { FaceCarte, DosCarte, rayonCarte } from '../components/FacesMemoire';
import HudJeu from '../components/HudJeu';
import SonJeux, { bruit } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import BandeauClassement from '../components/BandeauClassement';
import ReprisePartie from '../components/ReprisePartie';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  parametresNiveau, creerDonne, creerAlea, estPaire, melangerCachees, pointsPaire, bonusNiveau, dispositionGrille,
  bonusCombo, secondesCombo, etoilesNiveau, paireAimant, BONUS, SECONDES_SABLIER, SCORE_MAX_SERVEUR,
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
const BLEU_TEMPS = '#1E88E5';
const VIOLET_LOUPE = '#8E44AD';
const ROSE_AIMANT = '#D81B60';
const DUREE_RETOURNEMENT = 340;
const TEXTE_CLAIR = '#16324A';
const PIEDS_ENSEIGNE = 10;

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
  const [zone, setZone] = useState({ l: 0, h: 0 });
  const [ecran, setEcran] = useState({ l: 0, h: 0 });
  const [palier, setPalier] = useState(null); // { niveau, paires, points, combo, temps, sansErreur, etoiles, suivant }
  const [resultat, setResultat] = useState(null); // { score, niveau, paires, nouveauRecord }
  const [bulles, setBulles] = useState([]);
  const [apercu, setApercu] = useState(false); // loupe : toutes les cartes visibles un instant
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [reprise, setReprise] = useState(null); // partie sauvegardée proposée à l'ouverture
  const [nbParties, setNbParties] = useState(0); // fait recharger le bandeau de classement

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
  const comboRef = useRef(0); // paires d'affilée sans erreur
  const pointsComboRef = useRef(0); // points de combo du niveau
  const afficheSecondesRef = useRef(null); // setter du composant Chrono
  const minuteurLoupeRef = useRef(null);
  const finLoupeRef = useRef(0); // heure de fin de la loupe en cours
  const resteLoupeRef = useRef(0); // ms de loupe restantes après une pause

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

  const majScore = useCallback((valeur) => {
    const s = Math.min(SCORE_MAX_SERVEUR, valeur);
    scoreRef.current = s;
    if (monteRef.current) setScore(s);
  }, []);

  // Annonce (points, combo, bonus) : toujours en haut, dans la bande sous le chrono.
  const ajouterBulle = useCallback((texte, couleur, gros = false) => {
    if (!monteRef.current) return;
    idBulleRef.current += 1;
    const id = idBulleRef.current;
    setBulles((b) => [...b.slice(-2), { id, texte, couleur, gros }]);
  }, []);
  const retirerBulle = useCallback((id) => {
    if (monteRef.current) setBulles((b) => b.filter((x) => x.id !== id));
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
    effacerPartie(JEU, user?.id);
    bruit(scoreRef.current > 0 ? 'perdu' : 'choc');
    finDePartie(JEU, user?.id, res.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setNbParties((n) => n + 1);
      if (r.nouveauRecord) bruit('record');
      setResultat((x) => (x ? { ...x, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [afficherChrono, annulerErreurEnCours, arreterChrono, changerPhase, user?.id]);

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
      toValue: 0, duration: Math.max(0, restantRef.current), easing: Easing.linear, useNativeDriver: true,
    }).start();
    planifierTic();
  }, [planifierTic, progression]);

  const demarrerNiveau = useCallback((n) => {
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
  }, [afficherChrono, annulerErreurEnCours, arreterChrono, changerPhase, demarrerChrono, majCartes, majRetournees]);

  const jouer = useCallback(() => {
    effacerPartie(JEU, user?.id);
    termineRef.current = false;
    aleaRef.current = creerAlea(Date.now());
    pairesTotalRef.current = 0;
    majScore(0);
    if (monteRef.current) {
      setResultat(null);
      setClassementOuvert(false);
    }
    demarrerNiveau(1);
  }, [demarrerNiveau, majScore, user?.id]);

  const finirNiveau = useCallback(() => {
    arreterChrono();
    const n = niveauRef.current;
    const p = paramsRef.current;
    const bonus = bonusNiveau(n, restantRef.current / 1000, erreursRef.current);
    majScore(scoreRef.current + bonus.total);
    vibrer(false);
    bruit('niveau');
    sauverPartie(JEU, user?.id, { niveau: n + 1, score: scoreRef.current, paires: pairesTotalRef.current });
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
        suivant: { niveau: suivant.niveau, paires: suivant.paires, duree: suivant.duree },
      });
    }
    changerPhase('palier');
  }, [arreterChrono, changerPhase, majScore, user?.id]);

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
        ajouterBulle(t('jeuxMemoireMelange'), BRAND, true);
        secousse.setValue(0.94);
        Animated.spring(secousse, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
      }
    }
  }, [ajouterBulle, majCartes, majRetournees, secousse, t]);

  // Loupe : toutes les cartes visibles `duree` ms, le toucher bloqué pendant ce temps.
  const lancerLoupe = useCallback((duree) => {
    verrouRef.current = true;
    if (monteRef.current) setApercu(true);
    finLoupeRef.current = Date.now() + duree;
    minuteurLoupeRef.current = setTimeout(() => {
      minuteurLoupeRef.current = null;
      verrouRef.current = false;
      if (monteRef.current) setApercu(false);
    }, duree);
  }, []);

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
      bruit('carte');
      return;
    }
    const premiere = cartesRef.current.find((c) => c.id === liste[0]);
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
      const nouvelles = cartesRef.current.map((c) => (c.paire === carte.paire ? { ...c, trouvee: true } : c));
      majCartes(nouvelles);
      majRetournees([]);
      vibrer(false);
      bruit(combo >= 2 ? 'booster' : 'ramasse');
      ajouterBulle(`+${gain}`, VERT, combo >= 2);
      const offert = secondesCombo(combo);
      // Une seule annonce pour le combo et ses secondes offertes (la bande n'en garde que 3).
      if (combo >= 2) ajouterBulle(offert > 0 ? `${t('jeuxMemoireCombo', { n: combo })} +${offert} s` : t('jeuxMemoireCombo', { n: combo }), OR, true);
      if (nouvelles.every((c) => c.trouvee)) {
        finirNiveau();
        return;
      }
      // Secondes offertes (combo, sablier) : le chrono repart du nouveau temps, plafonné à la durée du niveau.
      const ajouterSecondes = (s) => {
        arreterChrono();
        restantRef.current = Math.min(paramsRef.current.duree * 1000, restantRef.current + s * 1000);
        afficherChrono();
        demarrerChrono();
      };
      if (offert > 0) ajouterSecondes(offert);
      if (carte.bonus === 'sablier') {
        ajouterSecondes(SECONDES_SABLIER);
        bruit('vie');
        ajouterBulle(t('jeuxMemoireSablier', { n: SECONDES_SABLIER }), BLEU_TEMPS, true);
      } else if (carte.bonus === 'loupe') {
        bruit('bonus');
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
          const apres = nouvelles.map((c) => (c.paire === cible ? { ...c, trouvee: true } : c));
          majCartes(apres);
          bruit('booster');
          ajouterBulle(`${t('jeuxMemoireAimant')} +${points}`, ROSE_AIMANT, true);
          if (apres.every((c) => c.trouvee)) finirNiveau();
        }
      }
      return;
    }
    comboRef.current = 0;
    erreursRef.current += 1;
    verrouRef.current = true;
    vibrer(true);
    bruit('rate');
    minuteurErreurRef.current = setTimeout(recacher, paramsRef.current.delaiErreur);
  }, [afficherChrono, ajouterBulle, arreterChrono, demarrerChrono, finirNiveau, lancerLoupe, majCartes, majRetournees, majScore, recacher, t]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    sauverPartie(JEU, user?.id, { niveau: niveauRef.current, score: scoreRef.current, paires: pairesTotalRef.current });
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
  }, [afficherChrono, arreterChrono, changerPhase, majRetournees, recacher, user?.id]);
  const estEnJeu = useCallback(() => phaseRef.current === 'jeu', []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation, enJeu: phase === 'jeu' || (classementOuvert && phase === 'pause'), estEnJeu, fermerPanneau,
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

  useEffect(() => {
    let vivant = true;
    chargerRecord(JEU, user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); }).catch(() => {});
    return () => { vivant = false; };
  }, [user?.id]);

  useEffect(() => {
    let vivant = true;
    chargerPartie(JEU, user?.id).then((p) => {
      if (vivant && p && (p.score > 0 || p.niveau > 1)) setReprise(p);
    }).catch(() => {});
    return () => { vivant = false; };
  }, [user?.id]);

  const reprendrePartie = useCallback(() => {
    const p = reprise;
    setReprise(null);
    if (!p) return;
    termineRef.current = false;
    aleaRef.current = creerAlea(Date.now());
    pairesTotalRef.current = Number(p.paires) || 0;
    majScore(Number(p.score) || 0);
    setResultat(null);
    demarrerNiveau(Math.max(1, Number(p.niveau) || 1));
  }, [reprise, demarrerNiveau, majScore]);
  const recommencerPartie = useCallback(() => {
    effacerPartie(JEU, user?.id);
    setReprise(null);
  }, [user?.id]);

  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      if (chronoRef.current) clearTimeout(chronoRef.current);
      progression.stopAnimation();
      if (minuteurErreurRef.current) clearTimeout(minuteurErreurRef.current);
      if (minuteurLoupeRef.current) clearTimeout(minuteurLoupeRef.current);
    };
  }, [progression]);

  const surMesure = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    setZone((z) => (z.l === l && z.h === h ? z : { l, h }));
  }, []);

  const surEcran = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    setEcran((z) => (z.l === l && z.h === h ? z : { l, h }));
  }, []);

  // Quitter en cours de partie : le score déjà gagné compte pour le record.
  const quitter = useCallback(() => {
    const p = phaseRef.current;
    pause();
    if ((p === 'pause' || p === 'palier') && !termineRef.current) {
      sauverPartie(JEU, user?.id, { niveau: p === 'palier' ? niveauRef.current + 1 : niveauRef.current, score: scoreRef.current, paires: pairesTotalRef.current });
    }
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
  const pairesTrouvees = cartes.filter((c) => c.trouvee).length / 2;
  const pairesTotal = cartes.length / 2;
  const grilleVisible = phase === 'jeu' || phase === 'palier';
  const grille = useMemo(() => dispositionGrille(cartes.length || 4, zone.l, Math.max(0, zone.h - ECART), ECART), [cartes.length, zone]);
  const largeurGrille = grille.colonnes * grille.largeur + (grille.colonnes - 1) * ECART;

  return (
    <View style={[styles.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]} onLayout={surEcran}>
      {/* Décor lumineux : la ville et le panneau Pearl Streets, sous la grille */}
      <DecorMemoire l={ecran.l} h={ecran.h} bas={insets.bottom} largeurEnseigne={Math.min(104, ecran.l * 0.26)} piedsEnseigne={PIEDS_ENSEIGNE} actif={phase === 'jeu'} />
      <SonJeux jeu={JEU} actif={phase === 'jeu'} />
      {/* Barre du haut : quitter, niveau et score, pause */}
      <View style={styles.haut}>
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <HudJeu
          colors={colors}
          score={score}
          niveauLibelle={t('jeuNiveauCourt', { n: niveau })}
          objets={{ n: pairesTrouvees, total: pairesTotal, icone: 'copy' }}
        />
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

      {/* Rang, record et TOP 1, toujours visibles */}
      <BandeauClassement jeu={JEU} idLivreur={user?.id} score={score} rafraichir={nbParties} t={t} colors={colors} style={{ marginTop: 8 }} />

      {/* Chrono du niveau */}
      <Chrono
        styles={styles}
        progression={progression}
        enregistrer={afficheSecondesRef}
        duree={parametresNiveau(niveau).duree}
        enJeu={enJeu}
      />

      {/* Annonces (points, combo, bonus) : en haut, sous le chrono, jamais sur les cartes */}
      <View pointerEvents="none" style={styles.bulles}>
        {bulles.map((b) => (
          <Bulle key={b.id} id={b.id} texte={b.texte} couleur={b.couleur} gros={b.gros} onFin={retirerBulle} />
        ))}
      </View>

      {/* Cartes (masquées pendant la pause : pas de triche) */}
      <View style={[styles.zone, { marginBottom: Math.max(0, reserveBasVille(largeurEcran) - 4) }]} onLayout={surMesure}>
        {grilleVisible && zone.h > 0 && grille.largeur > 0 && (
          <Animated.View style={[styles.grille, { width: largeurGrille, transform: [{ scale: secousse }] }]}>
            {cartes.map((c, i) => (
              <Carte
                key={c.id}
                carte={c}
                visible={c.trouvee || apercu || retournees.includes(c.id)}
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
            <Ionicons name="eye-off" size={40} color={TEXTE_CLAIR} />
          </View>
        )}
      </View>

      {phase === 'palier' && palier && !classementOuvert && !alerteCourse && <Confettis cle={palier.niveau} l={ecran.l} h={ecran.h} />}
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
                <Text style={styles.texteDiscret}>{t('jeuxMemoireComboRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxMemoireBonusCartes')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} />
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'palier' && palier && (
              <>
                <Etoiles n={palier.etoiles} />
                <Text style={styles.titre}>{t('jeuNiveauReussi', { n: palier.niveau })}</Text>
                {palier.etoiles === 3 && <Text style={styles.record}>{t('jeuxMemoireParfait')}</Text>}
                <View style={styles.lignes}>
                  <Ligne styles={styles} texte={t('jeuxMemoirePaires', { n: palier.paires })} valeur={`+${palier.points}`} />
                  {palier.combo > 0 && <Ligne styles={styles} texte={t('jeuxMemoireBonusCombo')} valeur={`+${palier.combo}`} couleur={OR} />}
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
                <ReglagesSon t={t} colors={colors} />
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
      {phase === 'accueil' && reprise && !classementOuvert && !alerteCourse && (
        <ReprisePartie t={t} colors={colors} niveau={reprise.niveau} score={reprise.score} onReprendre={reprendrePartie} onRecommencer={recommencerPartie} />
      )}
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
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
  const coche = Math.max(16, Math.min(largeur, hauteur) * 0.22);
  const rayon = rayonCarte(largeur, hauteur);

  return (
    <Pressable
      onPressIn={() => onRetourner(carte.id)}
      style={{ width: largeur, height: hauteur, marginRight: marge, marginBottom: ECART }}
      accessibilityRole="button"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pop }] }]}>
        <Animated.View style={[styles.faceCarte, styles.dosCarte, { borderRadius: rayon }, dos]}>
          <DosCarte largeur={largeur} hauteur={hauteur} />
        </Animated.View>
        <Animated.View style={[styles.faceCarte, { borderRadius: rayon, backgroundColor: carte.couleur }, face]}>
          <FaceCarte icone={carte.icone} couleur={carte.couleur} largeur={largeur} hauteur={hauteur} />
          {!!carte.bonus && (
            <View pointerEvents="none" style={[styles.cadreBonus, { borderRadius: rayon }]} />
          )}
          {!!carte.bonus && BONUS[carte.bonus] && (
            <View style={[styles.badgeBonus, { width: coche + 6, height: coche + 6, borderRadius: (coche + 6) / 2 }]}>
              <Ionicons name={BONUS[carte.bonus].icone} size={coche * 0.7} color="#fff" />
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
const Chrono = memo(function Chrono({ styles, progression, enregistrer, duree, enJeu }) {
  const [secondes, setSecondes] = useState(duree);
  useEffect(() => {
    enregistrer.current = (s) => setSecondes((x) => (x === s ? x : s));
    return () => { enregistrer.current = null; };
  }, [enregistrer]);
  const pressee = secondes <= Math.max(3, Math.ceil(duree * 0.25));
  return (
    <View style={styles.chrono}>
      <Ionicons name="time" size={18} color={pressee && enJeu ? ROUGE : TEXTE_CLAIR} />
      <View style={styles.barreFond}>
        <Animated.View style={[styles.barre, { backgroundColor: pressee ? ROUGE : BRAND, transform: [{ scaleX: progression }] }]} />
      </View>
      <Text style={[styles.chronoTexte, pressee && enJeu && { color: ROUGE }]}>{secondes}</Text>
    </View>
  );
});

// Annonce de la bande du haut : jaillit, grossit puis s'efface sur place (pilote natif).
function Bulle({ id, texte, couleur, gros, onFin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: gros ? 1400 : 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onFin(id));
  }, [gros, id, onFin, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [4, -3] });
  const scale = v.interpolate({ inputRange: [0, 0.18, 0.32, 1], outputRange: [0.5, gros ? 1.2 : 1.12, 1, 1] });
  const opacity = v.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[styles2.bulle, gros && styles2.bulleGrosse, { color: couleur, opacity, transform: [{ translateY }, { scale }] }]}
    >
      {texte}
    </Animated.Text>
  );
}

// Étoiles du niveau gagné : apparaissent l'une après l'autre.
function Etoiles({ n }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(180, vals.map((v) => Animated.spring(v, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }))).start();
  }, [vals]);
  return (
    <View style={styles2.etoiles}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ transform: [{ scale: v }, { translateY: i === 1 ? -8 : 0 }] }}>
          <Ionicons name={i < n ? 'star' : 'star-outline'} size={i === 1 ? 46 : 36} color={i < n ? OR : '#C8D1DC'} />
        </Animated.View>
      ))}
    </View>
  );
}

// Confettis du niveau gagné : une seule animation native, jouée une fois.
const COULEURS_CONFETTIS = [OR, VERT, '#FF6A13', '#1E88E5', '#E63946', '#8E44AD'];
const NB_CONFETTIS = 22;
const Confettis = memo(function Confettis({ cle, l, h }) {
  const v = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: NB_CONFETTIS }, (_, i) => {
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
  }), [l, h]);
  useEffect(() => {
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [cle, v]);
  if (!l || !h) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 5 }]}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[styles2.confetti, p.rond && styles2.confettiRond, {
            left: l / 2 - 5,
            top: h * 0.34,
            backgroundColor: p.couleur,
            opacity: v.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.dy, p.dy + p.chute] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.tour] }) },
            ],
          }]}
        />
      ))}
    </View>
  );
});

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
    flexShrink: 1, textAlign: 'center', fontSize: 17, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  bulleGrosse: { fontSize: 19 },
  etoiles: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  confetti: { position: 'absolute', width: 10, height: 14, borderRadius: 2 },
  confettiRond: { width: 10, height: 10, borderRadius: 5 },
});

const makeStyles = (c, dark) => StyleSheet.create({
  ecran: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  chrono: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  barreFond: { flex: 1, height: 10, borderRadius: 5, backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  barre: { width: '100%', height: '100%', borderRadius: 5, transformOrigin: 'left' },
  chronoTexte: { color: TEXTE_CLAIR, fontWeight: '800', fontSize: 15, minWidth: 26, textAlign: 'right' },
  zone: { flex: 1, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  cache: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  bulles: { height: 30, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden' },
  faceCarte: {
    ...StyleSheet.absoluteFillObject, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden',
    shadowColor: '#000', shadowOpacity: dark ? 0.4 : 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  dosCarte: { backgroundColor: '#16223F' },
  coche: { position: 'absolute', top: 6, right: 6 },
  cadreBonus: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: OR },
  badgeBonus: {
    position: 'absolute', top: 5, left: 5, backgroundColor: OR, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
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
