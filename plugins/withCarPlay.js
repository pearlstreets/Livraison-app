// Config plugin Expo : écran CarPlay (catégorie Driving Task).
//
// ⛔ L'entitlement com.apple.developer.carplay-driving-task n'est pas encore
// accordé par Apple : un build signé avec lui échouerait. Le plugin ne fait
// donc RIEN tant qu'il n'est pas activé :
//   - app.json : ["./plugins/withCarPlay", { "actif": true }]
//   - ou, pour un build local de test : CARPLAY=1 npx expo prebuild
// Activé, il ajoute :
//   - l'entitlement Driving Task ;
//   - la scène CarPlay au manifeste de scènes (à côté de la scène téléphone
//     posée par plugins/withUIScene.js, qui la garde) ;
//   - à AppDelegate, le démarrage de React Native sans fenêtre, pour une app
//     ouverte depuis l'écran de la voiture avant le téléphone.
// Le code natif de l'écran vit dans modules/pearl-carplay.
//
// ios/ est GÉNÉRÉ au build : la règle doit vivre ici.

const { withAppDelegate, withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.carplay-driving-task';
const ROLE_CARPLAY = 'CPTemplateApplicationSceneSessionRoleApplication';
const CLASSE_SCENE = 'PearlCarPlaySceneDelegate';
const MARQUE = 'demarrerReactSansFenetre';

const DEMARRAGE_SANS_FENETRE = `
// Écran CarPlay (plugins/withCarPlay.js) : app ouverte depuis la voiture,
// téléphone pas encore ouvert. React Native démarre dans une fenêtre sans
// scène ; la scène téléphone la reprendra à son ouverture (SceneDelegate).
extension AppDelegate {
  @objc func ${MARQUE}() {
    if window != nil { return }
    let fenetre = UIWindow(frame: UIScreen.main.bounds)
    window = fenetre
    reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: fenetre,
      launchOptions: optionsDeLancement)
  }
}
`;

function carPlayActif(options) {
  const env = process.env.CARPLAY;
  if (env === '1' || env === 'true') return true;
  return Boolean(options && options.actif === true);
}

// Manifeste de scènes avec la scène CarPlay, sans toucher aux autres rôles.
function ajouterSceneCarPlay(manifeste) {
  const base = manifeste && typeof manifeste === 'object' ? manifeste : {};
  const configs = { ...(base.UISceneConfigurations || {}) };
  configs[ROLE_CARPLAY] = [
    {
      UISceneClassName: 'CPTemplateApplicationScene',
      UISceneConfigurationName: 'CarPlay',
      UISceneDelegateClassName: CLASSE_SCENE,
    },
  ];
  return { ...base, UISceneConfigurations: configs };
}

function ajouterDemarrage(source) {
  if (source.includes(MARQUE)) return source;
  return source + DEMARRAGE_SANS_FENETRE;
}

function withCarPlay(config, options = {}) {
  if (!carPlayActif(options)) return config;

  config = withEntitlementsPlist(config, (c) => {
    c.modResults[ENTITLEMENT] = true;
    return c;
  });

  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = ajouterSceneCarPlay(c.modResults.UIApplicationSceneManifest);
    return c;
  });

  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withCarPlay : AppDelegate Swift attendu');
    }
    c.modResults.contents = ajouterDemarrage(c.modResults.contents);
    return c;
  });
}

module.exports = withCarPlay;
module.exports.carPlayActif = carPlayActif;
module.exports.ajouterSceneCarPlay = ajouterSceneCarPlay;
module.exports.ajouterDemarrage = ajouterDemarrage;
module.exports.ENTITLEMENT = ENTITLEMENT;
module.exports.ROLE_CARPLAY = ROLE_CARPLAY;
