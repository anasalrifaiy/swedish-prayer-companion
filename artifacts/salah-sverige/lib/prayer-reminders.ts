import type { PrayerDataset, PrayerName } from './prayer';

export const reminderPrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type ReminderPrayer = Exclude<PrayerName, 'Shuruk'>;
export type ReminderMode = 'off' | 'vibration' | 'sound';
export type ReminderPreferences = {
  prayers: Record<ReminderPrayer, ReminderMode>;
  beforePrayer: ReminderMode;
};

export const defaultReminderPreferences: ReminderPreferences = {
  prayers: { Fajr: 'off', Dhuhr: 'off', Asr: 'off', Maghrib: 'off', Isha: 'off' },
  beforePrayer: 'off',
};

export function readReminderPreferences(value: string | null): ReminderPreferences {
  if (!value) return defaultReminderPreferences;
  try {
    const parsed = JSON.parse(value);
    const legacyMode = parsed.mode === 'sound' ? 'sound' : 'vibration';
    const beforePrayer = parsed.beforePrayer;
    return {
      prayers: Object.fromEntries(
        reminderPrayers.map((name) => {
          const mode = parsed.prayers?.[name];
          if (mode === 'vibration' || mode === 'sound' || mode === 'off') return [name, mode];
          if (mode === true && parsed.enabled === true) return [name, legacyMode];
          return [name, 'off'];
        }),
      ) as Record<ReminderPrayer, ReminderMode>,
      beforePrayer: beforePrayer === 'vibration' || beforePrayer === 'sound' ? beforePrayer : 'off',
    };
  } catch {
    return defaultReminderPreferences;
  }
}

export type ScheduledPrayerReminder = {
  prayer: ReminderPrayer;
  date: Date;
  beforePrayer: boolean;
};

export function upcomingPrayerReminders(
  dataset: PrayerDataset,
  city: string,
  selected: Record<ReminderPrayer, boolean>,
  now: Date,
  days: number,
  beforePrayer = false,
): ScheduledPrayerReminder[] {
  const reminders: ScheduledPrayerReminder[] = [];
  for (let offset = 0; offset < days; offset++) {
    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    // The published table covers the current calendar year; do not reuse its
    // January entries for a future year's notifications.
    if (dayDate.getFullYear() !== now.getFullYear()) break;
    const day = dataset.tables[city]?.[String(dayDate.getMonth() + 1)]
      ?.find((entry) => entry.day === dayDate.getDate());
    if (!day) continue;
    for (const prayer of reminderPrayers) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(day[prayer]);
      if (!match) continue;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour > 23 || minute > 59) continue;
      const prayerDate = new Date(dayDate);
      prayerDate.setHours(hour, minute, 0, 0);
      if (selected[prayer] && prayerDate > now) {
        reminders.push({ prayer, date: prayerDate, beforePrayer: false });
      }
      const advanceDate = new Date(prayerDate.getTime() - 15 * 60 * 1000);
      if (beforePrayer && advanceDate > now) {
        reminders.push({ prayer, date: advanceDate, beforePrayer: true });
      }
    }
  }
  return reminders.sort((a, b) => a.date.getTime() - b.date.getTime());
}