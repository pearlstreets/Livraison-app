/**
 * Décor du mini-jeu « Tournée des toits » (screens/JeuToitsScreen.js), identique
 * à l'app client (AppUser, components/jeux/DecorToits.js) : ciel dégradé, nuages, trois plans
 * en parallaxe, plaques Pearl Streets sur les toits du fond, toits, échafaudages,
 * auvents, bennes, maison du client, livreur, drone, gêneurs, colis et caisses.
 * Ascenseurs, bassins (eau dessinée par-dessus le livreur, voir Eaux), gouttières,
 * balcons, conduits, bouches d'aération et villa d'arrivée avec la plaque Pearl Streets.
 * Dessin seul : tout suit la boucle de l'écran, sauf le halo de la perle de la villa
 * (boucle Animated sur le fil natif).
 */
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COULEURS_JEUX } from '../../utils/jeux/commun';
import { PlaqueLogo, mesurePlaque } from './FondJeu';
import { LARGEUR, HAUTEUR, HAUTEUR_ACCROUPI, SOL_ECRAN, TAILLES, visibles } from '../../utils/jeux/toits';

const MARQUE = COULEURS_JEUX.marque;

const ICONE_ASTRE = { jour: 'white-balance-sunny', soir: 'weather-sunset', nuit: 'weather-night', pluie: 'weather-pouring' };
// Étoiles et gouttes : positions fixes, calculées une fois.
export const ETOILES = Array.from({ length: 16 }, (_, i) => ({
  id: i, x: (i * 37 + 11) % 96, y: (i * 23 + 5) % 52, o: 0.45 + ((i * 7) % 5) / 10,
}));
export const GOUTTES = Array.from({ length: 26 }, (_, i) => ({
  id: i, x: (i * 41 + 7) % 100, v: 1.1 + ((i * 13) % 7) / 10, p: ((i * 29) % 100) / 100,
}));
export const OR = '#F2B705';
export const LARGEUR_VUE = 300; // largeur de monde visible (unités)
export const HAUTEUR_VUE_MIN = 330;
const BAS_DESSIN = -230; // les colonnes sont dessinées jusque sous l'écran
export const TRANCHE = 240; // le décor fixe n'est recalculé qu'à chaque tranche de défilement
export const PARALLAXE = 0.45;

const TOITS_MOTIF = {
  tuiles: { clair: '#B8613A', sombre: '#6E3B26' },
  briques: { clair: '#A04A3A', sombre: '#5C2B25' },
  ardoise: { clair: '#5F6B78', sombre: '#38424E' },
  terrasse: { clair: '#B7AB98', sombre: '#5E564B' },
  pise: { clair: '#C98A55', sombre: '#7A4E2C' },
  bambou: { clair: '#9DBA5A', sombre: '#5C7A2E' },
  bois: { clair: '#9A6B3F', sombre: '#5A3B20' },
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
export function palette(dark, decor, motif) {
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
      ...p, ciel: '#1E2E52', fond: '#2A3B60', fondHaut: '#33466F', astre: '#EDEBD3', trottoir: '#3A414A', bordure: '#566069',
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
export function pos(x, y, w, h, s) {
  return { position: 'absolute', left: x * s, bottom: (y + SOL_ECRAN) * s, width: w * s, height: h * s };
}

// ---- Décor fixe (recalculé seulement à chaque tranche) ----
export const Decor = memo(function Decor({ plateformes, porte, x1, x2, s, pal, motif, monde }) {
  const liste = visibles(plateformes, x1, x2);
  const porteVisible = porte.x + 130 >= x1 && porte.x - 110 <= x2;
  return (
    <>
      {liste.map((p) => (p.mobile && p.mobile.ascenseur ? <Rails key={`r${p.id}`} p={p} s={s} pal={pal} /> : null))}
      {liste.map((p) => (p.mobile || p.fragile ? null : <Plateforme key={p.id} p={p} s={s} pal={pal} motif={motif} monde={monde} />))}
      {porteVisible && <Villa porte={porte} s={s} pal={pal} />}
    </>
  );
});

// Plateformes qui bougent ou s'effondrent : redessinées à chaque image.
export function Dynamique({ p, s, pal, motif, horloge, monde }) {
  if (p.mobile) return <Plateforme p={p} s={s} pal={pal} motif={motif} monde={monde} />;
  if (p.effondre && p.chute > 420) return null;
  const secoue = p.tombe > 0 && !p.effondre ? Math.sin(horloge * 70) * 1.6 * s : 0;
  const chute = p.effondre ? p.chute * s : 0;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: p.effondre ? Math.max(0, 1 - p.chute / 300) : 1, transform: [{ translateX: secoue }, { translateY: chute }] }]}
    >
      <Plateforme p={p} s={s} pal={pal} motif={motif} monde={monde} />
    </View>
  );
}

// Rails fixes d'un ascenseur, de sous l'écran jusqu'au-dessus de son point haut.
function Rails({ p, s, pal }) {
  const haut = p.mobile.y0 + p.mobile.amp + HAUTEUR + 22;
  return (
    <>
      <View style={[pos(p.x - 4, BAS_DESSIN, 4, haut - BAS_DESSIN, s), { backgroundColor: pal.metal }]} />
      <View style={[pos(p.x + p.w, BAS_DESSIN, 4, haut - BAS_DESSIN, s), { backgroundColor: pal.metal }]} />
      <View style={[pos(p.x - 8, haut, p.w + 16, 6, s), { backgroundColor: pal.toitBord, borderRadius: 2 * s }]} />
      <View style={[pos(p.x + p.w / 2 - 5, haut - 4, 10, 10, s), { backgroundColor: pal.metal, borderRadius: 5 * s, borderWidth: Math.max(1, s), borderColor: pal.toitBord }]} />
    </>
  );
}

// Couleurs des bassins : fond, paroi du fond, eau.
const BASSINS = {
  fontaine: { fond: '#B9B1A2', paroi: '#D8D1C3', eau: 'rgba(64,168,224,0.5)' },
  bassin: { fond: '#6FB7D6', paroi: '#A9DDF0', eau: 'rgba(40,150,220,0.48)' },
  inonde: { fond: '#7C8790', paroi: '#9AA5AE', eau: 'rgba(70,140,190,0.5)' },
  canal: { fond: '#4F5B63', paroi: '#6E7B84', eau: 'rgba(30,105,140,0.6)' },
};

