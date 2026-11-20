import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useAsync } from '../hooks/useAsync';
import { topRated, friendsWatching, activityFor } from '../api/activity';
import { trending, titleProviders } from '../api/tmdb';
import { recScore, tally, watchingUids } from '../lib/verdict';
import { Chip, H, Screen, Section, Small } from '../components/ui';
import TitleSearch from '../components/TitleSearch';
import Poster from '../components/Poster';
import VerdictChip from '../components/VerdictChip';
import { colors, space, type } from '../constants/theme';

const open = (navigation, t) => navigation.navigate('Title', { mediaType: t.mediaType, tmdbId: t.tmdbId, preview: t });
const asTitle = (a) => ({ ...(a.title || {}), mediaType: a.mediaType, tmdbId: a.tmdbId, titleKey: a.titleKey || a.id });

function Shelf({ items, navigation, caption }) {
  return (
    <FlatList
      horizontal showsHorizontalScrollIndicator={false} data={items} keyExtractor={(x) => x.t.titleKey}
      contentContainerStyle={{ paddingRight: space(4) }}
      renderItem={({ item: { t, counts, line } }) => (
        <Pressable onPress={() => open(navigation, t)} style={{ width: 112, marginRight: space(3) }}>
          <Poster path={t.posterPath} width={112} name={t.name} />
          <Text style={[type.small, { color: colors.text, marginTop: 6, fontWeight: '600' }]} numberOfLines={2}>{t.name}</Text>
          {counts && counts.total ? <View style={{ marginTop: 4 }}><VerdictChip counts={counts} compact /></View> : null}
          {line ? <Text style={[type.tiny, { marginTop: 3 }]} numberOfLines={1}>{line}</Text> : null}
          {caption ? caption(t) : null}
        </Pressable>
      )}
    />
  );
}

// Keep only titles streaming on one of my services. Providers are cached by
// the function, so this is cheap after the first look.
async function onMyServices(items, services) {
  if (!services.length) return items;
  const ok = await Promise.all(items.map(async (x) => {
    try {
      const p = await titleProviders(x.t.mediaType, x.t.tmdbId);
      return [...p.flatrate, ...p.free, ...p.ads].some((s) => services.includes(s.id));
    } catch { return false; }
  }));
  return items.filter((_, i) => ok[i]);
}

export default function Discover({ navigation }) {
  const { user, profile, prefs, ratingByKey, person, friends } = useApp();
  const [searching, setSearching] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const services = (profile && profile.services) || [];

  const recs = useAsync(async () => {
    const docs = await topRated(user.uid, 60);
    let items = docs
      .filter((a) => !ratingByKey[a.titleKey || a.id])
      .map((a) => ({ t: asTitle(a), counts: tally(a, prefs.muted), ...recScore(a, prefs) }))
      .filter((x) => x.counts.total > 0 && x.score > 0)
      .sort((a, b) => b.score - a.score || b.votes - a.votes)
      .slice(0, 25);
    if (mineOnly) items = await onMyServices(items, services);
    return items;
  }, [user, prefs, mineOnly, Object.keys(ratingByKey).length]);

  const watching = useAsync(async () => {
    const docs = await friendsWatching(user.uid, 30);
    let items = docs
      .map((a) => {
        const w = watchingUids(a, prefs.muted);
        const line = w.length === 1 ? `${person(w[0]).displayName}` : `${w.length} friends`;
        return { t: asTitle(a), counts: tally(a, prefs.muted), n: w.length, line };
      })
      .filter((x) => x.n > 0);
    if (mineOnly) items = await onMyServices(items, services);
    return items;
  }, [user, prefs, mineOnly, friends.length]);

  const hot = useAsync(async () => {
    const list = await trending();
    const acts = await activityFor(user.uid, list.map((t) => t.titleKey)).catch(() => ({}));
    let items = list.map((t) => ({ t, counts: tally(acts[t.titleKey], prefs.muted) }));
    if (mineOnly) items = await onMyServices(items, services);
    return items;
  }, [user, prefs, mineOnly]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([recs.reload(), watching.reload(), hot.reload()]);
    setRefreshing(false);
  }, [recs, watching, hot]);

  const empty = useMemo(() => !friends.length, [friends.length]);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}>
      <H style={{ marginBottom: space(4) }}>Discover</H>
      <TitleSearch onPick={(t) => open(navigation, t)} onQuery={(q) => setSearching(Boolean(q.trim()))} />
      {searching ? null : (
        <>
          <View style={{ flexDirection: 'row', marginTop: space(2) }}>
            <Chip label={services.length ? 'Only on my services' : 'Pick your services in Settings'} icon="tv-outline" on={mineOnly}
              onPress={() => (services.length ? setMineOnly(!mineOnly) : navigation.navigate('Settings'))} />
          </View>
          <Section title="Friends recommend">
            {empty ? <Small>Add friends to see what they recommend.</Small>
              : recs.loading ? <Small>Loading…</Small>
              : recs.data && recs.data.length ? <Shelf items={recs.data} navigation={navigation} />
              : <Small>{mineOnly ? 'Nothing your friends recommend is on your services.' : "Nothing new yet. When friends 👍 something you haven't rated, it shows up here."}</Small>}
          </Section>
          <Section title="Friends are watching">
            {empty ? <Small>Nobody yet.</Small>
              : watching.loading ? <Small>Loading…</Small>
              : watching.data && watching.data.length ? <Shelf items={watching.data} navigation={navigation} />
              : <Small>No friends are watching anything right now.</Small>}
          </Section>
          <Section title="Trending this week">
            {hot.loading ? <Small>Loading…</Small> : hot.data ? <Shelf items={hot.data} navigation={navigation} /> : <Small>Couldn't load trending.</Small>}
          </Section>
        </>
      )}
    </Screen>
  );
}

export function AddTitle({ navigation }) {
  return (
    <Screen scroll edges={['bottom']}>
      <H style={{ fontSize: 22, marginBottom: space(3) }}>What did you watch?</H>
      <TitleSearch autoFocus onPick={(t) => navigation.replace('Rate', { title: t })} />
    </Screen>
  );
}
