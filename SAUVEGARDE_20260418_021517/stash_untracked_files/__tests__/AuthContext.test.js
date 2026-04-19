import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Mock the services that AuthContext now uses
jest.mock('../services/authService', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(() => Promise.resolve()),
    resetSessionTimer: jest.fn(),
    clearSessionTimer: jest.fn(),
  },
}));
jest.mock('../services/deliveryService', () => ({
  deliveryService: {
    getDeliveryHistory: jest.fn(() => Promise.resolve({ results: [] })),
    toggleOnline: jest.fn(() => Promise.resolve()),
    getAvailableOrders: jest.fn(() => Promise.resolve({ data: [] })),
    updateDeliveryStatus: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../services/earningsService', () => ({
  earningsService: {
    getWeeklyEarnings: jest.fn(() => Promise.resolve({ results: [] })),
    requestCashout: jest.fn(() => Promise.resolve()),
  },
}));

const { authService } = require('../services/authService');

// Helper component that exposes context values
function AuthConsumer({ onAuth }) {
  const auth = useAuth();
  React.useEffect(() => { onAuth(auth); }, [auth, onAuth]);
  return <Text testID="user">{auth.user ? auth.user.email : 'no-user'}</Text>;
}

function renderWithAuth(onAuth) {
  return render(
    <AuthProvider>
      <AuthConsumer onAuth={onAuth} />
    </AuthProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with user as null', () => {
    let auth;
    const { getByTestId } = renderWithAuth((a) => { auth = a; });
    expect(getByTestId('user').props.children).toBe('no-user');
    expect(auth.user).toBeNull();
  });

  it('login calls authService.login and sets user', async () => {
    authService.login.mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      user: { id: 1, email: 'test@test.com', userName: 'Test', rating: '4.5', total_deliveries: 10, account_active: true },
    });
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    await act(async () => { result = await auth.login('test@test.com', 'Pass@123'); });
    expect(result).toBe(true);
    expect(authService.login).toHaveBeenCalledWith('test@test.com', 'Pass@123');
  });

  it('login returns false on API error', async () => {
    authService.login.mockRejectedValue(new Error('Invalid credentials'));
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    await act(async () => { result = await auth.login('test@test.com', 'wrong'); });
    expect(result).toBe(false);
  });

  it('login rejects invalid email without calling API', async () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    await act(async () => { result = await auth.login('invalid', 'password'); });
    expect(result).toBe(false);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('login rejects empty password', async () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    await act(async () => { result = await auth.login('test@test.com', ''); });
    expect(result).toBe(false);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('lockout after MAX_LOGIN_ATTEMPTS failed logins', async () => {
    authService.login.mockRejectedValue(new Error('fail'));
    let auth;
    renderWithAuth((a) => { auth = a; });
    for (let i = 0; i < 5; i++) {
      await act(async () => { await auth.login('wrong@test.com', 'wrong'); });
    }
    let result;
    await act(async () => { result = await auth.login('wrong@test.com', 'wrong'); });
    expect(result).toHaveProperty('locked', true);
  });

  it('logout calls authService.logout and clears user', async () => {
    authService.login.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 1, email: 'test@test.com', userName: 'Test' },
    });
    let auth;
    const { getByTestId } = renderWithAuth((a) => { auth = a; });
    await act(async () => { await auth.login('test@test.com', 'Pass@123'); });
    await act(async () => { await auth.logout(); });
    expect(getByTestId('user').props.children).toBe('no-user');
    expect(authService.logout).toHaveBeenCalled();
  });

  it('register calls authService.register', async () => {
    authService.register.mockResolvedValue({
      access_token: 'at', refresh_token: 'rt',
      user: { id: 2, email: 'new@test.com', userName: 'Jean Dupont' },
    });
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    await act(async () => {
      result = await auth.register({ email: 'new@test.com', password: 'Test@123', prenom: 'Jean', nom: 'Dupont', phone: '0600000000', role: 'user' });
    });
    expect(result).toBe(true);
    expect(authService.register).toHaveBeenCalled();
  });

  it('register returns false on invalid email', async () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    await act(async () => {
      result = await auth.register({ email: 'bad', password: 'Test@123', prenom: 'A', nom: 'B', phone: '06' });
    });
    expect(result).toBe(false);
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('cancelOrder tracks weekly cancels', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    let result;
    act(() => { result = auth.cancelOrder(); });
    expect(result).toHaveProperty('warning');
    expect(result).toHaveProperty('remaining');
  });

  it('addToHistory adds completed order', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    const initialCount = auth.deliveryHistory.length;
    act(() => {
      auth.addToHistory({ id: 'TEST-001', restaurant: 'Test Restaurant', priceText: '10.00 €', status: 'completed' });
    });
    expect(auth.deliveryHistory.length).toBe(initialCount + 1);
  });

  it('addToHistory ignores duplicate order IDs', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    act(() => { auth.addToHistory({ id: 'DUP-001', restaurant: 'Test', priceText: '5.00 €', status: 'completed' }); });
    const countAfterFirst = auth.deliveryHistory.length;
    act(() => { auth.addToHistory({ id: 'DUP-001', restaurant: 'Test', priceText: '5.00 €', status: 'completed' }); });
    expect(auth.deliveryHistory.length).toBe(countAfterFirst);
  });

  it('cashOut resets earnings', async () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    act(() => { auth.addToHistory({ id: 'CASH-001', restaurant: 'Test', priceText: '25.00 €', status: 'completed' }); });
    await act(async () => { await auth.cashOut(); });
    expect(auth.currentEarningsCents).toBe(0);
  });

  it('ticket messages CRUD works', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    expect(auth.getTicketMessages('t1')).toBeNull();
    act(() => { auth.saveTicketMessages('t1', [{ id: '1', type: 'user', text: 'Hello' }]); });
    expect(auth.getTicketMessages('t1')).toHaveLength(1);
  });

  it('warnings system works', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    expect(auth.warnings).toBe(0);
    act(() => { auth.addWarning('Test warning'); });
    expect(auth.warnings).toBe(1);
  });

  it('3 warnings deactivates account', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    act(() => { auth.addWarning('W1'); auth.addWarning('W2'); auth.addWarning('W3'); });
    expect(auth.accountActive).toBe(false);
  });

  it('reactivateAccount restores active state', () => {
    let auth;
    renderWithAuth((a) => { auth = a; });
    act(() => { auth.addWarning('W1'); auth.addWarning('W2'); auth.addWarning('W3'); });
    act(() => { auth.reactivateAccount(); });
    expect(auth.accountActive).toBe(true);
  });
});
