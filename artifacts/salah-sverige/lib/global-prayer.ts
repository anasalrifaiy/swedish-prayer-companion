import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import type { CalculationParameters } from 'adhan';
import type { PrayerDataset, PrayerDay } from './prayer';

export type GlobalPlace = {
  name: string;
  countryCode: string | null;
  latitude: number;
  longitude: number;
};

type Authority = {
  label: string;
  build: () => CalculationParameters;
  hanafi?: boolean;
};

const custom = (label: string, fajr: number, isha: number): Authority => ({
  label,
  build: () => {
    const params = CalculationMethod.Other();
    params.fajrAngle = fajr;
    params.ishaAngle = isha;
    return params;
  },
});

const mwl: Authority = { label: 'Muslim World League', build: CalculationMethod.MuslimWorldLeague };
const umm: Authority = { label: 'Umm al-Qura (Makkah)', build: CalculationMethod.UmmAlQura };
const egypt: Authority = { label: 'Egyptian General Authority of Survey', build: CalculationMethod.Egyptian };
const karachi: Authority = { label: 'University of Islamic Sciences, Karachi', build: CalculationMethod.Karachi };
const karachiHanafi: Authority = { ...karachi, hanafi: true };
const isna: Authority = { label: 'ISNA (Islamic Society of North America)', build: CalculationMethod.NorthAmerica };
const muis: Authority = { label: 'MUIS / JAKIM / Kemenag (Southeast Asia)', build: CalculationMethod.Singapore };

const authorities: Record<string, Authority> = {
  SA: umm, BH: umm, OM: umm, YE: umm,
  AE: { label: 'Dubai (UAE General Authority of Islamic Affairs)', build: CalculationMethod.Dubai },
  KW: { label: 'Kuwait Ministry of Awqaf', build: CalculationMethod.Kuwait },
  QA: { label: 'Qatar Ministry of Awqaf', build: CalculationMethod.Qatar },
  TR: { label: 'Diyanet (Turkey)', build: CalculationMethod.Turkey },
  IR: { label: 'Institute of Geophysics, University of Tehran', build: CalculationMethod.Tehran },
  EG: egypt, SD: egypt, SY: egypt, LB: egypt, JO: egypt, PS: egypt, IQ: egypt, SO: egypt, DJ: egypt, LY: egypt,
  PK: karachiHanafi, IN: karachiHanafi, BD: karachiHanafi, AF: karachiHanafi, LK: karachi, NP: karachi,
  US: isna, CA: isna,
  SG: muis, MY: muis, BN: muis, ID: muis,
  MA: custom('Ministry of Habous and Islamic Affairs (Morocco)', 19, 17),
  DZ: custom('Ministry of Religious Affairs (Algeria)', 18, 17),
  TN: custom('Ministry of Religious Affairs (Tunisia)', 18, 18),
};

export function authorityFor(countryCode: string | null | undefined): Authority {
  return (countryCode && authorities[countryCode.toUpperCase()]) || mwl;
}

function format(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function globalDay(place: GlobalPlace, date: Date): PrayerDay {
  const authority = authorityFor(place.countryCode);
  const coordinates = new Coordinates(place.latitude, place.longitude);
  const params = authority.build();
  if (authority.hanafi) params.madhab = Madhab.Hanafi;
  params.highLatitudeRule = HighLatitudeRule.recommended(coordinates);
  const times = new PrayerTimes(coordinates, date, params);
  return {
    day: date.getDate(),
    Fajr: format(times.fajr),
    Shuruk: format(times.sunrise),
    Dhuhr: format(times.dhuhr),
    Asr: format(times.asr),
    Maghrib: format(times.maghrib),
    Isha: format(times.isha),
  };
}

// Builds a full-year dataset in the same shape as the Swedish table so the
// calendar and reminders can use it unchanged. Times are in the phone's time zone.
export function globalDataset(place: GlobalPlace, year: number): PrayerDataset {
  const authority = authorityFor(place.countryCode);
  const months: Record<string, PrayerDay[]> = {};
  for (let month = 0; month < 12; month++) {
    const days = new Date(year, month + 1, 0).getDate();
    months[String(month + 1)] = Array.from({ length: days }, (_, index) => (
      globalDay(place, new Date(year, month, index + 1))
    ));
  }
  return {
    source: authority.label,
    updatedAt: new Date(year, 0, 1).toISOString(),
    cities: [place.name],
    tables: { [place.name]: months },
  };
}
