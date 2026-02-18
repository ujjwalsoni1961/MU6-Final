import React, { useEffect, useRef } from 'react';
import { View, Text, Platform, Animated } from 'react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { Image } from 'expo-image';
import { Play, Pause, X, Heart } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';

export default function MiniPlayer() {
    const { isDark, colors } = useTheme();
    const { currentSong, isPlaying, togglePlay, openFullPlayer, dismissPlayer } = usePlayer();
    const slideAnim = useRef(new Animated.Value(100)).current; // Start off-screen (below)
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (currentSong) {
            Animated.parallel([
                Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }),
                Animated.timing(opacityAnim, { toValue: 1, useNativeDriver: true, duration: 200 }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.spring(slideAnim, { toValue: 100, useNativeDriver: true, friction: 8 }),
                Animated.timing(opacityAnim, { toValue: 0, useNativeDriver: true, duration: 150 }),
            ]).start();
        }
    }, [currentSong]);

    if (!currentSong) return null;

    return (
        <Animated.View
            style={{
                position: 'absolute',
                bottom: 80,
                left: 12,
                right: 12,
                height: 64,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(15,23,36,0.95)' : 'rgba(255,255,255,0.9)',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 10,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)',
                zIndex: 1000,
                transform: [{ translateY: slideAnim }],
                opacity: opacityAnim,
            }}
        >
            <AnimatedPressable preset="miniPlayer" style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={openFullPlayer}>
                {/* Thumbnail */}
                <Image
                    source={{ uri: currentSong.coverImage }}
                    style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: isDark ? '#333' : '#eee' }}
                    contentFit="cover"
                />

                {/* Info */}
                <View style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>
                        {currentSong.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }} numberOfLines={1}>
                        {currentSong.artistName}
                    </Text>
                </View>
            </AnimatedPressable>

            {/* Controls */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <AnimatedPressable preset="icon" hapticType="none" onPress={() => { }}>
                    <Heart size={20} color={colors.text.secondary} />
                </AnimatedPressable>

                <AnimatedPressable
                    preset="icon"
                    onPress={(e) => {
                        e.stopPropagation();
                        togglePlay();
                    }}
                    style={{
                        width: 40, height: 40, borderRadius: 20,
                        backgroundColor: isDark ? colors.accent.cyan : '#0f172a',
                        alignItems: 'center' as const, justifyContent: 'center' as const,
                    }}
                >
                    {isPlaying ? (
                        <Pause size={18} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} />
                    ) : (
                        <Play size={18} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} style={{ marginLeft: 2 }} />
                    )}
                </AnimatedPressable>

                <AnimatedPressable
                    preset="icon"
                    hapticType="none"
                    onPress={(e) => {
                        e.stopPropagation();
                        dismissPlayer();
                    }}
                >
                    <X size={20} color={colors.text.secondary} />
                </AnimatedPressable>
            </View>
        </Animated.View>
    );
}
