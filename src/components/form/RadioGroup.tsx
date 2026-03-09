import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface RadioOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface RadioGroupProps {
    options: readonly RadioOption[] | RadioOption[];
    value: string;
    onChange: (value: string) => void;
    horizontal?: boolean;
}

const isWeb = Platform.OS === 'web';

export default function RadioGroup({ options, value, onChange, horizontal = false }: RadioGroupProps) {
    const { isDark, colors } = useTheme();

    return (
        <View style={horizontal ? { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } : { gap: 8 }}>
            {options.map((opt) => {
                const selected = value === opt.value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => !opt.disabled && onChange(opt.value)}
                        style={[
                            {
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 10,
                                paddingHorizontal: 14,
                                borderRadius: 10,
                                borderWidth: 1,
                                opacity: opt.disabled ? 0.4 : 1,
                            },
                            selected ? {
                                backgroundColor: isDark ? 'rgba(56,180,186,0.12)' : 'rgba(56,180,186,0.08)',
                                borderColor: '#38b4ba',
                            } : {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1', // Darker border
                            },
                            horizontal ? { flex: 1, minWidth: 100 } : {},
                        ]}
                    >
                        <View style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: selected ? '#38b4ba' : (isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8'), // Darker circle
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                        }}>
                            {selected && (
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#38b4ba' }} />
                            )}
                        </View>
                        <Text style={{
                            fontSize: 15,
                            fontWeight: selected ? '600' : '500',
                            color: selected ? (isDark ? '#38b4ba' : '#0f172a') : (isDark ? colors.text.secondary : '#334155'), // Darker text
                            flex: 1,
                        }}>
                            {opt.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
