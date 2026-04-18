/**
 * /admin/nft-health — NFT Sync & Revenue Health
 * =============================================
 * Shows the operational health of the MU6 NFT sync pipeline:
 *   - Sync lag per contract (now() - last_synced_at from nft_sync_state)
 *   - Server wallet POL balance (fetched live from the RPC)
 *   - Per-collection revenue (mv_nft_collection_stats)
 *   - Recent sales (last 50 from nft_sales_history)
 *   - Error count per sync job (nft_sync_state.error_count > 0)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform, Linking, TouchableOpacity, ScrollView } from 'react-native';
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    Wallet,
    BarChart2,
    ShoppingCart,
    ExternalLink,
} from 'lucide-react-native';
import {
    AdminScreen,
    AdminStatCard,
    AdminDataTable,
    StatusBadge,
} from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton } from '../../src/components/admin/AdminActionComponents';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import { RPC_URL, EXPLORER_BASE } from '../../src/config/network';

// ── Constants ────────────────────────────────────────────────────────────────
const isWeb = Platform.OS === 'web';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ukavmvxelsfdfktiiyvg.supabase.co';
const SERVER_WALLET = '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39';
const EXPLORER_TX_BASE   = `${EXPLORER_BASE}/tx/`;
const EXPLORER_ADDR_BASE = `${EXPLORER_BASE}/address/`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function weiToPol(wei: string | number | null, decimals = 4): string {
    if (wei == null) return '—';
    try {
        const n = BigInt(wei.toString());
        const base = 10n ** 18n;
        const whole = n / base;
        const frac  = n % base;
        if (frac === 0n) return `${whole} POL`;
        const fracStr = frac.toString().padStart(18, '0').slice(0, decimals).replace(/0+$/, '');
        return fracStr.length > 0 ? `${whole}.${fracStr} POL` : `${whole} POL`;
    } catch {
        return `${wei} wei`;
    }
}

function truncateAddr(addr: string | null | undefined, head = 6, tail = 4): string {
    if (!addr) return '—';
    if (addr.length <= head + tail + 2) return addr;
    return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function openExternal(url: string) {
    if (!url) return;
    if (isWeb) {
        (window as any).open(url, '_blank', 'noopener,noreferrer');
    } else {
        Linking.openURL(url).catch(() => {});
    }
}

function lagLabel(lastSyncedAt: string | null): string {
    if (!lastSyncedAt) return 'never';
    const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
    const mins   = Math.round(diffMs / 60_000);
    if (mins < 2)  return '< 1 min ago';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)} hr ago`;
}

function lagSeverity(lastSyncedAt: string | null, errorCount: number): 'ok' | 'warn' | 'error' {
    if (errorCount > 0 || !lastSyncedAt) return 'error';
    const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
    if (diffMs < 10 * 60_000) return 'ok';
    if (diffMs < 30 * 60_000) return 'warn';
    return 'error';
}

const SEVERITY_COLOR: Record<string, string> = {
    ok:    '#22c55e',
    warn:  '#f59e0b',
    error: '#ef4444',
};

// ── Types ────────────────────────────────────────────────────────────────────
interface SyncStateRow {
    chain_id: number;
    contract_address: string;
    sync_type: string;
    last_synced_block: number;
    last_synced_at: string | null;
    error_count: number;
    last_error: string | null;
}

interface SaleRow {
    id: string;
    contract_address: string;
    token_id: string;
    seller: string | null;
    buyer: string | null;
    price_wei: string | null;
    marketplace: string;
    tx_hash: string;
    block_number: number;
    amount: string;
    is_primary: boolean;
}

interface CollectionStats {
    contract_address: string;
    chain_id: number;
    total_volume_wei: string;
    total_sales: number;
    mu6_primary_volume: string;
    mu6_secondary_volume: string;
    opensea_volume: string;
    unique_buyers: number;
    unique_sellers: number;
}

// ── Data hooks ───────────────────────────────────────────────────────────────
function useNftHealthData(tick: number) {
    const [syncState,   setSyncState]   = useState<SyncStateRow[]>([]);
    const [recentSales, setRecentSales] = useState<SaleRow[]>([]);
    const [collStats,   setCollStats]   = useState<CollectionStats[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            supabase.from('nft_sync_state').select('*').order('contract_address'),
            supabase.from('nft_sales_history')
                .select('id,contract_address,token_id,seller,buyer,price_wei,marketplace,tx_hash,block_number,amount,is_primary')
                .order('block_number', { ascending: false })
                .limit(50),
            supabase.from('mv_nft_collection_stats').select('*'),
        ]).then(([syncRes, salesRes, statsRes]) => {
            if (cancelled) return;
            if (syncRes.error)  throw syncRes.error;
            if (salesRes.error) throw salesRes.error;
            setSyncState((syncRes.data  ?? []) as SyncStateRow[]);
            setRecentSales((salesRes.data ?? []) as SaleRow[]);
            setCollStats((statsRes.data  ?? []) as CollectionStats[]);
            setLoading(false);
        }).catch((err) => {
            if (!cancelled) { setError(err?.message ?? 'Unknown error'); setLoading(false); }
        });

        return () => { cancelled = true; };
    }, [tick]);

    return { syncState, recentSales, collStats, loading, error };
}

function useServerWalletBalance() {
    const [balance,    setBalance]    = useState<string | null>(null);
    const [balLoading, setBalLoading] = useState(false);
    const [balError,   setBalError]   = useState<string | null>(null);

    const fetchBalance = useCallback(async () => {
        setBalLoading(true);
        setBalError(null);
        try {
            const rpc  = RPC_URL as string;
            const resp = await fetch(rpc, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [SERVER_WALLET, 'latest'] }),
            });
            const json = await resp.json() as { result?: string };
            setBalance(BigInt(json?.result ?? '0x0').toString());
        } catch (e: any) {
            setBalError(e?.message ?? 'RPC error');
        } finally {
            setBalLoading(false);
        }
    }, []);

    useEffect(() => { fetchBalance(); }, [fetchBalance]);

    return { balance, balLoading, balError, fetchBalance };
}

// ── Edge function caller ─────────────────────────────────────────────────────
async function callNftAdmin(action: string, params: Record<string, unknown> = {}): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';
    const resp  = await fetch(`${SUPABASE_URL}/functions/v1/nft-admin`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ action, ...params }),
    });
    return resp.json();
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function NftHealthScreen() {
    const { colors } = useTheme();
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((t) => t + 1), []);

    const { syncState, recentSales, collStats, loading, error } = useNftHealthData(tick);
    const { balance, balLoading, balError, fetchBalance } = useServerWalletBalance();

    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionMsg,     setActionMsg]     = useState<string | null>(null);

    const balLow    = balance != null && BigInt(balance) < 1_000_000_000_000_000_000n;
    const totalErrs = syncState.reduce((s, r) => s + (r.error_count ?? 0), 0);
    const errRows   = syncState.filter((r) => (r.error_count ?? 0) > 0);

    const handleAction = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
        setActionLoading(action);
        setActionMsg(null);
        try {
            const result = await callNftAdmin(action, params);
            if (result?.requiresAdminWallet) {
                console.warn('[nft-health] Admin wallet tx required:', result.unsignedTx);
                setActionMsg('Marketplace fee redirect requires admin wallet — unsigned tx logged to console. See blocker note below.');
            } else {
                setActionMsg(
                    result?.success
                        ? `${action} succeeded`
                        : (result?.error ?? result?.message ?? JSON.stringify(result))
                );
            }
        } catch (e: any) {
            setActionMsg(e?.message ?? 'Error');
        } finally {
            setActionLoading(null);
        }
    }, []);

    // ── Inline row renderers ─────────────────────────────────────────────────
    const renderSyncRow = useCallback((item: any) => {
        const row = item as SyncStateRow & { _sev: string };
        return (
            <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ flex: 2, color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>
                    {truncateAddr(row.contract_address)}
                </Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{row.sync_type}</Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>
                    {row.last_synced_block?.toLocaleString() ?? '0'}
                </Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{lagLabel(row.last_synced_at)}</Text>
                <View style={{ flex: 1 }}>
                    <StatusBadge status={row._sev} color={SEVERITY_COLOR[row._sev] ?? colors.text.muted} />
                </View>
            </View>
        );
    }, [colors]);

    const renderStatsRow = useCallback((item: any) => {
        const row = item as CollectionStats;
        return (
            <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ flex: 2, color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>
                    {truncateAddr(row.contract_address)}
                </Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{row.total_sales}</Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{weiToPol(row.total_volume_wei)}</Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{weiToPol(row.mu6_primary_volume)}</Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{weiToPol(row.mu6_secondary_volume)}</Text>
            </View>
        );
    }, [colors]);

    const MP_COLOR: Record<string, string> = {
        mu6_primary:   colors.accent.cyan,
        mu6_secondary: '#7C3AED',
        opensea:       '#2081E2',
        transfer:      colors.text.muted,
    };

    const renderSaleRow = useCallback((item: any) => {
        const row = item as SaleRow;
        const mpColor = MP_COLOR[row.marketplace] ?? colors.text.muted;
        return (
            <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                    <StatusBadge status={row.marketplace.replace('mu6_', '')} color={mpColor} />
                </View>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>#{row.token_id}</Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{weiToPol(row.price_wei)}</Text>
                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>{truncateAddr(row.buyer)}</Text>
                <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => openExternal(`${EXPLORER_TX_BASE}${row.tx_hash}`)}
                >
                    <Text style={{ color: colors.accent.cyan, fontSize: 12, textDecorationLine: 'underline' }} numberOfLines={1}>
                        {truncateAddr(row.tx_hash, 8, 6)}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }, [colors]);

    return (
        <AdminScreen
            title="NFT Sync Health"
            subtitle="Sync pipeline status, server wallet balance, and sales revenue"
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            {/* ── Stat Cards ── */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
                <AdminStatCard title="Sync Jobs"       value={syncState.length}   icon={<Activity size={18} color={colors.accent.cyan} />} />
                <AdminStatCard title="Error Jobs"      value={totalErrs}          icon={<AlertTriangle size={18} color={totalErrs > 0 ? '#ef4444' : '#22c55e'} />} />
                <AdminStatCard title="Recent Sales"    value={recentSales.length} icon={<ShoppingCart size={18} color={colors.accent.cyan} />} />
                <AdminStatCard title="Collections"     value={collStats.length}   icon={<BarChart2 size={18} color={colors.accent.cyan} />} />
            </View>

            {/* ── Server Wallet Balance ── */}
            <View style={{
                backgroundColor: colors.bg.card, borderRadius: 12, padding: 16, marginBottom: 20,
                borderWidth: 1, borderColor: balLow ? '#ef4444' : colors.border.glass,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Wallet size={16} color={balLow ? '#ef4444' : colors.accent.cyan} />
                    <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14, marginLeft: 8 }}>
                        Server Wallet Balance
                    </Text>
                    {balLow && (
                        <View style={{ backgroundColor: '#ef444420', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                            <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>LOW</Text>
                        </View>
                    )}
                </View>
                <Text style={{ color: balLow ? '#ef4444' : colors.text.primary, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
                    {balLoading ? 'Loading…' : balError ? '—' : weiToPol(balance, 6)}
                </Text>
                <Text style={{ color: colors.text.muted, fontSize: 12, marginBottom: 12 }}>{SERVER_WALLET}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <ActionButton
                        label="Refresh"
                        icon={<RefreshCw size={13} color={colors.accent.cyan} />}
                        color={colors.accent.cyan}
                        onPress={fetchBalance}
                        disabled={balLoading}
                    />
                    <ActionButton
                        label="Explorer"
                        icon={<ExternalLink size={13} color={colors.accent.cyan} />}
                        color={colors.accent.cyan}
                        onPress={() => openExternal(`${EXPLORER_ADDR_BASE}${SERVER_WALLET}`)}
                    />
                </View>
                {balError && <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{balError}</Text>}
            </View>

            {/* ── Action feedback ── */}
            {actionMsg && (
                <View style={{
                    backgroundColor: `${colors.accent.cyan}15`, borderRadius: 8, padding: 12, marginBottom: 16,
                    borderWidth: 1, borderColor: `${colors.accent.cyan}30`,
                }}>
                    <Text style={{ color: colors.accent.cyan, fontSize: 13 }}>{actionMsg}</Text>
                </View>
            )}

            {/* ── Manual Triggers ── */}
            <View style={{
                backgroundColor: colors.bg.card, borderRadius: 12, padding: 16, marginBottom: 20,
                borderWidth: 1, borderColor: colors.border.glass,
            }}>
                <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14, marginBottom: 12 }}>
                    Manual Triggers
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <ActionButton
                        label="Sync Transfers"
                        icon={<RefreshCw size={13} color={colors.accent.cyan} />}
                        color={colors.accent.cyan}
                        onPress={() => handleAction('syncTransfers', { chainId: 80002, contractAddress: '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad' })}
                        disabled={actionLoading === 'syncTransfers'}
                    />
                    <ActionButton
                        label="Enrich MU6 Sales"
                        icon={<Activity size={13} color={colors.accent.cyan} />}
                        color={colors.accent.cyan}
                        onPress={() => handleAction('enrichMu6MarketplaceSales', { chainId: 80002 })}
                        disabled={actionLoading === 'enrichMu6MarketplaceSales'}
                    />
                    <ActionButton
                        label="Enrich OpenSea"
                        icon={<Activity size={13} color='#2081E2' />}
                        color="#2081E2"
                        onPress={() => handleAction('enrichOpenseaSales', { chainId: 80002 })}
                        disabled={actionLoading === 'enrichOpenseaSales'}
                    />
                    <ActionButton
                        label="Refresh Stats"
                        icon={<BarChart2 size={13} color={colors.accent.cyan} />}
                        color={colors.accent.cyan}
                        onPress={() => handleAction('refreshCollectionStats')}
                        disabled={actionLoading === 'refreshCollectionStats'}
                    />
                    <ActionButton
                        label="Check Marketplace Fee"
                        icon={<CheckCircle size={13} color={colors.accent.cyan} />}
                        color={colors.accent.cyan}
                        onPress={() => handleAction('setMarketplacePlatformFee', { recipient: SERVER_WALLET, bps: 200, verify: true })}
                        disabled={actionLoading === 'setMarketplacePlatformFee'}
                    />
                </View>
            </View>

            {/* ── Sync State Table ── */}
            <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                Sync State
            </Text>
            <AdminDataTable
                headers={['Contract', 'Type', 'Last Block', 'Lag', 'Status']}
                columns={[
                    { label: 'Contract', flex: 2 },
                    { label: 'Type',     flex: 1 },
                    { label: 'Last Block', flex: 1 },
                    { label: 'Lag',      flex: 1 },
                    { label: 'Status',   flex: 1 },
                ]}
                data={syncState.map((r) => ({
                    ...r,
                    id: `${r.contract_address}-${r.sync_type}`,
                    _sev: lagSeverity(r.last_synced_at, r.error_count),
                }))}
                renderRow={renderSyncRow}
                emptyMessage="No sync state rows — trigger a sync to populate."
            />

            {/* Error detail cards */}
            {errRows.map((r) => (
                <View key={`${r.contract_address}-${r.sync_type}`}
                    style={{
                        backgroundColor: '#ef444415', borderRadius: 8, padding: 10, marginTop: 8,
                        borderLeftWidth: 3, borderLeftColor: '#ef4444',
                    }}>
                    <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>
                        {truncateAddr(r.contract_address)} / {r.sync_type} — {r.error_count} error(s)
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                        {r.last_error}
                    </Text>
                </View>
            ))}

            {/* ── Collection Revenue ── */}
            {collStats.length > 0 && (
                <View style={{ marginTop: 24 }}>
                    <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                        Collection Revenue
                    </Text>
                    <AdminDataTable
                        headers={['Contract', 'Sales', 'Total Volume', 'Primary', 'Secondary']}
                        columns={[
                            { label: 'Contract', flex: 2 },
                            { label: 'Sales',    flex: 1 },
                            { label: 'Total Vol', flex: 1 },
                            { label: 'Primary',  flex: 1 },
                            { label: 'Secondary', flex: 1 },
                        ]}
                        data={collStats.map((r) => ({ ...r, id: r.contract_address }))}
                        renderRow={renderStatsRow}
                        emptyMessage="No revenue indexed yet."
                    />
                </View>
            )}

            {/* ── Recent Sales ── */}
            <View style={{ marginTop: 24, marginBottom: 32 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                    Recent Sales (last 50)
                </Text>
                <AdminDataTable
                    headers={['Source', 'Token', 'Price', 'Buyer', 'Tx']}
                    columns={[
                        { label: 'Source', flex: 1 },
                        { label: 'Token',  flex: 1 },
                        { label: 'Price',  flex: 1 },
                        { label: 'Buyer',  flex: 1 },
                        { label: 'Tx',     flex: 1 },
                    ]}
                    data={recentSales.map((r) => ({ ...r }))}
                    renderRow={renderSaleRow}
                    emptyMessage="No sales indexed yet — run syncTransfers."
                />
            </View>
        </AdminScreen>
    );
}
