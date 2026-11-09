/**
 * Dessins du mini-jeu « Drone express » (screens/JeuDroneScreen.js), tout en
 * Views : ciel en dégradé, soleil ou lune, nuages, immeubles détaillés avec
 * accessoires de toit, grues à treillis, enseignes suspendues, poteaux
 * électriques, lampadaires, drone à quatre rotors avec son colis, colis
 * lumineux et client à son balcon. Aucune image, aucun fichier à charger.
 *
 * Les tailles sont données en pixels (déjà multipliées par l'échelle k du
 * jeu). Les composants sont mémorisés : ils ne se redessinent pas à chaque
 * image, seuls les conteneurs animés bougent.
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BRAND } from '../contexts/ThemeContext';

export const OR = '#F2B705';
const OR_FONCE = '#C98F00';
const VERT = '#2ecc71';

function versRvb(h) {
  const s = String(h).replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mélange deux couleurs hexadécimales (p de 0 à 1). */
export function melange(a, b, p) {
  const A = versRvb(a);
  const B = versRvb(b);
  const m = A.map((v, i) => Math.round(v + (B[i] - v) * p));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Générateur reproductible (pour que le décor ne change pas à chaque rendu). */
export function generateur(graine) {
  let g = graine;
  return () => {
    g = (g * 9301 + 49297) % 233280;
    return g / 233280;
  };
}

// ---------------------------------------------------------------------------
// Ciel
// ---------------------------------------------------------------------------

/** Ciel en dégradé : bandes de couleur du haut (sombre) vers l'horizon (clair). */
export const Ciel = memo(function Ciel({ haut, bas, n = 10 }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: melange(haut, bas, i / (n - 1)) }} />
      ))}
    </View>
  );
});

/** Soleil avec halo (jour) ou lune en croissant avec étoiles (nuit). */
export const Astre = memo(function Astre({ dark, largeur, hauteur, couleurCiel }) {
  const r = Math.max(16, Math.min(largeur, hauteur) * 0.055);
  const x = largeur * 0.78;
  const y = hauteur * 0.1;
  if (!dark) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[[4.2, 0.1], [3, 0.16], [2.1, 0.26]].map(([m, a], i) => (
          <View
            key={i}
            style={{
              position: 'absolute', left: x - r * m / 2, top: y - r * m / 2, width: r * m, height: r * m,
              borderRadius: r * m, backgroundColor: '#FFF1B8', opacity: a,
            }}
          />
        ))}
        <View style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#FFE27A' }} />
        <View style={{ position: 'absolute', left: x - r * 0.6, top: y - r * 0.7, width: r * 0.7, height: r * 0.5, borderRadius: r, backgroundColor: '#FFF6CF', opacity: 0.8 }} />
      </View>
    );
  }
  const alea = generateur(33);
  const etoiles = Array.from({ length: 22 }).map((_, i) => ({
    i, x: alea() * largeur, y: alea() * hauteur * 0.4, s: 1.5 + alea() * 2, o: 0.45 + alea() * 0.5,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {etoiles.map((e) => (
        <View key={e.i} style={{ position: 'absolute', left: e.x, top: e.y, width: e.s, height: e.s, borderRadius: e.s, backgroundColor: '#fff', opacity: e.o }} />
      ))}
      <View style={{ position: 'absolute', left: x - r * 2, top: y - r * 2, width: r * 4, height: r * 4, borderRadius: r * 2, backgroundColor: '#C9D6FF', opacity: 0.12 }} />
      <View style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#F1F4FF' }} />
      <View style={{ position: 'absolute', left: x - r * 0.45, top: y - r * 1.1, width: r * 1.9, height: r * 1.9, borderRadius: r, backgroundColor: couleurCiel }} />
    </View>
  );
});

function Nuage({ l, couleur }) {
  const c = couleur;
  return (
    <View style={{ width: l, height: l * 0.5 }}>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: l * 0.28, borderRadius: l * 0.14, backgroundColor: c }} />
      <View style={{ position: 'absolute', bottom: l * 0.12, left: l * 0.12, width: l * 0.34, height: l * 0.34, borderRadius: l * 0.17, backgroundColor: c }} />
      <View style={{ position: 'absolute', bottom: l * 0.14, left: l * 0.36, width: l * 0.44, height: l * 0.44, borderRadius: l * 0.22, backgroundColor: c }} />
      <View style={{ position: 'absolute', bottom: l * 0.1, left: l * 0.64, width: l * 0.28, height: l * 0.28, borderRadius: l * 0.14, backgroundColor: c }} />
      <View style={{ position: 'absolute', bottom: 0, left: l * 0.06, right: l * 0.06, height: l * 0.05, borderRadius: l * 0.03, backgroundColor: 'rgba(110,135,170,0.22)' }} />
    </View>
  );
}

