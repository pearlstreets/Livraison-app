import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import translations from './translations';

const LanguageContext = createContext();

const LANGUAGES = [
  { code: 'fr', native: 'Français', label: 'French', flag: '🇫🇷' },
  { code: 'en', native: 'English', label: 'English', flag: '🇺🇸' },
  { code: 'es', native: 'Español', label: 'Spanish', flag: '🇪🇸' },
  { code: 'zh', native: '中文', label: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', native: 'العربية', label: 'Arabic', flag: '🇸🇦' },
  { code: 'de', native: 'Deutsch', label: 'German', flag: '🇩🇪' },
  { code: 'nl', native: 'Nederlands', label: 'Dutch', flag: '🇳🇱' },
  { code: 'it', native: 'Italiano', label: 'Italian', flag: '🇮🇹' },
  { code: 'pt', native: 'Português', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ja', native: '日本語', label: 'Japanese', flag: '🇯🇵' },
  { code: 'th', native: 'ไทย', label: 'Thai', flag: '🇹🇭' },
  { code: 'sv', native: 'Svenska', label: 'Swedish', flag: '🇸🇪' },
  { code: 'ru', native: 'Русский', label: 'Russian', flag: '🇷🇺' },
];

const SUPPORTED = new Set(LANGUAGES.map(l => l.code));
const STORAGE_KEY = '@pearl_delivery/lang';
const DEFAULT_LANG = 'fr';

// Normalize any locale string to a supported code; returns null if unsupported.
// Handles: 'fr', 'fr-FR', 'fr_FR', 'zh-CN', 'zh-Hans', etc.
function normalizeLocale(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const base = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.has(base) ? base : null;
}

function detectDeviceLang() {
  try {
    // expo-localization returns an array of preferred locales, most-preferred first.
    const locales = Localization.getLocales?.() ?? [];
    for (const l of locales) {
      const code = normalizeLocale(l?.languageCode) || normalizeLocale(l?.languageTag);
      if (code) return code;
    }
    // Fallback for older SDK API
    const legacy = Localization.locale;
    const legacyCode = normalizeLocale(legacy);
    if (legacyCode) return legacyCode;
  } catch { /* ignore, fallback below */ }
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  // Load stored language on mount; fall back to device locale, then DEFAULT.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resolved = DEFAULT_LANG;
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const fromStore = normalizeLocale(stored);
        resolved = fromStore ?? detectDeviceLang();
      } catch {
        resolved = detectDeviceLang();
      }
      if (!cancelled) {
        setLangState(resolved);
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setLang = useCallback((code) => {
    const normalized = normalizeLocale(code);
    if (!normalized) return; // ignore unsupported codes silently
    setLangState(normalized);
    // Fire-and-forget persist; never let a storage failure crash the UI.
    AsyncStorage.setItem(STORAGE_KEY, normalized).catch(() => { /* ignore */ });
  }, []);

  const t = useCallback((key) => {
    if (key == null) return '';
    return translations[lang]?.[key] ?? translations[DEFAULT_LANG]?.[key] ?? String(key);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, LANGUAGES, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  // Defensive: if consumed outside provider (e.g., in a test renderer), return
  // a safe no-op shape so UI components don't crash.
  if (!ctx) {
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (key) => translations[DEFAULT_LANG]?.[key] ?? String(key ?? ''),
      LANGUAGES,
      ready: true,
    };
  }
  return ctx;
}

export { LANGUAGES };
