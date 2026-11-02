import React, { useEffect, lazy, Suspense } from 'react';
import { View } from 'react-native';

// Security: Disable React DevTools in production
if (!__DEV__) {
  if (typeof window !== 'undefined') {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true };
  }
}

// NOTE: For Android network security, add the following to android/app/src/main/res/xml/network_security_config.xml:
// <network-security-config>
//   <domain-config cleartextTrafficPermitted="false">
//     <domain includeSubdomains="true">api.pearlstreets.com</domain>
//   </domain-config>
// </network-security-config>
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { demanderAutorisation } from './services/pushDirect';
import { navigationRef } from './services/navigationService';
import { deepLink } from './services/deepLink';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { useLocationTracking } from './hooks/useLocationTracking';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import LoginScreen from './screens/LoginScreen';
import OrdersScreen from './screens/OrdersScreen';
import EarningsScreen from './screens/EarningsScreen';
import WeekDetailScreen from './screens/WeekDetailScreen';
import WalletScreen from './screens/WalletScreen';
import InboxScreen from './screens/InboxScreen';
import MenuScreen from './screens/MenuScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import DocumentsScreen from './screens/DocumentsScreen';
import VehicleScreen from './screens/VehicleScreen';
import RatingsScreen from './screens/RatingsScreen';
import OpportunitiesScreen from './screens/OpportunitiesScreen';
import HelpScreen from './screens/HelpScreen';
import HelpDetailScreen from './screens/HelpDetailScreen';
import ContactSupportScreen from './screens/ContactSupportScreen';
import DocumentDetailScreen from './screens/DocumentDetailScreen';
import DeliveryFlowScreen from './screens/DeliveryFlowScreen';
import DeliveryHistoryScreen from './screens/DeliveryHistoryScreen';
import DeliveryDetailScreen from './screens/DeliveryDetailScreen';
import TicketChatScreen from './screens/TicketChatScreen';
import ReportProblemScreen from './screens/ReportProblemScreen';
import TicketsListScreen from './screens/TicketsListScreen';
import EditIbanScreen from './screens/EditIbanScreen';
import PayoutSetupScreen from './screens/PayoutSetupScreen';
import WarningsScreen from './screens/WarningsScreen';
import HeatmapScreen from './screens/HeatmapScreen';
import MapScreen from './screens/MapScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import OpportunityDetailScreen from './screens/OpportunityDetailScreen';
import VersementsListScreen from './screens/VersementsListScreen';
import VersementDetailScreen from './screens/VersementDetailScreen';
import { ecranDeplie, largeurMoitie } from './utils/deuxEcrans';
import { createDeuxEcransNavigator, AuMilieu } from './navigation/DeuxEcransStack';
import { signalerTailleRacine, surveillerRepliEcran, restaurerEcranApresRepli, noterEtatNavigation } from './utils/repliEcran';

// Tap sur une notification : écran concerné. La destination arrive dans
// `data.route` (backend DeliveryApp/notifications). Push en envoi direct
// (Firebase / Apple, services/pushDirect.js) : plus de OneSignal dans l'app.
// Enregistré au chargement du module pour capter aussi le tap qui LANCE
// l'app ; un même tap n'est traité qu'une fois. Tap qui lance l'app : la
// destination est gardée en attente et ouverte par Main une fois la session
// rechargée et les onglets affichés (sinon l'accueil la recouvrait).
let _dernierTap = null;
let _destinationEnAttente = null;
let _ongletsAffiches = false;
function ouvrirDestinationEnAttente() {
  if (!_destinationEnAttente || !_ongletsAffiches) return;
  const { route, donnees } = _destinationEnAttente;
  _destinationEnAttente = null;
  deepLink(route, donnees);
}
function ouvrirDepuisNotification(reponse) {
  try {
    const requete = reponse && reponse.notification && reponse.notification.request;
    const id = requete && requete.identifier;
    if (id && id === _dernierTap) return;
    _dernierTap = id || null;
    const donnees = (requete && requete.content && requete.content.data) || {};
    console.log('[push] toucher, route :', donnees.route || '(aucune)');
    _destinationEnAttente = { route: donnees.route, donnees };
    ouvrirDestinationEnAttente();
  } catch (_) {}
}
try {
  Notifications.addNotificationResponseReceivedListener(ouvrirDepuisNotification);
  Notifications.getLastNotificationResponseAsync()
    .then((reponse) => { if (reponse) ouvrirDepuisNotification(reponse); })
    .catch(() => {});
} catch (_) {}

