import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

// Animation d'ouverture, même principe que l'app user (le bonhomme qui marche
// sur le P) : le vélo apparaît en bas du P, à sa place du logo, monte le long
// de la barre en la dessinant sous ses roues, s'arrête en haut de la barre et
// le cycliste lève les bras ; la boucle du P finit de se dessiner, puis le
// point tombe au milieu.
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
const BAS_P = 777;
const L_BARRE = BAS_BARRE - C.y; // 338
const L_HAUT = Math.PI * R; // demi-boucle du haut (9 h -> 3 h)
const L_QUART = (Math.PI / 2) * R; // 3 h -> 6 h
const L_TOTAL = L_BARRE + L_HAUT + L_QUART + 45;

// Le vélo roule à gauche de la barre, comme sur le logo. s = distance le long
// de la barre depuis son bas ; le centre du vélo est à BAS_BARRE - s.
const X_VELO = X_BARRE - 133;
const S_DEPART = BAS_BARRE - (BAS_P - VELO.h / 2); // roues au bas du P
const S_ARRET = L_BARRE; // haut de la barre, là où la boucle commence
const AVANCE_TRAIT = 90; // le trait est dessiné jusqu'à l'avant du vélo

const APPARITION_MS = 300;
const MONTEE_MS = 850;
const BOUCLE_MS = 450;
const DUREE_MIN_MS = 2300;

export default function LancementAnime({ pret, onFini }) {
  const { width, height } = useWindowDimensions();
  const cote = Math.min(width, height);
  const k = cote / 1024;
  const origineX = (width - cote) / 2;
  const origineY = (height - cote) / 2;
  const X = (v) => origineX + v * k;
  const Y = (v) => origineY + v * k;

  const apparition = useRef(new Animated.Value(0)).current;
  const roule = useRef(new Animated.Value(S_DEPART)).current;
  const boucle = useRef(new Animated.Value(0)).current;
  const bras = useRef(new Animated.Value(0)).current;
  const saut = useRef(new Animated.Value(0)).current;
  const chute = useRef(new Animated.Value(-(Y(POINT_BOX.y) + POINT_BOX.h * k + 20))).current;
  const sortie = useRef(new Animated.Value(1)).current;
  const [animationFinie, setAnimationFinie] = useState(false);

  useEffect(() => {
    const natif = { useNativeDriver: true };
    Animated.sequence([
      // 1. Le vélo apparaît en bas du P ; le bas de la barre se dessine sous lui.
      Animated.timing(apparition, { toValue: 1, duration: APPARITION_MS, easing: Easing.out(Easing.back(1.6)), ...natif }),
      // 2. Il monte le long de la barre en la dessinant.
      Animated.timing(roule, { toValue: S_ARRET, duration: MONTEE_MS, easing: Easing.inOut(Easing.quad), ...natif }),
      Animated.parallel([
        // 3. Arrivé en haut : il lève les bras et saute de joie...
        Animated.timing(bras, { toValue: 1, duration: 120, ...natif }),
        Animated.sequence([
          Animated.timing(saut, { toValue: -18, duration: 140, easing: Easing.out(Easing.quad), ...natif }),
          Animated.timing(saut, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), ...natif }),
          Animated.timing(saut, { toValue: -10, duration: 110, easing: Easing.out(Easing.quad), ...natif }),
          Animated.timing(saut, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), ...natif }),
        ]),
        // ... pendant que la boucle du P finit de se dessiner,
        Animated.timing(boucle, { toValue: 1, duration: BOUCLE_MS, easing: Easing.inOut(Easing.quad), ...natif }),
        // 4. puis le point tombe au milieu du P, avec un rebond.
        Animated.sequence([
          Animated.delay(BOUCLE_MS - 100),
          Animated.spring(chute, { toValue: 0, friction: 6, tension: 70, ...natif }),
        ]),
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

  // Avancée du trait : jusqu'à l'avant du vélo pendant la montée, puis la boucle.
  const avantVelo = S_DEPART + AVANCE_TRAIT;
  const trait = Animated.add(
    Animated.add(
      apparition.interpolate({ inputRange: [0, 1], outputRange: [0, avantVelo], extrapolate: 'clamp' }),
      roule.interpolate({ inputRange: [S_DEPART, S_ARRET], outputRange: [0, S_ARRET - S_DEPART], extrapolate: 'clamp' }),
    ),
    boucle.interpolate({ inputRange: [0, 1], outputRange: [0, L_TOTAL - (S_ARRET + AVANCE_TRAIT)] }),
  );
  const cacheBarre = trait.interpolate({ inputRange: [0, L_BARRE], outputRange: [0, -(L_BARRE + 8) * k], extrapolate: 'clamp' });
  const cacheHaut = trait.interpolate({ inputRange: [L_BARRE, L_BARRE + L_HAUT], outputRange: ['0deg', '180deg'], extrapolate: 'clamp' });
  const cacheBas = trait.interpolate({ inputRange: [L_BARRE + L_HAUT, L_BARRE + L_HAUT + L_QUART, L_TOTAL], outputRange: ['0deg', '90deg', '180deg'], extrapolate: 'clamp' });

  // Vélo : posé à l'arrivée (haut de la barre), décalé vers le bas avant.
  const veloY = Animated.add(
    roule.interpolate({ inputRange: [S_DEPART, S_ARRET], outputRange: [(S_ARRET - S_DEPART) * k, 0], extrapolate: 'clamp' }),
    saut,
  );
  const veloEchelle = apparition.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const veloOpacite = apparition.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const styleVelo = {
    position: 'absolute',
    left: X(X_VELO - VELO.w / 2),
    top: Y(BAS_BARRE - S_ARRET - VELO.h / 2),
    width: VELO.w * k,
    height: VELO.h * k,
  };

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
      <Animated.View style={[styleVelo, { opacity: veloOpacite, transform: [{ translateY: veloY }, { scale: veloEchelle }] }]}>
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
