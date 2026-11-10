/**
 * Décor de fond des mini-jeux, avec le logo Pearl Streets bien visible.
 *
 * EnseignePearl : plaque bleu nuit, liseré vert de la marque, logo blanc
 * (assets/images/logo-pearl-streets.png, texte blanc et point vert : il lui
 * faut ce fond foncé). Suspendue (cordons) ou sur pieds (panneau).
 * FondJeu : décor complet d'un jeu, posé sous les éléments du jeu, sans
 * jamais capter le toucher.
 *   variante 'marche' : étal du primeur (Fruits express) : banne rayée,
 *     enseigne suspendue, cagettes en bas.
 *   variante 'ville' : la ville (Mémoire, clair le jour, sombre le soir) :
 *     ciel, toits, panneau sur pieds au pied de l'immeuble du milieu, en bas
 *     de l'écran (`bas` : zone basse du téléphone ; reserveBasVille(l) donne
 *     la hauteur à laisser libre au-dessus).
 * Les autres jeux posent EnseignePearl dans leur propre décor (Drone, Toits,
 * Sommet) ; le Rush 3D a ses panneaux dans utils/jeuRush3dPage.js.
 */
import React, { memo, useCallback, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';

export const LOGO_PEARL = require('../assets/images/logo-pearl-streets.png');
export const RATIO_LOGO = 900 / 421;
export const BLEU_NUIT = '#16223F';
export const VERT_PEARL = '#0BB58E';

// Mesures d'une enseigne de largeur donnée (compacte : moins de marge autour du logo).
export function mesuresEnseigne(largeur, compacte = false) {
  const bord = Math.max(2, largeur * 0.022);
  const margeH = largeur * (compacte ? 0.07 : 0.09);
  const margeV = largeur * (compacte ? 0.045 : 0.07);
  const logoL = largeur - 2 * margeH - 2 * bord;
  const logoH = logoL / RATIO_LOGO;
  return { bord, logoL, logoH, hauteur: logoH + 2 * margeV + 2 * bord };
}

export const EnseignePearl = memo(function EnseignePearl({
  largeur, style, compacte = false, cordons = 0, pieds = 0, couleurSupport = '#5E6878',
}) {
  const m = mesuresEnseigne(largeur, compacte);
  const support = Math.max(2, largeur * 0.018);
  const attaches = cordons > 0 || pieds > 0 ? (
    <View style={[styles.attaches, { width: largeur * 0.62, height: cordons || pieds }]}>
      <View style={{ width: support, height: '100%', backgroundColor: couleurSupport }} />
      <View style={{ width: support, height: '100%', backgroundColor: couleurSupport }} />
    </View>
  ) : null;
  return (
    <View pointerEvents="none" style={[{ width: largeur, alignItems: 'center' }, style]}>
      {cordons > 0 && attaches}
      <View
        style={[styles.plaque, {
          width: largeur, height: m.hauteur, borderRadius: largeur * 0.06, borderWidth: m.bord,
        }]}
      >
        <Image source={LOGO_PEARL} style={{ width: m.logoL, height: m.logoH }} resizeMode="contain" />
      </View>
      {pieds > 0 && attaches}
    </View>
  );
});

// ---- Étal du primeur (Fruits express) ----
const BANNE = {
  clair: { a: VERT_PEARL, b: '#FFF8EC', bois: '#C99A5B', latte: '#B3864C', cordon: '#7A5A3A' },
  sombre: { a: '#0A8F70', b: '#E9E1D2', bois: '#6B5038', latte: '#58412D', cordon: '#A08060' },
};
const LARGEUR_RAYURE = 34;

function Marche({ l, h, dark, haut }) {
  const c = dark ? BANNE.sombre : BANNE.clair;
  const hBanne = haut + 46;
  const nb = Math.ceil(l / LARGEUR_RAYURE) + 1;
  // Petite enseigne discrète (demande du 10/11) : pas un grand panneau.
  const largeurEnseigne = Math.min(l * 0.26, 104);
  const hCagette = Math.max(34, h * 0.06);
  const nbCagettes = Math.max(3, Math.round(l / 110));
  const lCagette = l / nbCagettes;
  return (
    <>
      {/* Banne rayée et son bord festonné */}
      <View style={[styles.rangee, { top: 0, height: hBanne }]}>
        {Array.from({ length: nb }).map((_, i) => (
          <View key={i} style={{ width: LARGEUR_RAYURE, height: hBanne, backgroundColor: i % 2 ? c.b : c.a }} />
        ))}
      </View>
      <View style={[styles.rangee, { top: hBanne - LARGEUR_RAYURE / 2, height: LARGEUR_RAYURE }]}>
        {Array.from({ length: nb }).map((_, i) => (
          <View
            key={i}
            style={{
              width: LARGEUR_RAYURE, height: LARGEUR_RAYURE, borderRadius: LARGEUR_RAYURE / 2,
              backgroundColor: i % 2 ? c.b : c.a,
            }}
          />
        ))}
      </View>
      <View style={[styles.ombreBanne, { top: hBanne + LARGEUR_RAYURE / 2 }]} />
      {/* Enseigne suspendue sous la banne */}
      <EnseignePearl
        largeur={largeurEnseigne}
        cordons={10}
        couleurSupport={c.cordon}
        style={{ position: 'absolute', top: hBanne + LARGEUR_RAYURE / 2 - 2, left: (l - largeurEnseigne) / 2, opacity: 0.6 }}
      />
      {/* Cagettes de l'étal */}
      <View style={[styles.rangee, { bottom: 0, height: hCagette }]}>
        {Array.from({ length: nbCagettes }).map((_, i) => (
          <View
            key={i}
            style={{
              width: lCagette - 6, marginHorizontal: 3, height: hCagette, backgroundColor: c.bois,
              borderTopLeftRadius: 4, borderTopRightRadius: 4, justifyContent: 'space-evenly',
            }}
          >
            <View style={{ height: 3, backgroundColor: c.latte }} />
            <View style={{ height: 3, backgroundColor: c.latte }} />
          </View>
        ))}
      </View>
    </>
  );
}

// ---- Rue de la ville (Mémoire) ----
const VILLE = {
  clair: { ciel: '#EAF2FA', loin: '#D3E0ED', proche: '#BFD0E1', fenetre: '#F4F8FC', support: '#7D8A9C' },
  sombre: { ciel: '#141D2E', loin: '#1C2740', proche: '#24314D', fenetre: '#E9C46A', support: '#56627A' },
};
// Toits : position et largeur en part de l'écran, hauteur en part de la bande.
const TOITS_LOIN = [[0, 0.16, 0.7], [0.15, 0.12, 0.95], [0.26, 0.18, 0.6], [0.43, 0.14, 0.85], [0.56, 0.16, 0.7], [0.71, 0.12, 1], [0.82, 0.18, 0.75]];
const TOITS_PROCHE = [[0, 0.22, 0.45], [0.2, 0.17, 0.62], [0.36, 0.28, 0.4], [0.63, 0.17, 0.58], [0.79, 0.21, 0.5]];

export function reserveBasVille(l, bas = 0) {
  return bas + 4 + PIEDS_VILLE + mesuresEnseigne(largeurEnseigneVille(l), true).hauteur;
}
const PIEDS_VILLE = 10;
function largeurEnseigneVille(l) {
  return Math.min(170, l * 0.44);
}

function Ville({ l, h, dark, bas }) {
  const c = dark ? VILLE.sombre : VILLE.clair;
  const bande = Math.min(h * 0.42, 340);
  const largeurEnseigne = largeurEnseigneVille(l);
  const toit = (liste, couleur, k, fenetres) => liste.map(([x, w, hh], i) => (
    <View
      key={i}
      style={{
        position: 'absolute', left: x * l, bottom: 0, width: w * l + 1, height: hh * bande * k, backgroundColor: couleur,
        flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingTop: 10, gap: 8,
      }}
    >
      {fenetres && Array.from({ length: 6 }).map((_, j) => (
        <View key={j} style={{ width: 7, height: 9, borderRadius: 1.5, backgroundColor: c.fenetre, opacity: (i + j) % 3 ? 0.55 : 0.2 }} />
      ))}
    </View>
  ));
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.ciel }]} />
      {toit(TOITS_LOIN, c.loin, 1, false)}
      {toit(TOITS_PROCHE, c.proche, 1, true)}
      {/* Panneau Pearl Streets au pied de l'immeuble du milieu */}
      <EnseignePearl
        largeur={largeurEnseigne}
        compacte
        pieds={PIEDS_VILLE}
        couleurSupport={c.support}
        style={{ position: 'absolute', left: (l - largeurEnseigne) / 2, bottom: bas + 4 }}
      />
    </>
  );
}

export default function FondJeu({ variante, dark, haut = 0, bas = 0, style }) {
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const mesurer = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    setTaille((t) => (Math.round(t.l) === Math.round(width) && Math.round(t.h) === Math.round(height) ? t : { l: width, h: height }));
  }, []);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fond, style]} onLayout={mesurer}>
      {taille.l > 0 && variante === 'marche' && <Marche l={taille.l} h={taille.h} dark={dark} haut={haut} />}
      {taille.l > 0 && variante === 'ville' && <Ville l={taille.l} h={taille.h} dark={dark} bas={bas} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fond: { overflow: 'hidden' },
  plaque: {
    backgroundColor: BLEU_NUIT, borderColor: VERT_PEARL, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  attaches: { flexDirection: 'row', justifyContent: 'space-between' },
  rangee: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', overflow: 'hidden' },
  ombreBanne: { position: 'absolute', left: 0, right: 0, height: 10, backgroundColor: 'rgba(0,0,0,0.06)' },
});
