import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

interface CheckboxFieldProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}

export default function CheckboxField({ checked, onChange, label }: CheckboxFieldProps) {
    const { isDark, colors } = useTheme();

    return (
        <Pressable
            onPress={() => onChange(!checked)}
            style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: checked
                    ? (isDark ? 'rgba(56,180,186,0.06)' : 'rgba(56,180,186,0.04)')
                    : 'transparent',
                marginBottom: 4,
            }}
        >
            <View style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: checked ? '#38b4ba' : (isDark ? 'rgba(255,255,255,0.25)' : '#cbd5e1'),
                backgroundColor: checked ? '#38b4ba' : (isDark ? 'transparent' : '#fff'),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
                marginTop: 1,
            }}>
                {checked && <Check size={13} color="#fff" strokeWidth={3} />}
            </View>
            <Text style={{
                flex: 1,
                fontSize: 13,
                lineHeight: 19,
                color: isDark ? colors.text.secondary : '#475569',
                fontWeight: '500',
            }}>
                {label}
            </Text>
        </Pressable>
    );
}
