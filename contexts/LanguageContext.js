import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { I18nManager, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import translations from './translations';
import { setFormatLanguage } from '../lib/i18nFormat';

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

// Langue choisie : conservée d'un lancement à l'autre (elle repartait en
// français à chaque redémarrage).
const STORAGE_KEY = 'DRIVER_LANG';
// Garde-fou du rechargement RTL : une seule tentative par langue, pour ne
// jamais boucler si le natif refuse le changement de sens.
const RTL_RELOAD_KEY = 'DRIVER_LANG_RTL_RELOAD';
const RTL_LANGS = new Set(['ar']);

function reloadApp() {
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  Updates.reloadAsync().catch(() => {
    // Sans rechargement possible, le sens s'appliquera au prochain lancement.
  });
}

// Le sens de lecture (droite à gauche pour l'arabe) ne s'applique qu'au
// redémarrage du moteur JavaScript : on le pose puis on recharge une fois.
async function syncDirection(code) {
  const wantRTL = RTL_LANGS.has(code);
  if (I18nManager.isRTL === wantRTL) {
    AsyncStorage.removeItem(RTL_RELOAD_KEY).catch(() => {});
    return;
  }
  I18nManager.allowRTL(wantRTL);
  I18nManager.forceRTL(wantRTL);
  const lastAttempt = await AsyncStorage.getItem(RTL_RELOAD_KEY).catch(() => null);
  if (lastAttempt === code) return;
  await AsyncStorage.setItem(RTL_RELOAD_KEY, code).catch(() => {});
  reloadApp();
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('fr');
  const [ready, setReady] = useState(false);

  // Avant le rendu des enfants : les formats (montants, dates) suivent la langue.
  setFormatLanguage(lang);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!alive) return;
        const code = saved && translations[saved] ? saved : 'fr';
        setLangState(code);
        syncDirection(code);
      })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const setLang = useCallback(async (code) => {
    if (!translations[code]) return;
    setLangState(code);
    // Écrit AVANT un éventuel rechargement RTL, sinon la langue serait perdue.
    await AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
    syncDirection(code);
  }, []);

  // t('cle') ou t('cle', { n: 3 }) : remplace {n} dans le texte traduit.
  const t = useCallback((key, vars) => {
    const raw = translations[lang]?.[key] ?? translations.fr?.[key] ?? key;
    if (!vars || typeof raw !== 'string') return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name) => (vars[name] != null ? String(vars[name]) : match));
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, LANGUAGES, isRTL: I18nManager.isRTL }),
    [lang, setLang, t],
  );

  if (!ready) return null;

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { LANGUAGES };