function Plateforme({ p, s, pal, motif, monde }) {
  if (p.mobile && p.mobile.ascenseur) {
    // Cabine d'ascenseur : plancher, montants et toit à claire-voie.
    const hc = HAUTEUR + 12;
    return (
      <View style={pos(p.x, p.y - 8, p.w, hc + 8, s)}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8 * s, backgroundColor: OR, borderRadius: 2 * s, borderWidth: Math.max(1, s * 0.8), borderColor: pal.toitBord }} />
        <View style={{ position: 'absolute', left: 0, bottom: 8 * s, width: 3 * s, height: hc * s, backgroundColor: pal.toitBord }} />
        <View style={{ position: 'absolute', right: 0, bottom: 8 * s, width: 3 * s, height: hc * s, backgroundColor: pal.toitBord }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4 * s, backgroundColor: pal.toitBord, borderRadius: 1 * s }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 8 * s + (hc * s) / 2, height: 2 * s, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      </View>
    );
  }
  if (p.mobile) {
    const vertical = p.mobile.axe === 'y';
    return (
      <View style={[pos(p.x, p.y - 9, p.w, 9, s), { backgroundColor: OR, borderRadius: 3 * s, borderWidth: 1, borderColor: pal.toitBord }, styles.centre]}>
        <MaterialCommunityIcons name={vertical ? 'arrow-up-down' : 'arrow-left-right'} size={9 * s} color={pal.toitBord} />
      </View>
    );
  }
  if (p.flottante) {
    if (p.type === 'balcon') {
      // Balcon : dalle, consoles dessous et jardinière fleurie.
      return (
        <View style={pos(p.x, p.y - 18, p.w, 18, s)}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 7 * s, backgroundColor: pal.bordure, borderRadius: 2 * s, borderBottomWidth: Math.max(1, s), borderColor: pal.toitBord }} />
          <View style={{ position: 'absolute', left: 6 * s, top: 7 * s, width: 5 * s, height: 9 * s, backgroundColor: pal.poteau, borderBottomLeftRadius: 4 * s }} />
          <View style={{ position: 'absolute', right: 6 * s, top: 7 * s, width: 5 * s, height: 9 * s, backgroundColor: pal.poteau, borderBottomRightRadius: 4 * s }} />
          <View style={{ position: 'absolute', left: p.w * 0.3 * s, width: p.w * 0.4 * s, top: 7 * s, height: 6 * s, backgroundColor: pal.planche, borderRadius: 1.5 * s }}>
            <View style={{ position: 'absolute', left: 2 * s, top: -3 * s, width: 4 * s, height: 4 * s, borderRadius: 2 * s, backgroundColor: '#E2557A' }} />
            <View style={{ position: 'absolute', right: 2 * s, top: -3 * s, width: 4 * s, height: 4 * s, borderRadius: 2 * s, backgroundColor: OR }} />
          </View>
        </View>
      );
    }
    if (p.type === 'conduit') {
      // Conduit de ventilation suspendu : tuyau rond, colliers et tiges de suspension.
      const n = Math.max(2, Math.floor(p.w / 24));
      return (
        <>
          <View style={pos(p.x + 8, p.y - 2, 2, 46, s)}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.poteau }]} />
          </View>
          <View style={pos(p.x + p.w - 10, p.y - 2, 2, 46, s)}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.poteau }]} />
          </View>
          <View style={[pos(p.x, p.y - 10, p.w, 10, s), { backgroundColor: pal.metal, borderRadius: 5 * s, overflow: 'hidden' }]}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 2 * s, height: 2 * s, backgroundColor: 'rgba(255,255,255,0.35)' }} />
            {Array.from({ length: n }).map((_, i) => (
              <View key={i} style={{ position: 'absolute', left: ((p.w * (i + 0.5)) / n - 1) * s, top: 0, bottom: 0, width: 2 * s, backgroundColor: 'rgba(0,0,0,0.25)' }} />
            ))}
          </View>
        </>
      );
    }
    if (p.type === 'auvent') {
      const n = Math.max(3, Math.round(p.w / 16));
      return (
        <View style={pos(p.x, p.y - 10, p.w, 10, s)}>
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', borderRadius: 2 * s, overflow: 'hidden' }]}>
            {Array.from({ length: n }).map((_, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? pal.rayure : MARQUE }} />
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
  if (p.type === 'bassin') {
    // Bassin : fond et paroi carrelée ; l'eau est dessinée par-dessus le livreur (Eaux).
    const c = BASSINS[p.variante] || BASSINS.bassin;
    const haut = (p.eau || p.y + 40) + 8 - p.y;
    const lignes = Math.floor(haut / 12);
    return (
      <>
        <View style={[pos(p.x, BAS_DESSIN, p.w, p.y - BAS_DESSIN, s), { backgroundColor: p.variante === 'fontaine' || p.variante === 'canal' ? pal.trottoir : pal.toit }]} />
        <View style={[pos(p.x, p.y, p.w, haut, s), { backgroundColor: c.paroi, overflow: 'hidden' }]}>
          {Array.from({ length: lignes }).map((_, i) => (
            <View key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: (i + 1) * 12 * s, height: Math.max(1, s * 0.8), backgroundColor: 'rgba(0,0,0,0.12)' }} />
          ))}
        </View>
        <View style={[pos(p.x, p.y - 5, p.w, 5, s), { backgroundColor: c.fond }]} />
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
  const motifNeuf = motif === 'pise' || motif === 'bambou' || motif === 'bois';
  if (toit && motif === 'pise') {
    // Pisé : terre lissée au bord arrondi, quelques fissures, bouts de poutres sous le bord.
    motifs.push(<View key="lisse" style={{ position: 'absolute', left: -1 * s, right: -1 * s, top: -3 * s, height: 9 * s, borderTopLeftRadius: 5 * s, borderTopRightRadius: 5 * s, backgroundColor: '#D9A06B' }} />);
    const nbP = Math.max(2, Math.min(7, Math.floor(p.w / 30)));
    for (let i = 0; i < nbP; i += 1) {
      motifs.push(<View key={`pou${i}`} style={{ position: 'absolute', left: ((p.w * (i + 0.5)) / nbP - 3) * s, top: 9 * s, width: 6 * s, height: 4 * s, borderRadius: 1.5 * s, backgroundColor: '#6B4426', borderWidth: Math.max(1, s * 0.5), borderColor: '#4A2E18' }} />);
    }
    const kp = Number(p.id) || 0;
    motifs.push(
      <View key="fis1" style={{ position: 'absolute', left: (p.w * (0.2 + (kp % 3) * 0.2)) * s, top: 16 * s, width: Math.max(1, s * 0.9), height: 12 * s, backgroundColor: 'rgba(0,0,0,0.22)', transform: [{ rotate: '14deg' }] }} />,
      <View key="fis2" style={{ position: 'absolute', left: (p.w * (0.55 + (kp % 2) * 0.2)) * s, top: 22 * s, width: Math.max(1, s * 0.9), height: 9 * s, backgroundColor: 'rgba(0,0,0,0.18)', transform: [{ rotate: '-20deg' }] }} />,
    );
  } else if (toit && motif === 'bambou') {
    // Bambou : tiges verticales serrées, nœuds alignés.
    const nbT = Math.max(3, Math.min(26, Math.floor(p.w / 9)));
    for (let i = 1; i < nbT; i += 1) {
      motifs.push(<View key={`tig${i}`} style={{ position: 'absolute', left: ((p.w * i) / nbT) * s, top: 6 * s, width: Math.max(1, s), height: 40 * s, backgroundColor: 'rgba(0,0,0,0.2)' }} />);
    }
    [17, 31].forEach((d) => motifs.push(<View key={`noeud${d}`} style={{ position: 'absolute', left: 0, right: 0, top: d * s, height: Math.max(1, s * 1.4), backgroundColor: 'rgba(60,80,20,0.45)' }} />));
    motifs.push(<View key="lustre" style={{ position: 'absolute', left: 0, right: 0, top: 7 * s, height: 2 * s, backgroundColor: 'rgba(255,255,255,0.2)' }} />);
  } else if (toit && motif === 'bois') {
    // Bois : planches horizontales, joints décalés.
    for (let r = 0; r < 5; r += 1) {
      motifs.push(<View key={`pl${r}`} style={{ position: 'absolute', left: 0, right: 0, top: (8 + r * 8) * s, height: Math.max(1, s), backgroundColor: 'rgba(0,0,0,0.22)' }} />);
      const nbJ = Math.floor(p.w / 44);
      for (let i = 0; i < nbJ; i += 1) {
        motifs.push(<View key={`pj${r}_${i}`} style={{ position: 'absolute', left: (i * 44 + (r % 2 ? 22 : 8)) * s, top: (8 + r * 8) * s, width: Math.max(1, s), height: 8 * s, backgroundColor: 'rgba(0,0,0,0.16)' }} />);
      }
    }
  }
  if (toit && !motifNeuf) {
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
  if (p.gouttiere && monde === 'jungle') {
    // Jungle : la gouttière devient une liane (même prise pour grimper).
    const n = Math.max(2, Math.floor((p.y - BAS_DESSIN) / 22));
    accessoires.push(
      <View key="gouttiere" style={{ position: 'absolute', left: u(-5), top: u(-6), bottom: 0, width: u(8) }}>
        <View style={{ position: 'absolute', left: u(2.5), top: 0, bottom: 0, width: u(3), borderRadius: u(1.5), backgroundColor: '#3F7A2A' }} />
        <View style={{ position: 'absolute', left: 0, top: u(-2), width: u(8), height: u(6), borderRadius: u(3), backgroundColor: '#4E9A34' }} />
        {Array.from({ length: n }).map((_, i) => (
          <View key={i} style={{ position: 'absolute', left: i % 2 ? u(4.5) : u(-3.5), top: u(10 + i * 22), width: u(7), height: u(4), borderRadius: u(2.5), backgroundColor: i % 3 ? '#5DAA3C' : '#3E8A2C', transform: [{ rotate: i % 2 ? '-30deg' : '30deg' }] }} />
        ))}
      </View>,
    );
  } else if (p.gouttiere) {
    // Gouttière sur la façade : tuyau, colliers et cuvette en haut.
    const n = Math.max(2, Math.floor((p.y - BAS_DESSIN) / 34));
    accessoires.push(
      <View key="gouttiere" style={{ position: 'absolute', left: u(-5), top: u(-4), bottom: 0, width: u(7) }}>
        <View style={{ position: 'absolute', left: u(1), top: u(4), bottom: 0, width: u(5), backgroundColor: pal.metal, borderLeftWidth: Math.max(1, s * 0.8), borderColor: 'rgba(255,255,255,0.35)' }} />
        <View style={{ position: 'absolute', left: u(-2), top: 0, width: u(11), height: u(6), borderRadius: u(1.5), backgroundColor: pal.metal, borderWidth: Math.max(1, s * 0.8), borderColor: pal.toitBord }} />
        {Array.from({ length: n }).map((_, i) => (
          <View key={i} style={{ position: 'absolute', left: 0, top: u(16 + i * 34), width: u(9), height: u(3), backgroundColor: pal.toitBord }} />
        ))}
      </View>,
    );
  }
  if (p.bouche) {
    // Bouche d'aération : grille dans le toit, on s'y glisse vers le bas.
    accessoires.push(
      <View key="bouche" style={{ position: 'absolute', left: u(p.bouche.x - p.x), top: u(-2), width: u(p.bouche.w), height: u(7), borderRadius: u(1.5), backgroundColor: '#22262B', borderWidth: Math.max(1, s * 0.8), borderColor: pal.metal, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' }}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: u(2), height: u(4), backgroundColor: pal.metal }} />)}
      </View>,
      <View key="indice" style={{ position: 'absolute', left: u(p.bouche.x - p.x + p.bouche.w / 2 - 6), top: u(-16) }}>
        <MaterialCommunityIcons name="chevron-double-down" size={u(12)} color={OR} />
      </View>,
    );
  }
  if (p.sortieConduit) {
    // Sortie du conduit : bouche de ventilation ouverte sur le toit.
    accessoires.push(
      <View key="sortie" style={{ position: 'absolute', left: u(42), top: u(-15), width: u(36), height: u(15) }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: u(5), borderRadius: u(2), backgroundColor: pal.toitBord }} />
        <View style={{ position: 'absolute', left: u(3), right: u(3), top: u(4), bottom: 0, backgroundColor: pal.metal }}>
          <View style={{ position: 'absolute', left: u(4), right: u(4), top: u(2), height: u(5), borderRadius: u(1), backgroundColor: '#22262B' }} />
        </View>
      </View>,
    );
  }
  // Habillage du monde : neige et glaçons (hiver), feuillages (jungle), plaque de glace.
  const dessus = [];
  const neige = monde === 'hiver' && toit;
  if (neige) {
    dessus.push(<View key="neige" style={{ position: 'absolute', left: u(-2.5), right: u(-2.5), top: u(-5), height: u(10), borderRadius: u(5), backgroundColor: '#FFFFFF', borderBottomWidth: Math.max(1, s * 0.8), borderColor: '#D6E4F0' }} />);
    const nbG = 3 + (k % 3);
    for (let i = 0; i < nbG; i += 1) {
      const gx = 4 + ((i * 37 + k * 13) % Math.max(8, p.w - 10));
      const gl = 5 + ((i * 7 + k) % 4) * 1.6;
      dessus.push(<View key={`glacon${i}`} style={{ position: 'absolute', left: u(gx), top: u(5), width: 0, height: 0, borderLeftWidth: u(1.8), borderRightWidth: u(1.8), borderTopWidth: u(gl), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(205,232,250,0.95)' }} />);
    }
  }
  if (monde === 'jungle' && toit && !p.fragile && k % 3 !== 1) {
    const gauche = k % 2 === 0;
    [0, 1, 2].forEach((i) => {
      const lx = gauche ? -4 + i * 7 : p.w - 14 - i * 7;
      dessus.push(<View key={`feuille${i}`} style={{ position: 'absolute', left: u(lx), top: u(-4 + i * 3), width: u(14 - i * 2), height: u(9 + i * 3), borderRadius: u(6), backgroundColor: i % 2 ? '#3E8A2C' : '#5DAA3C', transform: [{ rotate: `${(gauche ? -1 : 1) * (18 + i * 10)}deg` }] }} />);
    });
  }
  if (p.glace && p.glace.x2 > p.glace.x1) {
    const gx1 = Math.max(p.x, p.glace.x1) - p.x;
    const gw = Math.min(p.x + p.w, p.glace.x2) - p.x - gx1;
    if (gw > 0) {
      dessus.push(
        <View key="glace" style={{ position: 'absolute', left: u(gx1), top: u(neige ? -8 : -3), width: u(gw), height: u(5), borderRadius: u(2), backgroundColor: 'rgba(178,224,250,0.8)', borderWidth: Math.max(1, s * 0.6), borderColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: u(gw * 0.15), top: u(1), width: u(Math.min(14, gw * 0.3)), height: u(1.2), borderRadius: u(0.6), backgroundColor: '#FFFFFF' }} />
          <View style={{ position: 'absolute', left: u(gw * 0.6), top: u(1), width: u(Math.min(8, gw * 0.18)), height: u(1.2), borderRadius: u(0.6), backgroundColor: 'rgba(255,255,255,0.8)' }} />
        </View>,
      );
    }
  }
  return (
    <View style={[pos(p.x, BAS_DESSIN, p.w, p.y - BAS_DESSIN, s), { backgroundColor: toit ? pal.toit : pal.trottoir }]}>
      {accessoires}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (toit ? 6 : 5) * s, backgroundColor: p.fragile ? '#C98A2B' : (toit ? pal.toitBord : pal.bordure) }} />
      {motifs}
      {fenetres}
      {fissures}
      {dessus}
    </View>
  );
}

// Perle dans une fenêtre de la villa : halo qui pulse en boucle (fil natif).
function PerleBrillante({ taille }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    boucle.start();
    return () => boucle.stop();
  }, [v]);
  const halo = taille * 2.6;
  const perle = taille;
  return (
    <View pointerEvents="none" style={{ width: halo, height: halo, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: halo, height: halo, borderRadius: halo / 2, backgroundColor: 'rgba(10,154,120,0.7)',
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute', width: halo * 0.62, height: halo * 0.62, borderRadius: halo * 0.31, backgroundColor: 'rgba(120,226,190,0.85)',
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.7] }),
        }}
      />
      <View style={{ width: perle, height: perle, borderRadius: perle / 2, backgroundColor: '#0A9A78', borderWidth: Math.max(1, perle * 0.06), borderColor: '#07765C' }}>
        <View style={{ position: 'absolute', left: perle * 0.2, top: perle * 0.16, width: perle * 0.32, height: perle * 0.26, borderRadius: perle * 0.16, backgroundColor: '#E6FFF6' }} />
        <View style={{ position: 'absolute', right: perle * 0.16, bottom: perle * 0.14, width: perle * 0.24, height: perle * 0.2, borderRadius: perle * 0.12, backgroundColor: 'rgba(110,220,180,0.6)' }} />
      </View>
    </View>
  );
}

