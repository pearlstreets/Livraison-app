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
 * partieSauvegardee.js). Décor : façade colorée, balcons fleuris, linge,
 * auvents, nuages ; enseigne Pearl Streets un étage sur six.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import usePauseJeu from '../hooks/usePauseJeu';
import { EnseignePearl, mesuresEnseigne } from '../components/FondJeu';
import SonJeux, { bruit } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import BandeauClassement from '../components/BandeauClassement';
import { PastilleScore } from '../components/HudJeu';
import IndiceGestes from '../components/IndiceGestes';
import ReprisePartie from '../components/ReprisePartie';
import { useBalayage } from '../utils/gestes';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';

import ClassementJeu from '../components/ClassementJeu';
import { chargerRecord, envoyerRecordEnAttente, finDePartie } from '../utils/jeuxRecords';
import {
  MONDE_L, ETAGE, JOUEUR_L, JOUEUR_H, PLAT_H, VX_MAX, POINTS_COLIS, partieNeuve, avancer,
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
const SONS_SOMMET = { rebond: 'saut', store: 'saut', trampo: 'booster', monte: 'booster', colis: 'ramasse', pigeon: 'ramasse', touche: 'choc', palier: 'niveau', fin: 'perdu' };

const JEU = 'sommet';
const HAUTEUR_MIN = 520; // hauteur de monde toujours visible (grands écrans larges)
const OR = '#F2B705';

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
      dalle: '#7A716A', dalleBord: '#958B83', console: '#5C544E', trottoir: '#3A3A3D', route: '#26262A',
      matelas: '#3D8BD9', nacelle: '#8D99A6', cable: '#9AA3AD', pot: '#C2643C', pigeon: '#B7C0C9', colis: '#C98A45',
    }
    : {
      mur: '#F3E4D4', murJoint: '#EAD7C3', vitre: '#CFE3F1', vitreAllumee: '#F6D27A', cadre: '#DCC3A9',
      dalle: '#B9B1A8', dalleBord: '#D3CCC4', console: '#9C948B', trottoir: '#C9C9CC', route: '#9EA0A6',
      matelas: '#2F80ED', nacelle: '#7D8995', cable: '#6E7781', pot: '#C2643C', pigeon: '#7A8691', colis: '#B07A3B',
    };
}

// Fenêtres allumées le soir : tirage fixe par étage, la façade ne clignote pas.
function allumee(rang, col) {
  const x = Math.sin(rang * 12.9898 + col * 78.233) * 43758.5453;
  return x - Math.floor(x) < 0.35;
}

