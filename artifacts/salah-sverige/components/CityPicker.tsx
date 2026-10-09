import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/context/LanguageContext';
import { usePrayer } from '@/context/PrayerContext';
import { useColors } from '@/hooks/useColors';
import { normalizePlace } from '@/lib/prayer';

export function CityPicker({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const { t } = useLanguage();
  const { city, dataset, selectCity, locate, locating } = usePrayer();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = (dataset?.cities ?? []).filter((item) => normalizePlace(item).includes(normalizePlace(query)));
  return (
    <>
      <Pressable
        testID="city-picker"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, { backgroundColor: colors.card }, pressed && styles.pressed]}
      >
        <Feather name="map-pin" size={16} color={colors.primary} />
        <Text numberOfLines={1} style={[styles.triggerText, { color: colors.foreground }]}>
          {city ?? (compact ? t.chooseCity : t.chooseNearestCity)}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>{t.tableEyebrow}</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>{t.chooseCity}</Text>
            </View>
            <Pressable onPress={() => setVisible(false)} hitSlop={12}>
              <Feather name="x" size={25} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t.searchCities}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
            />
          </View>
          <Pressable
            disabled={locating}
            onPress={async () => {
              await locate();
              setVisible(false);
            }}
            style={({ pressed }) => [styles.locationRow, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
          >
            <Feather name="navigation" size={19} color={colors.primary} />
            <Text style={[styles.locationText, { color: colors.secondaryForeground }]}>
              {locating ? t.locatingYou : t.useMyLocation}
            </Text>
          </Pressable>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {filtered.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  Haptics.selectionAsync();
                  selectCity(item);
                  setVisible(false);
                }}
                style={[styles.cityRow, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.cityText, { color: colors.foreground }]}>{item}</Text>
                {item === city && <Feather name="check" size={20} color={colors.primary} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 42, borderRadius: 21, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 250 },
  triggerText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flexShrink: 1 },
  pressed: { opacity: 0.72 },
  modal: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, marginTop: 3 },
  search: { height: 52, borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  locationRow: { height: 52, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, marginVertical: 12 },
  locationText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  cityRow: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityText: { fontFamily: 'Inter_500Medium', fontSize: 16 },
});