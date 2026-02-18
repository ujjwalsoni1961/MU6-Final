import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import RarityBadge from './RarityBadge';
import PriceTag from './PriceTag';
import AnimatedPressable from './AnimatedPressable';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

interface NFTCardProps {
    cover: string;
    title: string;
    artist: string;
    price: number;
    editionNumber: number;
    totalEditions: number;
    rarity: 'common' | 'rare' | 'legendary';
    onPress?: () => void;
}

import { useTheme } from '../../context/ThemeContext';

export default function NFTCard({
    cover, title, artist, price, editionNumber, totalEditions, rarity, onPress,
}: NFTCardProps) {
    const { isDark, colors } = useTheme();

    return (
        <AnimatedPressable
            preset="card"
            onPress={onPress}
            style={{
                flex: 1,
                margin: 6,
                borderRadius: isWeb ? 16 : 24,
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
            <View style={{ overflow: 'hidden', borderTopLeftRadius: isWeb ? 16 : 24, borderTopRightRadius: isWeb ? 16 : 24 }}>
                <Image source={{ uri: cover }} style={{ width: '100%', aspectRatio: 1 }} contentFit="cover" />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.9)'] as any}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
                />
                {/* Rarity badge — top LEFT */}
                <View style={{ position: 'absolute', top: 8, left: 8 }}>
                    <RarityBadge rarity={rarity} />
                </View>
                {/* Price tag — top RIGHT */}
                <View style={{ position: 'absolute', top: 8, right: 8 }}>
                    <PriceTag price={price} dark />
                </View>
                <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, lineHeight: 20, paddingBottom: 2 }} numberOfLines={1}>{title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, lineHeight: 14 }} numberOfLines={1}>{artist}</Text>
                </View>
            </View>

            {/* Bottom section */}
            <View style={{ padding: 12 }}>
                <Text style={{
                    color: isDark ? '#94a3b8' : '#475569',
                    fontSize: 10,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                }}>
                    EDITION #{editionNumber} / {totalEditions}
                </Text>
                <AnimatedPressable
                    preset="button"
                    onPress={onPress}
                    style={{
                        backgroundColor: '#8b5cf6',
                        borderRadius: isWeb ? 10 : 14,
                        paddingVertical: 10,
                        alignItems: 'center' as const,
                        marginTop: 8,
                    }}
                >
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Collect Now</Text>
                </AnimatedPressable>
            </View>
        </AnimatedPressable>
    );
}