/** Un étage de façade (4 fenêtres), redessiné seulement s'il change. */
// Un étage sur six porte l'enseigne Pearl Streets sur la façade, à la place
// des deux fenêtres du milieu. Les autres reçoivent, selon un tirage fixe par
// étage, un auvent rayé, des volets, une jardinière fleurie ou du linge.
const LARGEUR_ENSEIGNE = 108;
const COULEURS_AUVENT = ['#E8590C', '#2F9E8F', '#D6336C', '#3B82F6'];
const COULEURS_FLEURS = ['#E0457B', '#F2B705', '#FFFFFF', '#FF7A3D'];
const COULEURS_LINGE = ['#FFFFFF', '#F2B705', '#2F80ED', '#E0457B', '#2F9E8F'];
function tirage(rang, col, graine) {
  const x = Math.sin(rang * 12.9898 + col * 78.233 + graine * 37.719) * 43758.5453;
  return x - Math.floor(x);
}
const Etage = memo(function Etage({ rang, s, dark, p }) {
  const h = ETAGE * s;
  const lf = 44 * s;
  const hf = 34 * s;
  const enseigne = rang % 6 === 1;
  const hEnseigne = mesuresEnseigne(LARGEUR_ENSEIGNE * s, true).hauteur;
  const bande = rang % 2 === 0;
  const linge = !enseigne && tirage(rang, 9, 3) < 0.22;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: -(rang + 1) * h, height: h }}>
      {bande && <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: p.murJoint, opacity: 0.35 }} />}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(1, 2 * s), backgroundColor: p.murJoint }} />
      <View style={{ position: 'absolute', left: 0, width: 5 * s, top: 0, bottom: 0, backgroundColor: p.cadre, opacity: 0.8 }} />
      <View style={{ position: 'absolute', right: 0, width: 5 * s, top: 0, bottom: 0, backgroundColor: p.cadre, opacity: 0.8 }} />
      {enseigne && (
        <EnseignePearl
          largeur={LARGEUR_ENSEIGNE * s}
          compacte
          style={{ position: 'absolute', left: (MONDE_L - LARGEUR_ENSEIGNE) / 2 * s, top: (h - hEnseigne) / 2 }}
        />
      )}
      {(enseigne ? [0, 3] : [0, 1, 2, 3]).map((c) => {
        const gauche = (22 + c * 86) * s;
        const fleurs = tirage(rang, c, 1) < 0.3;
        const auvent = !fleurs && tirage(rang, c, 2) < 0.22;
        const volets = tirage(rang, c, 4) < 0.35;
        return (
          <React.Fragment key={c}>
            {volets && (
              <>
                <View style={{ position: 'absolute', left: gauche - 8 * s, top: (h - hf) / 2, width: 7 * s, height: hf, borderRadius: 1.5 * s, backgroundColor: COULEURS_AUVENT[(rang + c) % 4], opacity: 0.85 }} />
                <View style={{ position: 'absolute', left: gauche + lf + 1 * s, top: (h - hf) / 2, width: 7 * s, height: hf, borderRadius: 1.5 * s, backgroundColor: COULEURS_AUVENT[(rang + c) % 4], opacity: 0.85 }} />
              </>
            )}
            <View
              style={{
                position: 'absolute',
                left: gauche,
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
              <View style={{ position: 'absolute', left: 2 * s, top: 2 * s, width: 9 * s, height: 3 * s, borderRadius: 1.5 * s, backgroundColor: '#FFFFFF', opacity: 0.45 }} />
            </View>
            {auvent && (
              <View style={{ position: 'absolute', left: gauche - 4 * s, top: (h - hf) / 2 - 7 * s, width: lf + 8 * s, height: 8 * s, flexDirection: 'row', borderRadius: 2 * s, overflow: 'hidden' }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? '#FFFFFF' : COULEURS_AUVENT[(rang + c) % 4], borderBottomLeftRadius: 3 * s, borderBottomRightRadius: 3 * s }} />
                ))}
              </View>
            )}
            {fleurs && (
              <View style={{ position: 'absolute', left: gauche - 2 * s, top: (h - hf) / 2 + hf - 1 * s, width: lf + 4 * s, height: 9 * s }}>
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5 * s, borderRadius: 1.5 * s, backgroundColor: '#9A5B3A' }} />
                {[0, 1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute', left: (4 + i * 8) * s, bottom: 3 * s, width: 6 * s, height: 6 * s,
                      borderRadius: 3 * s, backgroundColor: COULEURS_FLEURS[(rang + c + i) % 4],
                    }}
                  />
                ))}
                <View style={{ position: 'absolute', left: 6 * s, right: 6 * s, bottom: 3 * s, height: 2.5 * s, backgroundColor: '#3FA34D', opacity: 0.9 }} />
              </View>
            )}
          </React.Fragment>
        );
      })}
      {linge && (
        <View style={{ position: 'absolute', left: 14 * s, right: 14 * s, top: 6 * s, height: 14 * s }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 1 * s, height: Math.max(1, 1.2 * s), backgroundColor: p.cable }} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              style={{
                position: 'absolute', left: (10 + i * 50) * s, top: 1 * s, width: 9 * s, height: (8 + (i % 3) * 3) * s,
                borderRadius: 1.5 * s, backgroundColor: COULEURS_LINGE[(rang + i) % 5], transform: [{ rotate: `${i % 2 ? 4 : -4}deg` }],
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
});

/** Une plateforme (balcon, nacelle, store, matelas, monte-charge). */
const Plateforme = memo(function Plateforme({ id, type, x, y, l, rot, dechire, s, p }) {
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
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: hh, borderRadius: 2 * s, backgroundColor: p.nacelle, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 * s, backgroundColor: OR }} />
        </View>
      </View>
    );
  }
  if (type === 'monte') {
    return (
      <View style={{ position: 'absolute', left, top: top - 50 * s, width: w, height: 50 * s + hh + 34 * s }}>
        <View style={{ position: 'absolute', left: w / 2 - 1 * s, top: 0, width: Math.max(1, 2 * s), height: 50 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 50 * s, height: hh, borderRadius: 2 * s, backgroundColor: OR }} />
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
        <View style={{ height: 8 * s, marginHorizontal: 6 * s, borderRadius: 4 * s, backgroundColor: p.matelas }} />
      )}
      {!trampo && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 2 * s, right: 2 * s, top: -9 * s, height: 9 * s, borderTopWidth: Math.max(1, 1.5 * s), borderTopColor: p.console, flexDirection: 'row', justifyContent: 'space-between' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={{ width: Math.max(1, 1.2 * s), height: 9 * s, backgroundColor: p.console }} />
          ))}
        </View>
      )}
      {!trampo && id % 3 === 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', right: 6 * s, top: -17 * s, width: 12 * s, alignItems: 'center' }}>
          <View style={{ width: 11 * s, height: 11 * s, borderRadius: 5.5 * s, backgroundColor: '#3FA34D' }} />
          <View style={{ width: 9 * s, height: 7 * s, marginTop: -2 * s, backgroundColor: p.pot, borderBottomLeftRadius: 3 * s, borderBottomRightRadius: 3 * s }} />
        </View>
      )}
      <View style={{ height: hh, borderRadius: 2 * s, backgroundColor: p.dalle, borderTopWidth: Math.max(1, 3 * s), borderTopColor: p.dalleBord }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 * s }}>
        <View style={{ width: 6 * s, height: 10 * s, backgroundColor: p.console, borderBottomLeftRadius: 4 * s, borderBottomRightRadius: 4 * s }} />
        <View style={{ width: 6 * s, height: 10 * s, backgroundColor: p.console, borderBottomLeftRadius: 4 * s, borderBottomRightRadius: 4 * s }} />
      </View>
    </View>
  );
});

