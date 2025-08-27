import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import OrdersScreen from './screens/OrdersScreen';
import MapScreen from './screens/MapScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileScreen from './screens/ProfileScreen';

const BRAND = '#00C29B';
const Tab = createBottomTabNavigator();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: BRAND, card: '#fff', text: '#111' } };

// Notifications foreground handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
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

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#000',
          tabBarActiveTintColor: BRAND,
          tabBarInactiveTintColor: '#8e8e93',
          tabBarStyle: { backgroundColor: '#fff' },
          tabBarIcon: ({ color, size }) => {
            if (route.name === 'Commandes') return <Ionicons name="cube-outline" size={size} color={color} />;
            if (route.name === 'Carte') return <Ionicons name="map-outline" size={size} color={color} />;
            if (route.name === 'Historique') return <Ionicons name="time-outline" size={size} color={color} />;
            if (route.name === 'Profil') return <Ionicons name="person-circle-outline" size={size} color={color} />;
            return null;
          }
        })}
      >
        <Tab.Screen name="Commandes" component={OrdersScreen} />
        <Tab.Screen name="Carte" component={MapScreen} />
        <Tab.Screen name="Historique" component={HistoryScreen} />
        <Tab.Screen name="Profil" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
