/**
 * Décor du mini-jeu « Drone express » : ville en parallaxe (deux bandes de
 * silhouettes qui défilent en boucle, petite plaque Pearl Streets discrète
 * sur un toit), obstacles (grue, enseigne ou câbles en haut, immeuble en
 * bas, balcon du client, colis et bonus posés dans le passage) et drone.
 * Thème clair seulement (jamais de fond noir). Les positions sont des
 * Animated.Value posées par l'écran : aucun rendu React à chaque image.
 */
import React, {memo, useMemo} from 'react';
import {View, Text, StyleSheet, Animated} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';
import {PlaqueLogo, mesurePlaque} from './FondJeu';
import {HAUTEUR, SOL, TAILLE_BONUS} from '../../utils/jeux/drone';

export const OR = '#F2B705';
export const VERT = '#2ecc71';

// Décors successifs (un nouveau tous les 10 passages) : ciel et silhouettes.
export const DECORS = [
  {},
  {ciel: '#F7D9B5', loin: '#D9B49A', proche: '#B98C7A'},
  {ciel: '#BFE9D6', loin: '#9CC7B4', proche: '#7BA896'},
  {ciel: '#D7C8EE', loin: '#B5A4D2', proche: '#9484B8'},
];

export const PALETTE = {
  ciel: '#CFE6FA',
  loin: '#B3C9DE',
  proche: '#93ADC7',
  rue: '#5B6470',
  trottoir: '#9AA3AD',
  trait: '#ECECEC',
  immeubles: ['#C8553D', '#3D5A80', '#2A9D8F', '#6D597A'],
  toit: 'rgba(0,0,0,0.22)',
  fenetre: '#FFF6D6',
  fenetreEteinte: '#E3E8EE',
  cable: '#2B2F36',
  poteau: '#5E6670',
};

// Bonus spéciaux : icône du HUD (Ionicons), icône posée dans le passage, couleur, libellé.
export const BONUS_VUE = {
  bouclier: {
    icone: 'shield-checkmark',
    iconePassage: 'shield-check',
    couleur: '#2D7FF9',
    cle: 'jeuxDroneBouclier',
  },
  aimant: {
    icone: 'magnet',
    iconePassage: 'magnet',
    couleur: '#8E44AD',
    cle: 'jeuxDroneAimant',
  },
  double: {
    icone: 'flash',
    iconePassage: null,
    couleur: '#E8590C',
    cle: 'jeuxDroneDouble',
  },
};

/** Silhouettes du décor (parallaxe), tirées une fois par largeur d'écran. */
export function silhouettes(largeurPx, hauteurMin, hauteurMax, graine) {
  const liste = [];
  let x = 0;
  let g = graine;
  const alea = () => {
    g = (g * 9301 + 49297) % 233280;
    return g / 233280;
  };
  while (x < largeurPx) {
    const l = 28 + alea() * 46;
    liste.push({
      x,
      l: Math.min(l, largeurPx - x),
      h: hauteurMin + alea() * (hauteurMax - hauteurMin),
      antenne: alea() < 0.25,
    });
    x += l + 2;
  }
  return liste;
}

// Couche de décor : deux copies de la même bande qui défilent en boucle.
// `logo` : petite plaque Pearl Streets discrète posée sur le toit de
// l'immeuble le plus proche du milieu de chaque bande.
const HAUTEUR_PLAQUE = 24;
export const Couche = memo(function Couche({
  liste,
  decalage,
  couleur,
  largeur,
  bas,
  logo = false,
}) {
  const porteur = useMemo(() => {
    if (!logo || !liste.length) return -1;
    let meilleur = 0;
    liste.forEach((b, i) => {
      const ecart = Math.abs(b.x + b.l / 2 - largeur / 2);
      if (
        ecart <
        Math.abs(liste[meilleur].x + liste[meilleur].l / 2 - largeur / 2)
      )
        meilleur = i;
    });
    return meilleur;
  }, [logo, liste, largeur]);
  const lPlaque = logo ? mesurePlaque(HAUTEUR_PLAQUE).l : 0;
  const bande = cle => (
    <View key={cle} style={{width: largeur, height: '100%'}}>
      {liste.map((b, i) => (
        <View
          key={i}
          style={[
            styles.silhouette,
            {
              left: b.x,
              bottom: bas,
              width: b.l,
              height: b.h,
              backgroundColor: couleur,
            },
          ]}>
          {b.antenne && i !== porteur && (
            <View
              style={[
                styles.antenne,
                {left: b.l / 2 - 1, backgroundColor: couleur},
              ]}
            />
          )}
        </View>
      ))}
      {porteur >= 0 && (
        <PlaqueLogo
          hauteur={HAUTEUR_PLAQUE}
          style={[
            styles.plaque,
            {
              left: liste[porteur].x + liste[porteur].l / 2 - lPlaque / 2,
              bottom: bas + liste[porteur].h + 2,
            },
          ]}
        />
      )}
    </View>
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.couche,
        {width: largeur * 2, transform: [{translateX: decalage}]},
      ]}>
      {bande('a')}
      {bande('b')}
    </Animated.View>
  );
});

