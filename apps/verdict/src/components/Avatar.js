import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { initials } from '../lib/verdict';

// Initials on a color picked from the uid, so a person always looks the same.
const PALETTE = ['#7C5CBF', '#3F8FD2', '#2FA58A', '#C7883A', '#C25B7A', '#5E7C8F', '#8D6B4C'];
const hue = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export default function Avatar({ person, size = 40, starred }) {
  const name = (person && (person.displayName || person.username)) || '?';
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hue(person && person.uid), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
      </View>
      {starred ? (
        <View style={{ position: 'absolute', right: -3, bottom: -3, backgroundColor: colors.bg, borderRadius: 10, padding: 1 }}>
          <Ionicons name="star" size={Math.max(12, size * 0.32)} color={colors.star} />
        </View>
      ) : null}
    </View>
  );
}
