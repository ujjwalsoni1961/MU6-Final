import React, { ReactNode } from 'react';
import { View, Text } from 'react-native';
import GlassCard from './GlassCard';

interface StatCardProps {
    icon?: ReactNode;
    label: string;
    value: string | number;
}

import { useTheme } from '../../context/ThemeContext';

export default function StatCard({ icon, label, value }: StatCardProps) {
    const { colors } = useTheme();

    return (
        <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
            {icon && <View style={{ marginBottom: 6 }}>{icon}</View>}
            <Text
                style={{
                    color: colors.text.primary,
                    fontSize: 24,
                    fontWeight: '800',
                    letterSpacing: -0.5,
                }}
            >
                {value}
            </Text>
            <Text
                style={{
                    color: colors.text.secondary,
                    fontSize: 10,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginTop: 4,
                }}
            >
                {label}
            </Text>
        </GlassCard>
    );
}
