/**
 * Mini-jeu « Livraison au sommet », pour patienter entre deux courses.
 *
 * Le livreur grimpe la façade d'un immeuble en rebondissant tout seul de
 * balcon en balcon. Le doigt maintenu sur la moitié gauche ou droite de
 * l'écran le dirige ; sortir d'un bord fait revenir par l'autre. Tomber
 * sous le bas de l'écran, un pot de fleurs ou un pigeon (sauf par le
 * dessus) arrête la tournée. Score = étages + 5 points par colis.
 * Difficile : tous les 50 étages un palier annonce un nouveau décor et un
 * nouveau piège (vent, escadrilles, rafales de pots, nacelles express).
 *
 * Logique pure dans utils/jeuSommet.js. Boucle requestAnimationFrame, état
 * dans des refs, monde dessiné dans un calque déplacé d'un bloc (seuls les
 * éléments qui bougent sont redessinés). Pause automatique : arrière-plan,
 * écran quitté, nouvelle course (hooks/usePauseJeu.js). Aucun son.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import usePauseJeu from '../hooks/usePauseJeu';
import ClassementJeu from '../components/ClassementJeu';
import { chargerRecord, envoyerRecordEnAttente, finDePartie } from '../utils/jeuxRecords';
import {
  MONDE_L, ETAGE, JOUEUR_L, JOUEUR_H, PLAT_H, VX_MAX, partieNeuve, avancer,
} from '../utils/jeuSommet';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(fort) {
  try {
    if (!Haptics) return;
    const promesse = fort
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'sommet';
const HAUTEUR_MIN = 520; // hauteur de monde toujours visible (grands écrans larges)
const OR = '#F2B705';

// Décor par palier (tous les 50 étages) : teintes de façade qui changent.
const DECORS = [
  null,
  { clair: ['#E8C3A6', '#D9AE8E', '#C9DDEA', '#C4A183'], sombre: ['#3A2620', '#46302A', '#1B2733', '#5A3F36'] },
  { clair: ['#DCE3EA', '#CBD4DD', '#BFD9EC', '#B3BFCB'], sombre: ['#262B33', '#2E343D', '#17283A', '#3E4752'] },
  { clair: ['#CFE6E8', '#BBD8DB', '#A9D3E6', '#9CBFC4'], sombre: ['#1E2F31', '#263B3E', '#10303F', '#35514F'] },
  { clair: ['#F1D9E8', '#E4C3D8', '#D3D6F2', '#CFA9C2'], sombre: ['#33232E', '#3E2C39', '#1D2142', '#573F4E'] },
];
function appliquerDecor(base, dark, palier) {
  if (!palier) return base;
  const k = 1 + ((palier - 1) % (DECORS.length - 1));
  const [mur, murJoint, vitre, cadre] = DECORS[k][dark ? 'sombre' : 'clair'];
  return { ...base, mur, murJoint, vitre, cadre };
}

function palette(dark) {
  return dark
    ? {
      mur: '#2A2320', murJoint: '#332B27', vitre: '#1B2733', vitreAllumee: '#E7B54F', cadre: '#4A3F39',
      dalle: '#7A716A', dalleBord: '#958B83', console: '#5C544E', trottoir: '#3A3A3D', route: '#26262A',
      matelas: '#3D8BD9', nacelle: '#8D99A6', cable: '#9AA3AD', pot: '#C2643C', pigeon: '#B7C0C9', colis: '#C98A45',
    }
    : {
      mur: '#F3E4D4', murJoint: '#EAD7C3', vitre: '#CFE3F1', vitreAllumee: '#F6D27A', cadre: '#DCC3A9',
      dalle: '#B9B1A8', dalleBord: '#D3CCC4', console: '#9C948B', trottoir: '#C9C9CC', route: '#9EA0A6',
      matelas: '#2F80ED', nacelle: '#7D8995', cable: '#6E7781', pot: '#C2643C', pigeon: '#7A8691', colis: '#B07A3B',
    };
}

// Fenêtres allumées le soir : tirage fixe par étage, la façade ne clignote pas.
function allumee(rang, col) {
  const x = Math.sin(rang * 12.9898 + col * 78.233) * 43758.5453;
  return x - Math.floor(x) < 0.35;
}

/** Un étage de façade (4 fenêtres), redessiné seulement s'il change. */
const Etage = memo(function Etage({ rang, s, dark, p }) {
  const h = ETAGE * s;
  const lf = 44 * s;
  const hf = 34 * s;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: -(rang + 1) * h, height: h }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(1, 2 * s), backgroundColor: p.murJoint }} />
      {[0, 1, 2, 3].map((c) => (
        <View
          key={c}
          style={{
            position: 'absolute',
            left: (22 + c * 86) * s,
            top: (h - hf) / 2,
            width: lf,
            height: hf,
            borderRadius: 3 * s,
            borderWidth: Math.max(1, 2 * s),
            borderColor: p.cadre,
            backgroundColor: dark && allumee(rang, c) ? p.vitreAllumee : p.vitre,
          }}
        >
          <View style={{ position: 'absolute', left: lf / 2 - 1.5 * s, top: 0, bottom: 0, width: Math.max(1, 2 * s), backgroundColor: p.cadre }} />
        </View>
      ))}
    </View>
  );
});

