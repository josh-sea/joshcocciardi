import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Share, Text, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from '../context/AppContext';
import { acceptRequest, inviteCode, inviteLink, prettyCode, redeemInvite, removeConnection, searchUsers, sendRequest } from '../api/social';
import { Button, Divider, Empty, ErrorText, Field, H, Screen, Segmented, Section, Small } from '../components/ui';
import PersonRow from '../components/PersonRow';
import { colors, radius, space, type } from '../constants/theme';

function ConnectButton({ uid, state, onDone }) {
  const { user } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onDone && onDone(); } catch { /* the list refreshes on its own */ }
    setBusy(false);
  };
  if (state === 'friends') return <Small>Friends</Small>;
  if (state === 'pending_out') return <Button small kind="ghost" title="Requested" loading={busy} onPress={() => run(() => removeConnection(user.uid, uid))} />;
  if (state === 'pending_in') return <Button small title="Accept" loading={busy} onPress={() => run(() => acceptRequest(user.uid, uid))} />;
  return <Button small title="Add" icon="person-add" loading={busy} onPress={() => run(() => sendRequest(user.uid, uid, 'search'))} />;
}

export function InviteCard() {
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { inviteCode().then(setCode).catch(setError); }, []);
  if (error) return <ErrorText error={error} />;
  if (!code) return <ActivityIndicator color={colors.accent} />;
  const link = inviteLink(code);
  const message = `Join me on Verdict so we can trade movie and show recommendations. Open ${link} or enter my invite code ${prettyCode(code)}.`;
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), alignItems: 'center' }}>
      <View style={{ backgroundColor: '#fff', padding: 10, borderRadius: radius.md }}>
        <QRCode value={link} size={150} />
      </View>
      <Small style={{ marginTop: space(3) }}>Your invite code</Small>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: 3, marginTop: 2 }}>{prettyCode(code)}</Text>
      <Small style={{ textAlign: 'center', marginTop: space(2) }}>Anyone with this can send you a request. You still approve it.</Small>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: space(4), alignSelf: 'stretch' }}>
        <Button title="Share" icon="share-outline" style={{ flex: 1 }} onPress={() => Share.share({ message })} />
        <Button
          title={copied ? 'Copied' : 'Copy'} icon="copy-outline" kind="secondary" style={{ flex: 1 }}
          onPress={async () => { await Clipboard.setStringAsync(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        />
      </View>
      <Pressable onPress={async () => setCode(await inviteCode(true))} style={{ marginTop: space(3) }}>
        <Small style={{ color: colors.faint }}>Make a new code (the old one stops working)</Small>
      </Pressable>
    </View>
  );
}

export function RedeemCode() {
  const navigation = useNavigation();
  const { rememberPerson } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await redeemInvite(code);
      rememberPerson(r.profile);
      setResult(r);
      setCode('');
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  return (
    <View>
      <Field label="Have an invite code?" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="ABCD-2345" onSubmitEditing={submit} />
      <ErrorText error={error} />
      {result ? (
        <Pressable onPress={() => navigation.navigate('FriendProfile', { uid: result.profile.uid })}>
          <Small style={{ color: colors.up, marginBottom: space(3) }}>
            {result.connection === 'friends' ? `You and ${result.profile.displayName} are now friends.` : `Request sent to ${result.profile.displayName}.`}
          </Small>
        </Pressable>
      ) : null}
      <Button title="Use code" kind="secondary" small onPress={submit} loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 8} />
    </View>
  );
}

