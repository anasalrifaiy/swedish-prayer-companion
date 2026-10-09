import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { usePrayer } from './PrayerContext';
import { useLanguage } from './LanguageContext';
import type { Strings } from '@/lib/i18n';
import {
  defaultReminderPreferences,
  readReminderPreferences,
  reminderPrayers,
  ReminderPrayer,
  ReminderPreferences,
  upcomingPrayerReminders,
} from '@/lib/prayer-reminders';

const STORAGE_KEY = 'prayer-sverige:reminders:v1';
const OWNER = 'prayer-sverige';
const VIBRATION_CHANNEL = 'prayer-vibration-v1';
const SOUND_CHANNEL = 'prayer-sound-v1';
const LOOKAHEAD_DAYS = Platform.OS === 'ios' ? 12 : 45;

type ReminderErrorKey =
  | 'errRemindersRead' | 'errAllowNotifications' | 'errChooseCityForReminders'
  | 'errSwedishTimezone' | 'errRemindersUpdate' | 'errSettingSave' | 'errOpenSettings';

type ReminderContextValue = {
  preferences: ReminderPreferences;
  loading: boolean;
  saving: boolean;
  permissionGranted: boolean | null;
  error: string | null;
  scheduledCount: number | null;
  scheduledUntil: Date | null;
  updatePreferences: (next: ReminderPreferences) => Promise<void>;
  openSettings: () => Promise<void>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);
let foregroundModes: ReminderPreferences['prayers'] = defaultReminderPreferences.prayers;

const LocalNotifications = {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
};

function notificationModule() {
  setNotificationHandler({
    handleNotification: async (notification) => {
      const prayer = notification.request.content.data?.prayer as ReminderPrayer | undefined;
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: prayer ? foregroundModes[prayer] === 'sound' : false,
        shouldSetBadge: false,
      };
    },
  });
  return LocalNotifications;
}

async function ensureChannels(notificationApi: typeof LocalNotifications, t: Strings) {
  if (Platform.OS !== 'android') return;
  await notificationApi.setNotificationChannelAsync(VIBRATION_CHANNEL, {
    name: t.channelVibration,
    importance: notificationApi.AndroidImportance.HIGH,
    sound: null,
    enableVibrate: true,
    vibrationPattern: [0, 450, 200, 450],
  });
  await notificationApi.setNotificationChannelAsync(SOUND_CHANNEL, {
    name: t.channelSound,
    importance: notificationApi.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: false,
  });
}

async function cancelOurReminders(notificationApi: typeof LocalNotifications) {
  const pending = await notificationApi.getAllScheduledNotificationsAsync();
  await Promise.all(pending
    .filter((item) => item.content.data?.owner === OWNER)
    .map((item) => notificationApi.cancelScheduledNotificationAsync(item.identifier)));
}