// Obstacle : morceau du haut (grue, enseigne ou câbles) et immeuble en bas,
// déplacés ensemble ; le centre du passage est à mi-hauteur de la vue.
export const Obstacle = memo(function Obstacle({o, a, k, hPx, pal}) {
  const w = o.largeur * k;
  const ep = o.ecart * k;
  // Plus grande partie visible en haut et en bas (balancement, changement au dernier moment).
  const glisse = o.bascule || 0;
  const hautVisible =
    (o.centre + o.amp + Math.max(0, glisse) - o.ecart / 2) * k;
  const basVisible =
    (HAUTEUR - SOL - (o.centre - o.amp + Math.min(0, glisse) + o.ecart / 2)) *
    k;
  const couleur = pal.immeubles[o.teinte % pal.immeubles.length];
  const rangees = Math.max(
    0,
    Math.min(10, Math.floor((basVisible - 14 * k) / (64 * k))),
  );
  const b = TAILLE_BONUS * k;

  let haut;
  if (o.haut === 'grue') {
    const barres = Math.max(
      1,
      Math.min(12, Math.floor(hautVisible / (44 * k))),
    );
    haut = (
      <View
        style={[
          styles.morceau,
          {
            height: hPx - ep / 2,
            width: w,
            backgroundColor: OR,
            borderColor: '#8A6A00',
            borderWidth: Math.max(1, 3 * k),
          },
        ]}>
        {Array.from({length: barres}).map((_, i) => (
          <View
            key={i}
            style={[
              styles.barre,
              {bottom: 34 * k + i * 44 * k, height: Math.max(2, 6 * k)},
            ]}
          />
        ))}
        <View style={[styles.crochet, {height: 28 * k}]}>
          <MaterialCommunityIcons name="hook" size={24 * k} color={OR} />
        </View>
      </View>
    );
  } else if (o.haut === 'enseigne') {
    haut = (
      <View
        style={[
          styles.morceau,
          {height: hPx - ep / 2, width: w, backgroundColor: pal.poteau},
        ]}>
        <View style={[styles.enseigne, {height: 74 * k, borderRadius: 10 * k}]}>
          <MaterialCommunityIcons
            name="storefront-outline"
            size={40 * k}
            color={C.blanc}
          />
        </View>
      </View>
    );
  } else {
    haut = (
      <View
        style={[
          styles.morceau,
          styles.cables,
          {height: hPx - ep / 2, width: w},
        ]}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.cable,
              {width: w * 0.21, backgroundColor: pal.cable},
            ]}
          />
        ))}
        <View
          style={[styles.boitier, {height: 40 * k, borderColor: pal.cable}]}>
          <MaterialCommunityIcons name="flash" size={22 * k} color={OR} />
        </View>
      </View>
    );
  }

  const vueBonus = o.bonus && !o.bonusPris ? BONUS_VUE[o.bonus] : null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.obstacle,
        {
          top: -hPx,
          width: w,
          height: 2 * hPx + ep,
          transform: [{translateX: a.x}, {translateY: a.y}],
        },
      ]}>
      {haut}
      <View
        style={[
          styles.immeuble,
          {top: hPx + ep / 2, height: hPx, width: w, backgroundColor: couleur},
        ]}>
        <View
          style={{height: Math.max(4, 12 * k), backgroundColor: pal.toit}}
        />
        <View
          style={[
            styles.fenetres,
            {paddingTop: 14 * k, paddingHorizontal: w * 0.16},
          ]}>
          {Array.from({length: rangees * 2}).map((_, i) => (
            <View
              key={i}
              style={[
                styles.fenetre,
                {
                  width: w * 0.26,
                  height: 34 * k,
                  marginBottom: 30 * k,
                  backgroundColor:
                    (i + o.id) % 3 === 0 ? pal.fenetreEteinte : pal.fenetre,
                },
              ]}
            />
          ))}
        </View>
      </View>
      {o.client && (
        <View
          style={[
            styles.client,
            {top: hPx + ep / 2 - 44 * k, width: w, height: 44 * k},
          ]}>
          {!o.livre && (
            <View
              style={[
                styles.demande,
                {
                  top: -26 * k,
                  width: 26 * k,
                  height: 22 * k,
                  borderRadius: 6 * k,
                },
              ]}>
              <MaterialCommunityIcons
                name="package-variant"
                size={16 * k}
                color={C.blanc}
              />
            </View>
          )}
          <MaterialCommunityIcons
            name={o.livre ? 'account-check' : 'human-greeting-variant'}
            size={40 * k}
            color={o.livre ? VERT : C.blanc}
          />
          <View
            style={[
              styles.balcon,
              {left: w * 0.12, right: w * 0.12, height: Math.max(3, 6 * k)},
            ]}
          />
        </View>
      )}
      {vueBonus && (
        <View
          style={[
            styles.bonus,
            {
              top: hPx - b / 2,
              left: w / 2 - b / 2,
              width: b,
              height: b,
              borderRadius: b / 2,
              backgroundColor: vueBonus.couleur,
            },
          ]}>
          {vueBonus.iconePassage ? (
            <MaterialCommunityIcons
              name={vueBonus.iconePassage}
              size={b * 0.62}
              color={C.blanc}
            />
          ) : (
            <Text style={[styles.x2, {fontSize: b * 0.42}]}>x2</Text>
          )}
        </View>
      )}
      {o.signe ? (
        // Signe du changement au dernier moment, devant le passage : il
        // indique de quel côté le passage va glisser, puis disparaît.
        <View
          style={[
            styles.signe,
            {
              top: hPx - (30 * k) / 2,
              left: -30 * k - 8 * k,
              width: 30 * k,
              height: 30 * k,
              borderRadius: 15 * k,
            },
          ]}>
          <MaterialCommunityIcons
            name={o.signe < 0 ? 'chevron-double-up' : 'chevron-double-down'}
            size={24 * k}
            color={C.blanc}
          />
        </View>
      ) : null}
      {o.colis && !o.colisPris && (
        <View
          style={[
            styles.bonus,
            {
              top: hPx - b / 2,
              left: w / 2 - b / 2,
              width: b,
              height: b,
              borderRadius: b * 0.22,
            },
          ]}>
          <MaterialCommunityIcons
            name="package-variant-closed"
            size={b * 0.68}
            color={C.blanc}
          />
        </View>
      )}
    </Animated.View>
  );
});

