import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { renderPrayerWidget } from './render';

registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(await renderPrayerWidget(widgetInfo));
});
