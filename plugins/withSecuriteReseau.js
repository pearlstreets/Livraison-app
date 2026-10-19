// Config plugin Expo : sécurité réseau et sauvegardes du binaire natif.
//
// android/ et ios/ sont GÉNÉRÉS au build (ignorés par git) : toute règle
// native doit donc vivre ici ou dans app.json, sinon elle disparaît au
// prochain prebuild.
//
// ANDROID
//  - res/xml/network_security_config.xml (variant main = release) :
//    HTTPS obligatoire partout, ancres système uniquement, épinglage des
//    ancres de confiance de api.pearlstreets.com.
//  - src/debug/res/xml/network_security_config.xml : même nom de ressource,
//    le variant debug l'emporte à la fusion. Il autorise le clair (backend
//    Django local sur le port 8000, Metro) et n'épingle rien. Le release
//    n'en hérite RIEN.
//  - Manifeste : android:networkSecurityConfig et
//    android:usesCleartextTraffic="false". Le manifeste debug du gabarit Expo
//    remet usesCleartextTraffic à true (tools:replace), et dès qu'un
//    networkSecurityConfig est posé, Android (API 24+) suit ce fichier plutôt
//    que l'attribut : en debug, c'est donc le fichier debug qui décide.
//  - res/xml/data_extraction_rules.xml + android:dataExtractionRules :
//    allowBackup="false" (app.json) coupe la sauvegarde cloud, mais à partir
//    d'Android 12 il NE coupe PAS le transfert d'appareil à appareil. Ces
//    règles excluent tout, pour les deux.
//
// iOS
//  L'épinglage est déclaré dans app.json (ios.infoPlist.NSAppTransportSecurity).
//  JSON ne sait pas écrire un <date> plist : la date de soupape y est une
//  chaîne, convertie ici en vraie date pour que le plist soit bien typé.
//
// L'épinglage porte sur les ANCRES (racines), jamais sur la feuille, que
// Let's Encrypt renouvelle tous les ~60 jours. Les quatre empreintes sont
// celles de l'app client (AppUser) : ISRG Root X1, ISRG Root X2, ISRG Root YE
// et l'intermédiaire YE2 en secours. Une seule correspondance suffit.
// `expiration` est une soupape : passée cette date, Android cesse d'épingler
// au lieu de couper l'API. MÊME DATE sur les deux plateformes. À reconduire à
// chaque binaire annuel, après revérification de la chaîne :
//   openssl s_client -servername api.pearlstreets.com \
//       -connect api.pearlstreets.com:443 -showcerts

const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DOMAINE_API = 'api.pearlstreets.com';
const EXPIRATION_EPINGLAGE = '2027-08-20';

const EMPREINTES = [
  { nom: 'ISRG Root X1', sha256: 'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=' },
  { nom: 'ISRG Root X2', sha256: 'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=' },
  { nom: 'ISRG Root YE', sha256: 'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=' },
  { nom: 'Let\'s Encrypt YE2 (intermediaire, secours)', sha256: 's/tdAOmUzd8syaTuqfgGvFcn6DzA5Cmb+Vby1ST+U3Y=' },
];

const RESSOURCE_RESEAU = 'network_security_config';
const RESSOURCE_EXTRACTION = 'data_extraction_rules';

const xmlReseauRelease = () => `<?xml version="1.0" encoding="utf-8"?>
<!-- Genere par plugins/withSecuriteReseau.js : ne pas modifier a la main. -->
<!-- Builds de PRODUCTION : HTTPS partout, aucune exception. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="false">${DOMAINE_API}</domain>
        <pin-set expiration="${EXPIRATION_EPINGLAGE}">
${EMPREINTES.map((e) => `            <!-- ${e.nom} -->\n            <pin digest="SHA-256">${e.sha256}</pin>`).join('\n')}
        </pin-set>
    </domain-config>
</network-security-config>
`;

