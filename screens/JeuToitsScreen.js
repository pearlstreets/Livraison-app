/**
 * Mini-jeu « Tournée des toits », pour patienter entre deux courses.
 *
 * Plateforme à défilement horizontal : le livreur saute de trottoir en toit,
 * d'échafaudage en auvent, ramasse des colis, frappe les boîtes aux lettres par
 * dessous, écarte chiens, pigeons et trottinettes en leur sautant dessus et
 * livre le colis à la porte du client. Niveaux générés et toujours faisables
 * (utils/jeuToits.js), de plus en plus longs, sans fin. 3 vies par partie.
 *
 * Pause automatique : arrière-plan, écran quitté, nouvelle course
 * (hooks/usePauseJeu.js). Aucun son.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme, BRAND } from '../contexts/ThemeContext';
import ClassementJeu from '../components/ClassementJeu';
import usePauseJeu from '../hooks/usePauseJeu';
import { chargerRecord, finDePartie, envoyerRecordEnAttente } from '../utils/jeuxRecords';
import {
  LARGEUR, HAUTEUR, SOL_ECRAN, VIES, POINTS, TAILLES,
  creerMonde, pas, avancee, visibles, genererFond,
} from '../utils/jeuToits';

// Vibration légère : module natif facultatif, le jeu marche sans.
let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
function vibrer(type) {
  try {
    if (!Haptics) return;
    let promesse;
    if (type === 'perte') promesse = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (type === 'livre') promesse = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'fort') promesse = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else promesse = Haptics.selectionAsync();
    promesse?.catch?.(() => {});
  } catch {
    // Sans vibration.
  }
}

const JEU = 'toits';
const CLE_DECOR = { jour: 'jeuxToitsDecorJour', soir: 'jeuxToitsDecorSoir', nuit: 'jeuxToitsDecorNuit', pluie: 'jeuxToitsDecorPluie' };
const ICONE_ASTRE = { jour: 'white-balance-sunny', soir: 'weather-sunset', nuit: 'weather-night', pluie: 'weather-pouring' };
// Étoiles et gouttes : positions fixes, calculées une fois.
const ETOILES = Array.from({ length: 16 }, (_, i) => ({
  id: i, x: (i * 37 + 11) % 96, y: (i * 23 + 5) % 52, o: 0.45 + ((i * 7) % 5) / 10,
}));
const GOUTTES = Array.from({ length: 26 }, (_, i) => ({
  id: i, x: (i * 41 + 7) % 100, v: 1.1 + ((i * 13) % 7) / 10, p: ((i * 29) % 100) / 100,
}));
const OR = '#F2B705';
const LARGEUR_VUE = 300; // largeur de monde visible (unités)
const HAUTEUR_VUE_MIN = 330;
const BAS_DESSIN = -230; // les colonnes sont dessinées jusque sous l'écran
const TRANCHE = 240; // le décor fixe n'est recalculé qu'à chaque tranche de défilement
const PARALLAXE = 0.45;

const TOITS_MOTIF = {
  tuiles: { clair: '#B8613A', sombre: '#6E3B26' },
  briques: { clair: '#A04A3A', sombre: '#5C2B25' },
  ardoise: { clair: '#5F6B78', sombre: '#38424E' },
  terrasse: { clair: '#B7AB98', sombre: '#5E564B' },
};

// Palette selon le décor du niveau (jour, soir, nuit, pluie), le thème de l'app et le motif des toits.
function palette(dark, decor, motif) {
  const base = dark ? {
    ciel: '#13202F', fond: '#1D2C41', fondHaut: '#24364F', astre: '#E8D9A8',
    trottoir: '#4A525C', bordure: '#6B747F', toit: '#6E3B26', toitBord: '#2B2F35', fenetre: '#E2B84F',
    benne: '#246E46', benneCouvercle: '#1B5537', planche: '#9C7643', poteau: '#5E6872', rayure: '#E8E8E8',
    mur: '#3B342C', murToit: '#26211C', porte: '#8A5530', boite: '#3D7BEA', boiteVide: '#59626C',
  } : {
    ciel: '#D3EBFB', fond: '#AFC6DD', fondHaut: '#9DB6CF', astre: '#FFC93C',
    trottoir: '#97A1AB', bordure: '#C9D0D7', toit: '#B8613A', toitBord: '#4E535B', fenetre: '#F7DE97',
    benne: '#2F8F5B', benneCouvercle: '#226B44', planche: '#C79A5B', poteau: '#8C96A0', rayure: '#FFFFFF',
    mur: '#EADCC6', murToit: '#7A4B2A', porte: '#7A4B2A', boite: '#2D6CDF', boiteVide: '#9AA3AD',
  };
  const mo = TOITS_MOTIF[motif] || TOITS_MOTIF.tuiles;
  let p = { ...base, toit: dark ? mo.sombre : mo.clair };
  if (decor === 'soir') {
    p = dark
      ? { ...p, ciel: '#3A2340', fond: '#4A2D4E', fondHaut: '#5A3858', astre: '#FF8A4A', fenetre: '#FFC76B' }
      : { ...p, ciel: '#F4A66B', fond: '#B9726E', fondHaut: '#A15F63', astre: '#FF6B2C', fenetre: '#FFE0A0', trottoir: '#8C8590' };
  } else if (decor === 'nuit') {
    p = {
      ...p, ciel: '#0B1220', fond: '#16223A', fondHaut: '#1F2D4A', astre: '#EDEBD3', trottoir: '#3A414A', bordure: '#566069',
      toit: mo.sombre, toitBord: '#1E2228', fenetre: '#F2C75C', mur: '#2F2A24', murToit: '#1E1A16',
    };
  } else if (decor === 'pluie') {
    p = dark
      ? { ...p, ciel: '#1B252E', fond: '#26343F', fondHaut: '#2F4150', astre: '#9FB0BE', trottoir: '#434B54' }
      : { ...p, ciel: '#8E9EAB', fond: '#6F8190', fondHaut: '#61737F', astre: '#D7E0E6', trottoir: '#7F8A94', bordure: '#A7B1BA', fenetre: '#EBD58A' };
  }
  return p;
}

// Position d'un objet du monde dans le calque (bas gauche).
function pos(x, y, w, h, s) {
  return { position: 'absolute', left: x * s, bottom: (y + SOL_ECRAN) * s, width: w * s, height: h * s };
}

// ---- Décor fixe (recalculé seulement à chaque tranche) ----
const Decor = memo(function Decor({ plateformes, porte, x1, x2, s, pal, motif }) {
  const liste = visibles(plateformes, x1, x2);
  const porteVisible = porte.x + 80 >= x1 && porte.x - 50 <= x2;
  return (
    <>
      {liste.map((p) => (p.mobile || p.fragile ? null : <Plateforme key={p.id} p={p} s={s} pal={pal} motif={motif} />))}
      {porteVisible && <Maison porte={porte} s={s} pal={pal} />}
    </>
  );
});

// Plateformes qui bougent ou s'effondrent : redessinées à chaque image.
function Dynamique({ p, s, pal, motif, horloge }) {
  if (p.mobile) return <Plateforme p={p} s={s} pal={pal} motif={motif} />;
  if (p.effondre && p.chute > 420) return null;
  const secoue = p.tombe > 0 && !p.effondre ? Math.sin(horloge * 70) * 1.6 * s : 0;
  const chute = p.effondre ? p.chute * s : 0;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: p.effondre ? Math.max(0, 1 - p.chute / 300) : 1, transform: [{ translateX: secoue }, { translateY: chute }] }]}
    >
      <Plateforme p={p} s={s} pal={pal} motif={motif} />
    </View>
  );
}

function Plateforme({ p, s, pal, motif }) {
  if (p.mobile) {
    const vertical = p.mobile.axe === 'y';
    return (
      <View style={[pos(p.x, p.y - 9, p.w, 9, s), { backgroundColor: OR, borderRadius: 3 * s, borderWidth: 1, borderColor: pal.toitBord }, styles.centre]}>
        <MaterialCommunityIcons name={vertical ? 'arrow-up-down' : 'arrow-left-right'} size={9 * s} color={pal.toitBord} />
      </View>
    );
  }
  if (p.flottante) {
    if (p.type === 'auvent') {
      const n = Math.max(3, Math.round(p.w / 16));
      return (
        <View style={pos(p.x, p.y - 10, p.w, 10, s)}>
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', borderRadius: 2 * s, overflow: 'hidden' }]}>
            {Array.from({ length: n }).map((_, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? pal.rayure : BRAND }} />
            ))}
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, top: -2 * s, height: 2 * s, backgroundColor: pal.toitBord }} />
        </View>
      );
    }
    return (
      <>
        <View style={pos(p.x + 6, BAS_DESSIN, 3, p.y - 8 - BAS_DESSIN, s)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.poteau }]} />
        </View>
        <View style={pos(p.x + p.w - 9, BAS_DESSIN, 3, p.y - 8 - BAS_DESSIN, s)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.poteau }]} />
        </View>
        <View style={[pos(p.x, p.y - 8, p.w, 8, s), { backgroundColor: pal.planche, borderRadius: 2 * s }]} />
      </>
    );
  }
  if (p.type === 'benne') {
    const base = p.base != null ? Math.min(p.base, p.y) : p.y;
    return (
      <>
        <View style={[pos(p.x, BAS_DESSIN, p.w, base - BAS_DESSIN, s), { backgroundColor: base > 0 ? pal.toit : pal.trottoir }]} />
        <View style={[pos(p.x + 2, base, p.w - 4, p.y - base, s), { backgroundColor: pal.benne, borderTopLeftRadius: 3 * s, borderTopRightRadius: 3 * s }]}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5 * s, backgroundColor: pal.benneCouvercle }} />
        </View>
      </>
    );
  }
  const toit = p.type === 'toit';
  const fenetres = [];
  if (toit) {
    const nb = Math.max(1, Math.min(4, Math.floor((p.w - 16) / 36)));
    const pasX = p.w / nb;
    [22, 58].forEach((d, r) => {
      if (p.y - d - 16 < -20) return;
      for (let i = 0; i < nb; i += 1) {
        fenetres.push(
          <View
            key={`${r}_${i}`}
            style={{
              position: 'absolute', left: (pasX * i + pasX / 2 - 6) * s, top: d * s,
              width: 12 * s, height: 16 * s, borderRadius: 2 * s, backgroundColor: pal.fenetre,
            }}
          />,
        );
      }
    });
  }
  // Motif des toits : tuiles, briques, ardoise ou toit terrasse.
  const motifs = [];
  if (toit) {
    const lignes = motif === 'ardoise' ? 3 : 4;
    const ecartL = motif === 'ardoise' ? 16 : 11;
    for (let r = 0; r < lignes; r += 1) {
      motifs.push(
        <View
          key={`l${r}`}
          style={{ position: 'absolute', left: 0, right: 0, top: (9 + r * ecartL) * s, height: Math.max(1, s), backgroundColor: 'rgba(0,0,0,0.16)' }}
        />,
      );
      if (motif === 'briques' && !p.fragile) {
        const nbJ = Math.floor(p.w / 26);
        for (let i = 0; i < nbJ; i += 1) {
          motifs.push(
            <View
              key={`j${r}_${i}`}
              style={{ position: 'absolute', left: (i * 26 + (r % 2 ? 13 : 4)) * s, top: (9 + r * ecartL) * s, width: Math.max(1, s), height: ecartL * s, backgroundColor: 'rgba(0,0,0,0.12)' }}
            />,
          );
        }
      }
    }
    if (motif === 'terrasse') {
      motifs.push(<View key="parapet" style={{ position: 'absolute', left: 0, right: 0, top: 6 * s, height: 4 * s, backgroundColor: 'rgba(255,255,255,0.22)' }} />);
    }
  }
  const fissures = p.fragile ? (
    <>
      <View style={{ position: 'absolute', left: p.w * 0.3 * s, top: 8 * s, width: 2 * s, height: 26 * s, backgroundColor: 'rgba(0,0,0,0.55)', transform: [{ rotate: '18deg' }] }} />
      <View style={{ position: 'absolute', left: p.w * 0.62 * s, top: 14 * s, width: 2 * s, height: 22 * s, backgroundColor: 'rgba(0,0,0,0.55)', transform: [{ rotate: '-24deg' }] }} />
    </>
  ) : null;
  return (
    <View style={[pos(p.x, BAS_DESSIN, p.w, p.y - BAS_DESSIN, s), { backgroundColor: toit ? pal.toit : pal.trottoir }]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (toit ? 6 : 5) * s, backgroundColor: p.fragile ? '#C98A2B' : (toit ? pal.toitBord : pal.bordure) }} />
      {motifs}
      {fenetres}
      {fissures}
    </View>
  );
}

function Maison({ porte, s, pal }) {
  const { w, h } = TAILLES.porte;
  return (
    <>
      <View style={[pos(porte.x - 40, porte.y, w + 80, h + 40, s), { backgroundColor: pal.mur, borderTopLeftRadius: 4 * s, borderTopRightRadius: 4 * s }]}>
        <View style={{ position: 'absolute', left: -6 * s, right: -6 * s, top: -6 * s, height: 10 * s, borderRadius: 3 * s, backgroundColor: pal.murToit }} />
      </View>
      <View style={[pos(porte.x, porte.y, w, h, s), { backgroundColor: pal.porte, borderTopLeftRadius: 5 * s, borderTopRightRadius: 5 * s }]}>
        <View style={{ position: 'absolute', right: 5 * s, top: h * 0.5 * s, width: 5 * s, height: 5 * s, borderRadius: 3 * s, backgroundColor: OR }} />
      </View>
      <View style={[pos(porte.x + w / 2 - 12, porte.y + h + 8, 24, 24, s), styles.centre]}>
        <MaterialCommunityIcons name="home-variant" size={22 * s} color={BRAND} />
      </View>
    </>
  );
}

// ---- Fond : immeubles lointains, défilement plus lent ----
const Fond = memo(function Fond({ fond, x1, x2, s, pal }) {
  return visibles(fond, x1, x2).map((b) => (
    <View key={b.id} style={[pos(b.x, 0, b.w, b.h, s), { backgroundColor: pal.fond }]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6 * s, backgroundColor: pal.fondHaut }} />
    </View>
  ));
});

// ---- Éléments animés ----
function Livreur({ j, s, clignote }) {
  const marche = j.sol && Math.abs(j.vx) > 5 ? Math.sin(j.course * 0.28) * 2.2 : 0;
  const enAir = !j.sol;
  const u = (v) => v * s;
  return (
    <View style={[pos(j.x, j.y, LARGEUR, HAUTEUR, s), { opacity: clignote ? 0.3 : 1, transform: [{ scaleX: j.dir < 0 ? -1 : 1 }] }]}>
      {/* Jambes */}
      <View style={{ position: 'absolute', left: u(6 + marche), bottom: u(enAir ? 2 : 0), width: u(4), height: u(9), borderRadius: u(1.5), backgroundColor: '#1C2B3A' }} />
      <View style={{ position: 'absolute', left: u(11 - marche), bottom: 0, width: u(4), height: u(enAir ? 7 : 9), borderRadius: u(1.5), backgroundColor: '#24384D' }} />
      {/* Sac de livraison */}
      <View style={{ position: 'absolute', left: u(-3), bottom: u(10), width: u(10), height: u(13), borderRadius: u(2), backgroundColor: '#C8510B', borderWidth: u(1), borderColor: '#8F3A08' }} />
      {/* Veste */}
      <View style={{ position: 'absolute', left: u(5), bottom: u(8), width: u(12), height: u(13), borderRadius: u(3), backgroundColor: BRAND }} />
      {/* Bras */}
      <View style={{ position: 'absolute', left: u(13), bottom: u(enAir ? 15 : 11), width: u(5), height: u(4), borderRadius: u(2), backgroundColor: '#F0C38E' }} />
      {/* Tête et casquette */}
      <View style={{ position: 'absolute', left: u(6), bottom: u(20), width: u(10), height: u(10), borderRadius: u(5), backgroundColor: '#F0C38E' }} />
      <View style={{ position: 'absolute', left: u(5), bottom: u(26), width: u(11), height: u(4), borderTopLeftRadius: u(3), borderTopRightRadius: u(3), backgroundColor: '#1C2B3A' }} />
      <View style={{ position: 'absolute', left: u(14), bottom: u(26), width: u(5), height: u(1.6), borderRadius: u(1), backgroundColor: '#1C2B3A' }} />
    </View>
  );
}

