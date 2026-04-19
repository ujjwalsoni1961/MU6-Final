import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Animated, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { Image } from 'expo-image';
import {
    Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
    Heart, Volume2, VolumeX, ListMusic, ChevronUp, ChevronDown,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';
import { useIsLiked } from '../../hooks/useData';
import { useRouter } from 'expo-router';
import { useResponsive } from '../../hooks/useResponsive';
import WebPlayerExpanded from './WebPlayerExpanded';

export default function WebPlayerBar() {
    const { isDark, colors } = useTheme();
    const { isMobile, isTablet } = useResponsive();
    const {
        currentSong, isPlaying, isBuffering, togglePlay, currentTime, duration,
        seekTo, skipNext, skipPrevious, volume, setVolume,
        isRepeat, toggleRepeat, isShuffled, toggleShuffle,
    } = usePlayer();
    const { liked, toggle: toggleLike } = useIsLiked(currentSong?.id);
    const router = useRouter();

    const [isExpanded, setIsExpanded] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [prevVolume, setPrevVolume] = useState(0.7);
    const [isDraggingProgress, setIsDraggingProgress] = useState(false);
    const [isDraggingVolume, setIsDraggingVolume] = useState(false);
    const progressBarRef = useRef<View>(null);
    const volumeBarRef = useRef<View>(null);

    if (!currentSong) return null;

    /* ─── Compact mobile bar ─── */
    // On phones the full desktop bar is unusable: cover + title + like +
    // 5 controls + full progress + volume + queue all in 72px is a wreck.
    // Render a compact 2-row bar: (row1) cover, title/artist, play/pause;
    // (row2) slim progress line. Tapping the bar expands the full panel.
    if (isMobile) {
        const progressPercent = (currentTime / (duration || 1)) * 100;
        const formatTime = (s: number) => `${Math.floor(s / 60)}:${(Math.floor(s % 60)).toString().padStart(2, '0')}`;
        const barBg = isDark ? 'rgba(10,15,20,0.97)' : 'rgba(255,255,255,0.97)';
        const border = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        return (
            <>
                {isExpanded && <WebPlayerExpanded onCollapse={() => setIsExpanded(false)} />}
                <View style={{
                    // @ts-ignore web fixed
                    position: 'fixed' as any, bottom: 0, left: 0, right: 0,
                    backgroundColor: barBg,
                    borderTopWidth: 1, borderTopColor: border,
                    zIndex: 9999,
                    // @ts-ignore
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                } as any}>
                    {/* Progress line on top */}
                    <View style={{ height: 2, width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                        <View style={{
                            height: '100%',
                            width: `${progressPercent}%` as any,
                            backgroundColor: colors.accent.cyan,
                        }} />
                    </View>
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 10, paddingVertical: 8, gap: 10,
                    }}>
                        <AnimatedPressable
                            preset="row" hapticType="none"
                            onPress={() => setIsExpanded(true)}
                            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}
                        >
                            <Image
                                source={{ uri: currentSong.coverImage }}
                                style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }}
                                contentFit="cover"
                            />
                            <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                                    {currentSong.title}
                                </Text>
                                <Text numberOfLines={1} style={{ fontSize: 11, color: colors.text.secondary, marginTop: 1 }}>
                                    {currentSong.artistName}
                                </Text>
                            </View>
                        </AnimatedPressable>
                        <AnimatedPressable preset="icon" hapticType="none" onPress={toggleLike} style={{ padding: 6 }}>
                            <Heart size={18} color={liked ? '#ef4444' : colors.text.secondary} fill={liked ? '#ef4444' : 'none'} />
                        </AnimatedPressable>
                        <AnimatedPressable preset="icon" hapticType="none" onPress={skipPrevious} style={{ padding: 4 }}>
                            <SkipBack size={20} color={colors.text.primary} fill={isDark ? colors.text.primary : undefined} />
                        </AnimatedPressable>
                        <AnimatedPressable
                            preset="button" onPress={togglePlay}
                            style={{
                                width: 36, height: 36, borderRadius: 18,
                                backgroundColor: isDark ? colors.accent.cyan : '#0f172a',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {isBuffering
                                ? <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
                                : isPlaying
                                    ? <Pause size={16} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} />
                                    : <Play size={16} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} style={{ marginLeft: 2 }} />
                            }
                        </AnimatedPressable>
                        <AnimatedPressable preset="icon" hapticType="none" onPress={skipNext} style={{ padding: 4 }}>
                            <SkipForward size={20} color={colors.text.primary} fill={isDark ? colors.text.primary : undefined} />
                        </AnimatedPressable>
                    </View>
                </View>
            </>
        );
    }

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

    const toggleMute = () => {
        if (isMuted) {
            setVolume(prevVolume || 0.7);
            setIsMuted(false);
        } else {
            setPrevVolume(volume);
            setVolume(0);
            setIsMuted(true);
        }
    };

    const handleArtistTap = () => {
        if (currentSong._creatorId) {
            router.push({ pathname: '/(consumer)/artist-profile', params: { id: currentSong._creatorId } });
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
                        <AnimatedPressable preset="icon" hapticType="none" onPress={handleArtistTap} style={{ alignSelf: 'flex-start' }}>
                            <Text
                                style={{ fontSize: 12, color: currentSong._creatorId ? colors.accent.cyan : colors.text.secondary, marginTop: 1 }}
                                numberOfLines={1}
                            >
                                {currentSong.artistName}
                            </Text>
                        </AnimatedPressable>
                    </View>
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        onPress={toggleLike}
                        style={{
                            padding: 8,
                            borderRadius: 20,
                        }}
                    >
                        <Heart
                            size={18}
                            color={liked ? '#ef4444' : colors.text.secondary}
                            fill={liked ? '#ef4444' : 'none'}
                        />
                    </AnimatedPressable>
                </View>

                {/* ─── CENTER SECTION (~40%) ─── */}
                <View style={{ flex: 4, alignItems: 'center', paddingHorizontal: 16 }}>
                    {/* Controls Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 4 }}>
                        <AnimatedPressable
                            preset="icon"
                            hapticType="none"
                            onPress={toggleShuffle}
                            style={{
                                padding: 4,
                                borderRadius: 12,
                            }}
                        >
                            <Shuffle size={16} color={isShuffled ? colors.accent.cyan : colors.text.muted} />
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
                            {isBuffering ? (
                                <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
                            ) : isPlaying ? (
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
                            onPress={toggleRepeat}
                            style={{
                                padding: 4,
                                borderRadius: 12,
                            }}
                        >
                            <Repeat size={16} color={isRepeat ? colors.accent.cyan : colors.text.muted} />
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
                        onPress={toggleMute}
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
                        onPress={() => setIsExpanded(!isExpanded)}
                        style={{
                            padding: 6,
                            borderRadius: 12,
                        }}
                    >
                        <ListMusic size={18} color={isExpanded ? colors.accent.cyan : colors.text.secondary} />
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
