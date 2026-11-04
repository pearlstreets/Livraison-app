import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDayMonth, formatTime } from '../lib/i18nFormat';
import { dirIcon } from '../lib/rtl';
import { texteBlocage } from '../services/documentsSeuil';

// Bandeau de l'accueil : documents demandés par le serveur (rappel, en
// vérification, bloqué). Rien d'affiché pour tout autre état.
export default function BandeauDocumentsSeuil({ donnees, onPress, style }) {
  const { t } = useLanguage();
  const etat = donnees?.etat;
  if (etat !== 'rappel' && etat !== 'en_verification' && etat !== 'bloque') return null;

  let titre;
  let texte;
  let icone;
  let couleurs;
  if (etat === 'rappel') {
    titre = t('docsSeuilBandeauRappel');
    texte = t('docsSeuilBandeauRappelTexte');
    icone = 'document-text-outline';
    couleurs = COULEURS.orange;
  } else if (etat === 'en_verification') {
    titre = t('docsSeuilBandeauVerification');
    const jusqua = donnees.verification_jusquau;
    texte = jusqua && formatDayMonth(jusqua)
      ? t('docsSeuilBandeauVerificationJusqua', { date: formatDayMonth(jusqua), heure: formatTime(jusqua) })
      : t('docsSeuilBandeauVerificationTexte');
    icone = 'time-outline';
    couleurs = COULEURS.orange;
  } else {
    titre = t('docsSeuilBandeauBloque');
    texte = texteBlocage(t, donnees.motif_blocage);
    icone = 'lock-closed-outline';
    couleurs = COULEURS.rouge;
  }

  return (
    <Pressable style={[s.carte, couleurs.carte, style]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icone} size={22} color={couleurs.texte.color} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={[s.titre, couleurs.texte]}>{titre}</Text>
        <Text style={[s.texte, couleurs.texte]}>{texte}</Text>
      </View>
      <Ionicons name={dirIcon('chevron-forward')} size={18} color={couleurs.texte.color} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  carte: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
  titre: { fontSize: 15, fontWeight: '800' },
  texte: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});

const COULEURS = {
  orange: { carte: { backgroundColor: '#FFF1E8', borderColor: '#FFD9C2' }, texte: { color: '#C2410C' } },
  rouge: { carte: { backgroundColor: '#FDECEC', borderColor: '#F5C2C2' }, texte: { color: '#B42318' } },
};
