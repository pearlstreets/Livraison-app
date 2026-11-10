/**
 * Mini-jeu « Tournée des toits », pour patienter entre deux courses.
 *
 * Plateforme à défilement horizontal : le livreur saute de trottoir en toit,
 * d'échafaudage en auvent, ramasse des colis, frappe les boîtes aux lettres par
 * dessous, écarte chiens, pigeons et trottinettes en leur sautant dessus et
 * livre le colis à la porte du client. Niveaux générés et toujours faisables
 * (utils/jeuToits.js), de plus en plus longs, sans fin. 3 vies par partie.
 *
 * Commandes au doigt, sans boutons : balayer à gauche ou à droite pour courir,
 * vers le haut pour sauter, vers le bas pour s'arrêter et s'accroupir (on
 * passe sous les pigeons bas), toucher l'écran pour s'arrêter (utils/gestes.js).
 * Tous les 10 colis : une vie (ou un aimant). Caisses dorées à frapper par
 * dessous : grand livreur (un coup encaissé), vol, étoile.
 * Après une chute ou un coup : reprise sûre, immobile jusqu'au prochain geste.
 *
 * Batterie : boucle arrêtée hors du jeu (pause, arrière-plan, écran quitté),
 * plafonnée à 60 images par seconde, seuls les objets à l'écran sont dessinés.
 *
 * Pause automatique : arrière-plan, écran quitté, flèche retour pendant la
 * partie, nouvelle course (hooks/usePauseJeu.js). Partie sauvegardée à chaque
 * pause et à chaque niveau (24 h, utils/partieSauvegardee.js), jamais après
 * une partie perdue. Musique propre au jeu et bruitages (components/SonJeux.js).
 * Décor : ciel dégradé, nuages, trois plans en parallaxe, panneaux Pearl
 * Streets sur les toits du fond (components/FondJeu.js).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import AlerteCourseJeu from '../components/AlerteCourseJeu';
import { EnseignePearl } from '../components/FondJeu';
import SonJeux, { bruit } from '../components/SonJeux';
import ReglagesSon from '../components/ReglagesSon';
import BandeauClassement from '../components/BandeauClassement';
import HudJeu from '../components/HudJeu';
import IndiceGestes from '../components/IndiceGestes';
import ReprisePartie from '../components/ReprisePartie';
import { useBalayage } from '../utils/gestes';
import { sauverPartie, chargerPartie, effacerPartie } from '../utils/partieSauvegardee';

import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  LARGEUR, HAUTEUR, HAUTEUR_ACCROUPI, SOL_ECRAN, VIES, POINTS, TAILLES, PALIER_PIECES, DUREES,
  creerMonde, pas, avancee, visibles, genererFond,
} from '../utils/jeuToits';

// Bruitage de chaque événement du jeu (utils/jeuToits.js).
const SONS_TOITS = {
  touche: 'choc', chute: 'choc', temps: 'sirene', ecarte: 'rebond', boite: 'ramasse', colis: 'ramasse',
  accroupi: 'accroupi', bonus: 'booster', encaisse: 'choc',
};
// Boosters affichés dans le HUD (icônes Ionicons) et objets qui sortent des caisses.
const BOOSTERS = [
  { id: 'vol', icone: 'umbrella', couleur: '#2D7FD3' },
  { id: 'etoile', icone: 'star', couleur: '#E0A100' },
  { id: 'aimant', icone: 'magnet', couleur: '#8E44AD' },
];
const SORTIES = {
  taille: { icone: 'shield-star', couleur: '#0A9A78' },
  vol: { icone: 'umbrella', couleur: '#2D7FD3' },
  etoile: { icone: 'star', couleur: '#E0A100' },
};
const IMAGE_MIN = 1000 / 60 - 1.5; // plafond : 60 images par seconde

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(type) {
  try {
    if (!Haptics) return;
    let promesse;
    if (type === 'perte') promesse = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (type === 'livre') promesse = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'fort') promesse = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else promesse = Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'toits';
const CLE_DECOR = { jour: 'jeuxToitsDecorJour', soir: 'jeuxToitsDecorSoir', nuit: 'jeuxToitsDecorNuit', pluie: 'jeuxToitsDecorPluie' };
const ICONE_ASTRE = { jour: 'white-balance-sunny', soir: 'weather-sunset', nuit: 'weather-night', pluie: 'weather-pouring' };
// Étoiles et gouttes : positions fixes, calculées une fois.
const ETOILES = Array.from({ length: 16 }, (_, i) => ({
  id: i, x: (i * 37 + 11) % 96, y: (i * 23 + 5) % 52, o: 0.45 + ((i * 7) % 5) / 10,
}));
const GOUTTES = Array.from({ length: 26 }, (_, i) => ({
  id: i, x: (i * 41 + 7) % 100, v: 1.1 + ((i * 13) % 7) / 10, p: ((i * 29) % 100) / 100,
}));
const OR = '#F2B705';
const LARGEUR_VUE = 300; // largeur de monde visible (unités)
const HAUTEUR_VUE_MIN = 330;
const BAS_DESSIN = -230; // les colonnes sont dessinées jusque sous l'écran
const TRANCHE = 240; // le décor fixe n'est recalculé qu'à chaque tranche de défilement
const PARALLAXE = 0.45;

const TOITS_MOTIF = {
  tuiles: { clair: '#B8613A', sombre: '#6E3B26' },
  briques: { clair: '#A04A3A', sombre: '#5C2B25' },
  ardoise: { clair: '#5F6B78', sombre: '#38424E' },
  terrasse: { clair: '#B7AB98', sombre: '#5E564B' },
};

// Mélange de deux couleurs #RRGGBB (k = 0 donne a, k = 1 donne b).
function melange(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (dec) => {
    const x = (pa >> dec) & 255;
    const y = (pb >> dec) & 255;
    return Math.round(x + (y - x) * k);
  };
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

// Palette selon le décor du niveau (jour, soir, nuit, pluie), le thème de l'app et le motif des toits.
function palette(dark, decor, motif) {
  const base = dark ? {
    ciel: '#13202F', fond: '#1D2C41', fondHaut: '#24364F', astre: '#E8D9A8',
    trottoir: '#4A525C', bordure: '#6B747F', toit: '#6E3B26', toitBord: '#2B2F35', fenetre: '#E2B84F',
    benne: '#246E46', benneCouvercle: '#1B5537', planche: '#9C7643', poteau: '#5E6872', rayure: '#E8E8E8',
    mur: '#3B342C', murToit: '#26211C', porte: '#8A5530', boite: '#3D7BEA', boiteVide: '#59626C',
  } : {
    ciel: '#D3EBFB', fond: '#AFC6DD', fondHaut: '#9DB6CF', astre: '#FFC93C',
    trottoir: '#97A1AB', bordure: '#C9D0D7', toit: '#B8613A', toitBord: '#4E535B', fenetre: '#F7DE97',
    benne: '#2F8F5B', benneCouvercle: '#226B44', planche: '#C79A5B', poteau: '#8C96A0', rayure: '#FFFFFF',
    mur: '#EADCC6', murToit: '#7A4B2A', porte: '#7A4B2A', boite: '#2D6CDF', boiteVide: '#9AA3AD',
  };
  const mo = TOITS_MOTIF[motif] || TOITS_MOTIF.tuiles;
  let p = { ...base, toit: dark ? mo.sombre : mo.clair };
  if (decor === 'soir') {
    p = dark
      ? { ...p, ciel: '#3A2340', fond: '#4A2D4E', fondHaut: '#5A3858', astre: '#FF8A4A', fenetre: '#FFC76B' }
      : { ...p, ciel: '#F4A66B', fond: '#B9726E', fondHaut: '#A15F63', astre: '#FF6B2C', fenetre: '#FFE0A0', trottoir: '#8C8590' };
  } else if (decor === 'nuit') {
    p = {
      ...p, ciel: '#0B1220', fond: '#16223A', fondHaut: '#1F2D4A', astre: '#EDEBD3', trottoir: '#3A414A', bordure: '#566069',
      toit: mo.sombre, toitBord: '#1E2228', fenetre: '#F2C75C', mur: '#2F2A24', murToit: '#1E1A16',
    };
  } else if (decor === 'pluie') {
    p = dark
      ? { ...p, ciel: '#1B252E', fond: '#26343F', fondHaut: '#2F4150', astre: '#9FB0BE', trottoir: '#434B54' }
      : { ...p, ciel: '#8E9EAB', fond: '#6F8190', fondHaut: '#61737F', astre: '#D7E0E6', trottoir: '#7F8A94', bordure: '#A7B1BA', fenetre: '#EBD58A' };
  }
  // Ciel en dégradé : plus soutenu en haut, clair à l'horizon.
  const eclat = decor === 'nuit' ? 0.1 : decor === 'soir' ? 0.35 : decor === 'pluie' ? 0.22 : (dark ? 0.15 : 0.55);
  p.cielHaut = melange(p.ciel, p.fondHaut, 0.55);
  p.horizon = melange(p.ciel, '#FFFFFF', eclat);
  p.loin = melange(p.fond, p.horizon, 0.55);
  p.nuage = decor === 'nuit' ? '#3A4A6B' : decor === 'pluie' ? '#B7C3CD' : decor === 'soir' ? '#FFD9B8' : '#FFFFFF';
  p.brique = decor === 'nuit' ? '#5A2E26' : '#A8523C';
  p.metal = decor === 'nuit' ? '#59636E' : '#7E8A96';
  return p;
}

// Position d'un objet du monde dans le calque (bas gauche).
function pos(x, y, w, h, s) {
  return { position: 'absolute', left: x * s, bottom: (y + SOL_ECRAN) * s, width: w * s, height: h * s };
}

// ---- Décor fixe (recalculé seulement à chaque tranche) ----
const Decor = memo(function Decor({ plateformes, porte, x1, x2, s, pal, motif }) {
  const liste = visibles(plateformes, x1, x2);
  const porteVisible = porte.x + 80 >= x1 && porte.x - 50 <= x2;
  return (
    <>
      {liste.map((p) => (p.mobile || p.fragile ? null : <Plateforme key={p.id} p={p} s={s} pal={pal} motif={motif} />))}
      {porteVisible && <Maison porte={porte} s={s} pal={pal} />}
    </>
  );
});

// Plateformes qui bougent ou s'effondrent : redessinées à chaque image.
function Dynamique({ p, s, pal, motif, horloge }) {
  if (p.mobile) return <Plateforme p={p} s={s} pal={pal} motif={motif} />;
  if (p.effondre && p.chute > 420) return null;
  const secoue = p.tombe > 0 && !p.effondre ? Math.sin(horloge * 70) * 1.6 * s : 0;
  const chute = p.effondre ? p.chute * s : 0;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: p.effondre ? Math.max(0, 1 - p.chute / 300) : 1, transform: [{ translateX: secoue }, { translateY: chute }] }]}
    >
      <Plateforme p={p} s={s} pal={pal} motif={motif} />
    </View>
  );
}

function Plateforme({ p, s, pal, motif }) {
  if (p.mobile) {
    const vertical = p.mobile.axe === 'y';
    return (
      <View style={[pos(p.x, p.y - 9, p.w, 9, s), { backgroundColor: OR, borderRadius: 3 * s, borderWidth: 1, borderColor: pal.toitBord }, styles.centre]}>
        <MaterialCommunityIcons name={vertical ? 'arrow-up-down' : 'arrow-left-right'} size={9 * s} color={pal.toitBord} />
      </View>
    );
  }
  if (p.flottante) {
    if (p.type === 'auvent') {
      const n = Math.max(3, Math.round(p.w / 16));
      return (
        <View style={pos(p.x, p.y - 10, p.w, 10, s)}>
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', borderRadius: 2 * s, overflow: 'hidden' }]}>
            {Array.from({ length: n }).map((_, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? pal.rayure : BRAND }} />
            ))}
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, top: -2 * s, height: 2 * s, backgroundColor: pal.toitBord }} />
        </View>
      );
    }
    return (
      <>
        <View style={pos(p.x + 6, BAS_DESSIN, 3, p.y - 8 - BAS_DESSIN, s)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.poteau }]} />
        </View>
        <View style={pos(p.x + p.w - 9, BAS_DESSIN, 3, p.y - 8 - BAS_DESSIN, s)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.poteau }]} />
        </View>
        <View style={[pos(p.x, p.y - 8, p.w, 8, s), { backgroundColor: pal.planche, borderRadius: 2 * s }]} />
      </>
    );
  }
  if (p.type === 'benne') {
    const base = p.base != null ? Math.min(p.base, p.y) : p.y;
    return (
      <>
        <View style={[pos(p.x, BAS_DESSIN, p.w, base - BAS_DESSIN, s), { backgroundColor: base > 0 ? pal.toit : pal.trottoir }]} />
        <View style={[pos(p.x + 2, base, p.w - 4, p.y - base, s), { backgroundColor: pal.benne, borderTopLeftRadius: 3 * s, borderTopRightRadius: 3 * s }]}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5 * s, backgroundColor: pal.benneCouvercle }} />
        </View>
      </>
    );
  }
  const toit = p.type === 'toit';
  const fenetres = [];
  if (toit) {
    const nb = Math.max(1, Math.min(4, Math.floor((p.w - 16) / 36)));
    const pasX = p.w / nb;
    [22, 58].forEach((d, r) => {
      if (p.y - d - 16 < -20) return;
      for (let i = 0; i < nb; i += 1) {
        fenetres.push(
          <View
            key={`${r}_${i}`}
            style={{
              position: 'absolute', left: (pasX * i + pasX / 2 - 6) * s, top: d * s,
              width: 12 * s, height: 16 * s, borderRadius: 2 * s, backgroundColor: pal.fenetre,
            }}
          />,
        );
      }
    });
  }
  // Motif des toits : tuiles, briques, ardoise ou toit terrasse.
  const motifs = [];
  if (toit) {
    const lignes = motif === 'ardoise' ? 3 : 4;
    const ecartL = motif === 'ardoise' ? 16 : 11;
    for (let r = 0; r < lignes; r += 1) {
      motifs.push(
        <View
          key={`l${r}`}
          style={{ position: 'absolute', left: 0, right: 0, top: (9 + r * ecartL) * s, height: Math.max(1, s), backgroundColor: 'rgba(0,0,0,0.16)' }}
        />,
      );
      if (motif === 'briques' && !p.fragile) {
        const nbJ = Math.floor(p.w / 26);
        for (let i = 0; i < nbJ; i += 1) {
          motifs.push(
            <View
              key={`j${r}_${i}`}
              style={{ position: 'absolute', left: (i * 26 + (r % 2 ? 13 : 4)) * s, top: (9 + r * ecartL) * s, width: Math.max(1, s), height: ecartL * s, backgroundColor: 'rgba(0,0,0,0.12)' }}
            />,
          );
        }
      }
    }
    if (motif === 'terrasse') {
      motifs.push(<View key="parapet" style={{ position: 'absolute', left: 0, right: 0, top: 6 * s, height: 4 * s, backgroundColor: 'rgba(255,255,255,0.22)' }} />);
    }
  }
  const fissures = p.fragile ? (
    <>
      <View style={{ position: 'absolute', left: p.w * 0.3 * s, top: 8 * s, width: 2 * s, height: 26 * s, backgroundColor: 'rgba(0,0,0,0.55)', transform: [{ rotate: '18deg' }] }} />
      <View style={{ position: 'absolute', left: p.w * 0.62 * s, top: 14 * s, width: 2 * s, height: 22 * s, backgroundColor: 'rgba(0,0,0,0.55)', transform: [{ rotate: '-24deg' }] }} />
    </>
  ) : null;
  const k = Number(p.id) || 0;
  const accessoires = [];
  const u = (v) => v * s;
  if (toit && !p.fragile && p.w >= 60) {
    if (k % 2 === 0) {
      const cx = p.w * 0.18;
      accessoires.push(
        <View key="chem" style={{ position: 'absolute', left: u(cx), top: u(-18), width: u(10), height: u(18), backgroundColor: pal.brique }}>
          <View style={{ position: 'absolute', left: u(-2), top: 0, width: u(14), height: u(4), borderRadius: u(1), backgroundColor: pal.toitBord }} />
          <View style={{ position: 'absolute', left: u(2), top: u(-9), width: u(7), height: u(7), borderRadius: u(4), backgroundColor: 'rgba(255,255,255,0.55)' }} />
          <View style={{ position: 'absolute', left: u(5), top: u(-16), width: u(5), height: u(5), borderRadius: u(3), backgroundColor: 'rgba(255,255,255,0.32)' }} />
        </View>,
      );
    }
    if (k % 3 !== 0) {
      const ax = p.w * 0.74;
      accessoires.push(
        <View key="ant" style={{ position: 'absolute', left: u(ax), top: u(-26), width: u(14), height: u(26) }}>
          <View style={{ position: 'absolute', left: u(6.3), top: 0, width: u(1.4), height: u(26), backgroundColor: pal.metal }} />
          <View style={{ position: 'absolute', left: 0, top: u(4), width: u(14), height: u(1.4), backgroundColor: pal.metal }} />
          <View style={{ position: 'absolute', left: u(2), top: u(9), width: u(10), height: u(1.4), backgroundColor: pal.metal }} />
          <View style={{ position: 'absolute', left: u(4), top: u(14), width: u(6), height: u(1.4), backgroundColor: pal.metal }} />
        </View>,
      );
    }
    if (k % 5 === 3) {
      accessoires.push(
        <View key="cuve" style={{ position: 'absolute', left: u(p.w * 0.44), top: u(-22), width: u(16), height: u(22) }}>
          <View style={{ position: 'absolute', left: u(1), bottom: 0, width: u(2), height: u(8), backgroundColor: pal.metal }} />
          <View style={{ position: 'absolute', right: u(1), bottom: 0, width: u(2), height: u(8), backgroundColor: pal.metal }} />
          <View style={{ position: 'absolute', left: 0, top: 0, width: u(16), height: u(15), borderRadius: u(3), backgroundColor: pal.planche, borderWidth: Math.max(1, s * 0.8), borderColor: pal.toitBord }} />
        </View>,
      );
    }
    if (k % 5 === 1) {
      accessoires.push(
        <View key="para" style={{ position: 'absolute', left: u(p.w * 0.46), top: u(-15) }}>
          <MaterialCommunityIcons name="satellite-uplink" size={u(16)} color={pal.metal} />
        </View>,
      );
    }
  } else if (!toit && !p.fragile && p.w >= 90 && k % 2 === 1) {
    accessoires.push(
      <View key="lampadaire" style={{ position: 'absolute', left: u(p.w * 0.8), top: u(-34), width: u(14), height: u(34) }}>
        <View style={{ position: 'absolute', left: u(6), top: u(4), width: u(2), height: u(30), backgroundColor: pal.poteau }} />
        <View style={{ position: 'absolute', left: 0, top: 0, width: u(14), height: u(6), borderTopLeftRadius: u(7), borderTopRightRadius: u(7), backgroundColor: pal.poteau }} />
        <View style={{ position: 'absolute', left: u(2), top: u(6), width: u(10), height: u(3), borderRadius: u(1.5), backgroundColor: OR }} />
      </View>,
    );
  }
  return (
    <View style={[pos(p.x, BAS_DESSIN, p.w, p.y - BAS_DESSIN, s), { backgroundColor: toit ? pal.toit : pal.trottoir }]}>
      {accessoires}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (toit ? 6 : 5) * s, backgroundColor: p.fragile ? '#C98A2B' : (toit ? pal.toitBord : pal.bordure) }} />
      {motifs}
      {fenetres}
      {fissures}
    </View>
  );
}

function Maison({ porte, s, pal }) {
  const { w, h } = TAILLES.porte;
  return (
    <>
      <View style={[pos(porte.x - 40, porte.y, w + 80, h + 40, s), { backgroundColor: pal.mur, borderTopLeftRadius: 4 * s, borderTopRightRadius: 4 * s }]}>
        <View style={{ position: 'absolute', left: -6 * s, right: -6 * s, top: -6 * s, height: 10 * s, borderRadius: 3 * s, backgroundColor: pal.murToit }} />
      </View>
      <View style={[pos(porte.x, porte.y, w, h, s), { backgroundColor: pal.porte, borderTopLeftRadius: 5 * s, borderTopRightRadius: 5 * s }]}>
        <View style={{ position: 'absolute', right: 5 * s, top: h * 0.5 * s, width: 5 * s, height: 5 * s, borderRadius: 3 * s, backgroundColor: OR }} />
      </View>
      <View style={[pos(porte.x + w / 2 - 12, porte.y + h + 8, 24, 24, s), styles.centre]}>
        <MaterialCommunityIcons name="home-variant" size={22 * s} color={BRAND} />
      </View>
    </>
  );
}

// ---- Fond : trois plans (nuages, silhouettes lointaines, immeubles proches) ----
// Un immeuble proche sur cinq porte un panneau Pearl Streets sur son toit.
const LARGEUR_ENSEIGNE = 84;
const Fond = memo(function Fond({ fond, x1, x2, s, pal }) {
  return visibles(fond, x1, x2).map((b) => {
    const cols = Math.max(1, Math.min(4, Math.floor(b.w / 17)));
    const rangs = Math.max(1, Math.min(4, Math.floor(b.h / 26)));
    const fen = [];
    for (let r = 0; r < rangs; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const allumee = (b.id * 7 + r * 3 + c * 5) % 4 === 0;
        fen.push(
          <View
            key={`${r}_${c}`}
            style={{
              position: 'absolute', left: ((c + 0.5) * b.w / cols - 3.5) * s, top: (14 + r * 22) * s,
              width: 7 * s, height: 10 * s, borderRadius: 1.5 * s,
              backgroundColor: allumee ? pal.fenetre : pal.fondHaut, opacity: allumee ? 0.9 : 0.7,
            }}
          />,
        );
      }
    }
    return (
      <View key={b.id} style={[pos(b.x, 0, b.w, b.h, s), { backgroundColor: pal.fond, borderTopLeftRadius: 3 * s, borderTopRightRadius: 3 * s }]}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6 * s, backgroundColor: pal.fondHaut }} />
        {fen}
        {b.id % 5 === 2 && (
          <EnseignePearl
            largeur={LARGEUR_ENSEIGNE * s}
            compacte
            pieds={8 * s}
            couleurSupport={pal.fondHaut}
            style={{ position: 'absolute', bottom: b.h * s, left: (b.w - LARGEUR_ENSEIGNE) * s / 2 }}
          />
        )}
      </View>
    );
  });
});

// Silhouettes de la ville au loin : bâtiments réguliers et pylônes, tirés d'un motif fixe.
const CASE_LOIN = 96;
const Lointain = memo(function Lointain({ x1, x2, s, pal }) {
  const liste = [];
  for (let i = Math.floor(x1 / CASE_LOIN); i <= Math.floor(x2 / CASE_LOIN); i += 1) {
    const h = 58 + (Math.abs(i * 53) % 64);
    const w = 52 + (Math.abs(i * 29) % 36);
    liste.push(
      <View key={i} style={[pos(i * CASE_LOIN, 14, w, h, s), { backgroundColor: pal.loin, borderTopLeftRadius: 2 * s, borderTopRightRadius: 2 * s }]}>
        {Math.abs(i) % 4 === 1 && (
          <View style={{ position: 'absolute', left: w / 2 * s - s, top: -16 * s, width: 2 * s, height: 16 * s, backgroundColor: pal.loin }} />
        )}
      </View>,
    );
  }
  return liste;
});

// Nuages : un par case, taille et hauteur variables.
const CASE_NUAGE = 230;
const Nuages = memo(function Nuages({ x1, x2, s, pal }) {
  const liste = [];
  for (let i = Math.floor(x1 / CASE_NUAGE); i <= Math.floor(x2 / CASE_NUAGE); i += 1) {
    const w = 64 + (Math.abs(i * 41) % 50);
    const x = i * CASE_NUAGE + (Math.abs(i * 71) % 80);
    const haut = 14 + (Math.abs(i * 37) % 90);
    liste.push(
      <View key={i} style={{ position: 'absolute', left: x * s, top: haut * s, width: w * s, height: 26 * s, opacity: 0.88 }}>
        <View style={{ position: 'absolute', left: 0, bottom: 0, width: w * s, height: 14 * s, borderRadius: 7 * s, backgroundColor: pal.nuage }} />
        <View style={{ position: 'absolute', left: w * 0.18 * s, bottom: 5 * s, width: w * 0.36 * s, height: 20 * s, borderRadius: 10 * s, backgroundColor: pal.nuage }} />
        <View style={{ position: 'absolute', left: w * 0.46 * s, bottom: 5 * s, width: w * 0.3 * s, height: 16 * s, borderRadius: 8 * s, backgroundColor: pal.nuage }} />
      </View>,
    );
  }
  return liste;
});

// Ciel en dégradé (bandes), soleil ou lune avec son halo.
const BANDES_CIEL = 14;
const Ciel = memo(function Ciel({ pal, decor }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: BANDES_CIEL }).map((_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: melange(pal.cielHaut, pal.horizon, i / (BANDES_CIEL - 1)) }} />
      ))}
      <View style={[styles.halo, { backgroundColor: pal.astre }]} />
      <View style={[styles.halo2, { backgroundColor: pal.astre }]} />
      <MaterialCommunityIcons name={ICONE_ASTRE[decor] || ICONE_ASTRE.jour} size={34} color={pal.astre} style={styles.astre} />
    </View>
  );
});

// ---- Éléments animés ----
// Livreur : casquette, veste Pearl, sac de livraison, jambes et bras qui balancent
// en courant, jambes repliées en l'air, ramassé sur lui-même accroupi.
function Membre({ x, bas, haut, long, large, angle, couleur, s, bout }) {
  // Le membre pivote autour de son milieu : la moitié haute reste vide, c'est l'articulation.
  return (
    <View style={{ position: 'absolute', left: x * s, bottom: bas * s, width: large * s, height: long * 2 * s, transform: [{ rotate: `${angle}deg` }] }}>
      <View style={{ position: 'absolute', left: 0, bottom: 0, width: large * s, height: (long + (haut || 0)) * s, borderRadius: large * 0.45 * s, backgroundColor: couleur }} />
      {bout ? <View style={{ position: 'absolute', left: -0.5 * s, bottom: 0, width: (large + 2) * s, height: 3 * s, borderRadius: 1.5 * s, backgroundColor: bout }} /> : null}
    </View>
  );
}

function Livreur({ j, s, clignote, accroupi, grand, vol, etoile, horloge }) {
  const marche = j.sol && Math.abs(j.vx) > 5 ? Math.sin(j.course * 0.3) : 0;
  const enAir = !j.sol;
  const u = (v) => v * s;
  const montee = enAir && j.vy > 0;
  // Angles des jambes et des bras selon l'état.
  const jambeAvant = enAir ? (montee ? -38 : -20) : marche * 42;
  const jambeArriere = enAir ? (montee ? 18 : 34) : -marche * 42;
  const brasAvant = enAir ? (montee ? -150 : -110) : -marche * 50;
  const brasArriere = enAir ? 40 : marche * 50;
  const k = accroupi ? HAUTEUR_ACCROUPI / HAUTEUR : 1;
  // Grand livreur : dessiné 20 % plus grand, pieds au même endroit.
  const g = grand ? 1.2 : 1;
  const ecart = ((HAUTEUR * (1 - k * g)) / 2) * s;
  const pouls = etoile ? 0.5 + 0.5 * Math.sin(horloge * 10) : 0;
  return (
    <View
      style={[
        pos(j.x, j.y, LARGEUR, HAUTEUR, s),
        { opacity: clignote ? 0.3 : 1, transform: [{ translateY: ecart }, { scaleX: (j.dir < 0 ? -1 : 1) * (accroupi ? 1.12 : 1) * g }, { scaleY: k * g }] },
      ]}
    >
      {/* Étoile : halo doré qui pulse */}
      {etoile ? <View style={{ position: 'absolute', left: u(-6), bottom: u(-3), width: u(32), height: u(36), borderRadius: u(16), backgroundColor: '#FFD34D', opacity: 0.25 + pouls * 0.3 }} /> : null}
      {/* Vol : parapluie ouvert au-dessus de la tête */}
      {vol ? (
        <View style={{ position: 'absolute', left: u(-2), bottom: u(28), width: u(24), height: u(22), alignItems: 'center' }}>
          <MaterialCommunityIcons name="umbrella" size={u(24)} color="#2D7FD3" />
        </View>
      ) : null}
      {/* Ombre au sol */}
      {j.sol && <View style={{ position: 'absolute', left: u(1), bottom: u(-1.5), width: u(18), height: u(3), borderRadius: u(2), backgroundColor: 'rgba(0,0,0,0.2)' }} />}
      {/* Jambe arrière et bras arrière */}
      <Membre x={5.5} bas={0} long={9} large={4.5} angle={jambeArriere} couleur="#1C2B3A" s={s} bout="#F2F2F2" />
      <Membre x={8} bas={11} long={7} large={3.6} angle={brasArriere} couleur="#0A9A78" s={s} />
      {/* Sac de livraison : coque orange, rabat, bande Pearl */}
      <View style={{ position: 'absolute', left: u(-4.5), bottom: u(9), width: u(12), height: u(15), borderRadius: u(2.5), backgroundColor: '#E8650F', borderWidth: u(1), borderColor: '#9C4208' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: u(5), borderTopLeftRadius: u(2), borderTopRightRadius: u(2), backgroundColor: '#F58634' }} />
        <View style={{ position: 'absolute', left: u(3.5), top: u(7), width: u(3.5), height: u(3.5), borderRadius: u(1.8), backgroundColor: '#FFF3E0' }} />
      </View>
      {/* Veste et col */}
      <View style={{ position: 'absolute', left: u(4), bottom: u(8), width: u(13), height: u(14), borderRadius: u(4), backgroundColor: BRAND }}>
        <View style={{ position: 'absolute', left: u(1.5), right: u(1.5), bottom: u(4), height: u(1.6), backgroundColor: '#F2F2F2', opacity: 0.85 }} />
      </View>
      {/* Jambe avant */}
      <Membre x={9} bas={0} long={9} large={4.5} angle={jambeAvant} couleur="#24384D" s={s} bout="#FFFFFF" />
      {/* Tête, casquette, écharpe */}
      <View style={{ position: 'absolute', left: u(6.5), bottom: u(21), width: u(10.5), height: u(10), borderRadius: u(5.2), backgroundColor: '#F2C79B' }} />
      <View style={{ position: 'absolute', left: u(14.2), bottom: u(24.3), width: u(1.5), height: u(1.5), borderRadius: u(0.8), backgroundColor: '#1C2B3A' }} />
      <View style={{ position: 'absolute', left: u(5.5), bottom: u(26.5), width: u(12), height: u(4.8), borderTopLeftRadius: u(5), borderTopRightRadius: u(5), backgroundColor: '#13335E' }} />
      <View style={{ position: 'absolute', left: u(14), bottom: u(26), width: u(6), height: u(1.8), borderRadius: u(1), backgroundColor: '#0B2447' }} />
      <View style={{ position: 'absolute', left: u(8), bottom: u(19.5), width: u(8), height: u(3), borderRadius: u(1.5), backgroundColor: OR }} />
      {/* Bras avant */}
      <Membre x={9.5} bas={11} long={7} large={3.6} angle={brasAvant} couleur="#0BB58E" s={s} bout="#F2C79B" />
    </View>
  );
}

