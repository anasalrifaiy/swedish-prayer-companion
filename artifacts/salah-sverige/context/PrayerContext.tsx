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
type PrayerContextValue = {
  dataset?: PrayerDataset;
  city: string | null;
  coordinates: Coordinates | null;
  today?: PrayerDay;
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
      const places = await Location.reverseGeocodeAsync(coords);
      const place = places[0];
      const matched = findSupportedCity(query.data?.cities ?? [], [
        place?.city,
        place?.district,
        place?.subregion,
        place?.region,
        place?.name,
      ]);
      if (matched) {
        setCity(matched);
      } else {
        setLocationError('Vi hittade din plats, men ingen exakt stad i tabellen. Välj närmaste stad.');
      }
    } catch {
      setLocationError('Det gick inte att läsa din plats. Försök igen eller välj stad.');
    } finally {
      setLocating(false);
    }
  };

  const now = new Date();
  const month = city ? query.data?.tables[city]?.[String(now.getMonth() + 1)] ?? [] : [];
  const today = month.find((day) => day.day === now.getDate());
  const value = useMemo<PrayerContextValue>(
    () => ({
      dataset: query.data,
      city,
      coordinates,
      today,
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
    [query.data, query.isLoading, query.error, query.refetch, city, coordinates, today, month, locating, locationError, permission],
  );
  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer() {
  const value = useContext(PrayerContext);
  if (!value) throw new Error('usePrayer must be used inside PrayerProvider');
  return value;
}