import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Layers } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

interface NFTGroupCardProps {
    cover: string;
    title: string;
    artist: string;
    badgeText: string;
    onPress?: () => void;
}

import { useTheme } from '../../context/ThemeContext';

export default function NFTGroupCard({
    cover, title, artist, badgeText, onPress,
}: NFTGroupCardProps) {
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
            {/* Image section */}
            <View style={{ overflow: 'hidden', borderTopLeftRadius: isWeb ? 16 : 24, borderTopRightRadius: isWeb ? 16 : 24 }}>
                <Image source={{ uri: cover }} style={{ width: '100%', aspectRatio: 1 }} contentFit="cover" />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.9)'] as any}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
                />
                
                {/* Badge showing count */}
                <View style={{ position: 'absolute', top: 12, right: 12 }}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 16,
                        gap: 6,
                    }}>
                        <Layers size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {badgeText}
                        </Text>
                    </View>
                </View>

                {/* Title & Artist over the image */}
                <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, lineHeight: 20, paddingBottom: 2 }} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                        {artist}
                    </Text>
                </View>
            </View>

            {/* Bottom Section */}
            <View style={{ padding: 12 }}>
                <AnimatedPressable
                    preset="button"
                    onPress={onPress}
                    style={{
                        backgroundColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)',
                        borderRadius: isWeb ? 10 : 14,
                        paddingVertical: 10,
                        alignItems: 'center' as const,
                        borderWidth: 1,
                        borderColor: 'rgba(139,92,246,0.3)',
                    }}
                >
                    <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 13 }}>
                        View Collection
                    </Text>
                </AnimatedPressable>
            </View>
        </AnimatedPressable>
    );
}
