import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Platform, TouchableOpacity, Linking } from 'react-native';
import { Coins, RefreshCw, Zap, ExternalLink, AlertTriangle } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, ConfirmModal } from '../../src/components/admin/AdminActionComponents';
import { useAdminPrimarySalePayouts, AdminPrimarySalePayout } from '../../src/hooks/useAdminData';
import { useAdminPrimarySalePayoutActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchTxStatus, invalidateTxStatusCache, type TxStatus } from '../../src/hooks/useOnChainNFT';

const isWeb = Platform.OS === 'web';

// Polygon Amoy explorer. On mainnet transition these should come from env.
const EXPLORER_TX_BASE = 'https://amoy.polygonscan.com/tx/';
const EXPLORER_ADDR_BASE = 'https://amoy.polygonscan.com/address/';

// Polygon native (POL / MATIC) has 18 decimals. Format wei string to "0.1234 POL".
function formatWeiToPol(wei: string, maxFractionDigits = 6): string {
    if (!wei) return '0 POL';
    try {
        const n = BigInt(wei);
        const base = BigInt(10) ** BigInt(18);
        const whole = n / base;
        const frac = n % base;
        if (frac === BigInt(0)) return `${whole.toString()} POL`;
        // Pad fractional part to 18 digits, then trim.
        const fracStr = frac.toString().padStart(18, '0').slice(0, maxFractionDigits).replace(/0+$/, '');
        return fracStr.length > 0 ? `${whole.toString()}.${fracStr} POL` : `${whole.toString()} POL`;
    } catch {
        return `${wei} wei`;
    }
}

function truncateHex(hex: string, head = 6, tail = 4): string {
    if (!hex) return '—';
    if (hex.length <= head + tail + 2) return hex;
    return `${hex.slice(0, head)}...${hex.slice(-tail)}`;
}

function openExternal(url: string) {
    if (!url) return;
    if (isWeb) {
        window.open(url, '_blank', 'noopener,noreferrer');
    } else {
        Linking.openURL(url).catch(() => { /* no-op */ });
    }
}

// Chain verification kind per-tx. Keeps render logic declarative.
type ChainBadge = 'verified' | 'mismatch' | 'unconfirmed' | 'failed' | 'skipped';

