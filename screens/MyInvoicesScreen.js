import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';
import { vatService, defaultMonthRange, toIsoDate } from '../services/vatService';

const BRAND = '#00C29B';

function formatAmount(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return '0,00 €';
  return n.toFixed(2).replace('.', ',') + ' €';
}

function CountryRow({ row, t, expanded, onToggle }) {
  return (
    <Pressable onPress={onToggle} style={s.countryWrap}>
      <View style={s.countryHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.countryName}>{row.country}</Text>
          <Text style={s.countrySub}>{row.deliveries} {t('invoices.totalDeliveries').toLowerCase()}</Text>
        </View>
        <Text style={s.countryAmount}>{formatAmount(row.earnings_excl_vat)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#888" style={{ marginLeft: 8 }} />
      </View>
      {expanded && (
        <View style={s.countryDetail}>
          <View style={s.countryDetailRow}>
            <Text style={s.countryDetailLabel}>{t('invoices.totalDeliveries')}</Text>
            <Text style={s.countryDetailValue}>{row.deliveries}</Text>
          </View>
          <View style={s.countryDetailRow}>
            <Text style={s.countryDetailLabel}>{t('invoices.grossEarnings')}</Text>
            <Text style={s.countryDetailValue}>{formatAmount(row.earnings_excl_vat)}</Text>
          </View>
          <View style={s.countryDetailRow}>
            <Text style={s.countryDetailLabel}>{t('invoices.vatCollected')}</Text>
            <Text style={s.countryDetailValue}>{formatAmount(row.vat)}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function MyInvoicesScreen({ navigation }) {
  const { t, lang } = useLanguage();
  const insets = useSafeAreaInsets();

  const initialRange = defaultMonthRange();
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState({});

  const isRTL = lang === 'ar';

  const fetchSummary = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const from = toIsoDate(dateFrom);
      const to = toIsoDate(dateTo);
      const payload = await vatService.getVatSummary({ date_from: from, date_to: to });
      setData(payload);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSummary({ silent: true });
  }, [fetchSummary]);

  const summary = data?.summary || null;
  const byCountry = Array.isArray(summary?.by_country) ? summary.by_country : [];
  const totalDeliveries = summary?.total_deliveries ?? 0;
  const isEmpty = !loading && !error && totalDeliveries === 0;

  const toggleCountry = useCallback((code) => {
    setExpanded(prev => ({ ...prev, [code]: !prev[code] }));
  }, []);

  return (
    <View style={[s.container, isRTL && s.rtl]}>
      <View style={[s.headerRow, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t('invoices.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Period inputs */}
        <View style={s.periodCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.periodLabel}>{t('invoices.dateFrom')}</Text>
            <TextInput
              style={s.periodInput}
              value={dateFrom}
              onChangeText={setDateFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#bbb"
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={10}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.periodLabel}>{t('invoices.dateTo')}</Text>
            <TextInput
              style={s.periodInput}
              value={dateTo}
              onChangeText={setDateTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#bbb"
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={10}
            />
          </View>
          <Pressable
            style={s.periodBtn}
            onPress={() => fetchSummary()}
            hitSlop={8}
          >
            <Ionicons name="search" size={18} color="#fff" />
          </Pressable>
        </View>

        {loading && (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={BRAND} />
          </View>
        )}

        {error && !loading && (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={32} color="#b91c1c" style={{ marginBottom: 8 }} />
            <Text style={s.errorTitle}>{t('invoices.error')}</Text>
            <Pressable style={s.retryBtn} onPress={() => fetchSummary()}>
              <Text style={s.retryTxt}>{t('invoices.retry')}</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && isEmpty && (
          <View style={s.emptyWrap}>
            <Ionicons name="receipt-outline" size={36} color="#bbb" style={{ marginBottom: 8 }} />
            <Text style={s.emptyTxt}>{t('invoices.empty')}</Text>
          </View>
        )}

        {!loading && !error && !isEmpty && summary && (
          <>
            <View style={s.summaryRow}>
              <View style={s.summaryCard}>
                <Text style={s.summaryValue}>{totalDeliveries}</Text>
                <Text style={s.summaryLabel}>{t('invoices.totalDeliveries')}</Text>
              </View>
              <View style={s.summaryCard}>
                <Text style={s.summaryValue}>{formatAmount(summary.gross_earnings)}</Text>
                <Text style={s.summaryLabel}>{t('invoices.grossEarnings')}</Text>
              </View>
              <View style={s.summaryCard}>
                <Text style={s.summaryValue}>{formatAmount(summary.vat_collected)}</Text>
                <Text style={s.summaryLabel}>{t('invoices.vatCollected')}</Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>{t('invoices.byCountry')}</Text>
            {byCountry.map((row) => (
              <CountryRow
                key={row.country}
                row={row}
                t={t}
                expanded={!!expanded[row.country]}
                onToggle={() => toggleCountry(row.country)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  rtl: { direction: 'rtl' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111', textAlign: 'center', flex: 1 },
  body: { padding: 16, paddingBottom: 30 },

  periodCard: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  periodLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 4 },
  periodInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111', fontWeight: '600',
  },
  periodBtn: {
    backgroundColor: BRAND, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    marginLeft: 12, alignItems: 'center', justifyContent: 'center',
  },

  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  errorWrap: { paddingVertical: 36, alignItems: 'center' },
  errorTitle: { color: '#b91c1c', fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: BRAND, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  retryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  emptyWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyTxt: { color: '#888', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontWeight: '900', color: '#111' },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 4, textAlign: 'center' },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 10, marginLeft: 4 },

  countryWrap: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  countryHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  countryName: { fontSize: 15, fontWeight: '800', color: '#111' },
  countrySub: { fontSize: 12, color: '#888', marginTop: 2 },
  countryAmount: { fontSize: 15, fontWeight: '800', color: '#111' },
  countryDetail: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: 10 },
  countryDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  countryDetailLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  countryDetailValue: { fontSize: 13, color: '#111', fontWeight: '800' },
});
