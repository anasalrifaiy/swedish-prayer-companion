'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import colors from '@/constants/colors';
import { translations } from '@/lib/i18n';
import type { WidgetData } from '@/lib/widget-data';

type Props = { data: WidgetData; theme: 'light' | 'dark' };

export function PrayerWidget({ data, theme }: Props) {
  const t = translations[data.language];
  const palette = colors[theme];
  const root = {
    width: 'match_parent',
    height: 'match_parent',
    padding: 6,
    borderRadius: colors.radius,
    backgroundColor: palette.card,
    justifyContent: 'center',
  } as const;

  if (data.status === 'empty') {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...root, alignItems: 'center' }}>
        <TextWidget text={t.widgetOpenApp} style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: palette.foreground }} />
      </FlexWidget>
    );
  }

  const accessibilityLabel = [
    `${t.widgetNow}: ${t.prayerNames[data.current]}`,
    data.next ? `${t.widgetNext}: ${t.prayerNames[data.next.name]} ${data.next.time}` : '',
  ].filter(Boolean).join('. ');

  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={accessibilityLabel} style={root}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 3 }}>
        {data.times.map(({ name, time }) => {
          const isCurrent = name === data.current;
          const isNext = name === data.next?.name;
          return (
            <FlexWidget
              key={name}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor: isCurrent ? palette.primary : palette.card,
                borderWidth: isNext ? 1 : 0,
                borderColor: palette.primary,
              }}
            >
              <TextWidget
                text={t.prayerNames[name]}
                maxLines={1}
                style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, adjustsFontSizeToFit: true, color: isCurrent ? palette.primaryForeground : isNext ? palette.primary : palette.foreground }}
              />
              <TextWidget
                text={time}
                maxLines={1}
                style={{ fontFamily: 'Inter_700Bold', fontSize: 14, adjustsFontSizeToFit: true, color: isCurrent ? palette.primaryForeground : palette.foreground }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>
    </FlexWidget>
  );
}
