import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { LanguageProvider, useLanguage } from '../contexts/LanguageContext';

function LangConsumer() {
  const { lang, setLang, t, LANGUAGES } = useLanguage();
  return (
    <>
      <Text testID="lang">{lang}</Text>
      <Text testID="translated">{t('close')}</Text>
      <Text testID="missing">{t('nonexistent_key_xyz')}</Text>
      <Text testID="langCount">{LANGUAGES.length}</Text>
      <Pressable testID="switchEn" onPress={() => setLang('en')} />
      <Pressable testID="switchEs" onPress={() => setLang('es')} />
    </>
  );
}

function renderWithLang() {
  return render(
    <LanguageProvider>
      <LangConsumer />
    </LanguageProvider>
  );
}

describe('LanguageContext', () => {
  it('defaults to French', () => {
    const { getByTestId } = renderWithLang();
    expect(getByTestId('lang').props.children).toBe('fr');
  });

  it('translates keys in French', () => {
    const { getByTestId } = renderWithLang();
    expect(getByTestId('translated').props.children).toBe('Fermer');
  });

  it('returns key name for missing translations', () => {
    const { getByTestId } = renderWithLang();
    expect(getByTestId('missing').props.children).toBe('nonexistent_key_xyz');
  });

  it('has 13 languages', () => {
    const { getByTestId } = renderWithLang();
    expect(getByTestId('langCount').props.children).toBe(13);
  });

  it('switches to English', () => {
    const { getByTestId } = renderWithLang();
    fireEvent.press(getByTestId('switchEn'));
    expect(getByTestId('lang').props.children).toBe('en');
    expect(getByTestId('translated').props.children).toBe('Close');
  });

  it('switches to Spanish', () => {
    const { getByTestId } = renderWithLang();
    fireEvent.press(getByTestId('switchEs'));
    expect(getByTestId('lang').props.children).toBe('es');
    expect(getByTestId('translated').props.children).toBe('Cerrar');
  });
});
