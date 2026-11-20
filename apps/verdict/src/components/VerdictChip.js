import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';
import { RATING_INFO } from '../constants/ratings';

// 👍 4  😐 1  👎 0. The counts already leave out muted friends.
export default function VerdictChip({ counts, onPress, compact, showZero = true }) {
  if (!counts || (!counts.total && !showZero)) return null;
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      accessibilityLabel={`${counts.up} recommend, ${counts.meh} fine, ${counts.down} don't bother`}
      style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 3 : 6, borderWidth: 1, borderColor: colors.border }}
    >
      {['up', 'meh', 'down'].map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', marginRight: k === 'down' ? 0 : compact ? 8 : 12 }}>
          <Text style={{ fontSize: compact ? 12 : 15 }}>{RATING_INFO[k].emoji}</Text>
          <Text style={{ marginLeft: 3, fontWeight: '800', fontSize: compact ? 12 : 15, color: counts[k] ? RATING_INFO[k].color : colors.faint }}>{counts[k]}</Text>
        </View>
      ))}
    </Wrap>
  );
}
