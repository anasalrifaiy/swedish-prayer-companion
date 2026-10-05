import type { PrayerDataset, PrayerName } from './prayer';

export const reminderPrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type ReminderPrayer = Exclude<PrayerName, 'Shuruk'>;
export type ReminderMode = 'off' | 'vibration' | 'sound';
export type ReminderPreferences = {
  prayers: Record<ReminderPrayer, ReminderMode>;
};

export const defaultReminderPreferences: ReminderPreferences = {
  prayers: { Fajr: 'off', Dhuhr: 'off', Asr: 'off', Maghrib: 'off', Isha: 'off' },
};

export function readReminderPreferences(value: string | null): ReminderPreferences {
  if (!value) return defaultReminderPreferences;
  try {
    const parsed = JSON.parse(value);
    const legacyMode = parsed.mode === 'sound' ? 'sound' : 'vibration';
    return {
      prayers: Object.fromEntries(
        reminderPrayers.map((name) => {
          const mode = parsed.prayers?.[name];
          if (mode === 'vibration' || mode === 'sound' || mode === 'off') return [name, mode];
          if (mode === true && parsed.enabled === true) return [name, legacyMode];
          return [name, 'off'];
        }),
      ) as Record<ReminderPrayer, ReminderMode>,
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