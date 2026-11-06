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
