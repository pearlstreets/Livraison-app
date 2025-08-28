import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import ui from '../constants/filters-ui.json';
export default function InlineFilters({ filters = [], selected, onChange }) {
  const U = (ui && ui.inline) || {};
  const H = U.height ?? 28;
  const R = U.radius ?? 14;
  const GAP = U.gap ?? 6;
  const PH = U.paddingH ?? 10;
  const FZ = U.fontSize ?? 13;
  const labels = U.labels || {};
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {filters.map((f, i) => (
        <TouchableOpacity
          key={f.id || i}
          onPress={() => onChange && onChange(f.id)}
          style={{
            height: H,
            paddingHorizontal: PH,
            borderRadius: R,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected === f.id ? '#00C29B' : '#F2F3F5',
            marginLeft: i === 0 ? 0 : GAP
          }}
        >
          <Text style={{ fontSize: FZ, fontWeight: '700', color: selected === f.id ? '#fff' : '#111' }}>
            {labels[f.id] ?? f.label ?? f.id}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
