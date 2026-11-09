/**
 * Décor lumineux de « Fruits express » (screens/JeuCoupeScreen.js), dessiné
 * en code : ciel du matin, soleil, nuages qui dérivent, immeubles pastel au
 * loin, une rue où passe un scooter de livraison, puis l'étal du primeur au
 * premier plan (nappe rayée, cagettes de fruits) avec l'enseigne Pearl Streets
 * posée sur l'étal, en bas, loin des ficelles et des compteurs du haut.
 *
 * Toujours clair (jamais de fond sombre), ne capte jamais le toucher.
 * Les animations (nuages, scooter) tournent en pilote natif et s'arrêtent
 * au démontage.
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { EnseignePearl, VERT_PEARL } from './FondJeu';

// Ciel : bandes du haut (bleu) vers l'horizon (crème chaud).
const CIEL = ['#7FD0FF', '#92D8FF', '#A8E0FF', '#BFE8FF', '#D6F0FF', '#EAF6FF', '#FFF3D2', '#FFE9B8'];
const PASTEL = ['#F7C9A3', '#BDE4D2', '#F4D5E6', '#C9D9F6', '#FBE3A6', '#D8CBF0'];
const FENETRE = '#FFFFFFAA';
// Immeubles lointains : position et largeur en part de l'écran, hauteur en px (0 à 1 du maximum).
const IMMEUBLES = [
  [0.0, 0.14, 0.7], [0.13, 0.11, 1], [0.23, 0.15, 0.62], [0.37, 0.12, 0.88], [0.48, 0.16, 0.7],
  [0.63, 0.12, 1], [0.74, 0.14, 0.66], [0.87, 0.14, 0.9],
];
const NUAGES = [[0.08, 0.17, 1], [0.58, 0.1, 0.8], [0.34, 0.3, 0.6]]; // x (part), y (part de l'horizon), échelle
const FRUITS_CAGETTES = ['🍎', '🍊', '🍋', '🍓', '🍇', '🥝', '🍑'];
const BOIS = '#C99A5B';
const LATTE = '#A9783F';

function Nuage({ x, y, echelle, derive }) {
  const w = 74 * echelle;
  const dx = derive.interpolate({ inputRange: [0, 1], outputRange: [-14 * echelle, 22 * echelle] });
  return (
    <Animated.View style={{ position: 'absolute', left: x, top: y, width: w, height: w * 0.5, transform: [{ translateX: dx }] }}>
      <View style={[styles.bosse, { left: 0, bottom: 0, width: w * 0.5, height: w * 0.32 }]} />
      <View style={[styles.bosse, { left: w * 0.18, bottom: w * 0.08, width: w * 0.46, height: w * 0.42 }]} />
      <View style={[styles.bosse, { left: w * 0.46, bottom: 0, width: w * 0.54, height: w * 0.34 }]} />
    </Animated.View>
  );
}

// Scooter de livraison vu de côté, il roule vers la droite : roues, carrosserie verte, pilote, boîte orange.
function Scooter() {
  return (
    <View style={styles.scooter}>
      {/* Boîte de livraison à l'arrière */}
      <View style={styles.boite}>
        <View style={styles.boiteRuban} />
      </View>
      {/* Pilote */}
      <View style={styles.pilote} />
      <View style={styles.tete} />
      {/* Carrosserie */}
      <View style={styles.corps} />
      <View style={styles.bouclier} />
      <View style={styles.guidon} />
      <View style={[styles.roue, { left: 4 }]}><View style={styles.moyeu} /></View>
      <View style={[styles.roue, { left: 46 }]}><View style={styles.moyeu} /></View>
    </View>
  );
}

