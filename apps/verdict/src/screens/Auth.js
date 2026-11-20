import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
} from 'firebase/auth';
import { auth } from '../firebase';
import { Button, ErrorText, Field, H, P, Screen, Small } from '../components/ui';
import { colors, space } from '../constants/theme';

const WRONG = "Email or password is wrong. If you made your account with Google, use Continue with Google instead, or reset your password below.";

// Verdict shares its sign-in with the other apps on joshcocciardi.com, so an
// email can already have an account from one of them. The same login works.
const ALREADY = 'already-in-use';

// Google sign-in, web only for now. On a phone it needs native Google client
// IDs, which come with the app-store builds.
export const googleAvailable = Platform.OS === 'web';
if (googleAvailable) getRedirectResult(auth).catch(() => {});

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Popups are often blocked on phones and in home-screen apps.
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

function GoogleButton({ onError, style }) {
  const [busy, setBusy] = useState(false);
  if (!googleAvailable) return null;
  return (
    <Button
      title="Continue with Google" icon="logo-google" kind="secondary" loading={busy} style={style}
      onPress={async () => {
        setBusy(true);
        onError && onError(null);
        try { await signInWithGoogle(); } catch (err) { onError && onError(friendly(err)); setBusy(false); }
      }}
    />
  );
}

const Or = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: space(4) }}>
    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    <Small style={{ marginHorizontal: space(3) }}>or</Small>
    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
  </View>
);

const friendly = (err) => {
  const code = err && err.code;
  const map = {
    'auth/invalid-email': "That email address doesn't look right.",
    'auth/email-already-in-use': 'already-in-use',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/invalid-credential': WRONG,
    'auth/wrong-password': WRONG,
    'auth/user-not-found': WRONG,
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/cancelled-popup-request': 'Google sign-in was closed before it finished.',
    'auth/unauthorized-domain': "Google sign-in isn't enabled for this address yet.",
    'auth/account-exists-with-different-credential': 'That email already has an account. Log in with your password, then try Google again.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/network-request-failed': "Can't reach the server. Check your connection.",
  };
  return new Error(map[code] || (err && err.message) || 'Something went wrong.');
};

const Wrap = ({ children }) => (
  <Screen>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space(6), justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>
);

export function Welcome({ navigation }) {
  const [error, setError] = useState(null);
  return (
    <Wrap>
      <Text style={{ fontSize: 56, textAlign: 'center' }}>👍 😐 👎</Text>
      <H style={{ textAlign: 'center', marginTop: space(4), fontSize: 40 }}>Verdict</H>
      <P style={{ textAlign: 'center', marginTop: space(3), color: colors.muted }}>
        What should you watch next? Ask the people you actually trust. See what your friends recommend, what they think is just fine, and what to skip.
      </P>
      <View style={{ marginTop: space(10) }}>
        {googleAvailable ? (
          <>
            <GoogleButton onError={setError} />
            <ErrorText error={error} />
            <Or />
          </>
        ) : null}
        <Button title="Create an account" onPress={() => navigation.navigate('SignUp')} />
        <Button title="Log in with email" kind="ghost" style={{ marginTop: space(3) }} onPress={() => navigation.navigate('LogIn')} />
        <Small style={{ textAlign: 'center', marginTop: space(4) }}>
          Already use another app on joshcocciardi.com? The same login works here.
        </Small>
      </View>
    </Wrap>
  );
}

export function SignUp({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError(new Error('Use at least 8 characters for your password.'));
    if (password !== confirm) return setError(new Error("The passwords don't match."));
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(friendly(err));
      setBusy(false);
    }
  };

  const exists = error && error.message === ALREADY;

  return (
    <Wrap>
      <H>Create your account</H>
      <Small style={{ marginBottom: space(6), marginTop: space(2) }}>Your email stays private. Friends only see your username and name.</Small>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" hint="At least 8 characters." />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" onSubmitEditing={submit} />
      {exists ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, padding: space(4), marginBottom: space(4) }}>
          <P style={{ fontWeight: '700' }}>You already have an account</P>
          <Small style={{ marginTop: 4 }}>
            {email.trim()} is signed up through another app on joshcocciardi.com. Verdict uses the same login, so sign in with it{googleAvailable ? ', or with Google if that is how you made it' : ''}. Forgot the password? You can reset it.
          </Small>
          <Button title="Log in instead" style={{ marginTop: space(3) }} onPress={() => navigation.replace('LogIn', { email: email.trim() })} />
          {googleAvailable ? <GoogleButton style={{ marginTop: space(2) }} onError={setError} /> : null}
          <Button title="Reset my password" kind="ghost" small style={{ marginTop: space(2) }} onPress={() => navigation.navigate('Forgot', { email: email.trim() })} />
        </View>
      ) : <ErrorText error={error} />}
      <Button title="Sign up" onPress={submit} loading={busy} disabled={!email || !password} />
      {googleAvailable ? (<><Or /><GoogleButton onError={setError} /></>) : null}
      <Button title="I already have an account" kind="ghost" style={{ marginTop: space(3) }} onPress={() => navigation.replace('LogIn', { email: email.trim() })} />
    </Wrap>
  );
}

export function LogIn({ navigation, route }) {
  const [email, setEmail] = useState((route.params && route.params.email) || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(friendly(err));
      setBusy(false);
    }
  };

  return (
    <Wrap>
      <H style={{ marginBottom: space(6) }}>Welcome back</H>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={submit} />
      <ErrorText error={error} />
      <Button title="Log in" onPress={submit} loading={busy} disabled={!email || !password} />
      <Button title="Forgot password?" kind="ghost" style={{ marginTop: space(3) }} onPress={() => navigation.navigate('Forgot', { email })} />
      {googleAvailable ? (<><Or /><GoogleButton onError={setError} /></>) : null}
      <Small style={{ textAlign: 'center', marginTop: space(4) }}>Use the same login as your other joshcocciardi.com apps.</Small>
    </Wrap>
  );
}

export function Forgot({ route }) {
  const [email, setEmail] = useState((route.params && route.params.email) || '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err) {
      setError(friendly(err));
    }
    setBusy(false);
  };

  return (
    <Wrap>
      <H>Reset your password</H>
      <Small style={{ marginTop: space(2), marginBottom: space(6) }}>We'll email you a link to choose a new one. This also works if you made your account with Google and want a password too.</Small>
      {sent ? (
        <P>Check {email} for the reset link. It can take a minute to arrive.</P>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" onSubmitEditing={submit} />
          <ErrorText error={error} />
          <Button title="Send reset link" onPress={submit} loading={busy} disabled={!email} />
        </>
      )}
    </Wrap>
  );
}
