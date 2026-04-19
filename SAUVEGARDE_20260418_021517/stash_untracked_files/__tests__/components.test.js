import React from 'react';
import { render } from '@testing-library/react-native';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';

// Wrapper for screens that need both contexts
function AppProviders({ children }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </LanguageProvider>
  );
}

// Mock navigation prop
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  getParent: jest.fn(() => ({ setOptions: jest.fn() })),
};

const mockRoute = { params: {} };

describe('Screen render tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('LoginScreen renders without crashing', () => {
    const LoginScreen = require('../screens/LoginScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <LoginScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('EarningsScreen renders without crashing', () => {
    const EarningsScreen = require('../screens/EarningsScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <EarningsScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('HelpDetailScreen renders without crashing (no params)', () => {
    const HelpDetailScreen = require('../screens/HelpDetailScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <HelpDetailScreen navigation={mockNavigation} route={{ params: undefined }} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('HelpDetailScreen renders with valid topic', () => {
    const HelpDetailScreen = require('../screens/HelpDetailScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <HelpDetailScreen navigation={mockNavigation} route={{ params: { topic: 'Mon compte' } }} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('DocumentDetailScreen renders without crashing (no params)', () => {
    const DocumentDetailScreen = require('../screens/DocumentDetailScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <DocumentDetailScreen navigation={mockNavigation} route={{ params: undefined }} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('DocumentDetailScreen renders with valid doc', () => {
    const DocumentDetailScreen = require('../screens/DocumentDetailScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <DocumentDetailScreen
          navigation={mockNavigation}
          route={{ params: { doc: { label: 'Permis de conduire', status: 'Validé', statusKey: 'validated' } } }}
        />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('ChangePasswordScreen renders without crashing', () => {
    const ChangePasswordScreen = require('../screens/ChangePasswordScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <ChangePasswordScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('HelpScreen renders without crashing', () => {
    const HelpScreen = require('../screens/HelpScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <HelpScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('RatingsScreen renders without crashing', () => {
    const RatingsScreen = require('../screens/RatingsScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <RatingsScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('VehicleScreen renders without crashing', () => {
    const VehicleScreen = require('../screens/VehicleScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <VehicleScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('WalletScreen renders without crashing', () => {
    const WalletScreen = require('../screens/WalletScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <WalletScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('WarningsScreen renders without crashing', () => {
    const WarningsScreen = require('../screens/WarningsScreen').default;
    const { toJSON } = render(
      <AppProviders>
        <WarningsScreen navigation={mockNavigation} route={mockRoute} />
      </AppProviders>
    );
    expect(toJSON()).toBeTruthy();
  });
});
