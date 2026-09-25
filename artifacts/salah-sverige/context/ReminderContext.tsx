import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as NotificationTypes from 'expo-notifications';
import Constants from 'expo-constants';
import { saveReminderDevice } from '@workspace/api-client-react';
import { usePrayer } from './PrayerContext';
import {
  defaultReminderPreferences,
  readReminderPreferences,
  ReminderPreferences,
  upcomingPrayerReminders,
} from '@/lib/prayer-reminders';

const STORAGE_KEY = 'prayer-sverige:reminders:v1';
const PUSH_TOKEN_KEY = 'prayer-sverige:push-token:v1';
const OWNER = 'prayer-sverige';
const VIBRATION_CHANNEL = 'prayer-vibration-v1';
const SOUND_CHANNEL = 'prayer-sound-v1';
const LOOKAHEAD_DAYS = Platform.OS === 'ios' ? 12 : 45;

type ReminderContextValue = {
  preferences: ReminderPreferences;
  loading: boolean;
  saving: boolean;
  permissionGranted: boolean | null;
  error: string | null;
  scheduledCount: number | null;
  scheduledUntil: Date | null;
  pushActive: boolean;
  updatePreferences: (next: ReminderPreferences) => Promise<void>;
  openSettings: () => Promise<void>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);
let foregroundMode: ReminderPreferences['mode'] = 'vibration';

async function notificationModule() {
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: foregroundMode === 'sound',
      shouldSetBadge: false,
    }),
  });
  return Notifications;
}

async function ensureChannels(Notifications: typeof NotificationTypes) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(VIBRATION_CHANNEL, {
    name: 'Bönetider · vibration',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    enableVibrate: true,
    vibrationPattern: [0, 450, 200, 450],
  });
  await Notifications.setNotificationChannelAsync(SOUND_CHANNEL, {
    name: 'Bönetider · ljud',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: false,
  });
}

async function cancelOurReminders(Notifications: typeof NotificationTypes) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending
    .filter((item) => item.content.data?.owner === OWNER)
    .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

