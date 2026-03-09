import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface FormFieldProps {
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
    style?: any;
}

export default function FormField({ label, required, error, children, style }: FormFieldProps) {
    const { isDark, colors } = useTheme();

    return (
        <View style={[{ marginBottom: 20 }, style]}>
            <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: isDark ? colors.text.secondary : '#334155', // Darker slate-700
                marginBottom: 8,
                letterSpacing: 0.2,
            }}>
                {label}{required && <Text style={{ color: '#ef4444' }}> *</Text>}
            </Text>
            {children}
            {error ? (
                <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 4, fontWeight: '500' }}>{error}</Text>
            ) : null}
        </View>
    );
}
