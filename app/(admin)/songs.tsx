import React from 'react';
import { View, Text, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SongRow from '../../src/components/shared/SongRow';
import { songs } from '../../src/mock/songs';
import { Song } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AdminSongsScreen() {
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <View style={{ padding: isWeb ? 32 : 16 }}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1, marginBottom: 16 }}>Songs</Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>{songs.length} songs on platform</Text>
            </View>
            <FlatList
                data={songs}
                renderItem={({ item }: { item: Song }) => (
                    <SongRow
                        cover={item.coverImage}
                        title={item.title}
                        artist={item.artistName}
                        plays={item.plays}
                        likes={item.likes}
                        isNFT={item.isNFT}
                    />
                )}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16 }}
                showsVerticalScrollIndicator={false}
            />
        </Container>
    );
}