/** Une plateforme (balcon, nacelle, store, matelas, monte-charge). */
const Plateforme = memo(function Plateforme({ type, x, y, l, rot, dechire, s, p }) {
  const left = x * s;
  const top = -y * s;
  const w = l * s;
  const hh = PLAT_H * s;
  if (type === 'sol') return null;
  if (type === 'store') {
    const bandes = 8;
    return (
      <View
        style={{
          position: 'absolute', left, top, width: w, height: hh + 4 * s, flexDirection: 'row',
          borderRadius: 3 * s, overflow: 'hidden', opacity: dechire ? 0.7 : 1,
          transform: [{ rotate: `${dechire ? rot : 0}deg` }],
        }}
      >
        {Array.from({ length: bandes }).map((_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? '#FFFFFF' : BRAND, borderBottomLeftRadius: 5 * s, borderBottomRightRadius: 5 * s }} />
        ))}
      </View>
    );
  }
  if (type === 'nacelle') {
    return (
      <View style={{ position: 'absolute', left, top: top - 70 * s, width: w, height: 70 * s + hh }}>
        <View style={{ position: 'absolute', left: 6 * s, top: 0, width: Math.max(1, 1.5 * s), height: 70 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', right: 6 * s, top: 0, width: Math.max(1, 1.5 * s), height: 70 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: hh, borderRadius: 2 * s, backgroundColor: p.nacelle, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 * s, backgroundColor: OR }} />
        </View>
      </View>
    );
  }
  if (type === 'monte') {
    return (
      <View style={{ position: 'absolute', left, top: top - 50 * s, width: w, height: 50 * s + hh + 34 * s }}>
        <View style={{ position: 'absolute', left: w / 2 - 1 * s, top: 0, width: Math.max(1, 2 * s), height: 50 * s, backgroundColor: p.cable }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 50 * s, height: hh, borderRadius: 2 * s, backgroundColor: OR }} />
        <View
          style={{
            position: 'absolute', left: 6 * s, right: 6 * s, top: 50 * s + hh, height: 34 * s,
            borderWidth: Math.max(1, 2 * s), borderTopWidth: 0, borderColor: OR, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="elevator" size={22 * s} color={OR} />
        </View>
      </View>
    );
  }
  const trampo = type === 'trampo';
  return (
    <View style={{ position: 'absolute', left, top, width: w, height: hh + (trampo ? 8 * s : 0) + 12 * s }}>
      {trampo && (
        <View style={{ height: 8 * s, marginHorizontal: 6 * s, borderRadius: 4 * s, backgroundColor: p.matelas }} />
      )}
      <View style={{ height: hh, borderRadius: 2 * s, backgroundColor: p.dalle, borderTopWidth: Math.max(1, 3 * s), borderTopColor: p.dalleBord }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 * s }}>
        <View style={{ width: 6 * s, height: 10 * s, backgroundColor: p.console, borderBottomLeftRadius: 4 * s, borderBottomRightRadius: 4 * s }} />
        <View style={{ width: 6 * s, height: 10 * s, backgroundColor: p.console, borderBottomLeftRadius: 4 * s, borderBottomRightRadius: 4 * s }} />
      </View>
    </View>
  );
});

