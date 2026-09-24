export const PRAYER_DATA_URL = 'https://salat.muslim.se/data/prayertimes.json';

export type PrayerName = 'Fajr' | 'Shuruk' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
export type PrayerDay = {
  day: number;
  Fajr: string;
  Shuruk: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
};
type RawTable = { headers: string[]; rows: Array<{ cells: string[] }> };
type RawPrayerData = {
  source: string;
  downloadedAt: string;
  cities: Array<{ value: string; label: string }>;
  tables: Record<string, Record<string, RawTable>>;
};

export type PrayerDataset = {
  source: string;
  updatedAt: string;
  cities: string[];
  tables: Record<string, Record<string, PrayerDay[]>>;
};

export function normalizePlace(value: string) {
  return value
    .toLocaleLowerCase('sv-SE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function findSupportedCity(
  cities: string[],
  candidates: Array<string | null | undefined>,
) {
  const normalized = candidates.filter(Boolean).flatMap((item) => {
    const value = normalizePlace(item!);
    // Some web reverse geocoders return "Enköpings kommun" rather than "Enköping".
    const municipality = value.match(/^(.+?)skommun$/);
    return municipality ? [value, municipality[1]] : [value];
  });
  for (const candidate of normalized) {
    const match = cities.find((city) => normalizePlace(city) === candidate);
    if (match) return match;
  }
  return null;
}

export function normalizePrayerDataset(input: unknown): PrayerDataset {
  const raw = input as RawPrayerData;
  const tables: PrayerDataset['tables'] = {};

  for (const city of raw.cities) {
    const cityTables = raw.tables[city.value] ?? {};
    tables[city.label] = {};
    for (const [month, table] of Object.entries(cityTables)) {
      tables[city.label][month] = table.rows.map(({ cells }) => ({
        day: Number(cells[0]),
        Fajr: cells[1],
        Shuruk: cells[2],
        Dhuhr: cells[3],
        Asr: cells[4],
        Maghrib: cells[5],
        Isha: cells[6],
      }));
    }
  }
  return {
    source: raw.source,
    updatedAt: raw.downloadedAt,
    cities: raw.cities.map((city) => city.label),
    tables,
  };
}

export const prayers: PrayerName[] = ['Fajr', 'Shuruk', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
export const swedishPrayerNames: Record<PrayerName, string> = {
  Fajr: 'Fajr',
  Shuruk: 'Soluppgång',
  Dhuhr: 'Dhuhr',
  Asr: 'Asr',
  Maghrib: 'Maghrib',
  Isha: 'Isha',
};

export function getPrayerState(day: PrayerDay | undefined, now = new Date(), tomorrow?: PrayerDay) {
  if (!day) return { current: null, next: null, secondsLeft: 0 };
  const scheduled = prayers
    .filter((name) => name !== 'Shuruk')
    .map((name) => {
      const [hour, minute] = day[name].split(':').map(Number);
      const time = new Date(now);
      time.setHours(hour, minute, 0, 0);
      return { name, time };
    });
  let next = scheduled.find((item) => item.time > now) ?? null;
  if (!next && tomorrow?.Fajr) {
    const [hour, minute] = tomorrow.Fajr.split(':').map(Number);
    const time = new Date(now);
    time.setDate(time.getDate() + 1);
    time.setHours(hour, minute, 0, 0);
    next = { name: 'Fajr' as const, time };
  }
  const current = [...scheduled].reverse().find((item) => item.time <= now) ?? null;
  return {
    current,
    next,
    secondsLeft: next ? Math.max(0, Math.floor((next.time.getTime() - now.getTime()) / 1000)) : 0,
  };
}

export function qiblaBearing(latitude: number, longitude: number) {
  const kaabaLat = (21.4225 * Math.PI) / 180;
  const deltaLon = ((39.8262 - longitude) * Math.PI) / 180;
  const userLat = (latitude * Math.PI) / 180;
  const y = Math.sin(deltaLon);
  const x = Math.cos(userLat) * Math.tan(kaabaLat) - Math.sin(userLat) * Math.cos(deltaLon);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}