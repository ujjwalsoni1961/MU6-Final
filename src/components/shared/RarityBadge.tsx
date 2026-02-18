import React from 'react';
import { Text } from 'react-native';
import GlassPill from './GlassPill';

interface RarityBadgeProps {
    rarity: 'common' | 'rare' | 'legendary';
}

const rarityColors: Record<string, string> = {
    common: '#94a3b8',
    rare: '#8b5cf6',
    legendary: '#f59e0b',
};

export default function RarityBadge({ rarity }: RarityBadgeProps) {
    return (
        <GlassPill
            style={{
                backgroundColor: rarityColors[rarity] + '33',
                borderColor: rarityColors[rarity] + '55',
            }}
        >
            <Text
                style={{
                    color: rarity === 'common' ? '#fff' : rarityColors[rarity],
                    fontSize: 10,
                    lineHeight: 14,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    includeFontPadding: false,
                } as any}
            >
                {rarity}
            </Text>
        </GlassPill>
    );
}
