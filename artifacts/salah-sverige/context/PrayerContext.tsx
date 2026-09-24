import React, { createContext, useContext, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { getGetPrayerTimesQueryKey, useGetPrayerTimes } from '@workspace/api-client-react';
import {
  findSupportedCity,
  normalizePrayerDataset,
  PrayerDay,
  PrayerDataset,
} from '@/lib/prayer';

type Coordinates = { latitude: number; longitude: number };
type WebPlace = {
  city?: string;
  locality?: string;
  countryCode?: string;
  localityInfo?: { administrative?: Array<{ name: string }> };
};
type PrayerContextValue = {
  dataset?: PrayerDataset;
  city: string | null;
  coordinates: Coordinates | null;
  today?: PrayerDay;
  tomorrow?: PrayerDay;
  month: PrayerDay[];
  loading: boolean;
  locating: boolean;
  error: string | null;
  permission: Location.LocationPermissionResponse | null;
  locate: () => Promise<void>;
  selectCity: (city: string) => void;
  openSettings: () => Promise<void>;
  refresh: () => Promise<unknown>;
};

const PrayerContext = createContext<PrayerContextValue | null>(null);

export function PrayerProvider({ children }: { children: React.ReactNode }) {
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [city, setCity] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const query = useGetPrayerTimes({
    query: {
      queryKey: getGetPrayerTimesQueryKey(),
      select: normalizePrayerDataset,
      staleTime: 1000 * 60 * 60 * 12,
      retry: 2,
    },
  });

  const locate = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) {
        setLocationError('Platsåtkomst behövs för att välja rätt svensk stad.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCoordinates(coords);
      let candidates: Array<string | null | undefined>;
      if (Platform.OS === 'web') {
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=sv`);
        if (!response.ok) throw new Error('Geocoding failed');
        const place: WebPlace = await response.json();
        if (place.countryCode !== 'SE') {
          setLocationError('Platsen verkar vara utanför Sverige. Välj en stad manuellt.');
          return;
        }
        candidates = [place.city, place.locality, ...(place.localityInfo?.administrative?.map((item) => item.name) ?? [])];
      } else {
        const places = await Location.reverseGeocodeAsync(coords);
        const place = places[0];
        candidates = [place?.city, place?.district, place?.subregion, place?.region, place?.name];
      }
      const dataset = query.data ?? (await query.refetch()).data;
      if (!dataset) {
        setLocationError('Bönetidstabellen kunde inte laddas. Försök igen eller välj stad.');
        return;
      }
      const matched = findSupportedCity(dataset.cities, candidates);
      if (matched) {
        setCity(matched);
      } else {
        setLocationError('Vi hittade din plats, men ingen exakt stad i tabellen. Välj närmaste stad.');
      }
    } catch {
      setLocationError('Det gick inte att hitta en stad från din plats. Välj stad manuellt eller försök igen.');
    } finally {
      setLocating(false);
    }
  };

  const month = city ? query.data?.tables[city]?.[String(date.getMonth() + 1)] ?? [] : [];
  const today = month.find((day) => day.day === date.getDate());
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + 1);
  const tomorrow = city
    ? query.data?.tables[city]?.[String(nextDate.getMonth() + 1)]?.find((day) => day.day === nextDate.getDate())
    : undefined;
  const value = useMemo<PrayerContextValue>(
    () => ({
      dataset: query.data,
      city,
      coordinates,
      today,
      tomorrow,
      month,
      loading: query.isLoading,
      locating,
      error: locationError ?? (query.error instanceof Error ? query.error.message : null),
      permission,
      locate,
      selectCity: setCity,
      openSettings: async () => {
        if (Platform.OS !== 'web') await Linking.openSettings();
      },
      refresh: query.refetch,
    }),
    [query.data, query.isLoading, query.error, query.refetch, city, coordinates, today, tomorrow, month, locating, locationError, permission],
  );
  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer() {
  const value = useContext(PrayerContext);
  if (!value) throw new Error('usePrayer must be used inside PrayerProvider');
  return value;
}