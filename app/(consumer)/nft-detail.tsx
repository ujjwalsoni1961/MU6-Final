import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, Alert } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ExternalLink, ShoppingCart, Zap, Tag, Copy, Check, Shield, ChevronRight, TrendingUp, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import RarityBadge from '../../src/components/shared/RarityBadge';
import NFTCard from '../../src/components/shared/NFTCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useActiveAccount, PayEmbed } from 'thirdweb/react';
import { prepareTransaction } from 'thirdweb';
import { thirdwebClient, activeChain } from '../../src/lib/thirdweb';
import { CONTRACT_ADDRESSES, EXPLORER_BASE, tokenUrl, txUrl, CHAIN_NAME, IS_MAINNET, CHAIN_ID } from '../../src/config/network';
import {
    useNFTReleases,
    useNFTReleaseById,
    useNFTTokenById,
    useMarketplaceListings,
    useMintToken,
    useBuyListing,
} from '../../src/hooks/useData';
import { getNFTTradeHistory } from '../../src/services/database';
import { convertTokenToFiat, formatFiat, formatToken } from '../../src/services/fxRate';
import { useCurrency } from '../../src/hooks/useCurrency';
import { useOnChainOwnership } from '../../src/hooks/useOnChainNFT';
import PriceChart from '../../src/components/shared/PriceChart';
import TradeHistoryList from '../../src/components/shared/TradeHistoryList';
import type { NFT, TradeEvent } from '../../src/types';
import { fetchErc1155ClaimState, formatWeiAsPol } from '../../src/lib/thirdweb/erc1155';
import type { Erc1155ClaimStateResult } from '../../src/lib/thirdweb/erc1155';
import { supabase } from '../../src/lib/supabase';
// Use navigator.clipboard on web, fallback for native
const copyToClipboard = async (text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
    } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(text);
    }
};

const NFT_CONTRACT = CONTRACT_ADDRESSES.SONG_NFT;
const POLYGONSCAN_BASE = EXPLORER_BASE;

type ViewMode = 'release' | 'listing';

/** Convert raw blockchain/contract errors into short, readable messages */
function friendlyError(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes('insufficient funds') || lower.includes('gas')) {
        return 'Payment failed: Insufficient funds in your wallet. Please add more POL and try again.';
    }
    if (lower.includes('user rejected') || lower.includes('user denied')) {
        return 'Transaction cancelled by user.';
    }
    if (lower.includes('sold out') || lower.includes('supply')) {
        return 'This NFT is sold out.';
    }
    if (lower.includes('already minted') || lower.includes('already claimed')) {
        return 'You have already minted this NFT.';
    }
    if (lower.includes('not active') || lower.includes('paused')) {
        return 'This NFT sale is currently paused.';
    }
    if (lower.includes('network') || lower.includes('timeout')) {
        return 'Network error. Please check your connection and try again.';
    }
    if (lower.includes('execution reverted')) {
        return 'Payment failed: Transaction was reverted by the blockchain. Your wallet was not charged.';
    }
    if (lower.includes('cannot coerce') || lower.includes('json object')) {
        return 'Something went wrong. Please try again.';
    }
    if (raw.length > 120) {
        return raw.substring(0, 117) + '...';
    }
    return raw;
}

function truncateAddress(addr: string): string {
    if (!addr || addr.length < 10) return addr || '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyButton({ text, colors, isDark }: { text: string; colors: any; isDark: boolean }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await copyToClipboard(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };
    return (
        <AnimatedPressable preset="icon" onPress={handleCopy} style={{
            width: 28, height: 28, borderRadius: 8,
            alignItems: 'center' as const, justifyContent: 'center' as const,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        }}>
            {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} color={colors.text.secondary} />}
        </AnimatedPressable>
    );
}

