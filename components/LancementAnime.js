import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

// Animation d'ouverture, même principe que l'app user : le « P » se dessine
// de bas en haut sous les roues du vélo, qui apparaît au pied du P (comme le
// bonhomme de l'app user), monte le long de la barre du P puis fait le tour de la boucle ; une fois le
// vélo arrivé en haut, le point tombe au milieu du P.
//
// Pas de react-native-svg dans cette app (et une mise à jour OTA ne peut pas
// l'ajouter) : le tracé est révélé par des caches orange qu'on retire (la barre
// glisse vers le haut, la boucle tourne comme une aiguille). Tout passe par le
// pilote natif, donc l'animation reste fluide pendant que l'app démarre.
//
// Les coordonnées sont celles de assets/splash.png (1024 x 1024 en « contain »).
const ORANGE = '#FF6A13';
const P_BOX = { x: 364, y: 262, w: 382, h: 524 };
const POINT_BOX = { x: 496, y: 394, w: 110, h: 112 };
const VELO = { w: 172, h: 178 };

// Tracé du P (milieu du trait) : barre verticale de BAS_BARRE à C.y, puis
// boucle de rayon R autour de C, dans le sens des aiguilles d'une montre,
// partant de 9 h, jusqu'à la petite queue qui revient vers la barre.
const C = { x: 552, y: 452 };
const R = 137;
const X_BARRE = 415.5;
const BAS_BARRE = 790;
const BAS_P = 777; // bas du P sur le logo : les roues du vélo s'y posent
const L_BARRE = BAS_BARRE - C.y; // 338
const L_HAUT = Math.PI * R; // demi-boucle du haut (9 h -> 3 h)
const L_QUART = (Math.PI / 2) * R; // 3 h -> 6 h
const L_TOTAL = L_BARRE + L_HAUT + L_QUART + 45;

// Le vélo roule à côté du trait (à gauche de la barre, puis à l'extérieur de
// la boucle), comme sur le logo.
const ECART_VELO = 133;
const ANGLE_ARRET = 119; // degrés depuis 9 h : en haut, un peu passé midi
const S_ARRET = L_BARRE + (ANGLE_ARRET * Math.PI / 180) * R;
const AVANCE_TRAIT = 90; // le trait se dessine juste devant les roues

const DELAI_MS = 100;
const APPARITION_MS = 300;
const ROULE_MS = 1150;
const FIN_TRAIT_MS = 260;
const DUREE_MIN_MS = 2300;

// Centre du vélo et inclinaison pour une distance s le long du tracé
// (s négatif : sur le prolongement de la barre, sous le P).
function veloA(s) {
  if (s <= L_BARRE) return { x: X_BARRE - ECART_VELO, y: BAS_BARRE - s, rot: 0 };
  const a = (s - L_BARRE) / R;
  const r = R + ECART_VELO;
  return { x: C.x - r * Math.cos(a), y: C.y - r * Math.sin(a), rot: (a * 180) / Math.PI };
}

