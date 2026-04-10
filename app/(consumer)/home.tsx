import React from 'react';
import { View, Text, Animated, Platform, useWindowDimensions, ScrollView, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import SongCard from '../../src/components/shared/SongCard';
import NFTCard from '../../src/components/shared/NFTCard';
import CreatorCard from '../../src/components/shared/ArtistCard';
import { useTheme } from '../../src/context/ThemeContext';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { usePlayer } from '../../src/context/PlayerContext';
import { useTrendingSongs, useNewReleases, useArtists, useNFTReleases } from '../../src/hooks/useData';
import ErrorState from '../../src/components/shared/ErrorState';

const isWeb = Platform.OS === 'web';

/* ─── Quick Play Card (YT Music Style) ─── */
function QuickPlayCard({ cover, title, artist, onPress }: { cover: string; title: string; artist: string; onPress?: () => void }) {
    const { isDark, colors } = useTheme();

    return (
        <AnimatedPressable
            preset="row"
            onPress={onPress}
            style={{
                marginBottom: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'transparent',
                borderRadius: 6,
                paddingRight: 12,
                width: '100%',
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Image source={{ uri: cover }} style={{ width: 56, height: 56, borderRadius: 4, backgroundColor: isDark ? '#1e293b' : '#cbd5e1' }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
                    <Text
                        style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700', marginBottom: 2 }}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                        {artist}
                    </Text>
                </View>
            </View>
        </AnimatedPressable>
    );
}

/* ─── Section Header ─── */
function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
    const { isDark, colors } = useTheme();
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 8 }}>
            <Text style={{ fontSize: isWeb ? 26 : 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                {title}
            </Text>
            {onViewAll && (
                <AnimatedPressable
                    preset="icon"
                    onPress={onViewAll}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                    }}
                >
                    <Text style={{ color: colors.accent.cyan, fontWeight: '600', fontSize: 13 }}>View All</Text>
                    {isWeb && <ChevronRight size={14} color={colors.accent.cyan} style={{ marginLeft: 2 }} />}
                </AnimatedPressable>
            )}
        </View>
    );
}

/* ─── Inline Loader ─── */
function SectionLoader() {
    return (
        <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#38b4ba" />
        </View>
    );
}

/* ─── Inline Error ─── */
function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { colors } = useTheme();
    return (
        <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>{message}</Text>
            <AnimatedPressable preset="button" onPress={onRetry} style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(56,180,186,0.12)' }}>
                <Text style={{ color: '#38b4ba', fontSize: 13, fontWeight: '600' }}>Retry</Text>
            </AnimatedPressable>
        </View>
    );
}

/* ─── Section Empty ─── */
function SectionEmpty({ message }: { message: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: colors.text.muted, fontSize: 13 }}>{message}</Text>
        </View>
    );
}

