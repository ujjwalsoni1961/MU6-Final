import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gem } from 'lucide-react-native';
import NFTCard from '../../src/components/shared/NFTCard';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { useNFTReleases } from '../../src/hooks/useData';
import ErrorState from '../../src/components/shared/ErrorState';
import EmptyState from '../../src/components/shared/EmptyState';
import type { NFT } from '../../src/types';

export default function AllNFTsScreen() {
    const router = useRouter();
    const { isDesktopLayout } = useResponsive();
    const { isDark, colors } = useTheme();
    const { fiatCurrency } = useCurrency();
    const { data: nftDrops, loading, error, refresh } = useNFTReleases();

    const renderNFT = ({ item }: { item: NFT }) => (
        <View style={{ width: isDesktopLayout ? 220 : '50%', paddingHorizontal: 8, marginBottom: 16 }}>
            <NFTCard
                cover={item.coverImage}
                title={item.songTitle}
                artist={item.artistName}
                price={item.price}
                editionNumber={item.editionNumber}
                mintedCount={item.mintedCount}
                totalEditions={item.totalEditions}
                rarity={item.rarity}
                fiatCurrency={fiatCurrency}
                onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } })}
            />
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
            <View style={{
                paddingTop: isDesktopLayout ? 24 : 56,
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
            ) : error ? (
                <ErrorState message={error} onRetry={refresh} />
            ) : (
                <FlatList
                    data={nftDrops}
                    renderItem={renderNFT}
                    keyExtractor={(item) => item.id}
                    numColumns={isDesktopLayout ? undefined : 2}
                    contentContainerStyle={isDesktopLayout
                        ? { paddingHorizontal: 8, paddingBottom: 120, flexDirection: 'row', flexWrap: 'wrap' }
                        : { paddingHorizontal: 8, paddingBottom: 120 }
                    }
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState
                            icon={<Gem size={40} color="#38b4ba" />}
                            title="No NFT drops yet"
                            subtitle="New collectibles will appear here"
                        />
                    }
                />
            )}
        </View>
    );
}
