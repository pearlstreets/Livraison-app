import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

// Écran de lancement animé : le P monte de bas en haut (il sort de sa ligne
// de base) et, en même temps, le vélo part du bas de l'écran et roule jusqu'en
// haut pour se garer à sa place à côté du P. Les positions reprennent exactement
// celles de assets/splash.png (image 1024 x 1024 affichée en « contain ») : la
// dernière image de l'animation est identique à l'écran de démarrage natif.
const ORANGE = '#FF6A13';
const P_BOX = { x: 364, y: 262, w: 382, h: 524 };
const VELO_BOX = { x: 196, y: 512, w: 172, h: 178 };
const DELAI_MS = 150;
const MONTEE_MS = 950;
const DUREE_MIN_MS = 1700;

export default function LancementAnime({ pret, onFini }) {
  const { width, height } = useWindowDimensions();
  const cote = Math.min(width, height);
  const k = cote / 1024;
  const origineX = (width - cote) / 2;
  const origineY = (height - cote) / 2;
  const hauteurP = P_BOX.h * k;
  // Le vélo part juste sous le bas de l'écran.
  const departVelo = height - (origineY + VELO_BOX.y * k) + 10;

  const pMontee = useRef(new Animated.Value(hauteurP)).current;
  const pOpacite = useRef(new Animated.Value(0)).current;
  const veloMontee = useRef(new Animated.Value(departVelo)).current;
  const veloBond = useRef(new Animated.Value(0)).current;
  const veloPenche = useRef(new Animated.Value(1)).current;
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

    const montee = { duration: MONTEE_MS, delay: DELAI_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true };
    Animated.parallel([
      // Le P monte de bas en haut.
      Animated.timing(pMontee, { toValue: 0, ...montee }),
      Animated.timing(pOpacite, { toValue: 1, duration: 400, delay: DELAI_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      // Le vélo monte en même temps, penché en avant comme dans une côte,
      // puis se redresse une fois arrivé.
      Animated.timing(veloMontee, { toValue: 0, ...montee }),
      Animated.sequence([
        Animated.delay(DELAI_MS + MONTEE_MS - 150),
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

  const rotation = veloPenche.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fond, { opacity: sortie }]}>
      {/* Cadre du P : ce qui dépasse en dessous est caché, le P sort donc de sa base. */}
      <View
        style={{
          position: 'absolute',
          left: origineX + P_BOX.x * k,
          top: origineY + P_BOX.y * k,
          width: P_BOX.w * k,
          height: hauteurP,
          overflow: 'hidden',
        }}
      >
        <Animated.Image
          source={require('../assets/lancement/p.png')}
          resizeMode="contain"
          style={{
            width: P_BOX.w * k,
            height: hauteurP,
            opacity: pOpacite,
            transform: [{ translateY: pMontee }],
          }}
        />
      </View>
      <Animated.Image
        source={require('../assets/lancement/velo.png')}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: origineX + VELO_BOX.x * k,
          top: origineY + VELO_BOX.y * k,
          width: VELO_BOX.w * k,
          height: VELO_BOX.h * k,
          transform: [{ translateY: Animated.add(veloMontee, veloBond) }, { rotate: rotation }],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fond: { backgroundColor: ORANGE, zIndex: 1000, elevation: 1000 },
});
