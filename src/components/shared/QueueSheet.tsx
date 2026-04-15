/**
 * QueueSheet — Bottom sheet showing current queue (mobile)
 */

import React from 'react';
import { View, Text, Modal, Platform, ScrollView } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';
import { X, Play, Pause, Trash2 } from 'lucide-react-native';

interface QueueSheetProps {
    visible: boolean;
    onClose: () => void;
}

export default function QueueSheet({ visible, onClose }: QueueSheetProps) {
    const { isDark, colors } = useTheme();
    const { queue, queueIndex, currentSong, isPlaying, jumpToQueueIndex, removeFromQueue, clearQueue } = usePlayer();

    const upNext = queue.slice(queueIndex + 1);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <AnimatedPressable
                preset="icon"
                hapticType="none"
                onPress={onClose}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            >
                <View onStartShouldSetResponder={() => true} style={{
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    paddingTop: 8,
                    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
                    maxHeight: '75%',
                }}>
                    {/* Handle bar */}
                    <View style={{
                        width: 40, height: 4, borderRadius: 2,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                        alignSelf: 'center', marginBottom: 16,
                    }} />

                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary }}>
                            Queue
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {upNext.length > 0 && (
                                <AnimatedPressable preset="icon" onPress={clearQueue} style={{ padding: 8 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent.cyan }}>Clear</Text>
                                </AnimatedPressable>
                            )}
                            <AnimatedPressable preset="icon" onPress={onClose} style={{ padding: 8 }}>
                                <X size={20} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Now Playing */}
                        {currentSong && (
                            <>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 8 }}>
                                    Now Playing
                                </Text>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingVertical: 10,
                                    paddingHorizontal: 20,
                                    backgroundColor: isDark ? 'rgba(56,180,186,0.08)' : 'rgba(56,180,186,0.06)',
                                    marginBottom: 16,
                                }}>
                                    <Image
                                        source={{ uri: currentSong.coverImage }}
                                        style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }}
                                        contentFit="cover"
                                    />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>
                                            {currentSong.title}
                                        </Text>
                                        <Text style={{ fontSize: 12, color: colors.accent.cyan, marginTop: 1 }} numberOfLines={1}>
                                            {currentSong.artistName}
                                        </Text>
                                    </View>
                                    {isPlaying ? (
                                        <NowPlayingBars color={colors.accent.cyan} />
                                    ) : (
                                        <Pause size={16} color={colors.accent.cyan} />
                                    )}
                                </View>
                            </>
                        )}

                        {/* Up Next */}
                        {upNext.length > 0 && (
                            <>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 8 }}>
                                    Up Next ({upNext.length})
                                </Text>
                                {upNext.map((song, i) => {
                                    const actualIndex = queueIndex + 1 + i;
                                    return (
                                        <AnimatedPressable
                                            key={`${song.id}-${actualIndex}`}
                                            preset="row"
                                            onPress={() => {
                                                jumpToQueueIndex(actualIndex);
                                                onClose();
                                            }}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                paddingVertical: 10,
                                                paddingHorizontal: 20,
                                            }}
                                        >
                                            <Image
                                                source={{ uri: song.coverImage }}
                                                style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }}
                                                contentFit="cover"
                                            />
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                                                    {song.title}
                                                </Text>
                                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 1 }} numberOfLines={1}>
                                                    {song.artistName}
                                                </Text>
                                            </View>
                                            <AnimatedPressable
                                                preset="icon"
                                                hapticType="none"
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    removeFromQueue(actualIndex);
                                                }}
                                                style={{ padding: 8 }}
                                            >
                                                <Trash2 size={16} color={colors.text.muted} />
                                            </AnimatedPressable>
                                        </AnimatedPressable>
                                    );
                                })}
                            </>
                        )}

                        {upNext.length === 0 && (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 14 }}>
                                    No upcoming songs in queue
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </AnimatedPressable>
        </Modal>
    );
}

/** Small animated-ish bars for now-playing indicator */
function NowPlayingBars({ color }: { color: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16, width: 16 }}>
            <View style={{ width: 3, height: 12, backgroundColor: color, borderRadius: 1, opacity: 0.8 }} />
            <View style={{ width: 3, height: 16, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 3, height: 8, backgroundColor: color, borderRadius: 1, opacity: 0.6 }} />
        </View>
    );
}
