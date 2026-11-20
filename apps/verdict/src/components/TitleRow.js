import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, space, type } from '../constants/theme';
import { RATING_INFO, LIST_INFO } from '../constants/ratings';
import Poster from './Poster';
import VerdictChip from './VerdictChip';

// A title in a list: poster, name, year/type, my verdict and friends' chip.
export default function TitleRow({ title, counts, myRating, myList, subtitle, onPress, right }) {
  const kind = title.mediaType === 'tv' ? 'Series' : 'Movie';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', paddingVertical: space(2.5), opacity: pressed ? 0.7 : 1 })}>
      <Poster path={title.posterPath} width={56} name={title.name} />
      <View style={{ flex: 1, marginLeft: space(3), justifyContent: 'center' }}>
        <Text style={type.h3} numberOfLines={2}>{title.name}</Text>
        <Text style={[type.small, { marginTop: 2 }]}>
          {[title.year, kind].filter(Boolean).join(' · ')}
          {myRating ? `  ·  You ${RATING_INFO[myRating].emoji}` : ''}
          {myList ? `  ·  ${LIST_INFO[myList].short}` : ''}
        </Text>
        {subtitle ? <Text style={[type.small, { marginTop: 2 }]} numberOfLines={2}>{subtitle}</Text> : null}
        {counts && counts.total ? <View style={{ marginTop: 6 }}><VerdictChip counts={counts} compact /></View> : null}
      </View>
      {right || null}
    </Pressable>
  );
}

export const keyOf = (t) => t.titleKey || `${t.mediaType}_${t.tmdbId}`;
export const DividerLine = () => <View style={{ height: 1, backgroundColor: colors.border }} />;
