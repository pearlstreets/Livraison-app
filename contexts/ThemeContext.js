// Mode clair / sombre de l'application livreur (05/11/2026).
// Par défaut AUTOMATIQUE : l'app suit le réglage du téléphone, sombre si le
// téléphone est en sombre, claire s'il est en clair (06/11/2026). Le livreur
// peut forcer Clair ou Sombre dans son profil (choix gardé sur l'appareil) ;
// le choix est aussi appliqué à iOS / Android (cartes, clavier, fenêtres).
// Le réglage du téléphone n'est lisible qu'à partir du binaire 1.0.8
// (`userInterfaceStyle: automatic`) : avant, Automatique garde l'ancienne
// règle (sombre la nuit, 19h-7h).
// Les écrans lisent `colors` via useTheme() au lieu de couleurs en dur.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'pearl.delivery.theme';

export const BRAND = '#FF6A13';

const CLAIR = {
  dark: false,
  brand: BRAND,
  bg: '#f5f5f5',          // fond d'écran
  card: '#ffffff',        // cartes, lignes, feuilles
  cardAlt: '#FFF1E8',     // pastille orange pâle (icônes)
  text: '#111111',        // texte principal
  textSoft: '#444444',    // texte secondaire foncé
  textMuted: '#6B7280',   // texte discret
  textFaint: '#999999',   // libellés très discrets
  border: '#eeeeee',      // séparateurs
  borderStrong: '#e0e0e0',
  input: '#ffffff',       // cases de saisie : fond BLANC en clair
  inputBorder: '#d6d6d6',
  overlay: 'rgba(0,0,0,0.45)',
  chevron: '#cccccc',
  danger: '#e74c3c',
  success: '#2ecc71',
};

const SOMBRE = {
  dark: true,
  brand: BRAND,
  bg: '#0f0f10',
  card: '#1c1c1e',
  cardAlt: '#3a2416',
  text: '#f2f2f2',
  textSoft: '#d0d0d0',
  textMuted: '#a1a1aa',
  textFaint: '#7c7c84',
  border: '#2c2c2e',
  borderStrong: '#3a3a3c',
  input: '#2c2c2e',
  inputBorder: '#48484a',
  overlay: 'rgba(0,0,0,0.65)',
  chevron: '#5a5a5e',
  danger: '#ff6b5e',
  success: '#34d27b',
};

const MODES = ['auto', 'light', 'dark'];

// Binaire capable de lire le réglage du téléphone (1.0.8 et suivants).
function lisLeTelephone() {
  // runtimeVersion = version du binaire (politique appVersion), présent sur tous les binaires.
  const v = String(Updates.runtimeVersion || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const [a = 0, b = 0, c = 0] = v;
  return a > 1 || (a === 1 && (b > 0 || c >= 8));
}
const SUIT_LE_TELEPHONE = lisLeTelephone();

function estLaNuit(d = new Date()) {
  const h = d.getHours();
  return h >= 19 || h < 7;
}

const ThemeContext = createContext({ dark: false, mode: 'auto', colors: CLAIR, cycleMode: () => {}, setMode: () => {} });

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('auto');
  const [systeme, setSysteme] = useState(Appearance.getColorScheme?.() || 'light');
  const [nuit, setNuit] = useState(estLaNuit());

  useEffect(() => {
    AsyncStorage.getItem(CLE).then((v) => { if (MODES.includes(v)) setModeState(v); }).catch(() => {});
    const sub = Appearance.addChangeListener?.(({ colorScheme }) => setSysteme(colorScheme || 'light'));
    // Passage jour / nuit relu chaque minute.
    const id = setInterval(() => setNuit(estLaNuit()), 60000);
    return () => { sub?.remove?.(); clearInterval(id); };
  }, []);

  const setMode = useCallback((m) => {
    if (!MODES.includes(m)) return;
    setModeState(m);
    AsyncStorage.setItem(CLE, m).catch(() => {});
  }, []);

  // Le choix du profil s'applique aussi aux éléments d'iOS / Android.
  useEffect(() => {
    try { Appearance.setColorScheme?.(mode === 'auto' ? 'unspecified' : mode); } catch (_) {}
  }, [mode]);

  const cycleMode = useCallback(() => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]), [mode, setMode]);

  const dark = mode === 'dark' || (mode === 'auto' && (systeme === 'dark' || (!SUIT_LE_TELEPHONE && nuit)));
  const value = useMemo(() => ({ dark, mode, colors: dark ? SOMBRE : CLAIR, cycleMode, setMode }), [dark, mode, cycleMode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
