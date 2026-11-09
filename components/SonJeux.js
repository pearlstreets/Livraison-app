/**
 * Lecteur de son invisible des mini-jeux (musique de fond propre à chaque jeu
 * + bruitages), voir utils/sonJeux.js. Tout est synthétisé, rien à télécharger.
 *
 * Usage dans l'écran d'un jeu (une seule fois) :
 *
 *   <SonJeux jeu="coupe" actif={phase === 'jeu'} />
 *   bruit('saut');   // ou jouerSon('saut'), même chose
 *
 * Props :
 *   jeu    'coupe' | 'memoire' | 'drone' | 'toits' | 'sommet' | 'rush'
 *   actif  vrai = la musique joue. Mettre faux à la pause, en fin de partie,
 *          à l'accueil : elle s'arrête. Elle s'arrête aussi toute seule quand
 *          l'application passe en arrière-plan et quand l'écran est quitté.
 *
 * Fonctions exportées (utilisables hors composant, après le montage) :
 *   demarrerMusique(jeu)  lance (ou change) la musique du jeu
 *   arreterMusique()      coupe la musique
 *   bruit(nom)            bruitage : saut, accroupi, ramasse, booster, choc,
 *                         record, tranche, carte, vie, sirene, sifflet, niveau,
 *                         perdu (anciens : piece, bonus, tap, palier, rebond,
 *                         ok, rate)
 *   jouerSon(nom)         alias de bruit()
 *
 * Les interrupteurs Musique et Bruitages (components/ReglagesSon.js) sont
 * suivis en direct et gardés sur le téléphone.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { MOTEUR_AUDIO_JS, chargerReglagesSon, ecouterReglagesSon, reglagesSon } from '../utils/sonJeux';

const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><script>${MOTEUR_AUDIO_JS}</script></body></html>`;

let instance = null;
const voulu = { jeu: null, on: false };
const rappels = new Set();

function injecter(code) {
  if (!instance) return;
  try { instance.injectJavaScript(`${code};true;`); } catch { /* sans son */ }
}

/** Joue un bruitage. */
export function bruit(nom) {
  if (!nom || !instance || !reglagesSon().bruitages) return;
  injecter(`window.sonJeu&&window.sonJeu.jouer(${JSON.stringify(String(nom))})`);
}
export const jouerSon = bruit;

/** Lance la musique du jeu (change de morceau si un autre jouait). */
export function demarrerMusique(jeu) {
  voulu.jeu = jeu || voulu.jeu;
  voulu.on = true;
  rappels.forEach((f) => f());
}

/** Coupe la musique. */
export function arreterMusique() {
  voulu.on = false;
  rappels.forEach((f) => f());
}

export default function SonJeux({ jeu, actif }) {
  const vue = useRef(null);
  const pret = useRef(false);
  const premierPlan = useRef(AppState.currentState === 'active');

  const synchroniser = () => {
    if (!pret.current || !vue.current) return;
    const joue = voulu.on && premierPlan.current;
    injecter(`window.sonJeu&&(window.sonJeu.reglages(${JSON.stringify(reglagesSon())}),window.sonJeu.choisir(${JSON.stringify(voulu.jeu || 'rush')}),window.sonJeu.musique(${joue ? 'true' : 'false'}))`);
  };

  useEffect(() => {
    rappels.add(synchroniser);
    chargerReglagesSon().then(synchroniser);
    const stop = ecouterReglagesSon(synchroniser);
    const abonnement = AppState.addEventListener('change', (etat) => {
      premierPlan.current = etat === 'active';
      synchroniser();
    });
    return () => {
      stop();
      abonnement?.remove?.();
      rappels.delete(synchroniser);
      voulu.on = false;
      injecter('window.sonJeu&&window.sonJeu.musique(false)');
      if (instance === vue.current) instance = null;
    };
  }, []);

  useEffect(() => {
    if (jeu) voulu.jeu = jeu;
    voulu.on = !!actif;
    synchroniser();
  }, [jeu, actif]);

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
