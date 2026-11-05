import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OrderCard from './OrderCard';

// Fenêtre « Nouvelle course » façon Uber Eats (05/11/2026) : la carte de
// course monte du bas et se pose sur la carte, au même style que les courses
// affichées sur la carte, avec une vibration et un son. Toucher la carte
// autour ferme la fenêtre sans refuser : la course reste sur la carte.
export default function OffreCoursePopup({ order, onAccept, onDecline, onOpen, onClose }) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!order) return;
    Vibration.vibrate([0, 400, 200, 400]);
    // Son de la notification locale : le gestionnaire d'App.js le joue sans
    // afficher de bannière (sonSeul), la fenêtre étant déjà à l'écran.
    Notifications.scheduleNotificationAsync({
      content: { title: '', body: '', sound: 'default', data: { status: 'available', sonSeul: true } },
      trigger: null,
    }).catch(() => {});
  }, [order]);

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[s.fond, { paddingBottom: insets.bottom + 84 }]} onPress={onClose}>
        <Pressable onPress={() => {}}>
          {order ? (
            <OrderCard
              order={order}
              onAccept={(o) => { onClose(); onAccept(o); }}
              onDecline={(o) => { onClose(); onDecline(o); }}
              onOpen={(o) => { onClose(); onOpen(o); }}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16 },
});
