/**
 * Mini-jeu « Pile de colis ».
 *
 * Un colis glisse au-dessus de la pile : toucher l'écran le lâche. La partie
 * qui dépasse tombe et la pile rétrécit ; colis entièrement à côté = une vie
 * en moins ; pose parfaite = bonus et largeur gardée. Niveaux sans fin (plus
 * de colis, plus de vitesse, colis de départ plus étroit, rythme changeant :
 * voir reglagesNiveau dans utils/jeux/pile.js).
 *
 * Le jeu se met en pause quand l'app passe en arrière-plan, quand on quitte
 * l'écran ou avec la flèche (ou le geste) retour pendant la partie ; au
 * retour, la fenêtre de pause attend le livreur. Décor de toits avec le logo
 * Pearl Streets (components/jeux/FondJeu.js). Partie enregistrée sur le téléphone après chaque colis posé et à
 * chaque pause (utils/jeux/pile.js). Musique de fond et bruitages
 * (components/jeux/SonJeux.js), bandeau rang et TOP 1, reprise de la partie
 * avec choix Reprendre ou Recommencer (moins de 24 h), indice du geste.
 *
 * App livreur : repris d'AppUser (src/screens/Jeux/PileScreen.js), même jeu.
 * En plus : pause automatique à l'annonce d'une course et vraie fiche de la
 * course dans le jeu (hooks/usePauseJeu.js, components/AlerteCourseJeu.js).
 * usePauseJeu gère aussi l'arrière-plan, l'écran quitté et le retour pendant
 * la partie (à la place de useRetourPause et des écouteurs d'AppUser).
 * Textes : mêmes clés qu'AppUser, celles du jeu dans contexts/traductionsJeux/pile.js.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, Pressable, Animated, Easing, Alert, ActivityIndicator, Platform, Vibration} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../contexts/LanguageContext';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import BoutonClassement from '../components/jeux/BoutonClassement';
import {COULEURS_JEUX as C, useCompteJeu} from '../utils/jeux/commun';
import useEnvoiRecord from '../utils/jeux/useEnvoiRecord';
import ClassementJeu from '../components/jeux/ClassementJeu';
import {DecorPile, ColisCadeau, Etincelles, H_COLIS} from '../components/jeux/DecorPile';
import HudJeu, {CompteurObjets} from '../components/jeux/HudJeu';
import SonJeux, {demarrerMusique, arreterMusique, bruit, ReglagesSon} from '../components/jeux/SonJeux';
import BandeauClassement from '../components/jeux/BandeauClassement';
import FenetreReprise from '../components/jeux/FenetreReprise';
import IndiceGestes from '../components/jeux/IndiceGestes';
import useBandeauClassement from '../utils/jeux/useBandeauClassement';
import useReprise from '../utils/jeux/sauvegardePartie';
import useRecompenses from '../utils/jeux/useRecompenses';
import {CouchePopups, BanniereRecompense, RecapRecompenses, OR_FONCE} from '../components/jeux/RecompensesJeu';
import {formaterNombre} from '../components/jeux/BandeauClassement';
import {
  LARGEUR, VIES_PAR_NIVEAU, reglagesNiveau, demiPeriodeMs, avancerP, normaliserP, xDeP, xMinColis, courseColis, cleSauvegarde,
  chargerPartie, enregistrerPartie, partieNeuve, poser, niveauSuivant, recommencerNiveau, nouvellePartie,
} from '../utils/jeux/pile';

// Vibration légère (Android), comme sons/haptique.js d'AppUser : facultative, le jeu marche sans.
function vibrer(motif) {
  if (Platform.OS !== 'android' || !Array.isArray(motif) || motif.length < 2) return;
  try {
    Vibration.vibrate(motif.map(n => Math.max(0, Math.round(Number(n) || 0))), false);
  } catch (e) {
    // Sans vibration.
  }
}

const SOL = 14; // trottoir sous la base de la pile
const ECART = 26; // espace entre le colis qui glisse et le dessus de la pile
const ZONE_HAUTE = 64; // place gardée au-dessus du colis qui glisse (consigne, retour)
const VIOLET = '#8E44AD';

export default function JeuPileScreen({navigation}) {
  const insets = useSafeAreaInsets();
  const {t} = useLanguage();
  const {idUser, connecte} = useCompteJeu();
  const cle = useMemo(() => cleSauvegarde(idUser), [idUser]);

  const [etat, setEtat] = useState(null); // null : chargement
  const etatRef = useRef(null);
  const [piste, setPiste] = useState({l: 0, h: 0});
  const pisteRef = useRef({l: 0, h: 0});
  const [retour, setRetour] = useState(null); // { ok, texte, n }
  const [chute, setChute] = useState(null); // morceaux qui tombent { morceaux, bas, idx, n }
  const [etincelles, setEtincelles] = useState(null); // pose parfaite { x, bas, n }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const minuteurRetour = useRef(null);

  const progression = useRef(new Animated.Value(0)).current; // phase 0 à 2 de l'aller-retour
  const decalage = useRef(new Animated.Value(0)).current; // défilement de la pile
  const chuteAnim = useRef(new Animated.Value(0)).current;
  const secousse = useRef(new Animated.Value(0)).current; // petit rebond de la pile à la pose
  const animRef = useRef(null);
  const mouvementRef = useRef(null); // { debut, pDepart, demi }
  const jetonRef = useRef(0); // invalide la fin d'un mouvement arrêté
  const monteRef = useRef(true);

  const repriseRef = useRef({enregistrer: () => {}, effacer: () => {}});
  const popupsRef = useRef(null); // « +N » au-dessus du colis posé
  const banniereRef = useRef(null); // série, palier, record
  const serieRef = useRef(0); // poses parfaites d'affilée

  const {envoyer, lireMaxMois} = useEnvoiRecord(
    'pile',
    etat?.meilleurScore || 0,
    etat?.meilleurNiveau || 1,
    etat?.phase === 'jeu',
    etat?.score || 0,
    // Niveau fini : le score compte son bonus, envoyé comme niveau atteint (comme le record).
    (etat?.niveau || 1) + (etat?.phase === 'niveauFini' ? 1 : 0),
  );

  const appliquer = useCallback(
    (nouvel, sauver = true) => {
      etatRef.current = nouvel;
      if (monteRef.current) setEtat(nouvel);
      if (sauver) {
        enregistrerPartie(cle, nouvel);
        // Reprise : partie en cours gardée 24 h, effacée à la défaite.
        if (nouvel.phase === 'jeu' || nouvel.phase === 'pause' || nouvel.phase === 'niveauFini') {
          repriseRef.current.enregistrer(nouvel, {niveau: nouvel.niveau, score: nouvel.score});
        } else if (nouvel.phase === 'perdu') {
          repriseRef.current.effacer();
        }
      }
    },
    [cle],
  );

  // Phase du colis qui glisse, calculée sur l'horloge (jamais sur un état React).
  const reprise = useReprise('pile', {
    surReprendre: sauvee => appliquer({...sauvee, phase: 'jeu'}),
    surRecommencer: () => demarrerRef.current?.(),
  });
  repriseRef.current = reprise;
  const demarrerRef = useRef(null);
  const recompenses = useRecompenses({
    score: etat?.score || 0,
    enPartie: etat?.phase === 'jeu',
    meilleurScore: etat?.meilleurScore || 0,
    lireMaxMois,
    surAnnonce: a => {
      if (a.type === 'record') banniereRef.current?.annoncer({texte: t('jeuxSocle.nouveauRecord'), icone: 'trophy', couleur: OR_FONCE});
      else banniereRef.current?.annoncer({texte: t('jeuxRecompenses.palier', {n: formaterNombre(a.n)}), icone: 'ribbon', couleur: C.marque});
    },
  });
  const recompensesRef = useRef(recompenses);
  recompensesRef.current = recompenses;

  /** Nouvelle partie depuis le niveau 1 : record et mois d'avant retenus pour le récap. */
  const demarrer = useCallback(() => {
    serieRef.current = 0;
    recompensesRef.current.debut(0);
    appliquer(nouvellePartie(etatRef.current));
  }, [appliquer]);
  demarrerRef.current = demarrer;

  const bandeau = useBandeauClassement('pile', {
    score: etat?.score || 0,
    meilleurLocal: etat ? etat.meilleurScore : null,
    enPartie: etat?.phase === 'jeu',
  });

  const positionActuelle = useCallback(() => {
    const m = mouvementRef.current;
    if (!m) return etatRef.current?.colis?.p || 0;
    return avancerP(m.pDepart, Date.now() - m.debut, m.demi);
  }, []);

  const arreterMouvement = useCallback(() => {
    jetonRef.current += 1;
    animRef.current?.stop();
    animRef.current = null;
    mouvementRef.current = null;
  }, []);

  // Un aller-retour à la fois, recalé sur l'horloge à chaque tour.
  const tour = useCallback(
    jeton => {
      const m = mouvementRef.current;
      if (!m || jeton !== jetonRef.current) return;
      const p = positionActuelle();
      progression.setValue(p);
      const anim = Animated.timing(progression, {
        toValue: 2,
        duration: Math.max(16, (2 - p) * m.demi),
        easing: Easing.linear,
        useNativeDriver: true,
      });
      animRef.current = anim;
      anim.start(({finished}) => {
        if (finished && jeton === jetonRef.current) tour(jeton);
      });
    },
    [positionActuelle, progression],
  );

  const lancerMouvement = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu' || !e.colis || pisteRef.current.l <= 0) return;
    // Mouvement déjà en cours (écran redimensionné) : il reprend où il en était.
    const pDepart = mouvementRef.current ? positionActuelle() : e.colis.p || 0;
    arreterMouvement();
    mouvementRef.current = {debut: Date.now(), pDepart, demi: demiPeriodeMs(e.niveau, e.colis.l, e.colis.v)};
    tour(jetonRef.current);
  }, [arreterMouvement, positionActuelle, tour]);

  const pause = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu') return;
    const p = positionActuelle();
    arreterMouvement();
    progression.setValue(p);
    appliquer({...e, phase: 'pause', colis: e.colis ? {...e.colis, p} : e.colis});
  }, [appliquer, arreterMouvement, positionActuelle, progression]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  // Pause automatique (hooks/usePauseJeu.js) : nouvelle course annoncée (avec
  // sa fiche), app en arrière-plan, écran quitté, flèche ou geste retour
  // pendant la partie.
  const estEnPartie = useCallback(() => etatRef.current?.phase === 'jeu', []);
  const {alerteCourse, fermerAlerte} = usePauseJeu(pause, {
    navigation,
    enJeu: etat?.phase === 'jeu',
    estEnJeu: estEnPartie,
  });

  const montrerRetour = useCallback((ok, texte) => {
    if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    setRetour({ok, texte, n: Date.now()});
    minuteurRetour.current = setTimeout(() => {
      if (monteRef.current) setRetour(null);
    }, 750);
  }, []);

  // Nombre de colis visibles d'un coup : au-delà, la pile défile vers le bas.
  const visibles = Math.max(3, Math.floor((piste.h - SOL - ZONE_HAUTE - ECART - H_COLIS) / H_COLIS));
  const visiblesRef = useRef(visibles);
  visiblesRef.current = visibles;

  // Colis posé à la phase p (celle affichée à l'écran au moment du toucher).
  const poserA = useCallback((e, p) => {
    const x = xDeP(p, e.colis.l);
    const avant = Math.min(e.hauteur, visiblesRef.current);
    const res = poser(e, x);
    const n = res.etat;

    // Morceaux qui tombent, partis de la hauteur du colis lâché.
    if (res.issue === 'rate') bruit('choc');
    else if (res.issue === 'parfait') bruit('booster');
    else bruit(res.tombe.length ? 'tranche' : 'ramasse');
    if (res.etat.phase === 'niveauFini') bruit('niveau');
    else if (res.etat.phase === 'perdu') bruit('perdu');
    if (res.tombe.length) {
      const bas = SOL + avant * H_COLIS;
      setChute({morceaux: res.tombe, bas, idx: e.hauteur, n: Date.now()});
      chuteAnim.setValue(0);
      Animated.timing(chuteAnim, {toValue: 1, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true}).start();
    }
    if (res.issue !== 'rate') {
      secousse.setValue(5);
      Animated.spring(secousse, {toValue: 0, friction: 4, tension: 220, useNativeDriver: true}).start();
    }
    if (res.issue === 'parfait' && res.etat.pile.length) {
      const b = res.etat.pile[res.etat.pile.length - 1];
      setEtincelles({x: (b.x + b.l / 2) * (pisteRef.current.l / LARGEUR), bas: SOL + Math.min(n.hauteur, visiblesRef.current) * H_COLIS - H_COLIS, n: Date.now()});
    }
    if (res.issue === 'rate') {
      serieRef.current = 0;
      vibrer([0, 40, 60, 40]);
      montrerRetour(false, t('jeux.rate'));
    } else {
      vibrer([0, res.issue === 'parfait' ? 20 : 10]);
      const parfait = res.issue === 'parfait';
      if (parfait) montrerRetour(true, t('jeuPile.parfait'));
      // « +N » au-dessus du colis posé (au centre de la pile quand le niveau est fini).
      const b = n.pile.length ? n.pile[n.pile.length - 1] : null;
      const ech = pisteRef.current.l / LARGEUR;
      const basPose = SOL + (Math.min(n.hauteur, visiblesRef.current) - 1) * H_COLIS;
      popupsRef.current?.ajouter({
        x: b ? (b.x + b.l / 2) * ech : pisteRef.current.l / 2,
        y: pisteRef.current.h - basPose - H_COLIS - 8,
        texte: `+${res.points}`,
        couleur: parfait ? OR_FONCE : C.marque,
        icone: parfait ? 'star' : null,
        grand: parfait,
      });
      serieRef.current = parfait ? serieRef.current + 1 : 0;
      if (serieRef.current >= 2) {
        banniereRef.current?.annoncer({texte: t('jeuxRecompenses.serieParfaite', {n: serieRef.current}), icone: 'flame', couleur: VIOLET});
      }
      // Pile plus haute que l'écran : elle descend d'un colis, en douceur.
      if (n.hauteur > visiblesRef.current) {
        decalage.setValue(-H_COLIS);
        Animated.timing(decalage, {toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true}).start();
      }
    }
    if (n.colis) progression.setValue(n.colis.p);
    appliquer(n);
  }, [appliquer, chuteAnim, decalage, montrerRetour, progression, secousse, t]);

  // Toucher : le colis s'arrête là où il est affiché et tombe à cet endroit.
  // La position vient de l'animation native (stopAnimation), pas de l'horloge
  // du JS : l'animation native démarre en retard sur Date.now() et se recale
  // d'un coup à chaque aller-retour, la place calculée sur l'horloge n'était
  // donc pas celle que le joueur voyait et le moment du toucher ne comptait
  // plus vraiment. Horloge gardée en secours si l'animation ne répond pas.
  const lacheEnCours = useRef(false);
  const lacher = useCallback(() => {
    const e = etatRef.current;
    if (!e || e.phase !== 'jeu' || !e.colis || lacheEnCours.current) return;
    lacheEnCours.current = true;
    const pHorloge = positionActuelle();
    let fait = false;
    let secours = null;
    const finir = v => {
      if (fait) return;
      fait = true;
      if (secours) clearTimeout(secours);
      lacheEnCours.current = false;
      // Pause ou départ de l'écran entre le toucher et la réponse : le lâcher est annulé.
      if (!monteRef.current || etatRef.current !== e) return;
      const valeur = Number(v);
      poserA(e, Number.isFinite(valeur) ? normaliserP(valeur) : pHorloge);
    };
    arreterMouvement();
    secours = setTimeout(() => finir(NaN), 150);
    progression.stopAnimation(finir);
  }, [arreterMouvement, poserA, positionActuelle, progression]);

  // Chargement de la partie enregistrée (reprise en pause au même endroit).
  useEffect(() => {
    let vivant = true;
    chargerPartie(cle).then(e => {
      if (!vivant) return;
      if (e.colis) progression.setValue(e.colis.p || 0);
      appliquer(e, false);
      // Partie laissée en pause : Reprendre ou Recommencer (moins de 24 h), sinon départ à zéro.
      if (e.phase === 'pause' && e.score > 0) {
        repriseRef.current.verifier().then(({proposition, expiree}) => {
          if (vivant && !proposition && expiree) appliquer(partieNeuve(e));
        });
      }
    });
    return () => {
      vivant = false;
    };
  }, [cle, appliquer, progression]);

  // Le colis glisse à chaque nouveau colis ou à la reprise.
  useEffect(() => {
    if (etat?.phase === 'jeu' && etat?.colis && piste.l > 0) lancerMouvement();
  }, [etat?.phase, etat?.colis, piste.l, lancerMouvement]);

  // Démontage : pause (arrière-plan et écran quitté : usePauseJeu).
  useEffect(() => {
    monteRef.current = true;
    return () => {
      pauseRef.current();
      monteRef.current = false;
      jetonRef.current += 1;
      animRef.current?.stop();
      if (minuteurRetour.current) clearTimeout(minuteurRetour.current);
    };
  }, []);

  // Musique du jeu : seulement pendant la partie.
  const enMusique = etat?.phase === 'jeu';
  useEffect(() => {
    if (enMusique) demarrerMusique('pile');
    else arreterMusique();
    return () => arreterMusique();
  }, [enMusique]);

  const quitter = useCallback(() => {
    pause();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', {screen: 'OrdersMain'});
  }, [navigation, pause]);

  // « Voir la course » depuis la fiche de la course : la partie reste en pause.
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
    Alert.alert(t('jeux.nouvellePartieTitre'), t('jeux.nouvellePartieTexte'), [
      {text: t('jeux.annuler'), style: 'cancel'},
      {text: t('jeux.nouvellePartie'), style: 'destructive', onPress: demarrer},
    ]);
  }, [demarrer, t]);

  const surMesure = useCallback(ev => {
    const l = Math.round(ev.nativeEvent.layout.width);
    const h = Math.round(ev.nativeEvent.layout.height);
    if (l !== pisteRef.current.l || h !== pisteRef.current.h) {
      pisteRef.current = {l, h};
      setPiste({l, h});
    }
  }, []);

  if (!etat) {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator color={C.marque} />
      </View>
    );
  }

  const r = reglagesNiveau(etat.niveau);
  const echelle = piste.l > 0 ? piste.l / LARGEUR : 1;
  const enJeu = etat.phase === 'jeu' || etat.phase === 'pause';

  // Dessus de la pile : posé sur le sol tant que la pile tient à l'écran, ensuite fixe.
  const niveauDessus = Math.min(etat.hauteur, visibles) - 1;
  const basDessus = SOL + niveauDessus * H_COLIS;
  const basColis = basDessus + H_COLIS + ECART;
  const lColis = etat.colis ? etat.colis.l : 0;
  const translateX = progression.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [xMinColis(lColis) * echelle, (xMinColis(lColis) + courseColis(lColis)) * echelle, xMinColis(lColis) * echelle],
  });
  const descenteChute = (chute?.bas || 0) + H_COLIS;

  return (
    <View style={[styles.ecran, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
      {/* Barre du haut : quitter, score, niveau, vies, pause */}
      <HudJeu
        score={etat.score}
        niveau={etat.niveau}
        vies={etat.vies}
        viesMax={VIES_PAR_NIVEAU}
        onPause={pause}
        onQuitter={quitter}
        pauseActive={etat.phase === 'jeu'}
      />
      <BandeauClassement bandeau={bandeau} style={styles.bandeau} />

      {/* Piste : toucher n'importe où lâche le colis */}
      <Pressable style={styles.piste} onLayout={surMesure} onPressIn={lacher} disabled={etat.phase !== 'jeu'}>
        <DecorPile sol={SOL} />
        <View style={styles.compteurColis} pointerEvents="none">
          <CompteurObjets
            n={Math.min(r.colis, etat.poses)}
            total={r.colis}
            icone="gift"
            libelle={t('jeuPile.avancee', {n: Math.min(r.colis, etat.poses + 1), total: r.colis})}
          />
        </View>
        <IndiceGestes jeu="pile" gestes={['appui']} actif={etat.phase === 'jeu'} />
        {piste.l > 0 && (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, {transform: [{translateY: decalage}, {translateY: secousse}]}]} pointerEvents="none">
              {etat.pile.map((b, i) => {
                const bas = basDessus - (etat.pile.length - 1 - i) * H_COLIS;
                if (bas < -H_COLIS) return null;
                const idx = etat.hauteur - etat.pile.length + i;
                return (
                  <ColisCadeau
                    key={idx}
                    idx={idx}
                    x={b.x * echelle}
                    l={b.l * echelle}
                    bas={bas}
                    noeud={i === etat.pile.length - 1}
                  />
                );
              })}
            </Animated.View>

            {chute &&
              chute.morceaux.map((m, i) => (
                <Animated.View
                  key={`${chute.n}-${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: m.x * echelle,
                    width: Math.max(2, m.l * echelle),
                    bottom: chute.bas,
                    height: H_COLIS,
                    opacity: chuteAnim.interpolate({inputRange: [0, 0.7, 1], outputRange: [1, 0.85, 0]}),
                    transform: [
                      {translateY: chuteAnim.interpolate({inputRange: [0, 1], outputRange: [0, descenteChute]})},
                      {translateX: chuteAnim.interpolate({inputRange: [0, 1], outputRange: [0, m.x + m.l / 2 < LARGEUR / 2 ? -26 : 26]})},
                      {rotate: chuteAnim.interpolate({inputRange: [0, 1], outputRange: ['0deg', m.x + m.l / 2 < LARGEUR / 2 ? '-32deg' : '32deg']})},
                    ],
                  }}>
                  <ColisCadeau idx={chute.idx} x={0} l={m.l * echelle} bas={0} />
                </Animated.View>
              ))}

            {etincelles && <Etincelles key={etincelles.n} n={etincelles.n} x={etincelles.x} bas={etincelles.bas} />}

            {etat.colis && enJeu && (
              <Animated.View pointerEvents="none" style={[styles.mobile, {bottom: basColis, transform: [{translateX}]}]}>
                <ColisCadeau idx={etat.hauteur} x={0} l={lColis * echelle} bas={0} noeud corde />
              </Animated.View>
            )}

            {etat.phase === 'jeu' && etat.poses === 0 && !retour && (
              <Text style={[styles.consigne, {bottom: basColis + H_COLIS + 12}]}>{t('jeuPile.toucher')}</Text>
            )}
            {retour && (
              <Text key={retour.n} style={[styles.retour, {bottom: basColis + H_COLIS + 10, color: retour.ok ? C.succes : C.danger}]}>
                {retour.texte}
              </Text>
            )}
          </>
        )}
        <CouchePopups ref={popupsRef} />
        <BanniereRecompense ref={banniereRef} />
      </Pressable>

      {/* Fenêtres : accueil, pause, niveau réussi, niveau raté */}
      {etat.phase !== 'jeu' && !classementOuvert && !reprise.proposition && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {etat.phase === 'accueil' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="gift" size={42} color={C.marque} />
                <Text style={styles.titre}>{t('jeuPile.titre')}</Text>
                <Text style={styles.texte}>{t('jeuPile.regleCourte')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuPile.resume')}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeux.jouer')} onPress={demarrer} />
                <Bouton secondaire texte={t('jeux.quitter')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'pause' && (
              <>
                <ReglagesSon />
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="pause-circle" size={44} color={C.marque} />
                <Text style={styles.titre}>{t('jeux.enPause')}</Text>
                <Text style={styles.texte}>{t('jeux.sauvegarde')}</Text>
                <Records etat={etat} t={t} />
                <Bouton texte={t('jeux.reprendre')} onPress={() => appliquer({...etat, phase: 'jeu'})} />
                <Bouton secondaire texte={t('jeux.rejouer')} onPress={confirmerNouvellePartie} />
                <Bouton secondaire texte={t('jeux.quitter')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'niveauFini' && (
              <>
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="trophy" size={44} color={C.or} />
                <Text style={styles.titre}>{t('jeux.niveauReussi', {n: etat.niveau})}</Text>
                <Text style={styles.texte}>{t('jeux.score', {n: etat.score})}</Text>
                <RecapRecompenses
                  {...recompenses.recap(etat.score)}
                  etoiles={etat.vies}
                  points={etat.score - (etat.scoreDebutNiveau || 0)}
                  connecte={connecte}
                />
                <Text style={styles.texteDiscret}>{t('jeux.niveauSuivantInfo')}</Text>
                <Bouton texte={t('jeux.niveauSuivant')} onPress={() => appliquer(niveauSuivant(etat))} />
                <Bouton secondaire texte={t('jeux.quitter')} onPress={quitter} />
              </>
            )}
            {etat.phase === 'perdu' && (
              <>
                <BoutonClassement onPress={ouvrirClassement} rang={bandeau?.rang} record={bandeau?.record} top1={bandeau?.top1} />
                <Ionicons name="heart-dislike" size={44} color={C.danger} />
                <Text style={styles.titre}>{t('jeux.plusDeVies')}</Text>
                <Text style={styles.texte}>{t('jeux.plusDeViesTexte', {n: etat.niveau})}</Text>
                <RecapRecompenses {...recompenses.recap(etat.score)} connecte={connecte} />
                <Records etat={etat} t={t} />
                <Bouton
                  texte={t('jeux.recommencerNiveau', {n: etat.niveau})}
                  onPress={() => {
                    serieRef.current = 0;
                    appliquer(recommencerNiveau(etat));
                  }}
                />
                <Bouton secondaire texte={t('jeux.nouvellePartie')} onPress={confirmerNouvellePartie} />
                <Bouton secondaire texte={t('jeux.quitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}

      <FenetreReprise proposition={reprise.proposition} onReprendre={reprise.reprendre} onRecommencer={reprise.recommencer} />
      <SonJeux />

      {/* Classement : le jeu reste en pause derrière. */}
      <ClassementJeu
        jeu="pile"
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

function Records({etat, t}) {
  return (
    <View style={styles.records}>
      <Text style={styles.texteDiscret}>{t('jeux.meilleurScore', {n: etat.meilleurScore})}</Text>
      <Text style={styles.texteDiscret}>{t('jeux.meilleurNiveau', {n: etat.meilleurNiveau})}</Text>
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
  compteurColis: {position: 'absolute', top: 8, left: 8},
  piste: {
    flex: 1,
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  mobile: {position: 'absolute', left: 0, height: H_COLIS, width: '100%'},
  consigne: {
    position: 'absolute', left: 28, right: 28, textAlign: 'center', color: C.texte, fontSize: 14, fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, overflow: 'hidden',
  },
  retour: {
    position: 'absolute', left: 16, right: 16, textAlign: 'center', fontSize: 26, fontWeight: '900',
    textShadowColor: 'rgba(255, 255, 255, 0.95)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 4,
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
  texteDiscret: {color: C.texteDiscret, fontSize: 13, marginTop: 6, textAlign: 'center'},
  records: {marginTop: 6, marginBottom: 4},
  bouton: {alignSelf: 'stretch', marginTop: 14, backgroundColor: C.marque, borderRadius: 14, paddingVertical: 14, alignItems: 'center'},
  boutonSecondaire: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.bordureForte, marginTop: 10},
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
  boutonTexteSecondaire: {color: C.texte},
});
