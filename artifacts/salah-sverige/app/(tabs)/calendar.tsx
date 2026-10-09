import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from '@/components/AppBackground';
import { CityPicker } from '@/components/CityPicker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/context/LanguageContext';
import { usePrayer } from '@/context/PrayerContext';
import { useColors } from '@/hooks/useColors';

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { city, nearestDistanceKm, month } = usePrayer();
  const { t, locale } = useLanguage();
  const now = new Date();
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
  return (
    <AppBackground>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 14 }]}>
        <View style={styles.kickerRow}>
          <Text style={[styles.kicker, { color: colors.softGold }]}>{t.monthOverview}</Text>
          <LanguageSwitcher />
        </View>
        <Text style={[styles.title, { color: colors.heroForeground }]}>{monthName}</Text>
        <View style={styles.picker}><CityPicker compact /></View>
        {city && nearestDistanceKm !== null && (
          <Text style={[styles.nearestNotice, { color: colors.heroForeground }]}>
            {t.nearestNoticeShort(city, Math.round(nearestDistanceKm))}
          </Text>
        )}
      </View>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
          {[t.day, t.prayerNames.Fajr, t.prayerNames.Dhuhr, t.prayerNames.Asr, t.prayerNames.Maghrib, t.prayerNames.Isha].map((item, index) => (
            <Text key={index} style={[styles.th, index === 0 && styles.dayCell, { color: colors.mutedForeground }]}>{item}</Text>
          ))}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {!city ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t.chooseCityForMonth}</Text>
          ) : month.map((day) => {
            const active = day.day === now.getDate();
            return (
              <View key={day.day} style={[styles.row, { borderBottomColor: colors.border }, active && { backgroundColor: colors.secondary }]}>
                <Text style={[styles.td, styles.dayCell, { color: active ? colors.primary : colors.foreground }]}>{day.day}</Text>
                {[day.Fajr, day.Dhuhr, day.Asr, day.Maghrib, day.Isha].map((time, index) => (
                  <Text key={`${day.day}-${index}`} style={[styles.td, { color: colors.foreground }]}>{time}</Text>
                ))}
              </View>
            );
          })}
          {!!city && (
            <Text style={[styles.source, { color: colors.mutedForeground }]}>
              {nearestDistanceKm !== null ? t.sourceWithCoords : t.source}
            </Text>
          )}
        </ScrollView>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingBottom: 22 },
  kickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 31, textTransform: 'capitalize', marginTop: 5 },
  picker: { marginTop: 14, alignItems: 'flex-start' },
  nearestNotice: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19, marginTop: 10 },
  sheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 12, overflow: 'hidden' },
  tableHeader: { height: 38, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  th: { flex: 1, textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 9 },
  dayCell: { flex: 0.62, textAlign: 'center' },
  scroll: { paddingBottom: 100 },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  td: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12, fontVariant: ['tabular-nums'] },
  empty: { textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, marginTop: 50, paddingHorizontal: 40 },
  source: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 10, marginVertical: 18 },
});