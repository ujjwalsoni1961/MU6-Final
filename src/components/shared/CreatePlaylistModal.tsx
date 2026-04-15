/**
 * CreatePlaylistModal — Simple modal for creating a new playlist
 */

import React, { useState } from 'react';
import { View, Text, Modal, Platform, TextInput, ActivityIndicator, Alert } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import * as db from '../../services/database';
import { X } from 'lucide-react-native';

interface CreatePlaylistModalProps {
    visible: boolean;
    onClose: () => void;
    onCreated?: (playlist: db.PlaylistRow) => void;
}

export default function CreatePlaylistModal({ visible, onClose, onCreated }: CreatePlaylistModalProps) {
    const { isDark, colors } = useTheme();
    const { profile } = useAuth();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!name.trim() || !profile?.id) return;
        setCreating(true);
        const playlist = await db.createPlaylist(profile.id, name.trim(), description.trim() || undefined);
        setCreating(false);
        if (playlist) {
            setName('');
            setDescription('');
            onCreated?.(playlist);
            onClose();
        } else {
            Alert.alert('Error', 'Could not create playlist.');
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <View style={{
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    borderRadius: 20,
                    padding: 24,
                    width: '100%',
                    maxWidth: 400,
                }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text.primary }}>
                            New Playlist
                        </Text>
                        <AnimatedPressable preset="icon" onPress={onClose} style={{ padding: 4 }}>
                            <X size={20} color={colors.text.secondary} />
                        </AnimatedPressable>
                    </View>

                    {/* Name input */}
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="Playlist name"
                        placeholderTextColor={colors.text.muted}
                        style={{
                            height: 48,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            paddingHorizontal: 16,
                            fontSize: 16,
                            color: colors.text.primary,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            marginBottom: 12,
                        }}
                        autoFocus
                    />

                    {/* Description input */}
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Description (optional)"
                        placeholderTextColor={colors.text.muted}
                        multiline
                        numberOfLines={3}
                        style={{
                            minHeight: 80,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            paddingHorizontal: 16,
                            paddingTop: 12,
                            fontSize: 14,
                            color: colors.text.primary,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            marginBottom: 20,
                            textAlignVertical: 'top',
                        }}
                    />

                    {/* Create button */}
                    <AnimatedPressable
                        preset="button"
                        onPress={handleCreate}
                        style={{
                            height: 48,
                            borderRadius: 12,
                            backgroundColor: name.trim() ? colors.accent.cyan : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {creating ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <Text style={{ fontSize: 16, fontWeight: '700', color: name.trim() ? '#000' : colors.text.muted }}>
                                Create
                            </Text>
                        )}
                    </AnimatedPressable>
                </View>
            </View>
        </Modal>
    );
}
