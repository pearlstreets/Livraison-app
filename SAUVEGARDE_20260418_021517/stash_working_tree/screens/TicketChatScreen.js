import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

const AUTO_REPLIES = [
  { delay: 1500, text: 'Bonjour ! Merci de nous contacter. Un agent va prendre en charge votre demande.' },
  { delay: 4000, text: 'Je consulte les détails de votre course. Un instant s\'il vous plaît...' },
  { delay: 8000, text: 'J\'ai bien retrouvé votre course. Comment puis-je vous aider exactement ?' },
];

function buildInitialMessages(orderId) {
  const now = new Date();
  return [
    { id: '0', type: 'system', text: `Ticket ouvert pour la commande ${orderId || 'N/A'}` },
    ...AUTO_REPLIES.map((reply, i) => ({
      id: `admin-${i}`,
      type: 'admin',
      text: reply.text,
      time: new Date(now.getTime() - (AUTO_REPLIES.length - i) * 60000).toISOString(),
    })),
  ];
}

export default function TicketChatScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { user, getTicketMessages, saveTicketMessages, markTicketRead, scheduleAdminReply, cancelAdminReply } = useAuth();
  const order = route.params?.order || {};
  const ticketId = order.id || 'unknown';
  const flatListRef = useRef();
  const [input, setInput] = useState('');

  // Load saved messages or create initial ones
  const saved = getTicketMessages(ticketId);
  const [messages, setMessages] = useState(saved || buildInitialMessages(ticketId));
  const autoIndex = useRef(0);

  // Check if ticket was already resolved (from TicketsList)
  const initialResolved = route.params?.resolved || false;
  const [isResolvedState, setIsResolvedState] = useState(initialResolved);

  // Save messages to AuthContext whenever they change
  useEffect(() => {
    saveTicketMessages(ticketId, messages);
    markTicketRead(ticketId);
  }, [messages]);

  // Mark as read on mount, schedule admin reply on unmount only if last msg is from user
  useEffect(() => {
    cancelAdminReply(ticketId);
    markTicketRead(ticketId);
    return () => {
      const lastMsg = messages[messages.length - 1];
      if (!isResolvedState && lastMsg?.type === 'user') {
        scheduleAdminReply(ticketId);
      }
    };
  }, [messages, isResolvedState]);

  function sendMessage() {
    const text = input.trim();
    if (!text || isResolvedState) return;
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      text,
      time: new Date().toISOString(),
    }]);
    setInput('');

    // Auto reply after user message
    setTimeout(() => {
      const replies = [
        'Merci pour cette information. Je note votre demande.',
        'Je comprends. Laissez-moi vérifier cela pour vous.',
        'Bien reçu. Notre équipe va traiter votre demande dans les plus brefs délais.',
        'D\'accord, je transmets cela à notre équipe technique.',
        'Merci de votre patience. Nous faisons le nécessaire.',
        'Je vais vérifier cela avec notre équipe et revenir vers vous.',
        'Votre demande est bien prise en compte. Merci.',
        'Nous analysons la situation. Un instant s\'il vous plaît.',
      ];
      const idx = autoIndex.current % replies.length;
      autoIndex.current++;

      setMessages(prev => [...prev, {
        id: `admin-reply-${Date.now()}`,
        type: 'admin',
        text: replies[idx],
        time: new Date().toISOString(),
      }]);
    }, 2000 + Math.random() * 2000);
  }

  function formatTime(date) {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const renderMessage = ({ item }) => {
    if (item.type === 'system') {
      const isResolvedMsg = item.id?.startsWith('system-resolved');
      return (
        <View style={[s.systemMsg, isResolvedMsg && { backgroundColor: BRAND + '20' }]}>
          <Text style={[s.systemText, isResolvedMsg && { color: BRAND }]}>{item.text}</Text>
        </View>
      );
    }
    const isUser = item.type === 'user';
    return (
      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAdmin]}>
        {!isUser && (
          <View style={s.adminAvatar}>
            <Ionicons name="headset" size={14} color="#fff" />
          </View>
        )}
        <View style={[s.bubbleContent, isUser ? s.bubbleContentUser : s.bubbleContentAdmin]}>
          {!isUser && <Text style={s.adminName}>Support Pearl</Text>}
          <Text style={[s.bubbleText, isUser && { color: '#fff' }]}>{item.text}</Text>
          <Text style={[s.bubbleTime, isUser && { color: 'rgba(255,255,255,0.6)' }]}>{formatTime(item.time)}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f5f5f5' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>{t('ticketSupport')}</Text>
          <Text style={s.headerSub}>{t('ticketTitle')} #{order.id || 'N/A'}</Text>
        </View>
        {isResolvedState ? (
          <>
            <Ionicons name="checkmark-circle" size={16} color="#7fff7f" style={{ marginRight: 4 }} />
            <Text style={s.onlineText}>{t('resolved')}</Text>
          </>
        ) : (
          <>
            <View style={s.onlineDot} />
            <Text style={s.onlineText}>{t('online')}</Text>
          </>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={s.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input or closed banner */}
      {isResolvedState ? (
        <View style={[s.closedBar, { paddingBottom: insets.bottom || 16 }]}>
          <Ionicons name="lock-closed" size={16} color="#999" style={{ marginRight: 8 }} />
          <Text style={s.closedText}>Ce ticket est fermé</Text>
        </View>
      ) : (
        <View style={[s.inputBar, { paddingBottom: insets.bottom || 16 }]}>
          <TextInput
            style={s.textInput}
            placeholder={t('writeYourMessage')}
            placeholderTextColor="#aaa"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <Pressable style={[s.sendBtn, !input.trim() && { opacity: 0.4 }]} onPress={sendMessage} disabled={!input.trim()}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: BRAND, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7fff7f', marginRight: 6 },
  onlineText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },

  messagesList: { padding: 16, paddingBottom: 16, flexGrow: 1, justifyContent: 'flex-end' },

  systemMsg: { alignSelf: 'center', backgroundColor: '#e0e0e0', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 12 },
  systemText: { fontSize: 12, color: '#666', fontWeight: '600' },

  bubble: { flexDirection: 'row', marginBottom: 10, maxWidth: '85%' },
  bubbleUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubbleAdmin: { alignSelf: 'flex-start', marginLeft: 4 },

  adminAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 4 },

  bubbleContent: { borderRadius: 16, padding: 12, maxWidth: '100%' },
  bubbleContentUser: { backgroundColor: BRAND, borderBottomRightRadius: 4 },
  bubbleContentAdmin: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },

  adminName: { fontSize: 11, fontWeight: '800', color: BRAND, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: '#111', lineHeight: 21 },
  bubbleTime: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'right' },

  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  textInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, marginRight: 8 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },

  closedBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingTop: 14, backgroundColor: '#f0f0f0', borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  closedText: { color: '#999', fontSize: 14, fontWeight: '700' },
});
