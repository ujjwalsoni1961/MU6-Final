/**
 * useCurrency Hook
 *
 * Provides currency display preferences and formatting functions.
 * Reads the user's display_currency from their profile (default EUR)
 * and exposes helpers for converting/formatting POL amounts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
    convertTokenToFiat,
    formatFiat,
    formatToken,
    type FiatCurrency,
} from '../services/fxRate';
import type { DisplayCurrency } from '../types';

/** Map DB display_currency (uppercase) to fxRate FiatCurrency (lowercase) */
function toFiatCurrency(dc: DisplayCurrency): FiatCurrency {
    return dc.toLowerCase() as FiatCurrency;
}

export function useCurrency() {
    const { profile } = useAuth();
    const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('EUR');

    // Load display_currency from profile on mount / profile change
    useEffect(() => {
        if (!profile?.id) return;
        let cancelled = false;

        supabase
            .from('profiles')
            .select('display_currency')
            .eq('id', profile.id)
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled && data?.display_currency) {
                    setDisplayCurrency(data.display_currency.toUpperCase() as DisplayCurrency);
                }
            });

        return () => { cancelled = true; };
    }, [profile?.id]);

    /**
     * Update the user's display currency preference.
     * Saves to DB and updates local state immediately.
     */
    const updateCurrency = useCallback(async (currency: DisplayCurrency) => {
        setDisplayCurrency(currency);
        if (!profile?.id) return;

        const { error } = await supabase
            .from('profiles')
            .update({ display_currency: currency })
            .eq('id', profile.id);

        if (error) {
            console.error('[useCurrency] Failed to save currency preference:', error);
        }
    }, [profile?.id]);

    /**
     * Format a POL token amount in the user's chosen fiat currency.
     * Returns a promise because it needs the live FX rate.
     * e.g. "€10.00" or "$11.50"
     */
    const formatPrice = useCallback(async (tokenAmount: number): Promise<string> => {
        try {
            const fiatCur = toFiatCurrency(displayCurrency);
            const fiatValue = await convertTokenToFiat(tokenAmount, fiatCur);
            return formatFiat(fiatValue, fiatCur);
        } catch {
            return `${tokenAmount.toFixed(2)} POL`;
        }
    }, [displayCurrency]);

    /**
     * Format a POL token amount with both fiat and token display.
     * Returns a promise.
     * e.g. "€10.00 (≈ 15.2 POL)"
     */
    const formatDualPrice = useCallback(async (tokenAmount: number): Promise<string> => {
        try {
            const fiatCur = toFiatCurrency(displayCurrency);
            const fiatValue = await convertTokenToFiat(tokenAmount, fiatCur);
            return `${formatFiat(fiatValue, fiatCur)} (${formatToken(tokenAmount)})`;
        } catch {
            return `${tokenAmount.toFixed(2)} POL`;
        }
    }, [displayCurrency]);

    /**
     * Synchronous format for a known fiat amount (e.g. stored EUR snapshot).
     * e.g. formatFiatAmount(10.5) → "€10.50"
     */
    const formatStoredFiat = useCallback((eurAmount: number): string => {
        // Historical snapshots are stored in EUR; convert display symbol
        // For simplicity, show EUR symbol for stored amounts since they're EUR snapshots
        return formatFiat(eurAmount, 'eur');
    }, []);

    return {
        displayCurrency,
        updateCurrency,
        formatPrice,
        formatDualPrice,
        formatStoredFiat,
        /** The lowercase FiatCurrency for direct use with fxRate functions */
        fiatCurrency: toFiatCurrency(displayCurrency),
    };
}
