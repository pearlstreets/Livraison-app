/**
 * Mini-jeu « Livraison au sommet », pour patienter entre deux courses.
 *
 * Le livreur grimpe la façade d'un immeuble en rebondissant tout seul de
 * balcon en balcon. Un balayage vers la gauche ou la droite le dirige (il
 * garde le cap), un appui le redresse ; sortir d'un bord fait revenir par
 * l'autre. Aucune flèche à l'écran. Tomber
 * sous le bas de l'écran, un pot de fleurs ou un pigeon (sauf par le
 * dessus) arrête la tournée. Score = étages + 5 points par colis.
 * Difficile : tous les 50 étages un palier annonce un nouveau décor et un
 * nouveau piège (vent, escadrilles, rafales de pots, nacelles express).
 *
 * Logique pure dans utils/jeuSommet.js. Boucle requestAnimationFrame, état
 * dans des refs, monde dessiné dans un calque déplacé d'un bloc (seuls les
 * éléments qui bougent sont redessinés). Pause automatique : arrière-plan,
 * écran quitté, flèche retour pendant la partie, nouvelle course
 * (hooks/usePauseJeu.js). Sons et musique propres au jeu (components/
 * SonJeux.js). Partie sauvegardée à la pause et à la sortie (reprise : le
 * livreur repart du trottoir avec ses étages et ses colis, utils/
 * partieSauvegardee.js). Décor d'avant le 09/11 (demande du 10/11) : façade
 * unie et fenêtres simples, petite enseigne Pearl Streets discrète un étage
 * sur six. Lisibilité : plateformes foncées et cernées, halo clair derrière
 * le livreur. Récompenses :
 * « +5 » au colis, paliers de score, record battu, étoiles en fin de partie
 * (components/RecompensesJeu.js). Boucle plafonnée à 60 images par seconde.
 * Bonus (demande du 10/11) : aimant à colis, casque, filet de sécurité, avec
 * leur pastille et leur jauge dans la barre du haut. Annonces (palier, bonus,
 * récompenses) et « +5 » toujours en haut, sous la barre d'infos, jamais au
 * milieu de l'écran.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import { EnseignePearl, mesuresEnseigne } from '../components/FondJeu';
import SonJeux, { bruit } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import BandeauClassement from '../components/BandeauClassement';
import { PastilleScore } from '../components/HudJeu';
import IndiceGestes from '../components/IndiceGestes';
import ReprisePartie from '../components/ReprisePartie';
import {
  BanniereRecompense, EtoilesFin, creerSuivi, suivreScore, etoilesPour, formaterNombre,
} from '../components/RecompensesJeu';
import { useBalayage } from '../utils/gestes';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';

import ClassementJeu from '../components/ClassementJeu';
import { chargerRecord, envoyerRecordEnAttente, finDePartie } from '../utils/jeuxRecords';
import {
  MONDE_L, ETAGE, JOUEUR_L, JOUEUR_H, PLAT_H, VX_MAX, POINTS_COLIS, BONUS, TYPES_BONUS,
  partieNeuve, avancer, bonusActifs, restaurerBonus,
} from '../utils/jeuSommet';

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

// Bruitage de chaque événement du jeu (utils/jeuSommet.js).
const SONS_SOMMET = {
  rebond: 'saut', store: 'saut', trampo: 'booster', monte: 'booster', colis: 'ramasse', pigeon: 'ramasse', touche: 'choc', palier: 'niveau', fin: 'perdu',
  aimant: 'bonus', casque: 'bonus', filet: 'bonus', protege: 'choc', sauve: 'booster',
};

// Bonus : icône, couleur (icône blanche dessus) et textes de leur annonce.
const BONUS_VUE = {
  aimant: { icone: 'magnet', couleur: '#E74C3C', titre: 'jeuxSommetBonusAimant', texte: 'jeuxSommetBonusAimantTexte' },
  casque: { icone: 'hard-hat', couleur: '#B7791F', titre: 'jeuxSommetBonusCasque', texte: 'jeuxSommetBonusCasqueTexte' },
  filet: { icone: 'grid', couleur: '#2F80ED', titre: 'jeuxSommetBonusFilet', texte: 'jeuxSommetBonusFiletTexte' },
};
// Annonce d'un événement de bonus : bonus concerné et clé du texte.
const ANNONCES_BONUS = {
  aimant: { bonus: 'aimant' }, casque: { bonus: 'casque' }, filet: { bonus: 'filet' },
  protege: { bonus: 'casque', texte: 'jeuxSommetSauveCasque' }, sauve: { bonus: 'filet', texte: 'jeuxSommetSauveFilet' },
};
const DUREE_ANNONCE_BONUS = 2.2; // secondes de jeu

const JEU = 'sommet';
const HAUTEUR_MIN = 520; // hauteur de monde toujours visible (grands écrans larges)
const OR = '#F2B705';
const PALIERS = [100, 250, 500, 1000, 2000, 5000, 10000];
const IMAGE_MIN_MS = 15; // plafond d'environ 60 images par seconde (écrans 90 et 120 Hz)
const DUREE_BULLE = 0.9; // secondes d'affichage d'un « +5 »

// Décor par palier (tous les 50 étages) : teintes de façade qui changent.
const DECORS = [
  null,
  { clair: ['#E8C3A6', '#D9AE8E', '#C9DDEA', '#C4A183'], sombre: ['#3A2620', '#46302A', '#1B2733', '#5A3F36'] },
  { clair: ['#DCE3EA', '#CBD4DD', '#BFD9EC', '#B3BFCB'], sombre: ['#262B33', '#2E343D', '#17283A', '#3E4752'] },
  { clair: ['#CFE6E8', '#BBD8DB', '#A9D3E6', '#9CBFC4'], sombre: ['#1E2F31', '#263B3E', '#10303F', '#35514F'] },
  { clair: ['#F1D9E8', '#E4C3D8', '#D3D6F2', '#CFA9C2'], sombre: ['#33232E', '#3E2C39', '#1D2142', '#573F4E'] },
];
function appliquerDecor(base, dark, palier) {
  if (!palier) return base;
  const k = 1 + ((palier - 1) % (DECORS.length - 1));
  const [mur, murJoint, vitre, cadre] = DECORS[k][dark ? 'sombre' : 'clair'];
  return { ...base, mur, murJoint, vitre, cadre };
}

function palette(dark) {
  return dark
    ? {
      mur: '#2A2320', murJoint: '#332B27', vitre: '#1B2733', vitreAllumee: '#E7B54F', cadre: '#4A3F39',
      dalle: '#B3A79C', dalleBord: '#E9E2DA', dalleTrait: '#F4EFEA', console: '#A2978D', trottoir: '#3A3A3D', route: '#26262A',
      matelas: '#3D8BD9', nacelle: '#8D99A6', cable: '#9AA3AD', pot: '#C2643C', pigeon: '#B7C0C9', colis: '#C98A45',
    }
    : {
      mur: '#F3E4D4', murJoint: '#EAD7C3', vitre: '#CFE3F1', vitreAllumee: '#F6D27A', cadre: '#DCC3A9',
      dalle: '#8E8073', dalleBord: '#B5A899', dalleTrait: '#3E352E', console: '#5E544B', trottoir: '#C9C9CC', route: '#9EA0A6',
      matelas: '#2F80ED', nacelle: '#7D8995', cable: '#6E7781', pot: '#C2643C', pigeon: '#7A8691', colis: '#B07A3B',
    };
}

// Fenêtres allumées le soir : tirage fixe par étage, la façade ne clignote pas.
function allumee(rang, col) {
  const x = Math.sin(rang * 12.9898 + col * 78.233) * 43758.5453;
  return x - Math.floor(x) < 0.35;
}

/** Un étage de façade (4 fenêtres), redessiné seulement s'il change. */
// Un étage sur six porte une petite enseigne Pearl Streets discrète entre
// deux fenêtres (jamais un grand panneau).
const LARGEUR_ENSEIGNE = 36;
const GAUCHE_ENSEIGNE = 155; // entre la 2e fenêtre (108 à 152) et la 3e (194)
const Etage = memo(function Etage({ rang, s, dark, p }) {
  const h = ETAGE * s;
  const lf = 44 * s;
  const hf = 34 * s;
  const enseigne = rang % 6 === 1;
  const hEnseigne = mesuresEnseigne(LARGEUR_ENSEIGNE * s, true).hauteur;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: -(rang + 1) * h, height: h }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(1, 2 * s), backgroundColor: p.murJoint }} />
      {enseigne && (
        <EnseignePearl
          largeur={LARGEUR_ENSEIGNE * s}
          compacte
          style={{ position: 'absolute', left: GAUCHE_ENSEIGNE * s, top: (h - hEnseigne) / 2, opacity: 0.6 }}
        />
      )}
      {[0, 1, 2, 3].map((c) => (
        <View
          key={c}
          style={{
            position: 'absolute',
            left: (22 + c * 86) * s,
            top: (h - hf) / 2,
            width: lf,
            height: hf,
            borderRadius: 3 * s,
            borderWidth: Math.max(1, 2 * s),
            borderColor: p.cadre,
            backgroundColor: dark && allumee(rang, c) ? p.vitreAllumee : p.vitre,
          }}
        >
          <View style={{ position: 'absolute', left: lf / 2 - 1.5 * s, top: 0, bottom: 0, width: Math.max(1, 2 * s), backgroundColor: p.cadre }} />
        </View>
      ))}
    </View>
  );
});

