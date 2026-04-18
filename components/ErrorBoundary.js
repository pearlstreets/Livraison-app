import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (__DEV__) {
      console.warn('ErrorBoundary caught:', error, info?.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.iconWrap}>
            <Ionicons name="alert-circle" size={64} color="#e74c3c" />
          </View>
          <Text style={s.title}>Une erreur est survenue</Text>
          <Text style={s.subtitle}>
            Pearl Delivery a rencontré un problème inattendu. Réessayez ou redémarrez l'application.
          </Text>
          {__DEV__ && this.state.error && (
            <View style={s.debugBox}>
              <Text style={s.debugTitle}>Debug (DEV only):</Text>
              <Text style={s.debugText}>{String(this.state.error?.message || this.state.error)}</Text>
            </View>
          )}
          <Pressable style={s.btn} onPress={this.handleReset}>
            <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.btnText}>Réessayer</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconWrap: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  debugBox: { backgroundColor: '#fde8e8', borderRadius: 10, padding: 12, marginBottom: 20, alignSelf: 'stretch' },
  debugTitle: { fontSize: 12, fontWeight: '800', color: '#e74c3c', marginBottom: 6 },
  debugText: { fontSize: 12, color: '#333', fontFamily: 'Courier' },
  btn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00C29B', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
