import React from 'react';
import { View, Text, FlatList, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import NFTCard from '../../src/components/shared/NFTCard';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useTheme } from '../../src/context/ThemeContext';
import { useNFTReleases } from '../../src/hooks/useData';
import type { NFT } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AllNFTsScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { data: nftDrops, loading } = useNFTReleases();

    const renderNFT = ({ item }: { item: NFT }) => (
        <View style={{ width: isWeb ? 220 : '50%', paddingHorizontal: 8, marginBottom: 16 }}>
            <NFTCard
                cover={item.coverImage}
                title={item.songTitle}
                artist={item.artistName}
                price={item.price}
                editionNumber={item.editionNumber}
                totalEditions={item.totalEditions}
                rarity={item.rarity}
                onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } })}
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
                    New NFT Drops
                </Text>
            </View>

            {loading ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            ) : (
                <FlatList
                    data={nftDrops}
                    renderItem={renderNFT}
                    keyExtractor={(item) => item.id}
                    numColumns={isWeb ? undefined : 2}
                    contentContainerStyle={isWeb
                        ? { paddingHorizontal: 8, paddingBottom: 120, flexDirection: 'row', flexWrap: 'wrap' }
                        : { paddingHorizontal: 8, paddingBottom: 120 }
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}
