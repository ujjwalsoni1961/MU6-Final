import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import RarityBadge from './RarityBadge';
import PriceTag from './PriceTag';
import AnimatedPressable from './AnimatedPressable';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

import type { FiatCurrency } from '../../services/fxRate';

interface NFTCardProps {
    cover: string;
    title: string;
    artist: string;
    price: number;
    editionNumber: number;
    totalEditions: number;
    rarity: 'common' | 'rare' | 'legendary';
    /** NFT standard — drives edition label (ERC-721 = "Edition N of X", ERC-1155 = "N of X minted"). */
    nftStandard?: 'erc721' | 'erc1155';
    /** Copies already claimed/sold — used for ERC-1155 label. */
    mintedCount?: number;
    /** 'collect' (default) for consumer marketplace, 'manage' for artist NFT Manager, 'collection' for owned NFTs (no bottom button) */
    variant?: 'collect' | 'manage' | 'collection';
    /** Optional: pass user's preferred fiat currency to show fiat prices on the tag */
    fiatCurrency?: FiatCurrency;
    onPress?: () => void;
}

import { useTheme } from '../../context/ThemeContext';

export default function NFTCard({
    cover, title, artist, price, editionNumber, totalEditions, rarity, nftStandard, mintedCount, variant = 'collect', fiatCurrency, onPress,
}: NFTCardProps) {
    const { isDark, colors } = useTheme();

    return (
        <AnimatedPressable
            preset="card"
            onPress={onPress}
            style={{
                flex: variant === 'manage' ? undefined : 1,
                margin: 6,
                borderRadius: variant === 'manage' ? 14 : (isWeb ? 16 : 24),
                overflow: 'hidden',
                backgroundColor: isWeb
                    ? colors.bg.card
                    : (isDark
                        ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.03)')
                        : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.4)')),
                borderWidth: isWeb ? (isDark ? 0 : 1) : 0,
                borderColor: isWeb ? colors.border.base : 'transparent',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isAndroid ? 0 : 0.08,
                shadowRadius: 8,
                elevation: isAndroid ? 2 : 4,
            }}
        >
            {/* Image */}
            <View style={{ overflow: 'hidden', borderTopLeftRadius: variant === 'manage' ? 14 : (isWeb ? 16 : 24), borderTopRightRadius: variant === 'manage' ? 14 : (isWeb ? 16 : 24) }}>
                <Image source={{ uri: cover }} style={{ width: '100%', aspectRatio: variant === 'manage' ? 4 / 3 : 1, maxHeight: variant === 'manage' ? 160 : undefined }} contentFit="cover" />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.9)'] as any}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: variant === 'manage' ? 70 : 100 }}
                />
                {/* Rarity badge — top LEFT */}
                <View style={{ position: 'absolute', top: 8, left: 8 }}>
                    <RarityBadge rarity={rarity} />
                </View>
                {/* Price tag — top RIGHT */}
                <View style={{ position: 'absolute', top: 8, right: 8 }}>
                    <PriceTag price={price} dark fiatCurrency={fiatCurrency} />
                </View>
                <View style={{ position: 'absolute', bottom: variant === 'manage' ? 8 : 12, left: variant === 'manage' ? 8 : 12, right: variant === 'manage' ? 8 : 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: variant === 'manage' ? 12 : 13, lineHeight: variant === 'manage' ? 16 : 20, paddingBottom: 2 }} numberOfLines={1}>{title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: variant === 'manage' ? 10 : 11, lineHeight: variant === 'manage' ? 12 : 14 }} numberOfLines={1}>{artist}</Text>
                </View>
            </View>

            {/* Bottom section */}
            <View style={{ padding: variant === 'manage' ? 8 : 12 }}>
                <Text style={{
                    color: isDark ? '#94a3b8' : '#475569',
                    fontSize: variant === 'manage' ? 9 : 10,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                }}>
                    {nftStandard === 'erc1155'
                        ? `${mintedCount ?? 0} of ${totalEditions} minted`
                        : (editionNumber > 0 ? `Edition ${editionNumber} of ${totalEditions}` : `${totalEditions} Editions`)}
                </Text>
                {variant !== 'collection' && (
                    <AnimatedPressable
                        preset="button"
                        onPress={onPress}
                        style={{
                            backgroundColor: variant === 'manage' ? (isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.12)') : '#8b5cf6',
                            borderRadius: variant === 'manage' ? 8 : (isWeb ? 10 : 14),
                            paddingVertical: variant === 'manage' ? 7 : 10,
                            alignItems: 'center' as const,
                            marginTop: variant === 'manage' ? 6 : 8,
                            ...(variant === 'manage' ? { borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' } : {}),
                        }}
                    >
                        <Text style={{ color: variant === 'manage' ? '#8b5cf6' : '#ffffff', fontWeight: '700', fontSize: variant === 'manage' ? 11 : 13 }}>
                            {variant === 'manage' ? 'View Details' : 'Collect Now'}
                        </Text>
                    </AnimatedPressable>
                )}
            </View>
        </AnimatedPressable>
    );
}
