/**
 * SongOptionsMenu — Reusable 3-dot menu for songs
 *
 * Cross-platform bottom sheet / action sheet with options:
 * Play, Play Next, Add to Queue, Add to Playlist, Go to Artist, Share
 */

import React, { useState } from 'react';
import { View, Text, Modal, Platform, Alert, Share as RNShare } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';
import { usePlayer } from '../../context/PlayerContext';
import { useRouter } from 'expo-router';
import { Song } from '../../types';
import {
    Play, SkipForward, ListPlus, ListMusic, User, Share2, X,
} from 'lucide-react-native';
import PlaylistSelectionSheet from './PlaylistSelectionSheet';

interface SongOptionsMenuProps {
    visible: boolean;
    song: Song;
    onClose: () => void;
}

export default function SongOptionsMenu({ visible, song, onClose }: SongOptionsMenuProps) {
    const { isDark, colors } = useTheme();
    const { playSong, playNext, addToQueue } = usePlayer();
    const router = useRouter();
    const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);

    const handlePlay = () => {
        playSong(song);
        onClose();
    };

    const handlePlayNext = () => {
        playNext(song);
        onClose();
    };

    const handleAddToQueue = () => {
        addToQueue(song);
        onClose();
    };

    const handleAddToPlaylist = () => {
        onClose();
        // Small delay to let the first modal close
        setTimeout(() => setShowPlaylistSheet(true), 300);
    };

    const handleGoToArtist = () => {
        onClose();
        if (song._creatorId) {
            router.push({ pathname: '/(consumer)/artist-profile', params: { id: song._creatorId } });
        }
    };

    const handleShare = async () => {
        onClose();
        const url = `https://mu6.app/song/${song.id}`;
        const message = `Check out "${song.title}" by ${song.artistName} on MU6!`;

        if (Platform.OS === 'web') {
            if (navigator.share) {
                try { await navigator.share({ title: song.title, text: message, url }); } catch {}
            } else {
                try {
                    await navigator.clipboard.writeText(url);
                    Alert.alert('Link Copied', 'Song link copied to clipboard.');
                } catch {}
            }
        } else {
            try { await RNShare.share({ message: `${message}\n${url}` }); } catch {}
        }
    };

    const options = [
        { icon: Play, label: 'Play', onPress: handlePlay },
        { icon: SkipForward, label: 'Play Next', onPress: handlePlayNext },
        { icon: ListMusic, label: 'Add to Queue', onPress: handleAddToQueue },
        { icon: ListPlus, label: 'Add to Playlist', onPress: handleAddToPlaylist },
        ...(song._creatorId ? [{ icon: User, label: 'Go to Artist', onPress: handleGoToArtist }] : []),
        { icon: Share2, label: 'Share', onPress: handleShare },
    ];

    // PDF priority fix #3 — on web, the bottom-sheet "slide" Modal stretched
    // to full width and produced an awkward hover/overlay glitch on desktop.
    // Render as a centered popup card on web (max ~340px), keep the native
    // bottom sheet on iOS/Android. Logic and option list are identical.
    const isWeb = Platform.OS === 'web';

    const backdropStyle = isWeb
        ? { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' as const, alignItems: 'center' as const, padding: 20 }
        : { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const };

    const sheetStyle = isWeb
        ? {
            width: '100%' as const,
            maxWidth: 340,
            backgroundColor: isDark ? '#111827' : '#ffffff',
            borderRadius: 16,
            paddingTop: 8,
            paddingBottom: 8,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            // Subtle elevation — safe on web because this is a single isolated
            // floating card (unlike the TabPill row where shadows stacked).
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 24,
        }
        : {
            backgroundColor: isDark ? '#111827' : '#ffffff',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 8,
            paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        };

    return (
        <>
            <Modal
                visible={visible}
                transparent
                animationType={isWeb ? 'fade' : 'slide'}
                onRequestClose={onClose}
            >
                <AnimatedPressable
                    preset="icon"
                    hapticType="none"
                    onPress={onClose}
                    style={backdropStyle}
                >
                    <View onStartShouldSetResponder={() => true} style={sheetStyle}>
                        {/* Handle bar — native bottom sheet only */}
                        {!isWeb && (
                            <View style={{
                                width: 40, height: 4, borderRadius: 2,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                                alignSelf: 'center', marginBottom: 16,
                            }} />
                        )}

                        {/* Song info header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                            <Image
                                source={{ uri: song.coverImage }}
                                style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }}
                                contentFit="cover"
                            />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>
                                    {song.title}
                                </Text>
                                <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
                                    {song.artistName}
                                </Text>
                            </View>
                            <AnimatedPressable preset="icon" onPress={onClose} style={{ padding: 8 }}>
                                <X size={20} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        {/* Divider */}
                        <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', marginHorizontal: 16 }} />

                        {/* Options */}
                        {options.map((option, index) => {
                            const Icon = option.icon;
                            return (
                                <AnimatedPressable
                                    key={index}
                                    preset="row"
                                    onPress={option.onPress}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingVertical: 14,
                                        paddingHorizontal: 20,
                                    }}
                                >
                                    <Icon size={20} color={colors.text.secondary} />
                                    <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text.primary, marginLeft: 16 }}>
                                        {option.label}
                                    </Text>
                                </AnimatedPressable>
                            );
                        })}
                    </View>
                </AnimatedPressable>
            </Modal>

            <PlaylistSelectionSheet
                visible={showPlaylistSheet}
                songId={song.id}
                onClose={() => setShowPlaylistSheet(false)}
            />
        </>
    );
}
