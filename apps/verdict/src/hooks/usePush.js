import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { savePushToken } from '../api/prefs';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Ask once for notification permission and store this phone's Expo token.
// Only friend requests and accepts are sent in v1.
export function usePush(uid) {
  useEffect(() => {
    if (!uid || Platform.OS === 'web' || !Device.isDevice) return;
    (async () => {
      try {
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
        if (status !== 'granted') return;
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        if (data) await savePushToken(uid, data);
      } catch (err) {
        console.log('Push setup skipped:', err.message);
      }
    })();
  }, [uid]);
}