const Colis = memo(function Colis({ x, y, s, p }) {
  const t = 26 * s;
  return (
    <View style={{ position: 'absolute', left: x * s - t / 2, top: -y * s - t / 2, width: t, height: t }}>
      <MaterialCommunityIcons name="package-variant-closed" size={t} color={p.colis} />
    </View>
  );
});

function Livreur({ x, y, rot, vx, s }) {
  const l = JOUEUR_L * s;
  const h = JOUEUR_H * s;
  const penche = rot || (vx / VX_MAX) * 10;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x * s - l / 2, top: -y * s - h, width: l, height: h,
        alignItems: 'center', justifyContent: 'flex-end', transform: [{ rotate: `${penche}deg` }],
      }}
    >
      <View style={{ position: 'absolute', top: -4 * s }}>
        <MaterialCommunityIcons name="package-variant-closed" size={18 * s} color="#B07A3B" />
      </View>
      <MaterialCommunityIcons name="human-handsup" size={h * 0.82} color={BRAND} />
    </View>
  );
}

export default function JeuSommetScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [ui, setUi] = useState('accueil'); // accueil | jeu | pause | fin
  const uiRef = useRef('accueil');
  const [, setImage] = useState(0);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [meilleur, setMeilleur] = useState(0);
  const [resultat, setResultat] = useState(null); // { score, etage, colis, cause, nouveauRecord }
  const [classementOuvert, setClassementOuvert] = useState(false);
  const partieRef = useRef(null);
  const dirRef = useRef(0);
  const monteRef = useRef(true);
  const palierEcran = partieRef.current ? partieRef.current.palier : 0;
  const p = useMemo(() => appliquerDecor(palette(dark), dark, palierEcran), [dark, palierEcran]);

  const changerUi = useCallback((u) => {
    uiRef.current = u;
    if (monteRef.current) setUi(u);
  }, []);

  useEffect(() => {
    monteRef.current = true;
    let vivant = true;
    chargerRecord(JEU, user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); });
    return () => { vivant = false; monteRef.current = false; };
  }, [user?.id]);

  // Échelle : largeur du monde = largeur d'écran, mais toujours au moins
  // HAUTEUR_MIN unités visibles en hauteur (tablettes : façade centrée).
  const s = taille.l > 0 ? Math.min(taille.l / MONDE_L, taille.h / HAUTEUR_MIN) : 1;
  const largeurMonde = MONDE_L * s;
  const decalage = (taille.l - largeurMonde) / 2;
  const visibleH = taille.h > 0 ? taille.h / s : 640;
  const visibleRef = useRef(visibleH);
  visibleRef.current = visibleH;
  useEffect(() => {
    if (partieRef.current) partieRef.current.visibleH = visibleH;
  }, [visibleH]);

  const pause = useCallback(() => {
    if (uiRef.current !== 'jeu') return;
    dirRef.current = 0;
    changerUi('pause');
  }, [changerUi]);
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause);

  const terminer = useCallback((e) => {
    dirRef.current = 0;
    const base = { score: e.score, etage: e.etage, colis: e.colis, cause: e.cause, nouveauRecord: false };
    setResultat(base);
    changerUi('fin');
    vibrer(true);
    finDePartie(JEU, user?.id, e.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setResultat((x) => (x === base ? { ...base, nouveauRecord: r.nouveauRecord } : x));
    }).catch(() => {});
  }, [changerUi, user?.id]);

  const jouer = useCallback(() => {
    partieRef.current = partieNeuve(visibleRef.current);
    dirRef.current = 0;
    setResultat(null);
    setClassementOuvert(false);
    changerUi('jeu');
  }, [changerUi]);

  // Boucle de jeu : tourne seulement en phase « jeu ».
  useEffect(() => {
    if (ui !== 'jeu') return undefined;
    let id = null;
    let avant = null;
    const image = (ts) => {
      const e = partieRef.current;
      if (!e || uiRef.current !== 'jeu') return;
      const dt = avant == null ? 0 : (ts - avant) / 1000;
      avant = ts;
      const evts = avancer(e, dt, dirRef.current);
      for (const ev of evts) {
        if (ev === 'colis' || ev === 'trampo' || ev === 'monte' || ev === 'pigeon') vibrer(false);
        else if (ev === 'touche') vibrer(true);
      }
      if (e.phase === 'fin') {
        terminer(e);
        return;
      }
      setImage((n) => (n + 1) % 1000000);
      id = requestAnimationFrame(image);
    };
    id = requestAnimationFrame(image);
    return () => { if (id != null) cancelAnimationFrame(id); };
  }, [ui, terminer]);

  const quitter = useCallback(() => {
    pause();
    navigation.goBack();
  }, [navigation, pause]);

  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [fermerAlerte, navigation, pause]);

  const surMesure = useCallback((ev) => {
    const { width, height } = ev.nativeEvent.layout;
    setTaille((x) => (Math.round(x.l) === Math.round(width) && Math.round(x.h) === Math.round(height) ? x : { l: width, h: height }));
  }, []);

  // Commande : doigt maintenu à gauche ou à droite (le dernier doigt posé
  // compte). Doigt levé : on lit les doigts restants, aucun = tout droit.
  const largeurRef = useRef(0);
  largeurRef.current = taille.l;
  const toucher = useCallback((ev) => {
    const touches = ev.nativeEvent.touches || [];
    if (!touches.length) { dirRef.current = 0; return; }
    const dernier = touches[touches.length - 1];
    dirRef.current = dernier.pageX < largeurRef.current / 2 ? -1 : 1;
  }, []);

  const e = partieRef.current;
  const cam = e && ui !== 'accueil' ? e.cam : 0;
  const premierRang = Math.max(0, Math.floor(cam / ETAGE) - 1);
  const dernierRang = Math.floor((cam + visibleH) / ETAGE) + 1;
  const rangs = [];
  for (let r = premierRang; r <= dernierRang; r += 1) rangs.push(r);
  const joueur = e && ui !== 'accueil' ? e.joueur : { x: MONDE_L / 2, y: 0, vx: 0, rot: 0 };
  const enJeu = ui === 'jeu';
  const hautHud = insets.top + 58;

  return (
    <View style={[styles.ecran, { backgroundColor: dark ? '#14161B' : '#DCEBF7' }]}>
      {/* Zone de jeu : façade, plateformes, livreur, gêneurs */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={surMesure}
        onTouchStart={enJeu ? toucher : undefined}
        onTouchMove={enJeu ? toucher : undefined}
        onTouchEnd={toucher}
        onTouchCancel={toucher}
      >
        {taille.l > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: decalage, top: 0, width: largeurMonde, height: taille.h, overflow: 'hidden', backgroundColor: p.mur }}>
            <View style={{ position: 'absolute', left: 0, top: 0, width: largeurMonde, height: 0, transform: [{ translateY: taille.h + cam * s }] }}>
              {rangs.map((r) => <Etage key={r} rang={r} s={s} dark={dark} p={p} />)}
              {/* Trottoir et rue */}
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 24 * s, backgroundColor: p.trottoir }} />
              <View style={{ position: 'absolute', left: 0, right: 0, top: 24 * s, height: 400 * s, backgroundColor: p.route }} />
              {e && ui !== 'accueil' && e.plateformes.map((pl) => (
                <Plateforme key={pl.id} type={pl.type} x={pl.x} y={pl.y} l={pl.l} rot={pl.rot} dechire={pl.dechire} s={s} p={p} />
              ))}
              {e && ui !== 'accueil' && e.colisListe.map((c) => <Colis key={c.id} x={c.x} y={c.y} s={s} p={p} />)}
              {e && ui !== 'accueil' && e.pots.filter((pot) => pot.alerte <= 0).map((pot) => (
                <View key={pot.id} style={{ position: 'absolute', left: (pot.x - 12) * s, top: -(pot.y + 22) * s, width: 24 * s, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="flower-tulip" size={18 * s} color="#E0457B" />
                  <View style={{ width: 22 * s, height: 16 * s, marginTop: -3 * s, backgroundColor: p.pot, borderBottomLeftRadius: 7 * s, borderBottomRightRadius: 7 * s, borderTopLeftRadius: 2 * s, borderTopRightRadius: 2 * s }} />
                </View>
              ))}
              {e && ui !== 'accueil' && e.pigeons.map((g) => (
                <View
                  key={g.id}
                  style={{ position: 'absolute', left: (g.x - 17) * s, top: -(g.y + 15) * s, transform: [{ scaleX: g.regard }, { rotate: g.mort ? '180deg' : '0deg' }] }}
                >
                  <MaterialCommunityIcons name="bird" size={34 * s} color={p.pigeon} />
                </View>
              ))}
              <Livreur x={joueur.x} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} />
              {/* Copie du livreur au passage d'un bord */}
              {joueur.x < JOUEUR_L && <Livreur x={joueur.x + MONDE_L} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} />}
              {joueur.x > MONDE_L - JOUEUR_L && <Livreur x={joueur.x - MONDE_L} y={joueur.y} rot={joueur.rot} vx={joueur.vx} s={s} />}
            </View>
            {/* Alerte : un pot va tomber ici */}
            {e && ui !== 'accueil' && e.pots.filter((pot) => pot.alerte > 0).map((pot) => (
              <View key={pot.id} style={{ position: 'absolute', left: pot.x * s - 13, top: hautHud + 4 }}>
                <Ionicons name="warning" size={26} color={OR} />
              </View>
            ))}
          </View>
        )}
        {/* Annonce de palier */}
        {enJeu && e && e.annonce > 0 && e.palier > 0 && (
          <View pointerEvents="none" style={[styles.annonce, { top: hautHud + 52 }]}>
            <Text style={styles.annonceTitre}>{t('jeuxSommetPalier', { n: e.palier })}</Text>
            <Text style={styles.annonceTexte}>{t(`jeuxSommetPiege${Math.min(e.palier, 4)}`)}</Text>
          </View>
        )}
        {/* Repères de commande */}
        {enJeu && (
          <View pointerEvents="none" style={[styles.reperes, { bottom: insets.bottom + 14 }]}>
            <Ionicons name="chevron-back-circle" size={38} color="rgba(255,255,255,0.55)" />
            <Ionicons name="chevron-forward-circle" size={38} color="rgba(255,255,255,0.55)" />
          </View>
        )}
      </View>

      {/* Barre du haut : quitter, étage et score, pause */}
      <View style={[styles.haut, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={quitter} style={styles.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        {ui !== 'accueil' && e ? (
          <View style={styles.infos} pointerEvents="none">
            <Text style={styles.etage}>{t('jeuxSommetEtage', { n: e.etage })}</Text>
            <View style={styles.ligneScore}>
              <Text style={styles.score}>{t('jeuScore', { n: e.score })}</Text>
              <MaterialCommunityIcons name="package-variant-closed" size={15} color={colors.textMuted} style={{ marginLeft: 8 }} />
              <Text style={styles.score}> {e.colis}</Text>
            </View>
          </View>
        ) : <View style={{ flex: 1 }} />}
        <Pressable
          onPress={pause}
          disabled={!enJeu}
          style={[styles.rond, styles.rondPause, !enJeu && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityLabel={t('jeuPause')}
        >
          <Ionicons name="pause" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Fenêtres : accueil, pause, fin de partie */}
      {ui !== 'jeu' && !alerteCourse && !classementOuvert && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            {ui === 'accueil' && (
              <>
                <MaterialCommunityIcons name="office-building" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuxSommetTitre')}</Text>
                <Text style={styles.texte}>{t('jeuxSommetRegle')}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetRegle2')}</Text>
                <Text style={styles.record}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuJouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {ui === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={styles.titre}>{t('jeuEnPause')}</Text>
                {e && <Text style={styles.texte}>{t('jeuScore', { n: e.score })}</Text>}
                <Text style={styles.texteDiscret}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton styles={styles} texte={t('jeuReprendre')} onPress={() => changerUi('jeu')} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {ui === 'fin' && resultat && (
              <>
                <Ionicons name={resultat.nouveauRecord ? 'trophy' : 'flag'} size={44} color={resultat.nouveauRecord ? OR : BRAND} />
                <Text style={styles.titre}>{resultat.nouveauRecord ? t('jeuxSommetNouveauRecord') : t('jeuxSommetFinTitre')}</Text>
                <Text style={styles.texteDiscret}>
                  {resultat.cause === 'pot' ? t('jeuxSommetCausePot') : resultat.cause === 'pigeon' ? t('jeuxSommetCausePigeon') : t('jeuxSommetCauseChute')}
                </Text>
                <Text style={styles.gros}>{t('jeuScore', { n: resultat.score })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetEtageAtteint', { n: resultat.etage })}</Text>
                <Text style={styles.texteDiscret}>{t('jeuxSommetColisRamasses', { n: resultat.colis })}</Text>
                <Text style={styles.record}>{t('jeuMeilleurScore', { n: Math.max(meilleur, resultat.score) })}</Text>
                <Bouton styles={styles} texte={t('jeuxSommetRejouer')} onPress={jouer} />
                <Bouton styles={styles} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton styles={styles} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {/* Classement : le jeu reste arrêté derrière. */}
      {classementOuvert && ui !== 'jeu' && !alerteCourse && (
        <View style={styles.voile}>
          <ClassementJeu
            jeu={JEU}
            t={t}
            colors={colors}
            dark={dark}
            avantChargement={() => envoyerRecordEnAttente(JEU, user?.id)}
            onFermer={() => setClassementOuvert(false)}
          />
        </View>
      )}
      {alerteCourse && (
        <View style={styles.voile}>
          <View style={styles.carte}>
            <Ionicons name="bicycle" size={44} color={BRAND} />
            <Text style={styles.titre}>{t('jeuNouvelleCourse')}</Text>
            <Text style={styles.texte}>{t('jeuNouvelleCourseTexte')}</Text>
            <Bouton styles={styles} texte={t('jeuVoirCourse')} onPress={voirCourse} />
            <Bouton styles={styles} secondaire texte={t('jeuResterIci')} onPress={fermerAlerte} />
          </View>
        </View>
      )}
    </View>
  );
}

function Bouton({ texte, onPress, secondaire, styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bouton, secondaire && styles.boutonSecondaire, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.boutonTexte, secondaire && styles.boutonTexteSecondaire]}>{texte}</Text>
    </Pressable>
  );
}

const makeStyles = (c) => StyleSheet.create({
  ecran: { flex: 1 },
  haut: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  infos: {
    flex: 1, alignSelf: 'center', alignItems: 'center', backgroundColor: c.card, borderRadius: 14,
    paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border,
  },
  etage: { color: c.text, fontSize: 17, fontWeight: '800' },
  ligneScore: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  score: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
  annonce: {
    position: 'absolute', left: 24, right: 24, alignItems: 'center', backgroundColor: c.card, borderRadius: 14,
    paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: OR,
  },
  annonceTitre: { color: c.text, fontSize: 17, fontWeight: '800' },
  annonceTexte: { color: c.textSoft, fontSize: 13, marginTop: 2, textAlign: 'center', lineHeight: 18 },
  reperes: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between' },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  gros: { color: c.text, fontSize: 28, fontWeight: '800', marginTop: 10 },
  record: { color: c.text, fontSize: 14, fontWeight: '700', marginTop: 10 },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
