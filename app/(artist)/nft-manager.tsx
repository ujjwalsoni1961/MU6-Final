import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, FlatList, Platform, useWindowDimensions,
    ActivityIndicator, Modal, TextInput, Alert, Linking,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gem, Plus, X, ChevronDown, ImagePlus, Trash2, AlertTriangle, Info, ExternalLink, CheckCircle } from 'lucide-react-native';
import NFTCard from '../../src/components/shared/NFTCard';
import NFTGroupCard from '../../src/components/shared/NFTGroupCard';
import { NFT, Song } from '../../src/types';
import { useCreatorNFTs, useCreatorSongs, useCreateNFTRelease } from '../../src/hooks/useData';
import {
    getArtistNFTLimits,
    submitNFTLimitRequest,
    ArtistNFTLimits,
    NftRarity,
} from '../../src/services/database';
import { Lock, Send } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import ErrorState from '../../src/components/shared/ErrorState';
import { useAuth } from '../../src/context/AuthContext';
import { useActiveAccount } from 'thirdweb/react';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { supabase } from '../../src/lib/supabase';
import {
    createErc1155Release,
    getErc1155NextTokenIdToMint,
    resolveArtistErc1155Contract,
} from '../../src/services/blockchain';
import { buildAndPinReleaseMetadata } from '../../src/services/nftMetadata';
import { extFromBlobOrUri, mimeFromBlobOrExt } from '../../src/utils/fileExt';
import { CONTRACT_ADDRESSES, CHAIN_ID } from '../../src/config/network';

