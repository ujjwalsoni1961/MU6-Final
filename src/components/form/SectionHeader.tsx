import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface SectionHeaderProps {
    number: number;
    title: string;
    subtitle?: string;
}

const isWeb = Platform.OS === 'web';

export default function SectionHeader({ number, title, subtitle }: SectionHeaderProps) {
    const { isDark, colors } = useTheme();

    return (
        <View style={{ marginBottom: 18, paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: '#38b4ba',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>{number}</Text>
                </View>
                <Text style={{
                    fontSize: isWeb ? 20 : 18,
                    fontWeight: '800',
                    color: isDark ? colors.text.primary : '#0f172a',
                    letterSpacing: -0.3,
                }}>
                    {title}
                </Text>
            </View>
            {subtitle && (
                <Text style={{
                    fontSize: 14,
                    color: isDark ? colors.text.muted : '#475569',
                    marginTop: 6,
                    marginLeft: 38,
                }}>
                    {subtitle}
                </Text>
            )}
        </View>
    );
}
