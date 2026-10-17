import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { getGetPrayerTimesQueryKey } from '@workspace/api-client-react';
import { useLanguage } from '@/context/LanguageContext';
import { apiBaseUrl } from '@/lib/api-config';
import { authorityFor, globalDataset, GlobalPlace } from '@/lib/global-prayer';
import {
  nearestSupportedCity,
  normalizePrayerDataset,
  PRAYER_DATA_URL,
  PrayerDay,
  PrayerDataset,
} from '@/lib/prayer';

const PRAYER_CACHE_KEY = 'prayer-sverige:official-timetable:v1';
const LOCATION_CACHE_KEY = 'prayer-sverige:location:v1';
const prayerQueryKey = getGetPrayerTimesQueryKey();

export type LocationErrorKey =
  | 'errSavedCityRead' | 'errSavedCityMissing' | 'errCitySave' | 'errLocationNeeded'
  | 'errTableLoad' | 'errNoCityCompared' | 'errLocationRead' | 'errOutsideSweden'
  | 'errCannotConfirmSweden';

class TableHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

type CachedPrayerDataset = { calendarYear: number; dataset: PrayerDataset };
type LocationMode = 'automatic' | 'manual';
type CachedLocation = { version: 1; city: string | null; mode: LocationMode; globalPlace?: GlobalPlace | null };

function isGlobalPlace(value: unknown): value is GlobalPlace {
  if (!value || typeof value !== 'object') return false;
  const place = value as Partial<GlobalPlace>;
  return typeof place.name === 'string'
    && Number.isFinite(place.latitude)
    && Number.isFinite(place.longitude)
    && (place.countryCode === null || typeof place.countryCode === 'string');
}

function isCachedPrayerDataset(value: unknown): value is CachedPrayerDataset {
  if (!value || typeof value !== 'object') return false;
  const cached = value as Partial<CachedPrayerDataset>;
  return Number.isInteger(cached.calendarYear)
    && !!cached.dataset
    && Array.isArray(cached.dataset.cities)
    && typeof cached.dataset.tables === 'object';
}

function isCachedLocation(value: unknown): value is CachedLocation {
  if (!value || typeof value !== 'object') return false;
  const cached = value as Partial<CachedLocation>;
  return cached.version === 1
    && (cached.city === null || typeof cached.city === 'string')
    && (cached.mode === 'automatic' || cached.mode === 'manual');
}