// Villa du client, à l'arrivée : deux étages, baie vitrée, balcon, toit terrasse
// planté, plaque Pearl Streets sur la façade et une perle qui brille à la fenêtre.
function Villa({ porte, s, pal }) {
  const { w, h } = TAILLES.porte;
  const u = (v) => v * s;
  const X = porte.x - 86;
  const W = 196;
  const H1 = 68;
  const H2 = 56;
  const y1 = porte.y;
  const y2 = porte.y + H1;
  const y3 = y2 + H2;
  const vitre = pal.fenetre;
  const cadre = pal.murToit;
  const fenetre = (x, y, l, ht, cle) => (
    <View key={cle} style={[pos(x, y, l, ht, s), { backgroundColor: vitre, borderWidth: u(2), borderColor: cadre, borderRadius: u(2) }]}>
      <View style={{ position: 'absolute', left: (l / 2 - 2) * s, top: 0, bottom: 0, width: u(1.5), backgroundColor: cadre }} />
    </View>
  );
  const hauteurPlaque = Math.max(24, u(16));
  const { l: lPlaque } = mesurePlaque(hauteurPlaque);
  return (
    <>
      {/* Rez-de-chaussée et étage */}
      <View style={[pos(X, y1, W, H1, s), { backgroundColor: pal.mur, borderTopLeftRadius: u(2), borderTopRightRadius: u(2) }]} />
      <View style={[pos(X + 10, y2, W - 20, H2, s), { backgroundColor: pal.mur }]} />
      <View style={[pos(X - 4, y2 - 4, W + 8, 6, s), { backgroundColor: cadre, borderRadius: u(2) }]} />
      {/* Toit terrasse : dalle, garde-corps vitré, plantes */}
      <View style={[pos(X + 4, y3, W - 8, 6, s), { backgroundColor: cadre, borderRadius: u(2) }]} />
      <View style={[pos(X + 6, y3 + 6, W - 12, 12, s), { backgroundColor: 'rgba(190,225,245,0.45)', borderTopWidth: u(1.5), borderColor: pal.metal }]} />
      {[14, 52, W - 60, W - 26].map((dx, i) => (
        <View key={`pot${i}`} style={pos(X + dx, y3 + 6, 14, 22, s)}>
          <View style={{ position: 'absolute', left: u(2), right: u(2), bottom: 0, height: u(8), backgroundColor: '#B8613A', borderBottomLeftRadius: u(2), borderBottomRightRadius: u(2) }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: u(15), borderRadius: u(7), backgroundColor: i % 2 ? '#3E9B57' : '#2F7F47' }} />
        </View>
      ))}
      {/* Baie vitrée à gauche de la porte */}
      <View style={[pos(X + 10, y1 + 6, 64, 44, s), { backgroundColor: vitre, borderWidth: u(2), borderColor: cadre, borderRadius: u(2), flexDirection: 'row', justifyContent: 'space-evenly' }]}>
        {[0, 1].map((i) => <View key={i} style={{ width: u(1.5), height: '100%', backgroundColor: cadre }} />)}
      </View>
      {/* Porte d'entrée, auvent doré, lampes */}
      <View style={[pos(porte.x - 6, porte.y + h, w + 12, 5, s), { backgroundColor: OR, borderRadius: u(2) }]} />
      <View style={[pos(porte.x, porte.y, w, h, s), { backgroundColor: pal.porte, borderTopLeftRadius: u(4), borderTopRightRadius: u(4) }]}>
        <View style={{ position: 'absolute', left: u(5), right: u(5), top: u(6), height: u(14), borderRadius: u(2), backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ position: 'absolute', right: u(5), top: h * 0.55 * s, width: u(5), height: u(5), borderRadius: u(3), backgroundColor: OR }} />
      </View>
      {fenetre(porte.x + w + 14, y1 + 18, 26, 30, 'f1')}
      {/* Arbustes devant la façade */}
      <View style={[pos(X - 10, y1, 22, 16, s), { backgroundColor: '#2F7F47', borderTopLeftRadius: u(11), borderTopRightRadius: u(11) }]} />
      <View style={[pos(X + W - 12, y1, 22, 18, s), { backgroundColor: '#3E9B57', borderTopLeftRadius: u(11), borderTopRightRadius: u(11) }]} />
      {/* Étage : fenêtre de la perle, plaque Pearl Streets, porte-fenêtre et balcon */}
      <View style={[pos(X + 22, y2 + 10, 34, 36, s), { backgroundColor: '#2B3A55', borderWidth: u(2.5), borderColor: OR, borderTopLeftRadius: u(17), borderTopRightRadius: u(17), alignItems: 'center', justifyContent: 'center', overflow: 'visible' }]}>
        <PerleBrillante taille={u(13)} />
      </View>
      <View style={[pos(X + W / 2 - lPlaque / 2 / s, y2 + 26, lPlaque / s, hauteurPlaque / s, s)]}>
        <PlaqueLogo hauteur={hauteurPlaque} />
      </View>
      {fenetre(X + W - 58, y2 + 6, 30, 40, 'f2')}
      <View style={[pos(X + W - 70, y2 + 4, 54, 4, s), { backgroundColor: cadre, borderRadius: u(1) }]} />
      <View style={[pos(X + W - 70, y2 + 8, 54, 12, s), { borderWidth: u(1.5), borderBottomWidth: 0, borderColor: pal.toitBord, flexDirection: 'row', justifyContent: 'space-evenly' }]}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: u(1.5), height: '100%', backgroundColor: pal.toitBord }} />)}
      </View>
    </>
  );
}

