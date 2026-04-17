import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform, TextInput } from 'react-native';
import { ChevronDown, Search } from 'lucide-react-native';
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
    searchable?: boolean;
}

const isWeb = Platform.OS === 'web';

export default function SelectField({ options, value, onChange, placeholder = 'Select...', searchable = false }: SelectFieldProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { isDark, colors } = useTheme();

    const selectedLabel = options.find((o) => o.value === value)?.label;

    const filteredOptions = useMemo(() => {
        if (!searchable || !searchQuery) return options;
        const lowerQ = searchQuery.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(lowerQ));
    }, [options, searchable, searchQuery]);

    const handleClose = () => {
        setOpen(false);
        setSearchQuery('');
    };

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
                    borderColor: open ? '#38b4ba' : (isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1'),
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
                        maxHeight: 250,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {searchable && (
                            <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0', flexDirection: 'row', alignItems: 'center' }}>
                                <Search size={16} color={colors.text.muted} style={{ marginRight: 8 }} />
                                <TextInput
                                    autoFocus
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    placeholder="Search country..."
                                    placeholderTextColor={colors.text.muted}
                                    style={{ flex: 1, color: colors.text.primary, fontSize: 14, outlineStyle: 'none' } as any}
                                />
                            </View>
                        )}
                        <ScrollView style={{ flexShrink: 1 }}>
                            {filteredOptions.length === 0 ? (
                                <Text style={{ padding: 14, color: colors.text.muted, textAlign: 'center' }}>No results found</Text>
                            ) : (
                                filteredOptions.map((opt) => (
                                    <Pressable
                                        key={opt.value}
                                        onPress={() => {
                                            if (!opt.disabled) {
                                                onChange(opt.value);
                                                handleClose();
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
                                ))
                            )}
                        </ScrollView>
                    </View>
                ) : (
                    <Modal transparent animationType="fade" visible={open} onRequestClose={handleClose}>
                        <Pressable onPress={handleClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
                            <Pressable style={{
                                backgroundColor: isDark ? colors.bg.card : '#fff',
                                borderRadius: 16,
                                paddingVertical: 8,
                                maxHeight: '70%',
                            }}>
                                {searchable && (
                                    <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0', flexDirection: 'row', alignItems: 'center' }}>
                                        <Search size={18} color={colors.text.muted} style={{ marginRight: 8 }} />
                                        <TextInput
                                            autoFocus
                                            value={searchQuery}
                                            onChangeText={setSearchQuery}
                                            placeholder="Search country..."
                                            placeholderTextColor={colors.text.muted}
                                            style={{ flex: 1, color: colors.text.primary, fontSize: 16, padding: 0 }}
                                        />
                                    </View>
                                )}
                                <ScrollView keyboardShouldPersistTaps="handled">
                                    {filteredOptions.length === 0 ? (
                                        <Text style={{ padding: 20, color: colors.text.muted, textAlign: 'center' }}>No results found</Text>
                                    ) : (
                                        filteredOptions.map((opt) => (
                                            <Pressable
                                                key={opt.value}
                                                onPress={() => {
                                                    if (!opt.disabled) {
                                                        onChange(opt.value);
                                                        handleClose();
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
                                        ))
                                    )}
                                </ScrollView>
                            </Pressable>
                        </Pressable>
                    </Modal>
                )
            )}
        </View>
    );
}
