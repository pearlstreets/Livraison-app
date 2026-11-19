/**
 * Décor du mini-jeu « Livraison au sommet » (screens/JeuSommetScreen.js).
 *
 * Façade d'immeuble dessinée en View (étages à 4 fenêtres, petit logo
 * Pearl Streets discret un étage sur six), plateformes (balcon, store rayé,
 * nacelle, matelas, monte-charge), colis, bonus, pots de fleurs, pigeons et
 * le livreur Pearl Streets. Coordonnées du monde (utils/jeux/sommet.js) :
 * y vers le HAUT, l'écran les convertit avec l'échelle `s`. Thème clair
 * seulement, jamais de fond noir.
 */
import React, {memo} from 'react';
import {View, Image} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';
import {LOGO_PEARL, RATIO_LOGO} from './FondJeu';
import {ETAGE, PLAT_H, JOUEUR_L, JOUEUR_H, VX_MAX} from '../../utils/jeux/sommet';

export const OR_SOMMET = '#F2B705';
const BRAND = C.marque;
const BLANC = '#FFFFFF';

// Bonus : icône (MaterialCommunityIcons) et couleur, icône blanche dessus.
export const BONUS_VUE = {
  aimant: {icone: 'magnet', couleur: '#E74C3C'},
  casque: {icone: 'hard-hat', couleur: '#B7791F'},
  filet: {icone: 'grid', couleur: '#2F80ED'},
};

// Décor par palier (tous les 50 étages) : teintes de façade qui changent.
const DECORS = [
  null,
  ['#E8C3A6', '#D9AE8E', '#C9DDEA', '#C4A183'],
  ['#DCE3EA', '#CBD4DD', '#BFD9EC', '#B3BFCB'],
  ['#CFE6E8', '#BBD8DB', '#A9D3E6', '#9CBFC4'],
  ['#F1D9E8', '#E4C3D8', '#D3D6F2', '#CFA9C2'],
];

const PALETTE = {
  mur: '#F3E4D4',
  murJoint: '#EAD7C3',
  vitre: '#CFE3F1',
  cadre: '#DCC3A9',
  dalle: '#8E8073',
  dalleBord: '#B5A899',
  dalleTrait: '#3E352E',
  console: '#5E544B',
  trottoir: '#C9C9CC',
  route: '#9EA0A6',
  matelas: '#2F80ED',
  nacelle: '#7D8995',
  cable: '#6E7781',
  pot: '#C2643C',
  pigeon: '#7A8691',
  colis: '#B07A3B',
};

/** Couleurs du décor pour un palier donné. */
export function paletteSommet(palier) {
  if (!palier) return PALETTE;
  const k = 1 + ((palier - 1) % (DECORS.length - 1));
  const [mur, murJoint, vitre, cadre] = DECORS[k];
  return {...PALETTE, mur, murJoint, vitre, cadre};
}

// Un étage sur six porte un petit logo Pearl Streets discret entre deux
// fenêtres (jamais un grand panneau).
const LARGEUR_LOGO = 36;
const GAUCHE_LOGO = 155; // entre la 2e fenêtre (108 à 152) et la 3e (194)

/** Un étage de façade (4 fenêtres), redessiné seulement s'il change. */
export const Etage = memo(function Etage({rang, s, p}) {
  const h = ETAGE * s;
  const lf = 44 * s;
  const hf = 34 * s;
  const logo = rang % 6 === 1;
  const lLogo = LARGEUR_LOGO * s;
  const hLogo = lLogo / RATIO_LOGO;
  return (
    <View style={{position: 'absolute', left: 0, right: 0, top: -(rang + 1) * h, height: h}}>
      <View
        style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(1, 2 * s), backgroundColor: p.murJoint}}
      />
      {logo && (
        <Image
          source={LOGO_PEARL}
          resizeMode="contain"
          style={{position: 'absolute', left: GAUCHE_LOGO * s, top: (h - hLogo) / 2, width: lLogo, height: hLogo, opacity: 0.6}}
        />
      )}
      {[0, 1, 2, 3].map(c => (
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
            backgroundColor: p.vitre,
          }}>
          <View
            style={{
              position: 'absolute',
              left: lf / 2 - 1.5 * s,
              top: 0,
              bottom: 0,
              width: Math.max(1, 2 * s),
              backgroundColor: p.cadre,
            }}
          />
        </View>
      ))}
    </View>
  );
});