export function ReminderProvider({ children }: { children: React.ReactNode }) {
  const { city, dataset, error: locationError } = usePrayer();
  const [preferences, setPreferences] = useState(defaultReminderPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [scheduledUntil, setScheduledUntil] = useState<Date | null>(null);
  const [pushActive, setPushActive] = useState(false);
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
        if (active) setError('Påminnelser kunde inte läsas från telefonen.');
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
    if (loading || Platform.OS === 'web') return;
    const snapshot = { preferences, city, dataset, locationError };
    queue.current = queue.current.catch(() => undefined).then(async () => {
      let schedulingStarted = false;
      let localComplete = false;
      try {
        const Notifications = await notificationModule();
        foregroundMode = snapshot.preferences.mode;
        const status = await Notifications.getPermissionsAsync();
        setPermissionGranted(status.granted);
        const disableRemote = async () => {
          const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
          if (token) await saveReminderDevice({
            token, enabled: false, city: snapshot.city ?? '', mode: snapshot.preferences.mode,
            prayers: snapshot.preferences.prayers, localUntil: new Date().toISOString(),
          });
          setPushActive(false);
        };
        if (!snapshot.preferences.enabled) {
          await cancelOurReminders(Notifications);
          setScheduledCount(0);
          setScheduledUntil(null);
          await disableRemote();
          setError(null);
          return;
        }
        if (!status.granted) {
          await cancelOurReminders(Notifications);
          setScheduledCount(0);
          setScheduledUntil(null);
          await disableRemote();
          setError('Tillåt aviseringar i telefonens inställningar för att få påminnelser.');
          return;
        }
        if (!snapshot.city || !snapshot.dataset) {
          if (!snapshot.city && snapshot.locationError?.includes('utanför Sverige')) {
            await disableRemote();
            await cancelOurReminders(Notifications);
            setScheduledCount(0);
            setScheduledUntil(null);
          }
          setError('Välj en tabellstad för att schemalägga påminnelser.');
          return;
        }
        await ensureChannels(Notifications);
        // Local date triggers use the phone's time zone. Abroad, deliver in Swedish time via push only.
        const inSwedenTime = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Stockholm';
        const reminders = inSwedenTime ? upcomingPrayerReminders(
          snapshot.dataset, snapshot.city, snapshot.preferences.prayers, new Date(), LOOKAHEAD_DAYS,
        ) : [];
        await cancelOurReminders(Notifications);
        schedulingStarted = true;
        const channelId = snapshot.preferences.mode === 'sound' ? SOUND_CHANNEL : VIBRATION_CHANNEL;
        for (const { prayer, date } of reminders) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${prayer} · ${snapshot.city}`,
              body: `Det är dags för ${prayer} enligt tabellen för ${snapshot.city}.`,
              sound: snapshot.preferences.mode === 'sound' ? 'default' : false,
              data: { owner: OWNER, city: snapshot.city, prayer },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              ...(Platform.OS === 'android' ? { channelId } : {}),
            },
          });
        }
        setScheduledCount(reminders.length);
        setScheduledUntil(reminders.at(-1)?.date ?? null);
        localComplete = true;
        if (Object.values(snapshot.preferences.prayers).some(Boolean)) {
          const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
          if (!projectId) throw new Error('Push needs an Expo project ID in a native build');
          const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
          const oldToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
          if (oldToken && oldToken !== token) {
            await saveReminderDevice({
              token: oldToken, enabled: false, city: snapshot.city, mode: snapshot.preferences.mode,
              prayers: snapshot.preferences.prayers, localUntil: new Date().toISOString(),
            });
          }
          await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
          await saveReminderDevice({
            token, enabled: true, city: snapshot.city, mode: snapshot.preferences.mode,
            prayers: snapshot.preferences.prayers,
            localUntil: (reminders.at(-1)?.date ?? new Date()).toISOString(),
          });
          setPushActive(true);
        } else {
          await disableRemote();
        }
        setError(null);
      } catch (cause) {
        if (schedulingStarted && !localComplete) {
          try { await cancelOurReminders(await notificationModule()); } catch { /* preserve the original error */ }
          setScheduledCount(null);
          setScheduledUntil(null);
        }
        setPushActive(false);
        const needsNativeSetup = cause instanceof Error
          && cause.message.includes('Expo project ID');
        setError(localComplete
          ? needsNativeSetup
            ? 'Lokala aviseringar är planerade, men långtidsaviseringar kräver en push-konfigurerad app med Expo-projekt-ID.'
            : 'Lokala aviseringar är planerade, men långtidsaviseringar kunde inte aktiveras. Kontrollera nätanslutningen och att appen är installerad som en push-aktiverad version.'
          : 'Påminnelser kunde inte uppdateras. Försök öppna appen igen.');
      }
    });
  }, [loading, preferences, city, dataset, locationError, refresh]);

  const updatePreferences = async (next: ReminderPreferences) => {
    if (saving || loading || Platform.OS === 'web') return;
    setSaving(true);
    try {
      if (next.enabled && !preferences.enabled) {
        const Notifications = await notificationModule();
        await ensureChannels(Notifications);
        const current = await Notifications.getPermissionsAsync();
        const status = current.granted ? current : await Notifications.requestPermissionsAsync();
        setPermissionGranted(status.granted);
        if (!status.granted) {
          setError('Tillåt aviseringar i telefonens inställningar för att få påminnelser.');
          return;
        }
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPreferences(next);
      setError(null);
    } catch {
      setError('Inställningen kunde inte sparas. Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ReminderContext.Provider value={{
      preferences, loading, saving, permissionGranted, error, scheduledCount, scheduledUntil, pushActive,
      updatePreferences,
      openSettings: async () => {
        if (Platform.OS !== 'web') {
          try { await Linking.openSettings(); }
          catch { setError('Det gick inte att öppna telefonens inställningar.'); }
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