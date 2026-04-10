import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, FlatList, Platform, useWindowDimensions,
    ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gem, Plus, X, ChevronDown } from 'lucide-react-native';
import NFTCard from '../../src/components/shared/NFTCard';
import NFTGroupCard from '../../src/components/shared/NFTGroupCard';
import { NFT, Song } from '../../src/types';
import { useCreatorNFTs, useCreatorSongs, useCreateNFTRelease } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import ErrorState from '../../src/components/shared/ErrorState';
import { useAuth } from '../../src/context/AuthContext';
import { useActiveAccount } from 'thirdweb/react';
import { useRouter, useFocusEffect } from 'expo-router';

const isWeb = Platform.OS === 'web';

type Rarity = 'common' | 'rare' | 'legendary';

const RARITY_OPTIONS: { label: string; value: Rarity; color: string }[] = [
    { label: 'Common', value: 'common', color: '#38b4ba' },
    { label: 'Rare', value: 'rare', color: '#8b5cf6' },
    { label: 'Legendary', value: 'legendary', color: '#f59e0b' },
];

export default function NFTManagerScreen() {
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const { profile } = useAuth();
    const account = useActiveAccount();
    const router = useRouter();
    const { data: creatorNFTs, loading, error: nftError, refresh: refreshNFTs } = useCreatorNFTs();
    const { data: creatorSongs, refresh: refreshSongs } = useCreatorSongs();
    const createRelease = useCreateNFTRelease();

    useFocusEffect(
        useCallback(() => {
            refreshNFTs();
            refreshSongs();
        }, [refreshNFTs, refreshSongs])
    );

    const groupedNFTs = useMemo(() => {
        const groups: Record<string, NFT[]> = {};
        for (const nft of creatorNFTs) {
            if (!groups[nft.songId]) groups[nft.songId] = [];
            groups[nft.songId].push(nft);
        }
        return Object.values(groups);
    }, [creatorNFTs]);

    const numCols = isWeb ? (width > 1000 ? 3 : 2) : 2;
    const Container = isWeb ? View : SafeAreaView;

    // ── Modal state ──
    const [showModal, setShowModal] = useState(false);
    const [groupModalVisible, setGroupModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<NFT[]>([]);
    
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);
    const [showSongPicker, setShowSongPicker] = useState(false);
    const [tierName, setTierName] = useState('');
    const [rarity, setRarity] = useState<Rarity>('common');
    const [totalSupply, setTotalSupply] = useState('10');
    const [priceEth, setPriceEth] = useState('0.01');
    const [royaltyPercent, setRoyaltyPercent] = useState('10');

    const resetForm = () => {
        setSelectedSong(null);
        setTierName('');
        setRarity('common');
        setTotalSupply('10');
        setPriceEth('0.01');
        setRoyaltyPercent('10');
        createRelease.reset();
    };

    const handleCreate = async () => {
        if (!selectedSong) {
            Alert.alert('Missing', 'Please select a song');
            return;
        }
        if (!tierName.trim()) {
            Alert.alert('Missing', 'Please enter a tier name');
            return;
        }

        const supply = parseInt(totalSupply) || 0;
        const price = parseFloat(priceEth) || 0;
        const royalty = parseFloat(royaltyPercent) || 0;

        if (supply < 1 || supply > 10000) {
            Alert.alert('Invalid', 'Supply must be between 1 and 10,000');
            return;
        }
        if (royalty > 50) {
            Alert.alert('Invalid', 'Royalty allocation cannot exceed 50% per song');
            return;
        }

        const releaseId = await createRelease.execute(
            {
                songId: selectedSong.id,
                tierName: tierName.trim(),
                rarity,
                totalSupply: supply,
                allocatedRoyaltyPercent: royalty,
                priceEth: price,
                metadataUri: selectedSong.coverImage || 'ipfs://QmWYNy1tmd2UvBQNE9mT1TfQCu85GzD9x237wDdf5ahcWk/', // Default IFPS fallback
            },
            account || undefined,
        );

        if (releaseId) {
            setShowModal(false);
            resetForm();
            refreshNFTs();
        }
    };

    // ── Shared styles ──
    const inputStyle = {
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
        borderRadius: 12,
        padding: 14,
        color: colors.text.primary,
        fontSize: 15,
    };

    const labelStyle = {
        color: colors.text.secondary,
        fontSize: 12,
        fontWeight: '600' as const,
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
        marginBottom: 6,
        marginTop: 16,
    };

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
                        onPress={() => { resetForm(); setShowModal(true); }}
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
            ) : nftError ? (
                <ErrorState message={nftError} onRetry={refreshNFTs} />
            ) : creatorNFTs.length > 0 ? (
                <FlatList
                    data={groupedNFTs}
                    renderItem={({ item }: { item: NFT[] }) => {
                        const firstItem = item[0];
                        return (
                            <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
                                <NFTGroupCard
                                    cover={firstItem.coverImage}
                                    title={firstItem.songTitle}
                                    artist={firstItem.artistName}
                                    badgeText={`${item.length} Release${item.length > 1 ? 's' : ''}`}
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
                    contentContainerStyle={{ paddingHorizontal: isWeb ? 26 : 10, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Gem size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                    <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No NFT releases yet</Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 4 }}>Create your first music NFT</Text>
                </View>
            )}

            {/* ── Create NFT Modal ── */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 20,
                }}>
                    <View style={{
                        width: '100%',
                        maxWidth: 480,
                        maxHeight: '90%',
                        backgroundColor: isDark ? '#0f172a' : '#fff',
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <View style={{
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                            padding: 20, borderBottomWidth: 1,
                            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        }}>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary }}>
                                Create NFT Release
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setShowModal(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                            {/* Song Picker */}
                            <Text style={labelStyle}>Song</Text>
                            <AnimatedPressable
                                preset="row"
                                onPress={() => setShowSongPicker(!showSongPicker)}
                                style={{
                                    ...inputStyle,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Text style={{ color: selectedSong ? colors.text.primary : colors.text.muted, fontSize: 15 }}>
                                    {selectedSong?.title || 'Select a song...'}
                                </Text>
                                <ChevronDown size={18} color={colors.text.secondary} />
                            </AnimatedPressable>

                            {showSongPicker && (
                                <View style={{
                                    maxHeight: 160,
                                    marginTop: 4,
                                    borderRadius: 12,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    <ScrollView nestedScrollEnabled>
                                        {creatorSongs.map((song) => (
                                            <AnimatedPressable
                                                key={song.id}
                                                preset="row"
                                                onPress={() => { setSelectedSong(song); setShowSongPicker(false); }}
                                                style={{
                                                    padding: 12,
                                                    borderBottomWidth: 1,
                                                    borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                    backgroundColor: selectedSong?.id === song.id
                                                        ? (isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)')
                                                        : 'transparent',
                                                }}
                                            >
                                                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                                                    {song.title}
                                                </Text>
                                            </AnimatedPressable>
                                        ))}
                                        {creatorSongs.length === 0 && (
                                            <Text style={{ padding: 12, color: colors.text.muted }}>No songs uploaded yet</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}

                            {/* Tier Name */}
                            <Text style={labelStyle}>Tier Name</Text>
                            <TextInput
                                value={tierName}
                                onChangeText={setTierName}
                                placeholder="e.g. Gold Edition, Early Access"
                                placeholderTextColor={colors.text.muted}
                                style={inputStyle}
                            />

                            {/* Rarity */}
                            <Text style={labelStyle}>Rarity</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {RARITY_OPTIONS.map((opt) => (
                                    <AnimatedPressable
                                        key={opt.value}
                                        preset="button"
                                        onPress={() => setRarity(opt.value)}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 10,
                                            borderRadius: 10,
                                            alignItems: 'center' as const,
                                            backgroundColor: rarity === opt.value
                                                ? opt.color + '20'
                                                : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                            borderWidth: 2,
                                            borderColor: rarity === opt.value ? opt.color : 'transparent',
                                        }}
                                    >
                                        <Text style={{
                                            color: rarity === opt.value ? opt.color : colors.text.secondary,
                                            fontWeight: '700',
                                            fontSize: 13,
                                        }}>
                                            {opt.label}
                                        </Text>
                                    </AnimatedPressable>
                                ))}
                            </View>

                            {/* Supply + Price */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Total Supply</Text>
                                    <TextInput
                                        value={totalSupply}
                                        onChangeText={setTotalSupply}
                                        keyboardType="numeric"
                                        placeholder="10"
                                        placeholderTextColor={colors.text.muted}
                                        style={inputStyle}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Price (POL)</Text>
                                    <TextInput
                                        value={priceEth}
                                        onChangeText={setPriceEth}
                                        keyboardType="decimal-pad"
                                        placeholder="0.01"
                                        placeholderTextColor={colors.text.muted}
                                        style={inputStyle}
                                    />
                                </View>
                            </View>

                            {/* Royalty */}
                            <Text style={labelStyle}>Royalty Allocation (%)</Text>
                            <TextInput
                                value={royaltyPercent}
                                onChangeText={setRoyaltyPercent}
                                keyboardType="numeric"
                                placeholder="10"
                                placeholderTextColor={colors.text.muted}
                                style={inputStyle}
                            />
                            <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4 }}>
                                Max 50% total across all tiers per song. NFT holders share this royalty pool.
                            </Text>

                            {/* Error */}
                            {createRelease.error && (
                                <View style={{
                                    marginTop: 16, padding: 12, borderRadius: 10,
                                    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
                                }}>
                                    <Text style={{ color: '#ef4444', fontSize: 13 }}>{createRelease.error}</Text>
                                </View>
                            )}

                            {/* Submit */}
                            <AnimatedPressable
                                preset="button"
                                onPress={handleCreate}
                                style={{
                                    marginTop: 24,
                                    backgroundColor: createRelease.loading ? '#6d48c7' : '#8b5cf6',
                                    borderRadius: 14,
                                    paddingVertical: 16,
                                    alignItems: 'center' as const,
                                    opacity: createRelease.loading ? 0.7 : 1,
                                }}
                            >
                                {createRelease.loading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                        Create NFT Release
                                    </Text>
                                )}
                            </AnimatedPressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            {/* ── Group Details Modal ── */}
            <Modal
                visible={groupModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setGroupModalVisible(false)}
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
                        maxHeight: '85%',
                    }}>
                        <View style={{
                            width: 40, height: 4, borderRadius: 2,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                            alignSelf: 'center', marginBottom: 16,
                        }} />
                        
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                {selectedGroup[0]?.songTitle || 'Releases'}
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setGroupModalVisible(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 40 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {selectedGroup.map((item) => (
                                    <View key={item.id} style={{ width: '50%', padding: 6 }}>
                                        <NFTCard
                                            cover={item.coverImage}
                                            title={item.songTitle}
                                            artist={item.artistName}
                                            price={item.price}
                                            editionNumber={item.editionNumber}
                                            totalEditions={item.totalEditions}
                                            rarity={item.rarity}
                                            variant="manage"
                                            onPress={() => {
                                                setGroupModalVisible(false);
                                                router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } });
                                            }}
                                        />
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </Container>
    );
}
