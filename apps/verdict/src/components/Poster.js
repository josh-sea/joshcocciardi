import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { posterUrl } from '../api/tmdb';
import { colors, radius } from '../constants/theme';

export default function Poster({ path, width = 64, style, name }) {
  const height = Math.round(width * 1.5);
  const url = posterUrl(path, width > 120 ? 'w500' : 'w185');
  return (
    <View style={[{ width, height, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 }, style]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width, height }} contentFit="cover" transition={150} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4 }}>
          <Text style={{ color: colors.faint, fontSize: 10, textAlign: 'center' }} numberOfLines={3}>{name || 'No poster'}</Text>
        </View>
      )}
    </View>
  );
}
