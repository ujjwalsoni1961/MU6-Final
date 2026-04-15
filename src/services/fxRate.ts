/**
 * FX Rate Service
 *
 * Fetches MATIC/POL → fiat exchange rates from CoinGecko (free API, no key).
 * Caches rates in memory for 5 minutes to avoid rate-limiting.
 */

// ── Cache ──
let cachedRates: Record<string, number> = {};
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const COINGECKO_ID = 'matic-network'; // POL/MATIC

/** Supported fiat currencies */
export type FiatCurrency = 'eur' | 'usd' | 'gbp';

const SUPPORTED_CURRENCIES: FiatCurrency[] = ['eur', 'usd', 'gbp'];

/**
 * Fetch fresh rates from CoinGecko for all supported currencies.
 * Returns { eur: X.XX, usd: Y.YY, gbp: Z.ZZ }
 */
async function fetchRates(): Promise<Record<string, number>> {
    const vsCurrencies = SUPPORTED_CURRENCIES.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_ID}&vs_currencies=${vsCurrencies}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const rates = data[COINGECKO_ID];
    if (!rates) {
        throw new Error('CoinGecko returned no data for matic-network');
    }

    return rates as Record<string, number>;
}

/**
 * Get all cached rates, refreshing if stale.
 */
async function getRates(): Promise<Record<string, number>> {
    const now = Date.now();
    if (now - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedRates).length > 0) {
        return cachedRates;
    }

    try {
        cachedRates = await fetchRates();
        cacheTimestamp = now;
    } catch (err) {
        console.warn('[fxRate] Failed to fetch rates, using stale cache:', err);
        // If we have stale data, use it; otherwise throw
        if (Object.keys(cachedRates).length === 0) {
            throw err;
        }
    }

    return cachedRates;
}

/**
 * Get the current POL → EUR rate.
 * e.g. 1 POL = 0.42 EUR → returns 0.42
 */
export async function getTokenToEurRate(): Promise<number> {
    const rates = await getRates();
    return rates.eur ?? 0;
}

/**
 * Convert a token (POL) amount to fiat.
 * @param tokenAmount Amount of POL
 * @param currency Target fiat currency (eur, usd, gbp)
 * @returns Fiat value
 */
export async function convertTokenToFiat(
    tokenAmount: number,
    currency: FiatCurrency = 'eur',
): Promise<number> {
    const rates = await getRates();
    const rate = rates[currency];
    if (rate == null) {
        throw new Error(`Unsupported currency: ${currency}`);
    }
    return tokenAmount * rate;
}

/**
 * Convert a fiat amount to token (POL).
 * @param fiatAmount Amount in fiat
 * @param currency Source fiat currency (eur, usd, gbp)
 * @returns POL amount
 */
export async function convertFiatToToken(
    fiatAmount: number,
    currency: FiatCurrency = 'eur',
): Promise<number> {
    const rates = await getRates();
    const rate = rates[currency];
    if (rate == null || rate === 0) {
        throw new Error(`Unsupported or zero-rate currency: ${currency}`);
    }
    return fiatAmount / rate;
}

/**
 * Format a fiat price for display.
 * e.g. formatFiat(10.5, 'eur') → "€10.50"
 */
export function formatFiat(amount: number, currency: FiatCurrency = 'eur'): string {
    const symbols: Record<FiatCurrency, string> = {
        eur: '€',
        usd: '$',
        gbp: '£',
    };
    const symbol = symbols[currency] || currency.toUpperCase();
    return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Format a token amount for display.
 * e.g. formatToken(15.234) → "≈ 15.23 POL"
 */
export function formatToken(amount: number): string {
    return `≈ ${amount.toFixed(2)} POL`;
}
