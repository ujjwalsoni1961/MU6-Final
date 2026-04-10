import React from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Plus, MoreHorizontal, Pencil } from 'lucide-react-native';
import { useCreatorSongs } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { Song } from '../../src/types';

const isWeb = Platform.OS === 'web';

/* ─── Song Table Row ─── */
function SongTableRow({ index, song, onPress }: { index: number; song: Song; onPress?: () => void }) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            onPress={onPress}
            style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 14, paddingHorizontal: isWeb ? 20 : 12,
                borderBottomWidth: 1,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
            }}
        >
            <View style={{ width: 36, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text.muted }}>{index + 1}</Text>
            </View>
            <Image source={{ uri: song.coverImage }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>{song.title}</Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary }}>{song.genre}</Text>
            </View>
            <Text style={{ width: isWeb ? 100 : 70, fontSize: 13, color: colors.text.secondary, textAlign: 'right' }}>
                {song.plays.toLocaleString()}
            </Text>
            {isWeb && (
                <View style={{ width: 100, alignItems: 'center' }}>
                    {song.isNFT ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#38b4ba', marginRight: 6 }} />
                            <Text style={{ fontSize: 12, color: '#38b4ba', fontWeight: '600' }}>Minted</Text>
                        </View>
                    ) : (
                        <Text style={{ fontSize: 12, color: colors.text.muted }}>—</Text>
                    )}
                </View>
            )}
            {isWeb && (
                <AnimatedPressable preset="icon" hapticType="none" onPress={onPress} style={{ marginLeft: 12, padding: 4 }}>
                    <Pencil size={14} color={colors.text.muted} />
                </AnimatedPressable>
            )}
        </AnimatedPressable>
    );
}

export default function CreatorSongsScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { data: creatorSongs, loading } = useCreatorSongs();
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <View>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            My Songs
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 2 }}>
                            {creatorSongs.length} songs uploaded
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="button"
                        onPress={() => router.push('/(artist)/upload')}
                        style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                            backgroundColor: '#38b4ba',
                            shadowColor: '#38b4ba', shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
                        }}
                    >
                        <Plus size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6 }}>Upload New</Text>
                    </AnimatedPressable>
                </View>

                {/* Table Header */}
                {isWeb && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                        <Text style={{ width: 36, fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>#</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginLeft: 52 }}>TITLE</Text>
                        <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>PLAYS</Text>
                        <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>NFT</Text>
                        <View style={{ width: 28 }} />
                    </View>
                )}

                {/* Songs */}
                {loading ? (
                    <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : creatorSongs.length > 0 ? (
                    <View style={{
                        borderRadius: isWeb ? 0 : 16,
                        backgroundColor: isWeb ? 'transparent' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)'),
                        overflow: 'hidden',
                    }}>
                        {creatorSongs.map((song, i) => (
                            <SongTableRow
                                key={song.id}
                                index={i}
                                song={song}
                                onPress={() => router.push({ pathname: '/(artist)/edit-song', params: { id: song.id } } as any)}
                            />
                        ))}
                    </View>
                ) : (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No songs uploaded yet</Text>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}
