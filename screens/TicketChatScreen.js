import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { ticketService } from '../services/ticketService';

const BRAND = '#00C29B';

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function mapMessage(msg) {
  // sender_type: 'user' = livreur, 'admin'/'system' = support
  const type = msg.sender_type === 'user' ? 'user' : msg.sender_type === 'system' ? 'system' : 'admin';
  return {
    id: String(msg.id),
    type,
    text: msg.text || '',
    time: msg.created_at || null,
  };
}

export default function TicketChatScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const ticketId = route.params?.ticketId || route.params?.order?.id || null;
  const flatListRef = useRef();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const initialResolved = route.params?.resolved || false;
  const [isResolvedState, setIsResolvedState] = useState(initialResolved);

  const loadMessages = useCallback(async () => {
    if (!ticketId) {
      setLoading(false);
      return;
    }
    try {
      const res = await ticketService.getTicketDetail(ticketId);
      const ticket = res?.data?.ticket || res?.ticket || {};
      const rawMsgs = res?.data?.messages || res?.messages || [];
      const mapped = Array.isArray(rawMsgs) ? rawMsgs.map(mapMessage) : [];

      // Derive resolved state from ticket status
      const status = ticket.status || '';
      if (status === 'resolved' || status === 'closed') {
        setIsResolvedState(true);
      }

      // Prepend system header if no system message present
      if (mapped.length === 0 || mapped[0].type !== 'system') {
        const orderId = ticket.assignment_id ? `ORD-${ticket.assignment_id}` : `TK-${ticketId}`;
        mapped.unshift({ id: 'system-header', type: 'system', text: `Ticket ouvert pour la commande ${orderId}`, time: null });
      }
      setMessages(mapped);
    } catch {
      setMessages([{ id: 'system-error', type: 'system', text: 'Impossible de charger les messages', time: null }]);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isResolvedState || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await ticketService.sendMessage(ticketId, text);
      const newMsg = res?.data || res;
      if (newMsg && newMsg.id) {
        setMessages(prev => [...prev, mapMessage(newMsg)]);
      } else {
        // Optimistic fallback
        setMessages(prev => [...prev, {
          id: `user-${Date.now()}`,
          type: 'user',
          text,
          time: new Date().toISOString(),
        }]);
      }
    } catch {
      // Restore input on error
      setInput(text);
    } finally {
      setSending(false);
    }
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
          <Text style={s.headerSub}>{t('ticketTitle')} #{ticketId || 'N/A'}</Text>
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
      {loading ? (
        <ActivityIndicator size="small" color={BRAND} style={{ flex: 1, alignSelf: 'center' }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={s.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

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
            editable={!sending}
          />
          <Pressable style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]} onPress={sendMessage} disabled={!input.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
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
