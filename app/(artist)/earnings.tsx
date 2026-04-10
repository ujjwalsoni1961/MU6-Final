import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Music, Gem, TrendingUp, ArrowRight, Coins, Wallet, Clock, RefreshCw } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import GlassCard from '../../src/components/shared/GlassCard';
import { useCreatorRoyalties, useRoyaltyHistory } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { getArtistBalance } from '../../src/services/database';
import ErrorState from '../../src/components/shared/ErrorState';

const isWeb = Platform.OS === 'web';

// Polygon Amoy RPC for reading real wallet balance
const AMOY_RPC = 'https://rpc-amoy.polygon.technology';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    return `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
}

/** Fetch real on-chain POL balance via JSON-RPC (with timeout) */
async function fetchWalletBalancePol(walletAddress: string): Promise<number> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(AMOY_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getBalance',
                params: [walletAddress, 'latest'],
                id: 1,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        const balanceWei = BigInt(data.result || '0');
        // Convert wei to POL (18 decimals)
        return Number(balanceWei) / 1e18;
    } catch (err) {
        console.warn('[earnings] Failed to fetch wallet balance:', err);
        return 0;
    }
}

/* ─── Revenue Source Card ─── */
function RevenueCard({ title, amount, icon, color, subtitle }: {
    title: string; amount: string; icon: React.ReactNode; color: string; subtitle?: string;
}) {
    const { isDark, colors } = useTheme();
    return (
        <View style={{
            flex: 1, margin: 4, padding: isWeb ? 20 : 16, borderRadius: 14,
            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
            alignItems: 'center',
        }}>
            <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center',
            }}>
                {icon}
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginTop: 8 }}>
                {amount}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                {title}
            </Text>
            {subtitle && (
                <Text style={{ fontSize: 9, fontWeight: '600', color: colors.text.muted, marginTop: 2 }}>
                    {subtitle}
                </Text>
            )}
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
            <Image
                source={{ uri: coverUrl(song.coverImage) }}
                style={{ width: 44, height: 44, borderRadius: 10 }}
                contentFit="cover"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                    {song.songTitle}
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                    {song.streamCount.toLocaleString()} streams
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#38b4ba' }}>
                    {song.totalRevenue.toFixed(4)} POL
                </Text>
                {song.nftRevenue > 0 && (
                    <Text style={{ fontSize: 10, color: '#8b5cf6', fontWeight: '600', marginTop: 2 }}>
                        +{song.nftRevenue.toFixed(4)} NFT
                    </Text>
                )}
            </View>
            {onPress && <ArrowRight size={16} color={colors.text.muted} style={{ marginLeft: 8 }} />}
        </AnimatedPressable>
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
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>
                    {event?.song?.title || 'Unknown Song'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={{ backgroundColor: `${sourceColor}20`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: sourceColor, textTransform: 'uppercase' }}>{sourceLabel}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.text.muted }}>
                        {share.sharePercent}% share
                    </Text>
                </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                {share.amountEur.toFixed(4)} POL
            </Text>
        </View>
    );
}

/* ─── Main Screen ─── */
export default function EarningsScreen() {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { walletAddress, profile } = useAuth();
    const { data: royalties, loading: loadingRoyalties } = useCreatorRoyalties();
    const { data: history, loading: loadingHistory } = useRoyaltyHistory(30);
    const Container = isWeb ? View : SafeAreaView;

    // Real on-chain wallet balance
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);

    // Available balance (accrued - paid out)
    const [availableBalance, setAvailableBalance] = useState<{ totalEarned: number; totalPaidOut: number; availableBalance: number } | null>(null);

    const refreshBalance = useCallback(async () => {
        if (!walletAddress) return;
        setBalanceLoading(true);
        try {
            const bal = await fetchWalletBalancePol(walletAddress);
            setWalletBalance(bal);
        } finally {
            setBalanceLoading(false);
        }
        // Also refresh available balance
        if (profile?.id) {
            const ab = await getArtistBalance(profile.id);
            setAvailableBalance(ab);
        }
    }, [walletAddress, profile?.id]);

    useEffect(() => {
        refreshBalance();
    }, [refreshBalance]);

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                    Earnings
                </Text>
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 4, marginBottom: 24 }}>
                    Your real wallet balance and revenue from NFT sales &amp; streams.
                </Text>

                {/* ── Real Wallet Balance Card ── */}
                <View
                    style={{
                        padding: isWeb ? 28 : 20, borderRadius: 16,
                        backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                        borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.25)',
                        alignItems: 'center', marginBottom: 20,
                        shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(139,92,246,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                            <Wallet size={24} color="#8b5cf6" />
                        </View>
                        <AnimatedPressable
                            preset="icon"
                            onPress={refreshBalance}
                            style={{
                                position: 'absolute', right: -60, top: 0,
                                width: 32, height: 32, borderRadius: 16,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                alignItems: 'center' as const, justifyContent: 'center' as const,
                            }}
                        >
                            {balanceLoading
                                ? <ActivityIndicator size="small" color="#8b5cf6" />
                                : <RefreshCw size={14} color={colors.text.muted} />
                            }
                        </AnimatedPressable>
                    </View>
                    <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                        {walletBalance !== null ? walletBalance.toFixed(4) : '—'}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#8b5cf6', marginTop: 2 }}>
                        POL
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        Wallet Balance (On-Chain)
                    </Text>
                    {walletAddress && (
                        <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 6, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                        </Text>
                    )}
                </View>

                {/* ── Available Balance (Accrued Earnings) ── */}
                {availableBalance && availableBalance.totalEarned > 0 && (
                    <View
                        style={{
                            padding: isWeb ? 20 : 16, borderRadius: 14,
                            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                            borderWidth: 1, borderColor: 'rgba(56,180,186,0.25)',
                            marginBottom: 20,
                        }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
                            Available for Payout
                        </Text>
                        <Text style={{ fontSize: 28, fontWeight: '800', color: '#38b4ba' }}>
                            {availableBalance.availableBalance.toFixed(4)} <Text style={{ fontSize: 16, color: colors.text.muted }}>POL</Text>
                        </Text>
                        <View style={{ flexDirection: 'row', marginTop: 8, gap: 16 }}>
                            <Text style={{ fontSize: 11, color: colors.text.muted }}>
                                Earned: {availableBalance.totalEarned.toFixed(4)}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.text.muted }}>
                                Paid out: {availableBalance.totalPaidOut.toFixed(4)}
                            </Text>
                        </View>
                    </View>
                )}

                {loadingRoyalties ? (
                    <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#38b4ba" /></View>
                ) : (
                    <>
                        {/* Revenue Breakdown */}
                        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                            <RevenueCard
                                title="NFT Sales"
                                amount={`${((royalties?.primarySaleRevenue || 0) + (royalties?.secondarySaleRevenue || 0)).toFixed(4)} POL`}
                                icon={<Gem size={18} color="#8b5cf6" />}
                                color="#8b5cf6"
                                subtitle="Paid to Wallet"
                            />
                            <RevenueCard
                                title="Streaming"
                                amount={`${(royalties?.streamRevenue || 0).toFixed(4)} POL`}
                                icon={<Music size={18} color="#38b4ba" />}
                                color="#38b4ba"
                                subtitle="Accrued"
                            />
                        </View>
                        <View style={{ flexDirection: 'row', marginBottom: 28, paddingHorizontal: 4 }}>
                            <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                                <Wallet size={10} color="#8b5cf6" />
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 1 }}>In Wallet</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                                <Clock size={10} color={colors.text.muted} />
                                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Accrued</Text>
                            </View>
                        </View>

                        {/* Stats Row */}
                        <View style={{
                            flexDirection: 'row', marginBottom: 28, gap: 8,
                        }}>
                            <View style={{
                                flex: 1, padding: 12, borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                                alignItems: 'center',
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <TrendingUp size={12} color="#38b4ba" />
                                    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text.primary }}>
                                        {(royalties?.streamCount || 0).toLocaleString()}
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Streams</Text>
                            </View>
                            <View style={{
                                flex: 1, padding: 12, borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                                alignItems: 'center',
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Gem size={12} color="#8b5cf6" />
                                    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text.primary }}>
                                        {royalties?.totalNFTsSold || 0}
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>NFTs Sold</Text>
                            </View>
                        </View>

                        {/* Per-Song Breakdown */}
                        {(royalties?.perSongBreakdown?.length || 0) > 0 && (
                            <>
                                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 12 }}>
                                    Per-Song Revenue
                                </Text>
                                <View style={{
                                    borderRadius: 16,
                                    backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                                    overflow: 'hidden',
                                    marginBottom: 28,
                                }}>
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
                                </View>
                            </>
                        )}
                    </>
                )}

                {/* Royalty History */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                    Recent Transactions
                </Text>
                {loadingHistory ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : history.length > 0 ? (
                    <View style={{
                        borderRadius: 16,
                        backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                        overflow: 'hidden',
                    }}>
                        {history.map((share) => (
                            <RoyaltyRow key={share.id} share={share} />
                        ))}
                    </View>
                ) : (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <Coins size={40} color={colors.text.muted} style={{ marginBottom: 12 }} />
                        <Text style={{ color: colors.text.secondary, fontSize: 14 }}>
                            No transactions yet. Sell NFTs or stream to start earning.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}
