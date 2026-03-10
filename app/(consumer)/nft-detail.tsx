import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, Alert } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ExternalLink, ShoppingCart, Zap, Tag } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import RarityBadge from '../../src/components/shared/RarityBadge';
import NFTCard from '../../src/components/shared/NFTCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useActiveAccount } from 'thirdweb/react';
import {
    useNFTReleases,
    useMarketplaceListings,
    useMintToken,
    useBuyListing,
} from '../../src/hooks/useData';
import type { NFT } from '../../src/types';

type ViewMode = 'release' | 'listing';

export default function NFTDetailScreen() {
    const { id, mode: modeParam, listingId: listingParam } = useLocalSearchParams<{
        id: string;
        mode?: string;
        listingId?: string;
    }>();
    const router = useRouter();
    const isWeb = Platform.OS === 'web';
    const { isDark, colors } = useTheme();
    const { walletAddress } = useAuth();
    const account = useActiveAccount();

    // Determine view mode: primary (release) or secondary (listing)
    const viewMode: ViewMode = modeParam === 'listing' ? 'listing' : 'release';

    // Data hooks
    const { data: allNFTs, loading: releasesLoading } = useNFTReleases();
    const { data: allListings, loading: listingsLoading } = useMarketplaceListings();
    const loading = releasesLoading || listingsLoading;

    // Mutation hooks
    const mintHook = useMintToken();
    const buyHook = useBuyListing();

    // Find the relevant NFT
    const nft = viewMode === 'listing'
        ? allListings.find((l) => l.listingId === listingParam || l.id === id)
        : allNFTs.find((n) => n.id === id) || allNFTs[0];

    const listing = viewMode === 'listing'
        ? allListings.find((l) => l.listingId === listingParam || l.id === id)
        : null;

    // More NFTs (mix of releases and listings)
    const moreNFTs = allNFTs.filter((n) => n.id !== id).slice(0, 10);

    // ─── Action handlers ───

    const handleMint = useCallback(async () => {
        if (!nft || !walletAddress) {
            Alert.alert('Connect Wallet', 'Please connect your wallet to mint NFTs.');
            return;
        }
        // nft.id is the release ID for primary sales
        const tokenId = await mintHook.execute(nft.id, walletAddress, account || undefined);
        if (tokenId) {
            Alert.alert('Success', 'NFT minted successfully! Check your Collection.', [
                { text: 'View Collection', onPress: () => router.push('/(consumer)/collection') },
                { text: 'OK' },
            ]);
        }
    }, [nft, walletAddress, account, mintHook.execute]);

    const handleBuyListing = useCallback(async () => {
        if (!listing || !walletAddress) {
            Alert.alert('Connect Wallet', 'Please connect your wallet to purchase NFTs.');
            return;
        }
        const success = await buyHook.execute(listing.listingId, walletAddress, account || undefined);
        if (success) {
            Alert.alert('Success', 'NFT purchased! Check your Collection.', [
                { text: 'View Collection', onPress: () => router.push('/(consumer)/collection') },
                { text: 'OK' },
            ]);
        }
    }, [listing, walletAddress, account, buyHook.execute]);

    // Reset mutation states when navigating away
    useEffect(() => {
        return () => {
            mintHook.reset();
            buyHook.reset();
        };
    }, [id]);

    if (loading || !nft) {
        return (
            <ScreenScaffold dominantColor="#8b5cf6" contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <ActivityIndicator size="large" color="#8b5cf6" />
                </View>
            </ScreenScaffold>
        );
    }

    const truncatedOwner = nft.owner
        ? `${nft.owner.slice(0, 6)}...${nft.owner.slice(-4)}`
        : 'Not yet minted';

    const isPrimary = viewMode === 'release';
    const isSoldOut = isPrimary && nft.editionNumber > nft.totalEditions;
    const isOwnListing = listing && walletAddress
        ? listing.sellerWallet.toLowerCase() === walletAddress.toLowerCase()
        : false;

    const actionLoading = mintHook.loading || buyHook.loading;
    const actionError = mintHook.error || buyHook.error;
    const actionSuccess = mintHook.success || buyHook.success;

    // Determine button state
    // Both creators and consumers can mint from primary sales
    const canMint = isPrimary;
    const canBuy = !isPrimary && !isOwnListing;

    let buttonLabel = canMint ? 'Collect Now' : 'Buy Now';
    let buttonDisabled = false;
    let buttonColor = '#8b5cf6';

    if (actionLoading) {
        buttonLabel = canMint ? 'Minting...' : 'Purchasing...';
        buttonDisabled = true;
    } else if (actionSuccess) {
        buttonLabel = 'Success!';
        buttonDisabled = true;
        buttonColor = '#10b981';
    } else if (isSoldOut) {
        buttonLabel = 'Sold Out';
        buttonDisabled = true;
        buttonColor = '#64748b';
    } else if (isOwnListing) {
        buttonLabel = 'Your Listing';
        buttonDisabled = true;
        buttonColor = '#64748b';
    } else if (!walletAddress) {
        buttonLabel = 'Connect Wallet';
        buttonDisabled = true;
        buttonColor = '#64748b';
    }

    return (
        <ScreenScaffold dominantColor="#8b5cf6" contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={[
                isWeb ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : { flex: 1 },
            ]}>
                {/* Back Button */}
                <View style={{ paddingHorizontal: 16 }}>
                    <AnimatedPressable
                        preset="icon"
                        onPress={() => router.back()}
                        style={{
                            width: 40, height: 40, borderRadius: 20, marginTop: isWeb ? 20 : 8, marginBottom: 8,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                            alignItems: 'center' as const, justifyContent: 'center' as const,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        }}
                    >
                        <ChevronLeft size={22} color={colors.text.primary} />
                    </AnimatedPressable>
                </View>

                <View style={[
                    isWeb ? { flexDirection: 'row', gap: 40, paddingVertical: 40, paddingHorizontal: 16 } : { paddingHorizontal: 16 },
                ]}>
                    {/* NFT Cover */}
                    <View style={[
                        { borderRadius: 32, overflow: 'hidden', marginBottom: 20, position: 'relative' },
                        isWeb && { width: 400, height: 400, flexShrink: 0 },
                    ]}>
                        <Image
                            source={{ uri: nft.coverImage }}
                            style={{ width: '100%', height: isWeb ? '100%' : undefined, aspectRatio: isWeb ? undefined : 1 }}
                            contentFit="cover"
                        />
                        {!isWeb && (
                            <LinearGradient
                                colors={['transparent', isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)'] as any}
                                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 }}
                            />
                        )}
                        {!isWeb && (
                            <View style={{ position: 'absolute', top: 16, left: 16 }}>
                                <RarityBadge rarity={nft.rarity} />
                            </View>
                        )}
                        {!isWeb && (
                            <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -1 }}>{nft.songTitle}</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 2 }}>{nft.artistName}</Text>
                            </View>
                        )}
                    </View>

                    {/* Details */}
                    <View style={{ flex: 1 }}>
                        {isWeb && (
                            <View style={{ marginBottom: 24 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>{nft.songTitle}</Text>
                                    <RarityBadge rarity={nft.rarity} />
                                </View>
                                <Text style={{ fontSize: 20, color: colors.text.secondary }}>{nft.artistName}</Text>
                            </View>
                        )}

                        {/* Sale Type Badge */}
                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: isPrimary
                                    ? 'rgba(139,92,246,0.15)'
                                    : 'rgba(245,158,11,0.15)',
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 20,
                                gap: 6,
                            }}>
                                {isPrimary
                                    ? <Zap size={14} color="#8b5cf6" />
                                    : <Tag size={14} color="#f59e0b" />
                                }
                                <Text style={{
                                    fontSize: 12,
                                    fontWeight: '700',
                                    color: isPrimary ? '#8b5cf6' : '#f59e0b',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                }}>
                                    {isPrimary ? 'Primary Sale' : 'Secondary Sale'}
                                </Text>
                            </View>
                        </View>

                        {/* Price Card */}
                        <GlassCard intensity="heavy" style={{ marginBottom: 16 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                {isPrimary ? 'Mint Price' : 'Listing Price'}
                            </Text>
                            <Text style={{ fontSize: 40, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1, marginTop: 4 }}>
                                {nft.price} ETH
                            </Text>
                            <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 4 }}>
                                {isPrimary
                                    ? `${nft.editionNumber - 1} of ${nft.totalEditions} minted`
                                    : `Edition #${nft.editionNumber} of ${nft.totalEditions}`}
                            </Text>

                            {/* Error message */}
                            {actionError && (
                                <View style={{
                                    backgroundColor: 'rgba(239,68,68,0.1)',
                                    borderRadius: 12,
                                    padding: 12,
                                    marginTop: 12,
                                }}>
                                    <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>
                                        {actionError}
                                    </Text>
                                </View>
                            )}

                            {/* Action Button */}
                            <AnimatedPressable
                                preset="button"
                                onPress={canMint ? handleMint : handleBuyListing}
                                disabled={buttonDisabled}
                                style={{
                                    backgroundColor: buttonColor,
                                    borderRadius: 20,
                                    paddingVertical: 16,
                                    alignItems: 'center' as const,
                                    marginTop: 16,
                                    elevation: 8,
                                    opacity: buttonDisabled ? 0.7 : 1,
                                    flexDirection: 'row',
                                    justifyContent: 'center',
                                    gap: 8,
                                }}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <>
                                        {!buttonDisabled && (
                                            canMint
                                                ? <Zap size={18} color="#ffffff" />
                                                : <ShoppingCart size={18} color="#ffffff" />
                                        )}
                                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>
                                            {buttonLabel}
                                        </Text>
                                    </>
                                )}
                            </AnimatedPressable>
                        </GlassCard>

                        {/* Owner / Seller info */}
                        <GlassCard intensity="light" style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                    {isPrimary ? 'Creator' : 'Seller'}
                                </Text>
                                <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14, marginTop: 4 }}>
                                    {isPrimary
                                        ? nft.artistName
                                        : listing
                                            ? `${listing.sellerWallet.slice(0, 6)}...${listing.sellerWallet.slice(-4)}`
                                            : truncatedOwner}
                                </Text>
                            </View>
                            <AnimatedPressable
                                preset="icon"
                                style={{
                                    width: 36, height: 36, borderRadius: 18,
                                    alignItems: 'center' as const, justifyContent: 'center' as const,
                                    backgroundColor: isDark ? 'rgba(116,229,234,0.2)' : 'rgba(116,229,234,0.12)',
                                }}
                            >
                                <ExternalLink size={16} color="#38b4ba" />
                            </AnimatedPressable>
                        </GlassCard>
                    </View>
                </View>

                {/* More NFTs */}
                {moreNFTs.length > 0 && (
                    <>
                        <View style={{ paddingHorizontal: 16 }}>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 12 }}>More NFTs</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 32, paddingHorizontal: 16 }}>
                            {moreNFTs.map((n) => (
                                <View key={n.id} style={{ width: 176, marginRight: 12 }}>
                                    <NFTCard
                                        cover={n.coverImage}
                                        title={n.songTitle}
                                        artist={n.artistName}
                                        price={n.price}
                                        editionNumber={n.editionNumber}
                                        totalEditions={n.totalEditions}
                                        rarity={n.rarity}
                                        onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: n.id } })}
                                    />
                                </View>
                            ))}
                        </ScrollView>
                    </>
                )}
            </View>
        </ScreenScaffold>
    );
}