/** Nuages tirés une fois par taille d'écran. */
export function listeNuages(largeur, hauteur, graine) {
  const alea = generateur(graine);
  const liste = [];
  let x = alea() * 60;
  while (x < largeur) {
    liste.push({ x, y: hauteur * (0.06 + alea() * 0.3), l: 70 + alea() * 90 });
    x += 110 + alea() * 150;
  }
  return liste;
}

/** Bande de nuages qui défile en boucle (deux copies côte à côte). */
export const CoucheNuages = memo(function CoucheNuages({ liste, decalage, largeur, couleur }) {
  const bande = (cle) => (
    <View key={cle} style={{ width: largeur, height: '100%' }}>
      {liste.map((n, i) => (
        <View key={i} style={{ position: 'absolute', left: n.x, top: n.y }}>
          <Nuage l={n.l} couleur={couleur} />
        </View>
      ))}
    </View>
  );
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row', width: largeur * 2, transform: [{ translateX: decalage }] }}>
      {bande('a')}
      {bande('b')}
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Silhouettes de la ville en arrière-plan (avec fenêtres allumées et toits)
// ---------------------------------------------------------------------------

/** Immeubles lointains : largeur, hauteur, antenne et fenêtres allumées. */
export function silhouettes(largeurPx, hauteurMin, hauteurMax, graine, avecFenetres) {
  const alea = generateur(graine);
  const liste = [];
  let x = 0;
  while (x < largeurPx) {
    const l = 28 + alea() * 46;
    const lc = Math.min(l, largeurPx - x);
    const h = hauteurMin + alea() * (hauteurMax - hauteurMin);
    const fen = [];
    if (avecFenetres) {
      const cols = Math.max(1, Math.floor((lc - 6) / 10));
      const rows = Math.max(1, Math.floor((h - 14) / 15));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (alea() < 0.32) fen.push({ x: 4 + c * ((lc - 8) / cols), y: 8 + r * 15 });
        }
      }
    }
    liste.push({ x, l: lc, h, antenne: alea() < 0.25, toit: Math.floor(alea() * 3), fen });
    x += l + 2;
  }
  return liste;
}

