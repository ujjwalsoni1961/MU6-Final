import React from 'react';
import { Text } from 'react-native';
import AnimatedPressable from './AnimatedPressable';

interface TabPillProps {
    label: string;
    active: boolean;
    onPress: () => void;
}

import { useTheme } from '../../context/ThemeContext';

export default function TabPill({ label, active, onPress }: TabPillProps) {
    const { isDark, colors } = useTheme();

    const activeBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
    const inactiveBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.25)';
    const activeBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)';
    const inactiveBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)';

    return (
        <AnimatedPressable
            preset="button"
            onPress={onPress}
            style={{
                borderRadius: 9999,
                paddingHorizontal: 16,
                paddingVertical: 8,
                marginRight: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? activeBg : inactiveBg,
                borderWidth: 1,
                borderColor: active ? activeBorder : inactiveBorder,
                shadowColor: active ? '#74e5ea' : 'transparent',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: active ? (isDark ? 0.4 : 0.2) : 0,
                shadowRadius: 8,
                elevation: active ? 3 : 0,
            }}
        >
            <Text
                style={{
                    fontSize: 13,
                    lineHeight: 20,
                    fontWeight: active ? '700' : '500',
                    color: active ? colors.accent.cyan : (isDark ? colors.text.muted : colors.text.secondary),
                    includeFontPadding: false,
                } as any}
            >
                {label}
            </Text>
        </AnimatedPressable>
    );
}