/** Une plateforme (balcon, nacelle, store, matelas, monte-charge). */
const Plateforme = memo(function Plateforme({ type, x, y, l, rot, dechire, s, p }) {
  const left = x * s;
  const top = -y * s;
  const w = l * s;
  const hh = PLAT_H * s;
  if (type === 'sol') return null;
  if (type === 'store') {
    const bandes = 8;
    return (
      <View
        style={{
          position: 'absolute', left, top, width: w, height: hh + 4 * s, flexDirection: 'row',
          borderRadius: 3 * s, overflow: 'hidden', opacity: dechire ? 0.7 : 1,
          borderWidth: Math.max(1, 1.5 * s), borderColor: p.dalleTrait,
          transform: [{ rotate: `${dechire ? rot : 0}deg` }],
        }}
      >
        {Array.from({ length: bandes }).map((_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? '#FFFFFF' : BRAND, borderBottomLeftRadius: 5 * s, borderBottomRightRadius: 5 * s }} />
        ))}
      </View>
    );
  }
  if (type === 'nacelle') {
    return (
      <View style={{ position: 'absolute', left, top: top - 70 * s, width: w, height: 70 * s + hh }}>
        <View style={{ position: 'absolute', left: 6 * s, top: 0, width: Math.max(1, 1.5 * s), height: 70 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', right: 6 * s, top: 0, width: Math.max(1, 1.5 * s), height: 70 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: hh, borderRadius: 2 * s, backgroundColor: p.nacelle, overflow: 'hidden', borderWidth: Math.max(1, 1.5 * s), borderColor: p.dalleTrait }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 * s, backgroundColor: OR }} />
        </View>
      </View>
    );
  }
  if (type === 'monte') {
    return (
      <View style={{ position: 'absolute', left, top: top - 50 * s, width: w, height: 50 * s + hh + 34 * s }}>
        <View style={{ position: 'absolute', left: w / 2 - 1 * s, top: 0, width: Math.max(1, 2 * s), height: 50 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 50 * s, height: hh, borderRadius: 2 * s, backgroundColor: OR, borderWidth: Math.max(1, 1.5 * s), borderColor: p.dalleTrait }} />
        <View
          style={{
            position: 'absolute', left: 6 * s, right: 6 * s, top: 50 * s + hh, height: 34 * s,
            borderWidth: Math.max(1, 2 * s), borderTopWidth: 0, borderColor: OR, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="elevator" size={22 * s} color={OR} />
        </View>
      </View>
    );
  }
  const trampo = type === 'trampo';
  return (
    <View style={{ position: 'absolute', left, top, width: w, height: hh + (trampo ? 8 * s : 0) + 12 * s }}>
      {trampo && (
        <View style={{ height: 8 * s, marginHorizontal: 6 * s, borderRadius: 4 * s, backgroundColor: p.matelas, borderWidth: Math.max(1, 1.2 * s), borderColor: p.dalleTrait }} />
      )}
      <View style={{ height: hh, borderRadius: 2 * s, backgroundColor: p.dalle, borderWidth: Math.max(1, 1.5 * s), borderColor: p.dalleTrait, borderTopWidth: Math.max(1, 3 * s), borderTopColor: p.dalleBord }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 * s }}>
        <View style={{ width: 6 * s, height: 10 * s, backgroundColor: p.console, borderBottomLeftRadius: 4 * s, borderBottomRightRadius: 4 * s }} />
        <View style={{ width: 6 * s, height: 10 * s, backgroundColor: p.console, borderBottomLeftRadius: 4 * s, borderBottomRightRadius: 4 * s }} />
      </View>
    </View>
  );
});

const Colis = memo(function Colis({ x, y, s, p }) {
  const t = 26 * s;
  return (
    <View style={{ position: 'absolute', left: x * s - t / 2, top: -y * s - t / 2, width: t, height: t }}>
      <MaterialCommunityIcons name="package-variant-closed" size={t} color={p.colis} />
    </View>
  );
});

/** Bonus à ramasser : pastille colorée cernée de blanc, légère oscillation. */
const ObjetBonus = memo(function ObjetBonus({ type, x, y, s }) {
  const v = BONUS_VUE[type];
  const t = 30 * s;
  return (
    <View
      style={{
        position: 'absolute', left: x * s - t / 2, top: -y * s - t / 2, width: t, height: t, borderRadius: t / 2,
        backgroundColor: v.couleur, borderWidth: Math.max(1, 2 * s), borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={v.icone} size={18 * s} color="#FFFFFF" />
    </View>
  );
});

/** Pastille d'un bonus actif dans la barre du haut, avec sa jauge. */
function PuceBonus({ type, ratio }) {
  const v = BONUS_VUE[type];
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <View style={[stylesFixes.puce, { backgroundColor: v.couleur }]}>
      <MaterialCommunityIcons name={v.icone} size={18} color="#FFFFFF" />
      <View style={stylesFixes.puceFond}>
        <View style={{ width: `${r * 100}%`, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 2 }} />
      </View>
    </View>
  );
}

function Livreur({ x, y, rot, vx, s, dark, casque, aimant }) {
  const l = JOUEUR_L * s;
  const h = JOUEUR_H * s;
  const penche = rot || (vx / VX_MAX) * 10;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x * s - l / 2, top: -y * s - h, width: l, height: h,
        alignItems: 'center', justifyContent: 'flex-end', transform: [{ rotate: `${penche}deg` }],
      }}
    >
      {/* Halo clair : le livreur se détache toujours de la façade */}
      <View style={{ position: 'absolute', left: -l * 0.2, top: -h * 0.05, width: l * 1.4, height: h * 1.1, borderRadius: l, backgroundColor: '#FFFFFF', opacity: dark ? 0.22 : 0.55 }} />
      {/* Casque actif : contour doré autour du livreur */}
      {casque && (
        <View style={{ position: 'absolute', left: -l * 0.3, top: -h * 0.12, width: l * 1.6, height: h * 1.24, borderRadius: l, borderWidth: Math.max(1, 2.5 * s), borderColor: OR }} />
      )}
      {aimant && (
        <View style={{ position: 'absolute', right: -14 * s, top: h * 0.35 }}>
          <MaterialCommunityIcons name="magnet" size={16 * s} color={BONUS_VUE.aimant.couleur} />
        </View>
      )}
      <View style={{ position: 'absolute', top: casque ? -16 * s : -4 * s, alignItems: 'center' }}>
        {casque && <MaterialCommunityIcons name="hard-hat" size={18 * s} color={OR} style={{ marginBottom: -6 * s }} />}
        <MaterialCommunityIcons name="package-variant-closed" size={18 * s} color="#B07A3B" />
      </View>
      <MaterialCommunityIcons name="human-handsup" size={h * 0.82} color={BRAND} />
    </View>
  );
}

