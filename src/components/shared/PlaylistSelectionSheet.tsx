/**
 * PlaylistSelectionSheet — Bottom sheet for adding a song to a playlist
 *
 * Shows user's playlists with a "Create New Playlist" option at top.
 * Tapping a playlist adds the song and shows confirmation.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Platform, Alert, ActivityIndicator, TextInput } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import * as db from '../../services/database';
import { Plus, ListMusic, X, Check } from 'lucide-react-native';

interface PlaylistSelectionSheetProps {
    visible: boolean;
    songId: string;
    onClose: () => void;
}

export default function PlaylistSelectionSheet({ visible, songId, onClose }: PlaylistSelectionSheetProps) {
    const { isDark, colors } = useTheme();
    const { profile } = useAuth();
    const [playlists, setPlaylists] = useState<db.PlaylistRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [addedTo, setAddedTo] = useState<string | null>(null);

    useEffect(() => {
        if (visible && profile?.id) {
            setLoading(true);
            setAddedTo(null);
            db.getPlaylists(profile.id).then(p => {
                setPlaylists(p);
                setLoading(false);
            }).catch(() => setLoading(false));
        }
    }, [visible, profile?.id]);

    const handleAdd = async (playlistId: string) => {
        const ok = await db.addSongToPlaylist(playlistId, songId);
        if (ok) {
            setAddedTo(playlistId);
            setTimeout(() => onClose(), 800);
        } else {
            Alert.alert('Error', 'Could not add song to playlist.');
        }
    };

    const handleCreate = async () => {
        if (!newName.trim() || !profile?.id) return;
        setCreating(true);
        const playlist = await db.createPlaylist(profile.id, newName.trim());
        if (playlist) {
            await db.addSongToPlaylist(playlist.id, songId);
            setAddedTo(playlist.id);
            setNewName('');
            setTimeout(() => onClose(), 800);
        } else {
            Alert.alert('Error', 'Could not create playlist.');
        }
        setCreating(false);
    };

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
                    maxHeight: '70%',
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
                            Add to Playlist
                        </Text>
                        <AnimatedPressable preset="icon" onPress={onClose} style={{ padding: 8 }}>
                            <X size={20} color={colors.text.secondary} />
                        </AnimatedPressable>
                    </View>

                    {/* Create new playlist */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                        <TextInput
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="New playlist name..."
                            placeholderTextColor={colors.text.muted}
                            style={{
                                flex: 1,
                                height: 44,
                                borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                paddingHorizontal: 14,
                                fontSize: 14,
                                color: colors.text.primary,
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            }}
                        />
                        <AnimatedPressable
                            preset="button"
                            onPress={handleCreate}
                            style={{
                                marginLeft: 8,
                                width: 44, height: 44, borderRadius: 12,
                                backgroundColor: colors.accent.cyan,
                                alignItems: 'center', justifyContent: 'center',
                                opacity: newName.trim() ? 1 : 0.4,
                            }}
                        >
                            {creating ? (
                                <ActivityIndicator size="small" color="#000" />
                            ) : (
                                <Plus size={20} color="#000" />
                            )}
                        </AnimatedPressable>
                    </View>

                    {/* Divider */}
                    <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', marginHorizontal: 16, marginBottom: 8 }} />

                    {/* Playlists */}
                    {loading ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={colors.accent.cyan} />
                        </View>
                    ) : playlists.length === 0 ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 14 }}>No playlists yet</Text>
                        </View>
                    ) : (
                        playlists.map(playlist => (
                            <AnimatedPressable
                                key={playlist.id}
                                preset="row"
                                onPress={() => handleAdd(playlist.id)}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingVertical: 12,
                                    paddingHorizontal: 20,
                                }}
                            >
                                <View style={{
                                    width: 40, height: 40, borderRadius: 8,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <ListMusic size={18} color={colors.text.secondary} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                                        {playlist.name}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 1 }}>
                                        {playlist.songCount || 0} songs
                                    </Text>
                                </View>
                                {addedTo === playlist.id && (
                                    <Check size={20} color={colors.accent.cyan} />
                                )}
                            </AnimatedPressable>
                        ))
                    )}
                </View>
            </AnimatedPressable>
        </Modal>
    );
}
