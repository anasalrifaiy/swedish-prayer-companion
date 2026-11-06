'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { translations } from '@/lib/i18n';
import type { WidgetData } from '@/lib/widget-data';

const GOLD = '#F2D58B';
const WHITE = '#FFFFFF';
const MUTED = '#B9D4CB';
const DARK = '#06261F';

type Props = { data: WidgetData; height: number };

export function PrayerWidget({ data, height }: Props) {
  const t = translations[data.language];
  const root = {
    width: 'match_parent',
    height: 'match_parent',
    padding: 12,
    borderRadius: 24,
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundGradient: { from: '#0D4D3E', to: '#06261F', orientation: 'TL_BR' },
  } as const;

  if (data.status === 'empty') {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...root, alignItems: 'center', justifyContent: 'center' }}>
        <TextWidget text={t.widgetOpenApp} style={{ fontSize: 14, color: WHITE }} />
      </FlexWidget>
    );
  }

  const roomy = height >= 150;
  const nextLabel = data.next ? `${t.prayerNames[data.next.name]} ${data.next.time}` : '–';

  return (
    <FlexWidget clickAction="OPEN_APP" style={root}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text={data.city} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: 'bold', color: GOLD }} />
        {!roomy && (
          <TextWidget text={`${t.widgetNext} ${nextLabel}`} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold', color: WHITE }} />
        )}
      </FlexWidget>

      {roomy && (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
          <FlexWidget style={{ flexDirection: 'column' }}>
            <TextWidget text={t.widgetNow} style={{ fontSize: 11, fontWeight: 'bold', color: MUTED }} />
            <TextWidget text={t.prayerNames[data.current]} style={{ fontSize: 22, fontWeight: 'bold', color: WHITE }} />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget text={t.widgetNext} style={{ fontSize: 11, fontWeight: 'bold', color: MUTED }} />
            <TextWidget text={nextLabel} style={{ fontSize: 22, fontWeight: 'bold', color: GOLD }} />
          </FlexWidget>
        </FlexWidget>
      )}

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 4 }}>
        {data.times.map(({ name, time }) => {
          const isCurrent = name === data.current;
          const isNext = name === data.next?.name;
          return (
            <FlexWidget
              key={name}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: isCurrent ? GOLD : 'rgba(255, 255, 255, 0.10)',
                borderWidth: isNext ? 1 : 0,
                borderColor: GOLD,
              }}
            >
              <TextWidget
                text={isCurrent ? t.widgetNow : isNext ? t.widgetNext : ' '}
                maxLines={1}
                style={{ fontSize: 9, fontWeight: 'bold', color: isCurrent ? DARK : GOLD }}
              />
              <TextWidget
                text={t.prayerNames[name]}
                maxLines={1}
                style={{ fontSize: 11, color: isCurrent ? DARK : MUTED }}
              />
              <TextWidget
                text={time}
                maxLines={1}
                style={{ fontSize: 14, fontWeight: 'bold', color: isCurrent ? DARK : WHITE }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>
    </FlexWidget>
  );
}