// Colis brillant : carton doré avec ruban, halo qui pulse et étincelle.
function ColisBrillant({ c, m, s }) {
  const t = TAILLES.colis;
  const flot = Math.sin(m.horloge * 3 + c.id) * 2;
  const pouls = 0.5 + 0.5 * Math.sin(m.horloge * 4 + c.id);
  const u = (v) => v * s;
  return (
    <View style={pos(c.x, c.y + flot, t, t, s)}>
      <View style={{ position: 'absolute', left: u(-5), top: u(-5), width: u(t + 10), height: u(t + 10), borderRadius: u((t + 10) / 2), backgroundColor: '#FFD34D', opacity: 0.18 + pouls * 0.2 }} />
      <View style={{ position: 'absolute', left: u(1), top: u(2), width: u(t - 2), height: u(t - 3), borderRadius: u(3), backgroundColor: '#E0A24A', borderWidth: Math.max(1, u(1)), borderColor: '#A8691F' }}>
        <View style={{ position: 'absolute', left: u((t - 2) / 2 - 2), top: 0, bottom: 0, width: u(4), backgroundColor: '#FFE9A8' }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: u(3), height: u(3), backgroundColor: 'rgba(255,255,255,0.35)' }} />
      </View>
      <View style={{ position: 'absolute', right: u(-3), top: u(-4), opacity: 0.45 + pouls * 0.55, transform: [{ scale: 0.7 + pouls * 0.5 }] }}>
        <MaterialCommunityIcons name="star-four-points" size={u(10)} color="#FFFFFF" />
      </View>
    </View>
  );
}