const Colis = memo(function Colis({ x, y, s, t }) {
  const l = 24 * s;
  const flotte = Math.sin(t * 4 + x) * 2 * s;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x * s - l / 2, top: -y * s - l / 2 + flotte, width: l, height: l, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: l * 1.7, height: l * 1.7, borderRadius: l, backgroundColor: OR, opacity: 0.2 + 0.1 * Math.sin(t * 5 + x) }} />
      <View style={{ width: l, height: l * 0.86, borderRadius: 3 * s, backgroundColor: '#E0A64F', borderWidth: Math.max(1, 1.5 * s), borderColor: '#9A6A2B' }}>
        <View style={{ position: 'absolute', left: l / 2 - 2.5 * s, top: 0, bottom: 0, width: 5 * s, backgroundColor: '#FFF3D1' }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: l * 0.3, height: 3 * s, backgroundColor: '#C98A45' }} />
      </View>
      <View style={{ position: 'absolute', right: -2 * s, top: -2 * s, width: 5 * s, height: 5 * s, borderRadius: 2.5 * s, backgroundColor: '#FFFFFF', opacity: 0.55 + 0.45 * Math.sin(t * 7 + y) }} />
    </View>
  );
});

// Livreur dessiné en vues : casquette et veste de la marque, sac à dos,
// bras levés qui tiennent un colis. Il s'étire à la montée, s'écrase à la descente.
function Livreur({ x, y, rot, vx, vy, regard, s }) {
  const l = JOUEUR_L * s;
  const h = JOUEUR_H * s;
  const penche = rot || (vx / VX_MAX) * 10;
  const montee = vy > 0;
  const etire = Math.min(0.12, Math.abs(vy) / 9000);
  const echelleY = montee ? 1 + etire : 1 - etire * 0.6;
  const echelleX = montee ? 1 - etire * 0.6 : 1 + etire * 0.5;
  const pas = Math.sin(y * 0.12) * 14;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x * s - l / 2, top: -y * s - h, width: l, height: h,
        transform: [{ rotate: `${penche}deg` }, { scaleX: echelleX }, { scaleY: echelleY }],
      }}
    >
      {/* Sac de livraison dans le dos */}
      <View style={{ position: 'absolute', left: regard >= 0 ? 0 : undefined, right: regard >= 0 ? undefined : 0, top: h * 0.4, width: l * 0.4, height: h * 0.34, borderRadius: 4 * s, backgroundColor: '#E8590C', borderWidth: Math.max(1, 1.2 * s), borderColor: '#B8430A' }} />
      {/* Jambes */}
      <View style={{ position: 'absolute', left: l * 0.3, top: h * 0.74, width: 5.5 * s, height: h * 0.26, borderRadius: 2.5 * s, backgroundColor: '#2C3E57', transform: [{ rotate: `${pas}deg` }] }} />
      <View style={{ position: 'absolute', left: l * 0.52, top: h * 0.74, width: 5.5 * s, height: h * 0.26, borderRadius: 2.5 * s, backgroundColor: '#2C3E57', transform: [{ rotate: `${-pas}deg` }] }} />
      {/* Bras levés */}
      <View style={{ position: 'absolute', left: l * 0.02, top: h * 0.12, width: 5 * s, height: h * 0.4, borderRadius: 2.5 * s, backgroundColor: BRAND, transform: [{ rotate: '-18deg' }] }} />
      <View style={{ position: 'absolute', right: l * 0.02, top: h * 0.12, width: 5 * s, height: h * 0.4, borderRadius: 2.5 * s, backgroundColor: BRAND, transform: [{ rotate: '18deg' }] }} />
      {/* Veste */}
      <View style={{ position: 'absolute', left: l * 0.2, top: h * 0.36, width: l * 0.6, height: h * 0.42, borderRadius: 7 * s, backgroundColor: BRAND }}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: h * 0.09, height: Math.max(1, 2 * s), backgroundColor: '#FFFFFF', opacity: 0.8 }} />
      </View>
      {/* Tête et casquette */}
      <View style={{ position: 'absolute', left: l * 0.3, top: h * 0.2, width: l * 0.4, height: l * 0.4, borderRadius: l * 0.2, backgroundColor: '#F2C9A0' }}>
        <View style={{ position: 'absolute', left: l * 0.09, top: l * 0.17, width: 2.4 * s, height: 2.4 * s, borderRadius: 1.2 * s, backgroundColor: '#2C3E57' }} />
        <View style={{ position: 'absolute', right: l * 0.09, top: l * 0.17, width: 2.4 * s, height: 2.4 * s, borderRadius: 1.2 * s, backgroundColor: '#2C3E57' }} />
        <View style={{ position: 'absolute', left: l * 0.14, bottom: l * 0.07, width: l * 0.12, height: 1.6 * s, borderRadius: 1 * s, backgroundColor: '#B55A3C' }} />
      </View>
      <View style={{ position: 'absolute', left: l * 0.26, top: h * 0.13, width: l * 0.48, height: h * 0.12, borderTopLeftRadius: l * 0.24, borderTopRightRadius: l * 0.24, backgroundColor: BRAND }} />
      <View style={{ position: 'absolute', left: regard >= 0 ? l * 0.5 : l * 0.12, top: h * 0.22, width: l * 0.38, height: 2.5 * s, borderRadius: 1.2 * s, backgroundColor: '#D9560A' }} />
      {/* Colis tenu au-dessus de la tête */}
      <View style={{ position: 'absolute', left: l * 0.24, top: -3 * s, width: l * 0.52, height: h * 0.2, borderRadius: 2.5 * s, backgroundColor: '#E0A64F', borderWidth: Math.max(1, 1.2 * s), borderColor: '#9A6A2B' }}>
        <View style={{ position: 'absolute', left: l * 0.26 - 2 * s, top: 0, bottom: 0, width: 4 * s, backgroundColor: '#FFF3D1' }} />
      </View>
    </View>
  );
}

