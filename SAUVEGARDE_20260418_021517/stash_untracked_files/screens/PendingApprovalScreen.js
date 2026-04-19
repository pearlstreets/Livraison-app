import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';
const POLL_INTERVAL_MS = 30000; // 30 seconds

export default function PendingApprovalScreen() {
  const insets = useSafeAreaInsets();
  const { logout, checkVerificationStatus } = useAuth();
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation on the icon
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Auto-poll every 30s
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        await checkVerificationStatus();
      } catch {}
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [checkVerificationStatus]);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      await checkVerificationStatus();
    } catch {}
    setChecking(false);
    setLastCheck(new Date());
  };

  const formatTime = (date) => {
    if (!date) return '';
    return `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.content}>
        {/* Icon */}
        <Animated.View style={[s.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="time-outline" size={48} color="#F59E0B" />
        </Animated.View>

        {/* Title */}
        <Text style={s.title}>
          {t('pendingApprovalTitle') || 'Compte en attente de validation'}
        </Text>

        {/* Subtitle */}
        <Text style={s.subtitle}>
          {t('pendingApprovalMsg') || 'Votre demande a été soumise. Notre équipe vérifie vos documents et informations.'}
        </Text>

        {/* Info cards */}
        <View style={s.infoBox}>
          {[
            { icon: 'document-text-outline', text: t('pendingApprovalDocs') || 'Documents en cours de vérification' },
            { icon: 'shield-checkmark-outline', text: t('pendingReview') || 'Vérification sous 24-48h ouvrées' },
            { icon: 'mail-outline', text: t('pendingEmail') || 'Un email de confirmation vous sera envoyé' },
            { icon: 'notifications-outline', text: t('pendingNotif') || 'Vous serez notifié du résultat' },
          ].map((item, i) => (
            <View key={i} style={[s.infoRow, i < 3 && s.infoRowBorder]}>
              <View style={s.infoIconWrap}>
                <Ionicons name={item.icon} size={20} color={BRAND} />
              </View>
              <Text style={s.infoText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* Status badge */}
        <View style={s.statusBadge}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>
            {t('pendingApprovalStatus') || 'En attente'}
          </Text>
        </View>

        {lastCheck && (
          <Text style={s.lastCheckText}>
            {t('lastChecked') || 'Dernière vérification'} : {formatTime(lastCheck)}
          </Text>
        )}
      </View>

      {/* Buttons */}
      <View style={s.buttons}>
        <Pressable style={s.checkBtn} onPress={handleManualCheck} disabled={checking}>
          {checking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.checkBtnText}>
                {t('pendingApprovalCheck') || 'Vérifier le statut'}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable style={s.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color="#6B7280" style={{ marginRight: 8 }} />
          <Text style={s.logoutBtnText}>
            {t('logout') || 'Se déconnecter'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'space-between', paddingHorizontal: 32 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  title: { fontSize: 24, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28, paddingHorizontal: 8 },
  infoBox: { backgroundColor: '#F9FAFB', borderRadius: 16, width: '100%', overflow: 'hidden', marginBottom: 24 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 8 },
  statusText: { fontSize: 14, fontWeight: '600', color: '#92400E' },
  lastCheckText: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  buttons: { gap: 12 },
  checkBtn: {
    height: 52, borderRadius: 14, backgroundColor: BRAND,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  checkBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  logoutBtn: {
    height: 48, borderRadius: 14, backgroundColor: '#F3F4F6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  logoutBtnText: { color: '#6B7280', fontWeight: '600', fontSize: 15 },
});
