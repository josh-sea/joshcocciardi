import React from 'react';
import { View } from 'react-native';
import { LIST_STATUSES, LIST_INFO } from '../constants/ratings';
import { Chip } from './ui';

// Tap a status to set it, tap the current one again to clear it.
export default function ListStatusPicker({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {LIST_STATUSES.map((s) => (
        <Chip key={s} label={LIST_INFO[s].label} icon={LIST_INFO[s].icon} on={value === s} onPress={() => onChange(value === s ? null : s)} />
      ))}
    </View>
  );
}
