import React from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, Music, Gem, TrendingUp, ArrowRight, Coins } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import GlassCard from '../../src/components/shared/GlassCard';
import { useCreatorRoyalties, useRoyaltyHistory } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    return `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
}

/* ─── Revenue Source Card ─── */
function RevenueCard({ title, amount, icon, color }: {
    title: string; amount: number; icon: React.ReactNode; color: string;
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
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, marginTop: 8 }}>
                €{amount.toFixed(4)}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                {title}
            </Text>
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
                    €{song.totalRevenue.toFixed(4)}
                </Text>
                {song.nftRevenue > 0 && (
                    <Text style={{ fontSize: 10, color: '#8b5cf6', fontWeight: '600', marginTop: 2 }}>
                        +€{song.nftRevenue.toFixed(2)} NFT
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
        : event?.sourceType === 'primary_sale' ? 'Primary Sale'
        : event?.sourceType === 'secondary_sale' ? 'Secondary Sale'
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
                €{share.amountEur.toFixed(4)}
            </Text>
        </View>
    );
}

/* ─── Main Screen ─── */
export default function EarningsScreen() {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { data: royalties, loading: loadingRoyalties } = useCreatorRoyalties();
    const { data: history, loading: loadingHistory } = useRoyaltyHistory(30);
    const Container = isWeb ? View : SafeAreaView;

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
                    Your revenue breakdown from streams and NFT sales.
                </Text>

                {loadingRoyalties ? (
                    <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#38b4ba" /></View>
                ) : (
                    <>
                        {/* Total Earnings Card */}
                        <View
                            style={{
                                padding: isWeb ? 28 : 20, borderRadius: 16,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1.5, borderColor: 'rgba(56,180,186,0.2)',
                                alignItems: 'center', marginBottom: 20,
                                shadowColor: '#38b4ba', shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
                            }}
                        >
                            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(56,180,186,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                <DollarSign size={24} color="#38b4ba" />
                            </View>
                            <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                                €{(royalties?.totalRevenue || 0).toFixed(4)}
                            </Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                                Total Earnings
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <TrendingUp size={12} color="#38b4ba" />
                                    <Text style={{ fontSize: 12, color: '#38b4ba', fontWeight: '600' }}>
                                        {(royalties?.streamCount || 0).toLocaleString()} streams
                                    </Text>
                                </View>
                                <Text style={{ color: colors.text.muted }}>·</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Gem size={12} color="#8b5cf6" />
                                    <Text style={{ fontSize: 12, color: '#8b5cf6', fontWeight: '600' }}>
                                        {royalties?.totalNFTsSold || 0} NFTs sold
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Revenue Breakdown */}
                        <View style={{ flexDirection: 'row', marginBottom: 28 }}>
                            <RevenueCard
                                title="Streaming"
                                amount={royalties?.streamRevenue || 0}
                                icon={<Music size={18} color="#38b4ba" />}
                                color="#38b4ba"
                            />
                            <RevenueCard
                                title="NFT Sales"
                                amount={(royalties?.primarySaleRevenue || 0) + (royalties?.secondarySaleRevenue || 0)}
                                icon={<Gem size={18} color="#8b5cf6" />}
                                color="#8b5cf6"
                            />
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
                    Recent Royalties
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
                            No royalty events yet. Play your songs to start earning.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}