/** Un immeuble lointain : fenêtres allumées, bord d'ombre et accessoire de toit. */
export const SilhouetteImmeuble = memo(function SilhouetteImmeuble({ b, couleur, couleurFenetre, bas, porteur }) {
  return (
    <View style={{ position: 'absolute', left: b.x, bottom: bas, width: b.l, height: b.h, backgroundColor: couleur }}>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: Math.max(3, b.l * 0.16), backgroundColor: 'rgba(0,0,0,0.1)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.22)' }} />
      {b.fen.map((f, i) => (
        <View key={i} style={{ position: 'absolute', left: f.x, top: f.y, width: 5, height: 7, borderRadius: 1, backgroundColor: couleurFenetre, opacity: 0.85 }} />
      ))}
      {b.antenne && !porteur && (
        <>
          <View style={{ position: 'absolute', top: -16, left: b.l / 2 - 1, width: 2, height: 16, backgroundColor: couleur }} />
          <View style={{ position: 'absolute', top: -17, left: b.l / 2 - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: '#E74C3C' }} />
        </>
      )}
      {!b.antenne && !porteur && b.toit === 1 && (
        <View style={{ position: 'absolute', top: -7, left: b.l * 0.2, width: b.l * 0.34, height: 7, backgroundColor: couleur }} />
      )}
      {!b.antenne && !porteur && b.toit === 2 && (
        <>
          <View style={{ position: 'absolute', top: -10, left: b.l * 0.62, width: 3, height: 10, backgroundColor: couleur }} />
          <View style={{ position: 'absolute', top: -13, left: b.l * 0.62 - 3, width: 9, height: 4, borderRadius: 2, backgroundColor: couleur }} />
        </>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Rue : lampadaires qui défilent au premier plan
// ---------------------------------------------------------------------------

export const PERIODE_LAMPE = 330; // unités du jeu entre deux lampadaires

/** Lampadaires espacés régulièrement, posés sur le trottoir. */
export const Lampadaires = memo(function Lampadaires({ decalage, largeur, k, bas, dark, couleur }) {
  const periode = PERIODE_LAMPE * k;
  const nb = Math.ceil(largeur / periode) + 3;
  const H = 150 * k;
  const e = Math.max(3, 5 * k);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, bottom: bas - 2 * k, height: H + 20 * k, width: nb * periode, flexDirection: 'row', transform: [{ translateX: decalage }] }}
    >
      {Array.from({ length: nb }).map((_, i) => (
        <View key={i} style={{ width: periode, height: '100%' }}>
          <View style={{ position: 'absolute', left: periode * 0.5 - e * 1.6, bottom: 0, width: e * 3.2, height: 7 * k, borderRadius: 2, backgroundColor: couleur }} />
          <View style={{ position: 'absolute', left: periode * 0.5 - e / 2, bottom: 0, width: e, height: H, backgroundColor: couleur }} />
          <View style={{ position: 'absolute', left: periode * 0.5 - e / 2, bottom: H - e, width: 26 * k, height: e, backgroundColor: couleur, borderRadius: 2 }} />
          <View style={{ position: 'absolute', left: periode * 0.5 + 16 * k, bottom: H - e - 4 * k, width: 20 * k, height: 8 * k, borderRadius: 4 * k, backgroundColor: dark ? '#FFD87A' : '#FFF3C4' }} />
          {dark && (
            <View style={{ position: 'absolute', left: periode * 0.5 + 8 * k, bottom: H - 40 * k, width: 44 * k, height: 44 * k, borderRadius: 22 * k, backgroundColor: '#FFD87A', opacity: 0.16 }} />
          )}
        </View>
      ))}
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Immeubles de la piste (en bas) et leurs accessoires de toit
// ---------------------------------------------------------------------------

function AccessoireToit({ type, w, k, couleur, pal }) {
  const u = Math.max(1, k);
  if (type === 0) {
    return (
      <View style={{ position: 'absolute', top: -26 * u, left: w * 0.62, width: 2 * u, height: 26 * u, backgroundColor: pal.poteau }}>
        <View style={{ position: 'absolute', top: 5 * u, left: -6 * u, width: 14 * u, height: 2 * u, backgroundColor: pal.poteau }} />
        <View style={{ position: 'absolute', top: 11 * u, left: -4 * u, width: 10 * u, height: 2 * u, backgroundColor: pal.poteau }} />
        <View style={{ position: 'absolute', top: -2 * u, left: -1 * u, width: 4 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: '#E74C3C' }} />
      </View>
    );
  }
  if (type === 1) {
    return (
      <View style={{ position: 'absolute', top: -14 * u, left: w * 0.16, width: w * 0.42, height: 14 * u, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: pal.trottoir }}>
        <View style={{ position: 'absolute', top: 3 * u, left: w * 0.06, width: 8 * u, height: 8 * u, borderRadius: 4 * u, borderWidth: 1.5, borderColor: pal.poteau, backgroundColor: 'rgba(0,0,0,0.12)' }} />
        <View style={{ position: 'absolute', top: 3 * u, right: 3 * u, width: 6 * u, height: 8 * u, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' }} />
      </View>
    );
  }
  if (type === 2) {
    return (
      <View style={{ position: 'absolute', top: -30 * u, left: w * 0.2, width: w * 0.5, height: 30 * u, alignItems: 'center' }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: w * 0.27, borderRightWidth: w * 0.27, borderBottomWidth: 8 * u, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#7A4A26' }} />
        <View style={{ width: w * 0.46, height: 12 * u, backgroundColor: '#A8703F', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }}>
          <View style={{ position: 'absolute', top: 4 * u, left: 0, right: 0, height: 1.5 * u, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: w * 0.36 }}>
          <View style={{ width: 2 * u, height: 10 * u, backgroundColor: '#7A4A26' }} />
          <View style={{ width: 2 * u, height: 10 * u, backgroundColor: '#7A4A26' }} />
        </View>
      </View>
    );
  }
  if (type === 3) {
    return (
      <>
        <View style={{ position: 'absolute', top: -22 * u, left: w * 0.18, width: 9 * u, height: 22 * u, backgroundColor: '#A24B3A' }}>
          <View style={{ position: 'absolute', top: 0, left: -1.5 * u, width: 12 * u, height: 4 * u, backgroundColor: '#7C3528' }} />
        </View>
        <View style={{ position: 'absolute', top: -30 * u, left: w * 0.18 + 1 * u, width: 6 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: 'rgba(255,255,255,0.55)' }} />
      </>
    );
  }
  return (
    <>
      <View style={{ position: 'absolute', top: -12 * u, left: w * 0.12, width: w * 0.32, height: 10 * u, backgroundColor: '#35557D', transform: [{ skewX: '-12deg' }], borderRadius: 1 }}>
        <View style={{ position: 'absolute', top: 4 * u, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} />
      </View>
      <View style={{ position: 'absolute', top: -12 * u, left: w * 0.52, width: w * 0.32, height: 10 * u, backgroundColor: '#35557D', transform: [{ skewX: '-12deg' }], borderRadius: 1 }}>
        <View style={{ position: 'absolute', top: 4 * u, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} />
      </View>
      <View style={{ position: 'absolute', top: -2 * u, left: w * 0.1, width: w * 0.76, height: 2 * u, backgroundColor: couleur }} />
    </>
  );
}

/** Immeuble : corniche, ombre latérale, fenêtres encadrées, balcons, accessoire de toit. */
export const Immeuble = memo(function Immeuble({ w, h, couleur, k, rangees, id, pal, top, sansAccessoire }) {
  const clair = melange(couleur, '#ffffff', 0.35);
  const fonce = melange(couleur, '#000000', 0.25);
  const fenH = 34 * k;
  const pas = 64 * k;
  const accessoire = id % 5;
  return (
    <View style={{ position: 'absolute', left: 0, top, width: w, height: h }}>
      {!sansAccessoire && <AccessoireToit type={accessoire} w={w} k={k} couleur={fonce} pal={pal} />}
      <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: 'hidden', backgroundColor: couleur }}>
        <View style={{ height: Math.max(5, 11 * k), backgroundColor: clair }} />
        <View style={{ height: Math.max(2, 4 * k), backgroundColor: fonce, opacity: 0.55 }} />
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: w * 0.2, backgroundColor: 'rgba(0,0,0,0.13)' }} />
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(2, w * 0.05), backgroundColor: 'rgba(255,255,255,0.14)' }} />
        {Array.from({ length: rangees }).map((_, r) => (
          <View key={r} style={{ position: 'absolute', left: 0, right: 0, top: 18 * k + 8 * k + r * pas }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: w * 0.14 }}>
              {[0, 1].map((c) => {
                const allume = (r * 2 + c + id) % 3 !== 0;
                return (
                  <View key={c} style={{ width: w * 0.3, height: fenH, borderRadius: 3, padding: Math.max(1.5, 2.2 * k), backgroundColor: clair }}>
                    <View style={{ flex: 1, borderRadius: 2, backgroundColor: allume ? pal.fenetre : pal.fenetreEteinte, overflow: 'hidden' }}>
                      <View style={{ position: 'absolute', top: 0, left: 0, width: '45%', height: '100%', backgroundColor: 'rgba(255,255,255,0.28)', transform: [{ skewX: '-18deg' }] }} />
                      <View style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: clair, opacity: 0.8 }} />
                    </View>
                  </View>
                );
              })}
            </View>
            {r % 2 === 1 && (
              <View style={{ marginTop: 3 * k, marginHorizontal: w * 0.1, height: Math.max(3, 5 * k), borderRadius: 2, backgroundColor: clair }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Obstacles du haut : grue, enseigne, poteau électrique
// ---------------------------------------------------------------------------

/** Mât de grue en treillis, chariot rayé et crochet. */
export const HautGrue = memo(function HautGrue({ w, hFull, hautVisible, k }) {
  const rail = Math.max(3, 5 * k);
  const seg = 36 * k;
  const base = 40 * k;
  const n = Math.max(2, Math.min(14, Math.ceil(hautVisible / seg) + 1));
  const largeurInt = w - rail * 2;
  const diag = Math.sqrt(seg * seg + largeurInt * largeurInt);
  const angle = (Math.atan(largeurInt / seg) * 180) / Math.PI;
  const bandes = 5;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: hFull, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: rail, backgroundColor: OR, borderRightWidth: 1, borderRightColor: OR_FONCE }} />
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: rail, backgroundColor: OR, borderLeftWidth: 1, borderLeftColor: OR_FONCE }} />
      {Array.from({ length: n }).map((_, i) => (
        <React.Fragment key={i}>
          <View style={{ position: 'absolute', left: rail, right: rail, bottom: base + i * seg, height: Math.max(2, 3 * k), backgroundColor: OR_FONCE }} />
          <View
            style={{
              position: 'absolute', left: w / 2 - Math.max(1, 1.5 * k), width: Math.max(2, 3 * k), height: diag, bottom: base + i * seg + seg / 2 - diag / 2,
              backgroundColor: OR_FONCE, transform: [{ rotate: `${i % 2 ? angle : -angle}deg` }],
            }}
          />
        </React.Fragment>
      ))}
      {/* Chariot rayé orange et blanc, avec son crochet */}
      <View style={{ position: 'absolute', left: -1, right: -1, bottom: 14 * k, height: 26 * k, backgroundColor: '#fff', borderWidth: Math.max(1, 2 * k), borderColor: OR_FONCE, flexDirection: 'row', overflow: 'hidden' }}>
        {Array.from({ length: bandes }).map((_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? '#fff' : '#E8590C' }} />
        ))}
      </View>
      <View style={{ position: 'absolute', left: w / 2 - 1, bottom: 8 * k, width: 2, height: 8 * k, backgroundColor: '#5B6470' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: -2 * k, alignItems: 'center' }}>
        <MaterialCommunityIcons name="hook" size={22 * k} color="#5B6470" />
      </View>
      <View style={{ position: 'absolute', left: w / 2 - 3 * k, top: 6 * k, width: 6 * k, height: 6 * k, borderRadius: 3 * k, backgroundColor: '#E74C3C' }} />
    </View>
  );
});

/** Enseigne de boutique suspendue à un poteau, avec ses chaînes. */
export const HautEnseigne = memo(function HautEnseigne({ w, hFull, k, pal }) {
  const poteau = Math.max(4, 7 * k);
  const hs = 74 * k;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: hFull, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: w / 2 - poteau / 2, top: 0, bottom: hs + 18 * k, width: poteau, backgroundColor: pal.poteau }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: poteau * 0.3, backgroundColor: 'rgba(255,255,255,0.28)' }} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: hs + 14 * k, height: Math.max(4, 6 * k), borderRadius: 3, backgroundColor: pal.poteau }} />
      <View style={{ position: 'absolute', left: w * 0.2, bottom: hs, width: 2, height: 15 * k, backgroundColor: pal.poteau }} />
      <View style={{ position: 'absolute', right: w * 0.2, bottom: hs, width: 2, height: 15 * k, backgroundColor: pal.poteau }} />
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: hs, borderRadius: 10 * k, backgroundColor: BRAND,
          borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <View style={{ position: 'absolute', left: 4 * k, right: 4 * k, top: 4 * k, height: 8 * k, borderRadius: 4 * k, backgroundColor: 'rgba(255,255,255,0.22)' }} />
        <MaterialCommunityIcons name="storefront-outline" size={40 * k} color="#fff" />
      </View>
    </View>
  );
});

