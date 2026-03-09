import React from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gem, Plus } from 'lucide-react-native';
import NFTCard from '../../src/components/shared/NFTCard';
import { NFT } from '../../src/types';
import { useCreatorNFTs } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function NFTManagerScreen() {
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const { data: creatorNFTs, loading } = useCreatorNFTs();
    const numCols = isWeb ? (width > 1000 ? 3 : 2) : 2;
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <View style={{ padding: isWeb ? 32 : 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <View>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            NFT Manager
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 2 }}>
                            {creatorNFTs.length} NFT releases
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="button"
                        style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
                            backgroundColor: '#8b5cf6',
                            shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
                        }}
                    >
                        <Plus size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Create NFT</Text>
                    </AnimatedPressable>
                </View>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#8b5cf6" />
                </View>
            ) : creatorNFTs.length > 0 ? (
                <FlatList
                    data={creatorNFTs}
                    renderItem={({ item }: { item: NFT }) => (
                        <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
                            <NFTCard
                                cover={item.coverImage}
                                title={item.songTitle}
                                artist={item.artistName}
                                price={item.price}
                                editionNumber={item.editionNumber}
                                totalEditions={item.totalEditions}
                                rarity={item.rarity}
                            />
                        </View>
                    )}
                    keyExtractor={(item) => item.id}
                    numColumns={numCols}
                    key={`grid-${numCols}`}
                    contentContainerStyle={{ paddingHorizontal: isWeb ? 26 : 10 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={() => (
                        <View style={{ alignItems: 'center', paddingTop: 60 }}>
                            <Gem size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                            <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No NFT releases yet</Text>
                        </View>
                    )}
                />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Gem size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                    <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No NFT releases yet</Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 4 }}>Create your first music NFT</Text>
                </View>
            )}
        </Container>
    );
}
