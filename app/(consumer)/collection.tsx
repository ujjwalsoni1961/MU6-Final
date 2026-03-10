import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, FlatList, Platform, useWindowDimensions,
    Animated, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Gem, Tag, X, DollarSign } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import TabPill from '../../src/components/shared/TabPill';
import NFTCard from '../../src/components/shared/NFTCard';
import GlassCard from '../../src/components/shared/GlassCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { NFT } from '../../src/types';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useActiveAccount } from 'thirdweb/react';
import { useOwnedNFTs, useListForSale } from '../../src/hooks/useData';

const isWeb = Platform.OS === 'web';
const filters = ['All', 'Legendary', 'Rare', 'Common'];

export default function CollectionScreen() {
    const [activeFilter, setActiveFilter] = useState('All');
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;
    const { walletAddress } = useAuth();
    const account = useActiveAccount();

    // Real data
    const { data: ownedNFTs, loading, refresh } = useOwnedNFTs();

    // List for sale modal state
    const [listModalVisible, setListModalVisible] = useState(false);
    const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
    const [listPrice, setListPrice] = useState('');
    const listForSaleHook = useListForSale();

    const filteredNFTs = ownedNFTs.filter((nft) => {
        if (activeFilter === 'All') return true;
        return nft.rarity === activeFilter.toLowerCase();
    });

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    // ─── List for Sale handlers ───

    const openListModal = useCallback((nft: NFT) => {
        setSelectedNFT(nft);
        setListPrice(nft.price > 0 ? nft.price.toString() : '');
        listForSaleHook.reset();
        setListModalVisible(true);
    }, []);

    const handleListForSale = useCallback(async () => {
        if (!selectedNFT || !walletAddress) return;

        const price = parseFloat(listPrice);
        if (isNaN(price) || price <= 0) {
            Alert.alert('Invalid Price', 'Please enter a valid price in ETH.');
            return;
        }

        const listingId = await listForSaleHook.execute(
            { nftTokenId: selectedNFT.id, priceEth: price, sellerWallet: walletAddress },
            account || undefined,
        );

        if (listingId) {
            Alert.alert('Listed!', `Your NFT is now listed for ${price} ETH on the marketplace.`, [
                {
                    text: 'View Marketplace',
                    onPress: () => {
                        setListModalVisible(false);
                        router.push('/(consumer)/marketplace');
                    },
                },
                { text: 'OK', onPress: () => setListModalVisible(false) },
            ]);
            refresh();
        }
    }, [selectedNFT, walletAddress, listPrice, account, listForSaleHook.execute, refresh]);

    const renderHeader = () => (
        <View>
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
                    borderRadius: 16, padding: 16,
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
                    borderRadius: 16, padding: 16,
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
                horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16, flexGrow: 0 }}
                contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16, paddingVertical: 4 }}
            >
                {filters.map((filter) => (
                    <TabPill key={filter} label={filter} active={activeFilter === filter} onPress={() => setActiveFilter(filter)} />
                ))}
            </ScrollView>

            {loading && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            )}
        </View>
    );

    return (
        <ScreenScaffold dominantColor="#f59e0b" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <FlatList
                    data={loading ? [] : filteredNFTs}
                    ListHeaderComponent={renderHeader}
                    renderItem={({ item }: { item: NFT }) => (
                        <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
                            <View>
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
                                {/* List for Sale button */}
                                <AnimatedPressable
                                    preset="button"
                                    onPress={() => openListModal(item)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center' as const,
                                        justifyContent: 'center' as const,
                                        gap: 6,
                                        marginHorizontal: 6,
                                        marginBottom: 6,
                                        paddingVertical: 10,
                                        borderRadius: isWeb ? 10 : 14,
                                        backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)',
                                        borderWidth: 1,
                                        borderColor: isDark ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.2)',
                                    }}
                                >
                                    <Tag size={14} color="#f59e0b" />
                                    <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }}>List for Sale</Text>
                                </AnimatedPressable>
                            </View>
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
                    ListEmptyComponent={() => !loading ? (
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                            <Gem size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                            <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>
                                {activeFilter === 'All' ? 'No NFTs in your collection yet' : `No ${activeFilter.toLowerCase()} NFTs found`}
                            </Text>
                        </View>
                    ) : null}
                />
            </View>

            {/* ── List for Sale Modal ── */}
            <Modal
                visible={listModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setListModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    justifyContent: 'flex-end',
                }}>
                    <View style={{
                        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        paddingTop: 8,
                        paddingBottom: 40,
                        paddingHorizontal: 20,
                        maxHeight: '60%',
                    }}>
                        {/* Handle */}
                        <View style={{
                            width: 40, height: 4, borderRadius: 2,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                            alignSelf: 'center', marginBottom: 16,
                        }} />

                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                List for Sale
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setListModalVisible(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        {selectedNFT && (
                            <>
                                {/* Selected NFT info */}
                                <GlassCard intensity="light" style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                                    <View style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden' }}>
                                        {/* Inline image placeholder — full Image component may not be available in modal context on all platforms */}
                                        <View style={{ width: 56, height: 56, backgroundColor: isDark ? '#2d2d44' : '#e2e8f0', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                                            <Gem size={24} color="#8b5cf6" />
                                        </View>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
                                            {selectedNFT.songTitle}
                                        </Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 2 }}>
                                            Edition #{selectedNFT.editionNumber} · {selectedNFT.rarity}
                                        </Text>
                                    </View>
                                </GlassCard>

                                {/* Price input */}
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Sale Price (ETH)
                                </Text>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                    paddingHorizontal: 16,
                                    marginBottom: 12,
                                }}>
                                    <DollarSign size={18} color={colors.text.secondary} />
                                    <TextInput
                                        value={listPrice}
                                        onChangeText={setListPrice}
                                        placeholder="0.00"
                                        placeholderTextColor={colors.text.muted}
                                        keyboardType="decimal-pad"
                                        style={{
                                            flex: 1,
                                            paddingVertical: 16,
                                            paddingHorizontal: 8,
                                            fontSize: 24,
                                            fontWeight: '700',
                                            color: colors.text.primary,
                                        }}
                                    />
                                    <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>ETH</Text>
                                </View>

                                <Text style={{ color: colors.text.muted, fontSize: 12, marginBottom: 20 }}>
                                    5% royalty goes to the original creator on secondary sales.
                                </Text>

                                {/* Error */}
                                {listForSaleHook.error && (
                                    <View style={{
                                        backgroundColor: 'rgba(239,68,68,0.1)',
                                        borderRadius: 12,
                                        padding: 12,
                                        marginBottom: 12,
                                    }}>
                                        <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>
                                            {listForSaleHook.error}
                                        </Text>
                                    </View>
                                )}

                                {/* Submit button */}
                                <AnimatedPressable
                                    preset="button"
                                    onPress={handleListForSale}
                                    disabled={listForSaleHook.loading}
                                    style={{
                                        backgroundColor: listForSaleHook.loading ? '#64748b' : '#f59e0b',
                                        borderRadius: 20,
                                        paddingVertical: 16,
                                        alignItems: 'center' as const,
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        gap: 8,
                                        opacity: listForSaleHook.loading ? 0.7 : 1,
                                    }}
                                >
                                    {listForSaleHook.loading ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <>
                                            <Tag size={18} color="#ffffff" />
                                            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>
                                                List for Sale
                                            </Text>
                                        </>
                                    )}
                                </AnimatedPressable>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </ScreenScaffold>
    );
}
