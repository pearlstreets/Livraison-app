/* global describe, test, expect, jest, beforeAll, afterAll, afterEach */
/**
 * Preuve sans build : le plugin est appliqué à la vraie config d'app.json,
 * puis les mods Android sont exécutés sur un faux projet natif temporaire.
 * On vérifie le manifeste et les fichiers XML réellement écrits, et le typage
 * de la date de soupape iOS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AndroidConfig, compileModsAsync } = require('@expo/config-plugins');
const plist = require('@expo/plist').default;

const withSecuriteReseau = require('../withSecuriteReseau');

const appJson = require('../../app.json');

const MANIFESTE_GABARIT = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET"/>
  <application android:name=".MainApplication" android:label="@string/app_name" android:allowBackup="true" android:theme="@style/AppTheme">
    <activity android:name=".MainActivity" android:exported="true"/>
  </application>
</manifest>
`;

const EMPREINTES_ATTENDUES = [
  'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=',
  'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=',
  'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=',
  's/tdAOmUzd8syaTuqfgGvFcn6DzA5Cmb+Vby1ST+U3Y=',
];

const copie = (o) => JSON.parse(JSON.stringify(o));

describe('withSecuriteReseau', () => {
  let racine;
  let manifeste;
  let lire;

  beforeAll(async () => {
    racine = fs.mkdtempSync(path.join(os.tmpdir(), 'pearl-delivery-plugin-'));
    const dossierMain = path.join(racine, 'android', 'app', 'src', 'main');
    fs.mkdirSync(dossierMain, { recursive: true });
    fs.writeFileSync(path.join(dossierMain, 'AndroidManifest.xml'), MANIFESTE_GABARIT);

    let config = { ...copie(appJson.expo), _internal: { projectRoot: racine } };
    // allowBackup est posé par le plugin Expo standard à partir d'app.json.
    config = AndroidConfig.AllowBackup.withAllowBackup(config);
    config = withSecuriteReseau(config);
    await compileModsAsync(config, { projectRoot: racine, platforms: ['android'] });

    lire = (...p) => fs.readFileSync(path.join(racine, 'android', 'app', 'src', ...p), 'utf8');
    manifeste = lire('main', 'AndroidManifest.xml');
  });

  afterAll(() => {
    fs.rmSync(racine, { recursive: true, force: true });
  });

  test('app.json garde allowBackup false et déclare le plugin', () => {
    expect(appJson.expo.android.allowBackup).toBe(false);
    expect(appJson.expo.plugins).toContain('./plugins/withSecuriteReseau');
  });

  test('manifeste : allowBackup false, pas de clair, config réseau et règles d\'extraction', () => {
    expect(manifeste).toContain('android:allowBackup="false"');
    expect(manifeste).not.toContain('android:allowBackup="true"');
    expect(manifeste).toContain('android:usesCleartextTraffic="false"');
    expect(manifeste).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(manifeste).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  });

  test('XML release : aucun clair, ancres système seules, épinglage de l\'API', () => {
    const xml = lire('main', 'res', 'xml', 'network_security_config.xml');
    expect(xml).not.toMatch(/cleartextTrafficPermitted="true"/);
    expect(xml).toContain('<base-config cleartextTrafficPermitted="false">');
    expect(xml).toContain('<certificates src="system" />');
    expect(xml).not.toContain('src="user"');
    expect(xml).toContain('<domain includeSubdomains="false">api.pearlstreets.com</domain>');
    expect(xml).toContain('<pin-set expiration="2027-08-20">');
    const pins = [...xml.matchAll(/<pin digest="SHA-256">([^<]+)<\/pin>/g)].map((m) => m[1]);
    expect(pins).toEqual(EMPREINTES_ATTENDUES);
  });

  test('XML debug séparé, dans le variant debug seulement', () => {
    const xml = lire('debug', 'res', 'xml', 'network_security_config.xml');
    expect(xml).toContain('cleartextTrafficPermitted="true"');
    expect(xml).not.toContain('<pin-set');
  });

  test('règles d\'extraction : rien en sauvegarde cloud ni en transfert d\'appareil', () => {
    const xml = lire('main', 'res', 'xml', 'data_extraction_rules.xml');
    expect(xml).toContain('<cloud-backup>');
    expect(xml).toContain('<device-transfer>');
    expect(xml).not.toContain('<include');
    for (const domaine of ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect((xml.match(new RegExp(`<exclude domain="${domaine}" path="\\." />`, 'g')) || []).length).toBe(2);
    }
  });

  test('iOS : ATS strict, épinglage identique, date de soupape typée en <date>', () => {
    const infoPlist = copie(appJson.expo.ios.infoPlist);
    const ats = infoPlist.NSAppTransportSecurity;
    expect(ats.NSAllowsArbitraryLoads).toBe(false);
    expect(ats.NSAllowsLocalNetworking).toBe(true);
    const api = ats.NSPinnedDomains['api.pearlstreets.com'];
    expect(api.NSIncludesSubdomains).toBe(false);
    expect(api.NSPinnedCAIdentities.map((e) => e['SPKI-SHA256-BASE64'])).toEqual(EMPREINTES_ATTENDUES);

    withSecuriteReseau.typerDatesEpinglage(infoPlist);
    const ecrit = plist.build(infoPlist);
    expect(ecrit).toContain('<date>2027-08-20T00:00:00Z</date>');
    // Même soupape que le pin-set Android.
    expect(api.NSPinnedExpirationDate.toISOString().slice(0, 10)).toBe(withSecuriteReseau.EXPIRATION_EPINGLAGE);
  });
});
