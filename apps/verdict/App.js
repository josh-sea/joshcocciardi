import React, { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import { parseInviteUrl } from './src/lib/verdict';

// verdict://invite/CODE links are held until the person is signed in and
// onboarded, then the main stack opens the invite screen.
function InviteLinks() {
  const { setPendingInvite } = useApp();
  useEffect(() => {
    const take = (url) => { const code = parseInviteUrl(url); if (code) setPendingInvite(code); };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, [setPendingInvite]);
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <InviteLinks />
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
