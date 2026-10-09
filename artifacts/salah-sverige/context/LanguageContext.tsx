import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { intlLocales, Language, languages, Strings, translations } from '@/lib/i18n';

const LANGUAGE_KEY = 'prayer-sverige:language:v1';

type LanguageContextValue = {
  language: Language;
  locale: string;
  isRTL: boolean;
  t: Strings;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('sv');
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((stored) => {
        if (stored && (languages as string[]).includes(stored)) setLanguageState(stored as Language);
      })
      .catch(() => undefined);
  }, []);
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    void AsyncStorage.setItem(LANGUAGE_KEY, next).catch(() => undefined);
  }, []);
  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: intlLocales[language],
    isRTL: language === 'ar',
    t: translations[language],
    setLanguage,
  }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
