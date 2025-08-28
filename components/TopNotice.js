import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/** 
 * lines: [ligne1, ligne2]
 * Deux lignes forcées (pas de wrap sur la même ligne), centrées, avec marges internes.
 */
export default function TopNotice({ lines = [] }) {
  const l1 = lines[0] ?? '';
  const l2 = lines[1] ?? '';
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text
        style={styles.txt}
        numberOfLines={1}
        ellipsizeMode="tail"
        allowFontScaling={false}
      >
        {l1}
      </Text>
      {!!l2 && (
        <Text
          style={[styles.txt, styles.line2]}
          numberOfLines={1}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {l2}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    // relief
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
  },
  line2: { marginTop: 2 }
});
