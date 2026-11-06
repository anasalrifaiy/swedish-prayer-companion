import AsyncStorage from '@react-native-async-storage/async-storage';
import { globalDay, GlobalPlace } from './global-prayer';
import { Language, languages } from './i18n';
import { getPrayerState, PrayerDataset, PrayerDay } from './prayer';
import { LANGUAGE_KEY, LOCATION_CACHE_KEY, PRAYER_CACHE_KEY } from './storage-keys';

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

type Place = { city: string; globalPlace: GlobalPlace | null };

function dayFor(place: Place, dataset: PrayerDataset | null, date: Date): PrayerDay | undefined {
  if (place.globalPlace) return globalDay(place.globalPlace, date);
  return dataset?.tables[place.city]?.[String(date.getMonth() + 1)]
    ?.find((entry) => entry.day === date.getDate());
}

export function buildWidgetData(
  place: Place | null,
  dataset: PrayerDataset | null,
  language: Language,
  now: Date,
): WidgetData {
  if (!place) return { status: 'empty', language };
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const today = dayFor(place, dataset, now);
  if (!today) return { status: 'empty', language };
  const tomorrow = dayFor(place, dataset, tomorrowDate);
  const state = getPrayerState(today, now, tomorrow);
  // Before Fajr the prayer period we are still in is last night's Isha.
  const current = (state.current?.name ?? 'Isha') as WidgetPrayer;
  const next = state.next
    ? { name: state.next.name as WidgetPrayer, time: pad(state.next.time) }
    : null;
  return {
    status: 'ready',
    language,
    city: place.city,
    times: widgetPrayers.map((name) => ({ name, time: today[name] })),
    current,
    next,
  };
}

function pad(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parse(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

// Reads the same caches the app writes, so the widget works without opening the app.
export async function loadWidgetData(now = new Date()): Promise<WidgetData> {
  const [storedLanguage, storedLocation, storedDataset] = await Promise.all([
    AsyncStorage.getItem(LANGUAGE_KEY),
    AsyncStorage.getItem(LOCATION_CACHE_KEY),
    AsyncStorage.getItem(PRAYER_CACHE_KEY),
  ]);
  const language = (languages as string[]).includes(storedLanguage ?? '') ? storedLanguage as Language : 'sv';

  const location = parse(storedLocation) as { city?: unknown; globalPlace?: Partial<GlobalPlace> | null } | null;
  const city = typeof location?.city === 'string' ? location.city : null;
  if (!city) return { status: 'empty', language };

  const candidate = location?.globalPlace;
  const globalPlace = candidate
    && candidate.name === city
    && Number.isFinite(candidate.latitude)
    && Number.isFinite(candidate.longitude)
    ? candidate as GlobalPlace
    : null;

  const cached = parse(storedDataset) as { calendarYear?: number; dataset?: PrayerDataset } | null;
  const dataset = cached?.calendarYear === now.getFullYear() && cached.dataset?.tables ? cached.dataset : null;
  return buildWidgetData({ city, globalPlace }, dataset, language, now);
}
