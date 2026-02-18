import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { BadgeCheck } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';

interface ArtistCardProps {
    avatar: string;
    name: string;
    followers: number;
    verified: boolean;
    onPress?: () => void;
}

function formatFollowers(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

import { useTheme } from '../../context/ThemeContext';

export default function ArtistCard({ avatar, name, followers, verified, onPress }: ArtistCardProps) {
    const { isDark, colors } = useTheme();

    return (
        <AnimatedPressable
            preset="card"
            onPress={onPress}
            style={{ alignItems: 'center', marginRight: 20, width: 90 }}
        >
            <View style={{ position: 'relative' }}>
                <View
                    style={{
                        width: 76, height: 76, borderRadius: 38, padding: 3,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)',
                        borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)',
                    }}
                >
                    <Image source={{ uri: avatar }} style={{ width: 68, height: 68, borderRadius: 34 }} contentFit="cover" />
                </View>
                {verified && (
                    <View
                        style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 22, height: 22, borderRadius: 11,
                            backgroundColor: colors.accent.purple, alignItems: 'center', justifyContent: 'center',
                            borderWidth: 2, borderColor: colors.bg.card,
                        }}
                    >
                        <BadgeCheck size={13} color="#fff" />
                    </View>
                )}
            </View>
            <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 13, marginTop: 8, textAlign: 'center' }} numberOfLines={1}>
                {name}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 11, textAlign: 'center' }}>
                {formatFollowers(followers)}
            </Text>
        </AnimatedPressable>
    );
}
