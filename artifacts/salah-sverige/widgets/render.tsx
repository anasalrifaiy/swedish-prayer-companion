import React from 'react';
import type { WidgetInfo } from 'react-native-android-widget';
import { loadWidgetData } from '@/lib/widget-data';
import { PrayerWidget } from './PrayerWidget';

export const PRAYER_WIDGET_NAME = 'PrayerTimes';

export async function renderPrayerWidget(info: WidgetInfo) {
  const data = await loadWidgetData(new Date());
  return <PrayerWidget data={data} height={info.height} />;
}
