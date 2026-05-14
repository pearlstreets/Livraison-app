# Livraison_pearl — `pearl-delivery` (Expo + React Native)

App mobile chauffeur-livreur de l'écosystème Pearl Streets.
Projets frères (même utilisateur, mêmes conventions i18n/sécurité/git) :
- `/Users/remsko/Pearl Streets Marketplace 1.0/` — monorepo principal (6 apps)
- `/Users/remsko/Liste_Pearl/` — app shopping-list `pearl-list`

## Principe directeur (toute action)

Fais en sorte que ce soit logique, simple, complet, fonctionnel, rapide et optimisé, afin d'éviter tout crash et de ne perdre aucune information importante.

**Plafond d'exploration : max 2 tool calls avant d'agir.** Table « Où chercher » ci-dessous → `Read` fichier cible → `Edit`. Si le chemin est dans la table, pas de grep/find en plus. Si ambigu : 1 question, pas de recherche. Grep autorisé seulement pour chercher une chaîne précise dans le code, et toujours scopé à un sous-dossier.

## Commandes

```bash
npm start          # expo start
npm run ios        # expo run:ios
npm run android    # expo run:android
npm run web        # expo start --web
npm run lint       # expo lint
npm run go:lan     # expo start --lan --go -c  (dev sur LAN)
npm run go:tunnel  # expo start --tunnel --go -c  (dev via tunnel)
```

## Où chercher (feature → chemin)

| Feature | Chemin |
|---|---|
| Entry app | `App.js`, `index.js` |
| Auth (login + changement mot de passe) | `screens/LoginScreen.js`, `screens/ChangePasswordScreen.js` |
| Profil / édition | `screens/ProfileScreen.js`, `screens/EditProfileScreen.js` |
| Menu principal | `screens/MenuScreen.js` |
| Livraisons (flow complet) | `screens/DeliveryFlowScreen.js`, `screens/DeliveryDetailScreen.js`, `screens/DeliveryHistoryScreen.js` |
| Commandes | `screens/OrdersScreen.js` |
| Opportunités (missions dispo) | `screens/OpportunitiesScreen.js`, `screens/OpportunityDetailScreen.js` |
| Carte / géoloc | `screens/MapScreen.js`, `screens/HeatmapScreen.js` |
| Gains / wallet / versements | `screens/EarningsScreen.js`, `screens/WalletScreen.js`, `screens/VersementsListScreen.js`, `screens/VersementDetailScreen.js`, `screens/WeekDetailScreen.js` |
| IBAN | `screens/EditIbanScreen.js` |
| Véhicule | `screens/VehicleScreen.js` |
| Documents (upload/vérif) | `screens/DocumentsScreen.js`, `screens/DocumentDetailScreen.js` |
| Historique | `screens/HistoryScreen.js` |
| Ratings / notations | `screens/RatingsScreen.js` |
| Warnings / avertissements | `screens/WarningsScreen.js` |
| Inbox / messages | `screens/InboxScreen.js` |
| Tickets / support | `screens/TicketsListScreen.js`, `screens/TicketChatScreen.js` |
| Help / aide | `screens/HelpScreen.js`, `screens/HelpDetailScreen.js` |
| Contact support | `screens/ContactSupportScreen.js` |
| Report problème | `screens/ReportProblemScreen.js` |
| Contexts (state global) | `contexts/AuthContext.js`, `contexts/LanguageContext.js`, `contexts/translations.js` |
| Services API (entry) | `services/index.js`, `services/api.js` |
| Auth service | `services/authService.js` |
| Livraison backend | `services/deliveryService.js` |
| Gains backend | `services/earningsService.js` |
| Tickets backend | `services/ticketService.js` |
| Stockage sécurisé (tokens) | `services/secureStorage.js` |
| Push notifications | `services/oneSignalInit.js` |
| Components métier | `components/OrderCard.js`, `components/DriverStatus.js`, `components/DetailsSheet.js`, `components/InlineFilters.js` |
| Components UI réutilisables | `components/ui/`, `components/ThemedText.tsx`, `components/ThemedView.tsx`, `components/Collapsible.tsx`, `components/HapticTab.tsx`, `components/ParallaxScrollView.tsx`, `components/HelloWave.tsx` |
| API component-local | `components/api.js` |
| Hooks theming | `hooks/useColorScheme.ts`, `hooks/useColorScheme.web.ts`, `hooks/useThemeColor.ts` |
| Utilitaires | `utils/performance.js`, `utils/validation.js` |
| Constantes (couleurs/config) | `constants/Colors.ts`, `constants/driver-config.json`, `constants/filters.json`, `constants/filters-ui.json`, `constants/meaux.seed.json`, `constants/mockOrders.js` |
| Scripts (backups historiques) | `scripts/histo-save.sh`, `scripts/histo-restore.sh`, `scripts/reset-project.js` |
| Web build | `web/` |
| Config build | `app.json`, `eas.json`, `babel.config.js`, `tsconfig.json`, `eslint.config.js` |
| Assets | `assets/` |

