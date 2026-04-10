import React from 'react';
import { View, Text, FlatList, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Users } from 'lucide-react-native';
import CreatorCard from '../../src/components/shared/ArtistCard';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useTheme } from '../../src/context/ThemeContext';
import { useArtists } from '../../src/hooks/useData';
import ErrorState from '../../src/components/shared/ErrorState';
import EmptyState from '../../src/components/shared/EmptyState';
import type { Artist } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AllCreatorsScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { data: artists, loading, error, refresh } = useArtists(100);

    const renderArtist = ({ item }: { item: Artist }) => (
        <View style={{ width: isWeb ? '25%' : '33.33%', paddingHorizontal: 8, marginBottom: 20, alignItems: 'center' }}>
            <CreatorCard
                avatar={item.avatar}
                name={item.name}
                followers={item.followers}
                verified={item.verified}
                onPress={() => router.push({ pathname: '/(consumer)/artist-profile', params: { id: item.id } })}
            />
        </View>
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
                    Top Creators
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
                    data={artists}
                    renderItem={renderArtist}
                    keyExtractor={(item) => item.id}
                    numColumns={isWeb ? 4 : 3}
                    contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 120 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState
                            icon={<Users size={40} color="#38b4ba" />}
                            title="No creators yet"
                            subtitle="Be the first to join the community"
                        />
                    }
                />
            )}
        </View>
    );
}
