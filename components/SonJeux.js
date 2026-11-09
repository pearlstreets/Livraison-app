/**
 * Lecteur de son invisible des mini-jeux (musique de fond + bruitages), voir
 * utils/sonJeux.js. À placer une fois dans l'écran du jeu :
 *
 *   <SonJeux actif={phase === 'jeu'} />   puis   jouerSon('saut')
 *
 * La musique ne tourne que pendant la partie (actif) ; les réglages
 * « Musique » et « Bruitages » de l'écran Jeux sont suivis en direct.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { MOTEUR_AUDIO_JS, chargerReglagesSon, ecouterReglagesSon, reglagesSon } from '../utils/sonJeux';

const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><script>${MOTEUR_AUDIO_JS}</script></body></html>`;

let instance = null;

/** Joue un bruitage (saut, piece, bonus, choc, tap, rebond, ok, rate, palier). */
export function jouerSon(nom) {
  if (!nom || !instance || !reglagesSon().bruitages) return;
  try {
    instance.injectJavaScript(`window.sonJeu&&window.sonJeu.jouer(${JSON.stringify(String(nom))});true;`);
  } catch {
    // Sans son.
  }
}

export default function SonJeux({ actif }) {
  const vue = useRef(null);
  const pret = useRef(false);
  const actifRef = useRef(actif);
  actifRef.current = actif;

  const envoyer = (code) => {
    if (!pret.current || !vue.current) return;
    try { vue.current.injectJavaScript(`${code};true;`); } catch { /* sans son */ }
  };
  const synchroniser = () => {
    envoyer(`window.sonJeu&&(window.sonJeu.reglages(${JSON.stringify(reglagesSon())}),window.sonJeu.musique(${actifRef.current ? 'true' : 'false'}))`);
  };

  useEffect(() => {
    chargerReglagesSon().then(synchroniser);
    const stop = ecouterReglagesSon(synchroniser);
    return () => {
      stop();
      envoyer('window.sonJeu&&window.sonJeu.musique(false)');
      if (instance === vue.current) instance = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { synchroniser(); }, [actif]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.cache} pointerEvents="none">
      <WebView
        ref={(r) => { vue.current = r; if (r) instance = r; }}
        originWhitelist={['*']}
        source={{ html: PAGE }}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        onLoadEnd={() => { pret.current = true; synchroniser(); }}
        style={styles.cache}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cache: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
