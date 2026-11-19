/**
 * Mini-jeu « Drone express », pour patienter entre deux courses (même jeu
 * que l'app client : AppUser/src/screens/Jeux/DroneScreen.js).
 *
 * Un drone de livraison Pearl Streets, colis accroché dessous, traverse la
 * ville. Chaque toucher le fait monter, la gravité le fait descendre : il
 * passe entre les immeubles (en bas) et les grues, enseignes, câbles (en
 * haut). Passage franchi +1, colis attrapé +5, client servi en passant bas
 * devant son balcon +3. Bonus spéciaux : bouclier, aimant, points doublés.
 * Médaille et nouveau décor tous les 10 passages (utils/jeux/drone.js).
 *
 * Batterie : boucle requestAnimationFrame plafonnée à 60 images par seconde,
 * état dans des refs, dessin par Animated.Value.setValue (aucun rendu React
 * à chaque image). La boucle s'arrête en pause, en fin de partie, quand
 * l'écran perd le focus et quand l'app passe en arrière-plan.
 * Pause automatique aussi à l'annonce d'une nouvelle course, avec la fiche
 * de la vraie course (hooks/usePauseJeu.js, components/AlerteCourseJeu.js).
 *
 * Partie enregistrée à chaque pause et à chaque médaille : « Reprendre ou
 * Recommencer » à la réouverture (moins de 24 h), jamais après une chute.
 * Musique et bruitages (components/jeux/SonJeux.js), bandeau rang et TOP 1,
 * plaque Pearl Streets discrète sur un toit (components/jeux/DecorDrone.js).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu, reprendreAncienRecord} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import ClassementJeu from '../components/jeux/ClassementJeu';
import HudJeu from '../components/jeux/HudJeu';
import IndiceGestes from '../components/jeux/IndiceGestes';
import SonJeux, {
  demarrerMusique,
  arreterMusique,
  bruit,
  ReglagesSon,
} from '../components/jeux/SonJeux';
import BandeauClassement from '../components/jeux/BandeauClassement';
import FenetreReprise from '../components/jeux/FenetreReprise';
import useBandeauClassement from '../utils/jeux/useBandeauClassement';
import useReprise from '../utils/jeux/sauvegardePartie';
import useRecompenses from '../utils/jeux/useRecompenses';
import {
  CouchePopups,
  BanniereRecompense,
  RecapRecompenses,
  OR_FONCE,
} from '../components/jeux/RecompensesJeu';
import {formaterNombre} from '../components/jeux/BandeauClassement';
import {
  Couche,
  Obstacle,
  DessinDrone,
  OR,
  VERT,
  DECORS,
  PALETTE,
  BONUS_VUE,
  silhouettes,
} from '../components/jeux/DecorDrone';
import {
  JEU_DRONE,
  HAUTEUR,
  SOL,
  DRONE_DESSIN,
  bonusActifs,
  creerMonde,
  changerLargeur,
  avancer,
  impulsion,
  centreObstacle,
  niveauPalier,
  niveauJeu,
  medaille,
  decorNiveau,
  nettoyerMonde,
  recordsApres,
  cleSauvegarde,
  chargerRecords,
  enregistrerRecords,
} from '../utils/jeux/drone';

// Vibration légère : module natif facultatif (expo-haptics), le jeu marche sans.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch (e) {
  Haptics = null;
}
const VIBRE_LEGER = 'leger';
const VIBRE_FORT = 'fort';
function vibrer(motif) {
  try {
    if (!Haptics) return;
    const promesse =
      motif === VIBRE_FORT
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch (e) {
    // Sans vibration.
  }
}

const IMAGE_MIN_MS = 15; // plafond d'environ 60 images par seconde (écrans 90 et 120 Hz)
const COULEUR_MEDAILLE = {bronze: '#CD7F32', argent: '#C0C6CE', or: OR};
const CLE_MEDAILLE = {
  bronze: 'jeuxDroneBronze',
  argent: 'jeuxDroneArgent',
  or: 'jeuxDroneOr',
};
const PERIODE_RUE = 90; // unités entre deux traits de la chaussée
const HUD_BONUS_MS = 250; // rafraîchissement des jauges de bonus (seulement en vol, bonus actif)
const EN_JEU = ['pret', 'vol', 'reprise', 'chute'];
// Hauteur réservée au HUD (components/jeux/HudJeu.js) : rangée du score (36)
// plus rangée des bonus actifs (6 + 26), toujours, qu'un bonus soit actif ou non.
// Sans cela, prendre ou perdre un bonus rapetissait ou agrandissait le terrain
// (onLayout) : tout le monde changeait d'échelle et le drone sautait de place.
const HUD_HAUTEUR = 36 + 6 + 26;

function instantane(o) {
  return {
    id: o.id,
    largeur: o.largeur,
    ecart: o.ecart,
    centre: o.centre,
    amp: o.amp,
    bascule: o.bascule || 0,
    // Signe visible tant que le changement au dernier moment n'a pas commencé.
    signe: o.bascule && o.basculeT == null ? Math.sign(o.bascule) : 0,
    haut: o.haut,
    teinte: o.teinte,
    colis: o.colis,
    colisPris: o.colisPris,
    client: o.client,
    livre: o.livre,
    bonus: o.bonus || null,
    bonusPris: !!o.bonusPris,
  };
}

export default function JeuDroneScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser, connecte} = useCompteJeu();
  const cle = cleSauvegarde(idUser);

  const [phase, setPhase] = useState('accueil'); // accueil, pret, vol, chute, pause, reprise, fin
  const phaseRef = useRef('accueil');
  const [niveau, setNiveau] = useState(0); // médailles gagnées (0 au départ)
  const pal = useMemo(
    () => ({...PALETTE, ...DECORS[decorNiveau(niveau)]}),
    [niveau],
  );
  const [taille, setTaille] = useState({l: 0, h: 0});
  const [liste, setListe] = useState([]);
  const [score, setScore] = useState(0);
  const [records, setRecords] = useState({meilleurScore: 0, meilleurNiveau: 1});
  const [resultat, setResultat] = useState(null); // {score, passes, colis, clients}
  const [bonusHud, setBonusHud] = useState([]); // bonus actifs {id, ratio}
  const [impact, setImpact] = useState(null);
  const [classementOuvert, setClassementOuvert] = useState(false);

  const mondeRef = useRef(null);
  const kRef = useRef(1);
  const tailleRef = useRef({l: 0, h: 0});
  const animsRef = useRef(new Map());
  const rafRef = useRef(null);
  const dernierTsRef = useRef(null);
  const actifRef = useRef(false);
  const termineRef = useRef(false);
  const minuteurFinRef = useRef(null);
  const monteRef = useRef(true);
  const popupsRef = useRef(null);
  const banniereRef = useRef(null);
  const hudBonusTsRef = useRef(0);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const droneY = useRef(new Animated.Value(0)).current;
  const droneRot = useRef(new Animated.Value(0)).current;
  const droneOpacite = useRef(new Animated.Value(1)).current; // clignote pendant l'invincibilité
  const decorLoin = useRef(new Animated.Value(0)).current;
  const decorProche = useRef(new Animated.Value(0)).current;
  const rue = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const enJeu = EN_JEU.includes(phase);
  const niveauHud = niveau + 1;

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    JEU_DRONE,
    records.meilleurScore,
    records.meilleurNiveau,
    enJeu,
    score,
    niveauHud,
  );

  const recompenses = useRecompenses({
    score,
    enPartie: enJeu,
    meilleurScore: records.meilleurScore,
    lireMaxMois,
    surAnnonce: a => {
      if (a.type === 'record') {
        bruit('record');
        banniereRef.current?.annoncer({
          texte: t('jeuRecompRecord'),
          icone: 'trophy',
          couleur: OR_FONCE,
        });
      } else {
        banniereRef.current?.annoncer({
          texte: t('jeuRecompPalier', {n: formaterNombre(a.n)}),
          icone: 'ribbon',
          couleur: C.marque,
        });
      }
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  const bandeau = useBandeauClassement(JEU_DRONE, {
    score,
    meilleurLocal: records.meilleurScore,
    enPartie: enJeu,
  });

  const changerPhase = useCallback(p => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  // Valeurs animées des obstacles, créées à leur apparition, retirées à leur sortie.
  const synchroniserListe = useCallback(() => {
    const m = mondeRef.current;
    if (!m) return;
    const k = kRef.current;
    const anims = animsRef.current;
    const ids = new Set(m.obstacles.map(o => o.id));
    for (const id of Array.from(anims.keys()))
      if (!ids.has(id)) anims.delete(id);
    for (const o of m.obstacles) {
      if (!anims.has(o.id)) {
        anims.set(o.id, {
          x: new Animated.Value(o.x * k),
          y: new Animated.Value(centreObstacle(o, m.t) * k),
        });
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
    droneOpacite.setValue(
      m.invincible > 0 && Math.floor(m.t * 12) % 2 === 0 ? 0.35 : 1,
    );
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
  }, [decorLoin, decorProche, droneOpacite, droneRot, droneY, rue]);

  const arreterBoucle = useCallback(() => {
    actifRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dernierTsRef.current = null;
  }, []);

  const repriseRef = useRef({
    enregistrer: () => {},
    effacer: () => {},
    verifier: async () => ({}),
  });

  // Sauvegarde du monde entier (données simples) : seulement en plein vol ou avant le décollage.
  const sauverEtat = useCallback(() => {
    const m = mondeRef.current;
    if (!m || termineRef.current || (m.phase !== 'vol' && m.phase !== 'pret'))
      return;
    if (!m.score && m.phase === 'pret') return;
    repriseRef.current.enregistrer(
      {monde: m, niveau: niveauPalier(m.passes)},
      {niveau: niveauJeu(m.passes), score: m.score},
    );
  }, []);

  // Points gagnés : petites bulles en haut à droite du terrain.
  const ajouterBulle = useCallback((texte, couleur) => {
    if (!monteRef.current) return;
    const l = tailleRef.current.l || 300;
    popupsRef.current?.ajouter({x: l - 70, y: 70, texte, couleur});
  }, []);
  const majBonusHud = useCallback(() => {
    const m = mondeRef.current;
    if (m && monteRef.current) setBonusHud(bonusActifs(m));
  }, []);

  const terminer = useCallback(() => {
    if (termineRef.current) return;
    termineRef.current = true;
    if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    minuteurFinRef.current = null;
    arreterBoucle();
    repriseRef.current.effacer();
    bruit('perdu');
    const m = mondeRef.current;
    const res = {
      score: m?.score || 0,
      passes: m?.passes || 0,
      colis: m?.colis || 0,
      clients: m?.clients || 0,
    };
    banniereRef.current?.effacer();
    const nouveaux = recordsApres(recordsRef.current, res.score, res.passes);
    recordsRef.current = nouveaux;
    enregistrerRecords(cle, nouveaux);
    if (monteRef.current) {
      setResultat(res);
      setRecords(nouveaux);
    }
    changerPhase('fin');
  }, [arreterBoucle, changerPhase, cle]);

  const traiter = useCallback(
    evenements => {
      const m = mondeRef.current;
      let changementListe = false;
      let points = false;
      // Une seule annonce par image : annoncer() remplace la précédente.
      let annonce = null;
      for (const e of evenements) {
        if (e.type === 'liste') changementListe = true;
        else if (e.type === 'passage') points = true;
        else if (e.type === 'palier') {
          vibrer(VIBRE_LEGER);
          bruit('niveau');
          if (monteRef.current) setNiveau(e.niveau);
          annonce = {
            texte: t(CLE_MEDAILLE[e.medaille]),
            icone: 'medal',
            couleur: COULEUR_MEDAILLE[e.medaille],
          };
          sauverEtat();
        } else if (e.type === 'colis') {
          points = true;
          vibrer(VIBRE_LEGER);
          bruit('ramasse');
          ajouterBulle(`+${e.points}`, OR_FONCE);
        } else if (e.type === 'client') {
          points = true;
          vibrer(VIBRE_LEGER);
          bruit('vie');
          ajouterBulle(`${t('jeuxDroneLivre')} +${e.points}`, C.succes);
        } else if (e.type === 'bonus') {
          const v = BONUS_VUE[e.bonus];
          vibrer(VIBRE_LEGER);
          bruit('booster');
          if (v)
            annonce = {texte: t(v.cle), icone: v.icone, couleur: v.couleur};
          majBonusHud();
        } else if (e.type === 'bouclierPerdu') {
          vibrer(VIBRE_FORT);
          bruit('choc');
          annonce = {
            texte: t('jeuxDroneBouclierPerdu'),
            icone: 'shield-half',
            couleur: BONUS_VUE.bouclier.couleur,
          };
          majBonusHud();
        } else if (e.type === 'finBonus') {
          majBonusHud();
        } else if (e.type === 'crash') {
          vibrer(VIBRE_FORT);
          bruit('choc');
          repriseRef.current.effacer();
          changerPhase('chute');
          flash.setValue(0.7);
          Animated.timing(flash, {
            toValue: 0,
            duration: 380,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        } else if (e.type === 'sol') {
          const k = kRef.current;
          if (monteRef.current)
            setImpact({
              x: m.drone.x * k,
              y: (HAUTEUR - SOL) * k,
              n: Date.now(),
            });
          actifRef.current = false;
          minuteurFinRef.current = setTimeout(() => terminer(), 650);
        }
      }
      if (changementListe) synchroniserListe();
      if (points && monteRef.current) setScore(m.score);
      if (annonce && monteRef.current) banniereRef.current?.annoncer(annonce);
    },
    [
      ajouterBulle,
      changerPhase,
      flash,
      majBonusHud,
      sauverEtat,
      synchroniserListe,
      t,
      terminer,
    ],
  );

  const boucleRef = useRef(null);
  boucleRef.current = ts => {
    rafRef.current = null;
    if (!actifRef.current || !mondeRef.current) return;
    // Écran 90 ou 120 Hz : 60 images par seconde au plus, moins de chauffe.
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
    // Jauges des bonus à durée : quelques rafraîchissements par seconde, seulement s'il y en a un.
    const m = mondeRef.current;
    if (
      m &&
      (m.aimant > 0 || m.double > 0) &&
      ts - hudBonusTsRef.current >= HUD_BONUS_MS
    ) {
      hudBonusTsRef.current = ts;
      majBonusHud();
    }
    dessiner();
    if (actifRef.current)
      rafRef.current = requestAnimationFrame(x => boucleRef.current(x));
  };

  const demarrerBoucle = useCallback(() => {
    if (rafRef.current != null) return;
    actifRef.current = true;
    dernierTsRef.current = null;
    rafRef.current = requestAnimationFrame(x => boucleRef.current(x));
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
    repriseRef.current.effacer();
    nouveauMonde();
    recompensesRef.current.debut(0);
    banniereRef.current?.effacer();
    setScore(0);
    setNiveau(0);
    setResultat(null);
    setBonusHud([]);
    setImpact(null);
    setClassementOuvert(false);
    changerPhase('pret');
    demarrerBoucle();
  }, [arreterBoucle, changerPhase, demarrerBoucle, nouveauMonde]);

  // Reprise d'une partie enregistrée : le drone reste figé jusqu'au prochain toucher.
  const reprendreSauvegarde = useCallback(
    etat => {
      const m = nettoyerMonde(etat?.monde);
      if (!m || !tailleRef.current.h) {
        jouer();
        return;
      }
      arreterBoucle();
      termineRef.current = false;
      changerLargeur(m, tailleRef.current.l / kRef.current);
      mondeRef.current = m;
      animsRef.current = new Map();
      synchroniserListe();
      dessiner();
      setScore(m.score || 0);
      setNiveau(niveauPalier(m.passes));
      setResultat(null);
      setBonusHud(bonusActifs(m));
      setImpact(null);
      changerPhase(m.phase === 'pret' ? 'pret' : 'reprise');
      if (m.phase === 'pret') demarrerBoucle();
    },
    [
      arreterBoucle,
      changerPhase,
      demarrerBoucle,
      dessiner,
      jouer,
      synchroniserListe,
    ],
  );

  const reprise = useReprise(JEU_DRONE, {
    surReprendre: etat => reprendreSauvegarde(etat),
    surRecommencer: () => jouer(),
  });
  repriseRef.current = reprise;

  // Toucher : réaction immédiate (onTouchStart), aucune attente de rendu.
  const toucher = useCallback(() => {
    const m = mondeRef.current;
    const p = phaseRef.current;
    if (!m) return;
    if (p === 'pret' || p === 'vol' || p === 'reprise') bruit('saut');
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
      sauverEtat();
      changerPhase('pause');
    } else if (p === 'chute') {
      terminer();
    }
  }, [arreterBoucle, changerPhase, dessiner, sauverEtat, terminer]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  // Reprise après la pause : le drone reste figé jusqu'au prochain toucher.
  const reprendre = useCallback(() => {
    const m = mondeRef.current;
    if (m && m.phase === 'pret') {
      changerPhase('pret');
      demarrerBoucle();
    } else {
      changerPhase('reprise');
    }
  }, [changerPhase, demarrerBoucle]);

  // Pause automatique (hooks/usePauseJeu.js) : app en arrière-plan, écran
  // quitté, retour pendant la partie, nouvelle course annoncée (fiche de la
  // course dans le jeu, components/AlerteCourseJeu.js).
  const estEnPartie = useCallback(() => EN_JEU.includes(phaseRef.current), []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || phaseRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: enJeu || (classementOuvert && phase === 'pause'),
    estEnJeu: estEnPartie,
    fermerPanneau,
  });
  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [fermerAlerte, navigation, pause]);

  // Records du téléphone, puis proposition de reprise si une partie est enregistrée.
  useEffect(() => {
    let vivant = true;
    reprendreAncienRecord('drone', idUser).then(() => chargerRecords(cle)).then(r => {
      if (!vivant) return;
      recordsRef.current = r;
      setRecords(r);
      if (phaseRef.current === 'accueil')
        repriseRef.current.verifier().catch(() => {});
    });
    return () => {
      vivant = false;
    };
  }, [cle]);

  // Démontage : pause (partie enregistrée), boucle arrêtée.
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      monteRef.current = false;
      actifRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (minuteurFinRef.current) clearTimeout(minuteurFinRef.current);
    };
  }, []);

  // Musique du jeu : seulement pendant la partie (pas de musique propre au drone, celle du slalom).
  const enMusique = phase === 'pret' || phase === 'vol' || phase === 'reprise';
  useEffect(() => {
    if (enMusique) demarrerMusique('slalom');
    else arreterMusique();
    return () => arreterMusique();
  }, [enMusique]);

  const surMesure = useCallback(
    ev => {
      const l = Math.round(ev.nativeEvent.layout.width);
      const h = Math.round(ev.nativeEvent.layout.height);
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
    navigation.goBack();
  }, [navigation, pause]);

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

  const k = kRef.current;
  const D = DRONE_DESSIN * k;
  const droneGauche = mondeRef.current
    ? (mondeRef.current.drone.x - DRONE_DESSIN / 2) * k
    : 0;
  const solPx = SOL * k;
  const rotation = useMemo(
    () =>
      droneRot.interpolate({
        inputRange: [-180, 180],
        outputRange: ['-180deg', '180deg'],
      }),
    [droneRot],
  );
  const loin = useMemo(
    () =>
      taille.l
        ? silhouettes(taille.l, taille.h * 0.22, taille.h * 0.42, 17)
        : [],
    [taille],
  );
  const proche = useMemo(
    () =>
      taille.l
        ? silhouettes(taille.l, taille.h * 0.12, taille.h * 0.28, 71)
        : [],
    [taille],
  );
  const boosters = bonusHud.map(b => ({
    cle: b.id,
    icone: BONUS_VUE[b.id].icone,
    couleur: BONUS_VUE[b.id].couleur,
    reste: b.ratio,
  }));
  const medailleFin = niveauPalier(resultat?.passes ?? 0);

  return (
    <View
      style={[
        styles.ecran,
        {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12},
      ]}>
      {/* Hauteur du HUD fixe : la rangée des bonus actifs ne change jamais la taille du terrain. */}
      <View style={styles.hud}>
        <HudJeu
          score={score}
          niveau={niveauHud}
          boosters={boosters}
          onPause={pause}
          onQuitter={quitter}
          pauseActive={enJeu && phase !== 'chute'}
        />
      </View>
      <BandeauClassement bandeau={bandeau} style={styles.bandeau} />

      {/* Monde : toucher fait monter le drone */}
      <View
        style={[styles.piste, {backgroundColor: pal.ciel}]}
        onLayout={surMesure}
        onTouchStart={toucher}>
        {taille.h > 0 && (
          <>
            <Couche
              liste={loin}
              decalage={decorLoin}
              couleur={pal.loin}
              largeur={taille.l}
              bas={solPx}
            />
            <Couche
              liste={proche}
              decalage={decorProche}
              couleur={pal.proche}
              largeur={taille.l}
              bas={solPx}
              logo
            />

            {liste.map(o => {
              const a = animsRef.current.get(o.id);
              return a ? (
                <Obstacle
                  key={o.id}
                  o={o}
                  a={a}
                  k={k}
                  hPx={taille.h}
                  pal={pal}
                />
              ) : null;
            })}

            {/* Rue */}
            <View
              pointerEvents="none"
              style={[styles.rue, {height: solPx, backgroundColor: pal.rue}]}>
              <View
                style={[
                  styles.trottoir,
                  {height: Math.max(3, 10 * k), backgroundColor: pal.trottoir},
                ]}
              />
              <Animated.View
                style={[
                  styles.traits,
                  {
                    top: solPx * 0.55,
                    width: taille.l + PERIODE_RUE * k * 2,
                    transform: [{translateX: rue}],
                  },
                ]}>
                {Array.from({
                  length: Math.ceil(taille.l / (PERIODE_RUE * k)) + 2,
                }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.trait,
                      {
                        width: PERIODE_RUE * k * 0.5,
                        height: Math.max(2, 5 * k),
                        marginRight: PERIODE_RUE * k * 0.5,
                        backgroundColor: pal.trait,
                      },
                    ]}
                  />
                ))}
              </Animated.View>
            </View>

            {/* Drone */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.drone,
                {
                  left: droneGauche,
                  width: D,
                  height: D,
                  opacity: droneOpacite,
                  transform: [{translateY: droneY}, {rotate: rotation}],
                },
              ]}>
              <DessinDrone
                taille={D}
                bouclier={bonusHud.some(b => b.id === 'bouclier')}
              />
            </Animated.View>

            {impact && (
              <Impact key={impact.n} x={impact.x} y={impact.y} taille={D} />
            )}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.flash, {opacity: flash}]}
            />

            {enJeu && niveau > 0 && (
              <MaterialCommunityIcons
                name="medal"
                size={28}
                color={COULEUR_MEDAILLE[medaille(niveau)]}
                style={styles.medaille}
              />
            )}

            {(phase === 'pret' || phase === 'reprise') && (
              <Text
                pointerEvents="none"
                style={[styles.consigne, {top: taille.h * 0.62}]}>
                {phase === 'pret'
                  ? t('jeuxDroneToucher')
                  : t('jeuxDroneToucherReprendre')}
              </Text>
            )}
          </>
        )}
        <CouchePopups ref={popupsRef} />
        {/* Annonces en haut du terrain, jamais au milieu */}
        <BanniereRecompense ref={banniereRef} />
        <IndiceGestes
          jeu={JEU_DRONE}
          gestes={['appui']}
          actif={phase === 'pret'}
        />
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
                  <MaterialCommunityIcons
                    name="quadcopter"
                    size={46}
                    color={C.marque}
                  />
                  <Text style={styles.titre}>{t('jeuxDroneTitre')}</Text>
                  <Text style={styles.texte}>{t('jeuxDroneRegle')}</Text>
                  <Text style={styles.texteDiscret}>{t('jeuxDroneBonus')}</Text>
                  <Text style={styles.texteDiscret}>
                    {t('jeuxDroneBonusSpeciaux')}
                  </Text>
                  <Records records={records} t={t} />
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
                  <Text style={styles.texteDiscret}>
                    {t('jeuSauvegarde')}
                  </Text>
                  <Bouton texte={t('jeuReprendre')} onPress={reprendre} />
                  <Bouton
                    secondaire
                    texte={t('jeuxDroneRejouer')}
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
                  <MaterialCommunityIcons
                    name="package-variant-closed"
                    size={46}
                    color={C.marque}
                  />
                  <Text style={styles.titre}>{t('jeuxDroneFin')}</Text>
                  {medailleFin > 0 && (
                    <MaterialCommunityIcons
                      name="medal"
                      size={30}
                      color={COULEUR_MEDAILLE[medaille(medailleFin)]}
                    />
                  )}
                  <Text style={styles.scoreFin}>
                    {resultat?.score ?? score}
                  </Text>
                  <View style={styles.stats}>
                    <Stat icone="office-building" n={resultat?.passes ?? 0} />
                    <Stat
                      icone="package-variant-closed"
                      n={resultat?.colis ?? 0}
                      couleur={OR}
                    />
                    <Stat
                      icone="account-check"
                      n={resultat?.clients ?? 0}
                      couleur={VERT}
                    />
                  </View>
                  <RecapRecompenses
                    {...recompenses.recap(resultat?.score ?? score)}
                    connecte={connecte}
                  />
                  <Records records={records} t={t} />
                  <Bouton texte={t('jeuxDroneRejouer')} onPress={jouer} />
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
        proposition={reprise.proposition}
        onReprendre={reprise.reprendre}
        onRecommencer={reprise.recommencer}
      />
      <SonJeux />

      {/* Classement : le jeu reste en pause derrière. */}
      <ClassementJeu
        jeu={JEU_DRONE}
        visible={classementOuvert && !enJeu}
        onClose={() => setClassementOuvert(false)}
        avantChargement={envoyer}
      />
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

