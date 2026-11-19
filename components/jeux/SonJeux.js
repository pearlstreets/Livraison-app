/**
 * Son des mini-jeux : lecteur invisible, musique de fond propre à chaque jeu et
 * bruitages (moteur synthétisé dans utils/jeux/sonJeux.js).
 *
 * Usage dans un écran de jeu :
 *   import SonJeux, {demarrerMusique, arreterMusique, bruit, useSonJeux, ReglagesSon} from '../../components/jeux/SonJeux';
 *   <SonJeux />                      une fois, à la racine de l'écran (WebView cachée 1 px)
 *   demarrerMusique('slalom')        'slalom' | 'pile' | 'tournee' | 'basket' (rejoue au début)
 *   arreterMusique()                 pause, fin de partie, sortie de l'écran
 *   bruit('saut')                    saut, accroupi, ramasse, booster, choc, record,
 *                                    tranche, couteau, carte, vie, sirene, sifflet, niveau, perdu
 *   <ReglagesSon />                  icône son en haut à droite (Musique et Bruitages dans
 *                                    une fenêtre), en premier dans la carte de pause et d'accueil
 *   useSonJeux()                     {musique, bruitages} suivis en direct
 *
 * Règles gérées ici : la musique s'arrête seule quand l'app passe en arrière-plan
 * et au démontage de <SonJeux />. Elle ne redémarre jamais seule : l'écran appelle
 * demarrerMusique() quand la partie reprend. Aucun son si l'interrupteur est coupé.
 * Sans WebView prête, tout appel est ignoré sans erreur.
 */
import React, {memo, useEffect, useRef, useState} from 'react';
import {AppState, Modal, Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import {WebView} from 'react-native-webview';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {
  MOTEUR_AUDIO_JS,
  changerReglageSon,
  chargerReglagesSon,
  ecouterReglagesSon,
  reglagesSon,
} from '../../utils/jeux/sonJeux';
import {COULEURS_JEUX as C} from '../../utils/jeux/commun';

const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><script>${MOTEUR_AUDIO_JS}</script></body></html>`;

let vue = null; // WebView montée
let pret = false;
let jeuVoulu = null; // musique demandée par l'écran

function injecter(code) {
  if (!pret || !vue) return;
  try {
    vue.injectJavaScript(`${code};true;`);
  } catch (e) {
    // Sans son.
  }
}

function synchroniser() {
  injecter(
    `window.sonJeu&&(window.sonJeu.reglages(${JSON.stringify(reglagesSon())}),window.sonJeu.musique(${JSON.stringify(jeuVoulu)}))`,
  );
}

/** Lance la musique du jeu ('slalom', 'pile', 'tournee' ou 'basket'), depuis le début. */
export function demarrerMusique(jeu) {
  jeuVoulu = jeu || null;
  // Relance propre : arrêt puis départ, pour rejouer la boucle au début.
  injecter('window.sonJeu&&window.sonJeu.musique(null)');
  synchroniser();
}

export function arreterMusique() {
  jeuVoulu = null;
  injecter('window.sonJeu&&window.sonJeu.musique(null)');
}

/** Joue un bruitage (ignoré si « Bruitages » est coupé). */
export function bruit(nom) {
  if (!nom || !reglagesSon().bruitages) return;
  injecter(`window.sonJeu&&window.sonJeu.jouer(${JSON.stringify(String(nom))})`);
}

/** Réglages {musique, bruitages}, mis à jour en direct. */
export function useSonJeux() {
  const [r, setR] = useState(reglagesSon());
  useEffect(() => {
    let vivant = true;
    chargerReglagesSon().then(x => vivant && setR(x));
    const stop = ecouterReglagesSon(x => vivant && setR(x));
    return () => {
      vivant = false;
      stop();
    };
  }, []);
  return r;
}

/** Lecteur caché, sans props : jamais redessiné par l'écran du jeu (60 images par seconde). */
function SonJeux() {
  const ref = useRef(null);

  useEffect(() => {
    chargerReglagesSon().then(synchroniser);
    const stopReglages = ecouterReglagesSon(synchroniser);
    const abonnement = AppState.addEventListener('change', etat => {
      if (etat !== 'active') {
        arreterMusique();
        // Arrière-plan : contexte audio en veille tout de suite (batterie).
        injecter('window.sonJeu&&window.sonJeu.veille&&window.sonJeu.veille()');
      }
    });
    return () => {
      stopReglages();
      abonnement?.remove?.();
      arreterMusique();
      if (vue === ref.current) {
        vue = null;
        pret = false;
      }
    };
  }, []);

  return (
    <View style={styles.cache} pointerEvents="none">
      <WebView
        ref={r => {
          ref.current = r;
          if (r) vue = r;
        }}
        originWhitelist={['*']}
        source={{html: PAGE}}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        onLoadEnd={() => {
          pret = true;
          synchroniser();
        }}
        style={styles.cache}
      />
    </View>
  );
}

/**
 * Icône son ronde en haut à droite de la fenêtre (pause, accueil du jeu) :
 * elle ouvre une fenêtre avec Musique et Bruitages. À poser en premier dans
 * la carte de la fenêtre.
 */
export function ReglagesSon({style}) {
  const {t} = useLanguage();
  const r = useSonJeux();
  const [ouvert, setOuvert] = useState(false);
  const actif = r.musique || r.bruitages;
  return (
    <>
      <Pressable
        onPress={() => setOuvert(true)}
        style={[styles.icone, style]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('jeuxReglages')}>
        <Ionicons name={actif ? 'volume-high' : 'volume-mute'} size={20} color={C.texte} />
      </Pressable>
      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        <Pressable style={styles.voile} onPress={() => setOuvert(false)}>
          <Pressable style={styles.fenetre} onPress={() => {}}>
            <View style={styles.entete}>
              <Text style={styles.titre}>{t('jeuxReglages')}</Text>
              <Pressable onPress={() => setOuvert(false)} hitSlop={10} accessibilityRole="button">
                <Ionicons name="close" size={24} color={C.texteDoux} />
              </Pressable>
            </View>
            <Ligne icone="musical-notes" texte={t('jeuxSonMusique')} valeur={r.musique} onChange={v => changerReglageSon('musique', v)} />
            <Ligne icone="volume-high" texte={t('jeuxSonBruitages')} valeur={r.bruitages} onChange={v => changerReglageSon('bruitages', v)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Ligne({icone, texte, valeur, onChange}) {
  return (
    <View style={styles.ligne}>
      <Ionicons name={icone} size={18} color={C.texteDoux} />
      <Text style={styles.libelle}>{texte}</Text>
      <Switch
        value={valeur}
        onValueChange={onChange}
        trackColor={{false: C.bordureForte, true: C.marque}}
        thumbColor={C.blanc}
        accessibilityLabel={texte}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cache: {position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10},
  icone: {
    alignSelf: 'flex-end', marginTop: -10, marginRight: -10, marginBottom: 4, width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: C.bordureForte, backgroundColor: C.blanc, alignItems: 'center', justifyContent: 'center',
  },
  voile: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24},
  fenetre: {width: '100%', maxWidth: 340, backgroundColor: C.blanc, borderRadius: 20, padding: 18},
  entete: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6},
  titre: {color: C.texte, fontSize: 18, fontWeight: '800'},
  ligne: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6},
  libelle: {flex: 1, color: C.texte, fontSize: 14, fontWeight: '600'},
});

export default memo(SonJeux);
