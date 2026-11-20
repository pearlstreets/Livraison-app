// node --test plugins/__tests__/withCarPlay.node.test.js
// Plugin CarPlay : rien sans l'option, scène ajoutée sans écraser la scène
// téléphone, démarrage sans fenêtre ajouté une seule fois.
const test = require('node:test');
const assert = require('node:assert/strict');
const withCarPlay = require('../withCarPlay');

const { carPlayActif, ajouterSceneCarPlay, ajouterDemarrage, ROLE_CARPLAY } = withCarPlay;

const SCENE_TELEPHONE = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
    ],
  },
};

test('carPlayActif : désactivé par défaut, option ou CARPLAY=1', () => {
  const avant = process.env.CARPLAY;
  delete process.env.CARPLAY;
  assert.equal(carPlayActif(undefined), false);
  assert.equal(carPlayActif({ actif: false }), false);
  assert.equal(carPlayActif({ actif: 'oui' }), false);
  assert.equal(carPlayActif({ actif: true }), true);
  process.env.CARPLAY = '1';
  assert.equal(carPlayActif({ actif: false }), true);
  if (avant === undefined) delete process.env.CARPLAY; else process.env.CARPLAY = avant;
});

test('désactivé : la config est rendue telle quelle, sans mod', () => {
  const avant = process.env.CARPLAY;
  delete process.env.CARPLAY;
  const config = { name: 'x', slug: 'x' };
  const sortie = withCarPlay(config, { actif: false });
  assert.equal(sortie, config);
  assert.equal(sortie.mods, undefined);
  if (avant !== undefined) process.env.CARPLAY = avant;
});

test('activé : mods entitlements, Info.plist et AppDelegate posés', () => {
  const sortie = withCarPlay({ name: 'x', slug: 'x' }, { actif: true });
  assert.ok(sortie.mods.ios.entitlements);
  assert.ok(sortie.mods.ios.infoPlist);
  assert.ok(sortie.mods.ios.appDelegate);
});

test('ajouterSceneCarPlay : garde la scène téléphone', () => {
  const m = ajouterSceneCarPlay(SCENE_TELEPHONE);
  assert.deepEqual(m.UISceneConfigurations.UIWindowSceneSessionRoleApplication, SCENE_TELEPHONE.UISceneConfigurations.UIWindowSceneSessionRoleApplication);
  assert.equal(m.UISceneConfigurations[ROLE_CARPLAY][0].UISceneClassName, 'CPTemplateApplicationScene');
  assert.equal(m.UISceneConfigurations[ROLE_CARPLAY][0].UISceneDelegateClassName, 'PearlCarPlaySceneDelegate');
  assert.equal(m.UIApplicationSupportsMultipleScenes, false);
  assert.ok(ajouterSceneCarPlay(undefined).UISceneConfigurations[ROLE_CARPLAY]);
});

test('ordre inverse : la scène téléphone posée après garde la scène CarPlay', () => {
  // Même fusion que plugins/withUIScene.js.
  const avant = ajouterSceneCarPlay(undefined);
  const apres = {
    ...SCENE_TELEPHONE,
    UISceneConfigurations: { ...(avant.UISceneConfigurations || {}), ...SCENE_TELEPHONE.UISceneConfigurations },
  };
  assert.ok(apres.UISceneConfigurations[ROLE_CARPLAY]);
  assert.ok(apres.UISceneConfigurations.UIWindowSceneSessionRoleApplication);
});

test('ajouterDemarrage : ajouté une seule fois', () => {
  const une = ajouterDemarrage('class AppDelegate {}\n');
  assert.match(une, /demarrerReactSansFenetre/);
  assert.equal(ajouterDemarrage(une), une);
});
