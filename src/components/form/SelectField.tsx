import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SelectFieldProps {
    options: readonly SelectOption[] | SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

const isWeb = Platform.OS === 'web';

export default function SelectField({ options, value, onChange, placeholder = 'Select...' }: SelectFieldProps) {
    const [open, setOpen] = useState(false);
    const { isDark, colors } = useTheme();

    const selectedLabel = options.find((o) => o.value === value)?.label;

    return (
        <View style={{ zIndex: open ? 1000 : 1 }}>
            <Pressable
                onPress={() => setOpen(!open)}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: open ? '#38b4ba' : (isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1'), // Darker border
                    paddingHorizontal: 16,
                    paddingVertical: isWeb ? 14 : 14,
                }}
            >
                <Text style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: selectedLabel ? (isDark ? colors.text.primary : '#0f172a') : (isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'),
                }}>
                    {selectedLabel || placeholder}
                </Text>
                <ChevronDown
                    size={16}
                    color={colors.text.muted}
                    style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                />
            </Pressable>

            {open && (
                isWeb ? (
                    <View style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        marginTop: 4,
                        backgroundColor: isDark ? colors.bg.card : '#fff',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: isDark ? 0.3 : 0.1,
                        shadowRadius: 20,
                        elevation: 10,
                        maxHeight: 220,
                        overflow: 'hidden',
                    }}>
                        <ScrollView>
                            {options.map((opt) => (
                                <Pressable
                                    key={opt.value}
                                    onPress={() => {
                                        if (!opt.disabled) {
                                            onChange(opt.value);
                                            setOpen(false);
                                        }
                                    }}
                                    style={({ hovered }: any) => ({
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                        backgroundColor: opt.value === value
                                            ? (isDark ? 'rgba(56,180,186,0.12)' : 'rgba(56,180,186,0.06)')
                                            : hovered ? (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc') : 'transparent',
                                        opacity: opt.disabled ? 0.4 : 1,
                                    })}
                                >
                                    <Text style={{
                                        fontSize: 14,
                                        fontWeight: opt.value === value ? '600' : '500',
                                        color: opt.value === value ? '#38b4ba' : colors.text.primary,
                                    }}>
                                        {opt.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                ) : (
                    <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
                        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 }}>
                            <View style={{
                                backgroundColor: isDark ? colors.bg.card : '#fff',
                                borderRadius: 20,
                                paddingVertical: 8,
                                maxHeight: 400,
                            }}>
                                <ScrollView>
                                    {options.map((opt) => (
                                        <Pressable
                                            key={opt.value}
                                            onPress={() => {
                                                if (!opt.disabled) {
                                                    onChange(opt.value);
                                                    setOpen(false);
                                                }
                                            }}
                                            style={{
                                                paddingHorizontal: 20,
                                                paddingVertical: 14,
                                                opacity: opt.disabled ? 0.4 : 1,
                                            }}
                                        >
                                            <Text style={{
                                                fontSize: 16,
                                                fontWeight: opt.value === value ? '700' : '500',
                                                color: opt.value === value ? '#38b4ba' : colors.text.primary,
                                            }}>
                                                {opt.label}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            </View>
                        </Pressable>
                    </Modal>
                )
            )}
        </View>
    );
}