export default function NFTDetailScreen() {
    const { id, mode: modeParam, listingId: listingParam } = useLocalSearchParams<{
        id: string;
        mode?: string;
        listingId?: string;
    }>();
    const router = useRouter();
    const isWeb = Platform.OS === 'web';
    const { isDark, colors } = useTheme();
    const { walletAddress, profile } = useAuth();
    const account = useActiveAccount();
    const { fiatCurrency } = useCurrency();

    // Determine view mode: primary (release) or secondary (listing)
    const viewMode: ViewMode = modeParam === 'listing' ? 'listing' : 'release';

    // Data hooks
    const { data: allNFTs, loading: releasesLoading } = useNFTReleases();
    const { data: singleRelease, loading: singleLoading } = useNFTReleaseById(viewMode === 'release' ? id : '');
    const { data: singleToken, loading: tokenLoading } = useNFTTokenById(viewMode === 'release' ? id : '');
    const { data: allListings, loading: listingsLoading } = useMarketplaceListings();
    const loading = releasesLoading || listingsLoading || singleLoading || tokenLoading;

    // Mutation hooks
    const mintHook = useMintToken();
    const buyHook = useBuyListing();

    // Trade History State
    const [tradeHistory, setTradeHistory] = useState<TradeEvent[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // FX Price Display
    const [fiatPrice, setFiatPrice] = useState<string | null>(null);

    // Secondary Market / ERC-1155 state
    // Holds raw release fields (nft_standard, token_id, contract_address)
    // fetched directly from nft_releases to avoid adapter loss.
    const [releaseOnChain, setReleaseOnChain] = useState<{
        nftStandard: string;
        tokenId: string | null;      // ERC-1155 token ID from nft_releases.token_id
        contractAddress: string | null;
    } | null>(null);
    const [claimState, setClaimState] = useState<Erc1155ClaimStateResult | null>(null);
    const [claimStateLoading, setClaimStateLoading] = useState(false);
    const [salesHistory, setSalesHistory] = useState<any[]>([]);
    const [salesHistoryLoading, setSalesHistoryLoading] = useState(false);

    // Find the relevant NFT (try release ID first, then token ID as fallback from collection)
    const nft = viewMode === 'listing'
        ? allListings.find((l) => l.listingId === listingParam || l.id === id)
        : (singleRelease || allNFTs.find((n) => n.id === id) || singleToken);

    const listing = viewMode === 'listing'
        ? allListings.find((l) => l.listingId === listingParam || l.id === id)
        : null;

    // More NFTs (mix of releases and listings)
    const moreNFTs = allNFTs.filter((n) => n.id !== id).slice(0, 10);

    // Determine owner wallet for display — ON-CHAIN IS SOURCE OF TRUTH (PDF #17).
    // DB ownerWallet is a lagging index; prefer live on-chain ownerOf read.
    //
    // This hook MUST be called before any conditional early returns (loading /
    // !nft) below. React enforces a consistent hook call order across renders
    // (https://react.dev/link/rules-of-hooks) — placing it after `if (loading)`
    // or `if (!nft)` caused the "Rendered more hooks than during the previous
    // render" error when the NFT loaded on the second pass.
    const onChainTokenId = nft?.onChainTokenId || '';
    const { owner: onChainOwner } = useOnChainOwnership(onChainTokenId || null);

    // ─── Action handlers ───

    const handleMint = useCallback(async () => {
        if (!nft || !walletAddress) {
            Alert.alert('Connect Wallet', 'Please connect your wallet to mint NFTs.');
            return;
        }
        // nft.id is the release ID for primary sales
        const tokenId = await mintHook.execute(nft.id, walletAddress, account || undefined);
        if (tokenId) {
            Alert.alert('Success', 'NFT purchased successfully! Check your Collection.', [
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

    // Reset mutation states when navigating to this page or away
    useEffect(() => {
        mintHook.reset();
        buyHook.reset();
        return () => {
            mintHook.reset();
            buyHook.reset();
        };
    }, [id]);

    // Fetch fiat price equivalent for the NFT price in user's preferred currency
    useEffect(() => {
        let isMounted = true;
        const price = nft?.price ?? (listing as any)?.price;
        if (price != null && price > 0) {
            convertTokenToFiat(price, fiatCurrency)
                .then((fiatValue) => {
                    if (isMounted) setFiatPrice(formatFiat(fiatValue, fiatCurrency));
                })
                .catch(() => {
                    if (isMounted) setFiatPrice(null);
                });
        }
        return () => { isMounted = false; };
    }, [nft, listing, fiatCurrency]);

    // ── Fetch raw release fields (nft_standard, token_id, contract_address) ──
    // The UI adapter strips these fields; we re-fetch them directly to drive
    // ERC-1155 claim state reads and OpenSea deep-links.
    useEffect(() => {
        let isMounted = true;
        const releaseId = viewMode === 'release' ? id : null;
        if (!releaseId) return;
        supabase
            .from('nft_releases')
            .select('nft_standard, token_id, contract_address')
            .eq('id', releaseId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (!isMounted || error || !data) return;
                if (isMounted) {
                    setReleaseOnChain({
                        nftStandard: (data as any).nft_standard || 'erc721',
                        tokenId: (data as any).token_id != null ? String((data as any).token_id) : null,
                        contractAddress: (data as any).contract_address || null,
                    });
                }
            });
        return () => { isMounted = false; };
    }, [id, viewMode]);

    // ── Fetch ERC-1155 on-chain claim state ──
    useEffect(() => {
        let isMounted = true;
        if (!releaseOnChain) return;
        const { nftStandard, tokenId, contractAddress } = releaseOnChain;
        // Only ERC-1155 releases with a known token_id have per-token claim conditions
        if (nftStandard !== 'erc1155' || tokenId == null || !contractAddress) return;

        setClaimStateLoading(true);
        fetchErc1155ClaimState(
            contractAddress,
            BigInt(tokenId),
            CHAIN_ID,
            walletAddress || undefined,
        ).then((result) => {
            if (isMounted) {
                setClaimState(result);
                setClaimStateLoading(false);
            }
        }).catch(() => {
            if (isMounted) setClaimStateLoading(false);
        });
        return () => { isMounted = false; };
    }, [releaseOnChain, walletAddress]);

    // ── Fetch nft_sales_history (last 10 sales for this contract + token) ──
    useEffect(() => {
        let isMounted = true;
        if (!releaseOnChain) return;
        const { tokenId, contractAddress } = releaseOnChain;
        if (tokenId == null || !contractAddress) return;

        setSalesHistoryLoading(true);
        supabase
            .from('nft_sales_history')
            .select('id, marketplace, seller, buyer, price_wei, tx_hash, block_timestamp, amount')
            .eq('contract_address', contractAddress)
            .eq('token_id', tokenId)
            .eq('chain_id', CHAIN_ID)
            .neq('marketplace', 'transfer')
            .order('block_timestamp', { ascending: false })
            .limit(10)
            .then(({ data, error }) => {
                if (!isMounted) return;
                setSalesHistory(error ? [] : (data || []));
                setSalesHistoryLoading(false);
            });
        return () => { isMounted = false; };
    }, [releaseOnChain]);

    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async () => {
            const tokenId = listing?.nftTokenId;
            const releaseId = nft?.id;
            
            if (!tokenId && !releaseId) {
                if (isMounted) setTradeHistory([]);
                return;
            }

            setHistoryLoading(true);
            try {
                // If viewing a specific listing, show its specific history.
                // Otherwise, show aggregate release history.
                const data = await getNFTTradeHistory({ 
                    tokenId, 
                    releaseId: tokenId ? undefined : releaseId 
                });
                if (isMounted) {
                    setTradeHistory(data);
                }
            } catch (err) {
                console.error('[nft-detail] load history error:', err);
                if (isMounted) setTradeHistory([]);
            } finally {
                if (isMounted) setHistoryLoading(false);
            }
        };

        fetchHistory();
        return () => { isMounted = false; };
    }, [nft, listing]);

    if (loading) {
        return (
            <ScreenScaffold dominantColor="#8b5cf6" contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <ActivityIndicator size="large" color="#8b5cf6" />
                </View>
            </ScreenScaffold>
        );
    }

    if (!nft) {
        return (
            <ScreenScaffold dominantColor="#8b5cf6" contentContainerStyle={{ paddingBottom: 40 }}>
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
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>
                        NFT not found
                    </Text>
                    <AnimatedPressable
                        preset="button"
                        onPress={() => router.back()}
                        style={{
                            marginTop: 16,
                            backgroundColor: '#8b5cf6',
                            borderRadius: 20,
                            paddingVertical: 12,
                            paddingHorizontal: 24,
                        }}
                    >
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Go Back</Text>
                    </AnimatedPressable>
                </View>
            </ScreenScaffold>
        );
    }

    const isPrimary = viewMode === 'release';
    const mintedCount = nft.mintedCount ?? nft.editionNumber ?? 0;
    const isSoldOut = isPrimary && mintedCount >= nft.totalEditions;
    const isOwnRelease = isPrimary && profile?.id === nft.creatorId;
    const isOwnListing = listing && walletAddress
        ? listing.sellerWallet.toLowerCase() === walletAddress.toLowerCase()
        : false;

    const actionLoading = mintHook.loading || buyHook.loading;
    const rawActionError = mintHook.error || buyHook.error;
    const actionSuccess = mintHook.success || buyHook.success;
    const actionError = rawActionError ? friendlyError(rawActionError) : null;

    const canMint = isPrimary && !isOwnRelease;
    const canBuy = !isPrimary && !isOwnListing;

    let buttonLabel = 'Buy Now';
    let buttonDisabled = false;
    let buttonColor = '#8b5cf6';

    if (actionLoading) {
        buttonLabel = 'Purchasing...';
        buttonDisabled = true;
    } else if (actionSuccess) {
        buttonLabel = 'Success!';
        buttonDisabled = true;
        buttonColor = '#10b981';
    } else if (isSoldOut) {
        buttonLabel = 'Sold Out';
        buttonDisabled = true;
        buttonColor = '#64748b';
    } else if (isOwnRelease) {
        buttonLabel = `${mintedCount} of ${nft.totalEditions} Collected`;
        buttonDisabled = true;
        buttonColor = '#64748b';
    } else if (isOwnListing) {
        buttonLabel = 'Manage Listing';
        buttonDisabled = false;
        buttonColor = '#8b5cf6';
    } else if (!walletAddress) {
        buttonLabel = 'Connect Wallet';
        buttonDisabled = true;
        buttonColor = '#64748b';
    }

    const handleCreatorPress = () => {
        if (nft.creatorId) {
            router.push({ pathname: '/(consumer)/artist-profile', params: { id: nft.creatorId } });
        }
    };

    // Owner wallet — on-chain read happens above (before early returns) to obey
    // the Rules of Hooks. Fall back to DB columns only if on-chain read hasn't
    // resolved yet.
    const ownerWallet = onChainOwner || nft.ownerWallet || nft.owner || '';

    // Get the first trade event as mint price reference
    const mintEvent = tradeHistory.find(t => t.type === 'mint');
    const lastSaleEvent = [...tradeHistory].reverse().find(t => t.type === 'sale');

    const parsedBenefits = (() => {
        if (!nft?.benefits) return [];
        if (typeof nft.benefits === 'string') {
            try { return JSON.parse(nft.benefits); } catch { return []; }
        }
        if (Array.isArray(nft.benefits)) return nft.benefits;
        return [];
    })();

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
                                <AnimatedPressable preset="row" onPress={handleCreatorPress}>
                                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -1 }}>{nft.songTitle}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 2 }}>by {nft.artistName}</Text>
                                </AnimatedPressable>
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
                                <AnimatedPressable preset="row" onPress={handleCreatorPress}>
                                    <Text style={{ fontSize: 20, color: colors.text.secondary }}>by {nft.artistName}</Text>
                                </AnimatedPressable>
                            </View>
                        )}

                        {/* Edition & Release Info */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            {/* Sale Type Badge */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: isPrimary ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)',
                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6,
                            }}>
                                {isPrimary ? <Zap size={14} color="#8b5cf6" /> : <Tag size={14} color="#f59e0b" />}
                                <Text style={{ fontSize: 12, fontWeight: '700', color: isPrimary ? '#8b5cf6' : '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {isPrimary ? 'Primary Sale' : 'Secondary Sale'}
                                </Text>
                            </View>
                            {/* Edition Badge */}
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                            }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>
                                    {isPrimary || nft.nftStandard === 'erc1155'
                                        ? `${mintedCount} of ${nft.totalEditions} minted`
                                        : nft.editionNumber > 0
                                            ? `Edition ${nft.editionNumber} of ${nft.totalEditions}`
                                            : `${nft.totalEditions} Editions`}
                                </Text>
                            </View>
                            {/* Tier Name */}
                            {nft.tierName && (
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                                }}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>
                                        {nft.tierName}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Price Card */}
                        <GlassCard intensity="heavy" style={{ marginBottom: 16 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                {isPrimary ? 'Mint Price' : 'Listing Price'}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                {fiatPrice ? (
                                    <>
                                        <Text style={{ fontSize: 40, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1 }}>
                                            {fiatPrice}
                                        </Text>
                                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.secondary }}>
                                            ({formatToken(nft.price)})
                                        </Text>
                                    </>
                                ) : (
                                    <Text style={{ fontSize: 40, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1 }}>
                                        {nft.price} POL
                                    </Text>
                                )}
                            </View>

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
                                onPress={isOwnListing ? () => router.push('/(consumer)/collection') : canMint ? handleMint : handleBuyListing}
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

                            {/* PayEmbed — fiat card payment option (web only) */}
                            {isWeb && !actionSuccess && walletAddress && typeof PayEmbed !== 'undefined' && PayEmbed && (
                                (isPrimary && canMint && !isSoldOut) || (!isPrimary && listing && !isOwnListing)
                            ) && (
                                <View style={{ marginTop: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.text.secondary + '30' }} />
                                        <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600', marginHorizontal: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                                            or pay with card
                                        </Text>
                                        <View style={{ flex: 1, height: 1, backgroundColor: colors.text.secondary + '30' }} />
                                    </View>
                                    <PayEmbed
                                        client={thirdwebClient}
                                        payOptions={{
                                            mode: 'transaction',
                                            transaction: prepareTransaction({
                                                to: '0x76BCCe5DBDc244021bCF7D2fc4376F1B62d74c39',
                                                chain: activeChain,
                                                client: thirdwebClient,
                                                value: BigInt(Math.round((nft.price || 0) * 1e18)),
                                            }),
                                            metadata: {
                                                name: nft.songTitle,
                                                image: nft.coverImage,
                                            },
                                        }}
                                        theme="dark"
                                    />
                                </View>
                            )}
                        </GlassCard>

                        {/* Benefits / Perks Section */}
                        {parsedBenefits.length > 0 && (
                            <GlassCard intensity="light" style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    This NFT includes
                                </Text>
                                {parsedBenefits.map((benefit: any, idx: number) => (
                                    <View key={idx} style={{ flexDirection: 'row', gap: 10, marginBottom: idx < parsedBenefits.length - 1 ? 10 : 0 }}>
                                        <View style={{
                                            width: 22, height: 22, borderRadius: 11,
                                            backgroundColor: 'rgba(16,185,129,0.15)',
                                            alignItems: 'center' as const, justifyContent: 'center' as const,
                                            marginTop: 1,
                                        }}>
                                            <Check size={12} color="#10b981" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                                                {benefit.title}
                                            </Text>
                                            {benefit.description ? (
                                                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                                                    {benefit.description}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>
                                ))}
                            </GlassCard>
                        )}

                        {/* Streaming Royalty Info — temporarily disabled.
                            NFT-holder revenue share is not available for this first launch.
                            Streaming revenue flows only to split-sheet parties; NFT sale
                            revenue goes directly to the primary creator. UI will return
                            once the feature is re-enabled. */}

                        {/* Description */}
                        {nft.description && (
                            <GlassCard intensity="light" style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
                                    Description
                                </Text>
                                <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 22 }}>
                                    {nft.description}
                                </Text>
                            </GlassCard>
                        )}

                        {/* On-Chain Verification */}
                        <GlassCard intensity="light" style={{ marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <Shield size={16} color="#8b5cf6" />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                    On-Chain Details
                                </Text>
                            </View>

                            {/* Token ID */}
                            {onChainTokenId ? (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Token ID</Text>
                                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                        #{onChainTokenId}
                                    </Text>
                                </View>
                            ) : null}

                            {/* Contract Address */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Contract</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ color: colors.text.primary, fontSize: 13, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                        {truncateAddress(NFT_CONTRACT)}
                                    </Text>
                                    <CopyButton text={NFT_CONTRACT} colors={colors} isDark={isDark} />
                                </View>
                            </View>

                            {/* Chain */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Chain</Text>
                                <Text style={{ color: colors.text.primary, fontSize: 13 }}>{IS_MAINNET ? CHAIN_NAME : `${CHAIN_NAME} Testnet`}</Text>
                            </View>

                            {/* Owner */}
                            {ownerWallet ? (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Owner</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: colors.text.primary, fontSize: 13, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                            {truncateAddress(ownerWallet)}
                                        </Text>
                                        <CopyButton text={ownerWallet} colors={colors} isDark={isDark} />
                                    </View>
                                </View>
                            ) : null}

                            {/* View on Polygonscan */}
                            <AnimatedPressable
                                preset="button"
                                onPress={() => {
                                    const url = onChainTokenId
                                        ? `${POLYGONSCAN_BASE}/token/${NFT_CONTRACT}?a=${onChainTokenId}`
                                        : `${POLYGONSCAN_BASE}/token/${NFT_CONTRACT}`;
                                    if (Platform.OS === 'web') {
                                        window.open(url, '_blank');
                                    } else {
                                        import('expo-linking').then(Linking => Linking.openURL(url));
                                    }
                                }}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    paddingVertical: 12, borderRadius: 12, marginTop: 4,
                                    backgroundColor: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.06)',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.12)',
                                }}
                            >
                                <ExternalLink size={14} color="#8b5cf6" />
                                <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 13 }}>View on Polygonscan</Text>
                            </AnimatedPressable>
                        </GlassCard>

                        {/* Price Info (Mint + Last Sale) */}
                        {(mintEvent || lastSaleEvent) && (
                            <GlassCard intensity="light" style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    Price Info
                                </Text>
                                {mintEvent && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: lastSaleEvent ? 10 : 0 }}>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Mint Price</Text>
                                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                                            {formatToken(mintEvent.price)}
                                        </Text>
                                    </View>
                                )}
                                {lastSaleEvent && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Last Sale</Text>
                                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                                            {formatToken(lastSaleEvent.price)}
                                        </Text>
                                    </View>
                                )}
                            </GlassCard>
                        )}

                        {/* Secondary Market & ERC-1155 Claim State */}
                        {isPrimary && releaseOnChain?.nftStandard === 'erc1155' && (
                            <GlassCard intensity="light" style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <TrendingUp size={16} color="#38b4ba" />
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                        Secondary Market
                                    </Text>
                                </View>

                                {/* ERC-1155 On-Chain Claim State */}
                                {claimStateLoading ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                                        <ActivityIndicator size="small" color="#38b4ba" />
                                    </View>
                                ) : claimState?.success && claimState.condition ? (
                                    <View style={{ marginBottom: 14 }}>
                                        {/* On-chain price */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>On-Chain Price</Text>
                                            <Text style={{ color: '#38b4ba', fontSize: 13, fontWeight: '700' }}>
                                                {formatWeiAsPol(claimState.condition.pricePerToken)} POL
                                            </Text>
                                        </View>
                                        {/* Supply remaining */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Supply Remaining</Text>
                                            <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>
                                                {claimState.condition.supplyRemaining === null
                                                    ? 'Unlimited'
                                                    : claimState.condition.supplyRemaining.toString()}
                                            </Text>
                                        </View>
                                        {/* Holder balance */}
                                        {claimState.holderBalance !== null && walletAddress && (
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Users size={12} color={colors.text.secondary} />
                                                    <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Your Balance</Text>
                                                </View>
                                                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>
                                                    {claimState.holderBalance.toString()} token{claimState.holderBalance !== BigInt(1) ? 's' : ''}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                ) : null}

                                {/* Recent Sales from nft_sales_history */}
                                {salesHistoryLoading ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                                        <ActivityIndicator size="small" color="#38b4ba" />
                                    </View>
                                ) : salesHistory.length > 0 ? (
                                    <View style={{ marginBottom: 14 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                            Recent Sales
                                        </Text>
                                        {salesHistory.slice(0, 5).map((sale: any) => (
                                            <View
                                                key={sale.id}
                                                style={{
                                                    flexDirection: 'row',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    paddingVertical: 6,
                                                    borderBottomWidth: 1,
                                                    borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                                }}
                                            >
                                                <View>
                                                    <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>
                                                        {sale.marketplace.replace('_', ' ')}
                                                    </Text>
                                                    {sale.block_timestamp && (
                                                        <Text style={{ color: colors.text.secondary, fontSize: 10, marginTop: 1 }}>
                                                            {new Date(sale.block_timestamp).toLocaleDateString()}
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>
                                                    {sale.price_wei
                                                        ? `${formatWeiAsPol(BigInt(sale.price_wei))} POL`
                                                        : '—'}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : null}

                                {/* Action buttons */}
                                <View style={{ gap: 10 }}>
                                    {/* View on OpenSea */}
                                    {releaseOnChain?.contractAddress && releaseOnChain?.tokenId && (
                                        <AnimatedPressable
                                            preset="button"
                                            onPress={() => {
                                                const url = `https://testnets.opensea.io/assets/amoy/${releaseOnChain.contractAddress}/${releaseOnChain.tokenId}`;
                                                if (Platform.OS === 'web') {
                                                    window.open(url, '_blank');
                                                } else {
                                                    import('expo-linking').then(Linking => Linking.openURL(url));
                                                }
                                            }}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                paddingVertical: 11, borderRadius: 12,
                                                backgroundColor: isDark ? 'rgba(56,180,186,0.1)' : 'rgba(56,180,186,0.06)',
                                                borderWidth: 1,
                                                borderColor: isDark ? 'rgba(56,180,186,0.25)' : 'rgba(56,180,186,0.15)',
                                            }}
                                        >
                                            <ExternalLink size={14} color="#38b4ba" />
                                            <Text style={{ color: '#38b4ba', fontWeight: '700', fontSize: 13 }}>View on OpenSea</Text>
                                        </AnimatedPressable>
                                    )}

                                    {/* List on MU6 — only shown to token holders */}
                                    {walletAddress && claimState?.holderBalance != null && claimState.holderBalance > BigInt(0) && (
                                        <AnimatedPressable
                                            preset="button"
                                            onPress={() => router.push('/(consumer)/collection')}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                paddingVertical: 11, borderRadius: 12,
                                                backgroundColor: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.06)',
                                                borderWidth: 1,
                                                borderColor: isDark ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.15)',
                                            }}
                                        >
                                            <Tag size={14} color="#8b5cf6" />
                                            <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 13 }}>List on MU6</Text>
                                        </AnimatedPressable>
                                    )}
                                </View>
                            </GlassCard>
                        )}

                        {/* Creator / Seller info */}
                        <GlassCard intensity="light" style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                    {isPrimary ? 'Creator' : 'Seller'}
                                </Text>
                                <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14, marginTop: 4 }}>
                                    {isPrimary
                                        ? nft.artistName
                                        : listing
                                            ? truncateAddress(listing.sellerWallet)
                                            : truncateAddress(ownerWallet)}
                                </Text>
                            </View>
                            <AnimatedPressable
                                preset="icon"
                                onPress={handleCreatorPress}
                                style={{
                                    width: 36, height: 36, borderRadius: 18,
                                    alignItems: 'center' as const, justifyContent: 'center' as const,
                                    backgroundColor: isDark ? 'rgba(116,229,234,0.2)' : 'rgba(116,229,234,0.12)',
                                }}
                            >
                                <ChevronRight size={16} color="#38b4ba" />
                            </AnimatedPressable>
                        </GlassCard>
                    </View>
                </View>

                {/* Trade History & Analytics */}
                <View style={{ paddingHorizontal: 16, marginBottom: 40, marginTop: 10, maxWidth: isWeb ? 1200 : undefined, alignSelf: isWeb ? 'center' : 'auto', width: '100%' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                        Trade History
                    </Text>
                    
                    <GlassCard intensity="heavy" style={{ padding: 20 }}>
                        {historyLoading ? (
                            <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#8b5cf6" />
                            </View>
                        ) : tradeHistory.length === 0 ? (
                            <View style={{ height: 100, justifyContent: 'center', alignItems: 'center' }}>
                                <Text style={{ color: colors.text.secondary }}>No trade history yet.</Text>
                            </View>
                        ) : (
                            <>
                                <View style={{ marginBottom: 30 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Price Trend</Text>
                                    <View style={{ height: 220 }}>
                                        <PriceChart data={tradeHistory} />
                                    </View>
                                </View>
                                
                                <View>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Recent Activity</Text>
                                    <TradeHistoryList data={tradeHistory} />
                                </View>
                            </>
                        )}
                    </GlassCard>
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
                                        nftStandard={n.nftStandard}
                                        mintedCount={n.mintedCount}
                                        totalEditions={n.totalEditions}
                                        rarity={n.rarity}
                                        fiatCurrency={fiatCurrency}
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