const BRAND = '#00C29B';
const Tab = createBottomTabNavigator();
// Pliable deplie : chaque onglet en deux moities, ecran de navigation a
// gauche, page ouverte a droite (navigation/DeuxEcransStack.js). Plie ou
// telephone : piles natives, rien ne change. Fixe au chargement, l'app se
// recharge au pliage (utils/repliEcran.js).
const DEPLIE = ecranDeplie();
const createPile = DEPLIE ? createDeuxEcransNavigator : createNativeStackNavigator;
const HomeStack = createPile();
const MenuStack = createPile();
const EarningsStack = createPile();
const InboxStack = DEPLIE ? createDeuxEcransNavigator() : null;
// Ecrans de navigation (moitie gauche) de chaque onglet ; les autres
// s'ouvrent a droite. Le parcours de livraison remplace la liste des
// courses a gauche, sans barre d'onglets, comme sur le telephone.
const moitiesAccueil = DEPLIE ? { gauche: ['OrdersMain', 'DeliveryFlow'], sansBarre: ['DeliveryFlow'] } : {};
const moitiesRevenus = DEPLIE ? { gauche: ['EarningsMain', 'VersementsList'] } : {};
const moitiesProfil = DEPLIE ? { gauche: ['MenuMain', 'DeliveryHistory', 'Opportunities', 'TicketsList', 'Help', 'VersementsList'] } : {};
// Deplie, la barre d'onglets est posee sous la moitie gauche seulement.
const BARRE = DEPLIE
  ? { backgroundColor: '#fff', position: 'absolute', left: 0, bottom: 0, width: largeurMoitie() }
  : { backgroundColor: '#fff' };
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: BRAND, card: '#fff', text: '#111' } };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function HomeStackScreen() {
  return (
    <HomeStack.Navigator {...moitiesAccueil} screenOptions={{ headerShown: false, detachInactiveScreens: true }}>
      <HomeStack.Screen name="OrdersMain" component={OrdersScreen} />
      <HomeStack.Screen name="DeliveryFlow" component={DeliveryFlowScreen} />
      <HomeStack.Screen name="Heatmap" component={HeatmapScreen} />
      <HomeStack.Screen name="RouteMap" component={MapScreen} />
    </HomeStack.Navigator>
  );
}

function EarningsStackScreen() {
  return (
    <EarningsStack.Navigator {...moitiesRevenus} screenOptions={{ headerShown: false, detachInactiveScreens: true }}>
      <EarningsStack.Screen name="EarningsMain" component={EarningsScreen} />
      <EarningsStack.Screen name="WeekDetail" component={WeekDetailScreen} />
      <EarningsStack.Screen name="Wallet" component={WalletScreen} />
      <EarningsStack.Screen name="EditIban" component={EditIbanScreen} />
      <EarningsStack.Screen name="PayoutSetup" component={PayoutSetupScreen} />
      <EarningsStack.Screen name="VersementsList" component={VersementsListScreen} />
      <EarningsStack.Screen name="VersementDetail" component={VersementDetailScreen} />
    </EarningsStack.Navigator>
  );
}

