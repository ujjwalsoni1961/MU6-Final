import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Upload, FileText } from 'lucide-react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { useTheme } from '../../context/ThemeContext';

interface FilePickerFieldProps {
    fileName: string;
    onPress: () => void;
    accept?: string;
    icon?: 'audio' | 'document';
}

const isWeb = Platform.OS === 'web';

export default function FilePickerField({ fileName, onPress, accept, icon = 'audio' }: FilePickerFieldProps) {
    const { isDark, colors } = useTheme();
    const IconComponent = icon === 'document' ? FileText : Upload;

    return (
        <AnimatedPressable
            preset="button"
            onPress={onPress}
            style={{
                borderWidth: 2,
                borderStyle: 'dashed' as any,
                borderColor: fileName
                    ? '#38b4ba'
                    : (isDark ? 'rgba(255,255,255,0.12)' : '#cbd5e1'),
                borderRadius: 14,
                paddingVertical: 22,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: fileName
                    ? (isDark ? 'rgba(56,180,186,0.06)' : 'rgba(56,180,186,0.04)')
                    : (isDark ? 'rgba(255,255,255,0.02)' : '#fafcfd'),
            }}
        >
            <View style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: fileName
                    ? 'rgba(56,180,186,0.12)'
                    : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
            }}>
                <IconComponent size={22} color={fileName ? '#38b4ba' : (isDark ? colors.text.muted : '#64748b')} />
            </View>
            {fileName ? (
                <Text style={{ color: '#38b4ba', fontWeight: '600', fontSize: 14 }}>{fileName}</Text>
            ) : (
                <>
                    <Text style={{ color: isDark ? colors.text.secondary : '#475569', fontWeight: '600', fontSize: 14 }}>
                        {isWeb ? 'Click to upload' : 'Tap to select file'}
                    </Text>
                    {accept && (
                        <Text style={{ color: isDark ? colors.text.muted : '#94a3b8', fontSize: 12, marginTop: 2 }}>{accept}</Text>
                    )}
                </>
            )}
        </AnimatedPressable>
    );
}
