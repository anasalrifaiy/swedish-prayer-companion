import type { PrayerDataset, PrayerName } from './prayer';

export const reminderPrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type ReminderPrayer = Exclude<PrayerName, 'Shuruk'>;
export type ReminderMode = 'vibration' | 'sound';
export type ReminderPreferences = {
  enabled: boolean;
  mode: ReminderMode;
  prayers: Record<ReminderPrayer, boolean>;
};

export const defaultReminderPreferences: ReminderPreferences = {
  enabled: false,
  mode: 'vibration',
  prayers: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
};

export function readReminderPreferences(value: string | null): ReminderPreferences {
  if (!value) return defaultReminderPreferences;
  try {
    const parsed = JSON.parse(value);
    return {
      enabled: parsed.enabled === true,
      mode: parsed.mode === 'sound' ? 'sound' : 'vibration',
      prayers: Object.fromEntries(
        reminderPrayers.map((name) => [name, parsed.prayers?.[name] !== false]),
      ) as Record<ReminderPrayer, boolean>,
    };
  } catch {
    return defaultReminderPreferences;
  }
}

export function upcomingPrayerReminders(
  dataset: PrayerDataset,
  city: string,
  selected: Record<ReminderPrayer, boolean>,
  now: Date,
  days: number,
): Array<{ prayer: ReminderPrayer; date: Date }> {
  const reminders: Array<{ prayer: ReminderPrayer; date: Date }> = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    // The published table covers the current calendar year; do not reuse its
    // January entries for a future year's notifications.
    if (date.getFullYear() !== now.getFullYear()) break;
    const day = dataset.tables[city]?.[String(date.getMonth() + 1)]
      ?.find((entry) => entry.day === date.getDate());
    if (!day) continue;
    for (const prayer of reminderPrayers) {
      if (!selected[prayer]) continue;
      const match = /^(\d{1,2}):(\d{2})$/.exec(day[prayer]);
      if (!match) continue;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour > 23 || minute > 59) continue;
      date.setHours(hour, minute, 0, 0);
      if (date > now) reminders.push({ prayer, date: new Date(date) });
    }
  }
  return reminders;
}