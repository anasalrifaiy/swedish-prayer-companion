import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import { usePrayer } from '@/context/PrayerContext';

async function refreshPrayerWidgets() {
  // The widget library has no web implementation, so load it only on Android.
  const { requestWidgetUpdate } = await import('react-native-android-widget');
  const { PRAYER_WIDGET_NAME, renderPrayerWidget } = await import('./render');
  await requestWidgetUpdate({ widgetName: PRAYER_WIDGET_NAME, renderWidget: renderPrayerWidget });
}

// Redraws the home/lock-screen widget whenever what it shows may have changed.
export function WidgetSync() {
  const { city, dataset } = usePrayer();
  const { language } = useLanguage();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Give the context time to persist the new city before the widget reads it.
    const timer = setTimeout(() => { void refreshPrayerWidgets().catch(() => undefined); }, 1500);
    return () => clearTimeout(timer);
  }, [city, dataset, language]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPrayerWidgets().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
