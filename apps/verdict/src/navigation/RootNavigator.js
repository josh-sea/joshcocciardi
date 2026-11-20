import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NavigationContainer, DarkTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { usePush } from '../hooks/usePush';
import { colors } from '../constants/theme';
import { Loading } from '../components/ui';
import { Welcome, SignUp, LogIn, Forgot } from '../screens/Auth';
import { OnboardUsername, OnboardServices, OnboardQuickRate, OnboardFriends } from '../screens/Onboarding';
import Feed from '../screens/Feed';
import Discover, { AddTitle } from '../screens/Discover';
import Friends from '../screens/Friends';
import FriendProfile, { Profile } from '../screens/People';
import TitleDetail, { RateSheet, Breakdown, History } from '../screens/Title';
import Settings, { RedeemInvite } from '../screens/Settings';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent },
};

const stackOpts = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerBackTitle: 'Back',
  contentStyle: { backgroundColor: colors.bg },
};

const AddButton = () => (
  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
    <Ionicons name="add" size={30} color={colors.accentText} />
  </View>
);

function Tabs() {
  const { incoming } = useApp();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size, focused }) => {
          const icons = { FeedTab: 'home', DiscoverTab: 'compass', FriendsTab: 'people', ProfileTab: 'person-circle' };
          return <Ionicons name={focused ? icons[route.name] : `${icons[route.name]}-outline`} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="FeedTab" component={Feed} options={{ title: 'Feed' }} />
      <Tab.Screen name="DiscoverTab" component={Discover} options={{ title: 'Discover' }} />
      <Tab.Screen
        name="AddTab" component={View}
        options={{ title: '', tabBarIcon: () => <AddButton />, tabBarAccessibilityLabel: 'Rate something' }}
        listeners={({ navigation }) => ({ tabPress: (e) => { e.preventDefault(); navigation.navigate('Add'); } })}
      />
      <Tab.Screen name="FriendsTab" component={Friends} options={{ title: 'Friends', tabBarBadge: incoming.length || undefined, tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.accentText } }} />
      <Tab.Screen name="ProfileTab" component={Profile} options={{ title: 'You' }} />
    </Tab.Navigator>
  );
}

// Jump to the invite screen once a verdict://invite link has arrived and
// the person is signed in and set up.
function InviteWatcher() {
  const navigation = useNavigation();
  const { pendingInvite } = useApp();
  useEffect(() => {
    if (pendingInvite) navigation.navigate('RedeemInvite', { code: pendingInvite });
  }, [pendingInvite, navigation]);
  return null;
}

function Main() {
  const { user } = useApp();
  usePush(user && user.uid);
  return (
    <>
      <Stack.Navigator screenOptions={stackOpts}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Title" component={TitleDetail} options={{ title: '' }} />
        <Stack.Screen name="FriendProfile" component={FriendProfile} options={{ title: '' }} />
        <Stack.Screen name="Settings" component={Settings} />
        <Stack.Screen name="History" component={History} options={{ title: 'Verdict history' }} />
        <Stack.Group screenOptions={{ presentation: 'modal', headerShown: false }}>
          <Stack.Screen name="Add" component={AddTitle} options={{ headerShown: true, title: 'Rate something' }} />
          <Stack.Screen name="Rate" component={RateSheet} />
          <Stack.Screen name="Breakdown" component={Breakdown} />
          <Stack.Screen name="RedeemInvite" component={RedeemInvite} />
        </Stack.Group>
      </Stack.Navigator>
      <InviteWatcher />
    </>
  );
}

export default function RootNavigator() {
  const { user, profile } = useApp();
  let body;
  if (user === undefined || (user && profile === undefined)) body = <Loading />;
  else if (!user) {
    body = (
      <Stack.Navigator screenOptions={{ ...stackOpts, title: '' }}>
        <Stack.Screen name="Welcome" component={Welcome} options={{ headerShown: false }} />
        <Stack.Screen name="SignUp" component={SignUp} />
        <Stack.Screen name="LogIn" component={LogIn} />
        <Stack.Screen name="Forgot" component={Forgot} />
      </Stack.Navigator>
    );
  } else if (!profile || !profile.username || !profile.onboarded) {
    body = (
      <Stack.Navigator screenOptions={{ ...stackOpts, headerShown: false }} initialRouteName={profile && profile.username ? 'OnboardServices' : 'OnboardUsername'}>
        <Stack.Screen name="OnboardUsername" component={OnboardUsername} />
        <Stack.Screen name="OnboardServices" component={OnboardServices} />
        <Stack.Screen name="OnboardQuickRate" component={OnboardQuickRate} />
        <Stack.Screen name="OnboardFriends" component={OnboardFriends} />
      </Stack.Navigator>
    );
  } else body = <Main />;
  return <NavigationContainer theme={theme}>{body}</NavigationContainer>;
}
