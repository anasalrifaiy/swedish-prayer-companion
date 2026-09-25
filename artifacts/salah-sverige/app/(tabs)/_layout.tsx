import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function TabLayout() {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          height: Platform.OS === 'web' ? 84 : 78,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'web' ? 22 : 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.card,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Idag', tabBarIcon: ({ color }) => <Feather name="sun" size={22} color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: 'Månad', tabBarIcon: ({ color }) => <Feather name="calendar" size={21} color={color} /> }} />
      <Tabs.Screen name="qibla" options={{ title: 'Qibla', tabBarIcon: ({ color }) => <MaterialCommunityIcons name="compass-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="reminders" options={{ title: 'Påminnelser', tabBarIcon: ({ color }) => <Feather name="bell" size={22} color={color} /> }} />
    </Tabs>
  );
}