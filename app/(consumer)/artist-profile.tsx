import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import AvatarDisplay from '../../src/components/shared/AvatarDisplay';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeCheck, TrendingUp, Users, BarChart2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import SongCard from '../../src/components/shared/SongCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { useTheme } from '../../src/context/ThemeContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { useArtistById, useArtistSongs, useIsFollowing } from '../../src/hooks/useData';
import { supabase } from '../../src/lib/supabase';
import { formatWeiAsPol } from '../../src/lib/thirdweb/erc1155';
import { CHAIN_ID } from '../../src/config/network';

function formatFollowers(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

export default function CreatorProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { isDark, colors } = useTheme();

    const { playSong } = usePlayer();

    // Real data hooks
    const { data: artist, loading: loadingArtist, error: artistError, refresh: refreshArtist } = useArtistById(id);
    const { data: artistSongs, loading: loadingSongs } = useArtistSongs(id);
    const { following, toggle: toggleFollow } = useIsFollowing(id);

    const handleToggleFollow = async () => {
        await toggleFollow();
        refreshArtist();
    };

    // ── NFT Activity (mv_nft_collection_stats + unique holders) ──
    interface NftActivityStats {
        totalVolumeWei: bigint;
        mu6PrimaryVolumeWei: bigint;
        mu6SecondaryVolumeWei: bigint;
        openseaVolumeWei: bigint;
        totalSales: number;
        uniqueBuyers: number;
        uniqueSellers: number;
        uniqueHolders: number;
        lastSaleAt: string | null;
    }
    const [nftActivity, setNftActivity] = useState<NftActivityStats | null>(null);
    const [nftActivityLoading, setNftActivityLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        setNftActivityLoading(true);

        // Step 1: get all contract_addresses for this artist's releases
        // (join nft_releases → songs → profiles via creator_id = id)
        supabase
            .from('nft_releases')
            .select('contract_address, song:songs!song_id(creator_id)')
            .not('contract_address', 'is', null)
            .then(async ({ data: releases, error: relErr }) => {
                if (!isMounted || relErr || !releases) {
                    if (isMounted) setNftActivityLoading(false);
                    return;
                }

                // Filter to releases owned by this artist
                const contracts = [
                    ...new Set(
                        releases
                            .filter((r: any) => r.song?.creator_id === id)
                            .map((r: any) => r.contract_address as string)
                            .filter(Boolean),
                    ),
                ];

                if (contracts.length === 0) {
                    if (isMounted) setNftActivityLoading(false);
                    return;
                }

                // Step 2: query mv_nft_collection_stats for those contracts
                const [statsRes, holdersRes] = await Promise.all([
                    supabase
                        .from('mv_nft_collection_stats')
                        .select('total_volume_wei, mu6_primary_volume, mu6_secondary_volume, opensea_volume, total_sales, unique_buyers, unique_sellers, last_sale_at')
                        .eq('chain_id', CHAIN_ID)
                        .in('contract_address', contracts),
                    supabase
                        .from('nft_token_owners')
                        .select('owner', { count: 'exact', head: false })
                        .eq('chain_id', CHAIN_ID)
                        .in('contract_address', contracts)
                        .gt('balance', 0),
                ]);

                if (!isMounted) return;

                // Aggregate across all ERC-1155 release contracts for this artist.
                let totalVolumeWei = BigInt(0);
                let mu6PrimaryVolumeWei = BigInt(0);
                let mu6SecondaryVolumeWei = BigInt(0);
                let openseaVolumeWei = BigInt(0);
                let totalSales = 0;
                let uniqueBuyers = 0;
                let uniqueSellers = 0;
                let lastSaleAt: string | null = null;

                for (const row of (statsRes.data || [])) {
                    totalVolumeWei += BigInt(String((row as any).total_volume_wei || 0));
                    mu6PrimaryVolumeWei += BigInt(String((row as any).mu6_primary_volume || 0));
                    mu6SecondaryVolumeWei += BigInt(String((row as any).mu6_secondary_volume || 0));
                    openseaVolumeWei += BigInt(String((row as any).opensea_volume || 0));
                    totalSales += Number((row as any).total_sales || 0);
                    uniqueBuyers += Number((row as any).unique_buyers || 0);
                    uniqueSellers += Number((row as any).unique_sellers || 0);
                    const sat = (row as any).last_sale_at;
                    if (sat && (!lastSaleAt || sat > lastSaleAt)) lastSaleAt = sat;
                }

                // Count unique holders (balance > 0)
                // holdersRes.data is the rows; count distinct owner values across contracts
                const ownerSet = new Set<string>(
                    (holdersRes.data || []).map((r: any) => r.owner as string).filter(Boolean),
                );

                setNftActivity({
                    totalVolumeWei,
                    mu6PrimaryVolumeWei,
                    mu6SecondaryVolumeWei,
                    openseaVolumeWei,
                    totalSales,
                    uniqueBuyers,
                    uniqueSellers,
                    uniqueHolders: ownerSet.size,
                    lastSaleAt,
                });
                setNftActivityLoading(false);
            });

        return () => { isMounted = false; };
    }, [id]);

    if (loadingArtist) {
        return (
            <ScreenScaffold dominantColor="#74e5ea" contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </ScreenScaffold>
        );
    }

    if (!artist) {
        return (
            <ScreenScaffold dominantColor="#74e5ea" contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 16 }}>
                        {artistError || 'Artist not found'}
                    </Text>
                    <AnimatedPressable preset="button" onPress={() => router.back()} style={{ marginTop: 16 }}>
                        <Text style={{ color: '#38b4ba', fontWeight: '700' }}>Go Back</Text>
                    </AnimatedPressable>
                </View>
            </ScreenScaffold>
        );
    }

    return (
        <ScreenScaffold dominantColor="#74e5ea" contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Cover Banner */}
            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
                <View style={{ borderRadius: 36, overflow: 'hidden', height: 200 }}>
                    {artist.cover ? (
                        <Image
                            source={{ uri: artist.cover }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                        />
                    ) : (
                        <LinearGradient
                            colors={['#74e5ea', '#8b5cf6'] as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ flex: 1 }}
                        />
                    )}
                    <View
                        style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)',
                        }}
                    />
                    {isDark && (
                        <LinearGradient
                            colors={['transparent', colors.bg.base]}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 }}
                        />
                    )}
                </View>
            </View>

            {/* Avatar */}
            <View style={{ alignItems: 'flex-start', marginTop: -60, paddingHorizontal: 32 }}>
                <View
                    style={{
                        width: 120, height: 120, borderRadius: 60, padding: 4,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                        borderWidth: 2,
                        borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
                    }}
                >
                    <AvatarDisplay
                        uri={artist.avatar}
                        size={112}
                    />
                    {artist.verified && (
                        <View
                            style={{
                                position: 'absolute', bottom: 4, right: 4,
                                width: 28, height: 28, borderRadius: 14,
                                backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center',
                                borderWidth: 3, borderColor: isDark ? colors.bg.card : '#fff',
                            }}
                        >
                            <BadgeCheck size={16} color="#fff" />
                        </View>
                    )}
                </View>
            </View>

            {/* Name + Follow */}
            <View style={{ paddingHorizontal: 32, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            {artist.name}
                        </Text>
                        <Text style={{ fontSize: 15, color: colors.text.secondary, marginTop: 2 }}>
                            {formatFollowers(artist.followers)} Followers
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="button"
                        onPress={handleToggleFollow}
                        style={{
                            backgroundColor: following ? (isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9') : (isDark ? '#fff' : '#1e293b'),
                            borderRadius: 16,
                            paddingHorizontal: 24,
                            paddingVertical: 10,
                        }}
                    >
                        <Text style={{ color: following ? colors.text.primary : (isDark ? '#000' : '#fff'), fontWeight: '700', fontSize: 14 }}>
                            {following ? 'Following' : 'Follow'}
                        </Text>
                    </AnimatedPressable>
                </View>
            </View>

            {/* Stats */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 20, marginBottom: 20 }}>
                <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        {artist.totalSongs}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        Songs Released
                    </Text>
                </GlassCard>
                <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        {artist.totalNFTsSold}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        NFTs Sold
                    </Text>
                </GlassCard>
                <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        {artist.totalEarnings} POL
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        Trading Volume
                    </Text>
                </GlassCard>
            </View>

            {/* NFT Activity (mv_nft_collection_stats) */}
            {(nftActivityLoading || nftActivity) && (
                <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <BarChart2 size={16} color="#8b5cf6" />
                        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                            NFT Activity
                        </Text>
                    </View>

                    {nftActivityLoading ? (
                        <GlassCard style={{ alignItems: 'center', paddingVertical: 20 }}>
                            <ActivityIndicator size="small" color="#8b5cf6" />
                        </GlassCard>
                    ) : nftActivity ? (
                        <GlassCard style={{ marginBottom: 16 }}>
                            {/* Total volume */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <TrendingUp size={14} color="#38b4ba" />
                                    <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Lifetime Volume</Text>
                                </View>
                                <Text style={{ color: '#38b4ba', fontSize: 14, fontWeight: '800' }}>
                                    {formatWeiAsPol(nftActivity.totalVolumeWei)} POL
                                </Text>
                            </View>

                            {/* Volume breakdown */}
                            {nftActivity.mu6PrimaryVolumeWei > BigInt(0) && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingLeft: 8 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>MU6 Primary</Text>
                                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                                        {formatWeiAsPol(nftActivity.mu6PrimaryVolumeWei)} POL
                                    </Text>
                                </View>
                            )}
                            {nftActivity.mu6SecondaryVolumeWei > BigInt(0) && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingLeft: 8 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>MU6 Secondary</Text>
                                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                                        {formatWeiAsPol(nftActivity.mu6SecondaryVolumeWei)} POL
                                    </Text>
                                </View>
                            )}
                            {nftActivity.openseaVolumeWei > BigInt(0) && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingLeft: 8 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>OpenSea</Text>
                                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                                        {formatWeiAsPol(nftActivity.openseaVolumeWei)} POL
                                    </Text>
                                </View>
                            )}

                            {/* Divider */}
                            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', marginVertical: 10 }} />

                            {/* Unique holders */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Users size={14} color={colors.text.secondary} />
                                    <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Unique Holders</Text>
                                </View>
                                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                                    {nftActivity.uniqueHolders}
                                </Text>
                            </View>

                            {/* Total sales */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Total Sales</Text>
                                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                                    {nftActivity.totalSales}
                                </Text>
                            </View>
                        </GlassCard>
                    ) : null}
                </View>
            )}

            {/* Songs */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                    Songs
                </Text>
            </View>
            {loadingSongs ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16, marginBottom: 32 }}>
                    {artistSongs.length > 0 ? (
                        artistSongs.map((song, idx) => (
                            <SongCard
                                key={song.id}
                                cover={song.coverImage}
                                title={song.title}
                                artist={song.artistName}
                                isNFT={song.isNFT}
                                price={song.price}
                                song={song}
                                onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } })}
                                onPlay={() => playSong(song, { songs: artistSongs, startIndex: idx })}
                            />
                        ))
                    ) : (
                        <View style={{ padding: 20 }}>
                            <Text style={{ color: colors.text.secondary }}>No songs published yet</Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </ScreenScaffold>
    );
}
