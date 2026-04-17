/**
 * PDF #12 — Admin "Wallet & On-Chain Activity" screen.
 *
 * Gives admins a unified view of every wallet on the platform with:
 *  - DB-recorded NFT count and marketplace listings
 *  - Live on-chain balanceOf(wallet) from the DropERC721 contract
 *  - A sync-status indicator when the two disagree
 *  - Quick links to Polygonscan for full transaction history
 *
 * The screen deliberately only pulls on-chain data on demand
 * ("Verify On-Chain" button) to avoid hammering the RPC endpoint every
 * time an admin opens the page.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Platform, Linking } from 'react-native';
import {
    Wallet,
    CheckCircle,
    AlertTriangle,
    Search,
    ExternalLink,
    RefreshCw,
} from 'lucide-react-native';
import {
    AdminScreen,
    AdminDataTable,
    StatusBadge,
    AdminFilterPills,
    AdminStatCard,
    AdminSearchBar,
} from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton } from '../../src/components/admin/AdminActionComponents';
import { useAdminOnChainActivity, OnChainWalletRow } from '../../src/hooks/useAdminOnChainActivity';
import { CHAIN_NAME, NATIVE_SYMBOL } from '../../src/config/network';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

type Filter = 'all' | 'registered' | 'unregistered' | 'out-of-sync';

function shortWallet(w: string) {
    return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export default function AdminOnChainActivityScreen() {
    const { colors } = useTheme();
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');

    const { rows, loading, error, summary, refresh, refreshOnChain, onChainFetching } =
        useAdminOnChainActivity();

    const filtered: OnChainWalletRow[] = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            // Filter pill
            if (filter === 'registered' && !r.profileId) return false;
            if (filter === 'unregistered' && r.profileId) return false;
            if (filter === 'out-of-sync') {
                if (r.onChainCheckedAt === null || !r.outOfSync) return false;
            }
            // Search
            if (!q) return true;
            if (r.wallet.toLowerCase().includes(q)) return true;
            if (r.displayName?.toLowerCase().includes(q)) return true;
            if (r.email?.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [rows, filter, search]);

    const openExplorer = useCallback((url: string) => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            Linking.openURL(url).catch(() => null);
        }
    }, []);

    const columns = [
        { label: 'Wallet / User', flex: 1.5 },
        { label: 'Role', flex: 0.6 },
        { label: 'DB NFTs', flex: 0.6 },
        { label: 'On-Chain', flex: 0.8 },
        { label: 'Listings', flex: 0.6 },
        { label: `Primary Spend (${NATIVE_SYMBOL})`, flex: 0.9 },
        { label: 'Sync', flex: 0.7 },
        { label: 'Actions', flex: 0.9 },
    ];

    const subtitle = loading
        ? 'Loading wallets…'
        : `${summary.totalWallets} wallets (${summary.registered} registered) · ${summary.checked} verified on ${CHAIN_NAME}${
            summary.outOfSync > 0 ? ` · ${summary.outOfSync} out of sync` : ''
        }`;

    return (
        <AdminScreen
            title="Wallet & On-Chain Activity"
            subtitle={subtitle}
            loading={loading}
            error={error}
            onRetry={refresh}
            rightAction={
                <ActionButton
                    icon={<RefreshCw size={13} color={colors.accent.cyan} />}
                    label={onChainFetching ? 'Verifying…' : 'Verify On-Chain'}
                    color={colors.accent.cyan}
                    onPress={refreshOnChain}
                />
            }
        >
            {/* Stat cards */}
            {isWeb && (
                <View
                    style={{
                        flexDirection: 'row',
                        gap: 12,
                        marginBottom: 16,
                        paddingHorizontal: 16,
                        flexWrap: 'wrap',
                    }}
                >
                    <AdminStatCard
                        title="Total Wallets"
                        value={summary.totalWallets}
                        icon={<Wallet size={18} color={colors.accent.cyan} />}
                        accent={colors.accent.cyan}
                    />
                    <AdminStatCard
                        title="Registered Users"
                        value={summary.registered}
                        icon={<CheckCircle size={18} color={colors.status.success} />}
                        accent={colors.status.success}
                    />
                    <AdminStatCard
                        title="Verified On-Chain"
                        value={summary.checked}
                        icon={<Search size={18} color="#60a5fa" />}
                        accent="#60a5fa"
                    />
                    <AdminStatCard
                        title="Out of Sync"
                        value={summary.outOfSync}
                        icon={<AlertTriangle size={18} color={colors.status.error} />}
                        accent={colors.status.error}
                    />
                </View>
            )}

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <AdminSearchBar
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search wallet, name, or email…"
                />
                <AdminFilterPills
                    options={[
                        { value: 'all', label: `All (${rows.length})` },
                        { value: 'registered', label: `Registered (${summary.registered})` },
                        { value: 'unregistered', label: `Unregistered (${rows.length - summary.registered})` },
                        { value: 'out-of-sync', label: `Out of Sync (${summary.outOfSync})` },
                    ]}
                    selected={filter}
                    onSelect={(v) => setFilter(v as Filter)}
                />
            </View>

            <AdminDataTable
                headers={columns.map((c) => c.label)}
                columns={columns}
                data={filtered}
                emptyMessage={
                    rows.length === 0
                        ? 'No wallets found yet — primary sales will populate this list.'
                        : 'No wallets match the current filter.'
                }
                minTableWidth={1050}
                renderRow={(row: OnChainWalletRow) => {
                    const nameLine = row.displayName || (row.profileId ? 'Registered user' : 'Unregistered wallet');
                    const onChainLabel =
                        row.onChainError
                            ? 'Error'
                            : row.onChainBalance === null
                                ? '—'
                                : String(row.onChainBalance);

                    let syncBadge: React.ReactNode;
                    if (row.onChainCheckedAt === null) {
                        syncBadge = <StatusBadge status="unverified" />;
                    } else if (row.onChainError) {
                        syncBadge = <StatusBadge status="error" color={colors.status.error} />;
                    } else if (row.outOfSync) {
                        syncBadge = <StatusBadge status="out of sync" color={colors.status.error} />;
                    } else {
                        syncBadge = <StatusBadge status="in sync" color={colors.status.success} />;
                    }

                    return (
                        <View
                            style={{
                                flexDirection: isWeb ? 'row' : 'column',
                                alignItems: isWeb ? 'center' : 'flex-start',
                                padding: 14,
                            }}
                        >
                            {isWeb ? (
                                <>
                                    <View style={{ flex: 1.5 }}>
                                        <Text
                                            style={{
                                                color: colors.text.primary,
                                                fontSize: 13,
                                                fontWeight: '600',
                                            }}
                                        >
                                            {nameLine}
                                        </Text>
                                        <Text
                                            style={{
                                                color: colors.text.muted,
                                                fontSize: 11,
                                                fontFamily: 'monospace',
                                                marginTop: 2,
                                            }}
                                        >
                                            {shortWallet(row.wallet)}
                                        </Text>
                                        {row.email ? (
                                            <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
                                                {row.email}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <View style={{ flex: 0.6 }}>
                                        <StatusBadge status={row.role || 'guest'} />
                                        {row.isBlocked && (
                                            <View style={{ marginTop: 4 }}>
                                                <StatusBadge status="blocked" color={colors.status.error} />
                                            </View>
                                        )}
                                    </View>
                                    <Text
                                        style={{
                                            flex: 0.6,
                                            color: colors.text.primary,
                                            fontSize: 13,
                                            fontWeight: '600',
                                        }}
                                    >
                                        {row.dbOwnedCount}
                                    </Text>
                                    <Text
                                        style={{
                                            flex: 0.8,
                                            color:
                                                row.onChainError
                                                    ? colors.status.error
                                                    : row.outOfSync && row.onChainCheckedAt
                                                        ? colors.status.error
                                                        : colors.text.primary,
                                            fontSize: 13,
                                            fontWeight: '600',
                                        }}
                                    >
                                        {onChainLabel}
                                    </Text>
                                    <Text style={{ flex: 0.6, color: colors.text.secondary, fontSize: 13 }}>
                                        {row.dbActiveListings}
                                    </Text>
                                    <Text style={{ flex: 0.9, color: colors.text.secondary, fontSize: 13 }}>
                                        {row.dbPrimarySpendPol > 0 ? row.dbPrimarySpendPol.toFixed(4) : '—'}
                                    </Text>
                                    <View style={{ flex: 0.7 }}>{syncBadge}</View>
                                    <View style={{ flex: 0.9, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                                        <ActionButton
                                            icon={<ExternalLink size={12} color={colors.accent.cyan} />}
                                            label="Polygonscan"
                                            color={colors.accent.cyan}
                                            onPress={() => openExplorer(row.explorerUrl)}
                                        />
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            marginBottom: 8,
                                            width: '100%',
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={{
                                                    color: colors.text.primary,
                                                    fontSize: 14,
                                                    fontWeight: '600',
                                                }}
                                            >
                                                {nameLine}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: colors.text.muted,
                                                    fontSize: 11,
                                                    marginTop: 2,
                                                }}
                                            >
                                                {shortWallet(row.wallet)}
                                            </Text>
                                        </View>
                                        {syncBadge}
                                    </View>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            gap: 12,
                                            marginBottom: 8,
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                                            DB: {row.dbOwnedCount}
                                        </Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                                            Chain: {onChainLabel}
                                        </Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                                            Listings: {row.dbActiveListings}
                                        </Text>
                                    </View>
                                    <ActionButton
                                        icon={<ExternalLink size={12} color={colors.accent.cyan} />}
                                        label="View on Polygonscan"
                                        color={colors.accent.cyan}
                                        onPress={() => openExplorer(row.explorerUrl)}
                                    />
                                </>
                            )}
                        </View>
                    );
                }}
            />
        </AdminScreen>
    );
}
