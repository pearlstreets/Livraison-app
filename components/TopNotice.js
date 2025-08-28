import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TopNotice({ lines = [] }) {
  const l1 = lines[0] ?? '';
  const l2 = lines[1] ?? '';
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.txt} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>{l1}</Text>
      {!!l2 && <Text style={[styles.txt, styles.l2]} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>{l2}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4
  },
  txt: { color: '#fff', fontWeight: '700', fontSize: 15, lineHeight: 18, textAlign: 'center' },
  l2: { marginTop: 2 }
});