function MenuStackScreen() {
  return (
    <MenuStack.Navigator {...moitiesProfil} screenOptions={{ detachInactiveScreens: true }}>
      <MenuStack.Screen name="MenuMain" component={MenuScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Documents" component={DocumentsScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Vehicle" component={VehicleScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Ratings" component={RatingsScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Opportunities" component={OpportunitiesScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="OpportunityDetail" component={OpportunityDetailScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="HelpDetail" component={HelpDetailScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="ContactSupport" component={ContactSupportScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="DocumentDetail" component={DocumentDetailScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="DeliveryHistory" component={DeliveryHistoryScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="DeliveryDetail" component={DeliveryDetailScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="TicketChat" component={TicketChatScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="ReportProblem" component={ReportProblemScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="TicketsList" component={TicketsListScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="EditIban" component={EditIbanScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="PayoutSetup" component={PayoutSetupScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="VersementsList" component={VersementsListScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="VersementDetail" component={VersementDetailScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Warnings" component={WarningsScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: false }} />
    </MenuStack.Navigator>
  );
}

// Deplie seulement : la messagerie a gauche, le panneau de repos a droite.
function InboxStackScreen() {
  return (
    <InboxStack.Navigator screenOptions={{ headerShown: false }}>
      <InboxStack.Screen name="InboxMain" component={InboxScreen} />
    </InboxStack.Navigator>
  );
}

function Main() {
  const { user, bootstrapping, isOnline, activeDelivery, getUnreadTicketCount, getUnreadOpportunitiesCount } = useAuth();
  // Track the driver's GPS whenever they're online OR a delivery is in progress
  // (so the customer never loses the live pin if the driver toggles offline
  // mid-course).
  useLocationTracking(isOnline || activeDelivery);
  const totalProfileNotifs = getUnreadTicketCount() + getUnreadOpportunitiesCount(4);
  const { t } = useLanguage();

  // Tap qui a lancé l'app (méthode recommandée par Expo pour le démarrage à
  // froid), puis ouverture de la destination dès que les onglets existent.
  const derniereReponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (derniereReponse) ouvrirDepuisNotification(derniereReponse);
  }, [derniereReponse]);
  const ongletsAffiches = Boolean(user) && !bootstrapping;
  useEffect(() => {
    _ongletsAffiches = ongletsAffiches;
    if (!ongletsAffiches) return undefined;
    const minuteur = setTimeout(ouvrirDestinationEnAttente, 0);
    return () => clearTimeout(minuteur);
  }, [ongletsAffiches]);

  // Une seule demande d'autorisation, au premier lancement (et le canal
  // Android des courses). L'enregistrement du téléphone suit la connexion
  // (contexts/AuthContext.js).
  useEffect(() => {
    demanderAutorisation().catch(() => {});
  }, []);

  if (bootstrapping) return null;
  if (!user) return DEPLIE ? <AuMilieu><LoginScreen /></AuMilieu> : <LoginScreen />;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#000',
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: BARRE,
        // Deplie : etiquettes sous les icones, comme sur le telephone.
        ...(DEPLIE ? { tabBarLabelPosition: 'below-icon' } : null),
        detachInactiveScreens: true,
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Accueil') return <Ionicons name="home-outline" size={size} color={color} />;
          if (route.name === 'MessagesTab') return <Ionicons name="mail-outline" size={size} color={color} />;
          if (route.name === 'Revenus') return <Ionicons name="wallet-outline" size={size} color={color} />;
          if (route.name === 'Profil') return <Ionicons name="person-outline" size={size} color={color} />;
          return null;
        }
      })}
    >
      <Tab.Screen name="Accueil" component={HomeStackScreen} options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'OrdersMain';
          return { headerShown: false, tabBarLabel: t('tabHome'), tabBarStyle: routeName === 'DeliveryFlow' ? { display: 'none' } : BARRE };
        }} />
      <Tab.Screen name="MessagesTab" component={DEPLIE ? InboxStackScreen : InboxScreen} options={{ headerShown: false, tabBarLabel: t('tabMessages') }} />
      <Tab.Screen name="Revenus" component={EarningsStackScreen} options={{ headerShown: false, tabBarLabel: t('tabEarnings') }} />
      <Tab.Screen name="Profil" component={MenuStackScreen} options={{ headerShown: false, tabBarLabel: t('tabProfile'), tabBarBadge: totalProfileNotifs > 0 ? totalProfileNotifs : undefined, tabBarBadgeStyle: { backgroundColor: '#e74c3c', fontSize: 10 } }}
        listeners={({ navigation }) => ({
          tabPress: () => { navigation.navigate('Profil', { screen: 'MenuMain' }); },
        })}
      />
    </Tab.Navigator>
  );
}

/**
 * Monte le fournisseur de devise SOUS AuthProvider : la devise d'affichage par
 * défaut est celle du pays du livreur (profil), donc il faut que l'auth soit
 * déjà disponible. Sans profil chargé → EUR, comme avant.
 */
function CurrencyGate({ children }) {
  const { profile, user } = useAuth() || {};
  const country = profile?.country || user?.country || null;
  return <CurrencyProvider country={country}>{children}</CurrencyProvider>;
}

export default function App() {
  // Pliable : rechargement au pliage et au depliage (utils/repliEcran.js).
  useEffect(() => surveillerRepliEcran(), []);
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <CurrencyGate>
            <View style={{ flex: 1 }} onLayout={signalerTailleRacine}>
              <NavigationContainer theme={navTheme} ref={navigationRef} onReady={restaurerEcranApresRepli} onStateChange={noterEtatNavigation}>
                <StatusBar style="dark" />
                <Main />
              </NavigationContainer>
            </View>
          </CurrencyGate>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
