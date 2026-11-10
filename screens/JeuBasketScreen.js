/**
 * Mini-jeu « Tir parfait », pour patienter entre deux courses.
 *
 * Le livreur glisse le doigt vers le haut depuis le ballon : la direction du
 * glissement vise, sa longueur donne la force. Le ballon suit une parabole en
 * pseudo 3D, rebondit sur le cercle et la planche. Ballons illimités, 30 s par
 * niveau : il faut marquer l'objectif de paniers pour passer au niveau
 * suivant, sinon la partie s'arrête. Niveaux sans fin (utils/jeuBasket.js,
 * reglagesNiveau) : 1 à 3 le panier recule, 4 à 6 il bouge de gauche à
 * droite, 7 et plus vent (flèche et force) et panier plus rapide.
 * « Parfait ! » (panier sans toucher cercle ni planche) : 3 points au lieu de
 * 2, multiplicateur x2 à x5 pour les parfaits d'affilée, +2 s ; dès 3
 * parfaits d'affilée, ballon en feu (traînée orange).
 *
 * Batterie : aucune boucle quand rien ne bouge. requestAnimationFrame
 * seulement pendant le vol du ballon (dessin par Animated.Value.setValue,
 * aucun rendu React à chaque image) ; panier mobile, filet, mentions et
 * bulles par le pilote natif ; chrono : une minuterie de 500 ms qui ne
 * redessine que son propre composant, et seulement quand la seconde change.
 * Pause automatique (hooks/usePauseJeu.js) : arrière-plan, écran quitté,
 * flèche retour pendant la partie, nouvelle course (components/AlerteCourseJeu.js).
 * Son : musique propre au jeu et bruitages (components/SonJeux.js). Partie
 * sauvegardée à la pause et à chaque niveau réussi, reprise possible.
 * Décor toujours clair : salle de sport, planche avec le petit logo Pearl Streets.
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
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import { EnseignePearl } from '../components/FondJeu';
import {
  BanniereRecompense, EtoilesFin, creerSuivi, suivreScore, etoilesPour, formaterNombre,
} from '../components/RecompensesJeu';
import SonJeux, { bruit } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import BandeauClassement from '../components/BandeauClassement';
import ReprisePartie from '../components/ReprisePartie';
import HudJeu from '../components/HudJeu';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  RAYON_CERCLE, HAUTEUR_CERCLE, RETRAIT_PLANCHE, PLANCHE_L, PLANCHE_BAS, PLANCHE_HAUT,
  BONUS_PARFAIT_S, POINTS_PARFAIT, MULTI_MAX, PALIERS, DUREE_NIVEAU,
  projeter, diametreBalle, reglagesNiveau, xPanier, tirDepuisGeste, creerBalle, lancer, pasPhysique,
  couche as coucheBalle, multiplicateur, creerPartie, enregistrerTir, niveauReussi, passerNiveau,
  etatSauvegarde, partieReprise,
} from '../utils/jeuBasket';

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
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'basket';
const OR = '#F2B705';
const ROUGE = '#E74C3C';
const ORANGE = '#E67E22';
const FEU = '#FF7A1A';
const TEXTE_TERRAIN = '#1D2A3A'; // texte posé sur le terrain, toujours clair
// Salle de sport claire, quel que soit le thème.
const DECOR = {
  mur: '#EAF2F8', murBas: '#DCE8F1', parquet: '#F2D3A0', latte: '#E6C38A', ligne: '#FFFFFF',
  planche: '#FFFFFF', bordPlanche: '#B8C4D0', cible: '#E4572E', poteau: '#7D8A99', cercle: '#E4572E', filet: '#FFFFFF',
};
const IMAGE_MIN_MS = 15; // plafond d'environ 60 images par seconde (écrans 90 et 120 Hz)
const ZONE_GESTE = 0.6; // le glissement part du bas de l'écran (sous 60 % de la hauteur)
const NB_TRAINEE = 5;
const Z_PLAN = { derriere: 1, milieu: 3, devant: 5 }; // plan du ballon autour du panier (fond 2, avant 4)
const RATIO_CERCLE = 0.32; // aplatissement du cercle vu d'un peu au-dessus
const ECHANTILLONS = 25; // sinus échantillonné pour le déplacement natif du panier

export default function JeuBasketScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [phase, setPhase] = useState('accueil'); // accueil, jeu, pause, reprise, palier, fin
  const phaseRef = useRef('accueil');
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [niveau, setNiveau] = useState(1);
  const [score, setScore] = useState(0);
  const [paniersNiveau, setPaniersNiveau] = useState(0);
  const [serie, setSerie] = useState(0);
  const [plan, setPlan] = useState('devant'); // plan du ballon : derriere, milieu, devant
  const [mention, setMention] = useState(null); // { id, texte, couleur }
  const [bulles, setBulles] = useState([]);
  const [meilleur, setMeilleur] = useState(0);
  const [resultat, setResultat] = useState(null);
  const [palier, setPalier] = useState(null); // { niveau, paniers, objectif, suivant }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [reprise, setReprise] = useState(null);
  const [nbParties, setNbParties] = useState(0);

  const partieRef = useRef(creerPartie(1));
  const reglagesRef = useRef(reglagesNiveau(1));
  const balleRef = useRef(creerBalle());
  const tailleRef = useRef({ l: 0, h: 0 });
  const planRef = useRef('devant');
  const rafRef = useRef(null);
  const dernierTsRef = useRef(null);
  const actifRef = useRef(false);
  const monteRef = useRef(true);
  const termineRef = useRef(false);
  const gesteRef = useRef(null); // { x, y } du doigt posé
  const restantRef = useRef(DUREE_NIVEAU * 1000); // ms, chrono arrêté
  const finChronoRef = useRef(null); // échéance Date.now() quand le chrono tourne
  const minuterieRef = useRef(null);
  const tempsEcouleRef = useRef(false); // sonnerie pendant un tir en l'air : on attend qu'il retombe
  const afficheSecondesRef = useRef(null);
  const mouvRef = useRef({ p0: 0, t0: 0, actif: false }); // phase du panier mobile (0 à 1)
  const banniereRef = useRef(null);
  const suiviRef = useRef(null);
  const idEffetRef = useRef(0);
  const historiqueRef = useRef([]); // dernières positions écran du ballon (traînée de feu)
  const meilleurRef = useRef(0);
  meilleurRef.current = meilleur;

  const balle = useRef({
    x: new Animated.Value(0), y: new Animated.Value(0), s: new Animated.Value(1), rot: new Animated.Value(0),
  }).current;
  const trainee = useRef(Array.from({ length: NB_TRAINEE }, () => ({
    x: new Animated.Value(-1000), y: new Animated.Value(-1000), s: new Animated.Value(0.5),
  }))).current;
  const phasePanier = useRef(new Animated.Value(0)).current;
  const filet = useRef(new Animated.Value(0)).current;

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  // ---- Panier mobile : pilote natif, phase recalculée côté JS au besoin ----
  const phaseActuelle = useCallback(() => {
    const m = mouvRef.current;
    const P = reglagesRef.current.periode * 1000;
    if (!m.actif || !P) return m.p0;
    return (m.p0 + (Date.now() - m.t0) / P) % 1;
  }, []);
  const hxActuel = useCallback(() => xPanier(reglagesRef.current, phaseActuelle()), [phaseActuelle]);

  const lancerMouvement = useCallback((p0) => {
    const r = reglagesRef.current;
    if (!r.amplitude || !r.periode) return;
    mouvRef.current = { p0, t0: Date.now(), actif: true };
    phasePanier.setValue(p0);
    Animated.timing(phasePanier, {
      toValue: 1, duration: Math.max(1, (1 - p0) * r.periode * 1000), easing: Easing.linear, useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && mouvRef.current.actif && monteRef.current) lancerMouvement(0);
    });
  }, [phasePanier]);

  const arreterMouvement = useCallback(() => {
    const p = phaseActuelle();
    mouvRef.current = { p0: p, t0: 0, actif: false };
    phasePanier.stopAnimation();
    phasePanier.setValue(p);
  }, [phaseActuelle, phasePanier]);

  // ---- Chrono ----
  const restantMs = useCallback(() => (
    finChronoRef.current != null ? Math.max(0, finChronoRef.current - Date.now()) : restantRef.current
  ), []);
  const afficherChrono = useCallback(() => {
    afficheSecondesRef.current?.(Math.ceil(restantMs() / 1000));
  }, [restantMs]);
  const arreterChrono = useCallback(() => {
    if (minuterieRef.current) clearInterval(minuterieRef.current);
    minuterieRef.current = null;
    if (finChronoRef.current != null) restantRef.current = Math.max(0, finChronoRef.current - Date.now());
    finChronoRef.current = null;
    afficherChrono();
  }, [afficherChrono]);

  // ---- Dessin du ballon (appelé par la boucle de vol seulement) ----
  const dessinerBalle = useCallback(() => {
    const { l, h } = tailleRef.current;
    if (!h) return;
    const b = balleRef.current;
    const base = diametreBalle(0, h);
    const p = projeter(b.x, b.y, b.z, l, h);
    const s = diametreBalle(b.z, h) / base;
    balle.x.setValue(p.x);
    balle.y.setValue(p.y);
    balle.s.setValue(s);
    balle.rot.setValue(-b.t * 540);
    const enFeu = partieRef.current.serie >= 3;
    if (enFeu) {
      const hist = historiqueRef.current;
      hist.unshift({ x: p.x, y: p.y, s });
      if (hist.length > NB_TRAINEE * 2 + 1) hist.pop();
      for (let i = 0; i < NB_TRAINEE; i += 1) {
        const q = hist[(i + 1) * 2] || hist[hist.length - 1];
        trainee[i].x.setValue(q.x);
        trainee[i].y.setValue(q.y);
        trainee[i].s.setValue(q.s * (1 - (i + 1) * 0.13));
      }
    }
    const c = coucheBalle(b, hxActuel(), reglagesRef.current.distance);
    if (c !== planRef.current) {
      planRef.current = c;
      if (monteRef.current) setPlan(c);
    }
  }, [balle, hxActuel, trainee]);

  const replacerBalle = useCallback(() => {
    balleRef.current = creerBalle();
    historiqueRef.current = [];
    for (const q of trainee) { q.x.setValue(-1000); q.y.setValue(-1000); }
    dessinerBalle();
  }, [dessinerBalle, trainee]);

  const arreterBoucle = useCallback(() => {
    actifRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dernierTsRef.current = null;
  }, []);

  // ---- Effets ----
  const ajouterBulle = useCallback((texte, couleur, x, y) => {
    if (!monteRef.current) return;
    idEffetRef.current += 1;
    const id = idEffetRef.current;
    setBulles((b) => [...b.slice(-3), { id, texte, couleur, x, y }]);
  }, []);
  const retirerBulle = useCallback((id) => {
    if (monteRef.current) setBulles((b) => b.filter((x) => x.id !== id));
  }, []);
  const montrerMention = useCallback((texte, couleur) => {
    if (!monteRef.current) return;
    idEffetRef.current += 1;
    setMention({ id: idEffetRef.current, texte, couleur });
  }, []);
  const finMention = useCallback(() => { if (monteRef.current) setMention(null); }, []);

  // ---- Fin de partie ----
  const terminer = useCallback(() => {
    if (termineRef.current) return;
    termineRef.current = true;
    arreterBoucle();
    arreterChrono();
    arreterMouvement();
    const p = partieRef.current;
    const res = {
      score: p.score, paniers: p.paniers, parfaits: p.parfaits, serie: p.meilleureSerie, niveau: p.niveau,
      paniersNiveau: p.paniersNiveau, objectif: reglagesRef.current.objectif, nouveauRecord: false,
    };
    res.etoiles = etoilesPour(res.score, meilleurRef.current, PALIERS);
    banniereRef.current?.cacher();
    if (monteRef.current) setResultat(res);
    changerPhase('fin');
    effacerPartie(JEU, user?.id); // jamais de reprise après une partie perdue
    bruit('perdu');
    finDePartie(JEU, user?.id, res.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setNbParties((n) => n + 1);
      if (r.nouveauRecord) bruit('record');
      setResultat((x) => (x ? { ...x, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [arreterBoucle, arreterChrono, arreterMouvement, changerPhase, user?.id]);

  // Sonnerie : objectif atteint = niveau réussi, sinon fin de partie.
  const finNiveau = useCallback(() => {
    tempsEcouleRef.current = false;
    arreterChrono();
    arreterMouvement();
    const p = partieRef.current;
    bruit('sifflet');
    if (!niveauReussi(p)) {
      terminer();
      return;
    }
    const fait = { niveau: p.niveau, paniers: p.paniersNiveau, objectif: reglagesRef.current.objectif };
    passerNiveau(p);
    sauverPartie(JEU, user?.id, etatSauvegarde(p, 0));
    bruit('niveau');
    vibrer(true);
    if (monteRef.current) setPalier({ ...fait, suivant: reglagesNiveau(p.niveau) });
    changerPhase('palier');
  }, [arreterChrono, arreterMouvement, changerPhase, terminer, user?.id]);

  const tic = useCallback(() => {
    afficherChrono();
    if (finChronoRef.current == null || finChronoRef.current > Date.now()) return;
    restantRef.current = 0;
    if (minuterieRef.current) clearInterval(minuterieRef.current);
    minuterieRef.current = null;
    finChronoRef.current = null;
    if (balleRef.current.etat === 'vol') tempsEcouleRef.current = true; // le tir en l'air compte encore
    else finNiveau();
  }, [afficherChrono, finNiveau]);
  const ticRef = useRef(tic);
  ticRef.current = tic;

  const demarrerChrono = useCallback(() => {
    if (minuterieRef.current || tempsEcouleRef.current) return;
    finChronoRef.current = Date.now() + restantRef.current;
    minuterieRef.current = setInterval(() => ticRef.current(), 500);
    afficherChrono();
  }, [afficherChrono]);

  // ---- Tir terminé ----
  const finTir = useCallback((issue) => {
    const p = partieRef.current;
    const r = enregistrerTir(p, issue);
    const { l, h } = tailleRef.current;
    const hx = hxActuel();
    const pc = projeter(hx, HAUTEUR_CERCLE, reglagesRef.current.distance, l, h);
    if (issue === 'parfait') {
      vibrer(false);
      bruit(r.feu ? 'bonus' : 'vie');
      montrerMention(r.multiplicateur > 1 ? `${t('jeuxBasketParfait')} x${r.multiplicateur}` : t('jeuxBasketParfait'), OR);
      ajouterBulle(`+${r.points}`, OR, pc.x, pc.y - 40);
      let bonusApplique = true;
      if (finChronoRef.current != null) finChronoRef.current += r.bonusTemps * 1000;
      else if (!tempsEcouleRef.current) restantRef.current += r.bonusTemps * 1000;
      else bonusApplique = false; // sonnerie déjà passée : aucun temps ajouté
      if (bonusApplique) ajouterBulle(t('jeuxBasketBonusTemps', { n: r.bonusTemps }), BRAND, l - 70, insets.top + 150);
      if (r.serie === 3) {
        bruit('booster');
        banniereRef.current?.montrer({ texte: t('jeuxBasketEnFeu'), icone: 'flame', couleur: FEU });
      }
    } else if (issue === 'panier') {
      bruit('ok');
      ajouterBulle(`+${r.points}`, BRAND, pc.x, pc.y - 40);
    } else {
      bruit('rate');
    }
    if (monteRef.current) {
      setScore(p.score);
      setPaniersNiveau(p.paniersNiveau);
      setSerie(p.serie);
      if (r.points > 0) {
        const annonce = suivreScore(suiviRef.current, p.score);
        if (annonce?.type === 'record') {
          bruit('record');
          banniereRef.current?.montrer({ texte: t('jeuRecompRecord'), icone: 'trophy', couleur: OR });
        } else if (annonce) {
          banniereRef.current?.montrer({ texte: t('jeuRecompPalier', { n: formaterNombre(annonce.n) }), icone: 'star', couleur: OR });
        }
      }
    }
  }, [ajouterBulle, hxActuel, insets.top, montrerMention, t]);

  const traiter = useCallback((evenements) => {
    for (const e of evenements) {
      if (e.type === 'cercle' || e.type === 'planche') {
        if (e.type === 'planche' || e.force > 0.8) bruit('rebond');
      } else if (e.type === 'sol') {
        if (e.force > 2) bruit('rebond');
      } else if (e.type === 'panier') {
        filet.setValue(0);
        Animated.sequence([
          Animated.timing(filet, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(filet, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start();
        finTir(e.parfait ? 'parfait' : 'panier');
      } else if (e.type === 'rate') {
        finTir('rate');
      } else if (e.type === 'fini') {
        arreterBoucle();
        replacerBalle();
        if (tempsEcouleRef.current) finNiveau();
      }
    }
  }, [arreterBoucle, filet, finNiveau, finTir, replacerBalle]);

  // ---- Boucle de vol : tourne seulement quand le ballon est en l'air ----
  const boucleRef = useRef(null);
  boucleRef.current = (ts) => {
    rafRef.current = null;
    if (!actifRef.current) return;
    if (dernierTsRef.current != null && ts - dernierTsRef.current < IMAGE_MIN_MS) {
      rafRef.current = requestAnimationFrame((x) => boucleRef.current(x));
      return;
    }
    const dt = dernierTsRef.current == null ? 1 / 60 : (ts - dernierTsRef.current) / 1000;
    dernierTsRef.current = ts;
    const ev = pasPhysique(balleRef.current, dt, { reglages: reglagesRef.current, hx: hxActuel() });
    if (balleRef.current.etat === 'vol') dessinerBalle();
    if (ev.length) traiter(ev);
    if (actifRef.current) rafRef.current = requestAnimationFrame((x) => boucleRef.current(x));
  };
  const demarrerBoucle = useCallback(() => {
    if (rafRef.current != null || balleRef.current.etat !== 'vol') return;
    actifRef.current = true;
    dernierTsRef.current = null;
    rafRef.current = requestAnimationFrame((x) => boucleRef.current(x));
  }, []);

  // Tout ce qui bouge repart : chrono, panier mobile, ballon en l'air.
  const relancer = useCallback(() => {
    changerPhase('jeu');
    demarrerChrono();
    lancerMouvement(mouvRef.current.p0);
    demarrerBoucle();
  }, [changerPhase, demarrerBoucle, demarrerChrono, lancerMouvement]);

  // ---- Niveaux et parties ----
  const preparerNiveau = useCallback((tempsMs) => {
    const p = partieRef.current;
    reglagesRef.current = reglagesNiveau(p.niveau);
    restantRef.current = tempsMs ?? reglagesRef.current.duree * 1000;
    finChronoRef.current = null;
    tempsEcouleRef.current = false;
    mouvRef.current = { p0: 0, t0: 0, actif: false };
    phasePanier.setValue(0);
    planRef.current = 'devant';
    setPlan('devant');
    replacerBalle();
    setNiveau(p.niveau);
    setPaniersNiveau(p.paniersNiveau);
    setSerie(p.serie);
    setScore(p.score);
    afficherChrono();
  }, [afficherChrono, phasePanier, replacerBalle]);

  const demarrer = useCallback((etat) => {
    if (!tailleRef.current.h) return;
    arreterBoucle();
    arreterChrono();
    arreterMouvement();
    termineRef.current = false;
    let tempsMs;
    if (etat) {
      const r = partieReprise(etat);
      partieRef.current = r.partie;
      tempsMs = r.tempsRestant;
    } else {
      effacerPartie(JEU, user?.id);
      partieRef.current = creerPartie(1);
    }
    preparerNiveau(tempsMs);
    suiviRef.current = creerSuivi(PALIERS, meilleurRef.current, partieRef.current.score);
    banniereRef.current?.cacher();
    setResultat(null);
    setPalier(null);
    setBulles([]);
    setMention(null);
    setClassementOuvert(false);
    if (etat) changerPhase('reprise');
    else relancer();
  }, [arreterBoucle, arreterChrono, arreterMouvement, changerPhase, preparerNiveau, relancer, user?.id]);
  const jouer = useCallback(() => demarrer(null), [demarrer]);

  const niveauSuivant = useCallback(() => {
    if (phaseRef.current !== 'palier') return;
    setPalier(null);
    preparerNiveau();
    relancer();
  }, [preparerNiveau, relancer]);

  const reprendrePartie = useCallback(() => {
    const p = reprise;
    setReprise(null);
    if (p) demarrer(p);
  }, [demarrer, reprise]);
  const recommencerPartie = useCallback(() => {
    effacerPartie(JEU, user?.id);
    setReprise(null);
  }, [user?.id]);

  // ---- Doigt ----
  const doigtPose = useCallback((ev) => {
    const { locationX, locationY } = ev.nativeEvent;
    if (phaseRef.current === 'reprise') relancer();
    if (phaseRef.current !== 'jeu' || balleRef.current.etat !== 'repos') {
      gesteRef.current = null;
      return;
    }
    gesteRef.current = locationY >= tailleRef.current.h * ZONE_GESTE ? { x: locationX, y: locationY } : null;
  }, [relancer]);

  const doigtLeve = useCallback((ev) => {
    const debut = gesteRef.current;
    gesteRef.current = null;
    const { h } = tailleRef.current;
    if (!debut || !h || phaseRef.current !== 'jeu' || balleRef.current.etat !== 'repos') return;
    const { locationX, locationY } = ev.nativeEvent;
    const v = tirDepuisGeste({ dx: (locationX - debut.x) / h, dy: (locationY - debut.y) / h }, reglagesRef.current, hxActuel());
    if (!v) return;
    lancer(balleRef.current, v);
    bruit('saut');
    demarrerBoucle();
  }, [demarrerBoucle, hxActuel]);
  const doigtAnnule = useCallback(() => { gesteRef.current = null; }, []);

  // ---- Pause ----
  const pause = useCallback(() => {
    const p = phaseRef.current;
    if (p !== 'jeu' && p !== 'reprise') return;
    arreterBoucle();
    arreterChrono();
    arreterMouvement();
    gesteRef.current = null;
    // Sonnerie déjà passée (tir en l'air) : 1 ms, sinon la reprise lirait 0 comme un temps plein.
    const restant = tempsEcouleRef.current ? Math.max(1, restantRef.current) : restantRef.current;
    sauverPartie(JEU, user?.id, etatSauvegarde(partieRef.current, restant));
    changerPhase('pause');
  }, [arreterBoucle, arreterChrono, arreterMouvement, changerPhase, user?.id]);
  const enJeu = phase === 'jeu' || phase === 'reprise';
  const estEnJeu = useCallback(() => phaseRef.current === 'jeu' || phaseRef.current === 'reprise', []);
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation, enJeu: enJeu || (classementOuvert && phase === 'pause'), estEnJeu, fermerPanneau,
  });

  // Reprise : tout reste figé jusqu'au prochain toucher.
  const reprendre = useCallback(() => changerPhase('reprise'), [changerPhase]);

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

  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      actifRef.current = false;
      mouvRef.current.actif = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (minuterieRef.current) clearInterval(minuterieRef.current);
      phasePanier.stopAnimation();
    };
  }, [phasePanier]);

  const surMesure = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    const l = Math.round(width);
    const h = Math.round(height);
    if (!h || (l === tailleRef.current.l && h === tailleRef.current.h)) return;
    tailleRef.current = { l, h };
    setTaille({ l, h });
    dessinerBalle();
  }, [dessinerBalle]);

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

  const avantClassement = useCallback(() => envoyerRecordEnAttente(JEU, user?.id), [user?.id]);

  const reg = useMemo(() => reglagesNiveau(niveau), [niveau]);
  const mult = multiplicateur(serie);
  const enFeu = serie >= 3;
  const diamBase = taille.h ? diametreBalle(0, taille.h) : 0;
  const premierTir = niveau === 1 && partieRef.current.tirs === 0;

  const ballon = diamBase > 0 ? <Ballon a={balle} d={diamBase} feu={enFeu} /> : null;

  return (
    <View style={[styles.ecran, { backgroundColor: DECOR.mur }]}>
      <SonJeux jeu={JEU} actif={phase === 'jeu'} />
      <View
        style={[styles.monde, { marginBottom: insets.bottom }]}
        onLayout={surMesure}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={doigtPose}
        onResponderRelease={doigtLeve}
        onResponderTerminate={doigtAnnule}
      >
        {taille.h > 0 && (
          <>
            <Salle l={taille.l} h={taille.h} distance={reg.distance} />
            {/* Profondeur par zIndex : un seul ballon monté, sa traînée dans le même plan que lui */}
            <View pointerEvents="none" collapsable={false} style={StyleSheet.absoluteFill}>
              <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>
                <Panier l={taille.l} h={taille.h} reglages={reg} phase={phasePanier} filet={filet} partie="fond" />
              </View>
              <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFill, { zIndex: 4 }]}>
                <Panier l={taille.l} h={taille.h} reglages={reg} phase={phasePanier} filet={filet} partie="avant" />
              </View>
              <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFill, { zIndex: Z_PLAN[plan] }]}>
                {enFeu && trainee.map((q, i) => (
                  <Animated.View
                    key={i}
                    pointerEvents="none"
                    style={[styles2.trainee, {
                      left: -diamBase / 2, top: -diamBase / 2, width: diamBase, height: diamBase, borderRadius: diamBase / 2,
                      opacity: 0.5 - i * 0.08, transform: [{ translateX: q.x }, { translateY: q.y }, { scale: q.s }],
                    }]}
                  />
                ))}
                {ballon}
              </View>
            </View>

            {premierTir && phase === 'jeu' && (
              <View pointerEvents="none" style={[styles.consigne, { top: taille.h * 0.62 }]}>
                <MaterialCommunityIcons name="gesture-swipe-up" size={34} color={TEXTE_TERRAIN} />
              </View>
            )}
            {bulles.map((b) => (
              <Bulle key={b.id} id={b.id} x={b.x} y={b.y} texte={b.texte} couleur={b.couleur} onFin={retirerBulle} />
            ))}
            {mention && <Mention key={mention.id} texte={mention.texte} couleur={mention.couleur} haut={taille.h * 0.18} onFin={finMention} />}
            <BanniereRecompense ref={banniereRef} haut={taille.h * 0.3} />

            {phase === 'reprise' && (
              <View pointerEvents="none" style={[styles.consigne, { top: taille.h * 0.5 }]}>
                <MaterialCommunityIcons name="gesture-tap" size={34} color={TEXTE_TERRAIN} />
                <Text style={styles.consigneTexte}>{t('jeuxBasketToucherReprendre')}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Haut : quitter, score et paniers, pause, chrono, vent et multiplicateur, classement */}
      <View pointerEvents="box-none" style={[styles.haut, { top: insets.top + 8 }]}>
        <View pointerEvents="box-none" style={styles.rangeeHaut}>
          <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View pointerEvents="none" style={styles.centreHaut}>
            <HudJeu
              colors={colors}
              score={score}
              niveauLibelle={t('jeuNiveauCourt', { n: niveau })}
              objets={{ n: paniersNiveau, total: reg.objectif, icone: 'basketball', libelle: t('jeuxBasketPaniers') }}
            />
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
        <View pointerEvents="none" style={styles.rangeeInfos}>
          <Chrono enregistrer={afficheSecondesRef} styles={styles} />
          {reg.ventForce > 0 && (
            <View style={styles.pastille}>
              <MaterialCommunityIcons name="weather-windy" size={16} color={TEXTE_TERRAIN} />
              <Ionicons name={reg.ventSens > 0 ? 'arrow-forward' : 'arrow-back'} size={18} color={TEXTE_TERRAIN} />
              <Text style={styles.pastilleTexte}>{t('jeuxBasketVent')} {reg.ventForce}</Text>
            </View>
          )}
          {mult > 1 && (
            <View style={[styles.pastille, { backgroundColor: enFeu ? FEU : OR, borderColor: enFeu ? FEU : OR }]}>
              <Ionicons name={enFeu ? 'flame' : 'star'} size={15} color="#fff" />
              <Text style={[styles.pastilleTexte, { color: '#fff' }]}>x{mult}</Text>
            </View>
          )}
        </View>
        <BandeauClassement jeu={JEU} idLivreur={user?.id} score={score} rafraichir={nbParties} t={t} colors={colors} style={{ marginTop: 8 }} />
      </View>

      {/* Fenêtres : accueil, pause, niveau réussi, fin */}
      {(phase === 'accueil' || phase === 'pause' || phase === 'palier' || phase === 'fin') && !classementOuvert && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {phase === 'accueil' && (
              <>
                <Ionicons name="basketball" size={46} color={ORANGE} />
                <Text style={styles.titre}>{t('jeuxBasketTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxBasketRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxBasketObjectifRegle', { n: reglagesNiveau(1).objectif, s: DUREE_NIVEAU })}</Text>
                <View style={styles.ligneIcone}>
                  <Ionicons name="star" size={18} color={OR} />
                  <Text style={[styles.texteDiscret, styles.texteLigne]}>
                    {t('jeuxBasketParfaitRegle', { p: POINTS_PARFAIT, m: MULTI_MAX, b: BONUS_PARFAIT_S })}
                  </Text>
                </View>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} compact />
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
                <Text style={styles.texteDiscret}>{t('jeuNiveauCourt', { n: niveau })}</Text>
                <ReglagesSon t={t} colors={colors} compact />
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton styles={styles} secondaire texte={t('jeuxBasketRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'palier' && palier && (
              <>
                <MaterialCommunityIcons name="trophy-variant" size={46} color={OR} />
                <Text style={styles.titre}>{t('jeuNiveauReussi', { n: palier.niveau })}</Text>
                <Text style={styles.texte}>{t('jeuxBasketFinTexte', { n: palier.paniers, m: palier.objectif })}</Text>
                <Text style={styles.texte}>{t('jeuScore', { n: score })}</Text>
                <Text style={styles.texteDiscret}>
                  {t('jeuxBasketProchain', { n: palier.suivant.niveau, o: palier.suivant.objectif, s: palier.suivant.duree })}
                </Text>
                {!!astuceNiveau(palier.suivant) && <Text style={styles.astuce}>{t(astuceNiveau(palier.suivant))}</Text>}
                <Bouton styles={styles} texte={t('jeuNiveauSuivant')} onPress={niveauSuivant} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'fin' && (
              <>
                {resultat?.nouveauRecord
                  ? <MaterialCommunityIcons name="trophy" size={46} color={OR} />
                  : <Ionicons name="timer-outline" size={44} color={ROUGE} />}
                <Text style={styles.titre}>{t('jeuxBasketFinTemps')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxBasketFinTexte', { n: resultat?.paniersNiveau ?? 0, m: resultat?.objectif ?? 0 })}</Text>
                {resultat?.nouveauRecord && <Text style={styles.record}>{t('jeuxBasketNouveauRecord')}</Text>}
                <EtoilesFin n={resultat?.etoiles ?? 0} t={t} colors={colors} />
                <Text style={styles.scoreFin}>{resultat?.score ?? score}</Text>
                <View style={styles.stats}>
                  <Stat icone="basketball" n={resultat?.paniers ?? 0} styles={styles} couleur={ORANGE} />
                  <Stat icone="star" n={resultat?.parfaits ?? 0} styles={styles} couleur={OR} />
                  <Stat icone="fire" n={`x${multiplicateur(resultat?.serie ?? 0)}`} styles={styles} couleur={FEU} />
                  <Stat icone="layers-triple" n={resultat?.niveau ?? 1} styles={styles} />
                </View>
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuxBasketRejouer')} onPress={jouer} />
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

// Ce qui change au niveau suivant (fenêtre « Niveau réussi »).
function astuceNiveau(r) {
  if (r.ventForce > 0) return 'jeuxBasketAvecVent';
  if (r.amplitude > 0) return 'jeuxBasketMouvant';
  if (r.niveau > 1) return 'jeuxBasketPlusLoin';
  return '';
}

// Salle claire : mur, parquet en perspective, ligne de fond. Redessinée seulement au changement de niveau.
const Salle = memo(function Salle({ l, h, distance }) {
  const fond = projeter(0, 0, distance + 2.2, l, h).y;
  const lattes = [];
  for (let z = distance + 1.6; z > -0.6; z -= 0.9) lattes.push(projeter(0, 0, z, l, h).y);
  const raquette = projeter(0, 0, distance - 1.2, l, h).y;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles2.bandeMur, { top: fond - h * 0.12, height: h * 0.12 }]} />
      <View style={[styles2.parquet, { top: fond }]} />
      {lattes.map((y, i) => <View key={i} style={[styles2.latte, { top: y }]} />)}
      <View style={[styles2.ligneFond, { top: fond }]} />
      <View style={[styles2.ligneFond, { top: raquette, left: l * 0.18, right: l * 0.18 }]} />
    </View>
  );
});

// Panier : « fond » = poteau, planche, demi-cercle arrière ; « avant » = filet et demi-cercle avant.
// Un seul déplacement latéral, par le pilote natif, pour les deux moitiés.
const Panier = memo(function Panier({ l, h, reglages, phase, filet, partie }) {
  const D = reglages.distance;
  const pc = projeter(0, HAUTEUR_CERCLE, D, l, h);
  const s = pc.s;
  const translateX = useMemo(() => {
    if (!reglages.amplitude) return 0;
    const entree = [];
    const sortie = [];
    for (let i = 0; i <= ECHANTILLONS; i += 1) {
      entree.push(i / ECHANTILLONS);
      sortie.push(xPanier(reglages, i / ECHANTILLONS) * s);
    }
    return phase.interpolate({ inputRange: entree, outputRange: sortie });
  }, [phase, reglages, s]);
  const lc = 2 * RAYON_CERCLE * s;
  const hc = lc * RATIO_CERCLE;
  const ep = Math.max(2, 0.025 * s);
  const style = [StyleSheet.absoluteFill, { transform: [{ translateX }] }];

  if (partie === 'fond') {
    const zb = D + RETRAIT_PLANCHE;
    const haut = projeter(0, PLANCHE_HAUT, zb, l, h);
    const bas = projeter(0, PLANCHE_BAS, zb, l, h);
    const sb = haut.s;
    const lp = PLANCHE_L * sb;
    const hp = bas.y - haut.y;
    const sol = projeter(0, 0, zb + 0.35, l, h).y;
    const cible = { l: 0.59 * sb, h: 0.45 * sb, bas: projeter(0, HAUTEUR_CERCLE + 0.02, zb, l, h).y };
    return (
      <Animated.View pointerEvents="none" style={style}>
        <View style={[styles2.poteau, { left: l / 2 - 0.06 * sb, width: 0.12 * sb, top: bas.y, height: Math.max(0, sol - bas.y) }]} />
        <View
          style={[styles2.planche, {
            left: l / 2 - lp / 2, top: haut.y, width: lp, height: hp, borderWidth: Math.max(2, 0.04 * sb), borderRadius: 0.04 * sb,
          }]}
        >
          <EnseignePearl largeur={Math.min(lp * 0.34, 88)} compacte style={{ marginTop: hp * 0.07 }} />
        </View>
        <View
          style={[styles2.cible, {
            left: l / 2 - cible.l / 2, top: cible.bas - cible.h, width: cible.l, height: cible.h, borderWidth: Math.max(2, 0.03 * sb),
          }]}
        />
        {/* Attache et moitié arrière du cercle */}
        <View style={[styles2.attache, { left: l / 2 - 0.05 * s, top: pc.y - hc / 2 - ep, width: 0.1 * s, height: hc / 2 }]} />
        <View style={[styles2.demi, { left: l / 2 - lc / 2, top: pc.y - hc / 2, width: lc, height: hc / 2 }]}>
          <View style={[styles2.anneau, { width: lc, height: hc, borderRadius: lc / 2, borderWidth: ep }]} />
        </View>
      </Animated.View>
    );
  }

  const hf = 0.42 * s;
  const scaleY = filet.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const brins = [];
  for (let i = 0; i <= 6; i += 1) {
    const u = i / 6 - 0.5;
    const x1 = u * lc * 0.96;
    const x2 = u * lc * 0.6;
    const len = Math.hypot(x2 - x1, hf);
    const ang = Math.atan2(x1 - x2, hf);
    brins.push(
      <View
        key={i}
        style={[styles2.brin, {
          left: lc / 2 + (x1 + x2) / 2 - 0.75, top: hf / 2 - len / 2, height: len, transform: [{ rotate: `${ang}rad` }],
        }]}
      />,
    );
  }
  return (
    <Animated.View pointerEvents="none" style={style}>
      <Animated.View
        style={{
          position: 'absolute', left: l / 2 - lc / 2, top: pc.y, width: lc, height: hf,
          transform: [{ translateY: -hf / 2 }, { scaleY }, { translateY: hf / 2 }],
        }}
      >
        {brins}
        <View style={[styles2.maille, { left: lc * 0.08, right: lc * 0.08, top: hf * 0.38 }]} />
        <View style={[styles2.maille, { left: lc * 0.17, right: lc * 0.17, top: hf * 0.75 }]} />
      </Animated.View>
      <View style={[styles2.demi, { left: l / 2 - lc / 2, top: pc.y, width: lc, height: hc / 2 + ep }]}>
        <View style={[styles2.anneau, { top: -hc / 2, width: lc, height: hc, borderRadius: lc / 2, borderWidth: ep }]} />
      </View>
    </Animated.View>
  );
});

// Ballon de basket, centré sur (x, y), taille et rotation par Animated.Value.
const Ballon = memo(function Ballon({ a, d, feu }) {
  const rotate = useMemo(() => a.rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }), [a]);
  const coutures = Math.max(1.5, d * 0.035);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles2.ballon, {
        left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d / 2, borderWidth: Math.max(1.5, d * 0.03),
        shadowColor: feu ? FEU : '#000', shadowOpacity: feu ? 0.9 : 0.2, shadowRadius: feu ? d * 0.25 : 4,
        transform: [{ translateX: a.x }, { translateY: a.y }, { scale: a.s }, { rotate }],
      }]}
    >
      <View style={[styles2.couture, { width: coutures, height: d, left: d / 2 - coutures / 2, top: -coutures }]} />
      <View style={[styles2.couture, { height: coutures, width: d, top: d / 2 - coutures / 2, left: -coutures }]} />
      <View style={[styles2.arc, { width: d * 0.9, height: d * 0.9, borderRadius: d * 0.45, left: -d * 0.62, top: d * 0.02, borderWidth: coutures }]} />
      <View style={[styles2.arc, { width: d * 0.9, height: d * 0.9, borderRadius: d * 0.45, left: d * 0.66, top: d * 0.02, borderWidth: coutures }]} />
    </Animated.View>
  );
});

