import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, type } from '../constants/theme';
import Avatar from './Avatar';

export default function PersonRow({ person, onPress, subtitle, starred, muted, right }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space(2.5), opacity: pressed ? 0.7 : 1 })}>
      <Avatar person={person} starred={starred} />
      <View style={{ flex: 1, marginLeft: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={type.h3} numberOfLines={1}>{person.displayName || person.username}</Text>
          {muted ? <Ionicons name="volume-mute" size={14} color={colors.faint} style={{ marginLeft: 6 }} /> : null}
        </View>
        <Text style={type.small} numberOfLines={2}>{subtitle || (person.username ? `@${person.username}` : '')}</Text>
      </View>
      {right || null}
    </Pressable>
  );
}
