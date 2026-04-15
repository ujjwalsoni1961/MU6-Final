import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, MoreVertical } from 'lucide-react-native';
import PriceTag from './PriceTag';
import AnimatedPressable from './AnimatedPressable';
import SongOptionsMenu from './SongOptionsMenu';

import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';
import { Song } from '../../types';

const isWeb = Platform.OS === 'web';

interface SongCardProps {
    cover: string;
    title: string;
    artist: string;
    isNFT?: boolean;
    price?: number;
    song?: Song;
    onPress?: () => void;
    onPlay?: () => void;
}

export default function SongCard({ cover, title, artist, isNFT, price, song, onPress, onPlay }: SongCardProps) {
    const { isDark, colors } = useTheme();
    const { currentSong, isPlaying } = usePlayer();
    const [showMenu, setShowMenu] = useState(false);

    const isCurrentlyPlaying = currentSong?.id === song?.id;

    return (
        <>
            <AnimatedPressable
                preset="card"
                onPress={onPress}
                style={{
                    width: isWeb ? 180 : 160,
                    marginRight: 16,
                }}
            >
                <View
                    style={{
                        borderRadius: isWeb ? 12 : 24,
                        overflow: 'hidden',
                        backgroundColor: isWeb ? colors.bg.card : (isDark ? 'transparent' : 'rgba(255,255,255,0.4)'),
                        borderWidth: isWeb ? (isDark ? 0 : 1) : 0,
                        borderColor: isWeb ? colors.border.base : 'transparent',
                        shadowColor: isDark ? colors.accent.cyan : '#000',
                        shadowOffset: { width: 0, height: isDark ? 0 : 4 },
                        shadowOpacity: isDark ? 0.06 : 0.08,
                        shadowRadius: isDark ? 24 : 12,
                        elevation: 2,
                    }}
                >
                    <View style={{ overflow: 'hidden', borderRadius: isWeb ? 12 : 24, position: 'relative' }}>
                        <Image source={{ uri: cover }} style={{ width: isWeb ? 180 : 160, height: isWeb ? 180 : 160 }} contentFit="cover" />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.6)'] as any}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}
                        />
                        {isNFT && price !== undefined && price > 0 && (
                            <View style={{ position: 'absolute', top: 10, right: 10 }}>
                                <PriceTag price={price} dark />
                            </View>
                        )}

                        {/* Now Playing Indicator */}
                        {isCurrentlyPlaying && (
                            <View style={{
                                position: 'absolute', top: 10, left: 10,
                                backgroundColor: 'rgba(56,180,186,0.9)',
                                borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                            }}>
                                <NowPlayingBars />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#000' }}>
                                    {isPlaying ? 'Playing' : 'Paused'}
                                </Text>
                            </View>
                        )}

                        {/* 3-dot menu button */}
                        {song && (
                            <AnimatedPressable
                                preset="icon"
                                onPress={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(true);
                                }}
                                style={{
                                    position: 'absolute',
                                    top: 8,
                                    right: isNFT && price ? 8 : 8,
                                    width: 28, height: 28, borderRadius: 14,
                                    backgroundColor: 'rgba(0,0,0,0.4)',
                                    alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <MoreVertical size={14} color="#fff" />
                            </AnimatedPressable>
                        )}

                        {/* Play Button Overlay */}
                        {onPlay && (
                            <AnimatedPressable
                                preset="icon"
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onPlay();
                                }}
                                style={{
                                    position: 'absolute',
                                    bottom: 12,
                                    right: 12,
                                    width: 40,
                                    height: 40,
                                    borderRadius: 20,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    shadowColor: isDark ? 'rgba(255,255,255,0.2)' : '#000',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: isDark ? 0.4 : 0.3,
                                    shadowRadius: 8,
                                    elevation: 6,
                                }}
                            >
                                <Play size={20} color={isDark ? '#fff' : '#1e293b'} fill={isDark ? '#fff' : '#1e293b'} style={{ marginLeft: 3 }} />
                            </AnimatedPressable>
                        )}
                    </View>
                </View>
                <Text
                    style={{
                        color: isCurrentlyPlaying ? colors.accent.cyan : colors.text.primary,
                        marginTop: 10, fontSize: 13, fontWeight: '700', letterSpacing: -0.3,
                    }}
                    numberOfLines={1}
                >
                    {title}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{artist}</Text>
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

function NowPlayingBars() {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 10, width: 10 }}>
            <View style={{ width: 2, height: 7, backgroundColor: '#000', borderRadius: 1 }} />
            <View style={{ width: 2, height: 10, backgroundColor: '#000', borderRadius: 1 }} />
            <View style={{ width: 2, height: 5, backgroundColor: '#000', borderRadius: 1 }} />
        </View>
    );
}