// Eau des bassins, dessinée par-dessus le livreur : il y paraît immergé.
// Les bassins profonds (plongées) sont dessinés à part (PlongeesFond et PlongeesEau).
export function Eaux({ eaux, x1, x2, s, horloge }) {
  return visibles(eaux || [], x1, x2).map((e) => {
    if (e.profond) return null;
    const c = BASSINS[e.variante] || BASSINS.bassin;
    const prof = e.eau - e.y;
    const vague = Math.sin(horloge * 2.2 + e.id) * 3 * s;
    return (
      <View key={e.id} pointerEvents="none" style={[pos(e.x, e.y, e.w, prof, s), { backgroundColor: e.vert ? 'rgba(52,140,80,0.52)' : c.eau, overflow: 'hidden' }]}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3 * s, backgroundColor: 'rgba(255,255,255,0.55)' }} />
        {[0.2, 0.55, 0.85].map((k, i) => (
          <View key={`v${i}`} style={{ position: 'absolute', left: e.w * k * s - 8 * s, top: 5 * s, width: 16 * s, height: 1.5 * s, borderRadius: s, backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ translateX: i % 2 ? -vague : vague }] }} />
        ))}
        {[0, 1, 2].map((i) => {
          const montee = (horloge * 18 + i * 23) % Math.max(10, prof - 6);
          return (
            <View key={`b${i}`} style={{ position: 'absolute', left: (e.w * (0.25 + i * 0.25)) * s, bottom: montee * s, width: 3 * s, height: 3 * s, borderRadius: 1.5 * s, borderWidth: Math.max(1, s * 0.5), borderColor: 'rgba(255,255,255,0.7)' }} />
          );
        })}
      </View>
    );
  });
}

