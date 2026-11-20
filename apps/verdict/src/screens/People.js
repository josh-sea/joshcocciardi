import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchProfile, mutualCount, blockUser, reportUser, removeConnection, acceptRequest, sendRequest } from '../api/social';
import { ratingsOf } from '../api/ratings';
import { listOf } from '../api/lists';
import { setFriendPref } from '../api/prefs';
import { tasteMatch, MATCH_MIN_OVERLAP } from '../lib/verdict';
import { RATING_INFO } from '../constants/ratings';
import { Button, Chip, Empty, ErrorText, H, Loading, Screen, Section, Segmented, Small, IconButton } from '../components/ui';
import Avatar from '../components/Avatar';
import TitleRow, { DividerLine } from '../components/TitleRow';
import { colors, radius, space, type } from '../constants/theme';

const openTitle = (navigation, t) => navigation.navigate('Title', { mediaType: t.mediaType, tmdbId: t.tmdbId, preview: { ...(t.title || {}), mediaType: t.mediaType, tmdbId: t.tmdbId } });

export function TitleList({ items, navigation, empty, filter }) {
  const { ratingByKey } = useApp();
  const shown = filter ? items.filter(filter) : items;
  if (!shown.length) return <Small style={{ marginTop: space(3) }}>{empty}</Small>;
  return shown.map((x, i) => (
    <View key={x.titleKey}>
      {i ? <DividerLine /> : null}
      <TitleRow
        title={{ ...(x.title || {}), mediaType: x.mediaType, tmdbId: x.tmdbId }}
        subtitle={x.rating ? `${RATING_INFO[x.rating].emoji} ${RATING_INFO[x.rating].label}${x.whileWatching ? '  ·  Still watching' : ''}${x.note ? `  ·  "${x.note}"` : ''}` : null}
        myRating={x.uid && ratingByKey[x.titleKey] && x.uid !== (ratingByKey[x.titleKey] || {}).uid ? ratingByKey[x.titleKey].rating : null}
        onPress={() => openTitle(navigation, x)}
      />
    </View>
  ));
}

function MatchBadge({ match }) {
  if (!match) return null;
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), marginTop: space(4) }}>
      {match.percent === null ? (
        <Small>Rate {Math.max(0, MATCH_MIN_OVERLAP - match.overlap)} more in common to see your taste match.</Small>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 34, fontWeight: '900', color: match.percent >= 70 ? colors.up : match.percent >= 45 ? colors.accent : colors.down }}>{match.percent}%</Text>
          <View style={{ marginLeft: space(3), flex: 1 }}>
            <Text style={type.h3}>Taste match</Text>
            <Small>You agree on {match.agreeCount} of {match.overlap} titles you've both rated.</Small>
          </View>
        </View>
      )}
    </View>
  );
}

