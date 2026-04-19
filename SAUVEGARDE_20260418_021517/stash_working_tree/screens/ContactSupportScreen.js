import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

export default function ContactSupportScreen({ navigation, route }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const subject = route.params?.subject || '';
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!message.trim()) {
      Alert.alert(t('error'), t('writeMessage'));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <View style={s.sentIconWrap}>
          <Ionicons name="checkmark-circle" size={64} color={BRAND} />
        </View>
        <Text style={s.sentTitle}>{t('messageSent')}</Text>
        <Text style={s.sentDesc}>{t('messageSentSub')}</Text>
        <Pressable style={s.sentBtn} onPress={() => navigation.goBack()}>
          <Text style={s.sentBtnTxt}>{t('back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[s.headerRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>
          <Text style={s.headerTitle}>{t('contactTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={s.infoCard}>
          <Ionicons name="mail-outline" size={22} color={BRAND} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.infoLabel}>{t('replyEmail')}</Text>
            <Text style={s.infoValue}>{user?.email}</Text>
          </View>
        </View>

        {subject ? (
          <View style={s.subjectCard}>
            <Text style={s.subjectLabel}>{t('subject')}</Text>
            <Text style={s.subjectValue}>{subject}</Text>
          </View>
        ) : null}

        <Text style={s.fieldLabel}>{t('yourMessage')}</Text>
        <TextInput
          style={s.textArea}
          placeholder={t('describeProblem')}
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          value={message}
          onChangeText={setMessage}
        />

        <Pressable style={s.sendBtn} onPress={handleSend}>
          <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.sendTxt}>{t('send')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 10 },
  infoLabel: { fontSize: 12, color: '#888' },
  infoValue: { fontWeight: '700', fontSize: 15, color: '#111', marginTop: 2 },
  subjectCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 16 },
  subjectLabel: { fontSize: 12, color: '#888' },
  subjectValue: { fontWeight: '700', fontSize: 15, color: '#111', marginTop: 2 },
  fieldLabel: { fontWeight: '700', fontSize: 14, color: '#333', paddingHorizontal: 16, marginBottom: 8 },
  textArea: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 16, fontSize: 15, minHeight: 150, borderWidth: 1, borderColor: '#e0e0e0' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16, marginTop: 20 },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sentIconWrap: { marginBottom: 20 },
  sentTitle: { fontSize: 24, fontWeight: '900', color: '#111', marginBottom: 8 },
  sentDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  sentBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40 },
  sentBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