/** Poteau électrique : traverse, isolateurs, câbles tendus et transformateur. */
export const HautCables = memo(function HautCables({ w, hFull, k, pal, dark }) {
  const fin = Math.max(2, 2.5 * k);
  const boite = 44 * k;
  const bras = boite + 54 * k;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: hFull, overflow: 'hidden' }}>
      {[0.08, 0.36, 0.64, 0.92].map((p, i) => (
        <View key={i} style={{ position: 'absolute', left: w * p - fin / 2, top: 0, bottom: boite, width: fin, backgroundColor: pal.cable }} />
      ))}
      <View style={{ position: 'absolute', left: w / 2 - Math.max(3, 5 * k), top: 0, bottom: boite, width: Math.max(6, 10 * k), backgroundColor: pal.poteau, opacity: 0.9 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: bras, height: Math.max(4, 7 * k), borderRadius: 2, backgroundColor: '#8A5A2B' }} />
      {[0.1, 0.5, 0.9].map((p, i) => (
        <View key={i} style={{ position: 'absolute', left: w * p - 3 * k, bottom: bras - 9 * k, width: 6 * k, height: 9 * k, borderRadius: 3 * k, backgroundColor: '#CFE3E8' }} />
      ))}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: boite, borderRadius: 6, borderWidth: 2, borderColor: pal.cable,
          backgroundColor: dark ? '#4A515B' : '#7D8794', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <View style={{ position: 'absolute', top: 3 * k, left: 4 * k, right: 4 * k, height: 3 * k, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }} />
        <MaterialCommunityIcons name="flash" size={24 * k} color={OR} />
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Colis lumineux à attraper, client à son balcon
// ---------------------------------------------------------------------------