function badgeStyle(kind: ChainBadge): { label: string; color: string; bg: string } {
    switch (kind) {
        case 'verified': return { label: '✓ Verified', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
        case 'mismatch': return { label: '⚠ Mismatch', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
        case 'unconfirmed': return { label: '⋯ Unconfirmed', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' };
        case 'failed': return { label: '✕ Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
        case 'skipped': return { label: '— No tx', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
    }
}

function ChainVerifyBadge({ kind, detail }: { kind: ChainBadge; detail?: string }) {
    const s = badgeStyle(kind);
    return (
        <View style={{
            alignSelf: 'flex-start',
            backgroundColor: s.bg,
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginTop: 4,
            maxWidth: 180,
        }}>
            <Text style={{ color: s.color, fontSize: 10, fontWeight: '600' }}>{s.label}</Text>
            {detail ? (
                <Text style={{ color: s.color, fontSize: 9, opacity: 0.8 }} numberOfLines={1}>
                    {detail}
                </Text>
            ) : null}
        </View>
    );
}

export default function AdminPrimarySalePayoutsScreen() {
    const { data: payouts, loading, error, refresh } = useAdminPrimarySalePayouts(100);
    const { retry, sweep } = useAdminPrimarySalePayoutActions(refresh);
    const { colors } = useTheme();

    const [retryTarget, setRetryTarget] = useState<AdminPrimarySalePayout | null>(null);
    const [sweepOpen, setSweepOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Per-row chain verification state. Keyed by tx hash so the same hash
    // isn't re-fetched when it appears on multiple payouts (rare but
    // possible if a retry re-used a hash).
    const [txStatusMap, setTxStatusMap] = useState<Record<string, TxStatus>>({});

    // Load chain status for every claim + forward tx on the current page.
    // Runs once per payouts list change; internal cache in `fetchTxStatus`
    // prevents hammering the RPC on re-render.
    useEffect(() => {
        if (payouts.length === 0) return;
        let cancelled = false;
        const hashes = new Set<string>();
        for (const p of payouts) {
            if (p.claimTxHash) hashes.add(p.claimTxHash);
            if (p.forwardTxHash) hashes.add(p.forwardTxHash);
        }
        if (hashes.size === 0) return;
        (async () => {
            const results = await Promise.all(
                Array.from(hashes).map(async (h) => [h, await fetchTxStatus(h)] as const),
            );
            if (cancelled) return;
            setTxStatusMap((prev) => {
                const next = { ...prev };
                for (const [h, s] of results) next[h] = s;
                return next;
            });
        })();
        return () => { cancelled = true; };
    }, [payouts]);

    // Wrap refresh to also invalidate the tx-status cache so the admin gets
    // a truly fresh chain read when they hit the Refresh button.
    const refreshAll = () => {
        invalidateTxStatusCache();
        setTxStatusMap({});
        refresh();
    };

    // Classify a tx against an expected wei value. `expectedWei` may be '0'
    // for the claim tx (we don't assert its value because claim flows differ
    // per contract); pass undefined to skip the value comparison.
    const classifyTx = (hash: string, expectedWei?: string): { kind: ChainBadge; detail?: string } => {
        if (!hash) return { kind: 'skipped' };
        const status = txStatusMap[hash];
        if (!status) return { kind: 'unconfirmed', detail: 'Loading…' };
        if (status.missing) return { kind: 'unconfirmed', detail: 'Not yet mined' };
        if (!status.ok) return { kind: 'failed', detail: status.blockNumber ? `Block ${status.blockNumber}` : 'Reverted' };
        if (expectedWei && status.valueWei !== null) {
            try {
                const expected = BigInt(expectedWei);
                if (expected !== status.valueWei) {
                    return { kind: 'mismatch', detail: `On-chain ≠ DB` };
                }
            } catch {
                // If expectedWei isn't a valid bigint string, skip the check.
            }
        }
        return { kind: 'verified', detail: status.blockNumber ? `Block ${status.blockNumber}` : undefined };
    };

    const summary = useMemo(() => {
        const s = { forwarded: 0, pending: 0, pending_retry: 0, failed: 0, other: 0 };
        for (const p of payouts) {
            if (p.status === 'forwarded') s.forwarded++;
            else if (p.status === 'pending') s.pending++;
            else if (p.status === 'pending_retry') s.pending_retry++;
            else if (p.status === 'failed') s.failed++;
            else s.other++;
        }
        return s;
    }, [payouts]);

    const handleRetry = async () => {
        if (!retryTarget) return;
        setActionLoading(true);
        await retry(retryTarget.id);
        setActionLoading(false);
        setRetryTarget(null);
    };

    const handleSweep = async () => {
        setActionLoading(true);
        await sweep(20);
        setActionLoading(false);
        setSweepOpen(false);
    };

    const columns = [
        { label: 'Song / Artist', flex: 1.4 },
        { label: 'Buyer', flex: 0.9 },
        { label: 'Gross / Artist', flex: 1 },
        { label: 'Fee', flex: 0.5 },
        { label: 'Status', flex: 0.8 },
        { label: 'Claim Tx', flex: 0.7 },
        { label: 'Forward Tx', flex: 0.7 },
        { label: 'Created', flex: 0.8 },
        { label: 'Actions', flex: 1 },
    ];

    const subtitle = !loading
        ? `${payouts.length} payouts · ${summary.forwarded} forwarded · ${summary.pending_retry} pending retry · ${summary.failed} failed`
        : 'Loading...';

    return (
        <AdminScreen
            title="Primary Sale Payouts"
            subtitle={subtitle}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            {/* Toolbar */}
            <View style={{
                flexDirection: 'row',
                gap: 10,
                marginBottom: 16,
                flexWrap: 'wrap',
            }}>
                <ActionButton
                    icon={<Zap size={14} color="#facc15" />}
                    label={`Sweep pending retry (${summary.pending_retry})`}
                    color="#facc15"
                    onPress={() => setSweepOpen(true)}
                    disabled={summary.pending_retry === 0}
                    size="medium"
                />
                <ActionButton
                    icon={<RefreshCw size={14} color={colors.accent.cyan} />}
                    label="Refresh"
                    color={colors.accent.cyan}
                    onPress={refreshAll}
                    size="medium"
                />
            </View>

            <AdminDataTable
                headers={['Song / Artist', 'Buyer', 'Gross / Artist', 'Fee', 'Status', 'Claim Tx', 'Forward Tx', 'Created', 'Actions']}
                columns={columns}
                data={payouts}
                emptyMessage="No primary sale payouts yet. Mints via serverClaim will record rows here."
                minTableWidth={1280}
                renderRow={(p: AdminPrimarySalePayout) => {
                    const canRetry = p.status === 'pending_retry' || p.status === 'failed' || p.status === 'pending';
                    const claimUrl = p.claimTxHash ? `${EXPLORER_TX_BASE}${p.claimTxHash}` : '';
                    const forwardUrl = p.forwardTxHash ? `${EXPLORER_TX_BASE}${p.forwardTxHash}` : '';
                    const artistAddrUrl = p.artistWallet ? `${EXPLORER_ADDR_BASE}${p.artistWallet}` : '';

                    // Chain verification: claim tx is status-only (value is
                    // contract-call data, not a native transfer). Forward tx
                    // is a native transfer — its `value` should equal
                    // artistWei exactly. A mismatch is a red flag the ledger
                    // and the wire disagree.
                    const claimBadge = classifyTx(p.claimTxHash);
                    const forwardBadge = classifyTx(p.forwardTxHash, p.artistWei);

                    if (!isWeb) {
                        // Compact mobile card
                        return (
                            <View style={{ padding: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Coins size={16} color={colors.accent.cyan} style={{ marginRight: 8 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                                            {p.songTitle} · {p.tierName}
                                        </Text>
                                        <Text style={{ color: colors.text.muted, fontSize: 11 }} numberOfLines={1}>
                                            {p.artistName}
                                        </Text>
                                    </View>
                                    <StatusBadge status={p.status} />
                                </View>
                                <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 2 }}>
                                    Gross: {formatWeiToPol(p.grossWei)} · Artist: {formatWeiToPol(p.artistWei)}
                                </Text>
                                <Text style={{ color: colors.text.muted, fontSize: 11, marginBottom: 6 }}>
                                    Fee: {p.platformFeeBps} bps · Attempts: {p.attemptCount}
                                </Text>
                                {!!p.lastError && (
                                    <Text style={{ color: colors.status.error, fontSize: 11, marginBottom: 6 }} numberOfLines={2}>
                                        {p.lastError}
                                    </Text>
                                )}
                                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                    {claimUrl ? (
                                        <View>
                                            <ActionButton
                                                icon={<ExternalLink size={11} color={colors.text.secondary} />}
                                                label="Claim"
                                                color={colors.text.secondary}
                                                onPress={() => openExternal(claimUrl)}
                                            />
                                            <ChainVerifyBadge kind={claimBadge.kind} detail={claimBadge.detail} />
                                        </View>
                                    ) : null}
                                    {forwardUrl ? (
                                        <View>
                                            <ActionButton
                                                icon={<ExternalLink size={11} color={colors.status.success} />}
                                                label="Forward"
                                                color={colors.status.success}
                                                onPress={() => openExternal(forwardUrl)}
                                            />
                                            <ChainVerifyBadge kind={forwardBadge.kind} detail={forwardBadge.detail} />
                                        </View>
                                    ) : null}
                                    {canRetry ? (
                                        <ActionButton
                                            icon={<RefreshCw size={11} color={colors.accent.cyan} />}
                                            label="Retry"
                                            color={colors.accent.cyan}
                                            onPress={() => setRetryTarget(p)}
                                        />
                                    ) : null}
                                </View>
                            </View>
                        );
                    }

                    return (
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 14,
                        }}>
                            {/* Song / Artist */}
                            <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center' }}>
                                <Coins size={16} color={colors.accent.cyan} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                                        {p.songTitle}
                                    </Text>
                                    <Text style={{ color: colors.text.muted, fontSize: 11 }} numberOfLines={1}>
                                        {p.artistName} · {p.tierName}{p.rarity ? ` · ${p.rarity}` : ''}
                                    </Text>
                                    {p.artistWallet ? (
                                        <TouchableOpacity onPress={() => openExternal(artistAddrUrl)}>
                                            <Text style={{
                                                color: colors.text.muted,
                                                fontSize: 10,
                                                fontFamily: 'monospace',
                                                textDecorationLine: 'underline',
                                            }}>
                                                {truncateHex(p.artistWallet)}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            </View>

                            {/* Buyer */}
                            <Text
                                style={{
                                    flex: 0.9,
                                    color: colors.text.secondary,
                                    fontSize: 11,
                                    fontFamily: 'monospace',
                                }}
                                numberOfLines={1}
                            >
                                {truncateHex(p.buyerWallet)}
                            </Text>

                            {/* Gross / Artist */}
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                                    {formatWeiToPol(p.grossWei)}
                                </Text>
                                <Text style={{ color: colors.status.success, fontSize: 11 }}>
                                    → {formatWeiToPol(p.artistWei)}
                                </Text>
                            </View>

                            {/* Fee */}
                            <View style={{ flex: 0.5 }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                                    {p.platformFeeBps} bps
                                </Text>
                                <Text style={{ color: colors.text.muted, fontSize: 10 }}>
                                    {formatWeiToPol(p.platformWei)}
                                </Text>
                            </View>

                            {/* Status */}
                            <View style={{ flex: 0.8 }}>
                                <StatusBadge status={p.status} />
                                {p.attemptCount > 0 && (
                                    <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 4 }}>
                                        {p.attemptCount} attempt{p.attemptCount === 1 ? '' : 's'}
                                    </Text>
                                )}
                                {!!p.lastError && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, maxWidth: 180 }}>
                                        <AlertTriangle size={10} color={colors.status.error} style={{ marginRight: 4 }} />
                                        <Text
                                            style={{ color: colors.status.error, fontSize: 10, flex: 1 }}
                                            numberOfLines={2}
                                        >
                                            {p.lastError}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Claim Tx */}
                            <View style={{ flex: 0.7 }}>
                                {p.claimTxHash ? (
                                    <>
                                        <TouchableOpacity
                                            onPress={() => openExternal(claimUrl)}
                                            style={{ flexDirection: 'row', alignItems: 'center' }}
                                        >
                                            <Text style={{
                                                color: colors.accent.cyan,
                                                fontSize: 11,
                                                fontFamily: 'monospace',
                                                textDecorationLine: 'underline',
                                                marginRight: 4,
                                            }}>
                                                {truncateHex(p.claimTxHash)}
                                            </Text>
                                            <ExternalLink size={10} color={colors.accent.cyan} />
                                        </TouchableOpacity>
                                        <ChainVerifyBadge kind={claimBadge.kind} detail={claimBadge.detail} />
                                    </>
                                ) : (
                                    <>
                                        <Text style={{ color: colors.text.muted, fontSize: 11 }}>—</Text>
                                        <ChainVerifyBadge kind="skipped" />
                                    </>
                                )}
                            </View>

                            {/* Forward Tx */}
                            <View style={{ flex: 0.7 }}>
                                {p.forwardTxHash ? (
                                    <>
                                        <TouchableOpacity
                                            onPress={() => openExternal(forwardUrl)}
                                            style={{ flexDirection: 'row', alignItems: 'center' }}
                                        >
                                            <Text style={{
                                                color: colors.status.success,
                                                fontSize: 11,
                                                fontFamily: 'monospace',
                                                textDecorationLine: 'underline',
                                                marginRight: 4,
                                            }}>
                                                {truncateHex(p.forwardTxHash)}
                                            </Text>
                                            <ExternalLink size={10} color={colors.status.success} />
                                        </TouchableOpacity>
                                        <ChainVerifyBadge kind={forwardBadge.kind} detail={forwardBadge.detail} />
                                    </>
                                ) : (
                                    <>
                                        <Text style={{ color: colors.text.muted, fontSize: 11 }}>—</Text>
                                        <ChainVerifyBadge kind="skipped" />
                                    </>
                                )}
                            </View>

                            {/* Created */}
                            <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 11 }}>
                                {p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}
                            </Text>

                            {/* Actions */}
                            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
                                {canRetry ? (
                                    <ActionButton
                                        icon={<RefreshCw size={12} color={colors.accent.cyan} />}
                                        label="Retry"
                                        color={colors.accent.cyan}
                                        onPress={() => setRetryTarget(p)}
                                    />
                                ) : (
                                    <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                                        {p.forwardedAt ? new Date(p.forwardedAt).toLocaleDateString() : '—'}
                                    </Text>
                                )}
                            </View>
                        </View>
                    );
                }}
            />

            <ConfirmModal
                visible={!!retryTarget}
                title="Retry Primary Sale Payout"
                message={
                    retryTarget
                        ? `Retry forwarding ${formatWeiToPol(retryTarget.artistWei)} to ${truncateHex(retryTarget.artistWallet)} for "${retryTarget.songTitle}"?\n\nThis will re-submit a native transfer from the server wallet. Current status: ${retryTarget.status}. Attempts so far: ${retryTarget.attemptCount}.`
                        : ''
                }
                confirmLabel="Retry Forward"
                confirmColor={colors.accent.cyan}
                onConfirm={handleRetry}
                onCancel={() => setRetryTarget(null)}
                loading={actionLoading}
            />

            <ConfirmModal
                visible={sweepOpen}
                title="Sweep Pending Retries"
                message={`Process up to 20 pending_retry rows now? Each row will re-submit a native transfer from the server wallet; rows exceeding the retry cap will be marked as failed.`}
                confirmLabel="Run Sweep"
                confirmColor="#facc15"
                onConfirm={handleSweep}
                onCancel={() => setSweepOpen(false)}
                loading={actionLoading}
            />
        </AdminScreen>
    );
}
