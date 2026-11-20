import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useApp } from '../context/AppContext';
import * as dialog from '../lib/dialog';
import { useActivity } from '../hooks/useActivity';
import { useAsync } from '../hooks/useAsync';
import { titleDetails, titleProviders, backdropUrl, logoUrl } from '../api/tmdb';
import { saveRating, removeRating } from '../api/ratings';
import { setListStatus } from '../api/lists';
import { tally, breakdown, watchingUids, timeAgo, ago, titleKeyOf } from '../lib/verdict';
import { RATING_INFO, LIST_INFO, NOTE_MAX } from '../constants/ratings';
import { Button, ErrorText, Field, H2, Loading, P, Screen, Section, Small, IconButton } from '../components/ui';
import Poster from '../components/Poster';
import VerdictChip from '../components/VerdictChip';
import RatingButtons from '../components/RatingButtons';
import ListStatusPicker from '../components/ListStatusPicker';
import Avatar from '../components/Avatar';
import PersonRow from '../components/PersonRow';
import { colors, radius, space, type } from '../constants/theme';

const ProviderGroup = ({ label, list, mine }) => {
  if (!list || !list.length) return null;
  return (
    <View style={{ marginBottom: space(3) }}>
      <Small style={{ marginBottom: 6 }}>{label}</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((p) => {
          const own = mine.includes(p.id);
          return (
            <View key={p.id} style={{ alignItems: 'center', width: 64 }}>
              <View style={{ borderRadius: 12, borderWidth: 2, borderColor: own ? colors.accent : 'transparent' }}>
                {p.logoPath ? (
                  <Image source={{ uri: logoUrl(p.logoPath) }} style={{ width: 48, height: 48, borderRadius: 10 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type.h3, { color: colors.muted }]}>{(p.name || '?').slice(0, 1)}</Text>
                  </View>
                )}
                {own ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} style={{ position: 'absolute', right: -6, top: -6, backgroundColor: colors.bg, borderRadius: 8 }} /> : null}
              </View>
              <Text style={[type.tiny, { color: own ? colors.accent : colors.muted, textAlign: 'center', marginTop: 3 }]} numberOfLines={2}>{p.name}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default function TitleDetail({ route, navigation }) {
  const { mediaType, tmdbId } = route.params;
  const titleKey = titleKeyOf(mediaType, tmdbId);
  const { profile, prefs, ratingByKey, listByKey, person } = useApp();
  const activity = useActivity(titleKey);
  const details = useAsync(() => titleDetails(mediaType, tmdbId), [titleKey]);
  const providers = useAsync(() => titleProviders(mediaType, tmdbId, (profile && profile.region) || 'US'), [titleKey]);
  const mine = ratingByKey[titleKey];
  const list = listByKey[titleKey];
  const counts = useMemo(() => tally(activity, prefs.muted), [activity, prefs]);
  const watchers = useMemo(() => watchingUids(activity, prefs.muted), [activity, prefs]);
  const [showMore, setShowMore] = useState(false);

  const d = details.data;
  const title = d || route.params.preview || { mediaType, tmdbId, name: '' };

  useEffect(() => { if (d) navigation.setOptions({ title: d.name }); }, [d, navigation]);

  const changeList = async (status) => {
    const t = { ...title, mediaType, tmdbId };
    await setListStatus(profile.uid, t, status, list).catch((e) => dialog.alert('Could not save', e.message));
    if (status === 'finished' && mine) {
      dialog.alert('Finished!', `You said ${RATING_INFO[mine.rating].emoji} ${RATING_INFO[mine.rating].label}. Still true?`, [
        { text: 'Keep it', style: 'cancel', onPress: () => mine.whileWatching && saveRating(profile.uid, t, { ...mine, whileWatching: false }) },
        { text: 'Change', onPress: () => navigation.navigate('Rate', { title: t }) },
      ]);
    } else if (status === 'finished' && !mine) {
      navigation.navigate('Rate', { title: t });
    }
  };

  if (details.loading && !route.params.preview) return <Loading />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space(16) }}>
      {d && d.backdropPath ? (
        <Image source={{ uri: backdropUrl(d.backdropPath) }} style={{ width: '100%', aspectRatio: 16 / 9, opacity: 0.55 }} contentFit="cover" />
      ) : <View style={{ height: space(4) }} />}
      <View style={{ paddingHorizontal: space(4), marginTop: d && d.backdropPath ? -space(16) : 0, flexDirection: 'row' }}>
        <Poster path={title.posterPath} width={110} name={title.name} />
        <View style={{ flex: 1, marginLeft: space(4), justifyContent: 'flex-end' }}>
          <Text style={[type.h2, { fontSize: 22 }]}>{title.name}</Text>
          <Small style={{ marginTop: 4 }}>
            {[title.year, mediaType === 'tv' ? (d && d.seasons ? `${d.seasons} season${d.seasons > 1 ? 's' : ''}` : 'Series') : d && d.runtime ? `${d.runtime} min` : 'Movie']
              .filter(Boolean).join(' · ')}
          </Small>
          {d && d.genres && d.genres.length ? <Small>{d.genres.slice(0, 3).join(', ')}</Small> : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: space(4) }}>
        <ErrorText error={details.error} />

        <Section title="Friends' verdict">
          {counts.total ? (
            <>
              <VerdictChip counts={counts} onPress={() => navigation.navigate('Breakdown', { titleKey, name: title.name })} />
              <Small style={{ marginTop: 6 }}>Tap to see who said what.</Small>
            </>
          ) : <Small>No friends have rated this yet.</Small>}
          {watchers.length ? (
            <Pressable onPress={() => navigation.navigate('Breakdown', { titleKey, name: title.name })} style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(3) }}>
              <View style={{ flexDirection: 'row' }}>
                {watchers.slice(0, 4).map((uid, i) => (
                  <View key={uid} style={{ marginLeft: i ? -8 : 0 }}><Avatar person={person(uid)} size={26} /></View>
                ))}
              </View>
              <Small style={{ marginLeft: 8 }}>
                {watchers.length === 1 ? `${person(watchers[0]).displayName} is watching` : `${watchers.length} friends are watching`}
              </Small>
            </Pressable>
          ) : null}
        </Section>

        <Section
          title="Your verdict"
          action={mine && mine.history && mine.history.length ? (
            <Pressable onPress={() => navigation.navigate('History', { titleKey, name: title.name })}><Small style={{ color: colors.accent }}>History</Small></Pressable>
          ) : null}
        >
          <RatingButtons value={mine && mine.rating} onChange={() => navigation.navigate('Rate', { title: { ...title, mediaType, tmdbId } })} />
          {mine ? (
            <View style={{ marginTop: space(2) }}>
              {mine.whileWatching ? <Small style={{ color: colors.accent }}>Still watching</Small> : null}
              {mine.note ? <P style={{ marginTop: 4, fontStyle: 'italic' }}>"{mine.note}"</P> : null}
              <Small style={{ marginTop: 4 }}>Rated {ago(mine.updatedAt)}</Small>
            </View>
          ) : null}
        </Section>

        <Section title="Your list">
          <ListStatusPicker value={list && list.status} onChange={changeList} />
        </Section>

        <Section title="Where to watch">
          {providers.loading ? <Small>Checking…</Small> : providers.data ? (
            <>
              <ProviderGroup label="Stream" list={[...providers.data.flatrate, ...providers.data.free, ...providers.data.ads]} mine={(profile && profile.services) || []} />
              <ProviderGroup label="Rent" list={providers.data.rent} mine={[]} />
              <ProviderGroup label="Buy" list={providers.data.buy} mine={[]} />
              {!providers.data.flatrate.length && !providers.data.rent.length && !providers.data.buy.length && !providers.data.free.length
                ? <Small>Not streaming in the US right now.</Small> : null}
              {providers.data.link ? (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(providers.data.link)}>
                  <Small style={{ color: colors.accent }}>More options on JustWatch</Small>
                </Pressable>
              ) : null}
            </>
          ) : <Small>Couldn't load streaming info.</Small>}
        </Section>

        {d ? (
          <Section title="About">
            {d.tagline ? <P style={{ fontStyle: 'italic', color: colors.muted, marginBottom: 6 }}>{d.tagline}</P> : null}
            <P numberOfLines={showMore ? undefined : 4}>{d.overview || 'No summary yet.'}</P>
            {d.overview && d.overview.length > 220 ? (
              <Pressable onPress={() => setShowMore(!showMore)}><Small style={{ color: colors.accent, marginTop: 4 }}>{showMore ? 'Less' : 'More'}</Small></Pressable>
            ) : null}
            {d.cast && d.cast.length ? <Small style={{ marginTop: space(3) }}>With {d.cast.slice(0, 5).map((c) => c.name).join(', ')}</Small> : null}
            {d.trailerKey ? (
              <Button small kind="secondary" icon="play" title="Trailer" style={{ alignSelf: 'flex-start', marginTop: space(3) }}
                onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${d.trailerKey}`)} />
            ) : null}
          </Section>
        ) : null}
      </View>
    </ScrollView>
  );
}

// Modal: pick a verdict, write a note, set the list status, save.
export function RateSheet({ route, navigation }) {
  const { title } = route.params;
  const titleKey = titleKeyOf(title.mediaType, title.tmdbId);
  const { profile, ratingByKey, listByKey } = useApp();
  const mine = ratingByKey[titleKey];
  const list = listByKey[titleKey];
  const [rating, setRating] = useState((mine && mine.rating) || route.params.rating || null);
  const [note, setNote] = useState((mine && mine.note) || '');
  const [status, setStatus] = useState(list ? list.status : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if ((list ? list.status : null) !== status) await setListStatus(profile.uid, title, status, list);
      await saveRating(profile.uid, title, { rating, note: note.trim(), tags: (mine && mine.tags) || [], whileWatching: status === 'watching' });
      navigation.goBack();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const unrate = () => dialog.alert('Remove your verdict?', 'Friends will stop seeing it.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { await removeRating(profile.uid, titleKey).catch(() => {}); navigation.goBack(); } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space(4) }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(5) }}>
            <Poster path={title.posterPath} width={48} name={title.name} />
            <View style={{ flex: 1, marginLeft: space(3) }}>
              <Text style={type.h3} numberOfLines={2}>{title.name}</Text>
              {title.year ? <Small>{title.year}</Small> : null}
            </View>
            <IconButton name="close" onPress={() => navigation.goBack()} label="Close" />
          </View>
          <H2 style={{ marginBottom: space(3) }}>What's your verdict?</H2>
          <RatingButtons value={rating} onChange={setRating} />
          <Field
            style={{ marginTop: space(5) }} label="A note for friends (optional)" value={note} onChangeText={setNote}
            multiline maxLength={NOTE_MAX} placeholder="e.g. Skip season 1, it gets good in season 2"
            hint={`${note.length}/${NOTE_MAX}`}
          />
          <Text style={[type.h3, { marginBottom: space(2) }]}>On your list</Text>
          <ListStatusPicker value={status} onChange={setStatus} />
          {status === 'watching' ? <Small style={{ marginTop: 4 }}>Friends will see this as an early take ("Still watching").</Small> : null}
          <ErrorText error={error} />
          <Button title={mine ? 'Update verdict' : 'Save verdict'} onPress={save} loading={busy} disabled={!rating} style={{ marginTop: space(5) }} />
          {mine ? <Button title="Remove my verdict" kind="danger" small style={{ marginTop: space(3) }} onPress={unrate} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// Modal: who said what. Starred first, muted hidden.
export function Breakdown({ route, navigation }) {
  const { titleKey, name } = route.params;
  const { prefs, person } = useApp();
  const activity = useActivity(titleKey);
  const groups = useMemo(() => breakdown(activity, prefs), [activity, prefs]);
  const watchers = useMemo(() => watchingUids(activity, prefs.muted), [activity, prefs]);
  const open = (uid) => { navigation.goBack(); navigation.navigate('FriendProfile', { uid }); };

  return (
    <Screen scroll edges={['bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <H2 style={{ flex: 1 }}>{name}</H2>
        <IconButton name="close" onPress={() => navigation.goBack()} label="Close" />
      </View>
      {['up', 'meh', 'down'].map((k) => (
        <Section key={k} title={`${RATING_INFO[k].emoji}  ${RATING_INFO[k].label}  ·  ${groups[k].length}`}>
          {groups[k].length ? groups[k].map((r) => (
            <PersonRow
              key={r.uid} person={person(r.uid)} starred={r.starred} onPress={() => open(r.uid)}
              subtitle={[r.whileWatching ? 'Still watching' : null, r.note ? `"${r.note}"` : null, timeAgo(r.at)].filter(Boolean).join('  ·  ')}
            />
          )) : <Small>Nobody yet.</Small>}
        </Section>
      ))}
      {watchers.length ? (
        <Section title={`Watching now  ·  ${watchers.length}`}>
          {watchers.map((uid) => <PersonRow key={uid} person={person(uid)} starred={prefs.starred[uid]} onPress={() => open(uid)} />)}
        </Section>
      ) : null}
    </Screen>
  );
}

export function History({ route }) {
  const { titleKey } = route.params;
  const { ratingByKey } = useApp();
  const mine = ratingByKey[titleKey];
  if (!mine) return <Screen scroll edges={[]}><Small>No verdict yet.</Small></Screen>;
  const entries = [{ rating: mine.rating, note: mine.note, at: mine.updatedAt, current: true }, ...[...(mine.history || [])].reverse()];
  return (
    <Screen scroll edges={[]}>
      {entries.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: space(3), borderBottomWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 24 }}>{RATING_INFO[e.rating] ? RATING_INFO[e.rating].emoji : '?'}</Text>
          <View style={{ marginLeft: space(3), flex: 1 }}>
            <Text style={type.h3}>{RATING_INFO[e.rating] ? RATING_INFO[e.rating].label : e.rating}{e.current ? '  (now)' : ''}</Text>
            {e.note ? <Small>"{e.note}"</Small> : null}
            <Small>{ago(e.at)}</Small>
          </View>
        </View>
      ))}
    </Screen>
  );
}
