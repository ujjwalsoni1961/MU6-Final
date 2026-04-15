import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Heart, Play, MoreVertical } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';
import SongOptionsMenu from './SongOptionsMenu';

const isWeb = Platform.OS === 'web';

import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';
import { Song } from '../../types';

interface SongRowProps {
    cover: string;
    title: string;
    artist: string;
    plays: number;
    likes: number;
    isNFT: boolean;
    song?: Song;
    onPress?: () => void;
}

function formatPlays(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

export default function SongRow({ cover, title, artist, plays, likes, isNFT, song, onPress }: SongRowProps) {
    const { isDark, colors } = useTheme();
    const { currentSong, isPlaying } = usePlayer();
    const [showMenu, setShowMenu] = useState(false);

    const isCurrentlyPlaying = currentSong?.id === song?.id;

    return (
        <>
            <AnimatedPressable
                preset="row"
                onPress={onPress}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 6,
                    padding: 12,
                    borderRadius: isWeb ? 12 : 16,
                    backgroundColor: isCurrentlyPlaying
                        ? (isDark ? 'rgba(56,180,186,0.08)' : 'rgba(56,180,186,0.06)')
                        : (isWeb ? (isDark ? colors.bg.card : '#f8fafc') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)')),
                    borderWidth: 1,
                    borderColor: isCurrentlyPlaying
                        ? (isDark ? 'rgba(56,180,186,0.2)' : 'rgba(56,180,186,0.15)')
                        : (isWeb ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)')),
                }}
            >
                <View style={{ position: 'relative' }}>
                    <Image
                        source={{ uri: cover }}
                        style={{ width: 52, height: 52, borderRadius: isWeb ? 8 : 12 }}
                        contentFit="cover"
                    />
                    {/* Now Playing Indicator */}
                    {isCurrentlyPlaying && (
                        <View style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            borderRadius: isWeb ? 8 : 12,
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <NowPlayingBars color={colors.accent.cyan} />
                        </View>
                    )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                            style={{
                                color: isCurrentlyPlaying ? colors.accent.cyan : colors.text.primary,
                                fontWeight: '600', fontSize: 14, flex: 1,
                            }}
                            numberOfLines={1}
                        >
                            {title}
                        </Text>
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

                {/* 3-dot menu */}
                {song && (
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        onPress={(e) => {
                            e.stopPropagation();
                            setShowMenu(true);
                        }}
                        style={{ padding: 8, marginLeft: 4 }}
                    >
                        <MoreVertical size={16} color={colors.text.muted} />
                    </AnimatedPressable>
                )}
            </AnimatedPressable>

            {song && (
                <SongOptionsMenu
                    visible={showMenu}
                    song={song}
                    onClose={() => setShowMenu(false)}
                />
            )}
        </>
    );
}

function NowPlayingBars({ color }: { color: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16, width: 16 }}>
            <View style={{ width: 3, height: 12, backgroundColor: color, borderRadius: 1, opacity: 0.8 }} />
            <View style={{ width: 3, height: 16, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 3, height: 8, backgroundColor: color, borderRadius: 1, opacity: 0.6 }} />
        </View>
    );
}