/* ─── Main Screen ─── */
export default function HomeScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const { playSong } = usePlayer();

    // Real data hooks
    const { data: trendingSongs, loading: loadingTrending, error: errorTrending, refresh: refreshTrending } = useTrendingSongs(16);
    const { data: newReleases, loading: loadingNew, error: errorNew, refresh: refreshNew } = useNewReleases(6);
    const { data: artists, loading: loadingArtists, error: errorArtists, refresh: refreshArtists } = useArtists(10);
    const { data: nftDrops, loading: loadingNFTs, error: errorNFTs, refresh: refreshNFTs } = useNFTReleases();

    // Quick play chunks
    const quickPlaySongs = trendingSongs.slice(0, 16);
    const quickPlayChunks: typeof quickPlaySongs[] = [];
    for (let i = 0; i < quickPlaySongs.length; i += 4) {
        quickPlayChunks.push(quickPlaySongs.slice(i, i + 4));
    }

    const hPad = isWeb ? 40 : 16;

    return (
        <ScreenScaffold
            dominantColor="#38b4ba"
            contentContainerStyle={{ paddingBottom: 100 }}
        >
            <View style={[
                isWeb ? { maxWidth: 1400, width: '100%', alignSelf: 'center' } : { flex: 1 }
            ]}>

                <View style={{
                    marginTop: isWeb ? 20 : 16,
                    marginBottom: isWeb ? 30 : 24,
                    paddingHorizontal: hPad
                }}>
                    {/* ─── Quick Picks ─── */}
                    <View style={{ paddingHorizontal: hPad, marginTop: isWeb ? 40 : 20 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                            Start Radio From a Song
                        </Text>
                        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text.primary, letterSpacing: -1, marginBottom: 24 }}>
                            Quick Picks
                        </Text>

                        {loadingTrending ? <SectionLoader /> : errorTrending ? (
                            <SectionError message="Could not load songs" onRetry={refreshTrending} />
                        ) : quickPlayChunks.length === 0 ? (
                            <SectionEmpty message="No songs available yet" />
                        ) : (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                pagingEnabled={!isWeb}
                                snapToInterval={isWeb ? undefined : width - 32}
                                decelerationRate="fast"
                                contentContainerStyle={{ paddingRight: hPad }}
                                style={{ marginHorizontal: -hPad, paddingHorizontal: hPad }}
                            >
                                {quickPlayChunks.map((chunk, idx) => (
                                    <View key={idx} style={{ width: isWeb ? 340 : width - 40, marginRight: 16 }}>
                                        {chunk.map((song) => (
                                            <QuickPlayCard
                                                key={song.id}
                                                cover={song.coverImage}
                                                title={song.title}
                                                artist={song.artistName}
                                                onPress={() => playSong(song)}
                                            />
                                        ))}
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>

                    {/* ─── Jump Back In (New Releases) ─── */}
                    <View style={{ paddingHorizontal: hPad, marginBottom: 40 }}>
                        <SectionHeader title="Jump Back In" onViewAll={() => router.push({ pathname: '/(consumer)/all-songs', params: { section: 'new' } })} />
                        {loadingNew ? <SectionLoader /> : errorNew ? (
                            <SectionError message="Could not load new releases" onRetry={refreshNew} />
                        ) : newReleases.length === 0 ? (
                            <SectionEmpty message="No new releases yet" />
                        ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -hPad, paddingHorizontal: hPad }}>
                                {newReleases.map((song) => (
                                    <SongCard
                                        key={song.id}
                                        cover={song.coverImage}
                                        title={song.title}
                                        artist={song.artistName}
                                        isNFT={song.isNFT}
                                        price={song.price}
                                        onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } })}
                                        onPlay={() => playSong(song)}
                                    />
                                ))}
                            </ScrollView>
                        )}
                    </View>

                    {/* ─── Made For You (more trending) ─── */}
                    <View style={{ paddingHorizontal: hPad }}>
                        <SectionHeader title="Made For You" onViewAll={() => router.push({ pathname: '/(consumer)/all-songs', params: { section: 'trending' } })} />
                    </View>
                    {loadingTrending ? <SectionLoader /> : errorTrending ? (
                        <SectionError message="Could not load songs" onRetry={refreshTrending} />
                    ) : trendingSongs.length <= 6 ? (
                        <SectionEmpty message="More songs coming soon" />
                    ) : (
                        <Animated.ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: hPad }}
                            style={{ marginBottom: 40 }}
                        >
                            {trendingSongs.slice(6, 12).map((song) => (
                                <SongCard
                                    key={song.id}
                                    cover={song.coverImage}
                                    title={song.title}
                                    artist={song.artistName}
                                    isNFT={song.isNFT}
                                    price={song.price}
                                    onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } })}
                                />
                            ))}
                        </Animated.ScrollView>
                    )}

                    {/* ─── Top Creators ─── */}
                    <View style={{ paddingHorizontal: hPad }}>
                        <SectionHeader title="Top Creators" onViewAll={() => router.push('/(consumer)/all-creators')} />
                    </View>
                    {loadingArtists ? <SectionLoader /> : errorArtists ? (
                        <SectionError message="Could not load creators" onRetry={refreshArtists} />
                    ) : artists.length === 0 ? (
                        <SectionEmpty message="No creators yet" />
                    ) : (
                        <Animated.ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: hPad }}
                            style={{ marginBottom: 40 }}
                        >
                            {artists.map((artist) => (
                                <CreatorCard
                                    key={artist.id}
                                    avatar={artist.avatar}
                                    name={artist.name}
                                    followers={artist.followers}
                                    verified={artist.verified}
                                    onPress={() => router.push({ pathname: '/(consumer)/artist-profile', params: { id: artist.id } })}
                                />
                            ))}
                        </Animated.ScrollView>
                    )}

                    {/* ─── NFT Drops ─── */}
                    <View style={{ paddingHorizontal: hPad }}>
                        <SectionHeader title="New NFT Drops" onViewAll={() => router.push('/(consumer)/all-nfts')} />
                    </View>
                    {loadingNFTs ? <SectionLoader /> : errorNFTs ? (
                        <SectionError message="Could not load NFT drops" onRetry={refreshNFTs} />
                    ) : nftDrops.length === 0 ? (
                        <SectionEmpty message="No NFT drops yet" />
                    ) : (
                        <Animated.ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: hPad }}
                            style={{ marginBottom: 20 }}
                        >
                            {nftDrops.slice(0, 6).map((nft) => (
                                <View key={nft.id} style={{ width: isWeb ? 220 : 176, marginRight: 16 }}>
                                    <NFTCard
                                        cover={nft.coverImage}
                                        title={nft.songTitle}
                                        artist={nft.artistName}
                                        price={nft.price}
                                        editionNumber={nft.editionNumber}
                                        totalEditions={nft.totalEditions}
                                        rarity={nft.rarity}
                                        onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: nft.id } })}
                                    />
                                </View>
                            ))}
                        </Animated.ScrollView>
                    )}

                </View>
            </View>
        </ScreenScaffold>
    );
}