// ---- Gêneurs dessinés, tournés vers la droite (retournés selon leur sens) ----
function Chien({ t, s }) {
  const u = (v) => v * s;
  const pa = Math.sin(t * 15) * 30;
  const queue = Math.sin(t * 20) * 28;
  const brun = '#A0672F';
  const fonce = '#6B3F1D';
  const clair = '#D9A877';
  return (
    <>
      <View style={{ position: 'absolute', left: u(0.5), bottom: u(11), width: u(3), height: u(9), borderRadius: u(1.5), backgroundColor: brun, transform: [{ rotate: `${-40 + queue}deg` }] }} />
      <Membre x={4} bas={0} long={6} large={3} angle={-pa} couleur={fonce} s={s} />
      <Membre x={15} bas={0} long={6} large={3} angle={pa} couleur={fonce} s={s} />
      <View style={{ position: 'absolute', left: u(2.5), bottom: u(5), width: u(17), height: u(9), borderRadius: u(4.5), backgroundColor: brun }}>
        <View style={{ position: 'absolute', left: u(3), right: u(4), bottom: 0, height: u(3), borderRadius: u(1.5), backgroundColor: clair }} />
        <View style={{ position: 'absolute', left: u(5), top: u(1), width: u(5), height: u(4), borderRadius: u(2), backgroundColor: fonce, opacity: 0.55 }} />
      </View>
      <Membre x={6.5} bas={0} long={6} large={3} angle={pa} couleur={brun} s={s} />
      <Membre x={17} bas={0} long={6} large={3} angle={-pa} couleur={brun} s={s} />
      <View style={{ position: 'absolute', left: u(15), bottom: u(9), width: u(9), height: u(9), borderRadius: u(4.5), backgroundColor: brun }} />
      <View style={{ position: 'absolute', left: u(20), bottom: u(9), width: u(6), height: u(5), borderRadius: u(2.5), backgroundColor: clair }} />
      <View style={{ position: 'absolute', left: u(24), bottom: u(12), width: u(2.4), height: u(2.2), borderRadius: u(1.2), backgroundColor: '#1C1C1C' }} />
      <View style={{ position: 'absolute', left: u(20.5), bottom: u(14.5), width: u(1.8), height: u(1.8), borderRadius: u(0.9), backgroundColor: '#1C1C1C' }} />
      <View style={{ position: 'absolute', left: u(15.5), bottom: u(11), width: u(4), height: u(7.5), borderRadius: u(2), backgroundColor: fonce, transform: [{ rotate: `${12 + pa * 0.15}deg` }] }} />
      <View style={{ position: 'absolute', left: u(15), bottom: u(8.5), width: u(2.4), height: u(6.5), borderRadius: u(1), backgroundColor: '#E74C3C' }} />
      <View style={{ position: 'absolute', left: u(15.3), bottom: u(8), width: u(2), height: u(2), borderRadius: u(1), backgroundColor: OR }} />
    </>
  );
}

