import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Heart, Play } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';

const isWeb = Platform.OS === 'web';

interface SongRowProps {
    cover: string;
    title: string;
    artist: string;
    plays: number;
    likes: number;
    isNFT: boolean;
    onPress?: () => void;
}

function formatPlays(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

import { useTheme } from '../../context/ThemeContext';

export default function SongRow({ cover, title, artist, plays, likes, isNFT, onPress }: SongRowProps) {
    const { isDark, colors } = useTheme();

    return (
        <AnimatedPressable
            preset="row"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 6,
                padding: 12,
                borderRadius: isWeb ? 12 : 16,
                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#f8fafc') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'),
                borderWidth: 1,
                borderColor: isWeb ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'),
            }}
        >
            <Image
                source={{ uri: cover }}
                style={{ width: 52, height: 52, borderRadius: isWeb ? 8 : 12 }}
                contentFit="cover"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>{title}</Text>
                    {isNFT && (
                        <View style={{ backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                            <Text style={{ color: '#8b5cf6', fontSize: 10, fontWeight: '700' }}>NFT</Text>
                        </View>
                    )}
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{artist}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                <Play size={12} color={colors.text.secondary} />
                <Text style={{ color: colors.text.secondary, fontSize: 11, marginLeft: 4, marginRight: 12 }}>{formatPlays(plays)}</Text>
                <Heart size={12} color={colors.text.secondary} />
                <Text style={{ color: colors.text.secondary, fontSize: 11, marginLeft: 4 }}>{formatPlays(likes)}</Text>
            </View>
        </AnimatedPressable>
    );
}
