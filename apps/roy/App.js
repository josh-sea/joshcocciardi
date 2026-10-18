import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Screens
import Grid from "./components/grid";
import Login from "./admin/login";
import Signup from "./admin/signup";
import Games from "./components/games";
import SoloMode from "./components/soloMode";
import Friends from "./components/Friends";
import Profile from "./components/Profile";
import { useSession, UserContext } from "./admin/session";
import { refreshWebPush } from "./admin/webPush";

const Stack = createNativeStackNavigator();

const slideIn = { animation: 'slide_from_right', animationDuration: 300 };
const slideUp = { animation: 'slide_from_bottom', animationDuration: 300 };

// Every screen gets a URL, so on the web the browser history matches the
// stack: the back button, the iOS edge swipe and a refresh all land where
// you'd expect.
const linking = {
  prefixes: [],
  config: {
    screens: {
      Login: '',
      Signup: 'signup',
      Demo: 'practice',
      Games: 'games',
      Grid: 'game/:gameId',
      Solo: 'solo',
      Friends: 'friends',
      Profile: 'profile',
    },
  },
};

// Configure notifications for iOS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const App = () => {
  const session = useSession();
  const [fontsLoaded] = useFonts({
    "PressStart2P-Regular": require("./assets/PressStart2P-Regular.ttf"),
  });

  useEffect(() => {
    // Configure notifications for Android
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  }, []);

  const { status, user } = session;

  // Keep this device's web push token current once someone is playing.
  useEffect(() => {
    if (status === "ready" && Platform.OS === "web") refreshWebPush(user.uid);
  }, [status, user?.uid]);
  if (!fontsLoaded || status === "loading") {
    return null;
  }

  return (
    <UserContext.Provider value={user}>
      <NavigationContainer linking={linking}>
        <Stack.Navigator
          screenOptions={{
            gestureEnabled: false,
            headerShown: false,
            contentStyle: {
              backgroundColor: '#f5f5f5',
            },
            animation: 'fade',
            animationDuration: 200,
          }}
        >
          {status === "ready" ? (
            <>
              <Stack.Screen name="Games" component={Games} />
              <Stack.Screen
                name="Grid"
                component={Grid}
                options={{
                  gestureEnabled: true,
                  animation: 'slide_from_right',
                  animationDuration: 300,
                }}
              />
              <Stack.Screen name="Solo" component={SoloMode} options={slideUp} />
              <Stack.Screen name="Friends" component={Friends} options={slideIn} />
              <Stack.Screen name="Profile" component={Profile} options={slideIn} />
            </>
          ) : status === "needsProfile" ? (
            // Signed in (Google, or an account from another app) but no Roy
            // profile yet: just pick a username.
            <Stack.Screen name="Signup" component={Signup} />
          ) : (
            <>
              <Stack.Screen name="Login" component={Login} />
              <Stack.Screen name="Signup" component={Signup} options={slideIn} />
              <Stack.Screen name="Demo" component={SoloMode} options={slideUp} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </UserContext.Provider>
  );
};

export default App;
