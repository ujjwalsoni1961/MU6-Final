import React from 'react';
import { View, Text, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SongRow from '../../src/components/shared/SongRow';
import { useAdminSongs } from '../../src/hooks/useData';
import LoadingState from '../../src/components/shared/LoadingState';
import { useTheme } from '../../src/context/ThemeContext';
import { Song } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AdminSongsScreen() {
    const { isDark, colors } = useTheme();
    const { data: songs, loading, error, refresh } = useAdminSongs();
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <View style={{ padding: isWeb ? 32 : 16 }}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1, marginBottom: 4 }}>
                    Songs
                </Text>
                {!loading && (
                    <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 8 }}>
                        {songs.length} {songs.length === 1 ? 'song' : 'songs'} on platform
                    </Text>
                )}
            </View>
            <LoadingState loading={loading} error={error} onRetry={refresh}>
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
                    contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                />
            </LoadingState>
        </Container>
    );
}
