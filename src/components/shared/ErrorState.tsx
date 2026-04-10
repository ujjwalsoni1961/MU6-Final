import React from 'react';
import { View, Text } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import AnimatedPressable from './AnimatedPressable';

interface ErrorStateProps {
    message: string;
    onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
    const { colors, isDark } = useTheme();

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
            <View style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: 'rgba(239,68,68,0.1)',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <AlertTriangle size={28} color="#ef4444" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text.secondary, marginTop: 16, textAlign: 'center', lineHeight: 21 }}>
                {message}
            </Text>
            {onRetry && (
                <AnimatedPressable
                    preset="button"
                    hapticType="light"
                    onPress={onRetry}
                    style={{
                        marginTop: 20,
                        paddingHorizontal: 24,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    }}
                >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>Retry</Text>
                </AnimatedPressable>
            )}
        </View>
    );
}
