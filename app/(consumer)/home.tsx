import React from 'react';
import { View, Text, Animated, Platform, useWindowDimensions, ScrollView } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import { songs } from '../../src/mock/songs';
import { nfts } from '../../src/mock/nfts';
import { artists } from '../../src/mock/artists';
import SongCard from '../../src/components/shared/SongCard';
import NFTCard from '../../src/components/shared/NFTCard';
import ArtistCard from '../../src/components/shared/ArtistCard';
import { useTheme } from '../../src/context/ThemeContext';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { usePlayer } from '../../src/context/PlayerContext';

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

/* ─── Main Screen ─── */
export default function HomeScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const { playSong } = usePlayer();

    // Data Slices
    const quickPlaySongs = songs.slice(0, 16);
    const quickPlayChunks = [];
    for (let i = 0; i < quickPlaySongs.length; i += 4) {
        quickPlayChunks.push(quickPlaySongs.slice(i, i + 4));
    }
    const recentSongs = songs.slice(0, 6);
    const nftDrops = nfts.slice(0, 6);

    const hPad = isWeb ? 40 : 16;

    // Use ScreenScaffold for the layout
    return (
        <ScreenScaffold
            dominantColor="#38b4ba" // Cyan primary for Home
            contentContainerStyle={{ paddingBottom: 100 }}
        >
            <View style={[
                isWeb ? { maxWidth: 1400, width: '100%', alignSelf: 'center' } : { flex: 1 }
            ]}>

                {/* Header Greeting & Content */}
                {/* On Web, scaffold adds padding top. On mobile, we might need a bit of margin if we want it lower. */}
                <View style={{
                    marginTop: isWeb ? 20 : 16,
                    marginBottom: isWeb ? 30 : 24,
                    paddingHorizontal: hPad
                }}>
                    {/* ─── Greeting Section (Quick Picks) ─── */}
                    <View style={{ paddingHorizontal: hPad, marginTop: isWeb ? 40 : 20 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                            Start Radio From a Song
                        </Text>
                        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text.primary, letterSpacing: -1, marginBottom: 24 }}>
                            Quick Picks
                        </Text>

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
                    </View>

                    {/* ─── Recent Section ─── */}
                    <View style={{ paddingHorizontal: hPad, marginBottom: 40 }}>
                        <SectionHeader title="Jump Back In" onViewAll={() => { }} />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -hPad, paddingHorizontal: hPad }}>
                            {recentSongs.map((song) => (
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
                    </View>
                    {/* ─── Made For You ─── */}
                    <View style={{ paddingHorizontal: hPad }}>
                        <SectionHeader title="Made For You" onViewAll={() => { }} />
                    </View>
                    <Animated.ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: hPad }}
                        style={{ marginBottom: 40 }}
                    >
                        {songs.slice(6, 12).map((song) => (
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

                    {/* ─── Top Artists ─── */}
                    <View style={{ paddingHorizontal: hPad }}>
                        <SectionHeader title="Your Top Artists" onViewAll={() => { }} />
                    </View>
                    <Animated.ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: hPad }}
                        style={{ marginBottom: 40 }}
                    >
                        {artists.map((artist) => (
                            <ArtistCard
                                key={artist.id}
                                avatar={artist.avatar}
                                name={artist.name}
                                followers={artist.followers}
                                verified={artist.verified}
                                onPress={() => router.push({ pathname: '/(consumer)/artist-profile', params: { id: artist.id } })}
                            />
                        ))}
                    </Animated.ScrollView>

                    {/* ─── NFT Drops ─── */}
                    <View style={{ paddingHorizontal: hPad }}>
                        <SectionHeader title="New NFT Drops" onViewAll={() => { }} />
                    </View>
                    <Animated.ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: hPad }}
                        style={{ marginBottom: 20 }}
                    >
                        {nftDrops.map((nft) => (
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

                </View>
            </View>
        </ScreenScaffold>
    );
}
