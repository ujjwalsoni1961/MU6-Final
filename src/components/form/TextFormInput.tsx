import React, { useState } from 'react';
import { TextInput, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface TextFormInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
    multiline?: boolean;
    maxLength?: number;
    editable?: boolean;
}

const isWeb = Platform.OS === 'web';

export default function TextFormInput({
    value,
    onChangeText,
    placeholder,
    keyboardType = 'default',
    multiline = false,
    maxLength,
    editable = true,
}: TextFormInputProps) {
    const { isDark, colors } = useTheme();
    const [focused, setFocused] = useState(false);

    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'}
            keyboardType={keyboardType}
            multiline={multiline}
            maxLength={maxLength}
            editable={editable}
            underlineColorAndroid="transparent"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: focused
                        ? '#38b4ba'
                        : isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1', // Darker border in light mode
                    paddingHorizontal: 16,
                    paddingVertical: isWeb ? 14 : 14, // Taller inputs
                    fontSize: 15, // Larger font
                    color: isDark ? colors.text.primary : '#0f172a', // Darker text
                    fontWeight: '500',
                    minHeight: multiline ? 80 : undefined,
                    textAlignVertical: multiline ? 'top' : 'center',
                },
                !editable && { opacity: 0.5, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc' },
                isWeb ? {
                    outlineStyle: 'none',
                    transitionProperty: 'border-color, box-shadow',
                    transitionDuration: '150ms',
                    boxShadow: focused ? '0 0 0 3px rgba(56,180,186,0.1)' : 'none',
                } as any : {},
            ]}
        />
    );
}