function Pigeon({ t, s }) {
  const u = (v) => v * s;
  const bat = Math.sin(t * 16);
  return (
    <>
      <View style={{ position: 'absolute', left: u(0), bottom: u(5), width: u(7), height: u(4), borderRadius: u(1.5), backgroundColor: '#5E6A78', transform: [{ rotate: '14deg' }] }} />
      <View style={{ position: 'absolute', left: u(8), bottom: 0, width: u(1.2), height: u(3.5), backgroundColor: '#D9777A' }} />
      <View style={{ position: 'absolute', left: u(11), bottom: 0, width: u(1.2), height: u(3.5), backgroundColor: '#D9777A' }} />
      <View style={{ position: 'absolute', left: u(3), bottom: u(2.5), width: u(14), height: u(9), borderRadius: u(4.5), backgroundColor: '#8C98A6' }}>
        <View style={{ position: 'absolute', left: u(2), right: u(3), bottom: 0, height: u(3), borderRadius: u(1.5), backgroundColor: '#A9B3BF' }} />
      </View>
      <View style={{ position: 'absolute', left: u(12.5), bottom: u(6), width: u(6), height: u(7), borderRadius: u(3), backgroundColor: '#4F8A78' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: u(3), borderRadius: u(1.5), backgroundColor: '#7A5E9A' }} />
      </View>
      <View style={{ position: 'absolute', left: u(14), bottom: u(9.5), width: u(6.5), height: u(6), borderRadius: u(3.2), backgroundColor: '#6E7B8A' }} />
      <View style={{ position: 'absolute', left: u(17), bottom: u(12), width: u(2.4), height: u(2.4), borderRadius: u(1.2), backgroundColor: '#F28C28' }}>
        <View style={{ position: 'absolute', left: u(0.6), top: u(0.6), width: u(1.2), height: u(1.2), borderRadius: u(0.6), backgroundColor: '#1C1C1C' }} />
      </View>
      <View style={{ position: 'absolute', left: u(20), bottom: u(11), width: u(3), height: u(1.8), borderRadius: u(0.9), backgroundColor: '#E8A33A' }} />
      {/* Aile qui bat */}
      <View style={{ position: 'absolute', left: u(4), bottom: u(7), width: u(11), height: u(6), borderRadius: u(3), backgroundColor: '#B0BAC6', transform: [{ translateY: u(-bat * 2) }, { rotate: `${-18 - bat * 34}deg` }] }}>
        <View style={{ position: 'absolute', left: u(2), right: u(2), top: u(2), height: u(0.9), backgroundColor: '#5E6A78' }} />
        <View style={{ position: 'absolute', left: u(3), right: u(3), top: u(3.8), height: u(0.9), backgroundColor: '#5E6A78' }} />
      </View>
    </>
  );
}

