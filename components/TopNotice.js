import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TopNotice({ message }) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.badge}>
        <Text
          style={styles.txt}
          numberOfLines={2}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch'
  },
  badge: {
    alignSelf: 'center',
    maxWidth: '92%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    // petit relief iOS/Android
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  txt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 18,
    textAlign: 'center'
  }
});
