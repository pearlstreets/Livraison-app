import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { goBack } from '../navigation/RootNavigation';

export default function HistoryButton({ visible = true }) {
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <TouchableOpacity onPress={() => goBack()} style={styles.btn} activeOpacity={0.8}>
        <Text style={styles.txt}>Historique</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: Platform.select({ ios: 24, android: 24, default: 16 }),
  },
  btn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E8EB',
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 36,
    minWidth: 100,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },
  txt: { color: '#111', fontWeight: '700' }
});
