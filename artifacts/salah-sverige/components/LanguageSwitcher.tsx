import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/context/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { languageLabels, languages } from '@/lib/i18n';

export function LanguageSwitcher() {
  const colors = useColors();
  const { language, setLanguage, t } = useLanguage();
  return (
    <View style={[styles.wrap, { borderColor: colors.softGold }]} accessibilityLabel={t.language}>
      {languages.map((item) => {
        const active = item === language;
        return (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => { void Haptics.selectionAsync().catch(() => undefined); setLanguage(item); }}
            style={[styles.item, active && { backgroundColor: colors.softGold }]}
          >
            <Text style={[styles.text, { color: active ? colors.accentForeground : colors.heroForeground }]}>
              {languageLabels[item]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 2 },
  item: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 13, minWidth: 34, alignItems: 'center' },
  text: { fontFamily: 'Inter_700Bold', fontSize: 11 },
});
