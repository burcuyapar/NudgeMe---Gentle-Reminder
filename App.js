import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission, clearAllNotifications } from './src/services/notifications';
import { navigate } from './src/navigation/navigationRef';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  useEffect(() => {
    requestNotificationPermission();
    // Removed auto-clear in DEV to prevent race conditions with Dashboard auto-reschedule
    // if (__DEV__) {
    //   clearAllNotifications();
    // }
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const notif = response?.notification;
        console.log('🔔 Notification Response Received:', {
          id: notif?.request?.identifier,
          content: notif?.request?.content,
          trigger: notif?.request?.trigger
        });
        const reminderId = notif?.request?.content?.data?.reminderId;
        if (reminderId) {
          navigate('Dashboard', { openReminderId: reminderId });
        }
      } catch (e) {
        console.error('Error handling notification response:', e);
      }
    });
    return () => {
      sub?.remove?.();
    };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
