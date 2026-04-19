import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#00C29B';

const FAQ = {
  'Problème pendant une course': [
    { q: 'Le client ne répond pas', a: 'Attendez 5 minutes puis contactez le support. Si le client ne se manifeste pas, vous pouvez marquer la livraison comme non livrée.' },
    { q: 'Adresse incorrecte', a: 'Contactez le client via l\'application. Si impossible, signalez le problème au support pour obtenir une compensation.' },
    { q: 'Accident pendant une course', a: 'Mettez-vous en sécurité d\'abord. Contactez les urgences si nécessaire, puis signalez l\'incident via l\'application.' },
    { q: 'Commande endommagée', a: 'Prenez une photo de la commande endommagée et signalez-le dans l\'application. Le client sera remboursé et vous ne serez pas pénalisé.' },
  ],
  'Paiements et revenus': [
    { q: 'Quand suis-je payé ?', a: 'Les versements sont effectués chaque semaine, généralement le lundi. Vous pouvez aussi utiliser l\'encaissement instantané moyennant des frais de 0.50€.' },
    { q: 'Comment fonctionne l\'encaissement instantané ?', a: 'L\'encaissement instantané transfère votre solde actuel sur votre compte bancaire en moins de 30 minutes, avec des frais de 0.50€.' },
    { q: 'Où trouver mes factures ?', a: 'Vos factures sont disponibles dans la section Documents de votre profil. Elles sont générées automatiquement chaque mois.' },
    { q: 'Erreur dans mon paiement', a: 'Vérifiez le détail de vos versements dans Wallet > Activité de versements. Si une erreur persiste, contactez le support.' },
  ],
  'Mon compte': [
    { q: 'Comment changer mon email ?', a: 'Allez dans Menu > Compte > Modifier le profil. Appuyez sur l\'icône crayon à côté de l\'email pour le modifier.' },
    { q: 'Comment changer mon mot de passe ?', a: 'Allez dans Menu > Compte > Modifier le profil. Appuyez sur "Changer le mot de passe" en bas de la page.' },
    { q: 'Comment supprimer mon compte ?', a: 'Contactez le support par email à support@pearlstreets.com. La suppression est traitée sous 48h.' },
  ],
  'Documents': [
    { q: 'Quels documents sont nécessaires ?', a: 'Pièce d\'identité, permis de conduire, assurance RC Pro, justificatif de domicile, attestation URSSAF et extrait Kbis/SIRENE.' },
    { q: 'Mon document est refusé', a: 'Vérifiez que le document est lisible, non expiré et correspond à vos informations. Soumettez-le à nouveau ou contactez le support.' },
    { q: 'Comment renouveler un document expiré ?', a: 'Allez dans Menu > Documents, sélectionnez le document concerné et uploadez la nouvelle version.' },
  ],
  'Véhicule': [
    { q: 'Comment changer de véhicule ?', a: 'Allez dans Menu > Véhicule puis "Modifier le véhicule". Vous devrez fournir les documents du nouveau véhicule.' },
    { q: 'Puis-je utiliser plusieurs véhicules ?', a: 'Non, un seul véhicule peut être actif à la fois. Vous pouvez changer de véhicule à tout moment.' },
  ],
  'Sécurité': [
    { q: 'Signaler un problème de sécurité', a: 'En cas d\'urgence, appelez le 112. Pour un signalement non urgent, contactez le support avec tous les détails.' },
    { q: 'Assurance pendant les courses', a: 'Vous êtes couvert par votre assurance RC Pro pendant vos courses. Vérifiez que votre attestation est à jour dans la section Documents.' },
  ],
};

export default function HelpDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const topic = route.params?.topic || '';
  const questions = FAQ[topic] || [];

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{topic}</Text>
          <View style={{ width: 24 }} />
        </View>

        {questions.map((item, i) => (
          <View key={i} style={s.faqCard}>
            <Text style={s.question}>{item.q}</Text>
            <Text style={s.answer}>{item.a}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[s.contactWrap, { paddingBottom: insets.bottom || 16 }]}>
        <Pressable style={s.contactBtn} onPress={() => navigation.navigate('ContactSupport', { subject: topic })}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.contactTxt}>Contacter le support</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111', flex: 1, textAlign: 'center' },
  faqCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 10 },
  question: { fontWeight: '800', fontSize: 15, color: '#111', marginBottom: 8 },
  answer: { fontSize: 14, color: '#555', lineHeight: 21 },
  contactWrap: { backgroundColor: '#f5f5f5', paddingHorizontal: 16, paddingTop: 10 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16 },
  contactTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
