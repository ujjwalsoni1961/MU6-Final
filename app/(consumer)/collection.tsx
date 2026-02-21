import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Gem } from 'lucide-react-native';
import TabPill from '../../src/components/shared/TabPill';
import NFTCard from '../../src/components/shared/NFTCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { nfts } from '../../src/mock/nfts';
import { NFT } from '../../src/types';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';
const filters = ['All', 'Legendary', 'Rare', 'Common'];

export default function CollectionScreen() {
    const [activeFilter, setActiveFilter] = useState('All');
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;

    const ownedNFTs = nfts;

    const filteredNFTs = ownedNFTs.filter((nft) => {
        if (activeFilter === 'All') return true;
        return nft.rarity === activeFilter.toLowerCase();
    });

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    const renderHeader = () => (
        <View>
            {/* Header Text */}
            <View style={{ paddingHorizontal: isWeb ? 32 : 16 }}>
                {!isWeb && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                        My Collection
                    </Text>
                )}
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 4, marginBottom: 16 }}>
                    {ownedNFTs.length} NFTs collected
                </Text>
            </View>

            {/* Stats Row */}
            <View style={{ flexDirection: 'row', paddingHorizontal: isWeb ? 32 : 16, gap: 12, marginBottom: 20 }}>
                <View style={{
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Total Value
                    </Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
                        {ownedNFTs.reduce((sum, n) => sum + n.price, 0).toFixed(2)} ETH
                    </Text>
                </View>
                <View style={{
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Rarest
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                        <Gem size={16} color="#f59e0b" />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#f59e0b' }}>
                            {ownedNFTs.filter(n => n.rarity === 'legendary').length} Legendary
                        </Text>
                    </View>
                </View>
            </View>

            {/* Filter Pills */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16, flexGrow: 0 }}
                contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16, paddingVertical: 4 }}
            >
                {filters.map((filter) => (
                    <TabPill key={filter} label={filter} active={activeFilter === filter} onPress={() => setActiveFilter(filter)} />
                ))}
            </ScrollView>
        </View>
    );

    return (
        <ScreenScaffold dominantColor="#f59e0b" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <FlatList
                    data={filteredNFTs}
                    ListHeaderComponent={renderHeader}
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
                                onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } })}
                            />
                        </View>
                    )}
                    keyExtractor={(item) => item.id}
                    numColumns={numCols}
                    key={`grid-${numCols}`}
                    contentContainerStyle={{
                        paddingHorizontal: isWeb ? 26 : 10,
                        paddingTop: isWeb ? 80 : insets.top + 44,
                        paddingBottom: 100,
                    }}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    ListEmptyComponent={() => (
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                            <Gem size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                            <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>
                                No {activeFilter.toLowerCase()} NFTs found
                            </Text>
                        </View>
                    )}
                />
            </View>
        </ScreenScaffold>
    );
}
