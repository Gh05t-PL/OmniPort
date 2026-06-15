import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';
import {
  DEFAULT_LANGUAGE,
  getLanguageMeta,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  LANGUAGES,
  translations
} from './translations.js';

const I18nContext = createContext(null);

const readInitialLanguage = () => {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  const storedLanguage = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(storedLanguage)) return storedLanguage;
  const browserLanguage = String(window.navigator?.language || '').slice(0, 2);
  return isSupportedLanguage(browserLanguage) ? browserLanguage : DEFAULT_LANGUAGE;
};

const interpolate = (value, params = {}) => (
  String(value).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : match
  ))
);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(readInitialLanguage);

  const setLanguage = useCallback((nextLanguage) => {
    if (!isSupportedLanguage(nextLanguage)) return;
    setLanguageState(nextLanguage);
    window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }, []);

  const t = useCallback((key, params) => {
    const dictionary = translations[language] || translations[DEFAULT_LANGUAGE];
    const fallbackDictionary = translations[DEFAULT_LANGUAGE];
    return interpolate(dictionary[key] || fallbackDictionary[key] || key, params);
  }, [language]);

  const value = useMemo(() => ({
    language,
    languageMeta: getLanguageMeta(language),
    languages: LANGUAGES,
    setLanguage,
    t
  }), [language, setLanguage, t]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export const useTranslation = () => {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useTranslation must be used inside I18nProvider');
  }
  return value;
};
