import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configure how foreground notifications are presented
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Request permission and register this device's Expo push token with Supabase.
 * Safe to call multiple times — upserts on (user_id, token).
 * Silently no-ops on simulators (getExpoPushTokenAsync throws, caught below).
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync()

    const token = tokenData.data
    const platform = Platform.OS === 'ios' ? 'ios' : 'android'

    // Upsert into expo_push_tokens — ignore errors, non-blocking
    await supabase
      .from('expo_push_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      )

    // Android-specific: create a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Switchday',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#111827',
      })
    }
  } catch {
    // Non-fatal — push is best-effort
  }
}