// ---- Plongée : bassin profond entre deux immeubles ----
// Couleurs de l'eau, de la surface vers le fond (bleu, ou vert dans la jungle).
const EAU_PROFONDE = { bleu: ['#7FCBEA', '#1A4F7E'], vert: ['#86C98E', '#1E4A2E'] };
const BANDES_EAU = 7;
// Derrière le livreur : socle sous le fond, eau opaque en dégradé, rayons de lumière.
export function PlongeesFond({ plongees, x1, x2, s, pal, horloge }) {
  return visibles(plongees || [], x1, x2).map((b) => {
    const [haut, bas] = b.vert ? EAU_PROFONDE.vert : EAU_PROFONDE.bleu;
    const prof = Math.max(10, b.eau - b.fond);
    const n = Number(b.id) || 0;
    return (
      <React.Fragment key={`pf${b.id}`}>
        <View style={[pos(b.x, BAS_DESSIN, b.w, b.fond - BAS_DESSIN, s), { backgroundColor: pal.murToit || '#5E564B' }]}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4 * s, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        </View>
        <View style={[pos(b.x, b.fond, b.w, prof, s), { overflow: 'hidden' }]}>
          {Array.from({ length: BANDES_EAU }).map((_, i) => (
            <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: ((prof * i) / BANDES_EAU) * s, height: (prof / BANDES_EAU + 1) * s, backgroundColor: melange(haut, bas, i / (BANDES_EAU - 1)) }} />
          ))}
          {[0, 1].map((i) => (
            <View key={`r${i}`} style={{ position: 'absolute', left: (b.w * (0.25 + i * 0.4) + Math.sin(horloge * 0.8 + i + n) * 8) * s, top: 0, width: 14 * s, height: prof * 0.75 * s, backgroundColor: 'rgba(255,255,255,0.08)', transform: [{ rotate: '12deg' }] }} />
          ))}
        </View>
      </React.Fragment>
    );
  });
}

