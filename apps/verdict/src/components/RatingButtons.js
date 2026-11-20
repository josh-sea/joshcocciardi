import React from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius } from '../constants/theme';
import { RATINGS, RATING_INFO } from '../constants/ratings';

export default function RatingButtons({ value, onChange, size = 'large' }) {
  const big = size === 'large';
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {RATINGS.map((k) => {
        const on = value === k;
        const info = RATING_INFO[k];
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={info.label}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(k);
            }}
            style={({ pressed }) => ({
              flex: 1, alignItems: 'center', paddingVertical: big ? 14 : 8, borderRadius: radius.md, borderWidth: 2,
              borderColor: on ? info.color : colors.border, backgroundColor: on ? `${info.color}22` : colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontSize: big ? 30 : 20 }}>{info.emoji}</Text>
            <Text style={{ marginTop: 4, fontSize: big ? 13 : 11, fontWeight: '700', color: on ? info.color : colors.muted }}>{info.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
