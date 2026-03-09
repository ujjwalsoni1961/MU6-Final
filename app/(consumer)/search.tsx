import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import SearchInput from '../../src/components/shared/SearchInput';
import SongRow from '../../src/components/shared/SongRow';
import GenreTag from '../../src/components/shared/GenreTag';
import { Song } from '../../src/types';
import { useSongs } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';
const genres = ['Electronic', 'Hip-Hop', 'Ambient', 'Synthwave', 'Pop', 'Dubstep', 'Rock', 'Lo-fi', 'R&B'];

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

    const { data: results, loading } = useSongs(
        debouncedQuery.length > 0 ? { search: debouncedQuery, limit: 30 } : undefined,
    );

    const filtered = debouncedQuery.length > 0 ? results : [];

    const renderSong = ({ item }: { item: Song }) => (
        <SongRow
            cover={item.coverImage}
            title={item.title}
            artist={item.artistName}
            plays={item.plays}
            likes={item.likes}
            isNFT={item.isNFT}
            onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: item.id } })}
        />
    );

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <View style={{ maxWidth: isWeb ? 800 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <View style={{ paddingHorizontal: isWeb ? 32 : 16, paddingTop: 16 }}>
                    <SearchInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search songs, creators..."
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
                ) : filtered.length > 0 ? (
                    <FlatList
                        data={filtered}
                        renderItem={renderSong}
                        keyExtractor={(item) => item.id}
                        style={{ paddingHorizontal: isWeb ? 32 : 16, marginTop: 16 }}
                        showsVerticalScrollIndicator={false}
                    />
                ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No songs found</Text>
                    </View>
                )}
            </View>
        </Container>
    );
}
