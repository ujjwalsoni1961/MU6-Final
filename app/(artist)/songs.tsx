import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Plus, MoreHorizontal, Play } from 'lucide-react-native';
import { songs } from '../../src/mock/songs';

const isWeb = Platform.OS === 'web';

/* ─── Song Table Row ─── */
function SongTableRow({ index, song }: { index: number; song: typeof songs[0] }) {
    const revenue = (song.price * (song.editionsSold || 0)).toFixed(2);
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: isWeb ? 20 : 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f8fafc',
            }}
        >
            {/* # / Play */}
            <View style={{ width: 36, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#94a3b8' }}>{index + 1}</Text>
            </View>

            {/* Cover + Title */}
            <Image source={{ uri: song.coverImage }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }} numberOfLines={1}>{song.title}</Text>
                <Text style={{ fontSize: 12, color: '#64748b' }}>{song.genre}</Text>
            </View>

            {/* Plays */}
            <Text style={{ width: isWeb ? 100 : 70, fontSize: 13, color: '#475569', textAlign: 'right' }}>
                {song.plays.toLocaleString()}
            </Text>

            {/* NFT Status */}
            {isWeb && (
                <View style={{ width: 100, alignItems: 'center' }}>
                    {song.isNFT ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#38b4ba', marginRight: 6 }} />
                            <Text style={{ fontSize: 12, color: '#38b4ba', fontWeight: '600' }}>Minted</Text>
                        </View>
                    ) : (
                        <Text style={{ fontSize: 12, color: '#94a3b8' }}>—</Text>
                    )}
                </View>
            )}

            {/* Revenue */}
            <Text style={{ width: isWeb ? 100 : 70, fontSize: 14, fontWeight: '700', color: '#38b4ba', textAlign: 'right' }}>
                ${revenue}
            </Text>

            {/* More */}
            {isWeb && (
                <AnimatedPressable preset="icon" hapticType="none" style={{ marginLeft: 12, padding: 4 }}>
                    <MoreHorizontal size={16} color="#94a3b8" />
                </AnimatedPressable>
            )}
        </AnimatedPressable>
    );
}

export default function ArtistSongsScreen() {
    const router = useRouter();
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <View>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1 }}>
                            My Songs
                        </Text>
                        <Text style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>
                            {songs.length} songs uploaded
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="button"
                        onPress={() => router.push('/(artist)/upload')}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor: '#38b4ba',
                            shadowColor: '#38b4ba',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.25,
                            shadowRadius: 12,
                            elevation: 4,
                        }}
                    >
                        <Plus size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6 }}>Upload New</Text>
                    </AnimatedPressable>
                </View>

                {/* Table Header */}
                {isWeb && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                        <Text style={{ width: 36, fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>#</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 52 }}>TITLE</Text>
                        <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>PLAYS</Text>
                        <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>NFT</Text>
                        <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>REVENUE</Text>
                        <View style={{ width: 28 }} />
                    </View>
                )}

                {/* Songs */}
                <View
                    style={{
                        borderRadius: isWeb ? 0 : 16,
                        backgroundColor: isWeb ? 'transparent' : 'rgba(255,255,255,0.3)',
                        overflow: 'hidden',
                    }}
                >
                    {songs.map((song, i) => (
                        <SongTableRow key={song.id} index={i} song={song} />
                    ))}
                </View>
            </ScrollView>
        </Container>
    );
}
