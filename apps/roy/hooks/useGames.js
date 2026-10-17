import { useState, useEffect, useRef } from 'react';
import { onValue, set } from 'firebase/database';
import { royRef } from '../admin/firebaseConfig';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;

  // Expo push tokens are native-only. Web push (FCM, installed PWA) is wired
  // separately; until then the web build simply skips registration.
  if (Platform.OS === 'web') return;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: '7137a7b5-196c-481f-911c-2a052519dc7d',
    })).data;
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export function useGames(userId) {
  const [games, setGames] = useState([]);
  const [activeGameCount, setActiveGameCount] = useState(0);
  const [pushToken, setPushToken] = useState('');
  const gamesRef = useRef(null);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Register for push notifications
    registerForPushNotificationsAsync().then(token => setPushToken(token));

    // Set up notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Handle received notification
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // Handle notification response (when user taps notification)
      console.log('Notification response:', response);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (pushToken) {
      // Store the push token in the user's profile
      const userTokenRef = royRef(`/users/${userId}/pushToken`);
      set(userTokenRef, pushToken);
    }
  }, [pushToken, userId]);

  useEffect(() => {
    const fetchUserGames = async () => {
      try {
        gamesRef.current = royRef("/games");
        const unsubscribe = onValue(gamesRef.current, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            const gamesArray = [];
            
            for (let key in data) {
              const game = data[key];
              const gameKey = key;
              const turn = game.turn;
              
              if (game.player1 === userId || game.player2 === userId) {
                const whichPlayer = game.player1 === userId ? 1 : 2;
                const myTurn = whichPlayer === turn;
                
                gamesArray.push({ 
                  myTurn, 
                  gameId: gameKey, 
                  ...game 
                });

              }
            }
            setGames(gamesArray);

            // Count active games (games not yet won by either player)
            const activeCount = gamesArray.filter((game) => {
              if (!game.grid) return true; // No moves yet = active
              const gridValues = Object.values(game.grid);
              const p1Score = gridValues.filter((c) => c === 1).length;
              const p2Score = gridValues.filter((c) => c === 5).length;
              const boardSize = game.boardSize || "10x10";
              const winAt = boardSize === "5x5" ? 13 : boardSize === "15x15" ? 113 : 51;
              return p1Score < winAt && p2Score < winAt;
            }).length;
            setActiveGameCount(activeCount);
          }
        });

        return () => unsubscribe();
      } catch (error) {
        console.error("Error fetching user games:", error);
      }
    };

    fetchUserGames();
  }, [userId]);

  return { games, activeGameCount };
}
