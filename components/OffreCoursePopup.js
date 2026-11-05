import React, { useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import OrderCard from './OrderCard';

// Fenêtre « Nouvelle course » façon Uber Eats (05/11/2026) : monte du bas
// par-dessus la carte à l'arrivée d'une course, avec une vibration. Reprend
// la carte de course (prix, compte à rebours, Accepter, Refuser, détail).
// La croix ferme la fenêtre sans refuser : la course reste sur la carte.
export default function OffreCoursePopup({ order, onAccept, onDecline, onOpen, onClose }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  useEffect(() => {
    if (order) Vibration.vibrate([0, 400, 200, 400]);
  }, [order]);

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.fond}>
        <View style={[s.feuille, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.entete}>
            <View style={s.titreWrap}>
              <View style={s.point} />
              <Text style={s.titre}>{t('newDeliveryOffer') || 'Nouvelle course'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={s.fermer}>
              <Ionicons name="close" size={22} color="#111" />
            </Pressable>
          </View>
          {order ? (
            <OrderCard
              order={order}
              onAccept={(o) => { onClose(); onAccept(o); }}
              onDecline={(o) => { onClose(); onDecline(o); }}
              onOpen={(o) => { onClose(); onOpen(o); }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  feuille: { backgroundColor: '#F2F2F2', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingHorizontal: 16 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  titreWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  point: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF6A13' },
  titre: { fontSize: 22, fontWeight: '900', color: '#111' },
  fermer: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
