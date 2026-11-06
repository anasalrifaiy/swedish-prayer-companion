import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import { usePrayer } from '@/context/PrayerContext';
import { loadWidgetSnapshot, makeWidgetSnapshot, preserveWidgetSnapshot, saveWidgetSnapshot, WidgetSnapshot } from '@/lib/widget-data';

async function refreshPrayerWidgets(snapshot: WidgetSnapshot) {
  // The widget library has no web implementation, so load it only on Android.
  const { getWidgetInfo, requestWidgetUpdateById } = await import('react-native-android-widget');
  const { PRAYER_WIDGET_NAME, renderPrayerWidget } = await import('./render');
  const widgets = await getWidgetInfo(PRAYER_WIDGET_NAME);
  await Promise.all(widgets.map(({ widgetId }) => requestWidgetUpdateById({
    widgetName: PRAYER_WIDGET_NAME,
    widgetId,
    renderWidget: (info) => renderPrayerWidget(info, snapshot),
  })));
}

function reportWidgetError(error: unknown) {
  console.error('Unable to refresh prayer widgets:', error);
}

// Redraws the home/lock-screen widget whenever what it shows may have changed.
export function WidgetSync() {
  const { city, dataset, loading } = usePrayer();
  const { language } = useLanguage();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android' || loading) return;
    const update = () => {
      let snapshot = makeWidgetSnapshot(city, dataset, language, new Date());
      const current = ++revision.current;
      queue.current = queue.current.catch(reportWidgetError).then(async () => {
        if (current !== revision.current) return;
        if (city && !snapshot.months) {
          const previous = await loadWidgetSnapshot();
          snapshot = preserveWidgetSnapshot(snapshot, previous);
        }
        if (current !== revision.current) return;
        await saveWidgetSnapshot(snapshot);
        if (current !== revision.current) return;
        await refreshPrayerWidgets(snapshot);
      });
      void queue.current.catch(reportWidgetError);
    };
    update();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      revision.current += 1;
      subscription.remove();
    };
  }, [city, dataset, language, loading]);

  return null;
}