// Search by username plus the invite card. Used here and in onboarding.
export function FindPeople() {
  const navigation = useNavigation();
  const { stateOf, rememberPerson } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim().replace(/^@/, '');
    if (term.length < 2) { setResults([]); return undefined; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const r = await searchUsers(term);
        r.forEach(rememberPerson);
        setResults(r);
      } catch (err) { setError(err); }
      setBusy(false);
    }, 350);
    return () => clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <View>
      <Field placeholder="Search by username" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      <ErrorText error={error} />
      {results.map((p) => (
        <PersonRow
          key={p.uid} person={p}
          onPress={() => navigation.navigate('FriendProfile', { uid: p.uid })}
          right={<ConnectButton uid={p.uid} state={stateOf(p.uid) === 'none' ? p.connection : stateOf(p.uid)} />}
        />
      ))}
      {q.trim().length >= 2 && !busy && !results.length && !error ? (
        <Small>No one by that username. Private accounts don't show up in search; ask them for their invite code.</Small>
      ) : null}
      <Section title="Invite someone"><InviteCard /></Section>
      <Section title="Got a code from a friend?"><RedeemCode /></Section>
    </View>
  );
}

export default function Friends({ navigation, route }) {
  const { friends, incoming, outgoing, person, prefs } = useApp();
  const [tab, setTab] = useState((route.params && route.params.tab) || 'friends');
  useEffect(() => { if (route.params && route.params.tab) setTab(route.params.tab); }, [route.params]);

  const sorted = useMemo(() => [...friends].sort((a, b) => {
    const s = (prefs.starred[b] ? 1 : 0) - (prefs.starred[a] ? 1 : 0);
    return s || (person(a).displayName || '').localeCompare(person(b).displayName || '');
  }), [friends, prefs, person]);

  return (
    <Screen scroll>
      <H style={{ marginBottom: space(4) }}>Friends</H>
      <Segmented
        value={tab} onChange={setTab} style={{ marginBottom: space(4) }}
        options={[
          { value: 'friends', label: `Friends${friends.length ? ` ${friends.length}` : ''}` },
          { value: 'requests', label: 'Requests', badge: incoming.length || null },
          { value: 'find', label: 'Find' },
        ]}
      />
      {tab === 'friends' ? (
        sorted.length ? (
          <View>
            <Small style={{ marginBottom: space(2) }}>Only you can see this list. ⭐ and 🔇 are private too.</Small>
            {sorted.map((uid) => (
              <PersonRow
                key={uid} person={person(uid)} starred={prefs.starred[uid]} muted={prefs.muted[uid]}
                onPress={() => navigation.navigate('FriendProfile', { uid })}
              />
            ))}
          </View>
        ) : (
          <Empty icon="people-outline" title="No friends yet" body="Verdict works best with a handful of people whose taste you trust.">
            <Button title="Find friends" onPress={() => setTab('find')} />
          </Empty>
        )
      ) : null}
      {tab === 'requests' ? (
        <View>
          {incoming.length ? <Text style={[type.h3, { marginBottom: space(2) }]}>Waiting on you</Text> : null}
          {incoming.map((uid) => (
            <PersonRow key={uid} person={person(uid)} onPress={() => navigation.navigate('FriendProfile', { uid })}
              right={<RequestButtons uid={uid} />} />
          ))}
          {incoming.length && outgoing.length ? <Divider /> : null}
          {outgoing.length ? <Text style={[type.h3, { marginBottom: space(2) }]}>Sent</Text> : null}
          {outgoing.map((uid) => (
            <PersonRow key={uid} person={person(uid)} onPress={() => navigation.navigate('FriendProfile', { uid })}
              right={<ConnectButton uid={uid} state="pending_out" />} />
          ))}
          {!incoming.length && !outgoing.length ? <Empty icon="mail-outline" title="No requests" body="Requests you send and receive show up here." /> : null}
        </View>
      ) : null}
      {tab === 'find' ? <FindPeople /> : null}
    </Screen>
  );
}

function RequestButtons({ uid }) {
  const { user } = useApp();
  const [busy, setBusy] = useState(null);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Button small title="Accept" loading={busy === 'a'} onPress={async () => { setBusy('a'); await acceptRequest(user.uid, uid).catch(() => {}); setBusy(null); }} />
      <Button small kind="ghost" title="Decline" loading={busy === 'd'} onPress={async () => { setBusy('d'); await removeConnection(user.uid, uid).catch(() => {}); setBusy(null); }} />
    </View>
  );
}

export { ConnectButton };
