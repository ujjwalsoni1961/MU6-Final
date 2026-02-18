import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Animated, Platform } from 'react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { Image } from 'expo-image';
import {
    Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
    Heart, Volume2, VolumeX, ListMusic, ChevronUp, ChevronDown,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';
import WebPlayerExpanded from './WebPlayerExpanded';

export default function WebPlayerBar() {
    const { isDark, colors } = useTheme();
    const {
        currentSong, isPlaying, togglePlay, currentTime, duration,
        seekTo, skipNext, skipPrevious,
    } = usePlayer();

    const [isExpanded, setIsExpanded] = useState(false);
    const [volume, setVolume] = useState(0.7);
    const [isMuted, setIsMuted] = useState(false);
    const [isDraggingProgress, setIsDraggingProgress] = useState(false);
    const [isDraggingVolume, setIsDraggingVolume] = useState(false);
    const progressBarRef = useRef<View>(null);
    const volumeBarRef = useRef<View>(null);

    if (!currentSong) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const progressPercent = (currentTime / (duration || 1)) * 100;

    const handleProgressBarClick = (e: any) => {
        if (progressBarRef.current) {
            (progressBarRef.current as any).measure?.((x: number, y: number, w: number) => {
                const clickX = e.nativeEvent.offsetX ?? e.nativeEvent.locationX ?? 0;
                const percent = Math.max(0, Math.min(1, clickX / w));
                seekTo(Math.floor(percent * duration));
            });
            // For web, use offsetX directly
            if (Platform.OS === 'web') {
                const bar = e.currentTarget;
                const rect = bar.getBoundingClientRect();
                const clickX = e.nativeEvent.pageX - rect.left;
                const percent = Math.max(0, Math.min(1, clickX / rect.width));
                seekTo(Math.floor(percent * duration));
            }
        }
    };

    const handleVolumeBarClick = (e: any) => {
        if (Platform.OS === 'web') {
            const bar = e.currentTarget;
            const rect = bar.getBoundingClientRect();
            const clickX = e.nativeEvent.pageX - rect.left;
            const percent = Math.max(0, Math.min(1, clickX / rect.width));
            setVolume(percent);
            if (percent > 0) setIsMuted(false);
        }
    };

    const barBg = isDark ? 'rgba(10,15,20,0.95)' : 'rgba(255,255,255,0.95)';
    const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

    return (
        <>
            {/* Expanded Panel */}
            {isExpanded && (
                <WebPlayerExpanded onCollapse={() => setIsExpanded(false)} />
            )}

            {/* Bottom Bar */}
            <View
                style={{
                    position: 'fixed' as any,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 72,
                    backgroundColor: barBg,
                    borderTopWidth: 1,
                    borderTopColor: borderColor,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    zIndex: 9999,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                } as any}
            >
                {/* ─── LEFT SECTION (~30%) ─── */}
                <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <Image
                        source={{ uri: currentSong.coverImage }}
                        style={{
                            width: 48, height: 48, borderRadius: 8,
                            backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
                        }}
                        contentFit="cover"
                    />
                    <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
                        <Text
                            style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}
                            numberOfLines={1}
                        >
                            {currentSong.title}
                        </Text>
                        <Text
                            style={{ fontSize: 12, color: colors.text.secondary, marginTop: 1 }}
                            numberOfLines={1}
                        >
                            {currentSong.artistName}
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        style={{
                            padding: 8,
                            borderRadius: 20,
                        }}
                    >
                        <Heart size={18} color={colors.text.secondary} />
                    </AnimatedPressable>
                </View>

                {/* ─── CENTER SECTION (~40%) ─── */}
                <View style={{ flex: 4, alignItems: 'center', paddingHorizontal: 16 }}>
                    {/* Controls Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 4 }}>
                        <AnimatedPressable
                            preset="icon"
                            hapticType="none"
                            style={{
                                padding: 4,
                                borderRadius: 12,
                            }}
                        >
                            <Shuffle size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="icon"
                            hapticType="none"
                            onPress={skipPrevious}
                            style={{
                                padding: 4,
                                borderRadius: 12,
                            }}
                        >
                            <SkipBack size={18} color={colors.text.primary} fill={isDark ? colors.text.primary : undefined} />
                        </AnimatedPressable>

                        {/* Play/Pause — prominent */}
                        <AnimatedPressable
                            preset="button"
                            onPress={togglePlay}
                            style={{
                                width: 36, height: 36, borderRadius: 18,
                                backgroundColor: isDark ? colors.accent.cyan : '#0f172a',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {isPlaying ? (
                                <Pause size={16} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} />
                            ) : (
                                <Play size={16} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} style={{ marginLeft: 2 }} />
                            )}
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="icon"
                            hapticType="none"
                            onPress={skipNext}
                            style={{
                                padding: 4,
                                borderRadius: 12,
                            }}
                        >
                            <SkipForward size={18} color={colors.text.primary} fill={isDark ? colors.text.primary : undefined} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="icon"
                            hapticType="none"
                            style={{
                                padding: 4,
                                borderRadius: 12,
                            }}
                        >
                            <Repeat size={16} color={colors.text.muted} />
                        </AnimatedPressable>
                    </View>

                    {/* Progress Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 500, gap: 8 }}>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, fontVariant: ['tabular-nums'], minWidth: 32, textAlign: 'right' }}>
                            {formatTime(currentTime)}
                        </Text>
                        <Pressable
                            ref={progressBarRef as any}
                            onPress={handleProgressBarClick}
                            style={({ hovered }: any) => ({
                                flex: 1, height: hovered ? 6 : 4, borderRadius: 3,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                justifyContent: 'center',
                                cursor: 'pointer',
                            })}
                        >
                            {({ hovered }: any) => (
                                <View style={{ position: 'relative', width: '100%', height: '100%' }}>
                                    <View
                                        style={{
                                            position: 'absolute', left: 0, top: 0, bottom: 0,
                                            width: `${progressPercent}%` as any,
                                            backgroundColor: colors.accent.cyan,
                                            borderRadius: 3,
                                        }}
                                    />
                                    {hovered && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                left: `${progressPercent}%` as any,
                                                top: '50%',
                                                width: 12, height: 12, borderRadius: 6,
                                                backgroundColor: colors.accent.cyan,
                                                transform: [{ translateX: -6 }, { translateY: -6 }],
                                                shadowColor: colors.accent.cyan,
                                                shadowOffset: { width: 0, height: 0 },
                                                shadowOpacity: 0.4,
                                                shadowRadius: 4,
                                            }}
                                        />
                                    )}
                                </View>
                            )}
                        </Pressable>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, fontVariant: ['tabular-nums'], minWidth: 32 }}>
                            {formatTime(duration)}
                        </Text>
                    </View>
                </View>

                {/* ─── RIGHT SECTION (~30%) ─── */}
                <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    {/* Volume */}
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        onPress={() => setIsMuted(!isMuted)}
                        style={{
                            padding: 6,
                            borderRadius: 12,
                        }}
                    >
                        {isMuted || volume === 0 ? (
                            <VolumeX size={18} color={colors.text.secondary} />
                        ) : (
                            <Volume2 size={18} color={colors.text.secondary} />
                        )}
                    </AnimatedPressable>

                    <Pressable
                        ref={volumeBarRef as any}
                        onPress={handleVolumeBarClick}
                        style={({ hovered }: any) => ({
                            width: 80, height: hovered ? 6 : 4, borderRadius: 3,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            justifyContent: 'center',
                            cursor: 'pointer',
                        })}
                    >
                        {({ hovered }: any) => (
                            <View style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <View
                                    style={{
                                        position: 'absolute', left: 0, top: 0, bottom: 0,
                                        width: `${(isMuted ? 0 : volume) * 100}%` as any,
                                        backgroundColor: colors.text.secondary,
                                        borderRadius: 3,
                                    }}
                                />
                                {hovered && (
                                    <View
                                        style={{
                                            position: 'absolute',
                                            left: `${(isMuted ? 0 : volume) * 100}%` as any,
                                            top: '50%',
                                            width: 10, height: 10, borderRadius: 5,
                                            backgroundColor: colors.text.primary,
                                            transform: [{ translateX: -5 }, { translateY: -5 }],
                                        }}
                                    />
                                )}
                            </View>
                        )}
                    </Pressable>

                    {/* Queue */}
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        style={{
                            padding: 6,
                            borderRadius: 12,
                        }}
                    >
                        <ListMusic size={18} color={colors.text.secondary} />
                    </AnimatedPressable>

                    {/* Expand / Collapse */}
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        onPress={() => setIsExpanded(!isExpanded)}
                        style={{
                            padding: 6,
                            borderRadius: 12,
                        }}
                    >
                        {isExpanded ? (
                            <ChevronDown size={18} color={colors.text.secondary} />
                        ) : (
                            <ChevronUp size={18} color={colors.text.secondary} />
                        )}
                    </AnimatedPressable>
                </View>
            </View>
        </>
    );
}
