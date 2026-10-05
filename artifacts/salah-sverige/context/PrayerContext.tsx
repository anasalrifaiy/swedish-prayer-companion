import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { getGetPrayerTimesQueryKey } from '@workspace/api-client-react';
import { apiBaseUrl } from '@/lib/api-config';
import {
  nearestSupportedCity,
  normalizePrayerDataset,
  PRAYER_DATA_URL,
  PrayerDay,
  PrayerDataset,
} from '@/lib/prayer';

const PRAYER_CACHE_KEY = 'prayer-sverige:official-timetable:v1';
const prayerQueryKey = getGetPrayerTimesQueryKey();

type CachedPrayerDataset = { calendarYear: number; dataset: PrayerDataset };

function isCachedPrayerDataset(value: unknown): value is CachedPrayerDataset {
  if (!value || typeof value !== 'object') return false;
  const cached = value as Partial<CachedPrayerDataset>;
  return Number.isInteger(cached.calendarYear)
    && !!cached.dataset
    && Array.isArray(cached.dataset.cities)
    && typeof cached.dataset.tables === 'object';
}

type Coordinates = { latitude: number; longitude: number };
type WebPlace = { countryCode?: string };
type PrayerContextValue = {
  dataset?: PrayerDataset;
  city: string | null;
  nearestDistanceKm: number | null;
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
  const queryClient = useQueryClient();
  const [tableCacheReady, setTableCacheReady] = useState(false);
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [city, setCity] = useState<string | null>(null);
  const [nearestDistanceKm, setNearestDistanceKm] = useState<number | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locatingRef = useRef(false);
  const autoLocateStartedRef = useRef(false);
  const hasLocationAccessRef = useRef(false);
  const manualSelectionRef = useRef(0);
  const [date, setDate] = useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(PRAYER_CACHE_KEY);
        if (!active || !stored) return;
        const cached: unknown = JSON.parse(stored);
        if (isCachedPrayerDataset(cached) && cached.calendarYear === new Date().getFullYear()) {
          queryClient.setQueryData(prayerQueryKey, cached.dataset, { updatedAt: 0 });
        } else {
          await AsyncStorage.removeItem(PRAYER_CACHE_KEY);
        }
      } catch {
        await AsyncStorage.removeItem(PRAYER_CACHE_KEY).catch(() => undefined);
      } finally {
        if (active) setTableCacheReady(true);
      }
    })();
    return () => { active = false; };
  }, [queryClient]);
  const query = useQuery({
    queryKey: prayerQueryKey,
    enabled: tableCacheReady,
    queryFn: async () => {
      const url = Platform.OS === 'web'
        ? `${apiBaseUrl ?? ''}/api/prayer-times`
        : PRAYER_DATA_URL;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Bönetidstabellen kunde inte laddas (HTTP ${response.status}).`);
      }
      const dataset = normalizePrayerDataset(await response.json());
      void AsyncStorage.setItem(PRAYER_CACHE_KEY, JSON.stringify({
        calendarYear: new Date().getFullYear(),
        dataset,
      })).catch(() => undefined);
      return dataset;
    },
    staleTime: 1000 * 60 * 60 * 12,
    refetchOnMount: 'always',
    retry: 2,
  });

  const locate = async () => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    const selectionAtStart = manualSelectionRef.current;
    setLocating(true);
    setLocationError(null);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) {
        setLocationError('Platsåtkomst behövs för att välja rätt svensk stad.');
        return;
      }
      hasLocationAccessRef.current = true;
      // Expo's web getCurrentPositionAsync permits an indefinitely cached result.
      // Ask the browser for a fresh fix when reopening the page.
      let coords: Coordinates;
      if (Platform.OS === 'web') {
        coords = await new Promise<Coordinates>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
              reject,
              { maximumAge: 0, timeout: 15000 },
            );
          });
      } else {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      }
      setCoordinates(coords);
      let countryCode: string | null | undefined;
      if (Platform.OS === 'web') {
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=sv`);
        if (!response.ok) throw new Error('Geocoding failed');
        const place: WebPlace = await response.json();
        countryCode = place.countryCode;
      } else {
        const places = await Location.reverseGeocodeAsync(coords);
        countryCode = places[0]?.isoCountryCode;
      }
      if (countryCode?.toUpperCase() !== 'SE') {
        if (nearestDistanceKm !== null && manualSelectionRef.current === selectionAtStart) {
          setCity(null);
          setNearestDistanceKm(null);
        }
        setLocationError(countryCode
          ? 'Din plats är utanför Sverige. Islamiska förbundets tabell gäller bara svenska städer.'
          : 'Vi kunde inte bekräfta att din plats är i Sverige. Försök igen eller välj stad.');
        return;
      }
      const dataset = query.data ?? (await query.refetch()).data;
      if (!dataset) {
        setLocationError('Bönetidstabellen kunde inte laddas. Kontrollera internetanslutningen och försök igen.');
        return;
      }
      const nearest = nearestSupportedCity(dataset.cities, coords);
      if (nearest) {
        if (manualSelectionRef.current === selectionAtStart) {
          setCity(nearest.city);
          setNearestDistanceKm(nearest.distanceKm);
        }
      } else {
        setLocationError('Ingen av tabellens städer kunde jämföras med din plats. Välj stad manuellt.');
      }
    } catch {
      setLocationError('Det gick inte att läsa eller kontrollera din plats. Försök igen eller välj stad.');
    } finally {
      locatingRef.current = false;
      setLocating(false);
    }
  };

  // Locate once when the page opens, then refresh GPS whenever the app returns
  // to the foreground after location access has been granted.
  React.useEffect(() => {
    if (!permission || !tableCacheReady || autoLocateStartedRef.current) return;
    if (!permission.granted && (Platform.OS === 'web' || permission.status !== 'undetermined')) return;
    autoLocateStartedRef.current = true;
    void locate();
  }, [permission?.status, permission?.granted]);
  const locateRef = useRef(locate);
  locateRef.current = locate;
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const refreshOnFocus = () => {
        if ((permission?.granted || hasLocationAccessRef.current) && autoLocateStartedRef.current) void locateRef.current();
      };
      const refreshOnVisible = () => {
        if (document.visibilityState === 'visible') refreshOnFocus();
      };
      window.addEventListener('focus', refreshOnFocus);
      document.addEventListener('visibilitychange', refreshOnVisible);
      return () => {
        window.removeEventListener('focus', refreshOnFocus);
        document.removeEventListener('visibilitychange', refreshOnVisible);
      };
    }
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active' && (permission?.granted || hasLocationAccessRef.current)) {
        void locateRef.current();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [permission?.granted]);

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
      nearestDistanceKm,
      coordinates,
      today,
      tomorrow,
      month,
      loading: !tableCacheReady || query.isLoading,
      locating,
      error: locationError ?? (query.error instanceof Error ? query.error.message : null),
      permission,
      locate,
      selectCity: (selectedCity) => {
        manualSelectionRef.current += 1;
        setCity(selectedCity);
        setNearestDistanceKm(null);
        setLocationError(null);
      },
      openSettings: async () => {
        if (Platform.OS !== 'web') await Linking.openSettings();
      },
      refresh: query.refetch,
    }),
    [query.data, tableCacheReady, query.isLoading, query.error, query.refetch, city, nearestDistanceKm, coordinates, today, tomorrow, month, locating, locationError, permission],
  );
  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer() {
  const value = useContext(PrayerContext);
  if (!value) throw new Error('usePrayer must be used inside PrayerProvider');
  return value;
}