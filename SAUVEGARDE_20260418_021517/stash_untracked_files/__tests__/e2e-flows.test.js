/**
 * E2E Integration Tests - Simulates full user flows
 * Tests the complete journey from registration to delivery
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock services
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockLogout = jest.fn(() => Promise.resolve());
const mockGetProfile = jest.fn();
const mockToggleOnline = jest.fn(() => Promise.resolve());
const mockUpdateDeliveryStatus = jest.fn(() => Promise.resolve());
const mockGetAvailableOrders = jest.fn(() => Promise.resolve({ data: [] }));
const mockGetDeliveryHistory = jest.fn(() => Promise.resolve({ results: [] }));
const mockGetWeeklyEarnings = jest.fn(() => Promise.resolve({ results: [] }));
const mockRequestCashout = jest.fn(() => Promise.resolve());

jest.mock('../services/authService', () => ({
  authService: {
    login: (...args) => mockLogin(...args),
    register: (...args) => mockRegister(...args),
    logout: (...args) => mockLogout(...args),
    getProfile: (...args) => mockGetProfile(...args),
    resetSessionTimer: jest.fn(),
    clearSessionTimer: jest.fn(),
  },
}));

jest.mock('../services/deliveryService', () => ({
  deliveryService: {
    toggleOnline: (...args) => mockToggleOnline(...args),
    updateDeliveryStatus: (...args) => mockUpdateDeliveryStatus(...args),
    getAvailableOrders: (...args) => mockGetAvailableOrders(...args),
    getDeliveryHistory: (...args) => mockGetDeliveryHistory(...args),
    updateLocation: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../services/earningsService', () => ({
  earningsService: {
    getWeeklyEarnings: (...args) => mockGetWeeklyEarnings(...args),
    requestCashout: (...args) => mockRequestCashout(...args),
  },
}));

// Test helper - renders with all providers
function AppProviders({ children }) {
  return (
    <LanguageProvider>
      <AuthProvider>{children}</AuthProvider>
    </LanguageProvider>
  );
}

// Consumer that exposes auth actions
function AuthTestHarness({ onReady }) {
  const auth = useAuth();
  React.useEffect(() => { onReady(auth); }, [auth, onReady]);
  return (
    <>
      <Text testID="user-state">{auth.user ? 'logged-in' : 'logged-out'}</Text>
      <Text testID="verified">{auth.user?.isVerified ? 'verified' : 'unverified'}</Text>
      <Text testID="online">{auth.isOnline ? 'online' : 'offline'}</Text>
      <Text testID="earnings">{auth.currentEarningsCents}</Text>
      <Text testID="deliveries">{auth.totalDeliveries}</Text>
      <Text testID="warnings">{auth.warnings}</Text>
      <Text testID="active">{auth.accountActive ? 'active' : 'deactivated'}</Text>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('E2E Flow: New Driver Registration → Approval → First Delivery', () => {

  it('1. New driver registers and lands on pending approval', async () => {
    mockRegister.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'newdriver@test.com', userName: 'Jean', is_verified: false, account_active: true },
    });

    let auth;
    render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    // Register
    let result;
    await act(async () => {
      result = await auth.register({
        email: 'newdriver@test.com', password: 'Strong@Pass1',
        prenom: 'Jean', nom: 'Dupont', phone: '0612345678', role: 'user',
      });
    });

    expect(result).toBe(true);
    expect(mockRegister).toHaveBeenCalled();
  });

  it('2. Admin approves → driver becomes verified', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', userName: 'Jean', is_verified: true, rating: '4.8', total_deliveries: 0, account_active: true },
    });

    let auth;
    const { getByTestId } = render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Strong@Pass1'); });
    expect(getByTestId('verified').props.children).toBe('verified');
  });

  it('3. Verified driver goes online', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', is_verified: true, is_online: false, account_active: true },
    });

    let auth;
    const { getByTestId } = render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Pass@123'); });
    expect(getByTestId('online').props.children).toBe('offline');

    await act(async () => { await auth.toggleOnline(true); });
    expect(getByTestId('online').props.children).toBe('online');
    expect(mockToggleOnline).toHaveBeenCalledWith(true);
  });

  it('4. Driver completes a delivery → earnings update', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', is_verified: true, total_deliveries: 5, account_active: true },
    });

    let auth;
    const { getByTestId } = render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Pass@123'); });
    expect(getByTestId('deliveries').props.children).toBe(5);

    // Complete a delivery
    act(() => {
      auth.addToHistory({ id: 'ORD-100', restaurant: 'Pizza Roma', priceText: '12.50 €', status: 'completed' });
    });

    expect(getByTestId('deliveries').props.children).toBe(6);
    expect(Number(getByTestId('earnings').props.children)).toBe(1250);
  });

  it('5. Driver cancels too many → gets warning → account deactivated', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', is_verified: true, account_active: true },
    });

    let auth;
    const { getByTestId } = render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Pass@123'); });

    // Cancel 6 orders → triggers warning
    for (let i = 0; i < 6; i++) {
      act(() => { auth.cancelOrder(); });
    }

    expect(Number(getByTestId('warnings').props.children)).toBeGreaterThan(0);

    // Add 2 more warnings to deactivate
    act(() => { auth.addWarning('W2'); auth.addWarning('W3'); });
    expect(getByTestId('active').props.children).toBe('deactivated');

    // Reactivate
    act(() => { auth.reactivateAccount(); });
    expect(getByTestId('active').props.children).toBe('active');
  });

  it('6. Full cashout flow', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', is_verified: true, account_active: true },
    });

    let auth;
    const { getByTestId } = render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Pass@123'); });

    // Add earnings
    act(() => { auth.addToHistory({ id: 'ORD-200', restaurant: 'Sushi Zen', priceText: '15.00 €', status: 'completed' }); });
    expect(Number(getByTestId('earnings').props.children)).toBe(1500);

    // Cashout
    await act(async () => { await auth.cashOut(); });
    expect(Number(getByTestId('earnings').props.children)).toBe(0);
    expect(mockRequestCashout).toHaveBeenCalled();
    expect(auth.versements.length).toBeGreaterThan(0);
  });

  it('7. Ticket support flow', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', is_verified: true, account_active: true },
    });

    let auth;
    render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Pass@123'); });

    // Create ticket
    expect(auth.getTicketMessages('t1')).toBeNull();
    act(() => { auth.saveTicketMessages('t1', [{ id: '1', type: 'user', text: 'Client absent' }]); });
    expect(auth.getTicketMessages('t1')).toHaveLength(1);
    expect(auth.getUnreadTicketCount()).toBe(1);

    // Mark as read
    act(() => { auth.markTicketRead('t1'); });
    expect(auth.getUnreadTicketCount()).toBe(0);
  });

  it('8. Logout clears all state', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'driver@test.com', is_verified: true, account_active: true },
    });

    let auth;
    const { getByTestId } = render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('driver@test.com', 'Pass@123'); });
    expect(getByTestId('user-state').props.children).toBe('logged-in');

    await act(async () => { await auth.logout(); });
    expect(getByTestId('user-state').props.children).toBe('logged-out');
    expect(mockLogout).toHaveBeenCalled();
  });
});

describe('E2E Flow: Security Edge Cases', () => {

  it('blocks login after 5 failed attempts', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid'));

    let auth;
    render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    for (let i = 0; i < 5; i++) {
      await act(async () => { await auth.login('wrong@test.com', 'wrong'); });
    }

    let result;
    await act(async () => { result = await auth.login('wrong@test.com', 'wrong'); });
    expect(result).toHaveProperty('locked', true);
    expect(result.remainingSeconds).toBeGreaterThan(0);
  });

  it('rejects invalid email without calling API', async () => {
    let auth;
    render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    await act(async () => { await auth.login('not-an-email', 'pass'); });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('duplicate order IDs are ignored in history', () => {
    let auth;
    render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    act(() => { auth.addToHistory({ id: 'DUP-1', restaurant: 'Test', priceText: '5 €', status: 'completed' }); });
    const count = auth.deliveryHistory.length;
    act(() => { auth.addToHistory({ id: 'DUP-1', restaurant: 'Test', priceText: '5 €', status: 'completed' }); });
    expect(auth.deliveryHistory.length).toBe(count);
  });

  it('cashout with zero balance does nothing', async () => {
    let auth;
    render(<AppProviders><AuthTestHarness onReady={a => { auth = a; }} /></AppProviders>);

    const versementsBefore = auth.versements.length;
    await act(async () => { await auth.cashOut(); });
    expect(auth.versements.length).toBe(versementsBefore);
    expect(mockRequestCashout).not.toHaveBeenCalled();
  });
});
