import React, { useState } from 'react';
import { View, Switch, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
const BRAND = '#FF6A13';

export default function DriverStatus({ onChange }) {
  const [online, setOnline] = useState(true);
  const { colors, dark } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.card }]}>
      <Text style={{ fontWeight:'700', color: online ? BRAND : (dark ? colors.textMuted : '#888') }}>
        {online ? 'En ligne' : 'Hors ligne'}
      </Text>
      <Switch value={online} onValueChange={v => { setOnline(v); onChange?.(v); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:12, backgroundColor:'#fff', borderRadius:10, marginBottom:12 }
});
