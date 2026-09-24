import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';

export function AppBackground({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.heroDeep, colors.hero, colors.background]}
        locations={[0, 0.35, 0.72]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, { borderColor: colors.softGold }]} />
      <View style={[styles.orbSmall, { borderColor: colors.softGold }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  orb: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    borderWidth: 1,
    opacity: 0.12,
    top: -150,
    right: -110,
  },
  orbSmall: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    opacity: 0.1,
    top: 36,
    right: -66,
  },
});