export default function LancementAnime({ pret, onFini }) {
  const { width, height } = useWindowDimensions();
  const cote = Math.min(width, height);
  const k = cote / 1024;
  const origineX = (width - cote) / 2;
  const origineY = (height - cote) / 2;
  const X = (v) => origineX + v * k;
  const Y = (v) => origineY + v * k;

  // Départ du vélo : posé au pied du P, à sa place sur le logo.
  const S_DEPART = BAS_BARRE - (BAS_P - VELO.h / 2);

  const roule = useRef(new Animated.Value(S_DEPART)).current;
  const apparition = useRef(new Animated.Value(0)).current;
  const bras = useRef(new Animated.Value(0)).current;
  const finTrait = useRef(new Animated.Value(0)).current;
  const saut = useRef(new Animated.Value(0)).current;
  const chute = useRef(new Animated.Value(-(Y(POINT_BOX.y) + POINT_BOX.h * k + 20))).current;
  const sortie = useRef(new Animated.Value(1)).current;
  const [animationFinie, setAnimationFinie] = useState(false);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(DELAI_MS),
      // Le vélo apparaît au pied du P avec un petit rebond.
      Animated.timing(apparition, { toValue: 1, duration: APPARITION_MS, easing: Easing.back(1.6), useNativeDriver: true }),
      Animated.timing(roule, { toValue: S_ARRET, duration: ROULE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.parallel([
        // Arrivé en haut, le cycliste lève les bras.
        Animated.timing(bras, { toValue: 1, duration: 120, useNativeDriver: true }),
        // Le trait finit de se dessiner devant le vélo arrêté.
        Animated.timing(finTrait, { toValue: L_TOTAL - (S_ARRET + AVANCE_TRAIT), duration: FIN_TRAIT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        // Petit saut de joie, comme le bonhomme de l'app user.
        Animated.sequence([
          Animated.timing(saut, { toValue: -16, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(saut, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(saut, { toValue: -8, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(saut, { toValue: 0, duration: 100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        // Le point tombe au milieu du P, avec un rebond.
        Animated.spring(chute, { toValue: 0, friction: 6, tension: 70, useNativeDriver: true }),
      ]),
    ]).start();

    const minuteur = setTimeout(() => setAnimationFinie(true), DUREE_MIN_MS);
    return () => clearTimeout(minuteur);
  }, []);

  // On ne s'efface qu'une fois l'animation vue ET l'app prête derrière.
  useEffect(() => {
    if (!animationFinie || !pret) return;
    Animated.timing(sortie, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => onFini && onFini());
  }, [animationFinie, pret]);

  // Position du vélo : tracé échantillonné, interpolé par le pilote natif.
  const echantillons = [];
  for (let i = 0; i <= 48; i++) echantillons.push(S_DEPART + ((S_ARRET - S_DEPART) * i) / 48);
  const points = echantillons.map(veloA);
  const arrivee = points[points.length - 1];
  const veloX = roule.interpolate({ inputRange: echantillons, outputRange: points.map((p) => (p.x - arrivee.x) * k) });
  const veloY = roule.interpolate({ inputRange: echantillons, outputRange: points.map((p) => (p.y - arrivee.y) * k) });
  const veloRot = roule.interpolate({ inputRange: echantillons, outputRange: points.map((p) => `${p.rot}deg`) });

  // Avancée du trait = sous les roues au départ, un peu devant le vélo ensuite, puis jusqu'au bout.
  const trait = Animated.add(
    // La barre est déjà dessinée sous le vélo quand il apparaît, puis elle suit ses roues.
    Animated.multiply(
      apparition.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      roule.interpolate({ inputRange: [S_DEPART, S_ARRET], outputRange: [S_DEPART + AVANCE_TRAIT, S_ARRET + AVANCE_TRAIT], extrapolate: 'clamp' }),
    ),
    finTrait,
  );
  const cacheBarre = trait.interpolate({ inputRange: [0, L_BARRE], outputRange: [0, -(L_BARRE + 8) * k], extrapolate: 'clamp' });
  const cacheHaut = trait.interpolate({ inputRange: [L_BARRE, L_BARRE + L_HAUT], outputRange: ['0deg', '180deg'], extrapolate: 'clamp' });
  const cacheBas = trait.interpolate({ inputRange: [L_BARRE + L_HAUT, L_BARRE + L_HAUT + L_QUART, L_TOTAL], outputRange: ['0deg', '90deg', '180deg'], extrapolate: 'clamp' });

  // Cache tournant : carré centré sur C, moitié haute (ou basse) orange.
  const D = 320;
  const cacheTournant = (zone, moitie, rotation) => (
    <View style={[styles.zone, { left: X(zone.x), top: Y(zone.y), width: zone.w * k, height: zone.h * k }]}>
      <Animated.View
        style={{
          position: 'absolute',
          left: (C.x - D - zone.x) * k,
          top: (C.y - D - zone.y) * k,
          width: 2 * D * k,
          height: 2 * D * k,
          transform: [{ rotate: rotation }],
        }}
      >
        <View style={[styles.orange, { position: 'absolute', left: 0, width: 2 * D * k, height: D * k, top: moitie === 'haut' ? 0 : D * k }]} />
      </Animated.View>
    </View>
  );
  const ZONE_BARRE = { x: 360, y: C.y - 1, w: 108, h: BAS_BARRE + 6 - C.y };
  const ZONE_HAUT = { x: 360, y: 258, w: 390, h: C.y - 258 };
  const ZONE_BAS = { x: 467, y: C.y, w: 283, h: 196 };

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.orange, styles.fond, { opacity: sortie }]}>
      <Animated.Image
        source={require('../assets/lancement/p-trait.png')}
        resizeMode="contain"
        style={{ position: 'absolute', left: X(P_BOX.x), top: Y(P_BOX.y), width: P_BOX.w * k, height: P_BOX.h * k }}
      />
      <View style={[styles.zone, { left: X(ZONE_BARRE.x), top: Y(ZONE_BARRE.y), width: ZONE_BARRE.w * k, height: ZONE_BARRE.h * k }]}>
        <Animated.View style={[styles.orange, StyleSheet.absoluteFill, { transform: [{ translateY: cacheBarre }] }]} />
      </View>
      {cacheTournant(ZONE_HAUT, 'haut', cacheHaut)}
      {cacheTournant(ZONE_BAS, 'bas', cacheBas)}
      <Animated.Image
        source={require('../assets/lancement/point.png')}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: X(POINT_BOX.x),
          top: Y(POINT_BOX.y),
          width: POINT_BOX.w * k,
          height: POINT_BOX.h * k,
          transform: [{ translateY: chute }],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          left: X(arrivee.x - VELO.w / 2),
          top: Y(arrivee.y - VELO.h / 2),
          width: VELO.w * k,
          height: VELO.h * k,
          transform: [{ translateX: veloX }, { translateY: Animated.add(veloY, saut) }, { rotate: veloRot }, { scale: apparition.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
          opacity: apparition.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
        }}
      >
        <Animated.Image
          source={require('../assets/lancement/velo.png')}
          resizeMode="contain"
          style={[StyleSheet.absoluteFill, { opacity: bras.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
        />
        <Animated.Image
          source={require('../assets/lancement/velo-bras.png')}
          resizeMode="contain"
          style={[StyleSheet.absoluteFill, { opacity: bras }]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fond: { zIndex: 1000, elevation: 1000 },
  orange: { backgroundColor: ORANGE },
  zone: { position: 'absolute', overflow: 'hidden' },
});
