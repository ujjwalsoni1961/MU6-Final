import React from 'react';
import { View, Text } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import AnimatedPressable from './AnimatedPressable';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
    const { colors } = useTheme();

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
            {icon || <Inbox size={48} color={colors.text.muted} />}
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text.secondary, marginTop: 16, textAlign: 'center' }}>
                {title}
            </Text>
            {subtitle && (
                <Text style={{ fontSize: 13, color: colors.text.muted, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
                    {subtitle}
                </Text>
            )}
            {actionLabel && onAction && (
                <AnimatedPressable
                    preset="button"
                    hapticType="light"
                    onPress={onAction}
                    style={{
                        marginTop: 20,
                        paddingHorizontal: 24,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: '#38b4ba',
                    }}
                >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{actionLabel}</Text>
                </AnimatedPressable>
            )}
        </View>
    );
}