// Nuages qui défilent plus lentement que la façade : effet d'altitude.
const NUAGES = Array.from({ length: 8 }, (_, i) => ({
  id: i, x: (i * 97 + 20) % 300, y: 380 + i * 520 + (i % 3) * 90, l: 70 + (i % 3) * 26,
}));
const Nuages = memo(function Nuages({ cam, s, dark }) {
  const periode = 8 * 520;
  return (
    <>
      {NUAGES.map((n) => {
        const ecran = (((n.y - cam * 0.4) % periode) + periode) % periode; // hauteur à l'écran
        if (ecran > 1400) return null;
        return (
          <View key={n.id} pointerEvents="none" style={{ position: 'absolute', left: n.x * s, top: -(ecran + cam) * s, width: n.l * s, height: 26 * s, opacity: dark ? 0.2 : 0.6 }}>
            <View style={{ position: 'absolute', left: 0, bottom: 0, right: 0, height: 14 * s, borderRadius: 7 * s, backgroundColor: '#FFFFFF' }} />
            <View style={{ position: 'absolute', left: n.l * 0.18 * s, bottom: 5 * s, width: 28 * s, height: 20 * s, borderRadius: 10 * s, backgroundColor: '#FFFFFF' }} />
            <View style={{ position: 'absolute', left: n.l * 0.5 * s, bottom: 5 * s, width: 22 * s, height: 16 * s, borderRadius: 8 * s, backgroundColor: '#FFFFFF' }} />
          </View>
        );
      })}
    </>
  );
});

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
  const [resultat, setResultat] = useState(null); // { score, etage, colis, cause, nouveauRecord }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [reprise, setReprise] = useState(null); // partie sauvegardée { score, etage, colis }
  const [nbParties, setNbParties] = useState(0);
  const partieRef = useRef(null);
  const dirRef = useRef(0);
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
    sauverPartie(JEU, user?.id, { score: e.score, etage: e.etage, colis: e.colis }).catch(() => {});
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
    const base = { score: e.score, etage: e.etage, colis: e.colis, cause: e.cause, nouveauRecord: false };
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
    }
    partieRef.current = e;
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
      const dt = avant == null ? 0 : (ts - avant) / 1000;
      avant = ts;
      const evts = avancer(e, dt, dirRef.current);
      for (const ev of evts) {
        if (ev === 'colis' || ev === 'trampo' || ev === 'monte' || ev === 'pigeon') vibrer(false);
        else if (ev === 'touche') vibrer(true);
        bruit(SONS_SOMMET[ev]);
      }
      if (e.phase === 'fin') {
        terminer(e);
        return;
      }
      setImage((n) => (n + 1) % 1000000);
      id = requestAnimationFrame(image);
    };
    id = requestAnimationFrame(image);
    return () => { if (id != null) cancelAnimationFrame(id); };
  }, [ui, terminer]);

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
              {e && ui !== 'accueil' && e.plateformes.map((pl) => (
                <Plateforme key={pl.id} id={pl.id} type={pl.type} x={pl.x} y={pl.y} l={pl.l} rot={pl.rot} dechire={pl.dechire} s={s} p={p} />
              ))}
              {e && ui !== 'accueil' && <Nuages cam={cam} s={s} dark={dark} />}
              {e && ui !== 'accueil' && e.colisListe.map((c) => <Colis key={c.id} x={c.x} y={c.y} s={s} t={e.t} />)}
              {e && ui !== 'accueil' && e.pots.filter((pot) => pot.alerte <= 0).map((pot) => (
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
              <Livreur x={joueur.x} y={joueur.y} rot={joueur.rot} vx={joueur.vx} vy={joueur.vy || 0} regard={joueur.regard || 1} s={s} />
              {/* Copie du livreur au passage d'un bord */}
              {joueur.x < JOUEUR_L && <Livreur x={joueur.x + MONDE_L} y={joueur.y} rot={joueur.rot} vx={joueur.vx} vy={joueur.vy || 0} regard={joueur.regard || 1} s={s} />}
              {joueur.x > MONDE_L - JOUEUR_L && <Livreur x={joueur.x - MONDE_L} y={joueur.y} rot={joueur.rot} vx={joueur.vx} vy={joueur.vy || 0} regard={joueur.regard || 1} s={s} />}
            </View>
            {/* Alerte : un pot va tomber ici */}
            {e && ui !== 'accueil' && e.pots.filter((pot) => pot.alerte > 0).map((pot) => (
              <View key={pot.id} style={{ position: 'absolute', left: pot.x * s - 13, top: hautHud + 4 }}>
                <Ionicons name="warning" size={26} color={OR} />
              </View>
            ))}
          </View>
        )}
        {/* Annonce de palier */}
        {enJeu && e && e.annonce > 0 && e.palier > 0 && (
          <View pointerEvents="none" style={[styles.annonce, { top: hautHud + 52 }]}>
            <Text style={styles.annonceTitre}>{t('jeuxSommetPalier', { n: e.palier })}</Text>
            <Text style={styles.annonceTexte}>{t(`jeuxSommetPiege${Math.min(e.palier, 4)}`)}</Text>
          </View>
        )}
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
      {alerteCourse && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            <Ionicons name="bicycle" size={44} color={BRAND} />
            <Text style={styles.titre}>{t('jeuNouvelleCourse')}</Text>
            <Text style={styles.texte}>{t('jeuNouvelleCourseTexte')}</Text>
            <Bouton styles={styles} texte={t('jeuVoirCourse')} onPress={voirCourse} />
            <Bouton styles={styles} secondaire texte={t('jeuResterIci')} onPress={fermerAlerte} />
          </View>
        </View>
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
  pastilles: { flexDirection: 'row', gap: 8, marginTop: 8 },
  annonce: {
    position: 'absolute', left: 24, right: 24, alignItems: 'center', backgroundColor: c.card, borderRadius: 14,
    paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: OR,
  },
  annonceTitre: { color: c.text, fontSize: 17, fontWeight: '800' },
  annonceTexte: { color: c.textSoft, fontSize: 13, marginTop: 2, textAlign: 'center', lineHeight: 18 },
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
