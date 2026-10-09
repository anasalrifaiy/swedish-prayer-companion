import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppBackground } from '@/components/AppBackground';
import { CityPicker } from '@/components/CityPicker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/context/LanguageContext';
import { usePrayer } from '@/context/PrayerContext';
import { useReminders } from '@/context/ReminderContext';
import { getPrayerState, prayers } from '@/lib/prayer';
import type { ReminderPrayer } from '@/lib/prayer-reminders';
import { useColors } from '@/hooks/useColors';

const PRIVACY_POLICY_URL = 'https://github.com/anasalrifaiy/swedish-prayer-companion/blob/main/PRIVACY_POLICY.md';

const pad = (value: number) => String(value).padStart(2, '0');

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, locale, isRTL } = useLanguage();
  const { city, nearestDistanceKm, today, tomorrow, getDay, loading, locating, error, permission, locate, openSettings, refresh } = usePrayer();
  const {
    preferences: reminders, loading: remindersLoading, saving: remindersSaving,
    error: reminderError, permissionGranted: reminderPermission, updatePreferences, openSettings: openNotificationSettings,
  } = useReminders();
  const [now, setNow] = useState(new Date());
  const [dayOffset, setDayOffset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const state = getPrayerState(today, now, tomorrow);
  const shiftDate = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const selectedDate = shiftDate(dayOffset);
  const selectedDay = dayOffset === 0 ? today : getDay(selectedDate);
  const isToday = dayOffset === 0;
  // The timetable only covers the current calendar year.
  const canNavigate = (days: number) => {
    const target = shiftDate(days);
    return target.getFullYear() === now.getFullYear() && !!getDay(target);
  };
  const canGoPrevious = canNavigate(dayOffset - 1);
  const canGoNext = canNavigate(dayOffset + 1);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: isToday ? undefined : 'numeric' }).format(selectedDate);
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const openExactAlarmSettings = () => {
    Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() => {
      void Linking.openSettings();
    });
  };
  const webTop = Platform.OS === 'web' ? 67 : 0;
  const modeLabel = (mode: string) => (mode === 'off' ? t.modeOff : mode === 'vibration' ? t.modeVibration : t.modeSound);
  const changeDay = (days: number) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setDayOffset((value) => value + days);
  };
  const cycleReminderMode = (name: ReminderPrayer) => {
    const current = reminders.prayers[name];
    const next = current === 'off' ? 'vibration' : current === 'vibration' ? 'sound' : 'off';
    void updatePreferences({
      ...reminders,
      prayers: { ...reminders.prayers, [name]: next },
    });
  };
  const durationText = (seconds: number) => t.inDuration(Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60));

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + webTop + 14 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => refresh()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topbar}>
          <View>
            <Text style={[styles.brand, { color: colors.softGold }]}>{t.brand}</Text>
            <Text style={[styles.clock, { color: colors.heroForeground }]}>{clock}</Text>
          </View>
          <LanguageSwitcher />
        </View>
        <View style={styles.dateNav}>
          <Pressable
            testID="previous-day"
            accessibilityRole="button"
            accessibilityLabel={t.previousDay}
            disabled={!canGoPrevious}
            onPress={() => changeDay(-1)}
            hitSlop={8}
            style={[styles.navButton, { borderColor: colors.softGold }, !canGoPrevious && styles.navDisabled]}
          >
            <Feather name={isRTL ? 'chevron-right' : 'chevron-left'} size={20} color={colors.softGold} />
          </Pressable>
          <Pressable disabled={isToday} onPress={() => setDayOffset(0)} style={styles.dateButton} accessibilityRole="button" accessibilityLabel={t.backToToday}>
            <Text style={[styles.date, { color: colors.heroForeground }]} numberOfLines={2}>{date}</Text>
            {!isToday && <Text style={[styles.backToToday, { color: colors.softGold }]}>{t.backToToday}</Text>}
          </Pressable>
          <Pressable
            testID="next-day"
            accessibilityRole="button"
            accessibilityLabel={t.nextDay}
            disabled={!canGoNext}
            onPress={() => changeDay(1)}
            hitSlop={8}
            style={[styles.navButton, { borderColor: colors.softGold }, !canGoNext && styles.navDisabled]}
          >
            <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.softGold} />
          </Pressable>
        </View>
        <View style={styles.cityWrap}><CityPicker compact /></View>
        {city && nearestDistanceKm !== null && (
          <Text style={[styles.nearestNotice, { color: colors.heroForeground }]}>
            {t.nearestNotice(city, Math.round(nearestDistanceKm))}
          </Text>
        )}
        {!!city && !!error && <Text style={[styles.locationWarning, { color: colors.softGold }]}>{error}</Text>}

        {!city ? (
          <View style={[styles.permissionCard, { backgroundColor: colors.card }]}>
            <View style={[styles.permissionIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="navigation" size={25} color={colors.primary} />
            </View>
            <Text style={[styles.permissionTitle, { color: colors.foreground }]}>{t.prayerTimesWhereYouAre}</Text>
            <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
              {t.locationExplainer}
            </Text>
            {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
            <Pressable
              disabled={locating || loading}
              onPress={async () => { await Haptics.selectionAsync(); await locate(); }}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              {locating || loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="crosshair" size={19} color={colors.primaryForeground} />}
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{t.findMyLocation}</Text>
            </Pressable>
            {permission?.status === 'denied' && permission.canAskAgain === false && (
              <Pressable onPress={openSettings}><Text style={[styles.settings, { color: colors.primary }]}>{t.openSettings}</Text></Pressable>
            )}
          </View>
        ) : (
          <>
            {isToday && (
              <View style={styles.heroCopy}>
                <View style={[styles.heroCityBadge, { borderColor: colors.softGold }]}>
                  <Feather name="map-pin" size={15} color={colors.softGold} />
                  <Text style={[styles.heroCity, { color: colors.heroForeground }]} numberOfLines={2}>
                    {t.tableTimesFor(city)}
                  </Text>
                </View>
                <Text style={[styles.kicker, { color: colors.softGold }]}>{t.nextPrayer}</Text>
                <Text style={[styles.nextPrayer, { color: colors.heroForeground }]}>
                   {state.next ? t.prayerNames[state.next.name] : t.noTime}
                </Text>
                <Text style={[styles.nextTime, { color: colors.heroForeground }]}>
                   {state.next ? `${pad(state.next.time.getHours())}:${pad(state.next.time.getMinutes())}` : '--:--'}
                </Text>
                <View style={[styles.countdown, { backgroundColor: colors.softGold }]}>
                  <Feather name="clock" size={15} color={colors.accentForeground} />
                  <Text style={[styles.countdownText, { color: colors.accentForeground }]}>
                     {state.next ? durationText(state.secondsLeft) : t.tableMissing}
                  </Text>
                </View>
              </View>
            )}
            <View style={[styles.scheduleCard, { backgroundColor: colors.card }, !isToday && styles.scheduleCardOtherDay]}>
              <View style={styles.scheduleHeader}>
                <View>
                  <Text style={[styles.scheduleTitle, { color: colors.foreground }]}>{isToday ? t.todaysTimes : t.dayTimes}</Text>
                  <Text style={[styles.scheduleSubtitle, { color: colors.mutedForeground }]}>{city}</Text>
                </View>
                <View style={[styles.officialBadge, { backgroundColor: colors.secondary }]}>
                  <Feather name="check-circle" size={13} color={colors.primary} />
                  <Text style={[styles.officialText, { color: colors.secondaryForeground }]}>{t.officialTable}</Text>
                </View>
              </View>
              <Text style={[styles.reminderHint, { color: colors.mutedForeground }]}>
                {Platform.OS === 'web' ? t.reminderHintWeb : t.reminderHint}
              </Text>
              {!!reminderError && <Text style={[styles.reminderError, { color: colors.destructive }]}>{reminderError}</Text>}
              {reminderPermission === false && Platform.OS !== 'web' && !!reminderError && (
                <Pressable onPress={openNotificationSettings} accessibilityRole="button">
                  <Text style={[styles.reminderSettings, { color: colors.primary }]}>{t.openNotificationSettings}</Text>
                </Pressable>
              )}
              {Platform.OS === 'android' && reminderPermission && (
                <Pressable onPress={openExactAlarmSettings} accessibilityRole="button">
                  <Text style={[styles.reminderSettings, { color: colors.primary }]}>{t.exactAlarmSettings}</Text>
                </Pressable>
              )}
              {!selectedDay && !loading && <Text style={[styles.reminderError, { color: colors.mutedForeground }]}>{t.noDataForDay}</Text>}
              {prayers.map((name, index) => {
                 const active = isToday && state.next?.name === name && state.next.time.getDate() === now.getDate();
                  const reminderMode = name === 'Shuruk' ? 'off' : reminders.prayers[name];
                  const reminderOn = reminderMode !== 'off';
                return (
                  <View key={name} style={[styles.prayerRow, index < prayers.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <View style={[styles.prayerIcon, { backgroundColor: active ? colors.primary : colors.muted }]}>
                      <Feather name={name === 'Fajr' || name === 'Isha' ? 'moon' : name === 'Shuruk' ? 'sunrise' : name === 'Maghrib' ? 'sunset' : 'sun'} size={17} color={active ? colors.primaryForeground : colors.primary} />
                    </View>
                    <Text style={[styles.prayerName, { color: active ? colors.primary : colors.foreground }]}>{t.prayerNames[name]}</Text>
                    <Text style={[styles.prayerTime, { color: colors.foreground }]}>{selectedDay?.[name] ?? '--:--'}</Text>
                    {name === 'Shuruk' ? (
                      <View style={styles.reminderSpacer} />
                    ) : (
                      <Pressable
                        testID={`today-reminder-${name}`}
                        accessibilityRole="button"
                        accessibilityLabel={t.reminderLabel(t.prayerNames[name], modeLabel(reminderMode))}
                        accessibilityHint={t.reminderHintA11y}
                        accessibilityState={{ disabled: remindersLoading || remindersSaving || Platform.OS === 'web' }}
                        disabled={remindersLoading || remindersSaving || Platform.OS === 'web'}
                        onPress={() => cycleReminderMode(name)}
                        hitSlop={3}
                        style={({ pressed }) => [
                          styles.reminderButton,
                          { backgroundColor: reminderOn ? colors.secondary : 'transparent' },
                          pressed && styles.pressed,
                        ]}
                      >
                        {reminderMode === 'vibration'
                          ? <MaterialCommunityIcons name="vibrate" size={19} color={colors.primary} />
                          : <Feather name={reminderMode === 'sound' ? 'volume-2' : 'bell-off'} size={17} color={reminderOn ? colors.primary : colors.mutedForeground} />}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={[styles.source, { color: colors.mutedForeground }]}>{t.source}</Text>
            {nearestDistanceKm !== null && (
              <Text style={[styles.coordinateSource, { color: colors.mutedForeground }]}>{t.coordinateSource}</Text>
            )}
            <Pressable
              accessibilityRole="link"
              onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }}
              style={styles.privacyLink}
            >
              <Text style={[styles.coordinateSource, { color: colors.primary }]}>{t.privacy}</Text>
            </Pressable>
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
  date: { fontFamily: 'Inter_600SemiBold', fontSize: 15, textAlign: 'center', textTransform: 'capitalize' },
  clock: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 4, fontVariant: ['tabular-nums'] },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 },
  navButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navDisabled: { opacity: 0.3 },
  dateButton: { flex: 1, alignItems: 'center' },
  backToToday: { fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 3, letterSpacing: 1 },
  scheduleCardOtherDay: { marginTop: 18 },
  reminderSpacer: { width: 40, height: 40, marginLeft: 10 },
  cityWrap: { marginTop: 14, alignItems: 'flex-start' },
  nearestNotice: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19, marginTop: 13 },
  locationWarning: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 10 },
  heroCopy: { alignItems: 'center', paddingTop: 18, paddingBottom: 20 },
  heroCityBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7 },
  heroCity: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 19, textAlign: 'center' },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2, marginTop: 14 },
  nextPrayer: { fontFamily: 'Inter_600SemiBold', fontSize: 23, marginTop: 8 },
  nextTime: { fontFamily: 'Inter_700Bold', fontSize: 58, letterSpacing: -2, lineHeight: 66 },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, marginTop: 8 },
  countdownText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  scheduleCard: { borderRadius: 28, padding: 18 },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 11 },
  scheduleTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  scheduleSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 3 },
  officialBadge: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14 },
  officialText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  reminderHint: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginBottom: 4 },
  reminderError: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18, marginVertical: 6 },
  reminderSettings: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 },
  prayerRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center' },
  prayerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  prayerName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  prayerTime: { fontFamily: 'Inter_700Bold', fontSize: 17, fontVariant: ['tabular-nums'] },
  reminderButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  source: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 15 },
  coordinateSource: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  privacyLink: { alignSelf: 'center', padding: 8 },
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