// Par-dessus le livreur : voile d'eau léger (il reste visible), surface qui ondule, bulles, reflets.
export function PlongeesEau({ plongees, x1, x2, s, horloge }) {
  return visibles(plongees || [], x1, x2).map((b) => {
    const prof = Math.max(10, b.eau - b.fond);
    const n = Number(b.id) || 0;
    const teinte = b.vert ? '40,120,60' : '30,100,170';
    const onde = Math.sin(horloge * 2.4 + n) * 1.5;
    return (
      <View key={`pe${b.id}`} pointerEvents="none" style={[pos(b.x, b.fond, b.w, prof, s), { overflow: 'hidden' }]}>
        {[0, 1, 2].map((i) => (
          <View key={`v${i}`} style={{ position: 'absolute', left: 0, right: 0, top: ((prof * i) / 3) * s, height: (prof / 3 + 1) * s, backgroundColor: `rgba(${teinte},${0.14 + i * 0.1})` }} />
        ))}
        <View style={{ position: 'absolute', left: 0, right: 0, top: (1 + onde) * s, height: 3 * s, borderRadius: 1.5 * s, backgroundColor: 'rgba(255,255,255,0.7)' }} />
        {[0.15, 0.45, 0.75].map((k, i) => (
          <View key={`o${i}`} style={{ position: 'absolute', left: (b.w * k + Math.sin(horloge * 2 + i * 2 + n) * 6) * s, top: (5 + Math.cos(horloge * 2.4 + i) * 1.5) * s, width: 18 * s, height: 1.5 * s, borderRadius: s, backgroundColor: 'rgba(255,255,255,0.45)' }} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const v = 14 + ((i * 7 + n) % 5) * 4;
          const montee = (horloge * v + i * 37 + n * 11) % Math.max(12, prof - 6);
          const r = 2 + ((i + n) % 3);
          const bx = ((i * 0.17 + n * 0.13) % 0.9 + 0.05) * b.w + Math.sin(horloge * 3 + i) * 3;
          return (
            <View key={`b${i}`} style={{ position: 'absolute', left: bx * s, bottom: montee * s, width: r * s, height: r * s, borderRadius: (r / 2) * s, borderWidth: Math.max(1, s * 0.5), borderColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(255,255,255,0.15)' }} />
          );
        })}
      </View>
    );
  });
}

// Murs d'algues : brins en trois segments qui ondulent, bout arrondi du côté libre.
export function Algues({ algues, x1, x2, s, horloge }) {
  return visibles(algues || [], x1, x2).map((a) => {
    const nb = Math.max(2, Math.min(7, Math.round(a.w / 7)));
    const larg = a.w / nb;
    const n = Number(a.id) || 0;
    const duFond = a.depuis !== 'surface';
    return (
      <View key={`al${a.id}`} pointerEvents="none" style={pos(a.x, a.y, a.w, a.h, s)}>
        {Array.from({ length: nb }).map((_, i) => {
          const hb = a.h * (0.86 + ((i * 5 + n) % 4) * 0.05);
          const seg = hb / 3;
          const couleur = i % 2 ? '#2E8B3E' : '#3FA14B';
          return [0, 1, 2].map((g) => {
            const ecart = Math.sin(horloge * 1.8 + i * 0.9 + n + g * 0.6) * (1.2 + g * 1.6);
            const bout = g === 2;
            const st = {
              position: 'absolute', left: (i * larg - larg * 0.1 + ecart) * s, width: larg * 1.2 * s, height: (seg + 1) * s, backgroundColor: couleur,
            };
            if (duFond) {
              st.bottom = g * seg * s;
              if (bout) { st.borderTopLeftRadius = larg * 0.6 * s; st.borderTopRightRadius = larg * 0.6 * s; }
            } else {
              st.top = g * seg * s;
              if (bout) { st.borderBottomLeftRadius = larg * 0.6 * s; st.borderBottomRightRadius = larg * 0.6 * s; }
            }
            return <View key={`${i}_${g}`} style={st} />;
          });
        })}
      </View>
    );
  });
}

// Poissons (orange ou jaunes) et requins (gris bleu, aileron, mâchoire claire), tournés vers la droite puis retournés.
export function Poissons({ poissons, x1, x2, s, horloge }) {
  const u = (v) => v * s;
  return visibles(poissons || [], x1, x2).map((p) => {
    if (!p.actif) return null;
    const n = Number(p.id) || 0;
    const nage = Math.sin(horloge * (p.type === 'requin' ? 5 : 9) + n) * 14;
    const alerte = Math.max(0, Math.min(1, p.alerte || 0));
    if (p.type === 'requin') {
      const w = p.w || 54;
      const h = p.h || 22;
      const charge = !!p.charge;
      return (
        <View key={`po${p.id}`} pointerEvents="none" style={[pos(p.x, p.y, w, h, s), { transform: [{ scaleX: p.dir < 0 ? -1 : 1 }, { rotate: charge ? '-6deg' : '0deg' }, { scale: charge ? 1.08 : 1 }] }]}>
          {alerte > 0 && <View style={{ position: 'absolute', left: u(-6), top: u(-6), width: u(w + 12), height: u(h + 12), borderRadius: u(h), backgroundColor: '#E74C3C', opacity: 0.12 + alerte * 0.2 }} />}
          <View style={{ position: 'absolute', left: u(-1), top: u(h * 0.22), width: u(12), height: u(h * 0.56), borderTopLeftRadius: u(2), borderBottomLeftRadius: u(2), borderTopRightRadius: u(6), borderBottomRightRadius: u(6), backgroundColor: '#5C7488', transform: [{ rotate: `${nage * 0.6}deg` }] }} />
          <View style={{ position: 'absolute', left: u(w * 0.38), top: u(-6), width: 0, height: 0, borderLeftWidth: u(4), borderRightWidth: u(8), borderBottomWidth: u(9), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#5C7488' }} />
          <View style={{ position: 'absolute', left: u(8), right: 0, top: u(2), bottom: u(2), borderTopLeftRadius: u(h * 0.4), borderBottomLeftRadius: u(h * 0.4), borderTopRightRadius: u(h * 0.6), borderBottomRightRadius: u(h * 0.45), backgroundColor: '#6F8AA0' }}>
            <View style={{ position: 'absolute', left: u(6), right: u(4), bottom: 0, height: u(h * 0.32), borderRadius: u(h * 0.2), backgroundColor: '#DCE6EE' }} />
          </View>
          <View style={{ position: 'absolute', right: u(5), bottom: u(h * 0.3), width: u(charge ? 12 : 9), height: u(charge ? 3 : 1.6), borderRadius: u(1), backgroundColor: charge ? '#FFFFFF' : '#3A4A58' }} />
          <View style={{ position: 'absolute', right: u(11), top: u(h * 0.32), width: u(2.6), height: u(2.6), borderRadius: u(1.3), backgroundColor: alerte > 0.5 ? '#E74C3C' : '#1C2B3A' }} />
          {alerte > 0 && (
            <View style={[styles.bulle, { position: 'absolute', alignSelf: undefined, left: u(w * 0.62), top: u(-16), width: u(11), height: u(11), borderRadius: u(5.5), opacity: 0.4 + alerte * 0.6 }]}>
              <MaterialCommunityIcons name="exclamation-thick" size={u(8)} color="#fff" />
            </View>
          )}
        </View>
      );
    }
    const w = p.w || 22;
    const h = p.h || 12;
    const jaune = n % 2 === 1;
    const corps = jaune ? '#F2C230' : '#F07F2A';
    const nageoire = jaune ? '#D9A31A' : '#C95E17';
    return (
      <View key={`po${p.id}`} pointerEvents="none" style={[pos(p.x, p.y, w, h, s), { transform: [{ scaleX: p.dir < 0 ? -1 : 1 }] }]}>
        <View style={{ position: 'absolute', left: 0, top: u(h * 0.15), width: u(7), height: u(h * 0.7), borderTopLeftRadius: u(1), borderBottomLeftRadius: u(1), borderTopRightRadius: u(4), borderBottomRightRadius: u(4), backgroundColor: nageoire, transform: [{ rotate: `${nage}deg` }] }} />
        <View style={{ position: 'absolute', left: u(5), right: 0, top: 0, bottom: 0, borderRadius: u(h / 2), backgroundColor: corps }}>
          <View style={{ position: 'absolute', left: u(5), top: 0, bottom: 0, width: u(2.4), backgroundColor: 'rgba(255,255,255,0.65)' }} />
        </View>
        <View style={{ position: 'absolute', right: u(4), top: u(h * 0.3), width: u(2.2), height: u(2.2), borderRadius: u(1.1), backgroundColor: '#1C2B3A' }} />
      </View>
    );
  });
}

// Tornades du désert : signe au sol avant (tourbillon qui grossit, icône qui clignote), puis entonnoir qui ondule.
const ANNEAUX_TORNADE = 9;
export function Tornades({ tornades, x1, x2, s, horloge }) {
  const u = (v) => v * s;
  return (tornades || []).map((t) => {
    if (t.x + 80 < x1 || t.x - 80 > x2) return null;
    const age = t.age || 0;
    if (t.etat === 'alerte') {
      const k = Math.min(1, age / 1.5);
      const lg = 18 + k * 34;
      const clign = Math.floor(horloge * 6) % 2 === 0;
      return (
        <React.Fragment key={`to${t.id}`}>
          {[0, 1, 2].map((i) => (
            <View key={i} pointerEvents="none" style={[pos(t.x - (lg * (1 - i * 0.2)) / 2, t.y + i * 5, lg * (1 - i * 0.2), 7, s), { borderRadius: u(4), backgroundColor: `rgba(190,160,115,${0.5 - i * 0.1})`, transform: [{ translateX: Math.sin(horloge * 9 + i * 2) * u(3) }, { scaleY: 0.8 + 0.2 * Math.cos(horloge * 7 + i) }] }]} />
          ))}
          <View pointerEvents="none" style={[pos(t.x - 12, t.y + 34, 24, 24, s), styles.centre, { opacity: clign ? 1 : 0.35 }]}>
            <MaterialCommunityIcons name="weather-tornado" size={u(22)} color="#8A6A3E" />
          </View>
        </React.Fragment>
      );
    }
    let fondu = 1;
    if (t.etat === 'finie') {
      if (age >= 1) return null;
      fondu = 1 - age;
    } else if (t.etat !== 'active') {
      return null;
    }
    const h = t.h || 260;
    const w = t.w || 56;
    const pasH = h / ANNEAUX_TORNADE;
    return (
      <View key={`to${t.id}`} pointerEvents="none" style={[pos(t.x - w * 1.2, t.y, w * 2.4, h, s), { opacity: fondu * 0.85 }]}>
        {Array.from({ length: ANNEAUX_TORNADE }).map((_, i) => {
          const k = i / (ANNEAUX_TORNADE - 1);
          const lg = 12 + (w * 2.2 - 12) * k * k * 0.9 + k * 10;
          const ondule = Math.sin(horloge * 5 + i * 0.7) * (3 + k * 9);
          return (
            <View
              key={i}
              style={{
                position: 'absolute', left: (w * 1.2 - lg / 2 + ondule) * s, bottom: i * pasH * s, width: lg * s, height: (pasH + 4) * s,
                borderRadius: (pasH / 2 + 2) * s, backgroundColor: melange('#B9A27E', '#8E8676', (i % 3) / 3), opacity: 0.55 + 0.25 * Math.sin(horloge * 8 + i),
              }}
            />
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const a = horloge * 6 + i * 1.6;
          const hy = ((horloge * 40 + i * 60) % (h * 0.85)) + 10;
          const r = 8 + (hy / h) * w;
          return (
            <View key={`d${i}`} style={{ position: 'absolute', left: (w * 1.2 + Math.cos(a) * r - 2) * s, bottom: hy * s, width: u(4), height: u(3), borderRadius: u(0.8), backgroundColor: i % 2 ? '#6B4A2A' : '#5E6872', transform: [{ rotate: `${(a * 57) % 360}deg` }] }} />
          );
        })}
      </View>
    );
  });
}

// ---- Fond : trois plans (nuages, silhouettes lointaines, immeubles proches) ----
// Un immeuble proche sur cinq porte un panneau Pearl Streets sur son toit.
// Plaque Pearl Streets posée sur deux pieds, sur le toit d'un immeuble du fond.
function Enseigne({ largeur, pieds, couleurSupport, style }) {
  const hauteur = Math.max(24, largeur / 3);
  const { l } = mesurePlaque(hauteur);
  return (
    <View pointerEvents="none" style={[{ width: Math.max(largeur, l), alignItems: 'center' }, style]}>
      <PlaqueLogo hauteur={hauteur} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: Math.max(largeur, l) * 0.6, height: pieds }}>
        <View style={{ width: 3, height: pieds, backgroundColor: couleurSupport }} />
        <View style={{ width: 3, height: pieds, backgroundColor: couleurSupport }} />
      </View>
    </View>
  );
}

const LARGEUR_ENSEIGNE = 84;
export const Fond = memo(function Fond({ fond, x1, x2, s, pal }) {
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
          <Enseigne
            largeur={LARGEUR_ENSEIGNE * s}
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
export const Lointain = memo(function Lointain({ x1, x2, s, pal }) {
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
export const Nuages = memo(function Nuages({ x1, x2, s, pal }) {
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
export const Ciel = memo(function Ciel({ pal, decor }) {
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

export function Livreur({ j, s, clignote, accroupi, grand, vol, etoile, horloge }) {
  const marche = j.sol && Math.abs(j.vx) > 5 ? Math.sin(j.course * 0.3) : 0;
  const enAir = !j.sol;
  const u = (v) => v * s;
  const montee = enAir && j.vy > 0;
  // Angles des jambes et des bras selon l'état.
  const jambeAvant = enAir ? (montee ? -38 : -20) : marche * 42;
  const jambeArriere = enAir ? (montee ? 18 : 34) : -marche * 42;
  // Drone : les deux bras levés, accrochés à la poignée.
  const brasAvant = vol ? -168 : enAir ? (montee ? -150 : -110) : -marche * 50;
  const brasArriere = vol ? 170 : enAir ? 40 : marche * 50;
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
      {/* Vol : petit drone qui soulève le livreur */}
      {vol ? <Drone s={s} horloge={horloge} /> : null}
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
      <View style={{ position: 'absolute', left: u(4), bottom: u(8), width: u(13), height: u(14), borderRadius: u(4), backgroundColor: MARQUE }}>
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

// Drone de livraison au-dessus du livreur : poignée, câbles, corps bleu, deux
// bras et hélices qui tournent (dessiné seulement pendant le vol, la boucle du
// jeu tourne déjà : aucune animation en plus).
function Drone({ s, horloge }) {
  const u = (v) => v * s;
  const h1 = 0.25 + 0.75 * Math.abs(Math.sin(horloge * 55));
  const h2 = 0.25 + 0.75 * Math.abs(Math.cos(horloge * 55));
  const tangage = Math.sin(horloge * 6) * 3;
  return (
    <View style={{ position: 'absolute', left: u(-6), bottom: u(24), width: u(32), height: u(26), transform: [{ rotate: `${tangage}deg` }] }}>
      {/* Poignée tenue à bout de bras et câble (en partie caché par la tête) */}
      <View style={{ position: 'absolute', left: u(11), bottom: 0, width: u(10), height: u(2), borderRadius: u(1), backgroundColor: '#22303C' }} />
      <View style={{ position: 'absolute', left: u(15.4), bottom: u(1), width: u(1.2), height: u(16), backgroundColor: '#5E6A78' }} />
      {/* Bras et moteurs */}
      <View style={{ position: 'absolute', left: u(1), bottom: u(20.5), width: u(30), height: u(1.8), borderRadius: u(0.9), backgroundColor: '#22303C' }} />
      <View style={{ position: 'absolute', left: u(2), bottom: u(21), width: u(3), height: u(3), borderRadius: u(0.8), backgroundColor: '#22303C' }} />
      <View style={{ position: 'absolute', left: u(27), bottom: u(21), width: u(3), height: u(3), borderRadius: u(0.8), backgroundColor: '#22303C' }} />
      {/* Hélices : leur largeur bat, elles semblent tourner */}
      <View style={{ position: 'absolute', left: u(3.5 - 6 * h1), bottom: u(24), width: u(12 * h1), height: u(1.6), borderRadius: u(0.8), backgroundColor: 'rgba(205,215,225,0.9)' }} />
      <View style={{ position: 'absolute', left: u(28.5 - 6 * h2), bottom: u(24), width: u(12 * h2), height: u(1.6), borderRadius: u(0.8), backgroundColor: 'rgba(205,215,225,0.9)' }} />
      {/* Corps, reflet et voyant */}
      <View style={{ position: 'absolute', left: u(9), bottom: u(16), width: u(14), height: u(7), borderRadius: u(3), backgroundColor: '#2D7FD3', borderWidth: Math.max(1, u(0.8)), borderColor: '#1B5A9E' }}>
        <View style={{ position: 'absolute', left: u(2), right: u(2), top: u(1), height: u(2), borderRadius: u(1), backgroundColor: 'rgba(255,255,255,0.4)' }} />
      </View>
      <View style={{ position: 'absolute', left: u(15), bottom: u(15), width: u(2), height: u(2), borderRadius: u(1), backgroundColor: OR }} />
    </View>
  );
}

// Jauge d'un bonus en cours (même dessin que HudJeu, icône MaterialCommunityIcons pour le drone).
export function Booster({ icone, couleur, ratio }) {
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <View style={[styles.booster, { backgroundColor: couleur }]}>
      <MaterialCommunityIcons name={icone} size={16} color="#fff" />
      <View style={styles.boosterFond}>
        <View style={[styles.boosterPlein, { width: `${r * 100}%` }]} />
      </View>
    </View>
  );
}

// Colis brillant : carton doré avec ruban, halo qui pulse et étincelle.
export function ColisBrillant({ c, m, s }) {
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

export function Geneur({ e, s, aboie }) {
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
export function Boite({ b, s, pal, horloge }) {
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

export const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  astre: { position: 'absolute', top: 18, right: 22 },
  halo: { position: 'absolute', top: 2, right: 6, width: 66, height: 66, borderRadius: 33, opacity: 0.16 },
  halo2: { position: 'absolute', top: 10, right: 14, width: 50, height: 50, borderRadius: 25, opacity: 0.18 },
  booster: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 9, height: 28 },
  boosterFond: { width: 44, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  boosterPlein: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  etoile: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
  goutte: { position: 'absolute', width: 1.5, height: 14, backgroundColor: '#CFE3F2', transform: [{ rotate: '12deg' }] },
  bulle: { position: 'absolute', alignSelf: 'center', backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
});
