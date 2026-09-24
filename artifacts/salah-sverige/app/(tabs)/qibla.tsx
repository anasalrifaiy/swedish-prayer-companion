import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { AppBackground } from '@/components/AppBackground';
import { usePrayer } from '@/context/PrayerContext';
import { qiblaBearing } from '@/lib/prayer';
import { useColors } from '@/hooks/useColors';

export default function QiblaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { coordinates, city, locating, locate } = usePrayer();
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchHeadingAsync((value) => setHeading(value.trueHeading >= 0 ? value.trueHeading : value.magHeading))
      .then((value) => { subscription = value; })
      .catch(() => setHeading(null));
    return () => subscription?.remove();
  }, []);
  const bearing = coordinates ? qiblaBearing(coordinates.latitude, coordinates.longitude) : null;
  const rotation = bearing !== null && heading !== null ? bearing - heading : bearing ?? 0;
  const aligned = bearing !== null && heading !== null && Math.abs(((rotation + 540) % 360) - 180) < 5;

  return (
    <AppBackground>
      <View style={[styles.content, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 18 }]}>
        <Text style={[styles.kicker, { color: colors.softGold }]}>QIBLAKOMPASS</Text>
        <Text style={[styles.title, { color: colors.primaryForeground }]}>Mot Kaba</Text>
        <Text style={[styles.subtitle, { color: colors.primaryForeground }]}>
          {city ? `Från ${city}` : 'Hämta din plats för rätt riktning'}
        </Text>
        <View style={[styles.compassOuter, { borderColor: colors.softGold, backgroundColor: colors.card }]}>
          <Text style={[styles.north, { color: colors.mutedForeground }]}>N</Text>
          <Text style={[styles.east, { color: colors.mutedForeground }]}>Ö</Text>
          <Text style={[styles.south, { color: colors.mutedForeground }]}>S</Text>
          <Text style={[styles.west, { color: colors.mutedForeground }]}>V</Text>
          <View style={[styles.tickCircle, { borderColor: colors.border }]} />
          <View style={[styles.needleWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
            <View style={[styles.needle, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="star-four-points" size={26} color={colors.primaryForeground} />
            </View>
            <View style={[styles.needleTail, { backgroundColor: colors.mutedForeground }]} />
          </View>
          <View style={[styles.center, { backgroundColor: colors.accent }]} />
        </View>
        {bearing !== null ? (
          <View style={[styles.readout, { backgroundColor: colors.card }]}>
            <View>
              <Text style={[styles.readoutLabel, { color: colors.mutedForeground }]}>RIKTNING</Text>
              <Text style={[styles.readoutValue, { color: colors.foreground }]}>{Math.round(bearing)}°</Text>
            </View>
            <View style={[styles.status, { backgroundColor: aligned ? colors.secondary : colors.muted }]}>
              <Feather name={aligned ? 'check-circle' : 'compass'} size={17} color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.secondaryForeground }]}>
                {heading === null ? 'Vrid telefonen' : aligned ? 'Rätt riktning' : 'Följ pilen'}
              </Text>
            </View>
          </View>
        ) : (
          <Pressable
            disabled={locating}
            onPress={locate}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.softGold }, pressed && styles.pressed]}
          >
            <Feather name="crosshair" size={19} color={colors.accentForeground} />
            <Text style={[styles.buttonText, { color: colors.accentForeground }]}>{locating ? 'Hämtar plats…' : 'Hämta min plats'}</Text>
          </Pressable>
        )}
        <Text style={[styles.note, { color: colors.primaryForeground }]}>
          Håll telefonen plant och borta från metall. Kompassen fungerar bäst på en fysisk enhet.
        </Text>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 22, alignItems: 'center', paddingBottom: 96 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34, marginTop: 6 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, opacity: 0.78, marginTop: 3 },
  compassOuter: { width: 284, height: 284, borderRadius: 142, borderWidth: 2, marginTop: 36, alignItems: 'center', justifyContent: 'center' },
  tickCircle: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1 },
  north: { position: 'absolute', top: 15, fontFamily: 'Inter_700Bold' },
  east: { position: 'absolute', right: 18, fontFamily: 'Inter_700Bold' },
  south: { position: 'absolute', bottom: 15, fontFamily: 'Inter_700Bold' },
  west: { position: 'absolute', left: 18, fontFamily: 'Inter_700Bold' },
  needleWrap: { position: 'absolute', width: 70, height: 220, alignItems: 'center' },
  needle: { width: 54, height: 102, borderTopLeftRadius: 27, borderTopRightRadius: 27, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, alignItems: 'center', paddingTop: 15 },
  needleTail: { width: 18, height: 76, borderBottomLeftRadius: 9, borderBottomRightRadius: 9, opacity: 0.45 },
  center: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  readout: { width: '100%', borderRadius: 22, padding: 17, marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readoutLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  readoutValue: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 2 },
  status: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  button: { minHeight: 54, alignSelf: 'stretch', borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 28 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', opacity: 0.65, marginTop: 17, paddingHorizontal: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});