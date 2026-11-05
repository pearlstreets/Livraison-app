import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dirIcon } from '../lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusBarShield from '../components/StatusBarShield';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const BRAND = '#FF6A13';

// Valeurs backend : bicycle / car / walk
const VEHICLES = [
  { id: 'bicycle', icon: 'bicycle', labelKey: 'bike' },
  { id: 'car', icon: 'car-outline', labelKey: 'car' },
  { id: 'walk', icon: 'walk-outline', labelKey: 'walk' },
];

export default function VehicleScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  const { user, updateUser } = useAuth();
  // user.vehicle contient la valeur backend (bicycle/car/walk)
  const currentVehicle = user?.vehicle || 'bicycle';
  const [selected, setSelected] = useState(currentVehicle);
  // Empêche un double envoi pendant l'appel serveur.
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    // Persiste via vehicle_type (champ backend autorisé par updateUser). Le
    // changement n'est confirmé qu'une fois accepté par le serveur.
    try {
      await updateUser({ vehicle_type: selected });
    } catch (e) {
      setSaving(false);
      Alert.alert(t('error'), e?.serverMessage || (e?.isNetworkError ? t('errorNetwork') : t('genericError')));
      return;
    }
    setSaving(false);
    Alert.alert(t('vehicleUpdated'), `${t('vehicleNow')} : ${t(VEHICLES.find((v) => v.id === selected)?.labelKey || 'bike')}`, [
      { text: t('ok') || 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('vehicleTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.subtitle}>{t('selectVehicle')}</Text>

      <View style={s.list}>
        {VEHICLES.map(v => {
          const active = selected === v.id;
          return (
            <Pressable key={v.id} style={[s.vehicleRow, active && s.vehicleRowActive]} onPress={() => setSelected(v.id)}>
              <View style={[s.iconCircle, active && { backgroundColor: BRAND + '20' }]}>
                <Ionicons name={v.icon} size={28} color={active ? BRAND : (dark ? colors.textMuted : '#666')} />
              </View>
              <Text style={[s.vehicleLabel, active && { color: BRAND, fontWeight: '800' }]}>{t(v.labelKey) || v.id}</Text>
              {active && <Ionicons name="checkmark-circle" size={24} color={BRAND} />}
            </Pressable>
          );
        })}
      </View>

      <Pressable style={[s.saveBtn, selected === currentVehicle && { opacity: 0.4 }]} onPress={handleSave} disabled={selected === currentVehicle || saving}>
        <Text style={s.saveTxt}>{t('save') || 'Enregistrer'}</Text>
      </Pressable>
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

// Styles selon le mode : en clair, valeurs d'origine à l'identique.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: k('#f5f5f5', c.bg) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: k('#111', c.text) },
  subtitle: { color: k('#888', c.textFaint), fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  list: { marginHorizontal: 16 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: k('#fff', c.card), borderRadius: 16, padding: 16, marginBottom: 10 },
  vehicleRowActive: { borderWidth: 2, borderColor: BRAND },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: k('#f0f0f0', c.borderStrong), alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  vehicleLabel: { flex: 1, fontSize: 17, fontWeight: '600', color: k('#111', c.text) },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginHorizontal: 16, marginTop: 16 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
};
