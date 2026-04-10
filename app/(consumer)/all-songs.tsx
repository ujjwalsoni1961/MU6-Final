import React from 'react';
import { View, Text, FlatList, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Music } from 'lucide-react-native';
import SongRow from '../../src/components/shared/SongRow';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useTheme } from '../../src/context/ThemeContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { useTrendingSongs, useNewReleases } from '../../src/hooks/useData';
import ErrorState from '../../src/components/shared/ErrorState';
import EmptyState from '../../src/components/shared/EmptyState';
import type { Song } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AllSongsScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { playSong } = usePlayer();
    const params = useLocalSearchParams<{ section?: string }>();
    const section = params.section || 'new';

    const { data: newReleases, loading: loadingNew, error: errorNew, refresh: refreshNew } = useNewReleases(50);
    const { data: trending, loading: loadingTrending, error: errorTrending, refresh: refreshTrending } = useTrendingSongs(50);

    const isNew = section === 'new';
    const songs = isNew ? newReleases : trending;
    const loading = isNew ? loadingNew : loadingTrending;
    const error = isNew ? errorNew : errorTrending;
    const refresh = isNew ? refreshNew : refreshTrending;
    const title = isNew ? 'New Releases' : 'Made For You';

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

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
            <View style={{
                paddingTop: isWeb ? 24 : 56,
                paddingHorizontal: 16,
                paddingBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
            }}>
                <AnimatedPressable preset="icon" onPress={() => router.back()} style={{ marginRight: 12 }}>
                    <ArrowLeft size={24} color={colors.text.primary} />
                </AnimatedPressable>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                    {title}
                </Text>
            </View>

            {loading ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            ) : error ? (
                <ErrorState message={error} onRetry={refresh} />
            ) : (
                <FlatList
                    data={songs}
                    renderItem={renderSong}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState
                            icon={<Music size={40} color="#38b4ba" />}
                            title={isNew ? 'No new releases yet' : 'No songs found'}
                            subtitle="Check back soon for fresh tracks"
                        />
                    }
                />
            )}
        </View>
    );
}
