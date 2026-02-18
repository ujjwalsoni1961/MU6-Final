import React, { ReactNode } from 'react';
import { View, ViewStyle, Platform } from 'react-native';
import AnimatedPressable from './AnimatedPressable';

interface GlassCardProps {
    children: ReactNode;
    style?: ViewStyle;
    onPress?: () => void;
    intensity?: 'light' | 'medium' | 'heavy';
    noPadding?: boolean;
}

import { useTheme } from '../../context/ThemeContext';

const isAndroid = Platform.OS === 'android';

export default function GlassCard({
    children,
    style,
    onPress,
    intensity = 'medium',
    noPadding = false,
}: GlassCardProps) {
    const { isDark } = useTheme();

    const intensityMap = {
        light: {
            bg: isDark
                ? (isAndroid ? 'rgba(20,30,50,0.92)' : 'rgba(255,255,255,0.02)')
                : (isAndroid ? '#f8f9fa' : 'rgba(255,255,255,0.3)'),
            border: isDark
                ? 'rgba(255,255,255,0.04)'
                : (isAndroid ? 'transparent' : 'rgba(255,255,255,0.3)'),
        },
        medium: {
            bg: isDark
                ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.03)')
                : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.4)'),
            border: isDark
                ? 'rgba(255,255,255,0.06)'
                : (isAndroid ? 'transparent' : 'rgba(255,255,255,0.4)'),
        },
        heavy: {
            bg: isDark
                ? (isAndroid ? 'rgba(20,30,50,0.97)' : 'rgba(255,255,255,0.05)')
                : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.55)'),
            border: isDark
                ? 'rgba(255,255,255,0.08)'
                : (isAndroid ? 'transparent' : 'rgba(255,255,255,0.5)'),
        },
    };

    const config = intensityMap[intensity];

    const cardStyle: ViewStyle = {
        backgroundColor: config.bg,
        borderWidth: isAndroid && !isDark ? 0 : 1,
        borderColor: config.border,
        borderRadius: 24,
        padding: noPadding ? 0 : 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isAndroid ? 0 : (isDark ? 0.06 : 0.04),
        shadowRadius: 8,
        elevation: isAndroid ? (isDark ? 2 : 1) : (isDark ? 4 : 8),
        overflow: 'hidden',
    };

    if (onPress) {
        return (
            <AnimatedPressable
                preset="card"
                onPress={onPress}
                style={[cardStyle, style] as any}
            >
                {children}
            </AnimatedPressable>
        );
    }

    return <View style={[cardStyle, style]}>{children}</View>;
}