const ICONES_GENEURS = {
  chien: { nom: 'dog-side', couleur: '#8B5A2B' },
  pigeon: { nom: 'bird', couleur: '#7D8A99' },
  trottinette: { nom: 'scooter', couleur: '#1E9E8C' },
};

function Geneur({ e, s, aboie }) {
  const ic = ICONES_GENEURS[e.type] || ICONES_GENEURS.chien;
  const taille = Math.max(e.w, e.h) * 1.3 * s;
  const ecarte = e.ecarte > 0;
  return (
    <View
      style={[
        pos(e.x, e.y, e.w, e.h, s),
        styles.centre,
        { opacity: ecarte ? Math.max(0, 1 - e.ecarte / 0.7) : 1, transform: [{ scaleX: e.dir > 0 ? -1 : 1 }, { rotate: ecarte ? '180deg' : '0deg' }] },
      ]}
    >
      <MaterialCommunityIcons name={ic.nom} size={taille} color={ic.couleur} style={{ marginBottom: e.type === 'pigeon' ? 0 : -taille * 0.12 }} />
      {aboie && !ecarte && (
        <View style={[styles.bulle, { top: -12 * s, width: 12 * s, height: 12 * s, borderRadius: 6 * s }]}>
          <MaterialCommunityIcons name="exclamation-thick" size={9 * s} color="#fff" />
        </View>
      )}
    </View>
  );
}

