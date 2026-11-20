import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Switch, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { checkUsername, claimUsername, updateProfile } from '../api/profile';
import { trending } from '../api/tmdb';
import { saveRating } from '../api/ratings';
import { useAsync } from '../hooks/useAsync';
import { Button, ErrorText, Field, H, P, Screen, Small, Loading } from '../components/ui';
import ServicesPicker from '../components/ServicesPicker';
import RatingButtons from '../components/RatingButtons';
import Poster from '../components/Poster';
import { FindPeople } from './Friends';
import { colors, space, type } from '../constants/theme';

const Step = ({ n, children }) => (
  <Text style={[type.tiny, { color: colors.accent, fontWeight: '800', marginBottom: space(2) }]}>STEP {n} OF 4{children}</Text>
);

export function OnboardUsername({ navigation }) {
  const { profile } = useApp();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [discoverable, setDiscoverable] = useState(true);
  const [status, setStatus] = useState(null); // { available, reason }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (profile && profile.username) navigation.replace('OnboardServices');
  }, [profile, navigation]);

  const onName = (v) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    setUsername(clean);
    setStatus(null);
    clearTimeout(timer.current);
    if (clean.length < 3) return;
    timer.current = setTimeout(async () => {
      try { setStatus(await checkUsername(clean)); } catch { /* checked again on submit */ }
    }, 400);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await claimUsername(username, displayName.trim() || username);
      if (!res.ok) {
        setStatus(res);
        setBusy(false);
        return;
      }
      // The profile listener sees the new username and moves on (effect above).
      await updateProfile(profile.uid, { discoverable });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Step n={1} />
        <H>Pick a username</H>
        <Small style={{ marginTop: space(2), marginBottom: space(6) }}>This is how friends find you. It can't be changed later.</Small>
        <Field
          label="Username" value={username} onChangeText={onName} autoCapitalize="none" autoCorrect={false}
          placeholder="e.g. josh.c" maxLength={20}
          error={status && !status.available ? status.reason : null}
          hint={status && status.available ? `@${username} is available` : '3 to 20 letters, numbers, dots or underscores.'}
        />
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="What friends see" maxLength={40} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2) }}>
          <Text style={type.h3}>Let people find me by username</Text>
          <Switch value={discoverable} onValueChange={setDiscoverable} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
        </View>
        <Small style={{ marginBottom: space(6) }}>
          {discoverable
            ? 'Anyone can search for your username and send a request. You approve every friend.'
            : "You won't show up in search. People can only reach you with your invite link or code, and you still approve every friend."}
        </Small>
        <ErrorText error={error} />
        <Button title="Continue" onPress={submit} loading={busy} disabled={username.length < 3 || (status && !status.available)} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function OnboardServices({ navigation }) {
  const { profile } = useApp();
  const [services, setServices] = useState((profile && profile.services) || []);
  const [busy, setBusy] = useState(false);
  const next = async () => {
    setBusy(true);
    try { await updateProfile(profile.uid, { services }); } catch { /* not critical */ }
    navigation.replace('OnboardQuickRate');
  };
  return (
    <Screen scroll>
      <Step n={2} />
      <H>What do you subscribe to?</H>
      <Small style={{ marginTop: space(2), marginBottom: space(5) }}>We'll highlight where things stream on your services. Change this any time in Settings.</Small>
      <ServicesPicker value={services} onChange={setServices} />
      <Button title={services.length ? 'Continue' : 'Skip for now'} onPress={next} loading={busy} style={{ marginTop: space(6) }} />
    </Screen>
  );
}

export function OnboardQuickRate({ navigation }) {
  const { profile } = useApp();
  const { data, loading, error } = useAsync(() => trending(), []);
  const [done, setDone] = useState({}); // titleKey → rating | 'skip'
  const rated = Object.values(done).filter((v) => v !== 'skip').length;

  const rate = async (t, r) => {
    setDone((d) => ({ ...d, [t.titleKey]: r }));
    if (r !== 'skip') saveRating(profile.uid, t, { rating: r }).catch(() => {});
  };

  if (loading) return <Loading />;
  const items = (data || []).filter((t) => !done[t.titleKey]).slice(0, 1);
  const finished = !items.length || rated >= 10;

  return (
    <Screen>
      <View style={{ padding: space(4), flex: 1 }}>
        <Step n={3} />
        <H>Rate a few you've seen</H>
        <Small style={{ marginTop: space(2) }}>
          Five or more helps us show how your taste lines up with friends'. {rated ? `${rated} rated.` : ''}
        </Small>
        <ErrorText error={error} />
        {finished ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <P style={{ textAlign: 'center' }}>{rated ? `Nice, ${rated} rated.` : 'You can rate anything later from search.'}</P>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(t) => t.titleKey}
            scrollEnabled={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            renderItem={({ item: t }) => (
              <View style={{ alignItems: 'center' }}>
                <Poster path={t.posterPath} width={180} name={t.name} />
                <Text style={[type.h2, { marginTop: space(3), textAlign: 'center' }]}>{t.name}</Text>
                <Small style={{ marginBottom: space(4) }}>{[t.year, t.mediaType === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}</Small>
                <View style={{ alignSelf: 'stretch' }}>
                  <RatingButtons value={null} onChange={(r) => rate(t, r)} />
                  <Button title="Haven't seen it" kind="ghost" small style={{ marginTop: space(3) }} onPress={() => rate(t, 'skip')} />
                </View>
              </View>
            )}
          />
        )}
        <Button title={finished || rated >= 5 ? 'Continue' : 'Skip for now'} kind={finished || rated >= 5 ? 'primary' : 'secondary'} onPress={() => navigation.replace('OnboardFriends')} />
      </View>
    </Screen>
  );
}

export function OnboardFriends() {
  const { profile } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Screen scroll>
      <Step n={4} />
      <H>Bring your people</H>
      <Small style={{ marginTop: space(2), marginBottom: space(4) }}>Verdict is only as good as the friends on it. Search for them, or send your invite.</Small>
      <FindPeople />
      <Button
        title="Done" loading={busy} style={{ marginTop: space(6) }}
        onPress={async () => { setBusy(true); await updateProfile(profile.uid, { onboarded: true }).catch(() => setBusy(false)); }}
      />
    </Screen>
  );
}
