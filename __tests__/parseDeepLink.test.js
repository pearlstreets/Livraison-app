// Unit tests for the deep link parser exposed by App.js.
//
// We test the parser in isolation (App.js relies on react-native + expo-linking,
// which we mock) so the validation rules don't drift if app.json's scheme or
// the navigation tree changes.

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'pearldelivery://'),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
  parse: jest.fn((url) => {
    // Minimal URL parser that mirrors the shape Linking.parse returns.
    if (typeof url !== 'string') throw new Error('bad url');
    const m = url.match(/^pearldelivery:\/\/([^?#]*)(?:\?([^#]*))?/);
    if (!m) throw new Error('no match');
    const path = m[1] || '';
    const queryParams = {};
    if (m[2]) {
      m[2].split('&').forEach((pair) => {
        const [k, v] = pair.split('=');
        queryParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { path, queryParams };
  }),
}));

// react-native, react-navigation and the rest of the App.js tree are heavy —
// we only want the named export, so stub everything we don't care about.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }) => children,
  DefaultTheme: { colors: {} },
  getFocusedRouteNameFromRoute: () => undefined,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('../services/oneSignalInit', () => ({ initOneSignalOnce: jest.fn() }));
jest.mock('../services/offlineQueue', () => ({ start: jest.fn(async () => {}) }));
jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: null, getUnreadTicketCount: () => 0, getUnreadOpportunitiesCount: () => 0 }),
}));
jest.mock('../contexts/LanguageContext', () => ({
  LanguageProvider: ({ children }) => children,
  useLanguage: () => ({ t: (k) => k }),
}));

// Stub every screen import so App.js evaluates cleanly.
jest.mock('../screens/LoginScreen', () => () => null);
jest.mock('../screens/OrdersScreen', () => () => null);
jest.mock('../screens/EarningsScreen', () => () => null);
jest.mock('../screens/WeekDetailScreen', () => () => null);
jest.mock('../screens/WalletScreen', () => () => null);
jest.mock('../screens/InboxScreen', () => () => null);
jest.mock('../screens/MenuScreen', () => () => null);
jest.mock('../screens/EditProfileScreen', () => () => null);
jest.mock('../screens/DocumentsScreen', () => () => null);
jest.mock('../screens/VehicleScreen', () => () => null);
jest.mock('../screens/RatingsScreen', () => () => null);
jest.mock('../screens/OpportunitiesScreen', () => () => null);
jest.mock('../screens/HelpScreen', () => () => null);
jest.mock('../screens/HelpDetailScreen', () => () => null);
jest.mock('../screens/ContactSupportScreen', () => () => null);
jest.mock('../screens/DocumentDetailScreen', () => () => null);
jest.mock('../screens/DeliveryFlowScreen', () => () => null);
jest.mock('../screens/DeliveryHistoryScreen', () => () => null);
jest.mock('../screens/DeliveryDetailScreen', () => () => null);
jest.mock('../screens/TicketChatScreen', () => () => null);
jest.mock('../screens/ReportProblemScreen', () => () => null);
jest.mock('../screens/TicketsListScreen', () => () => null);
jest.mock('../screens/EditIbanScreen', () => () => null);
jest.mock('../screens/WarningsScreen', () => () => null);
jest.mock('../screens/HeatmapScreen', () => () => null);
jest.mock('../screens/ChangePasswordScreen', () => () => null);
jest.mock('../screens/OpportunityDetailScreen', () => () => null);
jest.mock('../screens/VersementsListScreen', () => () => null);
jest.mock('../screens/VersementDetailScreen', () => () => null);

const { parseDeepLink } = require('../App');

describe('parseDeepLink', () => {
  test('rejects null / empty / non-string', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink(123)).toBeNull();
  });

  test('rejects unknown scheme / malformed URL', () => {
    expect(parseDeepLink('https://example.com/order/42')).toBeNull();
    expect(parseDeepLink('pearldelivery://')).toBeNull();
    expect(parseDeepLink('not-a-url')).toBeNull();
  });

  test('parses /home into a tab route', () => {
    expect(parseDeepLink('pearldelivery://home')).toEqual({ type: 'tab', name: 'Accueil' });
  });

  test('parses /order/:orderId for valid ids only', () => {
    expect(parseDeepLink('pearldelivery://order/42')).toEqual({ type: 'order', orderId: '42' });
    expect(parseDeepLink('pearldelivery://order/ORD-99')).toEqual({ type: 'order', orderId: 'ORD-99' });
  });

  test('rejects non-numeric / oversized order ids', () => {
    expect(parseDeepLink('pearldelivery://order/<script>alert(1)</script>')).toBeNull();
    expect(parseDeepLink('pearldelivery://order/../etc/passwd')).toBeNull();
    expect(parseDeepLink('pearldelivery://order/9999999999999999999999')).toBeNull();
  });

  test('parses /delivery/:id for digits only', () => {
    expect(parseDeepLink('pearldelivery://delivery/7')).toEqual({ type: 'delivery', id: '7' });
    expect(parseDeepLink('pearldelivery://delivery/ABC')).toBeNull();
  });

  test('parses /ticket/:id for digits only', () => {
    expect(parseDeepLink('pearldelivery://ticket/123')).toEqual({ type: 'ticket', id: '123' });
    expect(parseDeepLink('pearldelivery://ticket/__proto__')).toBeNull();
  });

  test('rejects unknown paths', () => {
    expect(parseDeepLink('pearldelivery://settings')).toBeNull();
    expect(parseDeepLink('pearldelivery://order')).toBeNull();
  });
});
