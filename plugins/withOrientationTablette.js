// Config plugin Expo : tablettes en portrait ET en paysage, telephones en
// portrait (20/11/2026). Sur tablette, l'app se presente en deux moities
// (utils/deuxEcrans.js) et se recharge a la rotation (utils/repliEcran.js).
//
// iOS : `orientation: portrait` d'app.json ne regle que l'iPhone
// (UISupportedInterfaceOrientations). L'iPad lit sa propre cle, ~ipad :
// les quatre sens, obligatoires aussi pour le multitache (Split View).
//
// Android : le manifeste garde portrait (app.json). Au demarrage, un ecran
// dont le plus petit cote fait au moins 600 dp (tablette, pliable deplie)
// libere l'orientation.
//
// ios/ et android/ sont GENERES au build : la regle doit vivre ici.

const { withInfoPlist, withMainActivity } = require('@expo/config-plugins');

const MARQUE = 'Tablette : rotation libre';
const COTE_MIN_DP = 600;
const SENS_IPAD = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

const LIGNES = `    // ${MARQUE} (plugins/withOrientationTablette.js).
    if (resources.configuration.smallestScreenWidthDp >= ${COTE_MIN_DP}) {
      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }
`;

function ajouterAuKotlin(source) {
  if (source.includes(MARQUE)) return source;
  const appel = /^(\s*)super\.onCreate\(/m;
  if (!appel.test(source)) {
    throw new Error('withOrientationTablette : super.onCreate introuvable dans MainActivity');
  }
  return source.replace(appel, (m) => `${LIGNES}${m}`);
}

module.exports = function withOrientationTablette(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults['UISupportedInterfaceOrientations~ipad'] = SENS_IPAD;
    return cfg;
  });
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withOrientationTablette : MainActivity Kotlin attendue');
    }
    cfg.modResults.contents = ajouterAuKotlin(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.ajouterAuKotlin = ajouterAuKotlin;
module.exports.SENS_IPAD = SENS_IPAD;