/** Dessin du drone : hélices, fil et colis accroché dessous, bouclier éventuel. */
export function DessinDrone({taille: D, bouclier}) {
  return (
    <>
      {bouclier && (
        <View
          style={[
            styles.bouclier,
            {
              width: D * 1.15,
              height: D * 1.15,
              borderRadius: D * 0.6,
              left: -D * 0.075,
              top: -D * 0.075,
            },
          ]}
        />
      )}
      <MaterialCommunityIcons
        name="quadcopter"
        size={D * 0.62}
        color={C.marque}
      />
      <View style={[styles.fil, {height: D * 0.1}]} />
      <View
        style={[
          styles.colisDrone,
          {width: D * 0.3, height: D * 0.24, borderRadius: D * 0.04},
        ]}>
        <MaterialCommunityIcons
          name="package-variant-closed"
          size={D * 0.2}
          color={C.blanc}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  couche: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  silhouette: {position: 'absolute'},
  antenne: {position: 'absolute', top: -14, width: 2, height: 14},
  plaque: {position: 'absolute', opacity: 0.6},
  obstacle: {position: 'absolute', left: 0},
  morceau: {position: 'absolute', left: 0, top: 0, overflow: 'hidden'},
  barre: {position: 'absolute', left: 0, right: 0, backgroundColor: '#8A6A00'},
  crochet: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: '#3B3F46',
  },
  enseigne: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.marque,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.blanc,
  },
  cables: {flexDirection: 'row', justifyContent: 'space-between'},
  cable: {
    height: '100%',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  boitier: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: '#7D8794',
  },
  immeuble: {
    position: 'absolute',
    left: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    overflow: 'hidden',
  },
  fenetres: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  fenetre: {borderRadius: 3},
  client: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  demande: {
    position: 'absolute',
    backgroundColor: C.marque,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balcon: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
  },
  bonus: {
    position: 'absolute',
    backgroundColor: OR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.blanc,
  },
  x2: {color: C.blanc, fontWeight: '900'},
  signe: {
    position: 'absolute',
    backgroundColor: OR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.blanc,
  },
  bouclier: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#2D7FF9',
    backgroundColor: 'rgba(45,127,249,0.15)',
  },
  fil: {width: 2, backgroundColor: '#444'},
  colisDrone: {
    backgroundColor: '#B07A45',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
