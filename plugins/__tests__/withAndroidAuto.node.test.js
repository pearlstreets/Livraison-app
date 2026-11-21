// node --test plugins/__tests__/withAndroidAuto.node.test.js
// Plugin Android Auto : rien sans l'option, service POI, métadonnées et
// paquets GPS ajoutés une seule fois sans toucher au reste du manifeste.
const test = require('node:test');
const assert = require('node:assert/strict');
const withAndroidAuto = require('../withAndroidAuto');

const { androidAutoActif, ajouterAndroidAuto, SERVICE, CATEGORIE } = withAndroidAuto;

const manifeste = () => ({
  manifest: {
    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
    queries: [{ intent: [{ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }] }] }],
    application: [{
      $: { 'android:name': '.MainApplication' },
      activity: [{ $: { 'android:name': '.MainActivity' } }],
      'meta-data': [{ $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'true' } }],
    }],
  },
});

test('androidAutoActif : désactivé par défaut, option ou ANDROID_AUTO=1', () => {
  const avant = process.env.ANDROID_AUTO;
  delete process.env.ANDROID_AUTO;
  assert.equal(androidAutoActif(undefined), false);
  assert.equal(androidAutoActif({ actif: false }), false);
  assert.equal(androidAutoActif({ actif: 'oui' }), false);
  assert.equal(androidAutoActif({ actif: true }), true);
  process.env.ANDROID_AUTO = '1';
  assert.equal(androidAutoActif({ actif: false }), true);
  if (avant === undefined) delete process.env.ANDROID_AUTO; else process.env.ANDROID_AUTO = avant;
});

test('plugin sans option : configuration inchangée', () => {
  const avant = process.env.ANDROID_AUTO;
  delete process.env.ANDROID_AUTO;
  const config = { name: 'x' };
  assert.equal(withAndroidAuto(config, { actif: false }), config);
  if (avant !== undefined) process.env.ANDROID_AUTO = avant;
});

test('ajouterAndroidAuto : service, métadonnées et paquets, une seule fois', () => {
  const m = ajouterAndroidAuto(ajouterAndroidAuto(manifeste()));
  const appli = m.manifest.application[0];
  const services = appli.service.filter((s) => s.$['android:name'] === SERVICE);
  assert.equal(services.length, 1);
  assert.equal(services[0].$['android:exported'], 'true');
  const filtre = services[0]['intent-filter'][0];
  assert.equal(filtre.action[0].$['android:name'], 'androidx.car.app.CarAppService');
  assert.equal(filtre.category[0].$['android:name'], CATEGORIE);
  const metas = appli['meta-data'].map((x) => x.$['android:name']);
  assert.deepEqual(metas, ['expo.modules.updates.ENABLED', 'com.google.android.gms.car.application', 'androidx.car.app.minCarApiLevel']);
  assert.equal(appli['meta-data'][1].$['android:resource'], '@xml/automotive_app_desc');
  assert.equal(appli.activity.length, 1);
  const q = m.manifest.queries[0];
  assert.equal(q.intent.length, 1);
  assert.deepEqual(q.package.map((p) => p.$['android:name']), ['com.google.android.apps.maps', 'com.waze']);
});
