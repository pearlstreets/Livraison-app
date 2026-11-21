// Sur tablette, textes, boutons et icones plus grands.
//
// ⛔ POURQUOI
// Sur iPad, l'app gardait les tailles du telephone : textes et boutons
// minuscules sur un grand ecran. Ce module agrandit, sur tablette seulement,
// les tailles des feuilles de style (texte, marges internes, hauteur des
// boutons, arrondis) et celle des icones. Le telephone ne change pas.
// Il doit etre appele AVANT le chargement d'App.js (index.js), pour que
// chaque StyleSheet.create des ecrans passe deja par lui.
import {Dimensions, StyleSheet} from 'react-native';
import {estTablette} from './deuxEcrans';

export const FACTEUR_TABLETTE = 1.3;

// Tailles agrandies telles quelles.
const CLES = new Set([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingEnd',
  'borderRadius',
  'gap',
  'rowGap',
  'columnGap',
  'minHeight',
]);

// Hauteurs et largeurs : seulement les petites (boutons, pastilles,
// avatars), jamais les grands blocs dont la mise en page depend.
const CLES_PETITES = new Set(['height', 'width', 'minWidth']);
const PETITE_MAX = 80;

const arrondi = v => Math.round(v * FACTEUR_TABLETTE * 2) / 2;

export const agrandirStyle = style => {
  if (!style || typeof style !== 'object' || Array.isArray(style)) {
    return style;
  }
  const sortie = {};
  for (const cle of Object.keys(style)) {
    const v = style[cle];
    if (typeof v === 'number' && v > 0 && CLES.has(cle)) {
      sortie[cle] = arrondi(v);
    } else if (
      typeof v === 'number' &&
      v > 0 &&
      v <= PETITE_MAX &&
      CLES_PETITES.has(cle)
    ) {
      sortie[cle] = arrondi(v);
    } else {
      sortie[cle] = v;
    }
  }
  return sortie;
};

const agrandirIcones = () => {
  let icones;
  try {
    icones = require('@expo/vector-icons');
  } catch (_) {
    return;
  }
  const React = require('react');
  ['Ionicons', 'MaterialCommunityIcons', 'MaterialIcons'].forEach(nom => {
    const Icone = icones[nom];
    const proto = Icone && Icone.prototype;
    if (!proto || typeof proto.render !== 'function' || proto.__tablette) {
      return;
    }
    const rendu = proto.render;
    proto.render = function () {
      const el = rendu.call(this);
      const taille = el && el.props && el.props.size;
      if (typeof taille !== 'number') {
        return el;
      }
      return React.cloneElement(el, {size: arrondi(taille)});
    };
    proto.__tablette = true;
  });
};

let fait = false;

export function agrandirSurTablette() {
  if (fait) {
    return;
  }
  fait = true;
  const {width, height} = Dimensions.get('window') || {};
  if (!estTablette(width || 0, height || 0)) {
    return;
  }
  const creer = StyleSheet.create;
  StyleSheet.create = feuilles => {
    const sortie = {};
    for (const nom of Object.keys(feuilles || {})) {
      sortie[nom] = agrandirStyle(feuilles[nom]);
    }
    return creer(sortie);
  };
  agrandirIcones();
}
