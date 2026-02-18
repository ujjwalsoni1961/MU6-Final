import React, { useState } from 'react';
import { View, Text, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import SearchInput from '../../src/components/shared/SearchInput';
import SongRow from '../../src/components/shared/SongRow';
import GenreTag from '../../src/components/shared/GenreTag';
import { songs } from '../../src/mock/songs';
import { Song } from '../../src/types';

const isWeb = Platform.OS === 'web';
const genres = ['Electronic', 'Hip-Hop', 'Ambient', 'Synthwave', 'Pop', 'Dubstep', 'Rock', 'Lo-fi', 'R&B'];

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const router = useRouter();

    const filtered = query.length > 0
        ? songs.filter(
            (s) =>
                s.title.toLowerCase().includes(query.toLowerCase()) ||
                s.artistName.toLowerCase().includes(query.toLowerCase())
        )
        : [];

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
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <View style={{ maxWidth: isWeb ? 800 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
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
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 16, letterSpacing: -0.5 }}>
                            Browse Categories
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {genres.map((genre) => (
                                <GenreTag key={genre} genre={genre} onPress={() => setQuery(genre)} />
                            ))}
                        </View>
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
                        <Text style={{ color: '#64748b', fontSize: 16 }}>No songs found</Text>
                    </View>
                )}
            </View>
        </Container>
    );
}
