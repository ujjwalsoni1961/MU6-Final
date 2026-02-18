import React from 'react';
import { View, Text, Dimensions, ScrollView } from 'react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { Image } from 'expo-image';
import { ChevronDown, ListMusic, Mic2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';

interface WebPlayerExpandedProps {
    onCollapse: () => void;
}

export default function WebPlayerExpanded({ onCollapse }: WebPlayerExpandedProps) {
    const { isDark, colors } = useTheme();
    const { currentSong, currentTime, duration } = usePlayer();

    if (!currentSong) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const progressPercent = (currentTime / (duration || 1)) * 100;

    // Dynamic primary color from song (fallback to accent)
    const primaryColor = (currentSong as any).dominantColor || colors.accent.cyan;

    return (
        <View
            style={{
                position: 'fixed' as any,
                bottom: 72, // Above the bottom bar
                left: 0,
                right: 0,
                height: '60vh' as any,
                backgroundColor: isDark ? 'rgba(3,7,17,0.98)' : 'rgba(255,255,255,0.98)',
                backdropFilter: 'blur(30px)',
                WebkitBackdropFilter: 'blur(30px)',
                borderTopWidth: 1,
                borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
                zIndex: 9998,
                flexDirection: 'row',
                overflow: 'hidden',
            } as any}
        >
            {/* Dynamic gradient background */}
            <LinearGradient
                colors={[primaryColor + '30', 'transparent']}
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
                    opacity: isDark ? 0.6 : 0.3,
                }}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* ─── LEFT HALF: Large Artwork ─── */}
            <View style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
            }}>
                <View style={{
                    width: '80%',
                    maxWidth: 360,
                    aspectRatio: 1,
                    borderRadius: 16,
                    overflow: 'hidden',
                    shadowColor: primaryColor,
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: isDark ? 0.4 : 0.2,
                    shadowRadius: 40,
                    elevation: 20,
                }}>
                    <Image
                        source={{ uri: currentSong.coverImage }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                    />
                </View>
            </View>

            {/* ─── RIGHT HALF: Song Info, Lyrics, Queue ─── */}
            <View style={{
                flex: 1,
                paddingVertical: 32,
                paddingHorizontal: 40,
                justifyContent: 'center',
            }}>
                {/* Collapse Button */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        onPress={onCollapse}
                        style={{
                            padding: 8,
                            borderRadius: 20,
                        }}
                    >
                        <ChevronDown size={22} color={colors.text.secondary} />
                    </AnimatedPressable>
                </View>

                {/* Song Info */}
                <View style={{ marginBottom: 24 }}>
                    <Text style={{
                        fontSize: 28, fontWeight: '800', color: colors.text.primary,
                        letterSpacing: -0.5, marginBottom: 6,
                    }} numberOfLines={2}>
                        {currentSong.title}
                    </Text>
                    <Text style={{
                        fontSize: 18, color: colors.text.secondary, fontWeight: '500',
                    }}>
                        {currentSong.artistName}
                    </Text>
                </View>

                {/* Progress */}
                <View style={{ marginBottom: 28 }}>
                    <View style={{
                        height: 4, borderRadius: 2,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                        marginBottom: 8,
                    }}>
                        <View style={{
                            width: `${progressPercent}%` as any,
                            height: '100%',
                            backgroundColor: primaryColor,
                            borderRadius: 2,
                        }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.secondary, fontVariant: ['tabular-nums'] }}>
                            {formatTime(currentTime)}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.text.secondary, fontVariant: ['tabular-nums'] }}>
                            {formatTime(duration)}
                        </Text>
                    </View>
                </View>

                {/* Lyrics Placeholder */}
                <View style={{
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    padding: 20,
                    marginBottom: 16,
                    maxHeight: 200,
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Mic2 size={14} color={colors.text.muted} style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Lyrics
                        </Text>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={{ fontSize: 15, color: colors.text.secondary, lineHeight: 24 }}>
                            {currentSong.lyrics || 'Lyrics not available for this track.\n\nEnjoy the music! 🎵'}
                        </Text>
                    </ScrollView>
                </View>

                {/* Queue Preview */}
                <View style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    padding: 16,
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <ListMusic size={14} color={colors.text.muted} style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Up Next
                        </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                        Queue is empty — add songs to play next
                    </Text>
                </View>
            </View>
        </View>
    );
}
