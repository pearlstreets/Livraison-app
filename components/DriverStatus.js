import React, { useState } from 'react';
import { View, Switch, Text, StyleSheet } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
const BRAND = '#00C29B';

export default function DriverStatus({ onChange }) {
  const { t } = useLanguage();
  const [online, setOnline] = useState(true);
  return (
    <View style={styles.bar}>
      <Text style={{ fontWeight:'700', color: online ? BRAND : '#888' }}>
        {online ? t('online') : t('offline')}
      </Text>
      <Switch value={online} onValueChange={v => { setOnline(v); onChange(v); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:12, backgroundColor:'#fff', borderRadius:10, marginBottom:12 }
});