// Debug seulement : le clair reste permis partout parce que le serveur Django
// local et Metro sont joignables par localhost, 10.0.2.2 ou l'IP du réseau
// local (appareil physique), et qu'un domain-config ne sait pas décrire une
// plage d'IP. Autorités utilisateur acceptées pour inspecter le trafic au
// proxy. Ce fichier n'existe que dans src/debug : le release ne le voit pas.
const xmlReseauDebug = () => `<?xml version="1.0" encoding="utf-8"?>
<!-- Genere par plugins/withSecuriteReseau.js : ne pas modifier a la main. -->
<!-- Builds DEBUG uniquement (variant debug, jamais embarque en release). -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

const DOMAINES_SAUVEGARDE = [
  'root', 'file', 'database', 'sharedpref', 'external',
  'device_root', 'device_file', 'device_database', 'device_sharedpref',
];

const xmlExtraction = () => {
  const exclusions = DOMAINES_SAUVEGARDE
    .map((d) => `        <exclude domain="${d}" path="." />`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Genere par plugins/withSecuriteReseau.js : ne pas modifier a la main. -->
<!-- Aucune donnee de l'app ne part en sauvegarde cloud ni en transfert d'appareil. -->
<data-extraction-rules>
    <cloud-backup>
${exclusions}
    </cloud-backup>
    <device-transfer>
${exclusions}
    </device-transfer>
</data-extraction-rules>
`;
};

function appliquerManifeste(androidManifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  app.$['android:networkSecurityConfig'] = `@xml/${RESSOURCE_RESEAU}`;
  app.$['android:usesCleartextTraffic'] = 'false';
  app.$['android:dataExtractionRules'] = `@xml/${RESSOURCE_EXTRACTION}`;
  return androidManifest;
}

async function ecrire(fichier, contenu) {
  await fs.promises.mkdir(path.dirname(fichier), { recursive: true });
  await fs.promises.writeFile(fichier, contenu);
}

async function ecrireRessourcesAndroid(platformProjectRoot) {
  const src = path.join(platformProjectRoot, 'app', 'src');
  await ecrire(path.join(src, 'main', 'res', 'xml', `${RESSOURCE_RESEAU}.xml`), xmlReseauRelease());
  await ecrire(path.join(src, 'debug', 'res', 'xml', `${RESSOURCE_RESEAU}.xml`), xmlReseauDebug());
  await ecrire(path.join(src, 'main', 'res', 'xml', `${RESSOURCE_EXTRACTION}.xml`), xmlExtraction());
}

function typerDatesEpinglage(infoPlist) {
  const domaines = infoPlist?.NSAppTransportSecurity?.NSPinnedDomains;
  if (!domaines || typeof domaines !== 'object') return infoPlist;
  for (const reglage of Object.values(domaines)) {
    const date = reglage?.NSPinnedExpirationDate;
    if (typeof date === 'string') {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`[withSecuriteReseau] NSPinnedExpirationDate illisible : ${date}`);
      }
      reglage.NSPinnedExpirationDate = d;
    }
  }
  return infoPlist;
}

function withSecuriteReseau(config) {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = appliquerManifeste(cfg.modResults);
    return cfg;
  });
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      await ecrireRessourcesAndroid(cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = typerDatesEpinglage(cfg.modResults);
    return cfg;
  });
  return config;
}

module.exports = withSecuriteReseau;
module.exports.appliquerManifeste = appliquerManifeste;
module.exports.ecrireRessourcesAndroid = ecrireRessourcesAndroid;
module.exports.typerDatesEpinglage = typerDatesEpinglage;
module.exports.xmlReseauRelease = xmlReseauRelease;
module.exports.xmlReseauDebug = xmlReseauDebug;
module.exports.xmlExtraction = xmlExtraction;
module.exports.EMPREINTES = EMPREINTES;
module.exports.EXPIRATION_EPINGLAGE = EXPIRATION_EPINGLAGE;
