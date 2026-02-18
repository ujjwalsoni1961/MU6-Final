import React, { ReactNode } from 'react';
import { View, ViewStyle, Platform } from 'react-native';

interface GlassPillProps {
    children: ReactNode;
    style?: ViewStyle;
    dark?: boolean;
}

import { useTheme } from '../../context/ThemeContext';

const isAndroid = Platform.OS === 'android';

export default function GlassPill({ children, style, dark = false }: GlassPillProps) {
    const { isDark } = useTheme();

    // Android: use more opaque backgrounds since backdrop-filter doesn't work
    const bg = isDark
        ? (isAndroid ? 'rgba(20,30,50,0.75)' : 'rgba(255,255,255,0.08)')
        : (dark
            ? (isAndroid ? 'rgba(0,0,0,0.50)' : 'rgba(0,0,0,0.35)')
            : (isAndroid ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.25)'));

    const border = isDark
        ? 'rgba(255,255,255,0.1)'
        : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)');

    return (
        <View
            style={[
                {
                    backgroundColor: bg,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: border,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}
