import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Music, Gem, TrendingUp, ArrowRight, Coins, Wallet, Clock,
    RefreshCw, ExternalLink, ArrowUpRight, CheckCircle, AlertCircle,
    DollarSign,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import GlassCard from '../../src/components/shared/GlassCard';
import { useCreatorRoyalties, useRoyaltyHistory } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import {
    getArtistBalance,
    getCreatorNFTSales,
    getPayoutRequests,
    createPayoutRequest,
    getBankDetails,
    type NFTSaleRecord,
    type PayoutRequest,
} from '../../src/services/database';
import { formatFiat, formatToken } from '../../src/services/fxRate';
import { EXPLORER_BASE as POLYGONSCAN_BASE, RPC_URL } from '../../src/config/network';
import { supabase } from '../../src/lib/supabase';

const isWeb = Platform.OS === 'web';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    return `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
}

/** Fetch real on-chain POL balance via JSON-RPC */
async function fetchWalletBalancePol(walletAddress: string): Promise<number> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', method: 'eth_getBalance',
                params: [walletAddress, 'latest'], id: 1,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        return Number(BigInt(data.result || '0')) / 1e18;
    } catch {
        return 0;
    }
}

/* ─── Section Title ─── */
function SectionTitle({ title, icon: Icon, color = '#38b4ba' }: { title: string; icon: any; color?: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 28 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${color}15`, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={color} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>{title}</Text>
        </View>
    );
}

/* ─── Overview Card ─── */
function OverviewCard({ title, amount, subtitle, color, highlight }: {
    title: string; amount: string; subtitle?: string; color: string; highlight?: boolean;
}) {
    const { isDark, colors } = useTheme();
    return (
        <View style={{
            flex: 1, margin: 4, padding: isWeb ? 20 : 14, borderRadius: 14,
            backgroundColor: highlight
                ? (isDark ? `${color}18` : `${color}08`)
                : isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
            borderWidth: highlight ? 1.5 : 1,
            borderColor: highlight ? `${color}40` : (isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)')),
            alignItems: 'center',
        }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>{title}</Text>
            <Text style={{ fontSize: isWeb ? 24 : 20, fontWeight: '800', color, marginTop: 6 }}>{amount}</Text>
            {subtitle && <Text style={{ fontSize: 9, fontWeight: '600', color: colors.text.muted, marginTop: 4 }}>{subtitle}</Text>}
        </View>
    );
}

/* ─── Per-Song Revenue Row ─── */
function SongRevenueRow({ song, onPress }: {
    song: { songId: string; songTitle: string; coverImage: string; streamRevenue: number; nftRevenue: number; totalRevenue: number; streamCount: number };
    onPress?: () => void;
}) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            onPress={onPress}
            style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 12, paddingHorizontal: isWeb ? 16 : 12,
                borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
            }}
        >
            <Image source={{ uri: coverUrl(song.coverImage) }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>{song.songTitle}</Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>{song.streamCount.toLocaleString()} streams</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                {/* Streaming revenue is denominated in EUR per MU6 currency rules. */}
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#38b4ba' }}>€{song.streamRevenue.toFixed(2)}</Text>
                {song.nftRevenue > 0 && (
                    <Text style={{ fontSize: 10, color: '#8b5cf6', fontWeight: '600', marginTop: 2 }}>+€{song.nftRevenue.toFixed(2)} NFT royalties</Text>
                )}
            </View>
            {onPress && <ArrowRight size={16} color={colors.text.muted} style={{ marginLeft: 8 }} />}
        </AnimatedPressable>
    );
}

/* ─── NFT Sale Row ─── */
function NFTSaleRow({ sale }: { sale: NFTSaleRecord }) {
    const { isDark, colors } = useTheme();
    const truncBuyer = sale.buyerWallet ? `${sale.buyerWallet.slice(0, 6)}...${sale.buyerWallet.slice(-4)}` : '—';
    const date = new Date(sale.purchasedAt).toLocaleDateString();

    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: 10, paddingHorizontal: isWeb ? 16 : 12,
            borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
        }}>
            <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}>
                <Gem size={14} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>{sale.songTitle}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: colors.text.muted }}>{truncBuyer}</Text>
                    <Text style={{ fontSize: 10, color: colors.text.muted }}>{date}</Text>
                </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#8b5cf6' }}>
                    {sale.pricePaidToken > 0 ? `${sale.pricePaidToken.toFixed(4)} POL` : '—'}
                </Text>
                {sale.pricePaidEurAtSale > 0 && (
                    <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 1 }}>{formatFiat(sale.pricePaidEurAtSale, 'eur')}</Text>
                )}
            </View>
            {sale.txHash && (
                <AnimatedPressable
                    preset="icon"
                    onPress={() => Linking.openURL(`${POLYGONSCAN_BASE}/tx/${sale.txHash}`)}
                    style={{ marginLeft: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', alignItems: 'center' as const, justifyContent: 'center' as const }}
                >
                    <ExternalLink size={12} color={colors.text.muted} />
                </AnimatedPressable>
            )}
        </View>
    );
}