function DecorCoupe({ l, h, haut = 0 }) {
  const derive = useRef(new Animated.Value(0)).current;
  const roule = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const nuages = Animated.loop(Animated.sequence([
      Animated.timing(derive, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(derive, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const scooter = Animated.loop(Animated.timing(roule, { toValue: 1, duration: 11000, easing: Easing.linear, useNativeDriver: true }));
    nuages.start();
    scooter.start();
    return () => { nuages.stop(); scooter.stop(); };
  }, [derive, roule]);

  if (!l || !h) return null;

  const horizon = Math.round(h * 0.6);
  const bande = Math.ceil(horizon / CIEL.length);
  const hImmeuble = Math.min(150, h * 0.17);
  const hRue = Math.max(26, h * 0.045);
  const hCagette = Math.max(48, h * 0.075);
  const hNappe = 24;
  const largeurEnseigne = Math.min(l * 0.44, 180);
  const nbCagettes = Math.max(3, Math.round(l / 120));
  const lCagette = l / nbCagettes;
  const posScooter = roule.interpolate({ inputRange: [0, 1], outputRange: [-90, l + 30] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fond]}>
      {/* Ciel en bandes */}
      {CIEL.map((c, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * bande, height: bande + 1, backgroundColor: c }} />
      ))}
      {/* Soleil et son halo */}
      <View style={[styles.halo, { left: l * 0.74 - 52, top: haut + 56, width: 104, height: 104, borderRadius: 52, opacity: 0.35 }]} />
      <View style={[styles.halo, { left: l * 0.74 - 38, top: haut + 70, width: 76, height: 76, borderRadius: 38, opacity: 0.55 }]} />
      <View style={[styles.soleil, { left: l * 0.74 - 26, top: haut + 82 }]} />
      {/* Nuages */}
      {NUAGES.map(([x, y, e], i) => (
        <Nuage key={i} x={x * l} y={haut + 60 + y * (horizon - haut - 140)} echelle={e} derive={derive} />
      ))}
      {/* Immeubles pastel au loin */}
      {IMMEUBLES.map(([x, w, hh], i) => {
        const hauteur = hImmeuble * hh;
        return (
          <View
            key={i}
            style={{
              position: 'absolute', left: x * l, top: horizon - hauteur, width: w * l + 1, height: hauteur,
              backgroundColor: PASTEL[i % PASTEL.length], borderTopLeftRadius: 4, borderTopRightRadius: 4,
              flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingTop: 8, gap: 6, overflow: 'hidden',
            }}
          >
            {Array.from({ length: 6 }).map((_, j) => (
              <View key={j} style={{ width: 6, height: 8, borderRadius: 1.5, backgroundColor: FENETRE }} />
            ))}
          </View>
        );
      })}
      {/* Trottoir et rue */}
      <View style={[styles.trottoir, { top: horizon, bottom: 0 }]} />
      <View style={[styles.rue, { top: horizon + 6, height: hRue }]}>
        {Array.from({ length: Math.ceil(l / 46) }).map((_, i) => (
          <View key={i} style={styles.tiret} />
        ))}
      </View>
      <Animated.View style={{ position: 'absolute', top: horizon + 6 + hRue / 2 - 38, left: 0, transform: [{ translateX: posScooter }] }}>
        <Scooter />
      </Animated.View>

      {/* Étal : enseigne Pearl Streets sur ses montants, nappe rayée, cagettes */}
      <EnseignePearl
        largeur={largeurEnseigne}
        pieds={hNappe - 2}
        couleurSupport="#8A6A43"
        style={{ position: 'absolute', left: (l - largeurEnseigne) / 2, bottom: hCagette + 6 }}
      />
      <View style={[styles.nappe, { bottom: hCagette - 2, height: hNappe }]}>
        {Array.from({ length: Math.ceil(l / 26) + 1 }).map((_, i) => (
          <View key={i} style={{ width: 26, height: hNappe, backgroundColor: i % 2 ? '#FFFFFF' : VERT_PEARL }} />
        ))}
      </View>
      <View style={[styles.nappe, { bottom: hCagette - 2 - 7, height: 14 }]}>
        {Array.from({ length: Math.ceil(l / 26) + 1 }).map((_, i) => (
          <View key={i} style={{ width: 26, height: 14, borderRadius: 13, backgroundColor: i % 2 ? '#FFFFFF' : VERT_PEARL }} />
        ))}
      </View>
      <View style={[styles.nappe, { bottom: 0, height: hCagette }]}>
        {Array.from({ length: nbCagettes }).map((_, i) => (
          <View key={i} style={{ width: lCagette - 6, marginHorizontal: 3, height: hCagette - 6, marginTop: 6, backgroundColor: BOIS, borderTopLeftRadius: 5, borderTopRightRadius: 5, overflow: 'hidden' }}>
            <View style={styles.fruitsCagette}>
              {[0, 1, 2].map((j) => (
                <Text key={j} style={styles.fruitCagette}>{FRUITS_CAGETTES[(i * 3 + j) % FRUITS_CAGETTES.length]}</Text>
              ))}
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '38%', backgroundColor: BOIS }}>
              <View style={{ height: 3, marginTop: 7, backgroundColor: LATTE }} />
              <View style={{ height: 3, marginTop: 8, backgroundColor: LATTE }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default memo(DecorCoupe);

const styles = StyleSheet.create({
  fond: { overflow: 'hidden', backgroundColor: '#F4E7CC' },
  halo: { position: 'absolute', backgroundColor: '#FFE9A0' },
  soleil: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFD54A' },
  bosse: { position: 'absolute', borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.92)' },
  trottoir: { position: 'absolute', left: 0, right: 0, backgroundColor: '#F2E4C6' },
  rue: { position: 'absolute', left: 0, right: 0, backgroundColor: '#9FB0C3', justifyContent: 'center', flexDirection: 'row', overflow: 'hidden' },
  tiret: { width: 22, height: 3, marginRight: 24, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 2, opacity: 0.85 },
  nappe: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', overflow: 'hidden' },
  fruitsCagette: { flexDirection: 'row', justifyContent: 'center', marginTop: -10 },
  fruitCagette: { fontSize: 24, marginHorizontal: -1 },
  // Scooter
  scooter: { width: 72, height: 44 },
  roue: {
    position: 'absolute', bottom: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#3A4660',
    alignItems: 'center', justifyContent: 'center',
  },
  moyeu: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9D3E0' },
  corps: { position: 'absolute', left: 12, bottom: 12, width: 44, height: 12, borderRadius: 6, backgroundColor: VERT_PEARL },
  bouclier: { position: 'absolute', left: 50, bottom: 14, width: 7, height: 26, borderRadius: 4, backgroundColor: VERT_PEARL },
  guidon: { position: 'absolute', left: 48, bottom: 38, width: 12, height: 4, borderRadius: 2, backgroundColor: '#5E6878' },
  pilote: { position: 'absolute', left: 26, bottom: 22, width: 14, height: 20, borderRadius: 6, backgroundColor: '#2F6FED' },
  tete: { position: 'absolute', left: 28, bottom: 40, width: 12, height: 12, borderRadius: 6, backgroundColor: '#F4C6A0', borderTopWidth: 4, borderTopColor: '#FF7A1A' },
  boite: { position: 'absolute', left: 0, bottom: 20, width: 24, height: 22, borderRadius: 4, backgroundColor: '#FF7A1A', justifyContent: 'center' },
  boiteRuban: { height: 5, backgroundColor: '#FFFFFF', opacity: 0.85 },
});