function Roue({ x, s, angle }) {
  const u = (v) => v * s;
  return (
    <View style={{ position: 'absolute', left: u(x), bottom: 0, width: u(7), height: u(7), borderRadius: u(3.5), backgroundColor: '#22303C', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${angle}deg` }] }}>
      <View style={{ width: u(5), height: u(1), backgroundColor: '#9AA5B1' }} />
      <View style={{ position: 'absolute', width: u(2.4), height: u(2.4), borderRadius: u(1.2), backgroundColor: '#D7DEE5' }} />
    </View>
  );
}

function Trottinette({ t, s }) {
  const u = (v) => v * s;
  const angle = (t * 720) % 360;
  const balance = Math.sin(t * 9) * 4;
  return (
    <>
      <View style={{ position: 'absolute', left: u(21.5), bottom: u(3), width: u(2), height: u(19), borderRadius: u(1), backgroundColor: '#5E6A78', transform: [{ rotate: '10deg' }] }} />
      <View style={{ position: 'absolute', left: u(19.5), bottom: u(21), width: u(8), height: u(2), borderRadius: u(1), backgroundColor: '#22303C' }} />
      <View style={{ position: 'absolute', left: u(3), bottom: u(3), width: u(21), height: u(2.8), borderRadius: u(1.4), backgroundColor: '#1E9E8C' }} />
      <Roue x={1} s={s} angle={angle} />
      <Roue x={20} s={s} angle={angle} />
      {/* Conducteur, casque rouge, veste orange */}
      <View style={{ position: 'absolute', left: u(9), bottom: u(5.5), width: u(3), height: u(8), borderRadius: u(1.5), backgroundColor: '#2C3E50', transform: [{ rotate: '8deg' }] }} />
      <View style={{ position: 'absolute', left: u(12), bottom: u(5.5), width: u(3), height: u(8), borderRadius: u(1.5), backgroundColor: '#34495E', transform: [{ rotate: '-10deg' }] }} />
      <View style={{ position: 'absolute', left: u(8.5), bottom: u(12), width: u(8), height: u(8), borderRadius: u(3), backgroundColor: '#E67E22', transform: [{ rotate: `${balance}deg` }] }} />
      <View style={{ position: 'absolute', left: u(14), bottom: u(17), width: u(8), height: u(2.4), borderRadius: u(1.2), backgroundColor: '#D35400', transform: [{ rotate: '-12deg' }] }} />
      <View style={{ position: 'absolute', left: u(10), bottom: u(19), width: u(6), height: u(6), borderRadius: u(3), backgroundColor: '#F2C79B' }} />
      <View style={{ position: 'absolute', left: u(9.4), bottom: u(22), width: u(7.2), height: u(3.6), borderTopLeftRadius: u(3.6), borderTopRightRadius: u(3.6), backgroundColor: '#E74C3C' }} />
      <View style={{ position: 'absolute', left: u(14.2), bottom: u(21.2), width: u(1.2), height: u(1.2), borderRadius: u(0.6), backgroundColor: '#1C2B3A' }} />
    </>
  );
}

const DESSINS_GENEURS = { chien: Chien, pigeon: Pigeon, trottinette: Trottinette };

function Geneur({ e, s, aboie }) {
  const Dessin = DESSINS_GENEURS[e.type] || Chien;
  const ecarte = e.ecarte > 0;
  return (
    <View
      style={[
        pos(e.x, e.y, e.w, e.h, s),
        { opacity: ecarte ? Math.max(0, 1 - e.ecarte / 0.7) : 1, transform: [{ scaleX: e.dir > 0 ? 1 : -1 }, { rotate: ecarte ? '180deg' : '0deg' }] },
      ]}
    >
      <Dessin t={e.temps || 0} s={s} />
      {aboie && !ecarte && (
        <View style={[styles.bulle, { top: -14 * s, width: 12 * s, height: 12 * s, borderRadius: 6 * s }]}>
          <MaterialCommunityIcons name="exclamation-thick" size={9 * s} color="#fff" />
        </View>
      )}
    </View>
  );
}

// Boîte aux lettres (colis) ou caisse dorée (bonus), à frapper par-dessous.
function Boite({ b, s, pal, horloge }) {
  const u = (v) => v * s;
  const choc = b.choc > 0 ? 4 : 0;
  if (b.bonus) {
    const pouls = b.frappee ? 0 : 0.5 + 0.5 * Math.sin(horloge * 4 + b.id);
    const fond = b.frappee ? '#A08560' : OR;
    const bord = b.frappee ? '#6E5A3E' : '#A8691F';
    return (
      <View style={pos(b.x, b.y + choc, b.w, b.h, s)}>
        {!b.frappee && <View style={{ position: 'absolute', left: u(-5), top: u(-5), width: u(b.w + 10), height: u(b.h + 10), borderRadius: u(8), backgroundColor: '#FFD34D', opacity: 0.15 + pouls * 0.25 }} />}
        <View style={[StyleSheet.absoluteFill, styles.centre, { borderRadius: u(4), backgroundColor: fond, borderWidth: Math.max(1, u(1.4)), borderColor: bord }]}>
          {[[2, 2], [2, 16], [16, 2], [16, 16]].map(([x, y]) => (
            <View key={`${x}_${y}`} style={{ position: 'absolute', left: u(x), top: u(y), width: u(2.4), height: u(2.4), borderRadius: u(1.2), backgroundColor: bord }} />
          ))}
          {!b.frappee && <MaterialCommunityIcons name="gift" size={u(14)} color="#FFFFFF" />}
        </View>
      </View>
    );
  }
  const couleur = b.frappee ? pal.boiteVide : pal.boite;
  return (
    <View style={pos(b.x, b.y + choc, b.w, b.h, s)}>
      <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: u(10), borderTopRightRadius: u(10), borderBottomLeftRadius: u(2), borderBottomRightRadius: u(2), backgroundColor: couleur, borderWidth: Math.max(1, u(1)), borderColor: 'rgba(0,0,0,0.25)' }]}>
        <View style={{ position: 'absolute', left: u(2), right: u(2), top: u(2), height: u(5), borderTopLeftRadius: u(8), borderTopRightRadius: u(8), backgroundColor: 'rgba(255,255,255,0.22)' }} />
        <View style={{ position: 'absolute', left: u(5), right: u(5), top: u(9), height: u(2.2), borderRadius: u(1.1), backgroundColor: 'rgba(0,0,0,0.45)' }} />
        <View style={{ position: 'absolute', left: u(3), right: u(3), bottom: u(4), height: u(1.4), backgroundColor: 'rgba(255,255,255,0.5)' }} />
      </View>
      {/* Drapeau : levé tant qu'il reste un colis */}
      <View style={{ position: 'absolute', right: u(-3), top: u(b.frappee ? 9 : 2), width: u(1.6), height: u(10), backgroundColor: '#5E6872' }}>
        <View style={{ position: 'absolute', left: u(1.6), top: 0, width: u(4.5), height: u(3.5), backgroundColor: b.frappee ? '#8C96A0' : '#E74C3C' }} />
      </View>
    </View>
  );
}

// ---- Écran ----
export default function JeuToitsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const sty = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | livre | perdu
  const phaseRef = useRef('accueil');
  const [, setImage] = useState(0);
  const [meilleur, setMeilleur] = useState(0);
  const [nouveauRecord, setNouveauRecord] = useState(false);
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [reprise, setReprise] = useState(null); // partie sauvegardée proposée à l'ouverture
  const [nbParties, setNbParties] = useState(0); // rafraîchit le bandeau de classement
  const [dims, setDims] = useState({ l: 0, h: 0 });
  const dimsRef = useRef({ l: 0, h: 0 });

  const graineRef = useRef(Math.floor(Math.random() * 1e6));
  const mondeRef = useRef(null);
  if (!mondeRef.current) mondeRef.current = creerMonde(1, {}, graineRef.current + 1);
  const decorNiv = mondeRef.current.decor;
  const motifNiv = mondeRef.current.motif;
  const pal = useMemo(() => palette(dark, decorNiv, motifNiv), [dark, decorNiv, motifNiv]);
  const fondRef = useRef(null);
  if (!fondRef.current) fondRef.current = genererFond(1, mondeRef.current.longueur);
  const camRef = useRef({ x: -60, y: 0 });
  const cmdRef = useRef({ gauche: false, droite: false, sautTenu: false, sautAppui: false, bas: false, tenue: 0, basRestant: 0 });
  const rafRef = useRef(null);
  const dernierRef = useRef(null);
  const monteRef = useRef(true);

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  useEffect(() => {
    monteRef.current = true;
    let vivant = true;
    chargerRecord(JEU, user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); });
    return () => {
      vivant = false;
      monteRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [user?.id]);

  // Partie sauvegardée de moins de 24 h : proposée à l'ouverture.
  useEffect(() => {
    let vivant = true;
    chargerPartie(JEU, user?.id).then((p) => {
      if (vivant && p && (p.score > 0 || p.niveau > 1)) setReprise(p);
    }).catch(() => {});
    return () => { vivant = false; };
  }, [user?.id]);

  const relacherTout = useCallback(() => {
    cmdRef.current = { gauche: false, droite: false, sautTenu: false, sautAppui: false, bas: false, tenue: 0, basRestant: 0 };
  }, []);

  // Sauvegarde : niveau à jouer, score et vies.
  const sauver = useCallback((niveau) => {
    const m = mondeRef.current;
    if (!m) return;
    if (m.score <= 0 && niveau <= 1) return;
    sauverPartie(JEU, user?.id, { niveau, score: m.score, vies: m.vies, pieces: m.pieces, grand: m.grand });
  }, [user?.id]);

  const echelle = useCallback(() => {
    const { l, h } = dimsRef.current;
    if (!l || !h) return null;
    const s = Math.min(l / LARGEUR_VUE, h / HAUTEUR_VUE_MIN);
    return { s, visW: l / s, visH: h / s };
  }, []);

  const cibleCamera = useCallback((m, e) => {
    const j = m.joueur;
    const xMax = m.longueur - e.visW;
    const x = Math.max(-240, Math.min(xMax, j.x - e.visW * 0.36));
    const y = Math.max(0, j.y + HAUTEUR + 55 - (e.visH - SOL_ECRAN));
    return { x, y };
  }, []);

  const placerCamera = useCallback(() => {
    const e = echelle();
    if (!e || !mondeRef.current) return;
    camRef.current = cibleCamera(mondeRef.current, e);
  }, [cibleCamera, echelle]);

  const finir = useCallback(() => {
    const m = mondeRef.current;
    changerPhase('perdu');
    setNouveauRecord(false);
    effacerPartie(JEU, user?.id);
    bruit('perdu');
    finDePartie(JEU, user?.id, m.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setNouveauRecord(r.nouveauRecord);
      setNbParties((n) => n + 1);
      if (r.nouveauRecord) bruit('record');
    }).catch(() => {});
  }, [changerPhase, user?.id]);

  const boucleRef = useRef(null);
  boucleRef.current = (maintenant) => {
    rafRef.current = null;
    if (phaseRef.current !== 'jeu') return;
    // Écran à 90 ou 120 Hz : une image sur deux est sautée (60 par seconde au plus).
    if (dernierRef.current != null && maintenant - dernierRef.current < IMAGE_MIN) {
      rafRef.current = requestAnimationFrame((ts) => boucleRef.current(ts));
      return;
    }
    const m = mondeRef.current;
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
    const evenements = pas(m, dt, cmd);
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
      if (type === 'touche' || type === 'chute' || type === 'temps') vibrer('perte');
      else if (type === 'bonus' || type === 'encaisse') vibrer('fort');
      else if (type === 'ecarte' || type === 'boite') vibrer('fort');
      else if (type === 'colis') vibrer('leger');
      bruit(SONS_TOITS[type]);
    }
    const e = echelle();
    if (e) {
      const c = cibleCamera(m, e);
      const k = 1 - Math.exp(-dt * 8);
      camRef.current = { x: camRef.current.x + (c.x - camRef.current.x) * k, y: camRef.current.y + (c.y - camRef.current.y) * k };
    }
    if (m.etat === 'livre') {
      vibrer('livre');
      bruit('niveau');
      relacherTout();
      sauver(m.niveau + 1);
      changerPhase('livre');
    } else if (m.etat === 'perdu') {
      relacherTout();
      finir();
    }
    if (monteRef.current) setImage((i) => (i + 1) % 1000000);
    if (phaseRef.current === 'jeu') rafRef.current = requestAnimationFrame((ts) => boucleRef.current(ts));
  };

  // La boucle tourne seulement pendant le jeu.
  useEffect(() => {
    if (phase !== 'jeu') return undefined;
    dernierRef.current = null;
    rafRef.current = requestAnimationFrame((ts) => boucleRef.current(ts));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    relacherTout();
    sauver(mondeRef.current.niveau);
    changerPhase('pause');
  }, [changerPhase, relacherTout, sauver]);
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

  const lancerNiveau = useCallback((niveau, report) => {
    mondeRef.current = creerMonde(niveau, report, graineRef.current + niveau);
    fondRef.current = genererFond(niveau, mondeRef.current.longueur);
    relacherTout();
    placerCamera();
    changerPhase('jeu');
  }, [changerPhase, placerCamera, relacherTout]);

  const nouvellePartie = useCallback(() => {
    graineRef.current = Math.floor(Math.random() * 1e6);
    setNouveauRecord(false);
    setReprise(null);
    effacerPartie(JEU, user?.id);
    lancerNiveau(1, {});
  }, [lancerNiveau, user?.id]);

  const reprendrePartie = useCallback(() => {
    const p = reprise;
    setReprise(null);
    if (!p) return;
    setNouveauRecord(false);
    lancerNiveau(Math.max(1, Number(p.niveau) || 1), {
      score: Number(p.score) || 0,
      vies: Math.max(1, Math.min(VIES, Number(p.vies) || VIES)),
      pieces: Number(p.pieces) || 0,
      grand: !!p.grand,
    });
  }, [reprise, lancerNiveau]);
  const recommencerPartie = useCallback(() => {
    effacerPartie(JEU, user?.id);
    setReprise(null);
  }, [user?.id]);

  const niveauSuivant = useCallback(() => {
    const m = mondeRef.current;
    lancerNiveau(m.niveau + 1, { score: m.score, vies: m.vies, pieces: m.pieces, grand: m.grand });
  }, [lancerNiveau]);

  const reprendre = useCallback(() => {
    relacherTout();
    changerPhase('jeu');
  }, [changerPhase, relacherTout]);

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

  const surMesurePiste = useCallback((ev) => {
    const l = Math.round(ev.nativeEvent.layout.width);
    const h = Math.round(ev.nativeEvent.layout.height);
    if (l !== dimsRef.current.l || h !== dimsRef.current.h) {
      dimsRef.current = { l, h };
      setDims({ l, h });
      placerCamera();
    }
  }, [placerCamera]);

  // ---- Commandes au doigt : balayer gauche, droite, haut, bas ; toucher = s'arrêter ----
  const balayage = useBalayage({
    actif: phase === 'jeu',
    seuil: 24,
    onGauche: () => { const c = cmdRef.current; c.gauche = true; c.droite = false; c.geste = true; },
    onDroite: () => { const c = cmdRef.current; c.droite = true; c.gauche = false; c.geste = true; },
    onHaut: () => {
      const c = cmdRef.current;
      c.geste = true;
      c.sautAppui = true;
      c.sautTenu = true; // une poussée complète : le saut va à sa hauteur normale
      c.tenue = 0.3;
      c.bas = false;
      c.basRestant = 0;
      if (mondeRef.current.joueur.sol || mondeRef.current.vol > 0) bruit('saut');
    },
    onBas: () => {
      // Glisser vers le bas : le livreur s'arrête (et s'accroupit un instant).
      const c = cmdRef.current;
      c.gauche = false;
      c.droite = false;
      c.bas = true;
      c.basRestant = 0.75;
      if (mondeRef.current.joueur.sol) vibrer('leger');
    },
    onAppui: () => { const c = cmdRef.current; c.gauche = false; c.droite = false; },
  });

  // ---- Rendu ----
  const m = mondeRef.current;
  const e = dims.l && dims.h ? { s: Math.min(dims.l / LARGEUR_VUE, dims.h / HAUTEUR_VUE_MIN) } : null;
  let monde = null;
  if (e) {
    const { s } = e;
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
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -nx * s }] }]} pointerEvents="none">
          <Nuages x1={ntr * TRANCHE - 120} x2={ntr * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
        </View>
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -lx * s }, { translateY: cam.y * s * 0.12 }] }]} pointerEvents="none">
          <Lointain x1={ltr * TRANCHE - 120} x2={ltr * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
        </View>
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -fx * s }, { translateY: cam.y * s * 0.3 }] }]} pointerEvents="none">
          <Fond fond={fondRef.current} x1={ftranche * TRANCHE - 120} x2={ftranche * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
        </View>
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -cam.x * s }, { translateY: cam.y * s }] }]} pointerEvents="none">
          <Decor plateformes={m.plateformes} porte={m.porte} x1={x1} x2={x2} s={s} pal={pal} motif={m.motif} />
          {visibles(m.plateformes, vx1, vx2).map((p) => (p.mobile || p.fragile
            ? <Dynamique key={`d${p.id}`} p={p} s={s} pal={pal} motif={m.motif} horloge={m.horloge} />
            : null))}
          {visibles(m.boites, vx1, vx2).map((b) => <Boite key={`b${b.id}`} b={b} s={s} pal={pal} horloge={m.horloge} />)}
          {visibles(m.colis, vx1, vx2).map((c) => (c.pris ? null : <ColisBrillant key={`c${c.id}`} c={c} m={m} s={s} />))}
          {visibles(m.geneurs, vx1, vx2).map((g) => (g.actif ? (
            <Geneur
              key={`g${g.id}`}
              e={g}
              s={s}
              aboie={g.type === 'chien' && Math.abs(g.x - j.x) < 150 && Math.floor(g.temps * 2.5) % 3 === 0}
            />
          ) : null))}
          <Livreur j={j} s={s} clignote={clignote} accroupi={!!j.accroupi} grand={m.grand} vol={m.vol > 0} etoile={m.etoile > 0} horloge={m.horloge} />
          {m.sorties.map((o) => {
            const d = SORTIES[o.type] || SORTIES.etoile;
            return (
              <View key={o.id} style={[pos(o.x - 10, o.y + o.age * 50, 20, 20, s), styles.centre, { opacity: Math.max(0, 1 - o.age / 0.9) }]}>
                <MaterialCommunityIcons name={d.icone} size={20 * s} color={d.couleur} />
              </View>
            );
          })}
          {m.popups.map((p) => (
            <Text
              key={p.id}
              style={[styles.popup, { left: p.x * s - 30, bottom: (p.y + SOL_ECRAN + p.age * 40) * s, opacity: Math.max(0, 1 - p.age / 0.9) }]}
            >
              {p.texte}
            </Text>
          ))}
        </View>
      </>
    );
  }

  const enJeu = phase === 'jeu';
  const progression = avancee(m);
  const urgent = m.reste <= 10 && m.etat === 'jeu';
  const boosters = BOOSTERS
    .filter((b) => m[b.id] > 0)
    .map((b) => ({ ...b, ratio: m[b.id] / DUREES[b.id] }));
  if (m.grand) boosters.push({ id: 'grand', icone: 'shield-checkmark', couleur: '#0A9A78', ratio: 1 });
  const annonce = m.annonce;

  return (
    <View style={[sty.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
      <SonJeux jeu={JEU} actif={phase === 'jeu'} />
      {/* Barre du haut : quitter, niveau et chrono, pause */}
      <View style={sty.haut}>
        <Pressable onPress={quitter} style={sty.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={sty.infos}>
          <Text style={sty.niveau}>{t('jeuNiveau', { n: m.niveau })}</Text>
          <View style={sty.ligneTemps}>
            <Ionicons name="timer-outline" size={14} color={urgent ? colors.danger : colors.textMuted} />
            <Text style={[sty.chrono, urgent && { color: colors.danger }]}>{Math.max(0, Math.ceil(m.reste))}</Text>
            <Text style={sty.decorNom}>{t(CLE_DECOR[m.decor] || CLE_DECOR.jour)}</Text>
          </View>
        </View>
        <Pressable
          onPress={pause}
          disabled={!enJeu}
          style={[sty.rond, sty.rondPause, !enJeu && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityLabel={t('jeuPause')}
        >
          <Ionicons name="pause" size={22} color="#fff" />
        </Pressable>
      </View>
      {/* Rang, record et TOP 1, toujours visibles */}
      <BandeauClassement jeu={JEU} idLivreur={user?.id} score={m.score} rafraichir={nbParties} t={t} colors={colors} style={{ marginTop: 8 }} />
      <View style={sty.jauge}>
        <View style={[sty.jaugePleine, { width: `${progression * 100}%` }]} />
      </View>

      {/* Ville */}
      <View style={[sty.piste, { backgroundColor: pal.horizon }]} onLayout={surMesurePiste}>
        <Ciel pal={pal} decor={m.decor} />
        {m.decor === 'nuit' && ETOILES.map((e2) => (
          <View key={e2.id} pointerEvents="none" style={[styles.etoile, { left: `${e2.x}%`, top: `${e2.y}%`, opacity: e2.o }]} />
        ))}
        {monde}
        {m.decor === 'pluie' && GOUTTES.map((g) => {
          const k = ((m.horloge * g.v + g.p) % 1);
          return (
            <View
              key={g.id}
              pointerEvents="none"
              style={[styles.goutte, { left: `${g.x}%`, top: `${-8 + k * 112}%`, opacity: 0.55 }]}
            />
          );
        })}
        {/* Score, vies et colis du niveau, en haut de la scène */}
        <View style={styles.hud} pointerEvents="none">
          <HudJeu
            colors={colors}
            score={m.score}
            vies={m.vies}
            viesMax={VIES}
            objets={{ n: m.pieces % PALIER_PIECES, total: PALIER_PIECES, icone: 'cube', libelle: t('jeuxToitsBonusLibelle') }}
            boosters={boosters}
          />
        </View>
        {/* Annonce d'un bonus gagné, au centre de la scène */}
        {annonce && (
          <View pointerEvents="none" style={styles.annonceZone}>
            <View style={[styles.annonce, { backgroundColor: annonce.couleur, opacity: Math.min(1, (1.8 - annonce.age) / 0.4), transform: [{ scale: annonce.age < 0.15 ? 0.85 + annonce.age : 1 }] }]}>
              <MaterialCommunityIcons name={annonce.icone} size={20} color="#fff" />
              <Text style={styles.annonceTexte}>{t(annonce.cle, { n: annonce.n })}</Text>
            </View>
          </View>
        )}
        <IndiceGestes jeu={JEU} actif={phase === 'jeu'} gestes={['gauche', 'droite', 'haut', 'bas']} t={t} colors={colors} />
        {/* Couche des gestes : toute la scène */}
        <View {...balayage.panHandlers} style={StyleSheet.absoluteFill} />
      </View>

      {/* Fenêtres : accueil, pause, colis livré, fin de partie */}
      {!enJeu && (
        <View style={sty.voile}>
          <View style={sty.carte}>
            {phase === 'accueil' && (
              <>
                <MaterialCommunityIcons name="home-roof" size={44} color={BRAND} />
                <Text style={sty.titre}>{t('jeuxToitsTitre')}</Text>
                <Text style={sty.texte}>{t('jeuxToitsRegle')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuxToitsAstuce')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuxToitsAstuceDur')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuxToitsAstuceBonus')}</Text>
                <Text style={sty.record}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <ReglagesSon t={t} colors={colors} />
                <Bouton sty={sty} texte={t('jeuJouer')} onPress={nouvellePartie} />
                <Bouton sty={sty} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={sty.titre}>{t('jeuEnPause')}</Text>
                <Text style={sty.texte}>{t('jeuScore', { n: m.score })}</Text>
                <ReglagesSon t={t} colors={colors} />
                <Bouton sty={sty} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton sty={sty} secondaire texte={t('jeuxToitsRejouer')} onPress={nouvellePartie} />
                <Bouton sty={sty} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'livre' && (
              <>
                <MaterialCommunityIcons name="package-variant-closed" size={46} color={BRAND} />
                <Text style={sty.titre}>{t('jeuxToitsLivre')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuNiveauReussi', { n: m.niveau })}</Text>
                <View style={sty.lignes}>
                  <Text style={sty.texte}>{t('jeuxToitsColisNiveau', { n: m.colisNiveau })}</Text>
                  <Text style={sty.texte}>{t('jeuxToitsBonusLivraison', { n: POINTS.livraison })}</Text>
                  <Text style={sty.texte}>{t('jeuxToitsBonusTemps', { n: m.bonusTemps })}</Text>
                  <Text style={sty.scoreFort}>{t('jeuScore', { n: m.score })}</Text>
                </View>
                <Bouton sty={sty} texte={t('jeuNiveauSuivant')} onPress={niveauSuivant} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'perdu' && (
              <>
                <Ionicons name="heart-dislike" size={44} color={colors.danger} />
                <Text style={sty.titre}>{t('jeuxToitsFin')}</Text>
                <Text style={sty.texte}>{t('jeuxToitsFinTexte', { n: m.niveau })}</Text>
                <Text style={sty.scoreFort}>{t('jeuScore', { n: m.score })}</Text>
                {nouveauRecord
                  ? <Text style={sty.nouveauRecord}>{t('jeuxToitsNouveauRecord')}</Text>
                  : <Text style={sty.record}>{t('jeuMeilleurScore', { n: meilleur })}</Text>}
                <Bouton sty={sty} texte={t('jeuxToitsRejouer')} onPress={nouvellePartie} />
                <Bouton sty={sty} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {reprise && phase === 'accueil' && !classementOuvert && !alerteCourse && (
        <ReprisePartie t={t} colors={colors} niveau={reprise.niveau} score={reprise.score} onReprendre={reprendrePartie} onRecommencer={recommencerPartie} />
      )}
      {/* Classement : le jeu reste en pause derrière. */}
      {classementOuvert && !enJeu && (
        <View style={sty.voile}>
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
      {!!alerteCourse && (
        <AlerteCourseJeu alerte={alerteCourse} t={t} navigation={navigation} onVoir={voirCourse} onRester={fermerAlerte} />
      )}
    </View>
  );
}

function Bouton({ texte, onPress, secondaire, sty }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [sty.bouton, secondaire && sty.boutonSecondaire, pressed && { opacity: 0.8 }]}
    >
      <Text style={[sty.boutonTexte, secondaire && sty.boutonTexteSecondaire]}>{texte}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  astre: { position: 'absolute', top: 18, right: 22 },
  halo: { position: 'absolute', top: 2, right: 6, width: 66, height: 66, borderRadius: 33, opacity: 0.16 },
  halo2: { position: 'absolute', top: 10, right: 14, width: 50, height: 50, borderRadius: 25, opacity: 0.18 },
  hud: { position: 'absolute', top: 8, left: 8, right: 8 },
  etoile: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
  goutte: { position: 'absolute', width: 1.5, height: 14, backgroundColor: '#CFE3F2', transform: [{ rotate: '12deg' }] },
  bulle: { position: 'absolute', alignSelf: 'center', backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
  annonceZone: { position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center' },
  annonce: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 16, maxWidth: '90%' },
  annonceTexte: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  popup: { position: 'absolute', width: 60, textAlign: 'center', color: OR, fontSize: 15, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 },
});

const makeStyles = (c, dark) => StyleSheet.create({
  ecran: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  infos: { flex: 1, alignItems: 'center' },
  niveau: { color: c.text, fontSize: 17, fontWeight: '800' },
  ligneTemps: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  chrono: { color: c.textMuted, fontSize: 13, fontWeight: '800', minWidth: 22 },
  decorNom: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  jauge: { height: 6, borderRadius: 3, backgroundColor: dark ? c.borderStrong : '#E6E8EB', marginTop: 12, overflow: 'hidden' },
  jaugePleine: { height: 6, borderRadius: 3, backgroundColor: BRAND },
  piste: { flex: 1, marginTop: 10, marginBottom: 0, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  lignes: { marginTop: 4, alignItems: 'center' },
  scoreFort: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  record: { color: c.textMuted, fontSize: 14, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  nouveauRecord: { color: OR, fontSize: 17, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
