// Config plugin Expo : écran Android Auto (Android for Cars App Library,
// catégorie POI).
//
// ⛔ Une app qui déclare Android Auto passe la revue « Android for Cars » de
// Google Play (déclaration dans la Play Console, puis validation). Tant que ce
// n'est pas fait, le plugin ne fait RIEN :
//   - app.json : ["./plugins/withAndroidAuto", { "actif": true }]
//   - ou, pour un build local de test : ANDROID_AUTO=1 npx expo prebuild
// Activé, il ajoute au manifeste :
//   - le service PearlCarAppService (modules/pearl-carplay/android), catégorie
//     androidx.car.app.category.POI ;
//   - les métadonnées com.google.android.gms.car.application (fichier
//     res/xml/automotive_app_desc.xml, écrit ici) et
//     androidx.car.app.minCarApiLevel ;
//   - la visibilité des paquets Google Maps et Waze (choix de l'app GPS).
// La bibliothèque androidx.car.app est une dépendance du module
// (modules/pearl-carplay/android/build.gradle).
//
// android/ est GÉNÉRÉ au build : la règle doit vivre ici.

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const SERVICE = 'expo.modules.pearlcarplay.PearlCarAppService';
const ACTION_SERVICE = 'androidx.car.app.CarAppService';
const CATEGORIE = 'androidx.car.app.category.POI';
const META_APP = 'com.google.android.gms.car.application';
const META_API_MIN = 'androidx.car.app.minCarApiLevel';
const API_MIN = '1';
const PAQUETS_GPS = ['com.google.android.apps.maps', 'com.waze'];
const FICHIER_DESC = 'automotive_app_desc';

const DESCRIPTION = `<?xml version="1.0" encoding="utf-8"?>
<!-- Écran Android Auto à base de modèles (plugins/withAndroidAuto.js). -->
<automotiveApp>
  <uses name="template" />
</automotiveApp>
`;

function androidAutoActif(options) {
  const env = process.env.ANDROID_AUTO;
  if (env === '1' || env === 'true') return true;
  return Boolean(options && options.actif === true);
}

const nom = (el) => el && el.$ && el.$['android:name'];

// Service, métadonnées et paquets GPS ajoutés une seule fois, sans toucher au
// reste du manifeste.
function ajouterAndroidAuto(manifeste) {
  const racine = manifeste.manifest;
  const appli = racine.application && racine.application[0];
  if (!appli) throw new Error('withAndroidAuto : <application> absent du manifeste');

  appli.service = (appli.service || []).filter((s) => nom(s) !== SERVICE);
  appli.service.push({
    $: { 'android:name': SERVICE, 'android:exported': 'true' },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': ACTION_SERVICE } }],
        category: [{ $: { 'android:name': CATEGORIE } }],
      },
    ],
  });

  appli['meta-data'] = (appli['meta-data'] || []).filter((m) => nom(m) !== META_APP && nom(m) !== META_API_MIN);
  appli['meta-data'].push(
    { $: { 'android:name': META_APP, 'android:resource': `@xml/${FICHIER_DESC}` } },
    { $: { 'android:name': META_API_MIN, 'android:value': API_MIN } },
  );

  racine.queries = racine.queries && racine.queries.length ? racine.queries : [{}];
  const requetes = racine.queries[0];
  const deja = new Set((requetes.package || []).map(nom));
  requetes.package = [
    ...(requetes.package || []),
    ...PAQUETS_GPS.filter((p) => !deja.has(p)).map((p) => ({ $: { 'android:name': p } })),
  ];
  return manifeste;
}

function withAndroidAuto(config, options = {}) {
  if (!androidAutoActif(options)) return config;

  config = withAndroidManifest(config, (c) => {
    c.modResults = ajouterAndroidAuto(c.modResults);
    return c;
  });

  return withDangerousMod(config, [
    'android',
    (c) => {
      const dossier = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(path.join(dossier, `${FICHIER_DESC}.xml`), DESCRIPTION);
      return c;
    },
  ]);
}

module.exports = withAndroidAuto;
module.exports.androidAutoActif = androidAutoActif;
module.exports.ajouterAndroidAuto = ajouterAndroidAuto;
module.exports.SERVICE = SERVICE;
module.exports.CATEGORIE = CATEGORIE;
module.exports.DESCRIPTION = DESCRIPTION;