function Impact({x, y, taille}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [v]);
  const scale = v.interpolate({inputRange: [0, 1], outputRange: [0.2, 1.3]});
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.impact,
        {
          left: x - taille / 2,
          top: y - taille * 0.8,
          width: taille,
          height: taille,
          transform: [{scale}],
        },
      ]}>
      <MaterialCommunityIcons
        name="star-four-points"
        size={taille}
        color={OR}
      />
    </Animated.View>
  );
}

function Records({records, t}) {
  return (
    <View style={styles.records}>
      <Text style={styles.texteDiscret}>
        {t('jeuMeilleurScore', {n: records.meilleurScore})}
      </Text>
      <Text style={styles.texteDiscret}>
        {t('jeuMeilleurNiveau', {n: records.meilleurNiveau})}
      </Text>
    </View>
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
        (pressed || desactive) && {opacity: 0.8},
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

const styles = StyleSheet.create({
  ecran: {flex: 1, backgroundColor: C.fond, paddingHorizontal: 16},
  hud: {minHeight: HUD_HAUTEUR},
  bandeau: {marginTop: 8},
  piste: {
    flex: 1,
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  rue: {position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden'},
  trottoir: {position: 'absolute', left: 0, right: 0, top: 0},
  traits: {position: 'absolute', left: 0, flexDirection: 'row'},
  trait: {borderRadius: 2},
  drone: {position: 'absolute', top: 0, alignItems: 'center'},
  flash: {backgroundColor: C.blanc},
  impact: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medaille: {position: 'absolute', top: 8, left: 8},
  consigne: {
    position: 'absolute',
    left: 28,
    right: 28,
    textAlign: 'center',
    color: C.texte,
    fontSize: 15,
    fontWeight: '800',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
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
  records: {marginTop: 6, marginBottom: 4},
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
