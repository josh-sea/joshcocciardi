import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { providerList, logoUrl } from '../api/tmdb';
import { useAsync } from '../hooks/useAsync';
import { colors, radius, space, type } from '../constants/theme';
import { ErrorText } from './ui';

// Grid of US streaming services. `value` is an array of TMDB provider ids.
export default function ServicesPicker({ value = [], onChange, limit = 24 }) {
  const { data, loading, error } = useAsync(() => providerList('US'), []);
  if (loading) return <ActivityIndicator color={colors.accent} style={{ marginTop: space(6) }} />;
  if (error) return <ErrorText error={error} />;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space(1) }}>
      {(data || []).slice(0, limit).map((p) => {
        const on = value.includes(p.id);
        return (
          <Pressable key={p.id} onPress={() => toggle(p.id)} style={{ width: '33.33%', padding: space(1) }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.accent : colors.border, padding: space(2), alignItems: 'center' }}>
              {p.logoPath ? <Image source={{ uri: logoUrl(p.logoPath) }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : <View style={{ width: 44, height: 44 }} />}
              <Text style={[type.tiny, { color: colors.text, marginTop: 6, textAlign: 'center' }]} numberOfLines={2}>{p.name}</Text>
              {on ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ position: 'absolute', top: 4, right: 4 }} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
