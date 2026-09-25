import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from '@/components/AppBackground';
import { CityPicker } from '@/components/CityPicker';
import { usePrayer } from '@/context/PrayerContext';
import { useReminders } from '@/context/ReminderContext';
import { reminderPrayers } from '@/lib/prayer-reminders';
import { useColors } from '@/hooks/useColors';

export default function RemindersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { city } = usePrayer();
  const {
    preferences, loading, saving, permissionGranted, error,
    scheduledCount, scheduledUntil, updatePreferences, openSettings,
  } = useReminders();
  const disabled = loading || saving || Platform.OS === 'web';
  const update = (next: typeof preferences) => { void updatePreferences(next); };

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 18 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.kicker, { color: colors.softGold }]}>BÖNETIDER</Text>
        <Text style={[styles.title, { color: colors.heroForeground }]}>Påminnelser</Text>
        <Text style={[styles.intro, { color: colors.heroForeground }]}>
          Få en avisering när det är dags för dagens fem böner enligt din valda tabellstad.
        </Text>
        <View style={styles.cityPicker}><CityPicker compact /></View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={[styles.heading, { color: colors.foreground }]}>Bönepåminnelser</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>
                Av tills du väljer att slå på dem.
              </Text>
            </View>
            <Switch
              testID="reminders-enabled"
              value={preferences.enabled}
              disabled={disabled}
              onValueChange={(enabled) => update({ ...preferences, enabled })}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
          {Platform.OS === 'web' && (
            <Text style={[styles.hint, { color: colors.secondaryForeground, backgroundColor: colors.secondary }]}>
              Aviseringar kan ställas in i mobilappen på din telefon, inte i webbversionen.
            </Text>
          )}
          {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
          {permissionGranted === false && Platform.OS !== 'web' && (
            <Pressable onPress={openSettings} accessibilityRole="button">
              <Text style={[styles.settingsLink, { color: colors.primary }]}>Öppna telefonens aviseringsinställningar</Text>
            </Pressable>
          )}
          {preferences.enabled && scheduledCount !== null && !error && (
            <Text style={[styles.status, { color: colors.secondaryForeground }]}>
              {scheduledCount === 0
                ? 'Inga böner valda. Slå på en bön nedan.'
                : `${scheduledCount} aviseringar planerade${scheduledUntil
                  ? ` till ${new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long' }).format(scheduledUntil)}`
                  : ''}.`}
            </Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hur vill du bli påmind?</Text>
          <View style={styles.options}>
            {([
              { mode: 'vibration' as const, icon: 'smartphone' as const, title: 'Vibration', subtitle: 'Standardval · inget ljud' },
              { mode: 'sound' as const, icon: 'volume-2' as const, title: 'Ljud', subtitle: 'Telefonens vanliga aviseringsljud' },
            ]).map((option) => {
              const selected = preferences.mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  testID={`reminder-mode-${option.mode}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => update({ ...preferences, mode: option.mode })}
                  style={[styles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.card }]}
                >
                  <Feather name={option.icon} size={21} color={colors.primary} />
                  <Text style={[styles.optionTitle, { color: colors.foreground }]}>{option.title}</Text>
                  <Text style={[styles.optionSubtitle, { color: colors.mutedForeground }]}>{option.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.smallPrint, { color: colors.mutedForeground }]}>
            Vibration och ljud styrs även av telefonens egna aviseringsinställningar och tyst läge.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Välj böner</Text>
          {reminderPrayers.map((name, index) => (
            <View key={name} style={[styles.prayerRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.prayerName, { color: colors.foreground }]}>{name}</Text>
              <Switch
                testID={`reminder-${name}`}
                value={preferences.prayers[name]}
                disabled={disabled}
                onValueChange={(value) => update({
                  ...preferences,
                  prayers: { ...preferences.prayers, [name]: value },
                })}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.card}
              />
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Feather name="info" size={17} color={colors.heroForeground} />
          <Text style={[styles.footerText, { color: colors.heroForeground }]}>
            Soluppgång är inte en av de fem bönerna och ger ingen avisering. Tiderna gäller {city ?? 'den stad du väljer'}, inte exakt din GPS-plats. Öppna appen regelbundet för att förnya kommande påminnelser, särskilt efter ett stadsbyte eller vid årsskiftet. Avsedd för svensk tid.
          </Text>
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 110 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, marginTop: 5 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, marginTop: 8 },
  cityPicker: { marginTop: 16, marginBottom: 22, alignItems: 'flex-start' },
  card: { borderRadius: 24, padding: 18, marginBottom: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowCopy: { flex: 1 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, padding: 10, borderRadius: 12, marginTop: 13 },
  error: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 12 },
  settingsLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 12 },
  status: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 13 },
  options: { flexDirection: 'row', gap: 10 },
  option: { flex: 1, borderWidth: 1.5, borderRadius: 17, padding: 12, minHeight: 115, alignItems: 'flex-start' },
  optionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 8 },
  optionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, marginTop: 3 },
  smallPrint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 12 },
  prayerRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prayerName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 4 },
  footerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
});