const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const React = require('react');

const appDir = path.resolve(__dirname, '..');
const widgetDir = path.dirname(require.resolve('react-native-android-widget/package.json'));
const preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });
const compiler = require.resolve('babel-plugin-react-compiler');
const { buildWidgetTree } = require(path.join(widgetDir, 'lib/commonjs/api/build-widget-tree.js'));
const widgets = {
  ...require(path.join(widgetDir, 'lib/commonjs/widgets/FlexWidget.js')),
  ...require(path.join(widgetDir, 'lib/commonjs/widgets/TextWidget.js')),
};

function compile(relativePath, replacements = {}) {
  const filename = path.join(appDir, relativePath);
  const result = babel.transformFileSync(filename, {
    presets: [preset],
    plugins: [[compiler, {}]],
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    if (name.startsWith('@babel/runtime/')) {
      return originalRequire(require.resolve(name, { paths: [preset] }));
    }
    return originalRequire(name);
  };
  loaded._compile(result.code, filename);
  return loaded.exports;
}

const i18n = compile('lib/i18n.ts');
const { automaticLocationAction } = compile('lib/location-policy.ts');
const { PrayerWidget } = compile('widgets/PrayerWidget.tsx', {
  '@/lib/i18n': i18n,
  'react-native-android-widget': widgets,
});
const times = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((name, index) => ({
  name,
  time: `0${index + 1}:00`,
}));

function allText(tree) {
  return [
    ...(tree.type === 'TextWidget' ? [tree.props.text] : []),
    ...(tree.children ?? []).flatMap(allText),
  ];
}

for (const language of ['sv', 'en', 'ar']) {
  for (const height of [110, 180]) {
    const empty = buildWidgetTree(React.createElement(PrayerWidget, { data: { status: 'empty', language }, height }));
    assert.ok(allText(empty).includes(i18n.translations[language].widgetOpenApp));

    const data = { status: 'ready', language, city: 'Malmö', times, current: 'Dhuhr', next: { name: 'Asr', time: '03:00' } };
    const ready = buildWidgetTree(React.createElement(PrayerWidget, { data, height }));
    const text = allText(ready);
    assert.ok(text.includes(data.city));
    for (const { name, time } of times) {
      assert.ok(text.includes(i18n.translations[language].prayerNames[name]));
      assert.ok(text.includes(time));
    }
    assert.ok(text.includes(i18n.translations[language].widgetNow));
    assert.ok(text.some((value) => value.includes(i18n.translations[language].widgetNext)));
  }
}
console.log('Widget tree renders for empty and populated data in all languages and sizes.');

const granted = { granted: true, canAskAgain: true };
const askable = { granted: false, canAskAgain: true };
const blocked = { granted: false, canAskAgain: false };
assert.equal(automaticLocationAction('automatic', null, true, false, false), 'wait');
assert.equal(automaticLocationAction('automatic', granted, false, false, false), 'wait');
assert.equal(automaticLocationAction('manual', granted, true, false, false), 'wait');
assert.equal(automaticLocationAction('automatic', granted, true, true, false), 'wait');
assert.equal(automaticLocationAction('automatic', granted, true, false, false), 'locate');
assert.equal(automaticLocationAction('automatic', askable, true, false, false), 'locate');
assert.equal(automaticLocationAction('automatic', blocked, true, false, false), 'locate');
assert.equal(automaticLocationAction('automatic', askable, true, false, true), 'wait');
console.log('Automatic location policy handles permission and startup states.');

async function testWidgetStorage() {
  const storage = new Map();
  const storageApi = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
  };
  const keys = compile('lib/storage-keys.ts');
  const coordinates = compile('lib/city-coordinates.ts');
  const prayer = compile('lib/prayer.ts', { './city-coordinates': coordinates });
  const widgetData = compile('lib/widget-data.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storageApi },
    './i18n': i18n,
    './prayer': prayer,
    './storage-keys': keys,
  });
  const day = (date, fajr) => ({ day: date, Fajr: fajr, Shuruk: '07:00', Dhuhr: '12:00', Asr: '14:00', Maghrib: '16:00', Isha: '18:00' });
  const stockholm = { '11': [day(6, '05:40'), day(7, '05:42')] };
  const dataset = { source: 'test', updatedAt: '', cities: ['Stockholm', 'Malmö'], tables: {
    Stockholm: stockholm,
    Malmö: { '11': [day(6, '06:00')] },
  } };
  const now = new Date(2026, 10, 6, 13, 0);
  const snapshot = widgetData.makeWidgetSnapshot('Stockholm', dataset, 'en', now);
  assert.equal(snapshot.months, stockholm);
  assert.ok(!JSON.stringify(snapshot).includes('Malmö'));
  storage.set(keys.PRAYER_CACHE_KEY, 'x'.repeat(4_300_000));
  storageApi.getItem = async (key) => {
    assert.notEqual(key, keys.PRAYER_CACHE_KEY, 'widget must not read the oversized full timetable');
    return storage.get(key) ?? null;
  };
  await widgetData.saveWidgetSnapshot(snapshot);
  const savedData = await widgetData.loadWidgetData(now);
  assert.deepEqual(savedData, widgetData.buildWidgetData(snapshot, now));
  assert.equal(savedData.city, 'Stockholm');
  const savedTree = buildWidgetTree(React.createElement(PrayerWidget, { data: savedData, height: 180 }));
  assert.ok(allText(savedTree).includes('Stockholm'));
  assert.ok(allText(savedTree).includes('05:40'));
  assert.equal(widgetData.buildWidgetData(snapshot, now).current, 'Dhuhr');
  assert.equal(widgetData.buildWidgetData(snapshot, now).next.name, 'Asr');
  assert.equal(widgetData.buildWidgetData(snapshot, new Date(2026, 10, 6, 21)).next.time, '05:42');
  assert.equal(widgetData.buildWidgetData(snapshot, new Date(2027, 0, 1)).status, 'empty');
  const missing = widgetData.makeWidgetSnapshot('Stockholm', undefined, 'sv', now);
  assert.equal(widgetData.preserveWidgetSnapshot(missing, snapshot).months, stockholm);
  assert.equal(widgetData.preserveWidgetSnapshot(missing, snapshot).language, 'sv');
  const changedCity = widgetData.makeWidgetSnapshot('Malmö', undefined, 'en', now);
  assert.equal(widgetData.preserveWidgetSnapshot(changedCity, snapshot).months, null);
  const nextYear = widgetData.makeWidgetSnapshot('Stockholm', undefined, 'en', new Date(2027, 0, 1));
  assert.equal(widgetData.preserveWidgetSnapshot(nextYear, snapshot).months, null);
  await widgetData.saveWidgetSnapshot(widgetData.makeWidgetSnapshot(null, dataset, 'sv', now));
  assert.equal((await widgetData.loadWidgetData(now)).status, 'empty');
  storage.delete(keys.WIDGET_CACHE_KEY);
  assert.equal((await widgetData.loadWidgetData(now)).status, 'empty');
  console.log('Widget uses a small selected-city snapshot and renders saved prayer data.');
}

testWidgetStorage().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