/** Une plateforme (balcon, nacelle, store, matelas, monte-charge). */
export const Plateforme = memo(function Plateforme({type, x, y, l, rot, dechire, s, p}) {
  const left = x * s;
  const top = -y * s;
  const w = l * s;
  const hh = PLAT_H * s;
  const trait = Math.max(1, 1.5 * s);
  if (type === 'sol') return null;
  if (type === 'store') {
    const bandes = 8;
    return (
      <View
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: hh + 4 * s,
          flexDirection: 'row',
          borderRadius: 3 * s,
          overflow: 'hidden',
          opacity: dechire ? 0.7 : 1,
          borderWidth: trait,
          borderColor: p.dalleTrait,
          transform: [{rotate: `${dechire ? rot : 0}deg`}],
        }}>
        {Array.from({length: bandes}).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: i % 2 ? BLANC : BRAND,
              borderBottomLeftRadius: 5 * s,
              borderBottomRightRadius: 5 * s,
            }}
          />
        ))}
      </View>
    );
  }
  if (type === 'nacelle') {
    return (
      <View style={{position: 'absolute', left, top: top - 70 * s, width: w, height: 70 * s + hh}}>
        <View style={{position: 'absolute', left: 6 * s, top: 0, width: trait, height: 70 * s, backgroundColor: p.cable}} />
        <View style={{position: 'absolute', right: 6 * s, top: 0, width: trait, height: 70 * s, backgroundColor: p.cable}} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: hh,
            borderRadius: 2 * s,
            backgroundColor: p.nacelle,
            overflow: 'hidden',
            borderWidth: trait,
            borderColor: p.dalleTrait,
          }}>
          <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 * s, backgroundColor: OR_SOMMET}} />
        </View>
      </View>
    );
  }
  if (type === 'monte') {
    return (
      <View style={{position: 'absolute', left, top: top - 50 * s, width: w, height: 50 * s + hh + 34 * s}}>
        <View
          style={{position: 'absolute', left: w / 2 - 1 * s, top: 0, width: Math.max(1, 2 * s), height: 50 * s, backgroundColor: p.cable}}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 50 * s,
            height: hh,
            borderRadius: 2 * s,
            backgroundColor: OR_SOMMET,
            borderWidth: trait,
            borderColor: p.dalleTrait,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 6 * s,
            right: 6 * s,
            top: 50 * s + hh,
            height: 34 * s,
            borderWidth: Math.max(1, 2 * s),
            borderTopWidth: 0,
            borderColor: OR_SOMMET,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <MaterialCommunityIcons name="elevator" size={22 * s} color={OR_SOMMET} />
        </View>
      </View>
    );
  }
  const trampo = type === 'trampo';
  const pied = {
    width: 6 * s,
    height: 10 * s,
    backgroundColor: p.console,
    borderBottomLeftRadius: 4 * s,
    borderBottomRightRadius: 4 * s,
  };
  return (
    <View style={{position: 'absolute', left, top, width: w, height: hh + (trampo ? 8 * s : 0) + 12 * s}}>
      {trampo && (
        <View
          style={{
            height: 8 * s,
            marginHorizontal: 6 * s,
            borderRadius: 4 * s,
            backgroundColor: p.matelas,
            borderWidth: Math.max(1, 1.2 * s),
            borderColor: p.dalleTrait,
          }}
        />
      )}
      <View
        style={{
          height: hh,
          borderRadius: 2 * s,
          backgroundColor: p.dalle,
          borderWidth: trait,
          borderColor: p.dalleTrait,
          borderTopWidth: Math.max(1, 3 * s),
          borderTopColor: p.dalleBord,
        }}
      />
      <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 * s}}>
        <View style={pied} />
        <View style={pied} />
      </View>
    </View>
  );
});

export const Colis = memo(function Colis({x, y, s, p}) {
  const t = 26 * s;
  return (
    <View style={{position: 'absolute', left: x * s - t / 2, top: -y * s - t / 2, width: t, height: t}}>
      <MaterialCommunityIcons name="package-variant-closed" size={t} color={p.colis} />
    </View>
  );
});

