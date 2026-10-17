import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import {
  getExactAlarmPermissionsAsync,
  getPermissionsAsync,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
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
const EXACT_ALARM_PROMPT_KEY = 'prayer-sverige:exact-alarm-prompted:v1';
const OWNER = 'prayer-sverige';
const VIBRATION_CHANNEL = 'prayer-vibration-v1';
const SOUND_CHANNEL = 'prayer-sound-v1';
const LOOKAHEAD_DAYS = Platform.OS === 'ios' ? 12 : 45;
const IOS_NOTIFICATION_BUDGET = 60;

type ReminderErrorKey =
  | 'errRemindersRead' | 'errAllowNotifications' | 'errChooseCityForReminders'
  | 'errSwedishTimezone' | 'errRemindersUpdate' | 'errSettingSave' | 'errOpenSettings';

type ReminderContextValue = {
  preferences: ReminderPreferences;
  loading: boolean;
  saving: boolean;
  permissionGranted: boolean | null;
  exactAlarmGranted: boolean | null;
  requestExactAlarm: () => Promise<void>;
  error: string | null;
  scheduledCount: number | null;
  scheduledUntil: Date | null;
  updatePreferences: (next: ReminderPreferences) => Promise<void>;
  openSettings: () => Promise<void>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);
let foregroundModes: ReminderPreferences['prayers'] = defaultReminderPreferences.prayers;
let foregroundBeforePrayerMode: ReminderPreferences['beforePrayer'] = defaultReminderPreferences.beforePrayer;

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
      const beforePrayer = notification.request.content.data?.beforePrayer === true;
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: beforePrayer
          ? foregroundBeforePrayerMode === 'sound'
          : prayer ? foregroundModes[prayer] === 'sound' : false,
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
    globalMethod,
  } = usePrayer();
  const { t, language } = useLanguage();
  const [preferences, setPreferences] = useState(defaultReminderPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [exactAlarmGranted, setExactAlarmGranted] = useState<boolean | null>(null);
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

  const checkExactAlarm = async () => {
    if (Platform.OS !== 'android') return;
    try {
      setExactAlarmGranted((await getExactAlarmPermissionsAsync()).granted);
    } catch { /* leave unknown */ }
  };

  const requestExactAlarm = async () => {
    if (Platform.OS !== 'android') return;
    try {
      setExactAlarmGranted((await requestExactAlarmPermissionsAsync()).granted);
    } catch {
      try { await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM'); }
      catch { await Linking.openSettings().catch(() => undefined); }
    }
  };

  // Ask once at first launch whether the user wants exact alarms at prayer time.
  useEffect(() => {
    if (Platform.OS !== 'android' || loading) return;
    let active = true;
    (async () => {
      await checkExactAlarm();
      let granted: boolean;
      try { granted = (await getExactAlarmPermissionsAsync()).granted; } catch { return; }
      if (granted || !active || await AsyncStorage.getItem(EXACT_ALARM_PROMPT_KEY)) return;
      await AsyncStorage.setItem(EXACT_ALARM_PROMPT_KEY, '1');
      Alert.alert(t.exactAlarmPromptTitle, t.exactAlarmPromptBody, [
        { text: t.exactAlarmPromptNo, style: 'cancel' },
        { text: t.exactAlarmPromptYes, onPress: () => { void requestExactAlarm(); } },
      ]);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let state = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (state !== 'active' && next === 'active') {
        setRefresh((value) => value + 1);
        void checkExactAlarm();
      }
      state = next;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (loading || prayerLoading || (locating && !city) || Platform.OS === 'web') return;
    const snapshot = { preferences, city, dataset, locationErrorKey, t, isGlobal: !!globalMethod };
    queue.current = queue.current.catch(() => undefined).then(async () => {
      let schedulingStarted = false;
      try {
        const Notifications = await notificationModule();
        foregroundModes = snapshot.preferences.prayers;
        foregroundBeforePrayerMode = snapshot.preferences.beforePrayer;
        const status = await Notifications.getPermissionsAsync();
        setPermissionGranted(status.granted);
        const selectedPrayers = Object.fromEntries(
          reminderPrayers.map((name) => [name, snapshot.preferences.prayers[name] !== 'off']),
        ) as Record<ReminderPrayer, boolean>;
        const hasBeforePrayerReminder = snapshot.preferences.beforePrayer !== 'off';
        if (!Object.values(selectedPrayers).some(Boolean) && !hasBeforePrayerReminder) {
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
        // Local date triggers use the phone's time zone. Abroad in Sweden's data, deliver in Swedish time via push only.
        // Calculated global times already follow the phone's own time zone.
        const inSwedenTime = snapshot.isGlobal
          || Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Stockholm';
        const remindersPerDay = Object.values(selectedPrayers).filter(Boolean).length
          + (hasBeforePrayerReminder ? reminderPrayers.length : 0);
        // Keep a small margin under iOS's 64 pending-notification limit.
        const lookaheadDays = Platform.OS === 'ios'
          ? Math.min(LOOKAHEAD_DAYS, Math.floor(IOS_NOTIFICATION_BUDGET / remindersPerDay))
          : LOOKAHEAD_DAYS;
        const reminders = inSwedenTime ? upcomingPrayerReminders(
          snapshot.dataset,
          snapshot.city,
          selectedPrayers,
          new Date(),
          lookaheadDays,
          hasBeforePrayerReminder,
        ) : [];
        await cancelOurReminders(Notifications);
        schedulingStarted = true;
        for (const { prayer, date, beforePrayer } of reminders) {
          const mode = beforePrayer
            ? snapshot.preferences.beforePrayer
            : snapshot.preferences.prayers[prayer];
          await Notifications.scheduleNotificationAsync({
            content: {
              title: beforePrayer
                ? snapshot.t.beforePrayerTitle(snapshot.t.prayerNames[prayer])
                : `${snapshot.t.prayerNames[prayer]} · ${snapshot.city}`,
              body: beforePrayer
                ? snapshot.t.beforePrayerBody(snapshot.t.prayerNames[prayer], snapshot.city)
                : snapshot.t.notificationBody(snapshot.t.prayerNames[prayer], snapshot.city),
              sound: mode === 'sound' ? 'default' : false,
              data: { owner: OWNER, city: snapshot.city, prayer, beforePrayer },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              ...(Platform.OS === 'android' ? { delivery: 'alarmClock' as const } : {}),
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
  }, [loading, prayerLoading, locating, preferences, city, dataset, globalMethod, locationErrorKey, language, refresh]);

  const updatePreferences = async (next: ReminderPreferences) => {
    if (saving || loading || Platform.OS === 'web') return;
    setSaving(true);
    try {
      const enabling = Object.values(next.prayers).some((mode) => mode !== 'off')
        || next.beforePrayer !== 'off';
      const wasEnabled = Object.values(preferences.prayers).some((mode) => mode !== 'off')
        || preferences.beforePrayer !== 'off';
      const requestPermission = enabling && !wasEnabled;
      if (requestPermission) {
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
      preferences, loading, saving, permissionGranted, exactAlarmGranted, requestExactAlarm, error: error ? t[error] : null, scheduledCount, scheduledUntil,
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