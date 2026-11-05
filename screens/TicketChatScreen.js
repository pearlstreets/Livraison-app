import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { ticketService } from '../services/ticketService';
import { formatTime as formatClock } from '../lib/i18nFormat';

const BRAND = '#FF6A13';
// Relecture du fil tant que le ticket est ouvert : la réponse du support
// apparaît sans quitter l'écran.
const RELECTURE_MS = 20000;

// Codes des messages système écrits par le serveur (traduits ici). Les
// anciens messages en anglais en dur sont reconnus aussi.
const CODES_SYSTEME = {
  ticket_resolved: 'ticketSystemResolved',
  ticket_closed: 'ticketSystemClosed',
};
const ANCIEN_TEXTE_SYSTEME = /^Ticket has been (resolved|closed) by admin\.?$/i;

function formatTime(dateStr) {
  return formatClock(dateStr);
}

function cleSysteme(text) {
  const brut = String(text || '').trim();
  if (CODES_SYSTEME[brut]) return CODES_SYSTEME[brut];
  const ancien = brut.match(ANCIEN_TEXTE_SYSTEME);
  return ancien ? CODES_SYSTEME[`ticket_${ancien[1].toLowerCase()}`] : null;
}

function mapMessage(msg, t) {
  // sender_type: 'user' = livreur, 'admin'/'system' = support
  const type = msg.sender_type === 'user' ? 'user' : msg.sender_type === 'system' ? 'system' : 'admin';
  const cle = type === 'system' ? cleSysteme(msg.text) : null;
  return {
    id: String(msg.id),
    type,
    text: cle ? t(cle) : (msg.text || ''),
    resolvedMark: Boolean(cle),
    time: msg.created_at || null,
  };
}

export default function TicketChatScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  // Identifiant NUMÉRIQUE du ticket seulement (jamais l'id d'une commande,
  // du type « ORD-123 », que le serveur ne connaît pas).
  const idBrut = Number(route.params?.ticketId);
  const ticketId = Number.isInteger(idBrut) && idBrut > 0 ? idBrut : null;
  const flatListRef = useRef();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const initialResolved = route.params?.resolved || false;
  const [isResolvedState, setIsResolvedState] = useState(initialResolved);

  const loadMessages = useCallback(async () => {
    if (!ticketId) {
      // Ticket introuvable : message clair, envoi désactivé (voir plus bas).
      setMessages([{ id: 'system-error', type: 'system', text: t('ticketMissing'), time: null }]);
      setLoading(false);
      return;
    }
    try {
      const res = await ticketService.getTicketDetail(ticketId);
      const ticket = res?.data?.ticket || res?.ticket || {};
      const rawMsgs = res?.data?.messages || res?.messages || [];
      const mapped = Array.isArray(rawMsgs) ? rawMsgs.map((m) => mapMessage(m, t)) : [];

      // Derive resolved state from ticket status
      const status = ticket.status || '';
      if (status === 'resolved' || status === 'closed') {
        setIsResolvedState(true);
      }

      // Prepend system header if no system message present
      if (mapped.length === 0 || mapped[0].type !== 'system') {
        const orderId = ticket.order_id
          ? `#${ticket.order_id}`
          : ticket.assignment_id ? `#${ticket.assignment_id}` : `TK-${ticketId}`;
        mapped.unshift({ id: 'system-header', type: 'system', text: t('ticketOpenedFor', { id: orderId }), time: null });
      }
      setMessages(mapped);
    } catch {
      // Relecture en échec : on garde le fil déjà affiché.
      setMessages((prev) => (prev.length && prev[0].id !== 'system-error'
        ? prev
        : [{ id: 'system-error', type: 'system', text: t('messagesLoadError'), time: null }]));
    } finally {
      setLoading(false);
    }
  }, [ticketId, t]);

  // Rechargement à chaque retour sur l'écran (tap sur une notification,
  // retour depuis un autre écran), puis relecture régulière tant que le
  // ticket est ouvert et l'écran affiché.
  useFocusEffect(useCallback(() => {
    loadMessages();
    if (isResolvedState) return undefined;
    const minuteur = setInterval(loadMessages, RELECTURE_MS);
    return () => clearInterval(minuteur);
  }, [loadMessages, isResolvedState]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMessages();
    } finally {
      setRefreshing(false);
    }
  }, [loadMessages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isResolvedState || sending || !ticketId) return;
    setSending(true);
    setInput('');
    try {
      const res = await ticketService.sendMessage(ticketId, text);
      const newMsg = res?.data || res;
      if (newMsg && newMsg.id) {
        setMessages(prev => [...prev, mapMessage(newMsg, t)]);
      } else {
        // Optimistic fallback
        setMessages(prev => [...prev, {
          id: `user-${Date.now()}`,
          type: 'user',
          text,
          time: new Date().toISOString(),
        }]);
      }
    } catch (e) {
      if (e?.status === 400) {
        // Le support a clôturé le ticket entre-temps : lecture seule.
        setIsResolvedState(true);
        Alert.alert(t('ticketClosed'), t('ticketNowClosed'));
        loadMessages();
      } else {
        // Restore input on error
        setInput(text);
        Alert.alert(t('error'), t('ticketSendError'));
      }
    } finally {
      setSending(false);
    }
  }

  const renderMessage = ({ item }) => {
    if (item.type === 'system') {
      const isResolvedMsg = item.resolvedMark;
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
          <Ionicons name={dirIcon('arrow-back')} size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>{t('ticketSupport')}</Text>
          {ticketId ? <Text style={s.headerSub}>{t('ticketTitle')} #{ticketId}</Text> : null}
        </View>
        {isResolvedState ? (
          <>
            <Ionicons name="checkmark-circle" size={16} color="#7fff7f" style={{ marginRight: 4 }} />
            <Text style={s.statusText}>{t('resolved')}</Text>
          </>
        ) : null}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} colors={[BRAND]} />}
        />
      )}

      {/* Input or closed banner */}
      {isResolvedState || !ticketId ? (
        <View style={[s.closedBar, { paddingBottom: insets.bottom || 16 }]}>
          <Ionicons name="lock-closed" size={16} color="#999" style={{ marginRight: 8 }} />
          <Text style={s.closedText}>{ticketId ? t('ticketClosed') : t('ticketMissing')}</Text>
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
  statusText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },

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
