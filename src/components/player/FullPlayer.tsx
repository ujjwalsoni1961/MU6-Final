import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, Platform, Dimensions, ScrollView, Animated, PanResponder } from 'react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { Image } from 'expo-image';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Shuffle, Repeat, MoreHorizontal, Volume2, Mic2, ListMusic, Airplay } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';

const { width, height } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function FullPlayer() {
    const { isDark, colors } = useTheme();
    const { currentSong, isPlaying, togglePlay, closeFullPlayer, currentTime, duration, seekTo, skipNext, skipPrevious } = usePlayer();

    // Animation for slide-in
    const slideAnim = useRef(new Animated.Value(height)).current;
    // Animation for breathing artwork
    const scaleAnim = useRef(new Animated.Value(1)).current;
    // Pan gesture for swipe-to-minimize (mobile only)
    const panY = useRef(new Animated.Value(0)).current;
    const panScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Slide in from the bottom
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 12, tension: 50 }).start();
    }, []);

    useEffect(() => {
        // Breathing effect on artwork
        Animated.spring(scaleAnim, {
            toValue: isPlaying ? 1.02 : 1,
            useNativeDriver: true,
            friction: 10,
        }).start();
    }, [isPlaying]);

    // Swipe-to-minimize PanResponder (mobile only)
    const panResponder = useMemo(() => {
        if (isWeb) return null;
        const DISMISS_THRESHOLD = height * 0.3;
        const VELOCITY_THRESHOLD = 800;

        return PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // Only respond to vertical down-swipes (not horizontal scroll)
                return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panY.setValue(gestureState.dy);
                    // Scale down slightly as user drags (1 → 0.92)
                    const scaleVal = Math.max(0.92, 1 - (gestureState.dy / height) * 0.15);
                    panScale.setValue(scaleVal);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > VELOCITY_THRESHOLD) {
                    // Collapse to mini player
                    Animated.parallel([
                        Animated.timing(panY, { toValue: height, useNativeDriver: true, duration: 300 }),
                        Animated.timing(panScale, { toValue: 0.9, useNativeDriver: true, duration: 300 }),
                    ]).start(() => {
                        panY.setValue(0);
                        panScale.setValue(1);
                        closeFullPlayer();
                    });
                } else {
                    // Snap back
                    Animated.parallel([
                        Animated.spring(panY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }),
                        Animated.spring(panScale, { toValue: 1, useNativeDriver: true, friction: 8, tension: 65 }),
                    ]).start();
                }
            },
        });
    }, []);

    if (!currentSong) return null;

    // Formatting time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const progressPercent = (currentTime / (duration || 1)) * 100;

    const handleClose = () => {
        Animated.timing(slideAnim, { toValue: height, useNativeDriver: true, duration: 300 }).start(() => {
            closeFullPlayer();
        });
    };

    return (
        <Animated.View
            {...(panResponder ? panResponder.panHandlers : {})}
            style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: isDark ? '#030711' : '#fff',
                zIndex: 2000,
                transform: [
                    { translateY: slideAnim },
                    { translateY: panY },
                    { scale: panScale },
                ],
            }}
        >
            {/* Dynamic Background Gradient */}
            <LinearGradient
                colors={[currentSong.dominantColor || colors.accent.cyan, isDark ? '#030711' : '#fff']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.6, opacity: 0.3 }}
            />

            {/* Top Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, marginBottom: 20 }}>
                <AnimatedPressable preset="icon" onPress={handleClose} style={{ padding: 8 }}>
                    <ChevronDown size={28} color={colors.text.primary} />
                </AnimatedPressable>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    Now Playing
                </Text>
                <AnimatedPressable preset="icon" style={{ padding: 8 }}>
                    <MoreHorizontal size={24} color={colors.text.primary} />
                </AnimatedPressable>
            </View>

            {/* Content Container */}
            <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

                {/* Artwork */}
                <Animated.View style={{
                    width: width - 80, height: width - 80, maxWidth: 400, maxHeight: 400,
                    borderRadius: 24,
                    shadowColor: currentSong.dominantColor || colors.accent.cyan,
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: isDark ? 0.3 : 0.2,
                    shadowRadius: 30,
                    elevation: 10,
                    marginBottom: 40,
                    backgroundColor: isDark ? '#111' : '#eee',
                    transform: [{ scale: scaleAnim }],
                }}>
                    <Image
                        source={{ uri: currentSong.coverImage }}
                        style={{ width: '100%', height: '100%', borderRadius: 24 }}
                        contentFit="cover"
                    />
                </Animated.View>

                {/* Song Info */}
                <View style={{ alignItems: 'center', paddingHorizontal: 40, marginBottom: 30 }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary, textAlign: 'center', marginBottom: 8 }} numberOfLines={1}>
                        {currentSong.title}
                    </Text>
                    <Text style={{ fontSize: 18, color: colors.text.secondary, fontWeight: '500', textAlign: 'center' }}>
                        {currentSong.artistName}
                    </Text>
                </View>

                {/* Progress Bar */}
                <View style={{ width: '100%', paddingHorizontal: 32, marginBottom: 30 }}>
                    <View style={{
                        height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        borderRadius: 2, marginBottom: 12, position: 'relative'
                    }}>
                        <View style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercent}%`,
                            backgroundColor: currentSong.dominantColor || colors.accent.cyan, borderRadius: 2
                        }} />
                        <View style={{
                            position: 'absolute', left: `${progressPercent}%`, top: -5, width: 14, height: 14, borderRadius: 7,
                            backgroundColor: isDark ? (currentSong.dominantColor || colors.accent.cyan) : '#fff',
                            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
                            transform: [{ translateX: -7 }]
                        }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: colors.text.secondary }}>{formatTime(currentTime)}</Text>
                        <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: colors.text.secondary }}>{formatTime(duration)}</Text>
                    </View>
                </View>

                {/* Main Controls */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 40 }}>
                    <AnimatedPressable preset="icon" hapticType="none">
                        <Shuffle size={24} color={colors.text.muted} />
                    </AnimatedPressable>

                    <AnimatedPressable preset="icon" onPress={skipPrevious}>
                        <SkipBack size={32} color={colors.text.primary} fill={isDark ? colors.text.primary : 'none'} />
                    </AnimatedPressable>

                    <AnimatedPressable
                        preset="button"
                        onPress={togglePlay}
                        style={{
                            width: 72, height: 72, borderRadius: 36,
                            backgroundColor: isDark ? (currentSong as any).dominantColor || colors.accent.cyan : '#0f172a',
                            alignItems: 'center' as const, justifyContent: 'center' as const,
                            shadowColor: isDark ? colors.accent.cyan : '#0f172a',
                            shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
                        }}
                    >
                        {isPlaying ? (
                            <Pause size={32} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} />
                        ) : (
                            <Play size={32} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} style={{ marginLeft: 4 }} />
                        )}
                    </AnimatedPressable>

                    <AnimatedPressable preset="icon" onPress={skipNext}>
                        <SkipForward size={32} color={colors.text.primary} fill={isDark ? colors.text.primary : 'none'} />
                    </AnimatedPressable>

                    <AnimatedPressable preset="icon" hapticType="none">
                        <Repeat size={24} color={colors.text.muted} />
                    </AnimatedPressable>
                </View>

                {/* Secondary Controls */}
                <View style={{ width: '100%', paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Volume2 size={20} color={colors.text.secondary} />
                    <View style={{ flex: 1, height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 2 }}>
                        <View style={{ width: '60%', height: '100%', backgroundColor: colors.text.secondary, borderRadius: 2 }} />
                    </View>
                    <Volume2 size={20} color={colors.text.primary} />
                </View>

                {/* Bottom Row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 40, paddingHorizontal: 40 }}>
                    <AnimatedPressable preset="icon" hapticType="none" style={{ alignItems: 'center', opacity: 0.7 }}>
                        <Mic2 size={24} color={colors.text.primary} />
                    </AnimatedPressable>
                    <AnimatedPressable preset="icon" hapticType="none" style={{ alignItems: 'center', opacity: 0.7 }}>
                        <ListMusic size={24} color={colors.text.primary} />
                    </AnimatedPressable>
                    <AnimatedPressable preset="icon" hapticType="none" style={{ alignItems: 'center', opacity: 0.7 }}>
                        <Airplay size={24} color={colors.text.primary} />
                    </AnimatedPressable>
                </View>

            </ScrollView>
        </Animated.View>
    );
}
