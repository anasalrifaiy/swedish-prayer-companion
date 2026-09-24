import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppBackground } from '@/components/AppBackground';
import { CityPicker } from '@/components/CityPicker';
import { usePrayer } from '@/context/PrayerContext';
import { getPrayerState, prayers, swedishPrayerNames } from '@/lib/prayer';
import { useColors } from '@/hooks/useColors';

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} tim ${m} min` : `${m} min`;
}

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { city, today, tomorrow, loading, locating, error, permission, locate, openSettings, refresh } = usePrayer();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const state = getPrayerState(today, now, tomorrow);
  const date = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const webTop = Platform.OS === 'web' ? 67 : 0;

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + webTop + 14 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => refresh()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topbar}>
          <View>
            <Text style={[styles.brand, { color: colors.softGold }]}>SALAH SVERIGE</Text>
            <Text style={[styles.date, { color: colors.primaryForeground }]}>{date}</Text>
          </View>
          <View style={[styles.star, { borderColor: colors.softGold }]}>
            <MaterialCommunityIcons name="star-four-points-outline" size={21} color={colors.softGold} />
          </View>
        </View>
        <View style={styles.cityWrap}><CityPicker compact /></View>

        {!city ? (
          <View style={[styles.permissionCard, { backgroundColor: colors.card }]}>
            <View style={[styles.permissionIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="navigation" size={25} color={colors.primary} />
            </View>
            <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Bönetider där du är</Text>
            <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
              Vi använder din plats för att hitta din stad i Islamiska förbundets svenska tabell. I webbläsaren används en separat karttjänst för att slå upp stadens namn.
            </Text>
            {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
            <Pressable
              disabled={locating || loading}
              onPress={async () => { await Haptics.selectionAsync(); await locate(); }}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              {locating || loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="crosshair" size={19} color={colors.primaryForeground} />}
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Hitta min plats</Text>
            </Pressable>
            {permission?.status === 'denied' && permission.canAskAgain === false && (
              <Pressable onPress={openSettings}><Text style={[styles.settings, { color: colors.primary }]}>Öppna inställningar</Text></Pressable>
            )}
          </View>
        ) : (
          <>
            <View style={styles.heroCopy}>
              <Text style={[styles.kicker, { color: colors.softGold }]}>NÄSTA BÖN</Text>
              <Text style={[styles.nextPrayer, { color: colors.primaryForeground }]}>
                 {state.next ? swedishPrayerNames[state.next.name] : 'Ingen tid'}
              </Text>
              <Text style={[styles.nextTime, { color: colors.primaryForeground }]}>
                 {state.next ? `${String(state.next.time.getHours()).padStart(2, '0')}:${String(state.next.time.getMinutes()).padStart(2, '0')}` : '--:--'}
              </Text>
              <View style={[styles.countdown, { backgroundColor: colors.softGold }]}>
                <Feather name="clock" size={15} color={colors.accentForeground} />
                <Text style={[styles.countdownText, { color: colors.accentForeground }]}>
                   {state.next ? `om ${formatDuration(state.secondsLeft)}` : 'Tabell saknas'}
                </Text>
              </View>
            </View>
            <View style={[styles.scheduleCard, { backgroundColor: colors.card }]}>
              <View style={styles.scheduleHeader}>
                <View>
                  <Text style={[styles.scheduleTitle, { color: colors.foreground }]}>Dagens tider</Text>
                  <Text style={[styles.scheduleSubtitle, { color: colors.mutedForeground }]}>{city}</Text>
                </View>
                <View style={[styles.officialBadge, { backgroundColor: colors.secondary }]}>
                  <Feather name="check-circle" size={13} color={colors.primary} />
                  <Text style={[styles.officialText, { color: colors.secondaryForeground }]}>Officiell tabell</Text>
                </View>
              </View>
              {prayers.map((name, index) => {
                 const active = state.next?.name === name && state.next.time.getDate() === now.getDate();
                return (
                  <View key={name} style={[styles.prayerRow, index < prayers.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <View style={[styles.prayerIcon, { backgroundColor: active ? colors.primary : colors.muted }]}>
                      <Feather name={name === 'Fajr' || name === 'Isha' ? 'moon' : name === 'Shuruk' ? 'sunrise' : name === 'Maghrib' ? 'sunset' : 'sun'} size={17} color={active ? colors.primaryForeground : colors.primary} />
                    </View>
                    <Text style={[styles.prayerName, { color: active ? colors.primary : colors.foreground }]}>{swedishPrayerNames[name]}</Text>
                    <Text style={[styles.prayerTime, { color: colors.foreground }]}>{today?.[name] ?? '--:--'}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.source, { color: colors.mutedForeground }]}>Källa: Islamiska förbundet i Sverige</Text>
          </>
        )}
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 112, minHeight: '100%' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 2.1 },
  date: { fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 4, textTransform: 'capitalize', opacity: 0.9 },
  star: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cityWrap: { marginTop: 18, alignItems: 'flex-start' },
  heroCopy: { alignItems: 'center', paddingTop: 24, paddingBottom: 26 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 },
  nextPrayer: { fontFamily: 'Inter_500Medium', fontSize: 22, marginTop: 8 },
  nextTime: { fontFamily: 'Inter_700Bold', fontSize: 58, letterSpacing: -2, lineHeight: 66 },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, marginTop: 8 },
  countdownText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  scheduleCard: { borderRadius: 28, padding: 18 },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 11 },
  scheduleTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  scheduleSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 3 },
  officialBadge: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14 },
  officialText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  prayerRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center' },
  prayerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  prayerName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  prayerTime: { fontFamily: 'Inter_700Bold', fontSize: 17, fontVariant: ['tabular-nums'] },
  source: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 15 },
  permissionCard: { borderRadius: 28, padding: 24, alignItems: 'center', marginTop: 54 },
  permissionIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  permissionTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, textAlign: 'center' },
  permissionBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  primaryButton: { minHeight: 52, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 22, marginTop: 20, alignSelf: 'stretch' },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  settings: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});