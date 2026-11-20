import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { feedPage, friendsWatching } from '../api/activity';
import { watchingUids, timeAgo } from '../lib/verdict';
import { RATING_INFO } from '../constants/ratings';
import { Button, Empty, H, Screen, Small } from '../components/ui';
import Avatar from '../components/Avatar';
import Poster from '../components/Poster';
import { colors, radius, space, type } from '../constants/theme';

const VERB = { rated: '', rerated: 'changed to ', started: 'started watching', finished: 'finished' };

function FeedItem({ item, onTitle, onPerson, starred }) {
  const r = item.rating && RATING_INFO[item.rating];
  const t = item.title || {};
  return (
    <View style={{ flexDirection: 'row', paddingVertical: space(3), borderBottomWidth: 1, borderColor: colors.border }}>
      <Pressable onPress={onPerson}><Avatar person={{ uid: item.actorUid, displayName: item.actorName }} size={36} starred={starred} /></Pressable>
      <View style={{ flex: 1, marginHorizontal: space(3) }}>
        <Text style={type.body}>
          <Text style={{ fontWeight: '800' }} onPress={onPerson}>{item.actorName}</Text>
          {item.type === 'rated' || item.type === 'rerated'
            ? <Text> {VERB[item.type]}<Text style={{ color: r ? r.color : colors.text, fontWeight: '700' }}>{r ? `${r.emoji} ${r.label}` : ''}</Text> on </Text>
            : <Text> {VERB[item.type]} </Text>}
          <Text style={{ fontWeight: '700' }} onPress={onTitle}>{t.name}</Text>
        </Text>
        {item.whileWatching && (item.type === 'rated' || item.type === 'rerated') ? <Small style={{ color: colors.accent }}>Still watching</Small> : null}
        {item.note ? <Text style={[type.body, { color: colors.muted, fontStyle: 'italic', marginTop: 4 }]} numberOfLines={3}>"{item.note}"</Text> : null}
        <Text style={[type.tiny, { marginTop: 4 }]}>{timeAgo(item.at)}</Text>
      </View>
      <Pressable onPress={onTitle}><Poster path={t.posterPath} width={44} name={t.name} /></Pressable>
    </View>
  );
}

export default function Feed({ navigation }) {
  const { user, prefs, person, friends } = useApp();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watching, setWatching] = useState([]);

  const load = useCallback(async (reset) => {
    const page = await feedPage(user.uid, reset ? null : cursor).catch(() => ({ items: [], last: null, done: true }));
    setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
    setCursor(page.last);
    setDone(page.done);
  }, [user, cursor]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      load(true),
      friendsWatching(user.uid, 20).then(setWatching).catch(() => setWatching([])),
    ]);
    setRefreshing(false);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { refresh(); }, [refresh, friends.length]);
  useEffect(() => navigation.addListener('focus', () => { if (!loading) refresh(); }), [navigation, refresh, loading]);

  // Muted friends never show up here.
  const visible = useMemo(() => items.filter((i) => !prefs.muted[i.actorUid]), [items, prefs]);
  const strip = useMemo(() => watching
    .map((a) => ({ a, w: watchingUids(a, prefs.muted) }))
    .filter((x) => x.w.length), [watching, prefs]);

  const openTitle = (i) => navigation.navigate('Title', { mediaType: i.mediaType, tmdbId: i.tmdbId, preview: { ...(i.title || {}), mediaType: i.mediaType, tmdbId: i.tmdbId } });

  const header = (
    <View>
      <H style={{ marginBottom: space(3) }}>Verdict</H>
      {strip.length ? (
        <View style={{ marginBottom: space(3) }}>
          <Text style={[type.h3, { marginBottom: space(2) }]}>Friends are watching</Text>
          <FlatList
            horizontal showsHorizontalScrollIndicator={false} data={strip} keyExtractor={(x) => x.a.id}
            renderItem={({ item: { a, w } }) => (
              <Pressable onPress={() => openTitle(a)} style={{ width: 84, marginRight: space(3) }}>
                <Poster path={a.title && a.title.posterPath} width={84} name={a.title && a.title.name} />
                <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={[type.tiny, { color: colors.text, fontWeight: '800' }]}>{w.length}</Text>
                </View>
                <Text style={[type.tiny, { marginTop: 4 }]} numberOfLines={1}>{w.length === 1 ? person(w[0]).displayName : `${w.length} friends`}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(16) }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!done && cursor) load(false); }}
        renderItem={({ item }) => (
          <FeedItem item={item} starred={prefs.starred[item.actorUid]} onTitle={() => openTitle(item)} onPerson={() => navigation.navigate('FriendProfile', { uid: item.actorUid })} />
        )}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.accent} /> : (
          friends.length ? (
            <Empty icon="sparkles-outline" title="Quiet so far" body="When friends rate something or start watching, it shows up here.">
              <Button title="Rate something you watched" onPress={() => navigation.navigate('Add')} />
            </Empty>
          ) : (
            <Empty icon="people-outline" title="Your feed fills up with friends" body="Add a few people whose taste you trust, or send your invite link.">
              <Button title="Find friends" onPress={() => navigation.navigate('Tabs', { screen: 'FriendsTab', params: { tab: 'find' } })} />
            </Empty>
          )
        )}
        ListFooterComponent={!done && visible.length ? <ActivityIndicator color={colors.accent} style={{ marginTop: space(4) }} /> : null}
      />
    </Screen>
  );
}