export function ReminderProvider({ children }: { children: React.ReactNode }) {
  const {
    city,
    dataset,
    locationErrorKey,
    loading: prayerLoading,
    locating,
  } = usePrayer();
  const { t, language } = useLanguage();
  const [preferences, setPreferences] = useState(defaultReminderPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<ReminderErrorKey | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [scheduledUntil, setScheduledUntil] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!active) return;
        setPreferences(readReminderPreferences(stored));
        if (Platform.OS !== 'web') {
          const Notifications = await notificationModule();
          const status = await Notifications.getPermissionsAsync();
          if (active) setPermissionGranted(status.granted);
        }
      } catch {
        if (active) setError('errRemindersRead');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let state = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (state !== 'active' && next === 'active') setRefresh((value) => value + 1);
      state = next;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (loading || prayerLoading || (locating && !city) || Platform.OS === 'web') return;
    const snapshot = { preferences, city, dataset, locationErrorKey, t };
    queue.current = queue.current.catch(() => undefined).then(async () => {
      let schedulingStarted = false;
      try {
        const Notifications = await notificationModule();
        foregroundModes = snapshot.preferences.prayers;
        const status = await Notifications.getPermissionsAsync();
        setPermissionGranted(status.granted);
        const selectedPrayers = Object.fromEntries(
          reminderPrayers.map((name) => [name, snapshot.preferences.prayers[name] !== 'off']),
        ) as Record<ReminderPrayer, boolean>;
        if (!Object.values(selectedPrayers).some(Boolean)) {
          await cancelOurReminders(Notifications);
          setScheduledCount(0);
          setScheduledUntil(null);
          setError(null);
          return;
        }
        if (!status.granted) {
          await cancelOurReminders(Notifications);
          setScheduledCount(0);
          setScheduledUntil(null);
          setError('errAllowNotifications');
          return;
        }
        if (!snapshot.city || !snapshot.dataset) {
          if (!snapshot.city && snapshot.locationErrorKey === 'errOutsideSweden') {
            await cancelOurReminders(Notifications);
            setScheduledCount(0);
            setScheduledUntil(null);
          }
          setError('errChooseCityForReminders');
          return;
        }
        await ensureChannels(Notifications, snapshot.t);
        // Local date triggers use the phone's time zone. Abroad, deliver in Swedish time via push only.
        const inSwedenTime = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Stockholm';
        const reminders = inSwedenTime ? upcomingPrayerReminders(
          snapshot.dataset, snapshot.city, selectedPrayers, new Date(), LOOKAHEAD_DAYS,
        ) : [];
        await cancelOurReminders(Notifications);
        schedulingStarted = true;
        for (const { prayer, date } of reminders) {
          const mode = snapshot.preferences.prayers[prayer];
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${snapshot.t.prayerNames[prayer]} · ${snapshot.city}`,
              body: snapshot.t.notificationBody(snapshot.t.prayerNames[prayer], snapshot.city),
              sound: mode === 'sound' ? 'default' : false,
              data: { owner: OWNER, city: snapshot.city, prayer },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              ...(Platform.OS === 'android' ? {
                channelId: mode === 'sound' ? SOUND_CHANNEL : VIBRATION_CHANNEL,
              } : {}),
            },
          });
        }
        setScheduledCount(reminders.length);
        setScheduledUntil(reminders.at(-1)?.date ?? null);
        setError(inSwedenTime ? null : 'errSwedishTimezone');
      } catch (cause) {
        if (__DEV__) console.error(
          'Reminder update failed:',
          cause instanceof Error ? cause.stack ?? cause.message : cause,
        );
        if (schedulingStarted) {
          try { await cancelOurReminders(await notificationModule()); } catch { /* preserve the original error */ }
          setScheduledCount(null);
          setScheduledUntil(null);
        }
        setError('errRemindersUpdate');
      }
    });
  }, [loading, prayerLoading, locating, preferences, city, dataset, locationErrorKey, language, refresh]);

  const updatePreferences = async (next: ReminderPreferences) => {
    if (saving || loading || Platform.OS === 'web') return;
    setSaving(true);
    try {
      const enabling = Object.values(next.prayers).some((mode) => mode !== 'off')
        && !Object.values(preferences.prayers).some((mode) => mode !== 'off');
      if (enabling) {
        const Notifications = await notificationModule();
        await ensureChannels(Notifications, t);
        const current = await Notifications.getPermissionsAsync();
        const status = current.granted ? current : await Notifications.requestPermissionsAsync();
        setPermissionGranted(status.granted);
        if (!status.granted) {
          setError('errAllowNotifications');
          return;
        }
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPreferences(next);
      setError(null);
    } catch {
      setError('errSettingSave');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ReminderContext.Provider value={{
      preferences, loading, saving, permissionGranted, error: error ? t[error] : null, scheduledCount, scheduledUntil,
      updatePreferences,
      openSettings: async () => {
        if (Platform.OS !== 'web') {
          try { await Linking.openSettings(); }
          catch { setError('errOpenSettings'); }
        }
      },
    }}>
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const value = useContext(ReminderContext);
  if (!value) throw new Error('useReminders must be used inside ReminderProvider');
  return value;
}