import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BadgeCheck, Music } from 'lucide-react-native';
import SearchInput from '../../src/components/shared/SearchInput';
import SongRow from '../../src/components/shared/SongRow';
import GenreTag from '../../src/components/shared/GenreTag';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { Song, Artist } from '../../src/types';
import { useSongs, useSearchArtists } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';
const genres = ['Electronic', 'Hip-Hop', 'Ambient', 'Synthwave', 'Pop', 'Dubstep', 'Rock', 'Lo-fi', 'R&B'];

function ArtistResultRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
    const { colors, isDark } = useTheme();

    return (
        <AnimatedPressable
            preset="row"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 4,
            }}
        >
            <View style={{ position: 'relative' }}>
                <Image
                    source={{ uri: artist.avatar }}
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: isDark ? '#1e293b' : '#cbd5e1',
                    }}
                    contentFit="cover"
                />
                {artist.verified && (
                    <View
                        style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: '#8b5cf6',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 2,
                            borderColor: isDark ? '#030711' : '#f8fafc',
                        }}
                    >
                        <BadgeCheck size={10} color="#fff" />
                    </View>
                )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                    style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}
                    numberOfLines={1}
                >
                    {artist.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Artist</Text>
                    {artist.totalSongs > 0 && (
                        <Text style={{ color: colors.text.muted, fontSize: 12, marginLeft: 8 }}>
                            <Music size={10} color={colors.text.muted} /> {artist.totalSongs} songs
                        </Text>
                    )}
                </View>
            </View>
        </AnimatedPressable>
    );
}

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const router = useRouter();
    const { isDark, colors } = useTheme();

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const activeSearch = debouncedQuery.length > 0 ? debouncedQuery : undefined;

    const { data: songResults, loading: loadingSongs } = useSongs(
        activeSearch ? { search: activeSearch, limit: 30 } : undefined,
    );
    const { data: artistResults, loading: loadingArtists } = useSearchArtists(activeSearch);

    const hasResults = songResults.length > 0 || artistResults.length > 0;
    const loading = loadingSongs || loadingArtists;

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <View style={{ maxWidth: isWeb ? 800 : undefined, width: '100%' as any, alignSelf: 'center' as any, flex: 1 }}>
                <View style={{ paddingHorizontal: isWeb ? 32 : 16, paddingTop: 16 }}>
                    <SearchInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search songs, artists..."
                        autoFocus
                    />
                </View>

                {query.length === 0 ? (
                    <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginTop: 24 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text.primary, marginBottom: 16, letterSpacing: -0.5 }}>
                            Browse Categories
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {genres.map((genre) => (
                                <GenreTag key={genre} genre={genre} onPress={() => setQuery(genre)} />
                            ))}
                        </View>
                    </View>
                ) : loading ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#38b4ba" />
                    </View>
                ) : hasResults ? (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16, paddingTop: 16, paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Artist Results */}
                        {artistResults.length > 0 && (
                            <View style={{ marginBottom: 24 }}>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.secondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Artists
                                </Text>
                                {artistResults.map((artist) => (
                                    <ArtistResultRow
                                        key={artist.id}
                                        artist={artist}
                                        onPress={() => router.push({ pathname: '/(consumer)/artist-profile', params: { id: artist.id } })}
                                    />
                                ))}
                            </View>
                        )}

                        {/* Song Results */}
                        {songResults.length > 0 && (
                            <View>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.secondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Songs
                                </Text>
                                {songResults.map((song) => (
                                    <SongRow
                                        key={song.id}
                                        cover={song.coverImage}
                                        title={song.title}
                                        artist={song.artistName}
                                        plays={song.plays}
                                        likes={song.likes}
                                        isNFT={song.isNFT}
                                        onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } })}
                                    />
                                ))}
                            </View>
                        )}
                    </ScrollView>
                ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No results found</Text>
                    </View>
                )}
            </View>
        </Container>
    );
}
