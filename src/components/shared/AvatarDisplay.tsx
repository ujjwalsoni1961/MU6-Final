/**
 * AvatarDisplay — Renders either a preset emoji avatar circle or
 * a regular image avatar, based on the avatar URL.
 *
 * Preset avatars use the `preset:<id>` URL scheme set by useData.ts.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

const PRESET_MAP: Record<string, { emoji: string; gradient: string[] }> = {
    pop:        { emoji: '🎤', gradient: ['#ec4899', '#a855f7'] },
    hiphop:     { emoji: '🎧', gradient: ['#f59e0b', '#d97706'] },
    rock:       { emoji: '🎸', gradient: ['#ef4444', '#991b1b'] },
    electronic: { emoji: '🎛️', gradient: ['#06b6d4', '#3b82f6'] },
    jazz:       { emoji: '🎷', gradient: ['#d97706', '#78350f'] },
    classical:  { emoji: '🎻', gradient: ['#1e3a5f', '#c9a84c'] },
    rnb:        { emoji: '💜', gradient: ['#7c3aed', '#db2777'] },
    lofi:       { emoji: '🌙', gradient: ['#8b5cf6', '#38bdf8'] },
    country:    { emoji: '🤠', gradient: ['#92400e', '#16a34a'] },
    metal:      { emoji: '🤘', gradient: ['#27272a', '#71717a'] },
    reggae:     { emoji: '🌴', gradient: ['#16a34a', '#eab308'] },
    afrobeat:   { emoji: '🥁', gradient: ['#ea580c', '#facc15'] },
};

const DEFAULT_PRESET = { emoji: '🎵', gradient: ['#38b4ba', '#0f766e'] };

interface AvatarDisplayProps {
    uri: string;
    size: number;
    style?: any;
}

export default function AvatarDisplay({ uri, size, style }: AvatarDisplayProps) {
    // Check if this is a preset avatar
    if (uri.startsWith('preset:')) {
        const presetId = uri.replace('preset:', '');
        const preset = PRESET_MAP[presetId] || DEFAULT_PRESET;
        return (
            <View style={[{
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: preset.gradient[0],
                alignItems: 'center', justifyContent: 'center',
            }, style]}>
                <Text style={{ fontSize: size * 0.45 }}>{preset.emoji}</Text>
            </View>
        );
    }

    // Regular image avatar
    return (
        <Image
            source={{ uri }}
            style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
            contentFit="cover"
        />
    );
}
