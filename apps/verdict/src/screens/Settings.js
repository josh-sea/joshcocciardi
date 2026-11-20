import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import Constants from 'expo-constants';
import { auth } from '../firebase';
import { useApp } from '../context/AppContext';
import * as dialog from '../lib/dialog';
import { updateProfile, deleteAccount } from '../api/profile';
import { blockedList, unblockUser, redeemInvite } from '../api/social';
import { setPushEnabled } from '../api/prefs';
import { Button, Divider, ErrorText, Field, H, Screen, Section, Small } from '../components/ui';
import ServicesPicker from '../components/ServicesPicker';
import PersonRow from '../components/PersonRow';
import { colors, space, type } from '../constants/theme';

const Row = ({ label, hint, value, onChange }) => (
  <View style={{ marginBottom: space(4) }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={[type.h3, { flex: 1, marginRight: space(3) }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
    </View>
    {hint ? <Small style={{ marginTop: 4 }}>{hint}</Small> : null}
  </View>
);

export default function Settings({ navigation }) {
  const { user, profile } = useApp();
  const [name, setName] = useState(profile.displayName || '');
  const [savedName, setSavedName] = useState(false);
  const [services, setServices] = useState(profile.services || []);
  const [blocked, setBlocked] = useState([]);
  const [pushOn, setPushOn] = useState(true);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { blockedList().then(setBlocked).catch(() => {}); }, []);

  const patch = (p) => updateProfile(user.uid, p).catch(setError);

  const saveServices = (s) => { setServices(s); patch({ services: s }); };

  const changePassword = async () => {
    setPwMsg(null);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw.current));
      await updatePassword(user, pw.next);
      setPw({ current: '', next: '' });
      setPwMsg('Password changed.');
    } catch (err) {
      setPwMsg(err.code === 'auth/weak-password' ? 'Use at least 8 characters.' : 'Current password is wrong.');
    }
  };

  const confirmDelete = async () => {
    const v = await dialog.prompt(
      'Delete your Verdict account?',
      `This removes your ratings, lists, friends and profile for good. Type your username (${profile.username}) to confirm.`,
    );
    if (v === null) return;
    if (v === '__confirmed__' || String(v).trim().toLowerCase().replace(/^@/, '') === profile.username) doDelete();
    else dialog.alert("That didn't match", 'Nothing was deleted.');
  };

  async function doDelete() {
    try {
      await deleteAccount();
      await signOut(auth);
    } catch (err) {
      dialog.alert('Could not delete', err.message);
    }
  }

  return (
    <Screen scroll edges={[]}>
      <ErrorText error={error} />
      <Section title="Profile" style={{ marginTop: 0 }}>
        <Field label="Display name" value={name} onChangeText={(v) => { setName(v); setSavedName(false); }} maxLength={40}
          onEndEditing={async () => { if (name.trim() && name.trim() !== profile.displayName) { await patch({ displayName: name.trim() }); setSavedName(true); } }}
          hint={savedName ? 'Saved.' : `Username: @${profile.username} (can't be changed)`} />
      </Section>

      <Section title="Privacy">
        <Row label="Let people find me by username" value={profile.discoverable !== false} onChange={(v) => patch({ discoverable: v })}
          hint={profile.discoverable !== false ? 'You show up in search.' : "You don't show up in search. People need your invite code."} />
        <Row label="Show my Want to watch list to friends" value={Boolean(profile.shareWantList)} onChange={(v) => patch({ shareWantList: v })} />
        <Small>Your friend list is never shown to anyone. Profiles only show how many friends you have in common.</Small>
        {blocked.length ? (
          <View style={{ marginTop: space(4) }}>
            <Text style={[type.h3, { marginBottom: space(2) }]}>Blocked</Text>
            {blocked.map((p) => (
              <PersonRow key={p.uid} person={p} right={<Button small kind="ghost" title="Unblock" onPress={async () => { await unblockUser(p.uid); setBlocked(blocked.filter((b) => b.uid !== p.uid)); }} />} />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Your services">
        <Small style={{ marginBottom: space(3) }}>Highlighted on every title, and used by "Only on my services" in Discover.</Small>
        <ServicesPicker value={services} onChange={saveServices} limit={30} />
      </Section>

      <Section title="Notifications">
        <Row label="Friend requests" hint="When someone sends you a request or accepts yours." value={pushOn} onChange={(v) => { setPushOn(v); setPushEnabled(user.uid, v).catch(() => {}); }} />
      </Section>

      <Section title="Account">
        <Small style={{ marginBottom: space(3) }}>Signed in as {user.email}</Small>
        <Field label="Current password" value={pw.current} onChangeText={(v) => setPw({ ...pw, current: v })} secureTextEntry />
        <Field label="New password" value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v })} secureTextEntry hint={pwMsg || 'At least 8 characters.'} />
        <Button title="Change password" kind="secondary" small onPress={changePassword} disabled={!pw.current || pw.next.length < 8} />
        <Divider />
        <Button title="Sign out" kind="ghost" onPress={() => signOut(auth)} />
        <Button title="Delete account" kind="danger" style={{ marginTop: space(3) }} onPress={confirmDelete} />
      </Section>

      <Section title="About">
        <Small>This product uses the TMDB API but is not endorsed or certified by TMDB.</Small>
        <Small style={{ marginTop: space(2) }}>Streaming availability provided by JustWatch.</Small>
        <Pressable onPress={() => Linking.openURL('https://www.themoviedb.org')}><Small style={{ color: colors.accent, marginTop: space(2) }}>themoviedb.org</Small></Pressable>
        <Small style={{ marginTop: space(3), color: colors.faint }}>Verdict {Constants.expoConfig && Constants.expoConfig.version}</Small>
      </Section>
    </Screen>
  );
}

// Opened from an invite link (.../invite/CODE).
export function RedeemInvite({ route, navigation }) {
  const { setPendingInvite, rememberPerson } = useApp();
  const code = route.params && route.params.code;
  const [state, setState] = useState({ busy: true });
  useEffect(() => {
    setPendingInvite(null);
    redeemInvite(code)
      .then((r) => { rememberPerson(r.profile); setState({ result: r }); })
      .catch((error) => setState({ error }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return (
    <Screen scroll edges={['bottom']}>
      <H style={{ fontSize: 24 }}>Invite</H>
      {state.busy ? <Small style={{ marginTop: space(3) }}>Checking the code…</Small> : null}
      <ErrorText error={state.error} />
      {state.result ? (
        <View style={{ marginTop: space(4) }}>
          <PersonRow person={state.result.profile} />
          <Small style={{ marginVertical: space(3) }}>
            {state.result.connection === 'friends'
              ? `You and ${state.result.profile.displayName} are friends now.`
              : `Request sent. Once ${state.result.profile.displayName} accepts, you'll see each other's verdicts.`}
          </Small>
          <Button title="View profile" onPress={() => navigation.replace('FriendProfile', { uid: state.result.profile.uid })} />
        </View>
      ) : null}
      <Button title="Close" kind="ghost" style={{ marginTop: space(4) }} onPress={() => navigation.goBack()} />
    </Screen>
  );
}