export default function JeuSommetScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [ui, setUi] = useState('accueil'); // accueil | jeu | pause | fin
  const uiRef = useRef('accueil');
  const [, setImage] = useState(0);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [meilleur, setMeilleur] = useState(0);
  const [hauteurAnnonces, setHauteurAnnonces] = useState(0); // pile des annonces, pour placer la bannière dessous
  const [resultat, setResultat] = useState(null); // { score, etage, colis, cause, nouveauRecord }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [reprise, setReprise] = useState(null); // partie sauvegardée { score, etage, colis }
  const [nbParties, setNbParties] = useState(0);
  const partieRef = useRef(null);
  const dirRef = useRef(0);
  const banniereRef = useRef(null);
  const suiviRef = useRef(null); // paliers et record annoncés pendant la partie
  const bullesRef = useRef([]); // « +5 » des colis : { id, x, y, t0 }
  const annonceBonusRef = useRef(null); // { bonus, texte, fin } en secondes de jeu
  const meilleurRef = useRef(0);
  meilleurRef.current = meilleur;
  const monteRef = useRef(true);
  const palierEcran = partieRef.current ? partieRef.current.palier : 0;
  const p = useMemo(() => appliquerDecor(palette(dark), dark, palierEcran), [dark, palierEcran]);

  const changerUi = useCallback((u) => {
    uiRef.current = u;
    if (monteRef.current) setUi(u);
  }, []);

  useEffect(() => {
    monteRef.current = true;
    let vivant = true;
    chargerRecord(JEU, user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); });
    chargerPartie(JEU, user?.id).then((sauvee) => {
      if (vivant && sauvee && sauvee.score > 0 && uiRef.current === 'accueil') setReprise(sauvee);
    }).catch(() => {});
    return () => { vivant = false; monteRef.current = false; };
  }, [user?.id]);

  // Échelle : largeur du monde = largeur d'écran, mais toujours au moins
  // HAUTEUR_MIN unités visibles en hauteur (tablettes : façade centrée).
  const s = taille.l > 0 ? Math.min(taille.l / MONDE_L, taille.h / HAUTEUR_MIN) : 1;
  const largeurMonde = MONDE_L * s;
  const decalage = (taille.l - largeurMonde) / 2;
  const visibleH = taille.h > 0 ? taille.h / s : 640;
  const visibleRef = useRef(visibleH);
  visibleRef.current = visibleH;
  useEffect(() => {
    if (partieRef.current) partieRef.current.visibleH = visibleH;
  }, [visibleH]);

  // Sauvegarde : étages, colis et score gagnés (jamais après une partie perdue).
  const sauver = useCallback(() => {
    const e = partieRef.current;
    if (!e || e.phase !== 'jeu' || e.score <= 0) return;
    sauverPartie(JEU, user?.id, { score: e.score, etage: e.etage, colis: e.colis, bonus: bonusActifs(e) }).catch(() => {});
  }, [user?.id]);
  const pause = useCallback(() => {
    if (uiRef.current !== 'jeu') return;
    dirRef.current = 0;
    sauver();
    changerUi('pause');
  }, [changerUi, sauver]);
  const estEnJeu = useCallback(() => uiRef.current === 'jeu', []);
  // Retour avec le classement ouvert depuis la pause : il se ferme, la partie reste en pause.
  const fermerPanneau = () => {
    if (!classementOuvert || uiRef.current !== 'pause') return false;
    setClassementOuvert(false);
    return true;
  };
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause, {
    navigation, enJeu: ui === 'jeu' || (classementOuvert && ui === 'pause'), estEnJeu, fermerPanneau,
  });

  const terminer = useCallback((e) => {
    dirRef.current = 0;
    const base = {
      score: e.score, etage: e.etage, colis: e.colis, cause: e.cause, nouveauRecord: false,
      etoiles: etoilesPour(e.score, meilleurRef.current, PALIERS),
    };
    banniereRef.current?.cacher();
    bullesRef.current = [];
    annonceBonusRef.current = null;
    setResultat(base);
    setReprise(null);
    effacerPartie(JEU, user?.id).catch(() => {});
    changerUi('fin');
    vibrer(true);
    bruit('perdu');
    finDePartie(JEU, user?.id, e.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setNbParties((n) => n + 1);
      if (r.nouveauRecord) bruit('record');
      setResultat((x) => (x === base ? { ...base, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [changerUi, user?.id]);

  const jouer = useCallback(() => {
    partieRef.current = partieNeuve(visibleRef.current);
    suiviRef.current = creerSuivi(PALIERS, meilleurRef.current, 0);
    bullesRef.current = [];
    annonceBonusRef.current = null;
    banniereRef.current?.cacher();
    dirRef.current = 0;
    setResultat(null);
    setReprise(null);
    effacerPartie(JEU, user?.id).catch(() => {});
    setClassementOuvert(false);
    changerUi('jeu');
  }, [changerUi, user?.id]);

  // Reprise : le livreur repart du trottoir en gardant étages et colis.
  const reprendrePartie = useCallback(() => {
    const sauvee = reprise;
    const e = partieNeuve(visibleRef.current);
    if (sauvee) {
      e.etageBase = Math.max(0, Math.floor(sauvee.etage || 0));
      e.colis = Math.max(0, Math.floor(sauvee.colis || 0));
      e.etage = e.etageBase;
      e.score = e.etageBase + e.colis * POINTS_COLIS;
      restaurerBonus(e, sauvee.bonus);
    }
    partieRef.current = e;
    suiviRef.current = creerSuivi(PALIERS, meilleurRef.current, e.score);
    bullesRef.current = [];
    annonceBonusRef.current = null;
    dirRef.current = 0;
    setReprise(null);
    setResultat(null);
    changerUi('jeu');
  }, [reprise, changerUi]);
  const recommencerPartie = useCallback(() => { jouer(); }, [jouer]);

  // Boucle de jeu : tourne seulement en phase « jeu ».
  useEffect(() => {
    if (ui !== 'jeu') return undefined;
    let id = null;
    let avant = null;
    const image = (ts) => {
      const e = partieRef.current;
      if (!e || uiRef.current !== 'jeu') return;
      // Écran 90 ou 120 Hz : 60 images par seconde au plus, moins de chauffe.
      if (avant != null && ts - avant < IMAGE_MIN_MS) {
        id = requestAnimationFrame(image);
        return;
      }
      const dt = avant == null ? 0 : (ts - avant) / 1000;
      avant = ts;
      const evts = avancer(e, dt, dirRef.current);
      for (let i = 0; i < evts.length; i += 1) {
        const ev = evts[i];
        if (ev === 'colis' || ev === 'trampo' || ev === 'monte' || ev === 'pigeon' || ANNONCES_BONUS[ev]) vibrer(ev === 'protege');
        else if (ev === 'touche') vibrer(true);
        bruit(SONS_SOMMET[ev]);
        if (ANNONCES_BONUS[ev]) annonceBonusRef.current = { ...ANNONCES_BONUS[ev], fin: e.t + DUREE_ANNONCE_BONUS };
        if (ev === 'colis') {
          bullesRef.current.push({ id: e.t + Math.random(), x: e.joueur.x, y: e.joueur.y + JOUEUR_H + 10, t0: e.t });
        }
      }
      if (e.phase === 'fin') {
        terminer(e);
        return;
      }
      if (bullesRef.current.length && e.t - bullesRef.current[0].t0 > DUREE_BULLE) {
        bullesRef.current = bullesRef.current.filter((b) => e.t - b.t0 <= DUREE_BULLE);
      }
      const annonce = suivreScore(suiviRef.current, e.score);
      if (annonce?.type === 'record') {
        bruit('record');
        banniereRef.current?.montrer({ texte: t('jeuRecompRecord'), icone: 'trophy', couleur: OR });
      } else if (annonce) {
        banniereRef.current?.montrer({ texte: t('jeuRecompPalier', { n: formaterNombre(annonce.n) }), icone: 'star', couleur: OR });
      }
      setImage((n) => (n + 1) % 1000000);
      id = requestAnimationFrame(image);
    };
    id = requestAnimationFrame(image);
    return () => { if (id != null) cancelAnimationFrame(id); };
  }, [ui, terminer, t]);

  const quitter = useCallback(() => {
    pause();
    navigation.goBack();
  }, [navigation, pause]);

  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [fermerAlerte, navigation, pause]);

  const surMesure = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    setTaille((x) => (Math.round(x.l) === Math.round(width) && Math.round(x.h) === Math.round(height) ? x : { l: width, h: height }));
  }, []);

  // Commande au doigt : un balayage gauche ou droite fixe le cap (le livreur
  // le garde), un appui le redresse. Aucune flèche à l'écran.
  const balayage = useBalayage({
    seuil: 22,
    actif: ui === 'jeu',
    onGauche: () => { dirRef.current = -1; },
    onDroite: () => { dirRef.current = 1; },
    onAppui: () => { dirRef.current = 0; },
  });

  const e = partieRef.current;
  const cam = e && ui !== 'accueil' ? e.cam : 0;
  const premierRang = Math.max(0, Math.floor(cam / ETAGE) - 1);
  const dernierRang = Math.floor((cam + visibleH) / ETAGE) + 1;
  const rangs = [];
  for (let r = premierRang; r <= dernierRang; r += 1) rangs.push(r);
  const joueur = e && ui !== 'accueil' ? e.joueur : { x: MONDE_L / 2, y: 0, vx: 0, vy: 0, rot: 0, regard: 1 };
  const enJeu = ui === 'jeu';
  const hautHud = insets.top + 118;
  const basHud = insets.top + 134; // juste sous les pastilles de score
  const casqueActif = !!(e && ui !== 'accueil' && (e.casque > 0 || e.invuln > 0));
  const aimantActif = !!(e && ui !== 'accueil' && e.aimant > 0);
  const ab = annonceBonusRef.current;
  const annonceBonus = e && ab && e.t < ab.fin ? ab : null;
  // « +5 » du dernier colis : il s'affiche sur le compteur de colis, en haut.
  const bulles = bullesRef.current;
  const derniereBulle = e && ui !== 'accueil' && bulles.length ? bulles[bulles.length - 1] : null;
  const ageBulle = derniereBulle ? (e.t - derniereBulle.t0) / DUREE_BULLE : 1;

  return (
    <View style={[styles.ecran, { backgroundColor: dark ? '#14161B' : '#DCEBF7' }]}>
      <SonJeux jeu={JEU} actif={ui === 'jeu'} />
      {/* Zone de jeu : façade, plateformes, livreur, gêneurs */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={surMesure}
      >
        {taille.l > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: decalage, top: 0, width: largeurMonde, height: taille.h, overflow: 'hidden', backgroundColor: p.mur }}>
            <View style={{ position: 'absolute', left: 0, top: 0, width: largeurMonde, height: 0, transform: [{ translateY: taille.h + cam * s }] }}>
              {rangs.map((r) => <Etage key={r} rang={r} s={s} dark={dark} p={p} />)}
              {/* Trottoir et rue */}
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 24 * s, backgroundColor: p.trottoir }} />
              <View style={{ position: 'absolute', left: 0, right: 0, top: 24 * s, height: 400 * s, backgroundColor: p.route }} />
            </View>
            <View style={{ position: 'absolute', left: 0, top: 0, width: largeurMonde, height: 0, transform: [{ translateY: taille.h + cam * s }] }}>
              {e && ui !== 'accueil' && e.plateformes.map((pl) => (
                <Plateforme key={pl.id} type={pl.type} x={pl.x} y={pl.y} l={pl.l} rot={pl.rot} dechire={pl.dechire} s={s} p={p} />
              ))}
              {e && ui !== 'accueil' && e.colisListe.map((c) => <Colis key={c.id} x={c.x} y={c.y} s={s} p={p} />)}
              {e && ui !== 'accueil' && e.bonusListe.map((b) => (
                <ObjetBonus key={b.id} type={b.type} x={b.x} y={b.y + Math.sin(e.t * 4 + b.id) * 3} s={s} />
              ))}
              <Livreur x={joueur.x} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} dark={dark} casque={casqueActif} aimant={aimantActif} />
              {/* Copie du livreur au passage d'un bord */}
              {joueur.x < JOUEUR_L && <Livreur x={joueur.x + MONDE_L} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} dark={dark} casque={casqueActif} aimant={aimantActif} />}
              {joueur.x > MONDE_L - JOUEUR_L && <Livreur x={joueur.x - MONDE_L} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} dark={dark} casque={casqueActif} aimant={aimantActif} />}
            </View>
            {/* Filet de sécurité actif : tendu en bas de l'écran */}
            {e && ui !== 'accueil' && e.filet > 0 && (
              <View style={[styles.filet, { height: 16 * s, borderColor: BONUS_VUE.filet.couleur }]}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <View key={i} style={{ flex: 1, borderRightWidth: i < 11 ? 1.5 : 0, borderColor: BONUS_VUE.filet.couleur }} />
                ))}
              </View>
            )}
          </View>
        )}
        {/* Annonces empilées : bonus puis palier, la bannière des récompenses se place dessous */}
        <View pointerEvents="none" style={[styles.pileAnnonces, { top: basHud }]} onLayout={(ev) => setHauteurAnnonces(ev.nativeEvent.layout.height)}>
          {enJeu && e && annonceBonus && (
            <View style={[styles.annonce, { borderColor: BONUS_VUE[annonceBonus.bonus].couleur }]}>
              <View style={[styles.annonceIcone, { backgroundColor: BONUS_VUE[annonceBonus.bonus].couleur }]}>
                <MaterialCommunityIcons name={BONUS_VUE[annonceBonus.bonus].icone} size={16} color="#FFFFFF" />
              </View>
              <Text style={styles.annonceTexte} numberOfLines={2}>
                <Text style={styles.annonceTitre}>{`${t(BONUS_VUE[annonceBonus.bonus].titre)}. `}</Text>
                {t(annonceBonus.texte || BONUS_VUE[annonceBonus.bonus].texte)}
              </Text>
            </View>
          )}
          {enJeu && e && e.annonce > 0 && e.palier > 0 && (
            <View style={styles.annonce}>
              <View style={[styles.annonceIcone, { backgroundColor: BRAND }]}>
                <Ionicons name="flag" size={15} color="#FFFFFF" />
              </View>
              <Text style={styles.annonceTexte} numberOfLines={2}>
                <Text style={styles.annonceTitre}>{`${t('jeuxSommetPalier', { n: e.palier })}. `}</Text>
                {t(`jeuxSommetPiege${Math.min(e.palier, 5)}`)}
              </Text>
            </View>
          )}
        </View>
        {/* Pots et pigeons au-dessus des annonces : jamais cachés par elles */}
        {taille.l > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: decalage, top: 0, width: largeurMonde, height: taille.h, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, top: 0, width: largeurMonde, height: 0, transform: [{ translateY: taille.h + cam * s }] }}>
              {e && ui !== 'accueil' && e.pots.filter((pot) => pot.alerte <= 0 && !pot.casse).map((pot) => (
                <View key={pot.id} style={{ position: 'absolute', left: (pot.x - 12) * s, top: -(pot.y + 22) * s, width: 24 * s, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="flower-tulip" size={18 * s} color="#E0457B" />
                  <View style={{ width: 22 * s, height: 16 * s, marginTop: -3 * s, backgroundColor: p.pot, borderBottomLeftRadius: 7 * s, borderBottomRightRadius: 7 * s, borderTopLeftRadius: 2 * s, borderTopRightRadius: 2 * s }} />
                </View>
              ))}
              {e && ui !== 'accueil' && e.pigeons.map((g) => (
                <View
                  key={g.id}
                  style={{ position: 'absolute', left: (g.x - 17) * s, top: -(g.y + 15) * s, transform: [{ scaleX: g.regard }, { rotate: g.mort ? '180deg' : '0deg' }] }}
                >
                  <MaterialCommunityIcons name="bird" size={34 * s} color={p.pigeon} />
                </View>
              ))}
            </View>
          </View>
        )}
        <BanniereRecompense ref={banniereRef} haut={basHud + (hauteurAnnonces > 0 ? hauteurAnnonces + 6 : 0)} />
        {/* Alerte : un pot va tomber ici (par-dessus les annonces) */}
        {taille.l > 0 && e && ui !== 'accueil' && e.pots.filter((pot) => pot.alerte > 0).map((pot) => (
          <View key={pot.id} pointerEvents="none" style={{ position: 'absolute', left: decalage + pot.x * s - 13, top: hautHud + 4 }}>
            <Ionicons name="warning" size={26} color={OR} />
          </View>
        ))}
        <IndiceGestes jeu={JEU} actif={enJeu} gestes={['gauche', 'droite', 'appui']} t={t} colors={colors} />
        {/* Couche des gestes : tout l'écran */}
        <View {...balayage.panHandlers} style={StyleSheet.absoluteFill} />
      </View>

      {/* Barre du haut : quitter, étage et score, pause */}
      <View style={[styles.haut, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        {ui !== 'accueil' && e ? (
          <View style={styles.infos} pointerEvents="none">
            <Text style={styles.etage}>{t('jeuxSommetEtage', { n: e.etage })}</Text>
          </View>
        ) : <View style={{ flex: 1 }} />}
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

      {/* Rang, record et TOP 1, puis score et colis ramassés */}
      <View style={[styles.bandeau, { top: insets.top + 58 }]} pointerEvents="none">
        <BandeauClassement jeu={JEU} idLivreur={user?.id} score={e && ui !== 'accueil' ? e.score : 0} rafraichir={nbParties} t={t} colors={colors} />
        {ui !== 'accueil' && e && (
          <View style={styles.pastilles}>
            <PastilleScore valeur={e.score} colors={colors} />
            <PastilleScore valeur={e.colis} icone="cube" couleur="#C98A45" colors={colors} />
            {TYPES_BONUS.filter((k) => e[k] > 0).map((k) => (
              <PuceBonus key={k} type={k} ratio={e[k] / BONUS[k].duree} />
            ))}
            {/* « +5 » au bout de la ligne des pastilles : ne recouvre pas le classement */}
            {ageBulle < 1 && (
              <Text style={[styles.bulle, { opacity: ageBulle < 0.7 ? 1 : Math.max(0, (1 - ageBulle) / 0.3), transform: [{ translateY: -ageBulle * 6 }] }]}>
                {`+${POINTS_COLIS * bulles.length}`}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Fenêtres : accueil, pause, fin de partie */}
      {ui !== 'jeu' && !alerteCourse && !classementOuvert && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {ui === 'accueil' && (
              <>
                <MaterialCommunityIcons name="office-building" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxSommetTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxSommetRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetRegle2')}</Text>
                <Text style={styles.record}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} />
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {ui === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                {e && <Text style={styles.texte}>{t('jeuScore', { n: e.score })}</Text>}
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} />
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={() => changerUi('jeu')} />
                <Bouton styles={styles} secondaire texte={t('jeuxSommetRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {ui === 'fin' && resultat && (
              <>
                <Ionicons name={resultat.nouveauRecord ? 'trophy' : 'flag'} size={44} color={resultat.nouveauRecord ? OR : BRAND} />
                <Text style={styles.titre}>{resultat.nouveauRecord ? t('jeuxSommetNouveauRecord') : t('jeuxSommetFinTitre')}</Text>
                <Text style={styles.texteDiscret}>
                  {resultat.cause === 'pot' ? t('jeuxSommetCausePot') : resultat.cause === 'pigeon' ? t('jeuxSommetCausePigeon') : t('jeuxSommetCauseChute')}
                </Text>
                <EtoilesFin n={resultat.etoiles} t={t} colors={colors} />
                <Text style={styles.gros}>{t('jeuScore', { n: resultat.score })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetEtageAtteint', { n: resultat.etage })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetColisRamasses', { n: resultat.colis })}</Text>
                <Text style={styles.record}>{t('jeuMeilleurScore', { n: Math.max(meilleur, resultat.score) })}</Text>
                <Bouton styles={styles} texte={t('jeuxSommetRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {reprise && ui === 'accueil' && !classementOuvert && !alerteCourse && (
        <ReprisePartie t={t} colors={colors} score={reprise.score} onReprendre={reprendrePartie} onRecommencer={recommencerPartie} />
      )}
      {/* Classement : le jeu reste arrêté derrière. */}
      {classementOuvert && ui !== 'jeu' && !alerteCourse && (
        <View style={styles.voile}>
          <ClassementJeu
            jeu={JEU}
            t={t}
            colors={colors}
            dark={dark}
            avantChargement={() => envoyerRecordEnAttente(JEU, user?.id)}
            onFermer={() => setClassementOuvert(false)}
          />
        </View>
      )}
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
      )}
    </View>
  );
}

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

const makeStyles = (c) => StyleSheet.create({
  ecran: { flex: 1 },
  haut: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  infos: {
    flex: 1, alignSelf: 'center', alignItems: 'center', backgroundColor: c.card, borderRadius: 14,
    paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border,
  },
  etage: { color: c.text, fontSize: 17, fontWeight: '800' },
  bandeau: { position: 'absolute', left: 16, right: 16 },
  pastilles: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  annonce: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card,
    borderRadius: 14, minHeight: 36, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1.5, borderColor: OR,
  },
  annonceIcone: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pileAnnonces: { position: 'absolute', left: 16, right: 16, gap: 6 },
  bulle: {
    color: OR, fontSize: 16, fontWeight: '900',
    textShadowColor: '#7A4A00', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  filet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2,
    backgroundColor: 'rgba(47,128,237,0.12)',
  },
  annonceTitre: { color: c.text, fontSize: 13, fontWeight: '800' },
  annonceTexte: { flex: 1, color: c.textSoft, fontSize: 12, lineHeight: 16 },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  gros: { color: c.text, fontSize: 28, fontWeight: '800', marginTop: 10 },
  record: { color: c.text, fontSize: 14, fontWeight: '700', marginTop: 10 },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});

// Styles qui ne dépendent pas du thème.
const stylesFixes = StyleSheet.create({
  puce: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingBottom: 4 },
  puceFond: {
    position: 'absolute', left: 8, right: 8, bottom: 5, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden',
  },
});