// ERC-1155 contract address — read from env; falls back to Amoy testnet default.
// On mainnet set EXPO_PUBLIC_SONG_NFT_ERC1155_ADDRESS.
const ERC1155_CONTRACT =
    process.env.EXPO_PUBLIC_SONG_NFT_ERC1155_ADDRESS ||
    '0x10450d990a0Fb50d00Aa5D304846b8421d3cB5Ad';

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
    const { fiatCurrency } = useCurrency();
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
    // Royalty allocation to NFT holders is temporarily disabled — shown as
    // "Coming Soon" in the create modal. All new releases are created with 0%
    // allocation. Streaming revenue flows only to split-sheet parties.
    const ROYALTY_TO_HOLDERS_ENABLED = false;
    const [description, setDescription] = useState('');
    const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
    const [coverImageUploading, setCoverImageUploading] = useState(false);
    const [benefits, setBenefits] = useState<{ title: string; description: string }[]>([]);
    const [newBenefitTitle, setNewBenefitTitle] = useState('');
    const [newBenefitDesc, setNewBenefitDesc] = useState('');

    // ERC-1155 specific fields
    const [maxSupply, setMaxSupply] = useState('1000000'); // default = unlimited
    const [erc1155Creating, setErc1155Creating] = useState(false);
    const [erc1155CreateError, setErc1155CreateError] = useState<string | null>(null);
    const [erc1155Progress, setErc1155Progress] = useState<string | null>(null);
    // Success state — shown in modal after successful ERC-1155 creation
    const [erc1155Success, setErc1155Success] = useState<{ tokenId: string; releaseId: string; contractAddress: string } | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // PDF Fix #9: artist NFT listing limits + "Request Higher Limit" flow.
    const [limits, setLimits] = useState<ArtistNFTLimits | null>(null);
    const [showLimitRequestModal, setShowLimitRequestModal] = useState(false);
    const [reqListingLimit, setReqListingLimit] = useState('');
    const [reqRarities, setReqRarities] = useState<Record<NftRarity, boolean>>({ common: false, rare: false, legendary: false });
    const [reqReason, setReqReason] = useState('');
    const [reqSubmitting, setReqSubmitting] = useState(false);

    const refreshLimits = useCallback(async () => {
        if (!profile?.id) return;
        const l = await getArtistNFTLimits(profile.id);
        setLimits(l);
    }, [profile?.id]);

    useFocusEffect(useCallback(() => { refreshLimits(); }, [refreshLimits]));

    const atLimit = !!limits && limits.activeListings >= limits.listingLimit;

    const handleSubmitLimitRequest = async () => {
        if (!profile?.id) return;
        const parsedLimit = reqListingLimit.trim() ? parseInt(reqListingLimit, 10) : null;
        if (parsedLimit !== null && (isNaN(parsedLimit) || parsedLimit <= (limits?.listingLimit ?? 0))) {
            const msg = `Requested limit must be a number greater than your current limit (${limits?.listingLimit}).`;
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Invalid', msg);
            return;
        }
        const requestedRarities = (Object.keys(reqRarities) as NftRarity[])
            .filter((k) => reqRarities[k] && !(limits?.allowedRarities.includes(k)));
        setReqSubmitting(true);
        try {
            const res = await submitNFTLimitRequest(
                profile.id,
                parsedLimit,
                requestedRarities.length > 0 ? requestedRarities : null,
                reqReason.trim() || null,
            );
            if (res.error) {
                Platform.OS === 'web' ? alert(res.error) : Alert.alert('Error', res.error);
            } else {
                const msg = 'Request submitted. An admin will review it shortly.';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Sent', msg);
                setShowLimitRequestModal(false);
                setReqListingLimit('');
                setReqRarities({ common: false, rare: false, legendary: false });
                setReqReason('');
            }
        } finally {
            setReqSubmitting(false);
        }
    };

    const resetForm = () => {
        setSelectedSong(null);
        setTierName('');
        setRarity('common');
        setTotalSupply('10');
        setPriceEth('0.01');
        setMaxSupply('1000000');
        setDescription('');
        setCoverImageUri(null);
        setBenefits([]);
        setNewBenefitTitle('');
        setNewBenefitDesc('');
        setErc1155CreateError(null);
        setErc1155Progress(null);
        createRelease.reset();
    };

    const pickCoverImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled && result.assets[0]) {
            setCoverImageUri(result.assets[0].uri);
        }
    };

    const uploadCoverImage = async (): Promise<string | null> => {
        if (!coverImageUri) return null;
        setCoverImageUploading(true);
        try {
            // Fetch the picker URI FIRST so we can infer extension from the
            // actual Blob MIME type. Using `coverImageUri.split('.').pop()` on
            // a blob:/app:/file:// URL yields junk like `app/976cfcb5-…`
            // which then gets baked into the filename and the IPFS path.
            const response = await fetch(coverImageUri);
            const blob = await response.blob();
            const ext = extFromBlobOrUri(blob, coverImageUri, 'jpg');
            const fileName = `nft-cover-${Date.now()}.${ext}`;
            const contentType = mimeFromBlobOrExt(blob, ext);
            const { error } = await supabase.storage.from('covers').upload(`nft-covers/${fileName}`, blob, {
                contentType,
                upsert: true,
            });
            if (error) throw error;
            return `nft-covers/${fileName}`;
        } catch (err: any) {
            console.error('[nft-manager] cover upload error:', err);
            return null;
        } finally {
            setCoverImageUploading(false);
        }
    };

    const addBenefit = () => {
        if (!newBenefitTitle.trim()) return;
        setBenefits([...benefits, { title: newBenefitTitle.trim(), description: newBenefitDesc.trim() }]);
        setNewBenefitTitle('');
        setNewBenefitDesc('');
    };

    const removeBenefit = (idx: number) => {
        setBenefits(benefits.filter((_, i) => i !== idx));
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

        const price = parseFloat(priceEth);
        if (isNaN(price) || price < 0) {
            Alert.alert('Invalid', 'Please enter a valid price (POL)');
            return;
        }

        const maxSupplyVal = parseInt(maxSupply, 10);
        if (isNaN(maxSupplyVal) || maxSupplyVal < 1) {
            Alert.alert('Invalid', 'Max supply must be at least 1');
            return;
        }

        // Upload custom cover image if selected
        let uploadedCoverPath: string | null = null;
        if (coverImageUri) {
            uploadedCoverPath = await uploadCoverImage();
        }

        // ── ERC-1155 path (new default) ──
        setErc1155Creating(true);
        setErc1155CreateError(null);
        setErc1155Progress('Reading on-chain token counter…');

        try {
            // Read artist royalty config from profile
            const anyProfile = profile as any;
            const royaltyBps: number = anyProfile?.royaltyBps ?? 500;
            const royaltyRecipientWallet: string | null =
                anyProfile?.royaltyRecipientWallet ||
                anyProfile?.payoutWalletAddress ||
                anyProfile?.walletAddress ||
                null;

            // ── Build & pin real OpenSea-standard metadata to IPFS ──
            // Cover source priority:
            //  1) artist-picked local image (just uploaded to Supabase 'covers')
            //  2) song cover already pinned on IPFS
            //  3) song cover stored in Supabase (public 'covers' bucket)
            //  4) song cover as plain HTTP URL
            let coverSource: Parameters<typeof buildAndPinReleaseMetadata>[0]['coverSource'];
            if (coverImageUri) {
                coverSource = { kind: 'local-uri', value: coverImageUri };
            } else if (selectedSong.coverImage?.startsWith('ipfs://')) {
                coverSource = { kind: 'ipfs', value: selectedSong.coverImage };
            } else if (selectedSong._coverPath) {
                coverSource = { kind: 'supabase-path', value: selectedSong._coverPath };
            } else if (selectedSong.coverImage?.startsWith('http')) {
                coverSource = { kind: 'http-url', value: selectedSong.coverImage };
            } else {
                throw new Error('Song has no cover image. Please add one before minting.');
            }

            // Resolve the target ERC-1155 contract FIRST (per-artist or shared).
            // We need its address both to read `nextTokenIdToMint` (for pinning
            // metadata at the exact id the lazyMint will consume) and for the
            // subsequent release creation call.
            const contractForRelease = profile?.id
                ? await resolveArtistErc1155Contract(profile.id, ERC1155_CONTRACT)
                : ERC1155_CONTRACT;
            if (contractForRelease !== ERC1155_CONTRACT) {
                console.log('[nft-manager] using per-artist contract:', contractForRelease);
            }

            // Read the on-chain nextTokenIdToMint so we can pin the metadata
            // JSON as a file literally named `<nextTokenId>`. DropERC1155
            // computes `uri(tokenId) = baseURI + tokenId`, so uploading the
            // JSON with the correct filename is what makes the lazy-minted
            // token resolve to real metadata. Without this, only tokenId 0
            // works (the legacy bug).
            setErc1155Progress('Reading on-chain token counter…');
            let expectedNextTokenId: bigint;
            try {
                expectedNextTokenId = await getErc1155NextTokenIdToMint(contractForRelease);
            } catch (err: any) {
                setErc1155CreateError(`Could not read on-chain token counter: ${err?.message || err}`);
                return;
            }
            const expectedTokenId = expectedNextTokenId.toString();
            console.log('[nft-manager] expected nextTokenIdToMint:', expectedTokenId);

            setErc1155Progress('Preparing NFT metadata…');
            const pin = await buildAndPinReleaseMetadata(
                {
                    songTitle: selectedSong.title,
                    artistName: selectedSong.artistName || profile?.displayName || 'MU6 Artist',
                    tierName: tierName.trim(),
                    description: description.trim() || undefined,
                    rarity,
                    genre: selectedSong.genre,
                    maxSupply: maxSupplyVal,
                    pricePol: price,
                    coverSource,
                    audioPath: selectedSong._audioPath || null,
                    songId: selectedSong.id,
                    releaseDate: selectedSong.credits?.releaseDate,
                    benefits: benefits.length > 0 ? benefits : undefined,
                },
                expectedTokenId,
                (step) => setErc1155Progress(step),
            );
            console.log('[nft-manager] metadata pinned:', {
                tokenId: pin.tokenId,
                baseURI: pin.baseURI,
                metadataUri: pin.metadataUri,
            });

            setErc1155Progress('Lazy-minting token on-chain (server wallet)…');

            const result = await createErc1155Release(
                {
                    songId: selectedSong.id,
                    tierName: tierName.trim(),
                    rarity,
                    maxSupply: maxSupplyVal,
                    pricePol: price,
                    baseURI: pin.baseURI,
                    expectedTokenId: pin.tokenId,
                    description: description.trim() || undefined,
                    coverImagePath: uploadedCoverPath || undefined,
                    benefits: benefits.length > 0 ? benefits : undefined,
                    royaltyBps,
                    royaltyRecipientWallet,
                },
                contractForRelease,
            );

            if (!result.success) {
                setErc1155CreateError(result.error || 'Release creation failed');
                return;
            }

            // Success!
            setErc1155Success({
                tokenId: result.tokenId!,
                releaseId: result.releaseId!,
                contractAddress: contractForRelease,
            });
            setShowModal(false);
            resetForm();
            refreshNFTs();
            setShowSuccessModal(true);
        } catch (err: any) {
            setErc1155CreateError(err?.message || 'Unexpected error');
        } finally {
            setErc1155Creating(false);
            setErc1155Progress(null);
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
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
                        onPress={() => {
                            if (atLimit) {
                                const msg = `You have reached your NFT listing limit (${limits!.activeListings}/${limits!.listingLimit}). Use "Request Higher Limit" to petition your admin.`;
                                Platform.OS === 'web' ? alert(msg) : Alert.alert('Limit reached', msg);
                                return;
                            }
                            resetForm();
                            setShowModal(true);
                        }}
                        disabled={atLimit}
                        style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
                            backgroundColor: atLimit ? '#6b7280' : '#8b5cf6',
                            opacity: atLimit ? 0.7 : 1,
                            shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
                        }}
                    >
                        <Plus size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Create NFT</Text>
                    </AnimatedPressable>
                </View>

                {/* PDF Fix #9: Limits panel */}
                {limits && (
                    <View
                        style={{
                            flexDirection: 'row', flexWrap: 'wrap', gap: 12,
                            padding: 12, borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                            marginBottom: 20, alignItems: 'center', justifyContent: 'space-between',
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 240 }}>
                            <View style={{
                                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                                backgroundColor: atLimit ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                            }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: atLimit ? '#ef4444' : '#22c55e' }}>
                                    {limits.activeListings} / {limits.listingLimit} LISTINGS
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Lock size={12} color={colors.text.muted} />
                                <Text style={{ fontSize: 12, color: colors.text.secondary }}>
                                    Allowed tiers: {limits.allowedRarities.join(', ')}
                                </Text>
                            </View>
                        </View>
                        <AnimatedPressable
                            preset="button"
                            onPress={() => setShowLimitRequestModal(true)}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                borderWidth: 1, borderColor: '#8b5cf6', backgroundColor: 'transparent',
                            }}
                        >
                            <Send size={12} color="#8b5cf6" />
                            <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '600' }}>
                                Request Higher Limit
                            </Text>
                        </AnimatedPressable>
                    </View>
                )}
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

                            {/* Description */}
                            <Text style={labelStyle}>Description</Text>
                            <TextInput
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Describe this NFT release..."
                                placeholderTextColor={colors.text.muted}
                                multiline
                                numberOfLines={3}
                                style={{
                                    ...inputStyle,
                                    minHeight: 80,
                                    textAlignVertical: 'top',
                                }}
                            />

                            {/* Custom Cover Image */}
                            <Text style={labelStyle}>Custom Cover Image</Text>
                            <Text style={{ color: colors.text.muted, fontSize: 11, marginBottom: 8 }}>
                                Optional. Falls back to the song's cover art if not set.
                            </Text>
                            <AnimatedPressable
                                preset="button"
                                onPress={pickCoverImage}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    ...inputStyle,
                                    paddingVertical: coverImageUri ? 8 : 14,
                                }}
                            >
                                {coverImageUri ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                        <Image source={{ uri: coverImageUri }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                                        <Text style={{ color: colors.text.primary, fontSize: 13, flex: 1 }} numberOfLines={1}>Cover selected</Text>
                                        <AnimatedPressable preset="icon" onPress={() => setCoverImageUri(null)}>
                                            <X size={16} color={colors.text.secondary} />
                                        </AnimatedPressable>
                                    </View>
                                ) : (
                                    <>
                                        <ImagePlus size={18} color={colors.text.secondary} />
                                        <Text style={{ color: colors.text.secondary, fontSize: 14 }}>Choose Image</Text>
                                    </>
                                )}
                            </AnimatedPressable>

                            {/* Benefits / Perks */}
                            <Text style={labelStyle}>Benefits / Perks</Text>
                            <Text style={{ color: colors.text.muted, fontSize: 11, marginBottom: 8 }}>
                                Add perks that NFT holders receive (e.g. VIP Concert Access, Exclusive Content).
                            </Text>
                            {benefits.map((b, idx) => (
                                <View key={idx} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 6,
                                    backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)',
                                    borderRadius: 10,
                                    padding: 10,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.1)',
                                }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{b.title}</Text>
                                        {b.description ? <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>{b.description}</Text> : null}
                                    </View>
                                    <AnimatedPressable preset="icon" onPress={() => removeBenefit(idx)}>
                                        <Trash2 size={14} color="#ef4444" />
                                    </AnimatedPressable>
                                </View>
                            ))}
                            <View style={{ gap: 6 }}>
                                <TextInput
                                    value={newBenefitTitle}
                                    onChangeText={setNewBenefitTitle}
                                    placeholder="Benefit title (e.g. VIP Concert Access)"
                                    placeholderTextColor={colors.text.muted}
                                    style={inputStyle}
                                />
                                <TextInput
                                    value={newBenefitDesc}
                                    onChangeText={setNewBenefitDesc}
                                    placeholder="Description (optional)"
                                    placeholderTextColor={colors.text.muted}
                                    style={inputStyle}
                                />
                                <AnimatedPressable
                                    preset="button"
                                    onPress={addBenefit}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        backgroundColor: isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.08)',
                                        borderWidth: 1,
                                        borderColor: isDark ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.15)',
                                    }}
                                >
                                    <Plus size={14} color="#8b5cf6" />
                                    <Text style={{ color: '#8b5cf6', fontWeight: '600', fontSize: 13 }}>Add Benefit</Text>
                                </AnimatedPressable>
                            </View>

                            {/* Rarity (PDF Fix #9: locked tiers show a lock icon and cannot be selected) */}
                            <Text style={labelStyle}>Rarity</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {RARITY_OPTIONS.map((opt) => {
                                    const allowed = !limits || limits.allowedRarities.includes(opt.value as NftRarity);
                                    return (
                                        <AnimatedPressable
                                            key={opt.value}
                                            preset="button"
                                            onPress={() => {
                                                if (!allowed) {
                                                    const msg = `The "${opt.label}" tier is locked. Use "Request Higher Limit" to petition your admin for access.`;
                                                    Platform.OS === 'web' ? alert(msg) : Alert.alert('Tier locked', msg);
                                                    return;
                                                }
                                                setRarity(opt.value);
                                            }}
                                            disabled={!allowed}
                                            style={{
                                                flex: 1,
                                                paddingVertical: 10,
                                                borderRadius: 10,
                                                alignItems: 'center' as const,
                                                flexDirection: 'row',
                                                justifyContent: 'center',
                                                gap: 6,
                                                opacity: allowed ? 1 : 0.45,
                                                backgroundColor: rarity === opt.value && allowed
                                                    ? opt.color + '20'
                                                    : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                                borderWidth: 2,
                                                borderColor: rarity === opt.value && allowed ? opt.color : 'transparent',
                                            }}
                                        >
                                            {!allowed && <Lock size={12} color={colors.text.muted} />}
                                            <Text style={{
                                                color: rarity === opt.value && allowed ? opt.color : colors.text.secondary,
                                                fontWeight: '700',
                                                fontSize: 13,
                                            }}>
                                                {opt.label}
                                            </Text>
                                        </AnimatedPressable>
                                    );
                                })}
                            </View>

                            {/* Supply + Price (ERC-1155) */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Max Supply</Text>
                                    <TextInput
                                        value={maxSupply}
                                        onChangeText={setMaxSupply}
                                        keyboardType="numeric"
                                        placeholder="1000000"
                                        placeholderTextColor={colors.text.muted}
                                        style={inputStyle}
                                    />
                                    <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>
                                        Default 1 000 000 = effectively unlimited
                                    </Text>
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
                                    <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>
                                        Native POL (on-chain is source of truth)
                                    </Text>
                                </View>
                            </View>

                            {/* ERC-1155 badge */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                padding: 10, borderRadius: 10, marginTop: 8,
                                backgroundColor: isDark ? 'rgba(56,180,186,0.08)' : 'rgba(56,180,186,0.06)',
                                borderWidth: 1, borderColor: 'rgba(56,180,186,0.2)',
                            }}>
                                <Info size={14} color="#38b4ba" />
                                <Text style={{ color: '#38b4ba', fontSize: 12, fontWeight: '600', flex: 1 }}>
                                    ERC-1155 — uses shared MU6 Music Collection contract
                                </Text>
                            </View>

                            {/* Royalty Allocation — Coming Soon.
                                NFT-holder streaming revenue share is disabled for this launch.
                                Streaming revenue goes only to split-sheet parties; NFT sale
                                revenue goes directly to the primary creator. */}
                            <Text style={labelStyle}>Royalty Allocation to NFT Holders</Text>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 10,
                                padding: 14, borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)',
                                borderWidth: 1, borderStyle: 'dashed',
                                borderColor: isDark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.25)',
                            }}>
                                <Info size={16} color="#8b5cf6" />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#8b5cf6', fontSize: 13, fontWeight: '700' }}>
                                        Coming Soon
                                    </Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2, lineHeight: 16 }}>
                                        Revenue sharing with NFT holders is not available for this first launch. For now, streaming revenue goes to collaborators on the split sheet, and NFT sale revenue goes directly to the primary creator.
                                    </Text>
                                </View>
                            </View>

                            {/* Progress indicator */}
                            {erc1155Progress && (
                                <View style={{
                                    marginTop: 16, padding: 12, borderRadius: 10, gap: 8,
                                    flexDirection: 'row', alignItems: 'center',
                                    backgroundColor: 'rgba(56,180,186,0.08)',
                                    borderWidth: 1, borderColor: 'rgba(56,180,186,0.2)',
                                }}>
                                    <ActivityIndicator size="small" color="#38b4ba" />
                                    <Text style={{ color: '#38b4ba', fontSize: 13, flex: 1 }}>{erc1155Progress}</Text>
                                </View>
                            )}

                            {/* Error */}
                            {(erc1155CreateError || createRelease.error) && (
                                <View style={{
                                    marginTop: 16, padding: 12, borderRadius: 10,
                                    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
                                }}>
                                    <Text style={{ color: '#ef4444', fontSize: 13 }}>{erc1155CreateError || createRelease.error}</Text>
                                </View>
                            )}

                            {/* Submit */}
                            <AnimatedPressable
                                preset="button"
                                onPress={handleCreate}
                                disabled={erc1155Creating || createRelease.loading}
                                style={{
                                    marginTop: 24,
                                    backgroundColor: (erc1155Creating || createRelease.loading) ? '#6d48c7' : '#8b5cf6',
                                    borderRadius: 14,
                                    paddingVertical: 16,
                                    alignItems: 'center' as const,
                                    opacity: (erc1155Creating || createRelease.loading) ? 0.7 : 1,
                                }}
                            >
                                {(erc1155Creating || createRelease.loading) ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                        Create ERC-1155 Release
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

                        {/*
                          PDF priority fix #2 — artist dashboard group-detail
                          modal cards were pinned to `width: '50%'` so on
                          wide desktops each NFTCard ballooned to ~560px
                          wide. Use the same responsive column count as the
                          consumer collection modal: 4 cols on wide desktops
                          (≥1200px), 3 on medium (≥1024px), 2 on tablets
                          (≥640px), and 2 on phones.
                        */}
                        {(() => {
                            const modalCols = isWeb
                                ? (width >= 1200 ? 4 : width >= 1024 ? 3 : 2)
                                : (width >= 640 ? 3 : 2);
                            const cellWidth = `${100 / modalCols}%`;
                            return (
                        <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 40 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {selectedGroup.map((item) => (
                                    <View key={item.id} style={{ width: cellWidth as any, padding: 6 }}>
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
                            );
                        })()}
                    </View>
                </View>
            </Modal>

            {/* ── Request Higher Limit Modal (PDF Fix #9) ── */}
            <Modal visible={showLimitRequestModal} animationType="slide" transparent onRequestClose={() => setShowLimitRequestModal(false)}>
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
                                Request Higher Limit
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setShowLimitRequestModal(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                            <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 20, marginBottom: 8 }}>
                                Ask an admin to raise your NFT listing cap or unlock premium rarity tiers. Leave the limit blank if you only want new tiers.
                            </Text>

                            {limits && (
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(56,180,186,0.08)' : 'rgba(56,180,186,0.1)',
                                    borderRadius: 12, padding: 12, marginTop: 12,
                                    borderWidth: 1, borderColor: 'rgba(56,180,186,0.25)',
                                }}>
                                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 4 }}>
                                        Current limit
                                    </Text>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>
                                        {limits.activeListings} / {limits.listingLimit} listings · tiers: {limits.allowedRarities.join(', ')}
                                    </Text>
                                </View>
                            )}

                            <Text style={labelStyle}>New Listing Limit (optional)</Text>
                            <TextInput
                                value={reqListingLimit}
                                onChangeText={setReqListingLimit}
                                placeholder={`e.g. ${(limits?.listingLimit ?? 5) + 5}`}
                                placeholderTextColor={colors.text.muted}
                                keyboardType="number-pad"
                                style={inputStyle}
                            />

                            <Text style={labelStyle}>Request Access to Tiers</Text>
                            <View style={{ gap: 10 }}>
                                {RARITY_OPTIONS.map((opt) => {
                                    const alreadyAllowed = !!limits?.allowedRarities.includes(opt.value as NftRarity);
                                    const checked = reqRarities[opt.value as NftRarity];
                                    return (
                                        <AnimatedPressable
                                            key={opt.value}
                                            preset="row"
                                            disabled={alreadyAllowed}
                                            onPress={() => {
                                                setReqRarities((prev) => ({
                                                    ...prev,
                                                    [opt.value]: !prev[opt.value as NftRarity],
                                                }));
                                            }}
                                            style={{
                                                ...inputStyle,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                opacity: alreadyAllowed ? 0.5 : 1,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                <View style={{
                                                    width: 10, height: 10, borderRadius: 5,
                                                    backgroundColor: opt.color,
                                                }} />
                                                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>
                                                    {opt.label}
                                                </Text>
                                                {alreadyAllowed && (
                                                    <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                                                        (already unlocked)
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={{
                                                width: 22, height: 22, borderRadius: 6,
                                                borderWidth: 2,
                                                borderColor: checked ? opt.color : (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'),
                                                backgroundColor: checked ? opt.color : 'transparent',
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {alreadyAllowed && !checked && <Lock size={12} color={colors.text.muted} />}
                                            </View>
                                        </AnimatedPressable>
                                    );
                                })}
                            </View>

                            <Text style={labelStyle}>Reason (optional)</Text>
                            <TextInput
                                value={reqReason}
                                onChangeText={setReqReason}
                                placeholder="Tell the admin why you need a higher limit or new tier"
                                placeholderTextColor={colors.text.muted}
                                multiline
                                numberOfLines={4}
                                style={{ ...inputStyle, minHeight: 96, textAlignVertical: 'top' }}
                            />

                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                                <AnimatedPressable
                                    preset="row"
                                    onPress={() => setShowLimitRequestModal(false)}
                                    style={{
                                        flex: 1,
                                        padding: 14,
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Cancel</Text>
                                </AnimatedPressable>
                                <AnimatedPressable
                                    preset="row"
                                    disabled={reqSubmitting}
                                    onPress={handleSubmitLimitRequest}
                                    style={{
                                        flex: 1,
                                        padding: 14,
                                        borderRadius: 12,
                                        backgroundColor: '#38b4ba',
                                        alignItems: 'center',
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        gap: 8,
                                        opacity: reqSubmitting ? 0.6 : 1,
                                    }}
                                >
                                    {reqSubmitting ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Send size={16} color="#fff" />
                                    )}
                                    <Text style={{ color: '#fff', fontWeight: '800' }}>
                                        {reqSubmitting ? 'Submitting…' : 'Submit Request'}
                                    </Text>
                                </AnimatedPressable>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            {/* ── ERC-1155 Success Modal ── */}
            <Modal visible={showSuccessModal} animationType="fade" transparent>
                <View style={{
                    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
                    justifyContent: 'center', alignItems: 'center', padding: 24,
                }}>
                    <View style={{
                        width: '100%', maxWidth: 420,
                        backgroundColor: isDark ? '#0f172a' : '#fff',
                        borderRadius: 24, padding: 28,
                        borderWidth: 1, borderColor: isDark ? 'rgba(56,180,186,0.3)' : 'rgba(56,180,186,0.2)',
                    }}>
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <CheckCircle size={48} color="#38b4ba" />
                        </View>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, textAlign: 'center', marginBottom: 8 }}>
                            Release Created!
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.text.secondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
                            Your ERC-1155 release is live on-chain. Claim conditions and royalties have been set.
                        </Text>

                        {erc1155Success && (
                            <>
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                                    borderRadius: 14, padding: 16, marginBottom: 20,
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                                    gap: 8,
                                }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 12, color: colors.text.muted, fontWeight: '600' }}>TOKEN ID</Text>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>#{erc1155Success.tokenId}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 12, color: colors.text.muted, fontWeight: '600' }}>CONTRACT</Text>
                                        <Text style={{ fontSize: 11, color: colors.text.secondary, fontFamily: 'monospace' }}>
                                            {erc1155Success.contractAddress.slice(0, 10)}…{erc1155Success.contractAddress.slice(-6)}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 12, color: colors.text.muted, fontWeight: '600' }}>STANDARD</Text>
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#38b4ba' }}>ERC-1155</Text>
                                    </View>
                                </View>

                                <AnimatedPressable
                                    preset="button"
                                    onPress={() => {
                                        const url = `https://testnets.opensea.io/assets/amoy/${erc1155Success.contractAddress}/${erc1155Success.tokenId}`;
                                        Linking.openURL(url);
                                    }}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        paddingVertical: 14, borderRadius: 14,
                                        borderWidth: 1, borderColor: '#38b4ba',
                                        backgroundColor: 'transparent', marginBottom: 12,
                                    }}
                                >
                                    <ExternalLink size={16} color="#38b4ba" />
                                    <Text style={{ color: '#38b4ba', fontWeight: '700', fontSize: 15 }}>View on OpenSea Testnet</Text>
                                </AnimatedPressable>
                            </>
                        )}

                        <AnimatedPressable
                            preset="button"
                            onPress={() => {
                                setShowSuccessModal(false);
                                setErc1155Success(null);
                            }}
                            style={{
                                paddingVertical: 14, borderRadius: 14,
                                backgroundColor: '#8b5cf6',
                                alignItems: 'center',
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Done</Text>
                        </AnimatedPressable>
                    </View>
                </View>
            </Modal>
        </Container>
    );
}
