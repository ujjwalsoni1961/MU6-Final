import React from 'react';
import { Text } from 'react-native';
import AnimatedPressable from './AnimatedPressable';

interface GenreTagProps {
    genre: string;
    onPress?: () => void;
}

import { useTheme } from '../../context/ThemeContext';

export default function GenreTag({ genre, onPress }: GenreTagProps) {
    const { isDark } = useTheme();

    return (
        <AnimatedPressable
            preset="button"
            onPress={onPress}
            style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)',
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                paddingHorizontal: 14,
                paddingVertical: 6,
            }}
        >
            <Text style={{ color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{genre}</Text>
        </AnimatedPressable>
    );
}
