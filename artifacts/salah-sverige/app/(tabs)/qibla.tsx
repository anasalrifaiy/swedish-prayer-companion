import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { AppBackground } from '@/components/AppBackground';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/context/LanguageContext';
import { usePrayer } from '@/context/PrayerContext';
import { cityCoordinates } from '@/lib/city-coordinates';
import { angleDelta, qiblaBearing, qiblaDistanceKm, smoothHeading } from '@/lib/prayer';
import { useColors } from '@/hooks/useColors';

const ALIGNED_TOLERANCE_DEGREES = 3;

export default function QiblaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const { coordinates, city, locating, locate, error, permission, openSettings } = usePrayer();
  const [heading, setHeading] = useState<number | null>(null);
  const [lowAccuracy, setLowAccuracy] = useState(false);
  const [sensorError, setSensorError] = useState(false);
  const smoothedRef = useRef<number | null>(null);
  const cityCenter = city ? cityCoordinates[city] : undefined;
  const cityPosition = cityCenter ? { latitude: cityCenter[0], longitude: cityCenter[1] } : null;
  useEffect(() => {
    if (Platform.OS === 'web' || !permission?.granted) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    smoothedRef.current = null;
    Location.watchHeadingAsync((value) => {
      if (cancelled) return;
      // trueHeading corrects for magnetic declination but is -1 until a location fix exists.
      const raw = value.trueHeading >= 0 ? value.trueHeading : value.magHeading;
      smoothedRef.current = smoothHeading(smoothedRef.current, raw);
      setHeading(smoothedRef.current);
      setLowAccuracy(value.accuracy >= 0 && value.accuracy <= 1);
    })
      .then((value) => { if (cancelled) value.remove(); else subscription = value; })
      .catch(() => { if (!cancelled) setSensorError(true); });
    return () => { cancelled = true; subscription?.remove(); };
  }, [permission?.granted]);
  const bearingCoordinates = coordinates ?? cityPosition;
  const bearing = bearingCoordinates ? qiblaBearing(bearingCoordinates.latitude, bearingCoordinates.longitude) : null;
  const distanceKm = bearingCoordinates ? qiblaDistanceKm(bearingCoordinates.latitude, bearingCoordinates.longitude) : null;
  const rotation = bearing !== null && heading !== null ? angleDelta(heading, bearing) : bearing ?? 0;
  const aligned = bearing !== null && heading !== null && Math.abs(rotation) < ALIGNED_TOLERANCE_DEGREES;
  const liveCompass = Platform.OS !== 'web' && heading !== null;
  const wasAligned = useRef(false);
  useEffect(() => {
    if (aligned && !wasAligned.current && Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    wasAligned.current = aligned;
  }, [aligned]);

  return (
    <AppBackground>
      <View style={[styles.content, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 18 }]}>
        <View style={styles.langRow}><LanguageSwitcher /></View>
        <Text style={[styles.kicker, { color: colors.softGold }]}>{t.qiblaCompass}</Text>
        <Text style={[styles.title, { color: colors.heroForeground }]}>{t.towardsKaaba}</Text>
        <Text style={[styles.subtitle, { color: colors.heroForeground }]}>
          {coordinates ? t.fromCurrentLocation : cityPosition && city ? t.approxFromCity(city) : city ? t.getLocationNear(city) : t.getLocationForDirection}
        </Text>
        <View style={[styles.compassOuter, { borderColor: aligned ? colors.primary : colors.softGold, backgroundColor: colors.card }, aligned && styles.compassAligned]}>
          <View style={[styles.dial, { transform: [{ rotate: `${liveCompass ? -heading : 0}deg` }] }]}>
            <Text style={[styles.north, { color: colors.mutedForeground }]}>{t.compassDirections.N}</Text>
            <Text style={[styles.east, { color: colors.mutedForeground }]}>{t.compassDirections.E}</Text>
            <Text style={[styles.south, { color: colors.mutedForeground }]}>{t.compassDirections.S}</Text>
            <Text style={[styles.west, { color: colors.mutedForeground }]}>{t.compassDirections.W}</Text>
          </View>
          <View style={[styles.tickCircle, { borderColor: colors.border }]} />
          <View style={[styles.needleWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
            <View style={[styles.needle, { borderBottomColor: colors.primary }]} />
            <View style={[styles.needleTail, { borderTopColor: colors.mutedForeground }]} />
          </View>
          <View style={[styles.center, { backgroundColor: colors.accent }]} />
        </View>
        {bearing !== null ? (
          <View style={[styles.readout, { backgroundColor: colors.card }]}>
            <View>
              <Text style={[styles.readoutLabel, { color: colors.mutedForeground }]}>{t.bearingLabel}</Text>
              <Text style={[styles.readoutValue, { color: colors.foreground }]}>{Math.round(bearing)}°</Text>
            </View>
            {distanceKm !== null && (
              <View>
                <Text style={[styles.readoutLabel, { color: colors.mutedForeground }]}>{t.distanceLabel}</Text>
                <Text style={[styles.readoutValue, { color: colors.foreground }]}>
                  {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceKm)} km
                </Text>
              </View>
            )}
            <View style={[styles.status, { backgroundColor: aligned ? colors.secondary : colors.muted }]}>
              <Feather name={aligned ? 'check-circle' : 'compass'} size={17} color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.secondaryForeground }]}>
                {!liveCompass ? t.fromNorth : aligned ? t.correctDirection : t.followArrow}
              </Text>
            </View>
          </View>
        ) : null}
        {!coordinates && (
          <Pressable
            disabled={locating}
            onPress={locate}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.softGold }, pressed && styles.pressed]}
          >
            <Feather name="crosshair" size={19} color={colors.accentForeground} />
            <Text style={[styles.buttonText, { color: colors.accentForeground }]}>{locating ? t.gettingLocation : t.getMyLocation}</Text>
          </Pressable>
        )}
        {!!error && <Text style={[styles.feedback, { color: colors.softGold }]}>{error}</Text>}
        {permission?.status === 'denied' && !permission.canAskAgain && Platform.OS !== 'web' && (
          <Pressable onPress={openSettings}><Text style={[styles.feedback, { color: colors.softGold }]}>{t.openLocationSettings}</Text></Pressable>
        )}
        {lowAccuracy && liveCompass && (
          <Text style={[styles.feedback, { color: colors.softGold }]}>{t.calibrate}</Text>
        )}
        <Text style={[styles.note, { color: colors.foreground, backgroundColor: colors.card }]}>
          {Platform.OS === 'web'
            ? t.webCompassNote
            : sensorError
              ? t.sensorUnavailable
              : heading === null
                ? t.waitingForCompass
                : t.compassNote}
        </Text>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 22, alignItems: 'center', paddingBottom: 96 },
  langRow: { alignSelf: 'flex-end', marginBottom: 10 },
  compassAligned: { borderWidth: 4 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34, marginTop: 6 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 3 },
  compassOuter: { width: 284, height: 284, borderRadius: 142, borderWidth: 2, marginTop: 36, alignItems: 'center', justifyContent: 'center' },
  dial: { position: 'absolute', width: 280, height: 280 },
  tickCircle: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1 },
  north: { position: 'absolute', top: 15, left: 0, right: 0, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  east: { position: 'absolute', right: 18, top: 131, fontFamily: 'Inter_700Bold' },
  south: { position: 'absolute', bottom: 15, left: 0, right: 0, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  west: { position: 'absolute', left: 18, top: 131, fontFamily: 'Inter_700Bold' },
  needleWrap: { position: 'absolute', width: 70, height: 220, alignItems: 'center' },
  needle: { width: 0, height: 0, borderLeftWidth: 24, borderRightWidth: 24, borderBottomWidth: 96, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  needleTail: { width: 0, height: 0, borderLeftWidth: 24, borderRightWidth: 24, borderTopWidth: 96, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  center: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  readout: { width: '100%', borderRadius: 22, padding: 17, marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readoutLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  readoutValue: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 2 },
  status: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  button: { minHeight: 54, alignSelf: 'stretch', borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 28 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  note: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 17, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 16 },
  feedback: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});