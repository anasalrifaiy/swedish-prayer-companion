import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, languages } from './i18n';
import { getPrayerState, PrayerDataset, PrayerDay } from './prayer';
import { LANGUAGE_KEY, WIDGET_CACHE_KEY } from './storage-keys';

export const widgetPrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type WidgetPrayer = (typeof widgetPrayers)[number];

export type WidgetData =
  | { status: 'empty'; language: Language }
  | {
      status: 'ready';
      language: Language;
      city: string;
      times: Array<{ name: WidgetPrayer; time: string }>;
      current: WidgetPrayer;
      next: { name: WidgetPrayer; time: string } | null;
    };

export type WidgetSnapshot = {
  version: 1;
  year: number;
  city: string | null;
  language: Language;
  months: Record<string, PrayerDay[]> | null;
};

export function makeWidgetSnapshot(
  city: string | null,
  dataset: PrayerDataset | undefined,
  language: Language,
  now: Date,
): WidgetSnapshot {
  return {
    version: 1,
    year: now.getFullYear(),
    city,
    language,
    months: city ? dataset?.tables[city] ?? null : null,
  };
}

export function preserveWidgetSnapshot(current: WidgetSnapshot, previous: WidgetSnapshot | null): WidgetSnapshot {
  if (current.city && !current.months && previous?.city === current.city
    && previous.year === current.year && previous.months) {
    return { ...previous, language: current.language };
  }
  return current;
}

export function buildWidgetData(snapshot: WidgetSnapshot, now: Date): WidgetData {
  const { city, language, months, year } = snapshot;
  if (!city || !months || year !== now.getFullYear()) return { status: 'empty', language };
  const today = months[String(now.getMonth() + 1)]?.find((entry) => entry.day === now.getDate());
  if (!today) return { status: 'empty', language };
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = tomorrowDate.getFullYear() === year
    ? months[String(tomorrowDate.getMonth() + 1)]?.find((entry) => entry.day === tomorrowDate.getDate())
    : undefined;
  const state = getPrayerState(today, now, tomorrow);
  return {
    status: 'ready',
    language,
    city,
    times: widgetPrayers.map((name) => ({ name, time: today[name] })),
    current: (state.current?.name ?? 'Isha') as WidgetPrayer,
    next: state.next
      ? { name: state.next.name as WidgetPrayer, time: pad(state.next.time) }
      : null,
  };
}

function pad(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export async function saveWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify(snapshot));
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  const storedSnapshot = await AsyncStorage.getItem(WIDGET_CACHE_KEY);
  if (!storedSnapshot) return null;
  let snapshot: WidgetSnapshot;
  try {
    snapshot = JSON.parse(storedSnapshot) as WidgetSnapshot;
  } catch (error) {
    console.error('Unable to parse prayer widget data:', error);
    return null;
  }
  if (snapshot?.version !== 1 || !(languages as string[]).includes(snapshot.language)
    || !Number.isInteger(snapshot.year)
    || (snapshot.city !== null && typeof snapshot.city !== 'string')
    || (snapshot.months !== null && (typeof snapshot.months !== 'object' || Array.isArray(snapshot.months)))) {
    console.error('Invalid prayer widget data');
    return null;
  }
  return snapshot;
}

export async function loadWidgetData(now = new Date()): Promise<WidgetData> {
  const snapshot = await loadWidgetSnapshot();
  if (snapshot) return buildWidgetData(snapshot, now);
  const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
  const language = (languages as string[]).includes(storedLanguage ?? '') ? storedLanguage as Language : 'sv';
  return { status: 'empty', language };
}