/** Bonus à ramasser : pastille colorée cernée de blanc. */
export const ObjetBonus = memo(function ObjetBonus({type, x, y, s}) {
  const v = BONUS_VUE[type];
  if (!v) return null;
  const t = 30 * s;
  return (
    <View
      style={{
        position: 'absolute',
        left: x * s - t / 2,
        top: -y * s - t / 2,
        width: t,
        height: t,
        borderRadius: t / 2,
        backgroundColor: v.couleur,
        borderWidth: Math.max(1, 2 * s),
        borderColor: BLANC,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <MaterialCommunityIcons name={v.icone} size={18 * s} color={BLANC} />
    </View>
  );
});

/** Pot de fleurs qui tombe. */
export function Pot({x, y, s, p}) {
  return (
    <View style={{position: 'absolute', left: (x - 12) * s, top: -(y + 22) * s, width: 24 * s, alignItems: 'center'}}>
      <MaterialCommunityIcons name="flower-tulip" size={18 * s} color="#E0457B" />
      <View
        style={{
          width: 22 * s,
          height: 16 * s,
          marginTop: -3 * s,
          backgroundColor: p.pot,
          borderBottomLeftRadius: 7 * s,
          borderBottomRightRadius: 7 * s,
          borderTopLeftRadius: 2 * s,
          borderTopRightRadius: 2 * s,
        }}
      />
    </View>
  );
}

/** Pigeon en vol (retourné quand il est tombé). */
export function Pigeon({x, y, regard, mort, s, p}) {
  return (
    <View
      style={{
        position: 'absolute',
        left: (x - 17) * s,
        top: -(y + 15) * s,
        transform: [{scaleX: regard}, {rotate: mort ? '180deg' : '0deg'}],
      }}>
      <MaterialCommunityIcons name="bird" size={34 * s} color={p.pigeon} />
    </View>
  );
}

/** Le livreur Pearl Streets, colis au-dessus de la tête. */
export function Livreur({x, y, rot, vx, s, casque, aimant}) {
  const l = JOUEUR_L * s;
  const h = JOUEUR_H * s;
  const penche = rot || (vx / VX_MAX) * 10;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x * s - l / 2,
        top: -y * s - h,
        width: l,
        height: h,
        alignItems: 'center',
        justifyContent: 'flex-end',
        transform: [{rotate: `${penche}deg`}],
      }}>
      {/* Halo clair : le livreur se détache toujours de la façade */}
      <View
        style={{
          position: 'absolute',
          left: -l * 0.2,
          top: -h * 0.05,
          width: l * 1.4,
          height: h * 1.1,
          borderRadius: l,
          backgroundColor: BLANC,
          opacity: 0.55,
        }}
      />
      {/* Casque actif : contour doré autour du livreur */}
      {casque && (
        <View
          style={{
            position: 'absolute',
            left: -l * 0.3,
            top: -h * 0.12,
            width: l * 1.6,
            height: h * 1.24,
            borderRadius: l,
            borderWidth: Math.max(1, 2.5 * s),
            borderColor: OR_SOMMET,
          }}
        />
      )}
      {aimant && (
        <View style={{position: 'absolute', right: -14 * s, top: h * 0.35}}>
          <MaterialCommunityIcons name="magnet" size={16 * s} color={BONUS_VUE.aimant.couleur} />
        </View>
      )}
      <View style={{position: 'absolute', top: casque ? -16 * s : -4 * s, alignItems: 'center'}}>
        {casque && <MaterialCommunityIcons name="hard-hat" size={18 * s} color={OR_SOMMET} style={{marginBottom: -6 * s}} />}
        <MaterialCommunityIcons name="package-variant-closed" size={18 * s} color="#B07A3B" />
      </View>
      <MaterialCommunityIcons name="human-handsup" size={h * 0.82} color={BRAND} />
    </View>
  );
}

/** Filet de sécurité actif, tendu en bas de la zone de jeu. */
export function Filet({s}) {
  const couleur = BONUS_VUE.filet.couleur;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 16 * s,
        flexDirection: 'row',
        borderTopWidth: 2,
        borderColor: couleur,
        backgroundColor: 'rgba(47, 128, 237, 0.12)',
      }}>
      {Array.from({length: 12}).map((_, i) => (
        <View key={i} style={{flex: 1, borderRightWidth: i < 11 ? 1.5 : 0, borderColor: couleur}} />
      ))}
    </View>
  );
}
