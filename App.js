import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { Platform } from 'react-native';

// Security: Disable React DevTools in production
if (!__DEV__) {
  if (typeof window !== 'undefined') {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true };
  }
}

// NOTE: For Android network security, add the following to android/app/src/main/res/xml/network_security_config.xml:
// <network-security-config>
//   <domain-config cleartextTrafficPermitted="false">
//     <domain includeSubdomains="true">pythonapi.digiexports.in</domain>
//   </domain-config>
// </network-security-config>
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { initOneSignalOnce } from './services/oneSignalInit';
import offlineQueue from './services/offlineQueue';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import WarningsScreen from './screens/WarningsScreen';
import HeatmapScreen from './screens/HeatmapScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import OpportunityDetailScreen from './screens/OpportunityDetailScreen';
import VersementsListScreen from './screens/VersementsListScreen';
import VersementDetailScreen from './screens/VersementDetailScreen';

// Initialize OneSignal once at module load. The helper is a no-op when the
// native module isn't bundled or when expo.extra.oneSignalAppId is empty,
// so the app continues to boot identically until a build with credentials
// ships. Required to be called before render so OneSignal can attach its
// notification handlers ahead of the first user interaction.
initOneSignalOnce();
// Boot the offline queue: replays buffered non-critical writes when the
// network comes back. No-op when network is up.
offlineQueue.start().catch(() => {});

const BRAND = '#00C29B';
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MenuStack = createNativeStackNavigator();
const EarningsStack = createNativeStackNavigator();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: BRAND, card: '#fff', text: '#111' } };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, detachInactiveScreens: true }}>
      <HomeStack.Screen name="OrdersMain" component={OrdersScreen} />
      <HomeStack.Screen name="DeliveryFlow" component={DeliveryFlowScreen} />
      <HomeStack.Screen name="Heatmap" component={HeatmapScreen} />
    </HomeStack.Navigator>
  );
}

function EarningsStackScreen() {
  return (
    <EarningsStack.Navigator screenOptions={{ headerShown: false, detachInactiveScreens: true }}>
      <EarningsStack.Screen name="EarningsMain" component={EarningsScreen} />
      <EarningsStack.Screen name="WeekDetail" component={WeekDetailScreen} />
      <EarningsStack.Screen name="Wallet" component={WalletScreen} />
      <EarningsStack.Screen name="EditIban" component={EditIbanScreen} />
      <EarningsStack.Screen name="VersementsList" component={VersementsListScreen} />
      <EarningsStack.Screen name="VersementDetail" component={VersementDetailScreen} />
    </EarningsStack.Navigator>
  );
}

function MenuStackScreen() {
  return (
    <MenuStack.Navigator screenOptions={{ detachInactiveScreens: true }}>
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
      <MenuStack.Screen name="VersementsList" component={VersementsListScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="VersementDetail" component={VersementDetailScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="Warnings" component={WarningsScreen} options={{ headerShown: false }} />
      <MenuStack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: false }} />
    </MenuStack.Navigator>
  );
}

function Main() {
  const { user, getUnreadTicketCount, getUnreadOpportunitiesCount } = useAuth();
  const totalProfileNotifs = getUnreadTicketCount() + getUnreadOpportunitiesCount(4);
  const { t } = useLanguage();

  useEffect(() => {
    (async () => {
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus === 'granted' && Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
      }
    })();
  }, []);

  if (!user) return <LoginScreen />;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#000',
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: { backgroundColor: '#fff' },
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
          return { headerShown: false, tabBarLabel: t('tabHome'), tabBarStyle: routeName === 'DeliveryFlow' ? { display: 'none' } : { backgroundColor: '#fff' } };
        }} />
      <Tab.Screen name="MessagesTab" component={InboxScreen} options={{ headerTitle: t('inbox'), tabBarLabel: t('tabMessages') }} />
      <Tab.Screen name="Revenus" component={EarningsStackScreen} options={{ headerShown: false, tabBarLabel: t('tabEarnings') }} />
      <Tab.Screen name="Profil" component={MenuStackScreen} options={{ headerShown: false, tabBarLabel: t('tabProfile'), tabBarBadge: totalProfileNotifs > 0 ? totalProfileNotifs : undefined, tabBarBadgeStyle: { backgroundColor: '#e74c3c', fontSize: 10 } }}
        listeners={({ navigation }) => ({
          tabPress: () => { navigation.navigate('Profil', { screen: 'MenuMain' }); },
        })}
      />
    </Tab.Navigator>
  );
}

// ── Deep link config ─────────────────────────────────────────────────────────
// Scheme `pearldelivery://` is declared in app.json. We accept a small,
// hand-validated set of routes — every param is checked before navigation so
// a malicious link cannot push arbitrary IDs into the stack. Anything that
// fails validation is dropped silently (no crash, no nav).

const POSITIVE_INT_RE = /^\d{1,12}$/;
const ORDER_ID_RE = /^(?:ORD-)?\d{1,12}$/;

function parseDeepLink(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }
  const path = (parsed?.path || '').replace(/^\/+|\/+$/g, '');
  const params = parsed?.queryParams || {};
  if (!path) return null;

  // /home  → root tab
  if (path === 'home') return { type: 'tab', name: 'Accueil' };

  // /order/:orderId  → orders list focused on a specific order
  // We only accept ORD-1234 or 1234 — discard anything else.
  if (path.startsWith('order/')) {
    const raw = String(path.slice('order/'.length));
    if (!ORDER_ID_RE.test(raw)) return null;
    return { type: 'order', orderId: raw };
  }

  // /delivery/:id  → delivery detail view (numeric id only)
  if (path.startsWith('delivery/')) {
    const raw = String(path.slice('delivery/'.length));
    if (!POSITIVE_INT_RE.test(raw)) return null;
    return { type: 'delivery', id: raw };
  }

  // /ticket/:id  → support ticket chat
  if (path.startsWith('ticket/')) {
    const raw = String(path.slice('ticket/'.length));
    if (!POSITIVE_INT_RE.test(raw)) return null;
    return { type: 'ticket', id: raw };
  }

  return null;
}

const linking = {
  prefixes: [Linking.createURL('/'), 'pearldelivery://'],
  config: {
    screens: {
      Accueil: {
        screens: {
          OrdersMain: 'home',
          DeliveryFlow: 'order/:orderId',
        },
      },
      Profil: {
        screens: {
          DeliveryDetail: 'delivery/:id',
          TicketChat: 'ticket/:id',
        },
      },
    },
  },
  // Custom subscribe so we can validate before React Navigation fires.
  // If parseDeepLink rejects the URL we never propagate it.
  subscribe(listener) {
    const onReceive = ({ url }) => {
      const parsed = parseDeepLink(url);
      if (parsed) listener(url);
    };
    const sub = Linking.addEventListener('url', onReceive);
    return () => {
      try { sub?.remove?.(); } catch {}
    };
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (!url) return null;
    return parseDeepLink(url) ? url : null;
  },
};

export { parseDeepLink };

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <NavigationContainer theme={navTheme} linking={linking}>
          <StatusBar style="dark" />
          <Main />
        </NavigationContainer>
      </AuthProvider>
    </LanguageProvider>
  );
}
