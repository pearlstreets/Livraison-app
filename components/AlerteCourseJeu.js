import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OrderCard from './OrderCard';
import { deliveryService } from '../services/deliveryService';
import { adaptAssignment } from '../screens/OrdersScreen';
import { BRAND } from '../contexts/ThemeContext';

// Nouvelle course pendant un mini-jeu (demande du 10/11/2026) : la partie est
// en pause et la vraie fiche de la course s'affiche, comme sur la carte
// (OrderCard : gain, distance, retrait, zone de livraison). Accepter ou
// ouvrir passe par l'accueil (OrdersScreen), même parcours qu'une course
// reçue sur la carte. Refuser refuse vraiment l'offre. « Rester ici » garde
// la course sur la carte.
//
// alerte = { cle, course } (hooks/usePauseJeu.js). Course venue d'une push :
// seule la clé est connue, la fiche est relue sur le serveur.
function memeCourse(o, cle) {
  if (!cle) return false;
  return [o?._uid, o?.id, o?.order_id, o?.code].some((v) => v != null && String(v) === cle);
}

export default function AlerteCourseJeu({ alerte, t, navigation, onVoir, onRester }) {
  const insets = useSafeAreaInsets();
  const [course, setCourse] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setCourse(null);
    (async () => {
      try {
        const res = await deliveryService.getAvailableOrders();
        const liste = (Array.isArray(res?.data) ? res.data : [])
          .filter(Boolean)
          .map((a) => adaptAssignment(a, { revealCustomer: false }));
        const cle = alerte?.cle ? String(alerte.cle) : '';
        const trouvee = liste.find((o) => memeCourse(o, cle)) || (cle ? null : liste[0]) || null;
        if (!annule) setCourse(trouvee);
      } catch {
        // Réseau coupé : la fenêtre simple reste, avec « Voir la course ».
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, [alerte?.cle]);

  const vers = (params) => {
    onRester();
    navigation.navigate('Accueil', { screen: 'OrdersMain', params });
  };
  const refuser = async (o) => {
    onRester();
    try { if (o?.order_id) await deliveryService.declineDelivery(o.order_id); } catch { /* L'offre expire seule. */ }
  };

  return (
    <View style={[s.voile, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={s.contenu} bounces={false}>
        <View style={s.entete}>
          <Ionicons name="bicycle" size={30} color={BRAND} />
          <Text style={s.titre}>{t('jeuNouvelleCourse')}</Text>
        </View>
        <Text style={s.texte}>{t('jeuNouvelleCourseTexte')}</Text>
        {course ? (
          <OrderCard
            order={course}
            onAccept={(o) => vers({ accepterCourse: o })}
            onDecline={refuser}
            onOpen={(o) => vers({ ouvrirCourse: o })}
          />
        ) : chargement ? (
          <ActivityIndicator color={BRAND} style={s.attente} />
        ) : (
          <Pressable style={s.bouton} onPress={onVoir}>
            <Text style={s.boutonTexte}>{t('jeuVoirCourse')}</Text>
          </Pressable>
        )}
        <Pressable style={s.rester} onPress={onRester} hitSlop={8}>
          <Text style={s.resterTexte}>{t('jeuResterIci')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  voile: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 50, elevation: 50 },
  contenu: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 },
  titre: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  texte: { color: '#FFFFFF', fontSize: 14, textAlign: 'center', marginBottom: 12, opacity: 0.9 },
  attente: { marginVertical: 40 },
  bouton: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  rester: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24, marginTop: 4 },
  resterTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textDecorationLine: 'underline' },
});