/** Colis doré qui pulse doucement, avec son halo. */
export const ColisBonus = memo(function ColisBonus({ b }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [v]);
  const echelle = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const halo = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.55] });
  return (
    <View style={{ width: b, height: b, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: b * 1.7, height: b * 1.7, borderRadius: b, backgroundColor: '#FFE27A', opacity: halo, transform: [{ scale: echelle }] }} />
      <View style={{ width: b * 0.84, height: b * 0.84, borderRadius: b * 0.14, backgroundColor: '#D9A066', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, width: b * 0.18, backgroundColor: OR }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: b * 0.12, height: b * 0.1, backgroundColor: 'rgba(255,255,255,0.35)' }} />
        <View style={{ width: b * 0.3, height: b * 0.3, borderRadius: b * 0.06, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="check" size={b * 0.22} color="#fff" />
        </View>
      </View>
    </View>
  );
});

/** Client sur son balcon : garde-corps, personnage et bulle « colis attendu ». */
export const ClientBalcon = memo(function ClientBalcon({ w, k, livre, pal }) {
  const hh = 44 * k;
  const poteaux = 5;
  return (
    <View style={{ width: w, height: hh, alignItems: 'center', justifyContent: 'flex-end' }}>
      {!livre && (
        <View style={{ position: 'absolute', top: -28 * k, width: 28 * k, height: 22 * k, borderRadius: 7 * k, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="package-variant" size={16 * k} color="#fff" />
          <View style={{ position: 'absolute', bottom: -4 * k, width: 8 * k, height: 8 * k, backgroundColor: BRAND, transform: [{ rotate: '45deg' }] }} />
        </View>
      )}
      <View style={{ marginBottom: 6 * k }}>
        <MaterialCommunityIcons name={livre ? 'account-check' : 'human-greeting-variant'} size={40 * k} color={livre ? VERT : '#fff'} />
      </View>
      <View style={{ position: 'absolute', bottom: 3 * k, left: w * 0.06, right: w * 0.06, height: 16 * k, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        {Array.from({ length: poteaux }).map((_, i) => (
          <View key={i} style={{ width: Math.max(1.5, 2 * k), height: '100%', backgroundColor: pal.poteau }} />
        ))}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(2, 3 * k), backgroundColor: pal.poteau }} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: w * 0.02, right: w * 0.02, height: Math.max(3, 5 * k), borderRadius: 2, backgroundColor: '#E8E8E8' }} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Le drone
// ---------------------------------------------------------------------------

/** Drone de livraison à quatre rotors (qui tournent), caméra, feu clignotant et colis suspendu. */
export const DroneDessin = memo(function DroneDessin({ D }) {
  const rotor = useRef(new Animated.Value(0)).current;
  const feu = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(rotor, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(rotor, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(feu, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(feu, { toValue: 0.15, duration: 420, useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [rotor, feu]);
  const largeurRotor = rotor.interpolate({ inputRange: [0, 1], outputRange: [1, 0.62] });
  const r = (v) => v * D;
  const Rotor = ({ cx, cy, l }) => (
    <>
      <View style={{ position: 'absolute', left: r(cx) - r(0.012), top: r(cy), width: r(0.024), height: r(0.06), backgroundColor: '#5B6470' }} />
      <Animated.View
        style={{
          position: 'absolute', left: r(cx) - r(l) / 2, top: r(cy) - r(0.02), width: r(l), height: r(0.036), borderRadius: r(0.02),
          backgroundColor: 'rgba(235,242,250,0.75)', borderWidth: 1, borderColor: 'rgba(120,140,165,0.55)', transform: [{ scaleX: largeurRotor }],
        }}
      />
    </>
  );
  return (
    <View style={{ width: D, height: D }}>
      {/* Rotors arrière, plus petits */}
      <Rotor cx={0.3} cy={0.2} l={0.18} />
      <Rotor cx={0.7} cy={0.2} l={0.18} />
      {/* Bras */}
      <View style={{ position: 'absolute', left: r(0.12), top: r(0.275), width: r(0.76), height: r(0.03), borderRadius: r(0.015), backgroundColor: '#5B6470' }} />
      {/* Rotors avant */}
      <Rotor cx={0.12} cy={0.22} l={0.27} />
      <Rotor cx={0.88} cy={0.22} l={0.27} />
      <View style={{ position: 'absolute', left: r(0.09), top: r(0.26), width: r(0.06), height: r(0.06), borderRadius: r(0.015), backgroundColor: '#3E4650' }} />
      <View style={{ position: 'absolute', left: r(0.85), top: r(0.26), width: r(0.06), height: r(0.06), borderRadius: r(0.015), backgroundColor: '#3E4650' }} />
      {/* Patins */}
      <View style={{ position: 'absolute', left: r(0.34), top: r(0.4), width: r(0.02), height: r(0.07), backgroundColor: '#5B6470' }} />
      <View style={{ position: 'absolute', left: r(0.64), top: r(0.4), width: r(0.02), height: r(0.07), backgroundColor: '#5B6470' }} />
      <View style={{ position: 'absolute', left: r(0.3), top: r(0.46), width: r(0.4), height: r(0.02), borderRadius: r(0.01), backgroundColor: '#5B6470' }} />
      {/* Coque */}
      <View style={{ position: 'absolute', left: r(0.29), top: r(0.22), width: r(0.42), height: r(0.19), borderRadius: r(0.1), backgroundColor: BRAND }}>
        <View style={{ position: 'absolute', left: r(0.04), right: r(0.04), top: r(0.016), height: r(0.04), borderRadius: r(0.02), backgroundColor: 'rgba(255,255,255,0.3)' }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: r(0.05), borderBottomLeftRadius: r(0.1), borderBottomRightRadius: r(0.1), backgroundColor: 'rgba(0,0,0,0.14)' }} />
      </View>
      <View style={{ position: 'absolute', left: r(0.37), top: r(0.17), width: r(0.26), height: r(0.1), borderTopLeftRadius: r(0.13), borderTopRightRadius: r(0.13), backgroundColor: '#DDE7F0', borderWidth: 1, borderColor: '#B7C6D6' }}>
        <View style={{ position: 'absolute', left: r(0.03), top: r(0.015), width: r(0.07), height: r(0.025), borderRadius: r(0.012), backgroundColor: '#fff', opacity: 0.8 }} />
      </View>
      {/* Caméra et feu */}
      <View style={{ position: 'absolute', left: r(0.5) - r(0.04), top: r(0.35), width: r(0.08), height: r(0.08), borderRadius: r(0.04), backgroundColor: '#16223F', borderWidth: 2, borderColor: '#B7C6D6', alignItems: 'flex-start' }}>
        <View style={{ margin: r(0.012), width: r(0.02), height: r(0.02), borderRadius: r(0.01), backgroundColor: '#fff' }} />
      </View>
      <Animated.View style={{ position: 'absolute', left: r(0.64), top: r(0.255), width: r(0.04), height: r(0.04), borderRadius: r(0.02), backgroundColor: VERT, opacity: feu }} />
      <View style={{ position: 'absolute', left: r(0.32), top: r(0.255), width: r(0.04), height: r(0.04), borderRadius: r(0.02), backgroundColor: '#FF6B6B' }} />
      {/* Sangles et colis */}
      <View style={{ position: 'absolute', left: r(0.4), top: r(0.47), width: Math.max(1.5, r(0.014)), height: r(0.12), backgroundColor: '#4A5560' }} />
      <View style={{ position: 'absolute', left: r(0.6), top: r(0.47), width: Math.max(1.5, r(0.014)), height: r(0.12), backgroundColor: '#4A5560' }} />
      <View style={{ position: 'absolute', left: r(0.31), top: r(0.58), width: r(0.38), height: r(0.3), borderRadius: r(0.04), backgroundColor: '#C98F54', borderWidth: 1.5, borderColor: '#9A6A36', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: r(0.02), height: r(0.04), backgroundColor: 'rgba(255,255,255,0.25)' }} />
        <View style={{ position: 'absolute', top: 0, bottom: 0, width: r(0.07), backgroundColor: OR }} />
        <View style={{ width: r(0.15), height: r(0.12), borderRadius: r(0.02), backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="package-variant-closed" size={r(0.09)} color="#fff" />
        </View>
      </View>
    </View>
  );
});
