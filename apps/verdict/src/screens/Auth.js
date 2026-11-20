import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Button, ErrorText, Field, H, P, Screen, Small } from '../components/ui';
import { colors, space } from '../constants/theme';

const friendly = (err) => {
  const code = err && err.code;
  const map = {
    'auth/invalid-email': "That email address doesn't look right.",
    'auth/email-already-in-use': 'There is already an account with that email. Log in instead.',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/wrong-password': 'Email or password is wrong.',
    'auth/user-not-found': 'Email or password is wrong.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/network-request-failed': "Can't reach the server. Check your connection.",
  };
  return new Error(map[code] || (err && err.message) || 'Something went wrong.');
};

const Wrap = ({ children }) => (
  <Screen>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space(6), justifyContent: 'center' }}>
      {children}
    </KeyboardAvoidingView>
  </Screen>
);

export function Welcome({ navigation }) {
  return (
    <Wrap>
      <Text style={{ fontSize: 56, textAlign: 'center' }}>👍 😐 👎</Text>
      <H style={{ textAlign: 'center', marginTop: space(4), fontSize: 40 }}>Verdict</H>
      <P style={{ textAlign: 'center', marginTop: space(3), color: colors.muted }}>
        What should you watch next? Ask the people you actually trust. See what your friends recommend, what they think is just fine, and what to skip.
      </P>
      <View style={{ marginTop: space(10) }}>
        <Button title="Create an account" onPress={() => navigation.navigate('SignUp')} />
        <Button title="Log in" kind="ghost" style={{ marginTop: space(3) }} onPress={() => navigation.navigate('LogIn')} />
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

  return (
    <Wrap>
      <H>Create your account</H>
      <Small style={{ marginBottom: space(6), marginTop: space(2) }}>Your email stays private. Friends only see your username and name.</Small>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" hint="At least 8 characters." />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" onSubmitEditing={submit} />
      <ErrorText error={error} />
      <Button title="Sign up" onPress={submit} loading={busy} disabled={!email || !password} />
      <Button title="I already have an account" kind="ghost" style={{ marginTop: space(3) }} onPress={() => navigation.replace('LogIn')} />
    </Wrap>
  );
}

export function LogIn({ navigation }) {
  const [email, setEmail] = useState('');
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
      <Small style={{ marginTop: space(2), marginBottom: space(6) }}>We'll email you a link to choose a new one.</Small>
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
