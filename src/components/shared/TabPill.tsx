import React from 'react';
import { Text, Platform } from 'react-native';
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

    // PDF priority fix #4 — rectangular shadow artifact.
    //
    // RN-web translates `shadowOffset` + `shadowRadius` to a CSS `box-shadow`
    // and `elevation` to a separate Android-material-style shadow. On the web,
    // however, a non-zero `elevation` emits an ADDITIONAL black box-shadow that
    // stacks on top of the cyan shadow, producing a dark sharp-edged rectangle
    // around the active pill that reads as a "shadow artifact" in a horizontal
    // tab row. Platform-gate the shadow: keep the soft cyan glow on native,
    // drop to a pure border-based active state on web.
    const webSafeShadow = Platform.OS === 'web'
        ? { elevation: 0 }
        : {
            shadowColor: active ? '#74e5ea' : 'transparent',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: active ? (isDark ? 0.4 : 0.2) : 0,
            shadowRadius: 8,
            elevation: active ? 3 : 0,
        };

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
                borderColor: active
                    ? (Platform.OS === 'web'
                        // On web, give active pill a visible accent-tinted
                        // border so the active state is still obvious without
                        // relying on the (now-removed) shadow glow.
                        ? 'rgba(56,180,186,0.55)'
                        : activeBorder)
                    : inactiveBorder,
                ...webSafeShadow,
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
