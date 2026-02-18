import React from 'react';
import { View, TextInput } from 'react-native';
import { Search, X } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';

interface SearchInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}

import { useTheme } from '../../context/ThemeContext';

export default function SearchInput({ value, onChangeText, placeholder = 'Search songs, artists, NFTs...', autoFocus }: SearchInputProps) {
    const { isDark, colors } = useTheme();

    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)',
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                paddingHorizontal: 16,
                paddingVertical: 12,
                shadowColor: '#74e5ea',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.3 : 0, // Remove shadow in light mode for cleaner look
                shadowRadius: 16,
                elevation: isDark ? 4 : 0, // Remove elevation in light mode
            }}
        >
            <Search size={18} color={isDark ? colors.text.muted : "#64748b"} />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.5)' : "#94a3b8"}
                autoFocus={autoFocus}
                underlineColorAndroid="transparent"
                style={{
                    flex: 1,
                    marginLeft: 12,
                    color: colors.text.primary,
                    fontSize: 16,
                    paddingVertical: 0, // Fix Android vertical alignment
                    outlineStyle: 'none',
                } as any}
            />
            {value.length > 0 && (
                <AnimatedPressable preset="icon" hapticType="none" onPress={() => onChangeText('')}>
                    <X size={18} color={isDark ? colors.text.muted : "#64748b"} />
                </AnimatedPressable>
            )}
        </View>
    );
}
