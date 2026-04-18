import React, { useEffect, lazy, Suspense } from 'react';
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
import { NavigationContainer, DefaultTheme, getFocusedRouteNameFromRoute, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { deliveryService } from './services/deliveryService';
import pushService from './services/pushService';
import * as Device from 'expo-device';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import LoginScreen from './screens/LoginScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
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

const BRAND = '#00C29B';
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MenuStack = createNativeStackNavigator();
const EarningsStack = createNativeStackNavigator();
const LoginStack = createNativeStackNavigator();

function LoginStackScreen() {
  return (
    <LoginStack.Navigator screenOptions={{ headerShown: false }}>
      <LoginStack.Screen name="LoginMain" component={LoginScreen} />
      <LoginStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </LoginStack.Navigator>
  );
}
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: BRAND, card: '#fff', text: '#111' } };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Navigation ref used by push-notification handlers to route the driver to
// the Orders tab when a new-assignment notification is received/tapped.
export const navigationRef = createNavigationContainerRef();
function focusOrdersTab() {
  try {
    if (navigationRef.isReady()) navigationRef.navigate('Home');
  } catch { /* ignore */ }
}

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
      if (!Device.isDevice) return; // push tokens don't exist on simulators

      // 1) OneSignal init — this is the real push channel used by the Pearl
      // Streets backend (settings.ONESIGNAL_USER_APP_ID). Safe no-op when
      // EXPO_PUBLIC_ONESIGNAL_APP_ID is unset or the native module isn't
      // linked (Expo Go, web).
      pushService.init();
      await pushService.requestPermission();
      if (user?.driverId || user?.email) {
        pushService.setExternalUser(user.driverId || user.email);
      }

      // 2) Expo notifications still set up so local / scheduled notifs work
      // (e.g. "Tester notification" on ProfileScreen). Channel-only on
      // Android; no network call in this branch.
      try {
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
      } catch { /* ignore */ }

      // 3) Legacy Expo push token registration — kept as a fallback for
      // dev builds without OneSignal. Silent 404 when the backend doesn't
      // expose /push-token/; harmless.
      if (!pushService.isEnabled()) {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          const token = tokenData?.data;
          if (token) {
            deliveryService.registerPushToken(token, Platform.OS).catch(() => { /* ignore */ });
          }
        } catch { /* ignore */ }
      }
    })();
  }, [user?.email, user?.driverId]); // re-register after login

  // Foreground + response listeners for push notifications. When a new order
  // is delivered to the device (either while the app is open, or when the
  // driver taps a background notification), route to the Orders tab so the
  // new assignment card is visible immediately. Covers BOTH push channels:
  //   - expo-notifications: local scheduled notifs + Expo push (dev)
  //   - OneSignal: what the Marketplace backend actually uses in prod
  useEffect(() => {
    const isOrderType = (type) =>
      type === 'new_order' || type === 'delivery_assignment';

    // Expo channel
    const isExpoOrderPush = (n) => isOrderType(n?.request?.content?.data?.type);
    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      if (isExpoOrderPush(n)) focusOrdersTab();
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((resp) => {
      if (isExpoOrderPush(resp?.notification)) focusOrdersTab();
    });

    // OneSignal channel — only attaches when the native module is linked
    // AND an app id is configured. Otherwise this is a no-op.
    const onesignalClickHandler = (event) => {
      const data = event?.notification?.additionalData || event?.additionalData || {};
      if (isOrderType(data?.type)) focusOrdersTab();
    };
    pushService.addClickListener(onesignalClickHandler);

    return () => {
      try { receivedSub.remove(); } catch { /* ignore */ }
      try { responseSub.remove(); } catch { /* ignore */ }
      pushService.removeClickListener();
    };
  }, []);

  if (!user) return <LoginStackScreen />;

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

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <NavigationContainer theme={navTheme} ref={navigationRef}>
          <StatusBar style="dark" />
          <Main />
        </NavigationContainer>
      </AuthProvider>
    </LanguageProvider>
  );
}
