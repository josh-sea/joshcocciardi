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
import Demo from "./components/demo";
import SoloMode from "./components/soloMode";
import Friends from "./components/Friends";
import Profile from "./components/Profile";

const Stack = createNativeStackNavigator();

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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer>
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
        <Stack.Screen 
          name="Login" 
          component={Login}
        />
        <Stack.Screen 
          name="Games" 
          component={Games}
        />
        <Stack.Screen 
          name="Grid" 
          component={Grid}
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen 
          name="Demo" 
          component={SoloMode}
          options={{
            animation: 'slide_from_bottom',
            animationDuration: 300,
          }}
        />
        <Stack.Screen 
          name="Solo" 
          component={SoloMode}
          options={{
            animation: 'slide_from_bottom',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="Signup"
          component={Signup}
          options={{
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="Friends"
          component={Friends}
          options={{
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="Profile"
          component={Profile}
          options={{
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
