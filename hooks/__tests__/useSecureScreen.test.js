/* global describe, test, expect, jest, beforeAll, afterAll, afterEach */
/**
 * Le hook doit être INERTE sur un binaire sans expo-screen-capture (OTA posée
 * sur un binaire actuel), et suivre le focus de l'écran quand le module est là.
 * Pas de moteur de rendu React 19 dans le projet : un mini moteur de hooks
 * remplace `react` le temps du test.
 */

function moteurDeHooks() {
  const etat = { slots: [], index: 0, contexte: null, aRendre: false };
  const react = {
    useContext: () => etat.contexte,
    useId: () => ':r0:',
    useState: (init) => {
      const i = etat.index++;
      if (!(i in etat.slots)) etat.slots[i] = { valeur: typeof init === 'function' ? init() : init };
      const slot = etat.slots[i];
      return [slot.valeur, (v) => { slot.valeur = v; etat.aRendre = true; }];
    },
    useEffect: (effet, deps) => {
      const i = etat.index++;
      const avant = etat.slots[i];
      const change = !avant || !deps || deps.some((d, k) => d !== avant.deps[k]);
      if (!change) return;
      avant?.nettoyage?.();
      etat.slots[i] = { deps, nettoyage: undefined };
      etat.slots[i].nettoyage = effet();
    },
  };
  const demonter = () => etat.slots.forEach((s) => s?.nettoyage?.());
  return { etat, react, demonter };
}

function fausseNavigation(focusInitial) {
  const ecouteurs = { focus: [], blur: [] };
  let focus = focusInitial;
  return {
    isFocused: () => focus,
    addListener: (nom, cb) => {
      ecouteurs[nom].push(cb);
      return () => { ecouteurs[nom] = ecouteurs[nom].filter((f) => f !== cb); };
    },
    emettre: (nom) => { focus = nom === 'focus'; ecouteurs[nom].forEach((cb) => cb()); },
  };
}

const vider = () => new Promise((r) => setImmediate(r));

function charger({ module, navigation }) {
  const m = moteurDeHooks();
  m.etat.contexte = navigation || null;
  let hook;
  jest.isolateModules(() => {
    jest.doMock('react', () => m.react);
    jest.doMock('@react-navigation/native', () => ({ NavigationContext: {} }));
    if (module) jest.doMock('expo-screen-capture', () => module, { virtual: true });
    hook = require('../useSecureScreen').default;
  });
  const rendre = (...args) => {
    let tours = 0;
    do {
      m.etat.aRendre = false;
      m.etat.index = 0;
      hook(...args);
    } while (m.etat.aRendre && ++tours < 5);
  };
  return { rendre, demonter: m.demonter };
}

// Le test « inerte » passe en premier : aucun faux module n'est encore déclaré.
afterEach(() => {
  jest.resetModules();
});

test('sans le module natif (binaire actuel) : inerte, aucune exception', async () => {
  // expo-screen-capture n'est pas installé dans node_modules : son require
  // échoue exactement comme sur un binaire qui ne l'embarque pas.
  const { rendre, demonter } = charger({ navigation: fausseNavigation(true) });
  expect(() => rendre('Documents')).not.toThrow();
  expect(() => demonter()).not.toThrow();
  await vider();
});

test('module JS présent mais natif en erreur : l\'écran s\'affiche quand même', async () => {
  const module = {
    preventScreenCaptureAsync: jest.fn(() => { throw new Error('Cannot find native module'); }),
    allowScreenCaptureAsync: jest.fn(() => Promise.reject(new Error('absent'))),
  };
  const { rendre, demonter } = charger({ module, navigation: fausseNavigation(true) });
  expect(() => rendre('EditIban')).not.toThrow();
  await vider();
  expect(() => demonter()).not.toThrow();
  await vider();
  expect(module.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
});

test('avec le module : protège au focus, lève au blur et au démontage', async () => {
  const module = {
    preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
    allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  };
  const nav = fausseNavigation(true);
  const { rendre, demonter } = charger({ module, navigation: nav });

  rendre('Wallet');
  await vider();
  expect(module.preventScreenCaptureAsync).toHaveBeenCalledWith('Wallet::r0:');

  nav.emettre('blur');
  rendre('Wallet');
  await vider();
  expect(module.allowScreenCaptureAsync).toHaveBeenCalledWith('Wallet::r0:');

  nav.emettre('focus');
  rendre('Wallet');
  await vider();
  expect(module.preventScreenCaptureAsync).toHaveBeenCalledTimes(2);

  demonter();
  await vider();
  expect(module.allowScreenCaptureAsync).toHaveBeenCalledTimes(2);
});

test('hors navigateur (écran de connexion) : protégé dès le montage', async () => {
  const module = {
    preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
    allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  };
  const { rendre, demonter } = charger({ module, navigation: null });
  rendre('Login');
  await vider();
  expect(module.preventScreenCaptureAsync).toHaveBeenCalledWith('Login::r0:');
  demonter();
  await vider();
  expect(module.allowScreenCaptureAsync).toHaveBeenCalledWith('Login::r0:');
});

test('enabled=false : rien n\'est demandé au module', async () => {
  const module = {
    preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
    allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  };
  const { rendre } = charger({ module, navigation: fausseNavigation(true) });
  rendre('Wallet', false);
  await vider();
  expect(module.preventScreenCaptureAsync).not.toHaveBeenCalled();
});
