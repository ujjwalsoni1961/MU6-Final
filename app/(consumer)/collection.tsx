import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, FlatList, Platform, useWindowDimensions,
    Animated, ActivityIndicator, Modal, TextInput, Alert,
    TouchableWithoutFeedback, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Gem, Tag, X, DollarSign } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import TabPill from '../../src/components/shared/TabPill';
import NFTCard from '../../src/components/shared/NFTCard';
import GlassCard from '../../src/components/shared/GlassCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import NFTGroupCard from '../../src/components/shared/NFTGroupCard';
import { OwnedNFT } from '../../src/types';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { useAuth } from '../../src/context/AuthContext';
import { useActiveAccount } from 'thirdweb/react';
import {
    useOwnedNFTsWithStatus,
    useListForSale,
    useUpdateListingPrice,
    useCancelListing,
} from '../../src/hooks/useData';
import ErrorState from '../../src/components/shared/ErrorState';

const isWeb = Platform.OS === 'web';
const filters = ['All', 'Legendary', 'Rare', 'Common'];

type ModalMode = 'list' | 'manage';

export default function CollectionScreen() {
    const [activeFilter, setActiveFilter] = useState('All');
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const { fiatCurrency } = useCurrency();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;
    const { walletAddress } = useAuth();
    const account = useActiveAccount();

    // Real data — owned NFTs with listing status
    const { data: ownedNFTs, loading, error: collectionError, refresh } = useOwnedNFTsWithStatus();

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    // Mutation hooks
    const listForSaleHook = useListForSale();
    const updatePriceHook = useUpdateListingPrice();
    const cancelListingHook = useCancelListing();

    // Modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>('list');
    const [selectedNFT, setSelectedNFT] = useState<OwnedNFT | null>(null);
    const [listPrice, setListPrice] = useState('');
    const [newPrice, setNewPrice] = useState('');
    
    // Group Modal state
    const [groupModalVisible, setGroupModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<OwnedNFT[]>([]);

    // Swipe-to-dismiss for list/manage modal
    const modalSwipeY = useRef(new Animated.Value(0)).current;
    const modalPanResponder = useMemo(() =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) modalSwipeY.setValue(gs.dy);
            },
            onPanResponderRelease: (_, gs) => {
                if (gs.dy > 80 || gs.vy > 0.5) {
                    Animated.spring(modalSwipeY, {
                        toValue: 600,
                        velocity: gs.vy,
                        tension: 65,
                        friction: 11,
                        useNativeDriver: true,
                    }).start(() => {
                        setModalVisible(false);
                        modalSwipeY.setValue(0);
                    });
                } else {
                    Animated.spring(modalSwipeY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 12 }).start();
                }
            },
        }), []);

    // Swipe-to-dismiss for group modal
    const groupSwipeY = useRef(new Animated.Value(0)).current;
    const groupPanResponder = useMemo(() =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) groupSwipeY.setValue(gs.dy);
            },
            onPanResponderRelease: (_, gs) => {
                if (gs.dy > 80 || gs.vy > 0.5) {
                    Animated.spring(groupSwipeY, {
                        toValue: 600,
                        velocity: gs.vy,
                        tension: 65,
                        friction: 11,
                        useNativeDriver: true,
                    }).start(() => {
                        setGroupModalVisible(false);
                        groupSwipeY.setValue(0);
                    });
                } else {
                    Animated.spring(groupSwipeY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 12 }).start();
                }
            },
        }), []);

    const filteredNFTs = ownedNFTs.filter((nft) => {
        if (activeFilter === 'All') return true;
        return nft.rarity === activeFilter.toLowerCase();
    });

    const groupedNFTs = useMemo(() => {
        const groups: Record<string, OwnedNFT[]> = {};
        for (const nft of filteredNFTs) {
            if (!groups[nft.songId]) groups[nft.songId] = [];
            groups[nft.songId].push(nft);
        }
        return Object.values(groups);
    }, [filteredNFTs]);

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    // ─── Modal openers ───

    const openListModal = useCallback((nft: OwnedNFT) => {
        setSelectedNFT(nft);
        setListPrice(nft.price > 0 ? nft.price.toString() : '');
        setModalMode('list');
        listForSaleHook.reset();
        setModalVisible(true);
    }, []);

    const openManageModal = useCallback((nft: OwnedNFT) => {
        setSelectedNFT(nft);
        setNewPrice(nft.activeListingPrice?.toString() || '');
        setModalMode('manage');
        updatePriceHook.reset();
        cancelListingHook.reset();
        setModalVisible(true);
    }, []);

    // ─── Handlers ───

    const handleListForSale = useCallback(async () => {
        if (!selectedNFT || !walletAddress) return;
        const price = parseFloat(listPrice);
        if (isNaN(price) || price <= 0) {
            Alert.alert('Invalid Price', 'Please enter a valid price in POL.');
            return;
        }
        const listingId = await listForSaleHook.execute(
            { nftTokenId: selectedNFT.tokenDbId, priceEth: price, sellerWallet: walletAddress },
            account || undefined,
        );
        if (listingId) {
            Alert.alert('Listed!', `Your NFT is now listed for ${price} POL on the marketplace.`, [
                {
                    text: 'View Marketplace',
                    onPress: () => {
                        setModalVisible(false);
                        router.push('/(consumer)/marketplace');
                    },
                },
                { text: 'OK', onPress: () => setModalVisible(false) },
            ]);
            refresh();
        }
    }, [selectedNFT, walletAddress, listPrice, account, listForSaleHook.execute, refresh]);

    const handleUpdatePrice = useCallback(async () => {
        if (!selectedNFT || !walletAddress || !selectedNFT.activeListingId) return;
        const price = parseFloat(newPrice);
        if (isNaN(price) || price <= 0) {
            Alert.alert('Invalid Price', 'Please enter a valid price in POL.');
            return;
        }
        const success = await updatePriceHook.execute(
            selectedNFT.activeListingId,
            price,
            walletAddress,
            selectedNFT.chainListingId,
            selectedNFT.onChainTokenId,
            account || undefined,
        );
        if (success) {
            Alert.alert('Updated', `Listing price updated to ${price} POL.`);
            setModalVisible(false);
            refresh();
        }
    }, [selectedNFT, walletAddress, newPrice, account, updatePriceHook.execute, refresh]);

    const handleCancelListing = useCallback(async () => {
        if (!selectedNFT || !walletAddress || !selectedNFT.activeListingId) return;
        Alert.alert(
            'Cancel Listing',
            'Are you sure you want to cancel this listing? The NFT will be removed from the marketplace.',
            [
                { text: 'Keep Listed', style: 'cancel' },
                {
                    text: 'Cancel Listing',
                    style: 'destructive',
                    onPress: async () => {
                        const success = await cancelListingHook.execute(
                            selectedNFT.activeListingId!,
                            walletAddress,
                            account || undefined,
                        );
                        if (success) {
                            Alert.alert('Cancelled', 'Your NFT listing has been cancelled.');
                            setModalVisible(false);
                            refresh();
                        }
                    },
                },
            ],
        );
    }, [selectedNFT, walletAddress, account, cancelListingHook.execute, refresh]);

    // ─── Header ───

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
                        {ownedNFTs.reduce((sum, n) => sum + (n.activeListingPrice || n.price), 0).toFixed(2)} POL
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
                        Listed
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                        <Tag size={16} color="#10b981" />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#10b981' }}>
                            {ownedNFTs.filter(n => n.ownershipStatus === 'listed').length} / {ownedNFTs.length}
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
                    data={loading ? [] : groupedNFTs}
                    ListHeaderComponent={renderHeader}
                    renderItem={({ item }: { item: OwnedNFT[] }) => {
                        const firstItem = item[0];
                        const listedCount = item.filter((n) => n.ownershipStatus === 'listed').length;
                        const badgeText = listedCount > 0 ? `${item.length} Owned · ${listedCount} Listed` : `${item.length} Owned`;
                        
                        return (
                            <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
                                <NFTGroupCard
                                    cover={firstItem.coverImage}
                                    title={firstItem.songTitle}
                                    artist={firstItem.artistName}
                                    badgeText={badgeText}
                                    onPress={() => {
                                        setSelectedGroup(item);
                                        setGroupModalVisible(true);
                                    }}
                                />
                            </View>
                        );
                    }}
                    keyExtractor={(item) => item[0].songId}
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
                        collectionError ? (
                            <ErrorState message={collectionError} onRetry={refresh} />
                        ) : (
                            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                                <Gem size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                                <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>
                                    {activeFilter === 'All' ? 'No NFTs in your collection yet' : `No ${activeFilter.toLowerCase()} NFTs found`}
                                </Text>
                                {activeFilter === 'All' && (
                                    <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                                        Mint or buy NFTs from the Marketplace to see them here.
                                    </Text>
                                )}
                            </View>
                        )
                    ) : null}
                />
            </View>

            {/* ── Unified Modal: List for Sale / Manage Listing ── */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => { setModalVisible(false); modalSwipeY.setValue(0); }}
            >
                <TouchableWithoutFeedback onPress={() => { setModalVisible(false); modalSwipeY.setValue(0); }}>
                    <View style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        justifyContent: 'flex-end',
                    }} />
                </TouchableWithoutFeedback>
                <Animated.View
                    {...modalPanResponder.panHandlers}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        paddingTop: 8,
                        paddingBottom: 40,
                        paddingHorizontal: 20,
                        maxHeight: '70%',
                        transform: [{ translateY: modalSwipeY }],
                    }}
                >
                    {/* Handle */}
                    <View style={{
                        width: 40, height: 4, borderRadius: 2,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                        alignSelf: 'center', marginBottom: 16,
                    }} />

                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                {modalMode === 'list' ? 'List for Sale' : 'Manage Listing'}
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setModalVisible(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        {selectedNFT && (
                            <>
                                {/* Selected NFT info */}
                                <GlassCard intensity="light" style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                                    <View style={{ width: 56, height: 56, backgroundColor: isDark ? '#2d2d44' : '#e2e8f0', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                                        <Gem size={24} color="#8b5cf6" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
                                            {selectedNFT.songTitle}
                                        </Text>
                                        <Text style={{ color: modalMode === 'manage' ? '#10b981' : colors.text.secondary, fontSize: 13, marginTop: 2, fontWeight: modalMode === 'manage' ? '600' : '400' }}>
                                            {modalMode === 'manage'
                                                ? `Listed at ${selectedNFT.activeListingPrice} POL`
                                                : `Edition ${selectedNFT.editionNumber} of ${selectedNFT.totalEditions} · ${selectedNFT.rarity}`}
                                        </Text>
                                    </View>
                                </GlassCard>

                                {/* Price input */}
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {modalMode === 'list' ? 'Sale Price (POL)' : 'Update Price (POL)'}
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
                                        value={modalMode === 'list' ? listPrice : newPrice}
                                        onChangeText={modalMode === 'list' ? setListPrice : setNewPrice}
                                        placeholder={modalMode === 'manage' ? (selectedNFT.activeListingPrice?.toString() || '0.00') : '0.00'}
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
                                    <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>POL</Text>
                                </View>

                                <Text style={{ color: colors.text.muted, fontSize: 12, marginBottom: 20 }}>
                                    5% royalty goes to the original creator on secondary sales.
                                </Text>

                                {/* Error */}
                                {(listForSaleHook.error || updatePriceHook.error || cancelListingHook.error) && (
                                    <View style={{
                                        backgroundColor: 'rgba(239,68,68,0.1)',
                                        borderRadius: 12,
                                        padding: 12,
                                        marginBottom: 12,
                                    }}>
                                        <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>
                                            {listForSaleHook.error || updatePriceHook.error || cancelListingHook.error}
                                        </Text>
                                    </View>
                                )}

                                {/* Primary action button */}
                                <AnimatedPressable
                                    preset="button"
                                    onPress={modalMode === 'list' ? handleListForSale : handleUpdatePrice}
                                    disabled={modalMode === 'list' ? listForSaleHook.loading : updatePriceHook.loading}
                                    style={{
                                        backgroundColor: (modalMode === 'list' ? listForSaleHook.loading : updatePriceHook.loading)
                                            ? '#64748b'
                                            : (modalMode === 'list' ? '#f59e0b' : '#8b5cf6'),
                                        borderRadius: 20,
                                        paddingVertical: 16,
                                        alignItems: 'center' as const,
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        gap: 8,
                                        marginBottom: modalMode === 'manage' ? 12 : 0,
                                        opacity: (modalMode === 'list' ? listForSaleHook.loading : updatePriceHook.loading) ? 0.7 : 1,
                                    }}
                                >
                                    {(modalMode === 'list' ? listForSaleHook.loading : updatePriceHook.loading) ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <>
                                            <Tag size={18} color="#ffffff" />
                                            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>
                                                {modalMode === 'list' ? 'List for Sale' : 'Update Price'}
                                            </Text>
                                        </>
                                    )}
                                </AnimatedPressable>

                                {/* Cancel Listing button (manage mode only) */}
                                {modalMode === 'manage' && (
                                    <AnimatedPressable
                                        preset="button"
                                        onPress={handleCancelListing}
                                        disabled={cancelListingHook.loading}
                                        style={{
                                            backgroundColor: cancelListingHook.loading ? '#64748b' : 'rgba(239,68,68,0.12)',
                                            borderRadius: 20,
                                            paddingVertical: 16,
                                            alignItems: 'center' as const,
                                            flexDirection: 'row',
                                            justifyContent: 'center',
                                            gap: 8,
                                            borderWidth: 1,
                                            borderColor: 'rgba(239,68,68,0.3)',
                                            opacity: cancelListingHook.loading ? 0.7 : 1,
                                        }}
                                    >
                                        {cancelListingHook.loading ? (
                                            <ActivityIndicator size="small" color="#ef4444" />
                                        ) : (
                                            <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 16 }}>
                                                Cancel Listing
                                            </Text>
                                        )}
                                    </AnimatedPressable>
                                )}
                            </>
                        )}
                </Animated.View>
            </Modal>
            {/* ── Group Details Modal ── */}
            <Modal
                visible={groupModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => { setGroupModalVisible(false); groupSwipeY.setValue(0); }}
            >
                <TouchableWithoutFeedback onPress={() => { setGroupModalVisible(false); groupSwipeY.setValue(0); }}>
                    <View style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        justifyContent: 'flex-end',
                    }} />
                </TouchableWithoutFeedback>
                <Animated.View
                    {...groupPanResponder.panHandlers}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        paddingTop: 8,
                        paddingBottom: Math.max(insets.bottom, 20),
                        maxHeight: '85%',
                        transform: [{ translateY: groupSwipeY }],
                    }}
                >
                    <View style={{
                        width: 40, height: 4, borderRadius: 2,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                        alignSelf: 'center', marginBottom: 16,
                    }} />
                        
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                {selectedGroup[0]?.songTitle || 'Collection'}
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setGroupModalVisible(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 40 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {selectedGroup.map((item) => (
                                    <View key={item.id} style={{ width: '50%', padding: 6 }}>
                                        <View>
                                            <NFTCard
                                                cover={item.coverImage}
                                                title={item.songTitle}
                                                artist={item.artistName}
                                                price={item.activeListingPrice || item.price}
                                                editionNumber={item.editionNumber}
                                                totalEditions={item.totalEditions}
                                                rarity={item.rarity}
                                                fiatCurrency={fiatCurrency}
                                                variant="collection"
                                                onPress={() => {
                                                    setGroupModalVisible(false);
                                                    router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } });
                                                }}
                                            />
                                            {item.ownershipStatus === 'listed' && (
                                                <View style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                                    marginHorizontal: 6, marginBottom: 4, paddingVertical: 4,
                                                    backgroundColor: isDark ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.08)',
                                                    borderRadius: 8,
                                                }}>
                                                    <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>
                                                        Listed · {item.activeListingPrice} POL
                                                    </Text>
                                                </View>
                                            )}
                                            <AnimatedPressable
                                                preset="button"
                                                onPress={() => {
                                                    setGroupModalVisible(false);
                                                    setTimeout(() => {
                                                        item.ownershipStatus === 'listed' ? openManageModal(item) : openListModal(item);
                                                    }, 300);
                                                }}
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                                    gap: 6, marginHorizontal: 6, marginBottom: 6, paddingVertical: 10,
                                                    borderRadius: 10,
                                                    backgroundColor: item.ownershipStatus === 'listed'
                                                        ? (isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)')
                                                        : (isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)'),
                                                    borderWidth: 1,
                                                    borderColor: item.ownershipStatus === 'listed'
                                                        ? (isDark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.2)')
                                                        : (isDark ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.2)'),
                                                }}
                                            >
                                                <Tag size={12} color={item.ownershipStatus === 'listed' ? '#8b5cf6' : '#f59e0b'} />
                                                <Text style={{
                                                    color: item.ownershipStatus === 'listed' ? '#8b5cf6' : '#f59e0b',
                                                    fontSize: 11, fontWeight: '700',
                                                }}>
                                                    {item.ownershipStatus === 'listed' ? 'Manage' : 'List for Sale'}
                                                </Text>
                                            </AnimatedPressable>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                </Animated.View>
            </Modal>
        </ScreenScaffold>
    );
}
