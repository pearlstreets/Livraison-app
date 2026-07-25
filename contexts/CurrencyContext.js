// Devise d'AFFICHAGE du livreur.
//
// Principe (identique au reste de l'écosystème Pearl) : tous les montants sont
// stockés et VERSÉS en euros par la plateforme. Seule la présentation change —
// un livreur au Mexique lit ses gains en pesos, mais son virement reste en EUR
// et c'est sa banque qui convertit.
//
// Défaut = devise du PAYS du profil livreur (AuthContext expose `country`).
// Ne s'applique qu'en l'absence de choix explicite : dès que le livreur choisit
// une devise, ce choix est persisté et n'est plus jamais écrasé.

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CURRENCIES } from '../data/currencies';
import { fetchLiveRates, getCachedLiveRates, getCurrencyWithLiveRate } from '../lib/rates';
import { currencyForCountry } from '../lib/countryCurrency';

const STORAGE_KEY = 'DRIVER_CURRENCY';
const STORAGE_KEY_EXPLICIT = 'DRIVER_CURRENCY_PICKED';

const EUR = CURRENCIES.find((c) => c.code === 'EUR') || {
  code: 'EUR', symbol: '€', rate: 1, name: 'Euro',
};

function currencyByCode(code) {
  return CURRENCIES.find((c) => c.code === code) || EUR;
}

/**
 * Formate un montant EUR dans la devise fournie. Sortie type "90,00 MX$".
 * Sépare les milliers par une espace fine insécable, comme Pearl List.
 * Ne lève jamais : une entrée invalide rend le montant à zéro.
 */
export function formatWithCurrency(eurAmount, currency) {
  const cur = currency || EUR;
  const n = (Number(eurAmount) || 0) * (Number(cur.rate) || 1);
  const dec = cur.decimals !== undefined ? cur.decimals : 2;
  const formatted = n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} ${cur.symbol}`;
}

const CurrencyContext = React.createContext({
  currency: EUR,
  code: 'EUR',
  symbol: '€',
  setCurrency: () => {},
  fmtPrice: (n) => formatWithCurrency(n, EUR),
});

export const useCurrency = () => React.useContext(CurrencyContext);

export function CurrencyProvider({ children, country }) {
  const [currency, setCurrencyState] = React.useState(EUR);
  const pickedRef = React.useRef(false);

  // 1. Restaure un éventuel choix explicite + rafraîchit les taux au démarrage.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [saved, picked] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(STORAGE_KEY_EXPLICIT),
        ]);
        pickedRef.current = picked === '1';
        const rates = await fetchLiveRates().catch(() => null);
        if (cancelled) return;
        if (saved) {
          setCurrencyState(getCurrencyWithLiveRate(currencyByCode(saved), rates || getCachedLiveRates()));
        } else if (rates) {
          // Rafraîchit le taux de la devise courante (EUR au boot : no-op).
          setCurrencyState((c) => getCurrencyWithLiveRate(c, rates));
        }
      } catch (_e) {
        /* hors-ligne / storage indisponible : on reste sur EUR */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2. Défaut dérivé du PAYS du livreur, seulement sans choix explicite.
  React.useEffect(() => {
    if (!country || pickedRef.current) return;
    const code = currencyForCountry(country);
    if (!code || code === currency.code) return;
    setCurrencyState(getCurrencyWithLiveRate(currencyByCode(code), getCachedLiveRates()));
  }, [country, currency.code]);

  // 3. Choix explicite du livreur : persisté, prioritaire pour toujours.
  const setCurrency = React.useCallback(async (codeOrObj) => {
    const code = typeof codeOrObj === 'string' ? codeOrObj : codeOrObj?.code;
    if (!code) return;
    pickedRef.current = true;
    const rates = getCachedLiveRates() || (await fetchLiveRates().catch(() => null));
    setCurrencyState(getCurrencyWithLiveRate(currencyByCode(code), rates));
    try {
      await AsyncStorage.multiSet([[STORAGE_KEY, code], [STORAGE_KEY_EXPLICIT, '1']]);
    } catch (_e) {
      /* quota / storage indisponible — le choix reste actif pour la session */
    }
  }, []);

  const fmtPrice = React.useCallback(
    (eurAmount) => formatWithCurrency(eurAmount, currency),
    [currency],
  );

  const value = React.useMemo(
    () => ({ currency, code: currency.code, symbol: currency.symbol, setCurrency, fmtPrice }),
    [currency, setCurrency, fmtPrice],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export default CurrencyContext;