/* ─── Payout Row ─── */
function PayoutRow({ payout }: { payout: PayoutRequest }) {
    const { isDark, colors } = useTheme();
    const date = new Date(payout.requestedAt).toLocaleDateString();
    const statusColor = payout.status === 'completed' ? '#22c55e' : payout.status === 'pending' ? '#f59e0b' : '#ef4444';
    const StatusIcon = payout.status === 'completed' ? CheckCircle : payout.status === 'pending' ? Clock : AlertCircle;

    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: 10, paddingHorizontal: isWeb ? 16 : 12,
            borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
        }}>
            <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: `${statusColor}20`, alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}>
                <StatusIcon size={14} color={statusColor} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>
                    {formatFiat(payout.amountEur, 'eur')}
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{date}</Text>
            </View>
            <View style={{
                backgroundColor: `${statusColor}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
            }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textTransform: 'uppercase' }}>{payout.status}</Text>
            </View>
        </View>
    );
}

/* ─── Royalty History Row ─── */
function RoyaltyRow({ share }: { share: any }) {
    const { isDark, colors } = useTheme();
    const event = share.royaltyEvent;
    const sourceLabel = event?.sourceType === 'stream' ? 'Stream'
        : event?.sourceType === 'primary_sale' ? 'Purchase'
        : event?.sourceType === 'secondary_sale' ? 'Resale Royalty'
        : 'Royalty';
    const sourceColor = event?.sourceType === 'stream' ? '#38b4ba'
        : event?.sourceType === 'secondary_sale' ? '#f59e0b'
        : '#8b5cf6';

    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: 10, paddingHorizontal: isWeb ? 16 : 12,
            borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
        }}>
            <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: `${sourceColor}20`, alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}>
                <Coins size={14} color={sourceColor} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>{event?.song?.title || 'Unknown Song'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={{ backgroundColor: `${sourceColor}20`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: sourceColor, textTransform: 'uppercase' }}>{sourceLabel}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.text.muted }}>{share.sharePercent}% share</Text>
                </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>€{share.amountEur.toFixed(2)}</Text>
        </View>
    );
}

/* ─── Card wrapper ─── */
function CardWrapper({ children, style }: { children: React.ReactNode; style?: any }) {
    const { isDark, colors } = useTheme();
    return (
        <View style={{
            borderRadius: 16, overflow: 'hidden',
            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
            ...style,
        }}>
            {children}
        </View>
    );
}

/* ─── Main Screen ─── */
export default function EarningsScreen() {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { walletAddress, profile } = useAuth();
    const { displayCurrency, fiatCurrency } = useCurrency();
    const { data: royalties, loading: loadingRoyalties } = useCreatorRoyalties();
    const { data: history, loading: loadingHistory } = useRoyaltyHistory(30);
    const Container = isWeb ? View : SafeAreaView;

    // State
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [availableBalance, setAvailableBalance] = useState<{ totalEarned: number; totalPaidOut: number; availableBalance: number } | null>(null);
    const [nftSales, setNftSales] = useState<NFTSaleRecord[]>([]);
    const [nftSalesLoading, setNftSalesLoading] = useState(false);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
    const [payoutsLoading, setPayoutsLoading] = useState(false);
    const [requestingPayout, setRequestingPayout] = useState(false);

    const refreshBalance = useCallback(async () => {
        if (!walletAddress) return;
        setBalanceLoading(true);
        try {
            const bal = await fetchWalletBalancePol(walletAddress);
            setWalletBalance(bal);
        } finally {
            setBalanceLoading(false);
        }
        if (profile?.id) {
            const ab = await getArtistBalance(profile.id);
            setAvailableBalance(ab);
        }
    }, [walletAddress, profile?.id]);

    const loadNFTSales = useCallback(async () => {
        if (!profile?.id) return;
        setNftSalesLoading(true);
        try {
            const sales = await getCreatorNFTSales(profile.id);
            setNftSales(sales);
        } finally {
            setNftSalesLoading(false);
        }
    }, [profile?.id]);

    const account = useActiveAccount();

    const loadPayouts = useCallback(async () => {
        if (!profile?.id) return;
        if (!account) {
            // Wallet not yet connected — edge fn requires a signed request.
            setPayouts([]);
            return;
        }
        setPayoutsLoading(true);
        try {
            const p = await getPayoutRequests(profile.id, account);
            setPayouts(p);
        } finally {
            setPayoutsLoading(false);
        }
    }, [profile?.id, account]);

    useEffect(() => {
        refreshBalance();
        loadNFTSales();
        loadPayouts();
    }, [refreshBalance, loadNFTSales, loadPayouts]);

    // Refresh whenever the screen regains focus (e.g. admin approved a payout
    // in another session/device — artist returns to this tab).
    useFocusEffect(
        useCallback(() => {
            refreshBalance();
            loadPayouts();
        }, [refreshBalance, loadPayouts])
    );

    // Realtime: subscribe to this artist's payout_requests rows so balance +
    // history update immediately when admin flips status (pending → completed /
    // failed). Source of truth stays the DB; this is pure UI liveness.
    useEffect(() => {
        if (!profile?.id) return;
        const channel = supabase
            .channel(`payouts:${profile.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'payout_requests',
                    filter: `profile_id=eq.${profile.id}`,
                },
                () => {
                    refreshBalance();
                    loadPayouts();
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile?.id, refreshBalance, loadPayouts]);

    const handleRequestPayout = async () => {
        if (!profile?.id || !availableBalance || availableBalance.availableBalance <= 0) return;

        const bankDetails = await getBankDetails(profile.id);
        if (!bankDetails) {
            const msg = 'Please set up your payout information in Settings first.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Setup Required', msg);
            return;
        }

        setRequestingPayout(true);
        try {
            if (!account) {
                const msg = 'Please connect your wallet before requesting a payout.';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Wallet Required', msg);
                return;
            }
            const result = await createPayoutRequest(
                profile.id,
                availableBalance.availableBalance,
                bankDetails,
                bankDetails.paymentMethod,
                account,
            );
            if (result.error) {
                const msg = result.error;
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
            } else {
                const msg = 'Payout request submitted successfully!';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Success', msg);
                loadPayouts();
                refreshBalance();
            }
        } finally {
            setRequestingPayout(false);
        }
    };

    const totalNFTRevenue = (royalties?.primarySaleRevenue || 0) + (royalties?.secondarySaleRevenue || 0);
    const streamingRevenue = royalties?.streamRevenue || 0;
    const totalEarned = totalNFTRevenue + streamingRevenue;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(56,180,186,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <DollarSign size={22} color="#38b4ba" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            Earnings
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                            Revenue from streaming, NFT sales, and payouts
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="icon"
                        onPress={() => { refreshBalance(); loadNFTSales(); loadPayouts(); }}
                        style={{
                            width: 36, height: 36, borderRadius: 18,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                            alignItems: 'center' as const, justifyContent: 'center' as const,
                        }}
                    >
                        {balanceLoading ? <ActivityIndicator size="small" color="#38b4ba" /> : <RefreshCw size={16} color={colors.text.muted} />}
                    </AnimatedPressable>
                </View>

                {/* ── Section 1: Overview Cards ── */}
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {/* Streaming revenue is EUR; NFT sale POL totals come from the wallet card below. */}
                    <OverviewCard title="Streaming" amount={`€${streamingRevenue.toFixed(2)}`} subtitle="Total earned — does not debit" color="#38b4ba" />
                    <OverviewCard title="NFT Royalties" amount={`€${totalNFTRevenue.toFixed(2)}`} subtitle="Split-sheet accrual" color="#8b5cf6" />
                </View>
                <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                    <OverviewCard
                        title="Available for Payout"
                        amount={`€${(availableBalance?.availableBalance || 0).toFixed(2)}`}
                        subtitle="Streaming only"
                        color="#22c55e"
                    />
                    <OverviewCard
                        title="Total Earned"
                        amount={`€${totalEarned.toFixed(2)}`}
                        subtitle="All fiat sources"
                        color={colors.text.primary}
                        highlight
                    />
                </View>

                {/* ── Wallet Balance ── */}
                <View style={{
                    padding: isWeb ? 20 : 16, borderRadius: 14,
                    backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                    borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.25)',
                    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
                }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(139,92,246,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                        <Wallet size={20} color="#8b5cf6" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>On-Chain Wallet</Text>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, marginTop: 2 }}>
                            {walletBalance !== null ? `${walletBalance.toFixed(4)} POL` : '—'}
                        </Text>
                    </View>
                    {walletAddress && (
                        <AnimatedPressable
                            preset="icon"
                            onPress={() => Linking.openURL(`${POLYGONSCAN_BASE}/address/${walletAddress}`)}
                            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', alignItems: 'center' as const, justifyContent: 'center' as const }}
                        >
                            <ExternalLink size={14} color={colors.text.muted} />
                        </AnimatedPressable>
                    )}
                </View>

                {loadingRoyalties ? (
                    <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#38b4ba" /></View>
                ) : (
                    <>
                        {/* ── Section 2: Streaming Revenue ── */}
                        <SectionTitle title="Streaming Revenue" icon={Music} color="#38b4ba" />

                        {/* Stats */}
                        <View style={{ flexDirection: 'row', marginBottom: 16, gap: 8 }}>
                            <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <TrendingUp size={12} color="#38b4ba" />
                                    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text.primary }}>{(royalties?.streamCount || 0).toLocaleString()}</Text>
                                </View>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Streams</Text>
                            </View>
                            <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', alignItems: 'center' }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#38b4ba' }}>€{streamingRevenue.toFixed(2)}</Text>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>EUR Earned</Text>
                            </View>
                        </View>

                        {/* Per-Song Breakdown */}
                        {(royalties?.perSongBreakdown?.length || 0) > 0 && (
                            <CardWrapper style={{ marginBottom: 8 }}>
                                {royalties!.perSongBreakdown.map((song) => (
                                    <SongRevenueRow
                                        key={song.songId}
                                        song={song}
                                        onPress={() => router.push({
                                            pathname: '/(artist)/split-editor',
                                            params: { songId: song.songId, songTitle: song.songTitle },
                                        })}
                                    />
                                ))}
                            </CardWrapper>
                        )}

                        {/* ── Section 3: NFT Sales Revenue ── */}
                        <SectionTitle title="NFT Sales Revenue" icon={Gem} color="#8b5cf6" />

                        <View style={{ padding: 12, borderRadius: 12, backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.04)', borderWidth: 1, borderColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)', marginBottom: 16 }}>
                            <Text style={{ fontSize: 11, color: colors.text.secondary, lineHeight: 18 }}>
                                NFT revenue is distributed on-chain via Split contracts. Primary sale proceeds go directly to your wallet (95% artist pool, 5% platform fee).
                            </Text>
                        </View>

                        {nftSalesLoading ? (
                            <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#8b5cf6" /></View>
                        ) : nftSales.length > 0 ? (
                            <CardWrapper style={{ marginBottom: 8 }}>
                                {nftSales.map((sale) => <NFTSaleRow key={sale.id} sale={sale} />)}
                            </CardWrapper>
                        ) : (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Gem size={32} color={colors.text.muted} style={{ marginBottom: 8 }} />
                                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>No NFT sales yet.</Text>
                            </View>
                        )}

                        {/* ── Section 4: Payout History ── */}
                        <SectionTitle title="Payout History" icon={ArrowUpRight} color="#22c55e" />

                        {/* Request Payout Button (PDF Fix #8: disabled while a pending request exists) */}
                        {(() => {
                            const hasPending = payouts.some((p) => p.status === 'pending');
                            const hasBalance = !!availableBalance && availableBalance.availableBalance > 0.001;
                            if (!hasBalance && !hasPending) return null;

                            if (hasPending) {
                                return (
                                    <View
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                                            borderRadius: 12, paddingVertical: 14, marginBottom: 16,
                                        }}
                                    >
                                        <ActivityIndicator size="small" color="#f59e0b" />
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#f59e0b' }}>
                                            Payout request pending admin review
                                        </Text>
                                    </View>
                                );
                            }

                            return (
                                <AnimatedPressable
                                    preset="button"
                                    onPress={handleRequestPayout}
                                    disabled={requestingPayout}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, marginBottom: 16,
                                        opacity: requestingPayout ? 0.7 : 1,
                                    }}
                                >
                                    {requestingPayout ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <ArrowUpRight size={16} color="#fff" />
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                                                Request Payout ({formatFiat(availableBalance!.availableBalance, 'eur')})
                                            </Text>
                                        </>
                                    )}
                                </AnimatedPressable>
                            );
                        })()}

                        <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12, lineHeight: 16 }}>
                            Payouts are for streaming earnings only. NFT sales revenue goes directly to your wallet on-chain.
                        </Text>

                        {payoutsLoading ? (
                            <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#22c55e" /></View>
                        ) : payouts.length > 0 ? (
                            <CardWrapper>
                                {payouts.map((p) => <PayoutRow key={p.id} payout={p} />)}
                            </CardWrapper>
                        ) : (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <ArrowUpRight size={32} color={colors.text.muted} style={{ marginBottom: 8 }} />
                                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>No payout requests yet.</Text>
                            </View>
                        )}
                    </>
                )}

                {/* ── Recent Transactions ── */}
                <SectionTitle title="Recent Transactions" icon={Coins} color="#f59e0b" />
                {loadingHistory ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : history.length > 0 ? (
                    <CardWrapper>
                        {history.map((share) => <RoyaltyRow key={share.id} share={share} />)}
                    </CardWrapper>
                ) : (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <Coins size={32} color={colors.text.muted} style={{ marginBottom: 8 }} />
                        <Text style={{ color: colors.text.secondary, fontSize: 13 }}>No transactions yet. Sell NFTs or stream to start earning.</Text>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}