type Coordinates = { latitude: number; longitude: number };
type WebPlace = { countryCode?: string; city?: string; locality?: string; countryName?: string };
type PrayerContextValue = {
  dataset?: PrayerDataset;
  swedishCities: string[];
  globalMethod: string | null;
  city: string | null;
  nearestDistanceKm: number | null;
  coordinates: Coordinates | null;
  today?: PrayerDay;
  tomorrow?: PrayerDay;
  month: PrayerDay[];
  getDay: (date: Date) => PrayerDay | undefined;
  loading: boolean;
  locating: boolean;
  error: string | null;
  locationErrorKey: LocationErrorKey | null;
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
  const [locationMode, setLocationMode] = useState<LocationMode>('automatic');
  const [globalPlace, setGlobalPlace] = useState<GlobalPlace | null>(null);
  const [nearestDistanceKm, setNearestDistanceKm] = useState<number | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const { t } = useLanguage();
  const [locationErrorKey, setLocationError] = useState<LocationErrorKey | null>(null);
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
        if (active && stored) {
          const cached: unknown = JSON.parse(stored);
          if (isCachedPrayerDataset(cached) && cached.calendarYear === new Date().getFullYear()) {
            queryClient.setQueryData(prayerQueryKey, cached.dataset, { updatedAt: 0 });
          } else {
            await AsyncStorage.removeItem(PRAYER_CACHE_KEY);
          }
        }
      } catch {
        await AsyncStorage.removeItem(PRAYER_CACHE_KEY).catch(() => undefined);
      }
      try {
        const storedLocation = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
        if (active && storedLocation) {
          const cachedLocation: unknown = JSON.parse(storedLocation);
          if (isCachedLocation(cachedLocation)) {
            setCity(cachedLocation.city);
            setLocationMode(cachedLocation.mode);
            if (isGlobalPlace(cachedLocation.globalPlace) && cachedLocation.globalPlace.name === cachedLocation.city) {
              setGlobalPlace(cachedLocation.globalPlace);
            }
          } else {
            await AsyncStorage.removeItem(LOCATION_CACHE_KEY);
          }
        }
      } catch {
        if (active) setLocationError('errSavedCityRead');
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
        throw new TableHttpError(response.status);
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

  React.useEffect(() => {
    if (!tableCacheReady) return;
    void AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({
      version: 1,
      city,
      mode: locationMode,
      globalPlace,
    } satisfies CachedLocation)).catch(() => {
      setLocationError('errCitySave');
    });
  }, [tableCacheReady, city, locationMode, globalPlace]);

  React.useEffect(() => {
    if (query.data && city && !globalPlace && !query.data.cities.includes(city)) {
      autoLocateStartedRef.current = false;
      setCity(null);
      setLocationMode('automatic');
      setNearestDistanceKm(null);
      setLocationError('errSavedCityMissing');
    }
  }, [query.data, city, globalPlace]);

  const refreshLocation = async () => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    const selectionAtStart = manualSelectionRef.current;
    setLocating(true);
    setLocationError(null);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) {
        setLocationError('errLocationNeeded');
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
      let placeName: string | undefined;
      if (Platform.OS === 'web') {
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=sv`);
        if (!response.ok) throw new Error('Geocoding failed');
        const place: WebPlace = await response.json();
        countryCode = place.countryCode;
        placeName = place.city || place.locality || place.countryName;
      } else {
        const places = await Location.reverseGeocodeAsync(coords);
        countryCode = places[0]?.isoCountryCode;
        placeName = places[0]?.city ?? places[0]?.subregion ?? places[0]?.region ?? places[0]?.country ?? undefined;
      }
      // If the geocoder gives no country, fall back to a rough Sweden bounding box.
      const inSwedenBox = coords.latitude >= 55 && coords.latitude <= 69.5
        && coords.longitude >= 10.5 && coords.longitude <= 24.5;
      const inSweden = countryCode ? countryCode.toUpperCase() === 'SE' : inSwedenBox;
      if (!inSweden) {
        if (manualSelectionRef.current === selectionAtStart) {
          const name = placeName || `${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`;
          setGlobalPlace({
            name,
            countryCode: countryCode?.toUpperCase() ?? null,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          setCity(name);
          setNearestDistanceKm(null);
        }
        return;
      }
      if (manualSelectionRef.current === selectionAtStart) setGlobalPlace(null);
      const dataset = query.data ?? (await query.refetch()).data;
      if (!dataset) {
        setLocationError('errTableLoad');
        return;
      }
      const nearest = nearestSupportedCity(dataset.cities, coords);
      if (nearest) {
        if (manualSelectionRef.current === selectionAtStart) {
          setCity(nearest.city);
          setNearestDistanceKm(nearest.distanceKm);
        }
      } else {
        setLocationError('errNoCityCompared');
      }
    } catch {
      setLocationError('errLocationRead');
    } finally {
      locatingRef.current = false;
      setLocating(false);
    }
  };
  const locate = () => {
    setLocationMode('automatic');
    return refreshLocation();
  };

  // Locate once when the page opens, then refresh GPS whenever the app returns
  // to the foreground after location access has been granted.
  React.useEffect(() => {
    if (locationMode !== 'automatic' || !permission || !tableCacheReady || autoLocateStartedRef.current) return;
    if (!permission.granted && (Platform.OS === 'web' || permission.status !== 'undetermined')) return;
    autoLocateStartedRef.current = true;
    void refreshLocation();
  }, [permission?.status, permission?.granted, tableCacheReady, locationMode]);
  const locateRef = useRef(refreshLocation);
  locateRef.current = refreshLocation;
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const refreshOnFocus = () => {
        if (locationMode === 'automatic' && (permission?.granted || hasLocationAccessRef.current) && autoLocateStartedRef.current) void locateRef.current();
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
      if (locationMode === 'automatic'
        && previousState !== 'active'
        && nextState === 'active'
        && (permission?.granted || hasLocationAccessRef.current)) {
        void locateRef.current();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [permission?.granted, locationMode]);

  const year = date.getFullYear();
  const globalData = useMemo(() => (globalPlace ? globalDataset(globalPlace, year) : undefined), [globalPlace, year]);
  const activeDataset = globalData ?? query.data;
  const month = city ? activeDataset?.tables[city]?.[String(date.getMonth() + 1)] ?? [] : [];
  const getDay = (target: Date) => (city
    ? activeDataset?.tables[city]?.[String(target.getMonth() + 1)]?.find((day) => day.day === target.getDate())
    : undefined);
  const today = month.find((day) => day.day === date.getDate());
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + 1);
  const tomorrow = getDay(nextDate);
  const queryErrorMessage = globalPlace ? null : query.error instanceof TableHttpError
    ? t.errTableHttp(query.error.status)
    : query.error instanceof Error ? query.error.message : null;
  const value = useMemo<PrayerContextValue>(
    () => ({
      dataset: activeDataset,
      swedishCities: query.data?.cities ?? [],
      globalMethod: globalPlace ? authorityFor(globalPlace.countryCode).label : null,
      city,
      nearestDistanceKm,
      coordinates,
      today,
      tomorrow,
      month,
      getDay,
      loading: !tableCacheReady || (!globalPlace && query.isLoading),
      locating,
      error: (locationErrorKey ? t[locationErrorKey] : null) ?? queryErrorMessage,
      locationErrorKey,
      permission,
      locate,
      selectCity: (selectedCity) => {
        manualSelectionRef.current += 1;
        setGlobalPlace(null);
        setCity(selectedCity);
        setLocationMode('manual');
        setNearestDistanceKm(null);
        setLocationError(null);
      },
      openSettings: async () => {
        if (Platform.OS !== 'web') await Linking.openSettings();
      },
      refresh: query.refetch,
    }),
    [activeDataset, globalPlace, query.data, tableCacheReady, query.isLoading, queryErrorMessage, query.refetch, city, nearestDistanceKm, coordinates, today, tomorrow, month, locating, locationErrorKey, t, permission],
  );
  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer() {
  const value = useContext(PrayerContext);
  if (!value) throw new Error('usePrayer must be used inside PrayerProvider');
  return value;
}