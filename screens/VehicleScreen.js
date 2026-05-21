import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const BRAND = '#00C29B';

// Valeurs backend : bicycle / scooter / car / walk
const VEHICLES = [
  { id: 'bicycle', icon: 'bicycle', labelKey: 'bike' },
  { id: 'scooter', icon: 'bicycle', labelKey: 'scooter' },
  { id: 'car', icon: 'car-outline', labelKey: 'car' },
  { id: 'walk', icon: 'walk-outline', labelKey: 'walk' },
];

export default function VehicleScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  // user.vehicle contient la valeur backend (bicycle/scooter/car/walk)
  const currentVehicle = user?.vehicle || 'bicycle';
  const [selected, setSelected] = useState(currentVehicle);

  function handleSave() {
    // Persiste via vehicle_type (champ backend autorisé par updateUser)
    updateUser({ vehicle_type: selected });
    Alert.alert(t('vehicleUpdated'), `${t('vehicleNow') || 'Véhicule'} : ${selected}`, [
      { text: t('ok') || 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
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
                <Ionicons name={v.icon} size={28} color={active ? BRAND : '#666'} />
              </View>
              <Text style={[s.vehicleLabel, active && { color: BRAND, fontWeight: '800' }]}>{t(v.labelKey) || v.id}</Text>
              {active && <Ionicons name="checkmark-circle" size={24} color={BRAND} />}
            </Pressable>
          );
        })}
      </View>

      <Pressable style={[s.saveBtn, selected === currentVehicle && { opacity: 0.4 }]} onPress={handleSave} disabled={selected === currentVehicle}>
        <Text style={s.saveTxt}>{t('save') || 'Enregistrer'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  subtitle: { color: '#888', fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  list: { marginHorizontal: 16 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10 },
  vehicleRowActive: { borderWidth: 2, borderColor: BRAND },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  vehicleLabel: { flex: 1, fontSize: 17, fontWeight: '600', color: '#111' },
  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginHorizontal: 16, marginTop: 16 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