// Chrono : seul composant redessiné, une fois par seconde au plus.
const Chrono = memo(function Chrono({ enregistrer, styles }) {
  const [secondes, setSecondes] = useState(DUREE_NIVEAU);
  useEffect(() => {
    enregistrer.current = (s) => setSecondes((x) => (x === s ? x : s));
    return () => { enregistrer.current = null; };
  }, [enregistrer]);
  const presse = secondes <= 5;
  return (
    <View style={[styles.pastille, presse && { backgroundColor: ROUGE, borderColor: ROUGE }]}>
      <Ionicons name="timer-outline" size={17} color={presse ? '#fff' : TEXTE_TERRAIN} />
      <Text style={[styles.pastilleTexte, presse && { color: '#fff' }]}>{secondes} s</Text>
    </View>
  );
});

// « Parfait ! » : grossit puis s'efface (pilote natif).
function Mention({ texte, couleur, haut, onFin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) onFin(); });
    return () => anim.stop();
  }, [onFin, v]);
  const scale = v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.Text pointerEvents="none" style={[styles2.mention, { top: haut, color: couleur, opacity, transform: [{ scale }] }]}>
      {texte}
    </Animated.Text>
  );
}

function Bulle({ id, x, y, texte, couleur, onFin }) {
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
      <Text style={[styles2.bulleTexte, { color: couleur }]}>{texte}</Text>
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
  bandeMur: { position: 'absolute', left: 0, right: 0, backgroundColor: DECOR.murBas },
  parquet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: DECOR.parquet },
  latte: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: DECOR.latte },
  ligneFond: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: DECOR.ligne },
  poteau: { position: 'absolute', backgroundColor: DECOR.poteau, borderRadius: 3 },
  planche: {
    position: 'absolute', backgroundColor: DECOR.planche, borderColor: DECOR.bordPlanche, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cible: { position: 'absolute', borderColor: DECOR.cible, borderBottomWidth: 0 },
  attache: { position: 'absolute', backgroundColor: DECOR.poteau },
  demi: { position: 'absolute', overflow: 'hidden' },
  anneau: { position: 'absolute', left: 0, top: 0, borderColor: DECOR.cercle },
  brin: { position: 'absolute', width: 1.5, backgroundColor: DECOR.filet, opacity: 0.95 },
  maille: { position: 'absolute', height: 1.5, backgroundColor: DECOR.filet, opacity: 0.85 },
  ballon: {
    position: 'absolute', backgroundColor: '#E8762B', borderColor: '#9C4A12', overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  couture: { position: 'absolute', backgroundColor: '#5A2A0A' },
  arc: { position: 'absolute', borderColor: '#5A2A0A', backgroundColor: 'transparent' },
  trainee: { position: 'absolute', backgroundColor: FEU },
  mention: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 38, fontWeight: '900',
    textShadowColor: 'rgba(60,35,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 },
  },
  bulle: { position: 'absolute', width: 180, alignItems: 'center' },
  bulleTexte: {
    textAlign: 'center', fontSize: 24, fontWeight: '900',
    textShadowColor: 'rgba(255,255,255,0.95)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 },
  },
});

const makeStyles = (c) => StyleSheet.create({
  ecran: { flex: 1 },
  monde: { flex: 1, overflow: 'hidden' },
  consigne: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  consigneTexte: { color: TEXTE_TERRAIN, fontSize: 18, fontWeight: '800', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
  haut: { position: 'absolute', left: 16, right: 16 },
  rangeeHaut: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  centreHaut: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  rangeeInfos: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pastille: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: 16, paddingHorizontal: 11,
    backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: '#D5DEE7',
  },
  pastilleTexte: { color: TEXTE_TERRAIN, fontWeight: '900', fontSize: 14 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  astuce: { color: ORANGE, fontSize: 14, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  ligneIcone: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 6 },
  texteLigne: { marginTop: 0, flexShrink: 1, textAlign: 'left' },
  record: { color: OR, fontSize: 16, fontWeight: '800', marginTop: 6 },
  scoreFin: { color: c.text, fontSize: 48, fontWeight: '900', marginTop: 4 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 4, marginBottom: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statTexte: { color: c.text, fontSize: 16, fontWeight: '700' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