function Boite({ b, s, pal }) {
  const choc = b.choc > 0 ? 4 : 0;
  return (
    <View style={[pos(b.x, b.y + choc, b.w, b.h, s), styles.centre, { borderRadius: 4 * s, backgroundColor: b.frappee ? pal.boiteVide : pal.boite }]}>
      <MaterialCommunityIcons name={b.frappee ? 'mailbox-open-up' : 'mailbox'} size={16 * s} color="#fff" />
    </View>
  );
}

// ---- Écran ----
export default function JeuToitsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const sty = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('accueil'); // accueil | jeu | pause | livre | perdu
  const phaseRef = useRef('accueil');
  const [, setImage] = useState(0);
  const [meilleur, setMeilleur] = useState(0);
  const [nouveauRecord, setNouveauRecord] = useState(false);
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [dims, setDims] = useState({ l: 0, h: 0 });
  const dimsRef = useRef({ l: 0, h: 0 });

  const graineRef = useRef(Math.floor(Math.random() * 1e6));
  const mondeRef = useRef(null);
  if (!mondeRef.current) mondeRef.current = creerMonde(1, {}, graineRef.current + 1);
  const decorNiv = mondeRef.current.decor;
  const motifNiv = mondeRef.current.motif;
  const pal = useMemo(() => palette(dark, decorNiv, motifNiv), [dark, decorNiv, motifNiv]);
  const fondRef = useRef(null);
  if (!fondRef.current) fondRef.current = genererFond(1, mondeRef.current.longueur);
  const camRef = useRef({ x: -60, y: 0 });
  const cmdRef = useRef({ gauche: false, droite: false, sautTenu: false, sautAppui: false });
  const touchesRef = useRef({});
  const barreRef = useRef(null);
  const barreDim = useRef({ x: 0, y: -1, w: 1 });
  const rafRef = useRef(null);
  const dernierRef = useRef(null);
  const monteRef = useRef(true);

  const changerPhase = useCallback((p) => {
    phaseRef.current = p;
    if (monteRef.current) setPhase(p);
  }, []);

  useEffect(() => {
    monteRef.current = true;
    let vivant = true;
    chargerRecord(JEU, user?.id).then((r) => { if (vivant) setMeilleur(r.meilleur); });
    return () => {
      vivant = false;
      monteRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [user?.id]);

  const relacherTout = useCallback(() => {
    touchesRef.current = {};
    cmdRef.current = { gauche: false, droite: false, sautTenu: false, sautAppui: false };
  }, []);

  const echelle = useCallback(() => {
    const { l, h } = dimsRef.current;
    if (!l || !h) return null;
    const s = Math.min(l / LARGEUR_VUE, h / HAUTEUR_VUE_MIN);
    return { s, visW: l / s, visH: h / s };
  }, []);

  const cibleCamera = useCallback((m, e) => {
    const j = m.joueur;
    const xMax = m.longueur - e.visW;
    const x = Math.max(-240, Math.min(xMax, j.x - e.visW * 0.36));
    const y = Math.max(0, j.y + HAUTEUR + 55 - (e.visH - SOL_ECRAN));
    return { x, y };
  }, []);

  const placerCamera = useCallback(() => {
    const e = echelle();
    if (!e || !mondeRef.current) return;
    camRef.current = cibleCamera(mondeRef.current, e);
  }, [cibleCamera, echelle]);

  const finir = useCallback(() => {
    const m = mondeRef.current;
    changerPhase('perdu');
    setNouveauRecord(false);
    finDePartie(JEU, user?.id, m.score).then((r) => {
      if (!monteRef.current) return;
      setMeilleur(r.meilleur);
      setNouveauRecord(r.nouveauRecord);
    }).catch(() => {});
  }, [changerPhase, user?.id]);

  const boucleRef = useRef(null);
  boucleRef.current = (maintenant) => {
    rafRef.current = null;
    if (phaseRef.current !== 'jeu') return;
    const m = mondeRef.current;
    const dt = dernierRef.current == null ? 1 / 60 : Math.min(0.05, Math.max(0, (maintenant - dernierRef.current) / 1000));
    dernierRef.current = maintenant;
    const cmd = cmdRef.current;
    const evenements = pas(m, dt, cmd);
    cmd.sautAppui = false;
    for (let i = 0; i < evenements.length; i += 1) {
      const type = evenements[i].type;
      if (type === 'touche' || type === 'chute' || type === 'temps') vibrer('perte');
      else if (type === 'ecarte' || type === 'boite') vibrer('fort');
      else if (type === 'colis') vibrer('leger');
    }
    const e = echelle();
    if (e) {
      const c = cibleCamera(m, e);
      const k = 1 - Math.exp(-dt * 8);
      camRef.current = { x: camRef.current.x + (c.x - camRef.current.x) * k, y: camRef.current.y + (c.y - camRef.current.y) * k };
    }
    if (m.etat === 'livre') {
      vibrer('livre');
      relacherTout();
      changerPhase('livre');
    } else if (m.etat === 'perdu') {
      relacherTout();
      finir();
    }
    if (monteRef.current) setImage((i) => (i + 1) % 1000000);
    if (phaseRef.current === 'jeu') rafRef.current = requestAnimationFrame((ts) => boucleRef.current(ts));
  };

  // La boucle tourne seulement pendant le jeu.
  useEffect(() => {
    if (phase !== 'jeu') return undefined;
    dernierRef.current = null;
    rafRef.current = requestAnimationFrame((ts) => boucleRef.current(ts));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'jeu') return;
    relacherTout();
    changerPhase('pause');
  }, [changerPhase, relacherTout]);
  const { alerteCourse, fermerAlerte } = usePauseJeu(pause);

  const lancerNiveau = useCallback((niveau, report) => {
    mondeRef.current = creerMonde(niveau, report, graineRef.current + niveau);
    fondRef.current = genererFond(niveau, mondeRef.current.longueur);
    relacherTout();
    placerCamera();
    changerPhase('jeu');
  }, [changerPhase, placerCamera, relacherTout]);

  const nouvellePartie = useCallback(() => {
    graineRef.current = Math.floor(Math.random() * 1e6);
    setNouveauRecord(false);
    lancerNiveau(1, {});
  }, [lancerNiveau]);

  const niveauSuivant = useCallback(() => {
    const m = mondeRef.current;
    lancerNiveau(m.niveau + 1, { score: m.score, vies: m.vies });
  }, [lancerNiveau]);

  const reprendre = useCallback(() => {
    relacherTout();
    changerPhase('jeu');
  }, [changerPhase, relacherTout]);

  const quitter = useCallback(() => {
    pause();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [navigation, pause]);

  const voirCourse = useCallback(() => {
    fermerAlerte();
    pause();
    navigation.navigate('Accueil', { screen: 'OrdersMain' });
  }, [fermerAlerte, navigation, pause]);

  const avantClassement = useCallback(() => envoyerRecordEnAttente(JEU, user?.id), [user?.id]);

  const surMesurePiste = useCallback((ev) => {
    const l = Math.round(ev.nativeEvent.layout.width);
    const h = Math.round(ev.nativeEvent.layout.height);
    if (l !== dimsRef.current.l || h !== dimsRef.current.h) {
      dimsRef.current = { l, h };
      setDims({ l, h });
      placerCamera();
    }
  }, [placerCamera]);

  // ---- Commandes tactiles multi-doigts : une seule zone, 3 parties ----
  const mesurerBarre = useCallback(() => {
    barreRef.current?.measureInWindow?.((x, y, w) => {
      if (w > 0) barreDim.current = { x, y, w };
    });
  }, []);
  const zoneDe = useCallback((toucher) => {
    const d = barreDim.current;
    if (d.y >= 0 && toucher.pageY < d.y - 40) return null;
    const rx = (toucher.pageX - d.x) / d.w;
    if (rx < 0.25) return 'g';
    if (rx < 0.5) return 'd';
    return 's';
  }, []);
  const appliquerTouches = useCallback(() => {
    const zones = Object.values(touchesRef.current);
    const cmd = cmdRef.current;
    const saut = zones.includes('s');
    if (saut && !cmd.sautTenu) cmd.sautAppui = true;
    cmd.sautTenu = saut;
    cmd.gauche = zones.includes('g');
    cmd.droite = zones.includes('d');
  }, []);
  const toucherBouge = useCallback((ev) => {
    if (phaseRef.current !== 'jeu') return;
    const ne = ev.nativeEvent;
    const carte = touchesRef.current;
    const presents = new Set();
    const liste = ne.touches && ne.touches.length ? ne.touches : [ne];
    for (let i = 0; i < liste.length; i += 1) {
      const tc = liste[i];
      const id = String(tc.identifier);
      presents.add(id);
      const z = zoneDe(tc);
      if (z) carte[id] = z; else delete carte[id];
    }
    Object.keys(carte).forEach((k) => { if (!presents.has(k)) delete carte[k]; });
    appliquerTouches();
  }, [appliquerTouches, zoneDe]);
  const toucherFin = useCallback((ev) => {
    const ne = ev.nativeEvent;
    const finis = ne.changedTouches && ne.changedTouches.length ? ne.changedTouches : [ne];
    for (let i = 0; i < finis.length; i += 1) delete touchesRef.current[String(finis[i].identifier)];
    appliquerTouches();
  }, [appliquerTouches]);
  const toucherAnnule = useCallback(() => {
    touchesRef.current = {};
    appliquerTouches();
  }, [appliquerTouches]);

  // ---- Rendu ----
  const m = mondeRef.current;
  const e = dims.l && dims.h ? { s: Math.min(dims.l / LARGEUR_VUE, dims.h / HAUTEUR_VUE_MIN) } : null;
  let monde = null;
  if (e) {
    const { s } = e;
    const visW = dims.l / s;
    const cam = camRef.current;
    const tranche = Math.floor(cam.x / TRANCHE);
    const x1 = tranche * TRANCHE - 120;
    const x2 = tranche * TRANCHE + visW + TRANCHE + 120;
    const fx = cam.x * PARALLAXE;
    const ftranche = Math.floor(fx / TRANCHE);
    const vx1 = cam.x - 60;
    const vx2 = cam.x + visW + 60;
    const j = m.joueur;
    const clignote = m.invul > 0 && Math.floor(m.horloge * 12) % 2 === 0;
    monde = (
      <>
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -fx * s }, { translateY: cam.y * s * 0.3 }] }]} pointerEvents="none">
          <Fond fond={fondRef.current} x1={ftranche * TRANCHE - 120} x2={ftranche * TRANCHE + visW + TRANCHE + 120} s={s} pal={pal} />
        </View>
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -cam.x * s }, { translateY: cam.y * s }] }]} pointerEvents="none">
          <Decor plateformes={m.plateformes} porte={m.porte} x1={x1} x2={x2} s={s} pal={pal} motif={m.motif} />
          {visibles(m.plateformes, vx1, vx2).map((p) => (p.mobile || p.fragile
            ? <Dynamique key={`d${p.id}`} p={p} s={s} pal={pal} motif={m.motif} horloge={m.horloge} />
            : null))}
          {visibles(m.boites, vx1, vx2).map((b) => <Boite key={`b${b.id}`} b={b} s={s} pal={pal} />)}
          {visibles(m.colis, vx1, vx2).map((c) => (c.pris ? null : (
            <View key={`c${c.id}`} style={[pos(c.x, c.y + Math.sin(m.horloge * 3 + c.id) * 2, TAILLES.colis, TAILLES.colis, s), styles.centre]}>
              <MaterialCommunityIcons name="package-variant-closed" size={TAILLES.colis * 1.15 * s} color={BRAND} />
            </View>
          )))}
          {visibles(m.geneurs, vx1, vx2).map((g) => (g.actif ? (
            <Geneur
              key={`g${g.id}`}
              e={g}
              s={s}
              aboie={g.type === 'chien' && Math.abs(g.x - j.x) < 150 && Math.floor(g.temps * 2.5) % 3 === 0}
            />
          ) : null))}
          <Livreur j={j} s={s} clignote={clignote} />
          {m.popups.map((p) => (
            <Text
              key={p.id}
              style={[styles.popup, { left: p.x * s - 30, bottom: (p.y + SOL_ECRAN + p.age * 40) * s, opacity: Math.max(0, 1 - p.age / 0.9) }]}
            >
              {p.texte}
            </Text>
          ))}
        </View>
      </>
    );
  }

  const cmd = cmdRef.current;
  const enJeu = phase === 'jeu';
  const progression = avancee(m);
  const urgent = m.reste <= 10 && m.etat === 'jeu';

  return (
    <View style={[sty.ecran, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
      {/* Barre du haut : quitter, niveau, score, vies, pause */}
      <View style={sty.haut}>
        <Pressable onPress={quitter} style={sty.rond} hitSlop={10} accessibilityLabel={t('jeuQuitter')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={sty.infos}>
          <Text style={sty.niveau}>{t('jeuNiveau', { n: m.niveau })}</Text>
          <Text style={sty.score}>{t('jeuScore', { n: m.score })}</Text>
          <View style={sty.ligneTemps}>
            <Ionicons name="timer-outline" size={14} color={urgent ? colors.danger : colors.textMuted} />
            <Text style={[sty.chrono, urgent && { color: colors.danger }]}>{Math.max(0, Math.ceil(m.reste))}</Text>
            <Text style={sty.decorNom}>{t(CLE_DECOR[m.decor] || CLE_DECOR.jour)}</Text>
          </View>
        </View>
        <View style={sty.vies}>
          {Array.from({ length: VIES }).map((_, i) => (
            <Ionicons key={i} name={i < m.vies ? 'heart' : 'heart-outline'} size={18} color={colors.danger} />
          ))}
        </View>
        <Pressable
          onPress={pause}
          disabled={!enJeu}
          style={[sty.rond, sty.rondPause, !enJeu && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityLabel={t('jeuPause')}
        >
          <Ionicons name="pause" size={22} color="#fff" />
        </Pressable>
      </View>
      <View style={sty.jauge}>
        <View style={[sty.jaugePleine, { width: `${progression * 100}%` }]} />
      </View>

      {/* Ville */}
      <View style={[sty.piste, { backgroundColor: pal.ciel }]} onLayout={surMesurePiste}>
        <MaterialCommunityIcons
          name={ICONE_ASTRE[m.decor] || ICONE_ASTRE.jour}
          size={34}
          color={pal.astre}
          style={styles.astre}
        />
        {m.decor === 'nuit' && ETOILES.map((e2) => (
          <View key={e2.id} pointerEvents="none" style={[styles.etoile, { left: `${e2.x}%`, top: `${e2.y}%`, opacity: e2.o }]} />
        ))}
        {monde}
        {m.decor === 'pluie' && GOUTTES.map((g) => {
          const k = ((m.horloge * g.v + g.p) % 1);
          return (
            <View
              key={g.id}
              pointerEvents="none"
              style={[styles.goutte, { left: `${g.x}%`, top: `${-8 + k * 112}%`, opacity: 0.55 }]}
            />
          );
        })}
      </View>

      {/* Commandes : gauche, droite (moitié gauche), saut (moitié droite) */}
      <View
        ref={barreRef}
        style={sty.commandes}
        onLayout={mesurerBarre}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onTouchStart={toucherBouge}
        onTouchMove={toucherBouge}
        onTouchEnd={toucherFin}
        onTouchCancel={toucherAnnule}
      >
        <View style={sty.quart} pointerEvents="none">
          <View style={[sty.touche, cmd.gauche && sty.toucheActive]} accessibilityLabel={t('jeuxToitsGauche')}>
            <Ionicons name="chevron-back" size={34} color={cmd.gauche ? '#fff' : colors.text} />
          </View>
        </View>
        <View style={sty.quart} pointerEvents="none">
          <View style={[sty.touche, cmd.droite && sty.toucheActive]} accessibilityLabel={t('jeuxToitsDroite')}>
            <Ionicons name="chevron-forward" size={34} color={cmd.droite ? '#fff' : colors.text} />
          </View>
        </View>
        <View style={sty.moitie} pointerEvents="none">
          <View style={[sty.touche, sty.toucheSaut, cmd.sautTenu && sty.toucheSautActive]} accessibilityLabel={t('jeuxToitsSauter')}>
            <MaterialCommunityIcons name="arrow-up-bold" size={38} color="#fff" />
          </View>
        </View>
      </View>

      {/* Fenêtres : accueil, pause, colis livré, fin de partie */}
      {!enJeu && (
        <View style={sty.voile}>
          <View style={sty.carte}>
            {phase === 'accueil' && (
              <>
                <MaterialCommunityIcons name="home-roof" size={44} color={BRAND} />
                <Text style={sty.titre}>{t('jeuxToitsTitre')}</Text>
                <Text style={sty.texte}>{t('jeuxToitsRegle')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuxToitsAstuce')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuxToitsAstuceDur')}</Text>
                <Text style={sty.record}>{t('jeuMeilleurScore', { n: meilleur })}</Text>
                <Bouton sty={sty} texte={t('jeuJouer')} onPress={nouvellePartie} />
                <Bouton sty={sty} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'pause' && (
              <>
                <Ionicons name="pause-circle" size={44} color={BRAND} />
                <Text style={sty.titre}>{t('jeuEnPause')}</Text>
                <Text style={sty.texte}>{t('jeuScore', { n: m.score })}</Text>
                <Bouton sty={sty} texte={t('jeuReprendre')} onPress={reprendre} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'livre' && (
              <>
                <MaterialCommunityIcons name="package-variant-closed" size={46} color={BRAND} />
                <Text style={sty.titre}>{t('jeuxToitsLivre')}</Text>
                <Text style={sty.texteDiscret}>{t('jeuNiveauReussi', { n: m.niveau })}</Text>
                <View style={sty.lignes}>
                  <Text style={sty.texte}>{t('jeuxToitsColisNiveau', { n: m.colisNiveau })}</Text>
                  <Text style={sty.texte}>{t('jeuxToitsBonusLivraison', { n: POINTS.livraison })}</Text>
                  <Text style={sty.texte}>{t('jeuxToitsBonusTemps', { n: m.bonusTemps })}</Text>
                  <Text style={sty.scoreFort}>{t('jeuScore', { n: m.score })}</Text>
                </View>
                <Bouton sty={sty} texte={t('jeuNiveauSuivant')} onPress={niveauSuivant} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
            {phase === 'perdu' && (
              <>
                <Ionicons name="heart-dislike" size={44} color={colors.danger} />
                <Text style={sty.titre}>{t('jeuxToitsFin')}</Text>
                <Text style={sty.texte}>{t('jeuxToitsFinTexte', { n: m.niveau })}</Text>
                <Text style={sty.scoreFort}>{t('jeuScore', { n: m.score })}</Text>
                {nouveauRecord
                  ? <Text style={sty.nouveauRecord}>{t('jeuxToitsNouveauRecord')}</Text>
                  : <Text style={sty.record}>{t('jeuMeilleurScore', { n: meilleur })}</Text>}
                <Bouton sty={sty} texte={t('jeuxToitsRejouer')} onPress={nouvellePartie} />
                <Bouton sty={sty} secondaire texte={t('jeuClassement')} onPress={() => setClassementOuvert(true)} />
                <Bouton sty={sty} secondaire texte={t('jeuQuitter')} onPress={quitter} />
              </>
            )}
          </View>
        </View>
      )}
      {/* Classement : le jeu reste en pause derrière. */}
      {classementOuvert && !enJeu && (
        <View style={sty.voile}>
          <ClassementJeu
            jeu={JEU}
            t={t}
            colors={colors}
            dark={dark}
            avantChargement={avantClassement}
            onFermer={() => setClassementOuvert(false)}
          />
        </View>
      )}
      {alerteCourse && (
        <View style={sty.voile}>
          <View style={sty.carte}>
            <Ionicons name="bicycle" size={44} color={BRAND} />
            <Text style={sty.titre}>{t('jeuNouvelleCourse')}</Text>
            <Text style={sty.texte}>{t('jeuNouvelleCourseTexte')}</Text>
            <Bouton sty={sty} texte={t('jeuVoirCourse')} onPress={voirCourse} />
            <Bouton sty={sty} secondaire texte={t('jeuResterIci')} onPress={fermerAlerte} />
          </View>
        </View>
      )}
    </View>
  );
}

function Bouton({ texte, onPress, secondaire, sty }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [sty.bouton, secondaire && sty.boutonSecondaire, pressed && { opacity: 0.8 }]}
    >
      <Text style={[sty.boutonTexte, secondaire && sty.boutonTexteSecondaire]}>{texte}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  astre: { position: 'absolute', top: 14, right: 18 },
  etoile: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
  goutte: { position: 'absolute', width: 1.5, height: 14, backgroundColor: '#CFE3F2', transform: [{ rotate: '12deg' }] },
  bulle: { position: 'absolute', alignSelf: 'center', backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
  popup: { position: 'absolute', width: 60, textAlign: 'center', color: OR, fontSize: 15, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 },
});

const makeStyles = (c, dark) => StyleSheet.create({
  ecran: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rond: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rondPause: { backgroundColor: BRAND, borderColor: BRAND },
  infos: { flex: 1 },
  niveau: { color: c.text, fontSize: 17, fontWeight: '800' },
  score: { color: c.textMuted, fontSize: 14, fontWeight: '600', marginTop: 1 },
  vies: { flexDirection: 'row', gap: 2 },
  ligneTemps: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  chrono: { color: c.textMuted, fontSize: 13, fontWeight: '800', minWidth: 22 },
  decorNom: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  jauge: { height: 6, borderRadius: 3, backgroundColor: dark ? c.borderStrong : '#E6E8EB', marginTop: 12, overflow: 'hidden' },
  jaugePleine: { height: 6, borderRadius: 3, backgroundColor: BRAND },
  piste: { flex: 1, marginTop: 12, marginBottom: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  commandes: { flexDirection: 'row', height: 96, alignItems: 'stretch' },
  quart: { width: '25%', paddingRight: 8 },
  moitie: { width: '50%', paddingLeft: 16 },
  touche: {
    flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.borderStrong,
  },
  toucheActive: { backgroundColor: BRAND, borderColor: BRAND },
  toucheSaut: { backgroundColor: BRAND, borderColor: BRAND },
  toucheSautActive: { backgroundColor: '#D9560A', borderColor: '#D9560A', transform: [{ scale: 0.97 }] },
  voile: {
    ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 20, padding: 22, alignItems: 'center' },
  titre: { color: c.text, fontSize: 21, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  lignes: { marginTop: 4, alignItems: 'center' },
  scoreFort: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  record: { color: c.textMuted, fontSize: 14, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  nouveauRecord: { color: OR, fontSize: 17, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  bouton: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  boutonSecondaire: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong, marginTop: 10 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: c.text },
});