## Conventions

- **Expo managed** — `expo run:ios`, `expo run:android`, `expo start --web` pour web
- **Dev LAN/tunnel** : `npm run go:lan` (LAN), `npm run go:tunnel` (tunnel, si Metro inaccessible)
- **Navigation** : `@react-navigation/native` + `native-stack` + `bottom-tabs`
- **State** : React Context (`AuthContext`, `LanguageContext`) — pas Redux
- **API** : axios, tokens via `services/secureStorage.js` (NOT `AsyncStorage` pour les secrets)
- **i18n** : via `contexts/LanguageContext.js` + `contexts/translations.js` (inline, pas i18next)
- **Push** : OneSignal via `services/oneSignalInit.js`
- **Theming** : `hooks/useColorScheme` + `hooks/useThemeColor` + `constants/Colors.ts` (tokens)
- **TS mixte** : `.tsx` pour UI primitives (Themed*), `.js` pour screens/services
- **Backups historiques** : `SAUVEGARDE_*/`, `backup_*/`, `historique/` sont UNTRACKED — JAMAIS stager

## Git — RÈGLES STRICTES (garde-fou incident Liste_Pearl 2026-04-19)

### Avant TOUTE modification de fichier

1. `git status -sb` — obligatoire en début de session
2. Pour chaque fichier que tu prévois d'éditer, vérifier s'il apparaît dans le status :
   - `M <fichier>` → modifs préexistantes uncommitted (PAS de toi) sur disk
   - `D <fichier>` → suppression préexistante en cours
   - `??` → untracked

### Règle absolue — fichiers avec modifs préexistantes

**Si un fichier est `M` ou `D` dans `git status` au moment où tu arrives, tu n'as PAS le droit de le `git add <fichier>` directement après ton Edit.** Tu embarquerais dans ton commit des changements que tu n'as pas faits.

#### Procédure surgicale obligatoire

```bash
# 1. Sauvegarder l'état mixed actuel (préexistant + ce que tu vas ajouter)
cp <fichier> /tmp/<fichier>.mixed

# 2. Restaurer le fichier à HEAD (efface le préexistant ET tes modifs)
git checkout HEAD -- <fichier>

# 3. Ré-appliquer SEULEMENT tes modifs sur la version HEAD restaurée

# 4. Stager + commit ta feature isolée
git add <fichier>
git commit -m "..."

# 5. Restaurer le mixed (réintroduit le préexistant en working dir)
cp /tmp/<fichier>.mixed <fichier>

# Le préexistant reste uncommitted — l'utilisateur décide
```

### Avant CHAQUE commit

```bash
git diff --staged --stat
```

Si l'output dépasse ce que tu as réellement écrit → **STOP**. Tu as embarqué du préexistant. `git reset HEAD <fichier>` puis procédure surgicale.

### `git add` interdits

- `git add .`
- `git add -A`
- `git add <dir>/`
- Ajouter `SAUVEGARDE_*/`, `backup_*/`, `historique/` (untracked, à ignorer)

Toujours énumérer chaque fichier explicitement par son chemin.

## Worktrees

Le répertoire peut contenir `.claude/worktrees/<branche>/` — code expérimental isolé. **Ne JAMAIS** copier de code venant d'un worktree vers root sans vérifier `git status` du root d'abord et lire le contenu du worktree pour comprendre ses dépendances.

## Référence incident

Garde-fou créé suite à un incident sur Liste_Pearl (2026-04-19) où un `git add` a embarqué 5014 lignes de refactor préexistant dans un commit feature.
