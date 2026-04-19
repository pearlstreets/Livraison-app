import React, { createContext, useContext, useState, useCallback } from 'react';
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

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('fr');

  const t = useCallback((key) => {
    return translations[lang]?.[key] ?? translations.fr?.[key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { LANGUAGES };
