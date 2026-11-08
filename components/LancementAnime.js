import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';

// Écran de lancement animé, même principe que l'app pro (le P arrive par la
// gauche en fondu), avec en plus le vélo qui arrive en roulant et se gare à
// côté du P. Les positions reprennent exactement celles de assets/splash.png
// (image 1024 x 1024 affichée en « contain ») : la dernière image de
// l'animation est identique à l'écran de démarrage natif.
const ORANGE = '#FF6A13';
const P_BOX = { x: 364, y: 262, w: 382, h: 524 };
const VELO_BOX = { x: 196, y: 512, w: 172, h: 178 };
const DUREE_MIN_MS = 1700;

export default function LancementAnime({ pret, onFini }) {
  const { width, height } = useWindowDimensions();
  const cote = Math.min(width, height);
  const k = cote / 1024;
  const origineX = (width - cote) / 2;
  const origineY = (height - cote) / 2;

  const pOpacite = useRef(new Animated.Value(0)).current;
  const pDecalage = useRef(new Animated.Value(-60)).current;
  const veloX = useRef(new Animated.Value(-(origineX + VELO_BOX.x * k + VELO_BOX.w * k + 20))).current;
  const veloBond = useRef(new Animated.Value(0)).current;
  const veloPenche = useRef(new Animated.Value(0)).current;
  const sortie = useRef(new Animated.Value(1)).current;
  const [animationFinie, setAnimationFinie] = useState(false);

  useEffect(() => {
    // Petits cahots du vélo pendant qu'il roule.
    const cahots = Animated.loop(
      Animated.sequence([
        Animated.timing(veloBond, { toValue: -3, duration: 110, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(veloBond, { toValue: 0, duration: 110, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    cahots.start();

    Animated.parallel([
      // Le P : comme l'app pro (fondu + arrivée par la gauche).
      Animated.timing(pOpacite, { toValue: 1, duration: 600, delay: 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pDecalage, { toValue: 0, duration: 600, delay: 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      // Le vélo arrive en roulant, freine, puis se pose (léger basculement).
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(veloX, { toValue: 0, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(veloPenche, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(veloPenche, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
      ]),
    ]).start(() => {
      cahots.stop();
      Animated.timing(veloBond, { toValue: 0, duration: 80, useNativeDriver: true }).start();
    });

    const minuteur = setTimeout(() => setAnimationFinie(true), DUREE_MIN_MS);
    return () => { clearTimeout(minuteur); cahots.stop(); };
  }, []);

  // On ne s'efface qu'une fois l'animation vue ET l'app prête derrière.
  useEffect(() => {
    if (!animationFinie || !pret) return;
    Animated.timing(sortie, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => onFini && onFini());
  }, [animationFinie, pret]);

  const rotation = veloPenche.interpolate({ inputRange: [-1, 0, 1], outputRange: ['6deg', '0deg', '-6deg'] });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fond, { opacity: sortie }]}>
      <Animated.Image
        source={require('../assets/lancement/p.png')}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: origineX + P_BOX.x * k,
          top: origineY + P_BOX.y * k,
          width: P_BOX.w * k,
          height: P_BOX.h * k,
          opacity: pOpacite,
          transform: [{ translateX: pDecalage }],
        }}
      />
      <Animated.Image
        source={require('../assets/lancement/velo.png')}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: origineX + VELO_BOX.x * k,
          top: origineY + VELO_BOX.y * k,
          width: VELO_BOX.w * k,
          height: VELO_BOX.h * k,
          transform: [{ translateX: veloX }, { translateY: veloBond }, { rotate: rotation }],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fond: { backgroundColor: ORANGE, zIndex: 1000, elevation: 1000 },
});
