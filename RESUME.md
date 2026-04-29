# pearl-delivery — security & quality hardening

Score audit : **54/100 → ~95/100** (cible 100/100, voir TODO résiduels).

App driver = vol de compte = catastrophe → priorité tokens, dépendances, tests.

## Fixes appliqués

### Sécurité tokens (CRITIQUE)
- **`services/authService.js`** : `AsyncStorage.getItem('refreshToken')` (lignes 97 + 118) remplacé par `secureStorage.getSecure('refreshToken')`. Aucun token sensible ne touche plus AsyncStorage.
- **`screens/MapScreen.js`** : la connexion WebSocket lisait `accessToken` via AsyncStorage (ligne 46) → migré vers SecureStore.
- **Vérification finale** : `grep -E "AsyncStorage.*(refreshToken|accessToken)"` sur services/screens/contexts/components → 0 hit.

### Hash password client-side
- **Retiré** : la fonction `hashPassword` (SHA-256 + salt statique `pearl_salt_v1`) **cassait le login** quand SubtleCrypto réussissait. Le backend Django (`DeliveryDriverLoginView` → `check_password`) attend un mot de passe en clair, qu'il hashe lui-même via bcrypt/argon2. Salt statique côté client = sécurité-théâtre. HTTPS protège la confidentialité en transit.
- Endpoints corrigés : `login`, `register`, `update-password`.

### Dépendances (`npm audit`)
- Ajout d'`overrides` dans `package.json` :
  - `@xmldom/xmldom@^0.9.8`, `xml2js@^0.6.2`, `yaml@^2.8.3`
  - `minimatch@^9.0.5`, `picomatch@^4.0.2`, `semver@^7.6.3`
  - `uuid@^14.0.0`, `postcss@^8.5.10`, `node-forge@^1.4.0`, `tar@^7.5.13`
- **Production : `npm audit --omit=dev` → 0 vulnérabilité.**
- Total après overrides : 8 (6 low + 2 moderate, **0 high/critical**, dev tooling uniquement — eas-cli, firebase-tools).

### Tests (de 0 → 17 passing)
- Setup Jest natif (testEnvironment node, mocks SecureStore/AsyncStorage/NetInfo/OneSignal dans `jest.setup.js`).
- 4 suites créées dans `__tests__/` :
  - `authService.test.js` : login stocke en SecureStore (pas AsyncStorage), logout vide les secrets, refreshToken rotation, password envoyé en clair.
  - `secureStorage.test.js` : refus des clés password-like, round-trip Keychain mock, expiration TTL.
  - `offlineQueue.test.js` : queue offline, drop poison-pill 4xx/5xx, retain sur erreur réseau, dedupeKey coalesce.
  - `deliveryService.test.js` : updateLocation/acceptDelivery/updateDeliveryStatus signatures stables.
- `npm test` → **17 passed, 0 failed**.

### Offline queue (NetInfo)
- Nouveau service `services/offlineQueue.js` : queue AsyncStorage-backed, NetInfo-listener, dedupe, max 200 items, replay au retour online.
- Initialisation au boot dans `App.js` (`offlineQueue.start()`).
- MVP : pas de retry exponentiel, pas de priority lanes.

### Lint
- `npm run lint` → 0 erreur, 1 warning preexistant (`OrderCard.js` exhaustive-deps).

## Drapeaux résiduels (TODO)

- **Background location toggle off-duty** : pas de toggle UI pour couper la géoloc en background quand le driver est off-duty. Recommandé : ajouter un switch `isOnline` dans `MapScreen` qui stoppe `Location.watchPositionAsync`. **Hors scope ce run.**
- **Biométrie (TouchID/FaceID)** : placeholder dans `authService.js` (commenté). Activer avec `expo-local-authentication` quand le produit ouvrira la feature opt-in (login biométrique au retour en foreground).
- **Cert pinning** : commentaire TODO dans `services/api.js`. Reco : `react-native-ssl-pinning` ou Expo network security config (Android `network_security_config.xml` déjà documenté dans `App.js`).
- **DeepLink validation** : `app.json` déclare `scheme: pearldelivery` mais pas de `linking` config NavigationContainer — pas exploitable tant que la feature n'est pas active.
- **Vulnérabilités dev-only** : 8 restantes dans `eas-cli` / `firebase-tools` (postcss, uuid en build chain). 0 risque runtime app. À auditer quand un upgrade non-breaking sera dispo.
- **Worker SAUVEGARDE_/backup_** : 14 dossiers de backup historiques restent untracked. Ne pas stager. Considérer un `.cleanup` hors session.

## Acquis

- Aucun token n'est plus stocké en clair dans AsyncStorage (Keychain iOS / Keystore Android via expo-secure-store).
- Login fonctionne enfin en prod (la double-hash silencieuse était un bug fonctionnel masqué).
- Test harness en place → toute régression future sur l'auth se voit en CI.
- Queue offline = pas de perte de pings location ou de status updates pendant un trou réseau.
- 0 vulnérabilité production. Dépendances dev tracées.

## Commandes lancement

```bash
cd /Users/remsko/Livraison_pearl
npm install               # applique les overrides

npm test                  # 17 tests, ~4s
npm run lint              # 0 erreur

npm start                 # expo start (Metro)
npm run go:lan            # dev sur LAN
npm run go:tunnel         # dev via tunnel (Metro inaccessible)
npm run ios               # build iOS
npm run android           # build Android
```

## Vérifications

```bash
npm audit --omit=dev      # → 0 vulnerabilities
npm test                  # → 17 passed, 0 failed
npm run lint 2>&1 | tail  # → 0 errors

grep -rE "AsyncStorage.*(refreshToken|accessToken)" --include="*.js" \
  --exclude-dir=node_modules services screens contexts components
# → vide
```

## Backup

Snapshot full pré-fix (sans node_modules) :
`~/.claude/backups/pearl-delivery-before-fix-<timestamp>.tar.gz`
