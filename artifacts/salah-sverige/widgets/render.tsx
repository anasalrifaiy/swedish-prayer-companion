import React from 'react';
import type { WidgetInfo } from 'react-native-android-widget';
import { buildWidgetData, loadWidgetData, WidgetSnapshot } from '@/lib/widget-data';
import { PrayerWidget } from './PrayerWidget';

export const PRAYER_WIDGET_NAME = 'PrayerTimes';

export async function renderPrayerWidget(info: WidgetInfo, snapshot?: WidgetSnapshot) {
  const now = new Date();
  const data = snapshot ? buildWidgetData(snapshot, now) : await loadWidgetData(now);
  return <PrayerWidget data={data} height={info.height} />;
}