export default function FriendProfile({ route, navigation }) {
  const { uid } = route.params;
  const { user, stateOf, prefOf, myRatings, rememberPerson } = useApp();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [mutual, setMutual] = useState(null);
  const [theirs, setTheirs] = useState(null);
  const [watching, setWatching] = useState([]);
  const [want, setWant] = useState([]);
  const [tab, setTab] = useState('ratings');
  const [filter, setFilter] = useState(null);
  const [busy, setBusy] = useState(false);
  const state = stateOf(uid);
  const pref = prefOf(uid);
  const isMe = uid === user.uid;

  useEffect(() => {
    if (isMe) { navigation.replace('Tabs', { screen: 'ProfileTab' }); return; }
    fetchProfile(uid).then((r) => { setInfo(r); rememberPerson(r.profile); navigation.setOptions({ title: r.profile.displayName }); }).catch(setError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (state === 'none') { setMutual(null); return; }
    mutualCount(uid).then(setMutual).catch(() => setMutual(null));
    if (state !== 'friends') return;
    ratingsOf(uid).then(setTheirs).catch(() => setTheirs([]));
    listOf(uid, 'watching').then(setWatching);
    listOf(uid, 'want').then(setWant);
  }, [uid, state]);

  const match = useMemo(() => {
    if (!theirs) return null;
    const mine = Object.fromEntries(myRatings.map((r) => [r.titleKey, r.rating]));
    return tasteMatch(mine, Object.fromEntries(theirs.map((r) => [r.titleKey, r.rating])));
  }, [theirs, myRatings]);

  const menu = () => Alert.alert(info.profile.displayName, null, [
    state === 'friends' ? { text: 'Remove friend', onPress: () => confirm('Remove friend?', "They won't be told. You'll both stop seeing each other's verdicts.", () => removeConnection(user.uid, uid)) } : null,
    { text: 'Block', style: 'destructive', onPress: () => confirm('Block?', "They can't find you, send requests or see your verdicts. They won't be told.", async () => { await blockUser(uid); navigation.goBack(); }) },
    { text: 'Report', onPress: () => confirm('Report this account?', "We'll take a look. They won't know who reported them.", () => reportUser(user.uid, uid, 'Reported from profile')) },
    { text: 'Cancel', style: 'cancel' },
  ].filter(Boolean));

  const connect = async (fn) => { setBusy(true); try { await fn(); } catch (e) { Alert.alert('Could not do that', e.message); } setBusy(false); };

  if (error) return <Screen scroll edges={[]}><ErrorText error={error} /></Screen>;
  if (!info) return <Loading />;
  const p = info.profile;

  const byKey = Object.fromEntries((theirs || []).map((r) => [r.titleKey, r]));
  const agreeList = match ? match.agree.map((m) => byKey[m.titleKey]).filter(Boolean) : [];
  const disagreeList = match ? match.disagree.map((m) => byKey[m.titleKey]).filter(Boolean) : [];

  return (
    <Screen scroll edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar person={p} size={64} starred={pref === 'starred'} />
        <View style={{ marginLeft: space(4), flex: 1 }}>
          <H style={{ fontSize: 24 }}>{p.displayName}</H>
          <Small>@{p.username}{mutual !== null ? `  ·  ${mutual} mutual friend${mutual === 1 ? '' : 's'}` : ''}</Small>
        </View>
        <IconButton name="ellipsis-horizontal" onPress={menu} label="More" />
      </View>

      {state === 'none' ? (
        <View style={{ marginTop: space(6) }}>
          <Button title="Add friend" icon="person-add" loading={busy} onPress={() => connect(() => sendRequest(user.uid, uid, 'search'))} />
          <Small style={{ marginTop: space(3), textAlign: 'center' }}>Once they accept, you'll see each other's verdicts.</Small>
        </View>
      ) : null}
      {state === 'pending_out' ? (
        <View style={{ marginTop: space(6) }}>
          <Button title="Request sent" kind="ghost" loading={busy} onPress={() => connect(() => removeConnection(user.uid, uid))} />
          <Small style={{ marginTop: space(3), textAlign: 'center' }}>Tap to cancel it.</Small>
        </View>
      ) : null}
      {state === 'pending_in' ? (
        <View style={{ marginTop: space(6), flexDirection: 'row', gap: 10 }}>
          <Button title="Accept" style={{ flex: 1 }} loading={busy} onPress={() => connect(() => acceptRequest(user.uid, uid))} />
          <Button title="Decline" kind="ghost" style={{ flex: 1 }} onPress={() => connect(() => removeConnection(user.uid, uid))} />
        </View>
      ) : null}

      {state === 'friends' ? (
        <>
          <MatchBadge match={match} />
          <View style={{ flexDirection: 'row', marginTop: space(4) }}>
            <Chip label={pref === 'starred' ? 'Starred' : 'Star'} icon={pref === 'starred' ? 'star' : 'star-outline'} on={pref === 'starred'}
              onPress={() => setFriendPref(user.uid, uid, pref === 'starred' ? 'normal' : 'starred')} />
            <Chip label={pref === 'muted' ? 'Muted' : 'Mute'} icon={pref === 'muted' ? 'volume-mute' : 'volume-mute-outline'} on={pref === 'muted'}
              onPress={() => setFriendPref(user.uid, uid, pref === 'muted' ? 'normal' : 'muted')} />
          </View>
          <Small>
            {pref === 'starred' ? 'Their verdicts come first and count double in your recommendations. '
              : pref === 'muted' ? "Hidden from your feed, recommendations and every count. " : ''}
            Only you can see this. They won't be told.
          </Small>

          <Segmented
            style={{ marginTop: space(5) }} value={tab} onChange={setTab}
            options={[
              { value: 'ratings', label: 'Ratings' },
              { value: 'watching', label: 'Watching' },
              { value: 'match', label: 'Agree / Disagree' },
            ]}
          />
          {tab === 'ratings' ? (
            <View style={{ marginTop: space(3) }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {['up', 'meh', 'down'].map((k) => (
                  <Chip key={k} label={`${RATING_INFO[k].emoji} ${(theirs || []).filter((r) => r.rating === k).length}`} on={filter === k} onPress={() => setFilter(filter === k ? null : k)} />
                ))}
                {['movie', 'tv'].map((k) => (
                  <Chip key={k} label={k === 'tv' ? 'Shows' : 'Movies'} on={filter === k} onPress={() => setFilter(filter === k ? null : k)} />
                ))}
              </View>
              {theirs === null ? <Small>Loading…</Small> : (
                <TitleList items={theirs} navigation={navigation} empty="Nothing here yet."
                  filter={filter ? (r) => r.rating === filter || r.mediaType === filter : null} />
              )}
            </View>
          ) : null}
          {tab === 'watching' ? (
            <View style={{ marginTop: space(3) }}>
              <TitleList items={watching} navigation={navigation} empty="Not watching anything right now." />
              {want.length ? (
                <Section title="Want to watch"><TitleList items={want} navigation={navigation} empty="" /></Section>
              ) : null}
            </View>
          ) : null}
          {tab === 'match' ? (
            <View style={{ marginTop: space(3) }}>
              <Section title={`You agree on ${agreeList.length}`} style={{ marginTop: 0 }}>
                <TitleList items={agreeList} navigation={navigation} empty="Nothing in common yet." />
              </Section>
              <Section title={`You disagree on ${disagreeList.length}`}>
                <TitleList items={disagreeList} navigation={navigation} empty="No disagreements. Suspicious." />
              </Section>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );

  function confirm(title, body, fn) {
    Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', style: 'destructive', onPress: () => fn().catch((e) => Alert.alert('Could not do that', e.message)) }]);
  }
}

export function Profile({ navigation }) {
  const { profile, myRatings, myLists } = useApp();
  const [tab, setTab] = useState('ratings');
  const [filter, setFilter] = useState(null);
  const lists = (s) => myLists.filter((l) => l.status === s);
  if (!profile) return <Loading />;
  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar person={profile} size={60} />
        <View style={{ marginLeft: space(4), flex: 1 }}>
          <H style={{ fontSize: 24 }}>{profile.displayName || profile.username}</H>
          <Small>@{profile.username}  ·  {myRatings.length} rated  ·  {lists('watching').length} watching</Small>
        </View>
        <IconButton name="settings-outline" onPress={() => navigation.navigate('Settings')} label="Settings" />
      </View>
      <Segmented
        style={{ marginTop: space(5) }} value={tab} onChange={setTab}
        options={[
          { value: 'ratings', label: 'Rated' },
          { value: 'watching', label: 'Watching' },
          { value: 'want', label: 'Want' },
          { value: 'done', label: 'Done' },
        ]}
      />
      {tab === 'ratings' ? (
        <View style={{ marginTop: space(3) }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['up', 'meh', 'down'].map((k) => (
              <Chip key={k} label={`${RATING_INFO[k].emoji} ${myRatings.filter((r) => r.rating === k).length}`} on={filter === k} onPress={() => setFilter(filter === k ? null : k)} />
            ))}
          </View>
          {myRatings.length ? (
            <TitleList items={myRatings} navigation={navigation} empty="Nothing matches." filter={filter ? (r) => r.rating === filter : null} />
          ) : (
            <Empty icon="thumbs-up-outline" title="No verdicts yet" body="Rate something you've watched and your friends will see it.">
              <Button title="Rate something" onPress={() => navigation.navigate('Add')} />
            </Empty>
          )}
        </View>
      ) : null}
      {tab === 'watching' ? <View style={{ marginTop: space(3) }}><TitleList items={lists('watching')} navigation={navigation} empty="Nothing in progress. Mark something Watching from its page." /></View> : null}
      {tab === 'want' ? (
        <View style={{ marginTop: space(3) }}>
          <Small>{profile.shareWantList ? 'Friends can see this list.' : 'Only you can see this list. You can share it in Settings.'}</Small>
          <TitleList items={lists('want')} navigation={navigation} empty="Save things friends recommend with Want to watch." />
        </View>
      ) : null}
      {tab === 'done' ? (
        <View style={{ marginTop: space(3) }}>
          <Section title="Finished" style={{ marginTop: 0 }}><TitleList items={lists('finished')} navigation={navigation} empty="Nothing finished yet." /></Section>
          <Section title="Gave up"><TitleList items={lists('abandoned')} navigation={navigation} empty="Nothing abandoned. Good for you." /></Section>
        </View>
      ) : null}
    </Screen>
  );
}
