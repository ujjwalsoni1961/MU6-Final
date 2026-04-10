/**
 * Admin Action UI Components
 *
 * Reusable components for admin action controls:
 * - ConfirmModal: confirmation dialog for destructive actions
 * - ActionButton: small icon button for row actions
 * - ToggleSwitch: on/off toggle for boolean fields
 * - Toast: success/error notification overlay
 * - BroadcastModal: modal for sending platform notifications
 */

import React, { useState, useEffect } from 'react';
import {
    View, Text, Modal, TextInput, Platform, Animated,
    TouchableOpacity, Switch,
} from 'react-native';

const isWeb = Platform.OS === 'web';

/* ─── Confirm Modal ─── */
export function ConfirmModal({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    confirmColor = '#f87171',
    onConfirm,
    onCancel,
    loading = false,
}: {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmColor?: string;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={{
                flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
                justifyContent: 'center', alignItems: 'center', padding: 20,
            }}>
                <View style={{
                    backgroundColor: '#0f1724', borderRadius: 16, padding: 24,
                    width: isWeb ? 420 : '100%', maxWidth: 420,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                }}>
                    <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
                        {title}
                    </Text>
                    <Text style={{ color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 24 }}>
                        {message}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                        <TouchableOpacity
                            onPress={onCancel}
                            disabled={loading}
                            style={{
                                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
                                backgroundColor: 'rgba(255,255,255,0.06)',
                            }}
                        >
                            <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onConfirm}
                            disabled={loading}
                            style={{
                                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
                                backgroundColor: confirmColor, opacity: loading ? 0.6 : 1,
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                                {loading ? 'Processing...' : confirmLabel}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* ─── Action Button (icon + label) ─── */
export function ActionButton({
    label,
    icon,
    color = '#38b4ba',
    onPress,
    disabled = false,
    size = 'small',
}: {
    label?: string;
    icon: React.ReactNode;
    color?: string;
    onPress: () => void;
    disabled?: boolean;
    size?: 'small' | 'medium';
}) {
    const pad = size === 'medium' ? 8 : 6;
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: pad + 2, paddingVertical: pad,
                borderRadius: 8, backgroundColor: `${color}15`,
                opacity: disabled ? 0.4 : 1,
            }}
        >
            {icon}
            {label ? (
                <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
            ) : null}
        </TouchableOpacity>
    );
}

/* ─── Toggle Switch ─── */
export function ToggleSwitch({
    value,
    onToggle,
    label,
    activeColor = '#4ade80',
    disabled = false,
}: {
    value: boolean;
    onToggle: (newValue: boolean) => void;
    label?: string;
    activeColor?: string;
    disabled?: boolean;
}) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {label ? (
                <Text style={{ color: '#94a3b8', fontSize: 11 }}>{label}</Text>
            ) : null}
            <Switch
                value={value}
                onValueChange={onToggle}
                disabled={disabled}
                trackColor={{ false: '#334155', true: `${activeColor}50` }}
                thumbColor={value ? activeColor : '#64748b'}
                style={{ transform: [{ scale: 0.75 }] }}
            />
        </View>
    );
}

/* ─── Toast Notification ─── */
let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let setGlobalToast: ((toast: { message: string; type: 'success' | 'error' } | null) => void) | null = null;

export function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (setGlobalToast) {
        if (toastTimeout) clearTimeout(toastTimeout);
        setGlobalToast({ message, type });
        toastTimeout = setTimeout(() => {
            setGlobalToast?.(null);
        }, 3000);
    }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const fadeAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        setGlobalToast = setToast;
        return () => { setGlobalToast = null; };
    }, []);

    useEffect(() => {
        if (toast) {
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        } else {
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }
    }, [toast]);

    return (
        <View style={{ flex: 1 }}>
            {children}
            {toast && (
                <Animated.View style={{
                    position: 'absolute', top: isWeb ? 24 : 60, left: 0, right: 0,
                    alignItems: 'center', opacity: fadeAnim, zIndex: 9999,
                    pointerEvents: 'none',
                }}>
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: toast.type === 'success' ? '#065f46' : '#7f1d1d',
                        borderWidth: 1,
                        borderColor: toast.type === 'success' ? '#10b981' : '#ef4444',
                        paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
                        maxWidth: 400,
                    }}>
                        <Text style={{ fontSize: 14, color: '#fff' }}>
                            {toast.type === 'success' ? '\u2713' : '\u2717'}
                        </Text>
                        <Text style={{ color: '#f1f5f9', fontSize: 14, fontWeight: '600' }}>
                            {toast.message}
                        </Text>
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

/* ─── Broadcast Notification Modal ─── */
export function BroadcastModal({
    visible,
    onSend,
    onCancel,
    loading = false,
}: {
    visible: boolean;
    onSend: (data: { title: string; body: string; type: string }) => void;
    onCancel: () => void;
    loading?: boolean;
}) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [type, setType] = useState('announcement');

    const typeOptions = ['announcement', 'alert', 'update', 'promotion'];

    const handleSend = () => {
        if (!title.trim()) return;
        onSend({ title: title.trim(), body: body.trim(), type });
        setTitle('');
        setBody('');
        setType('announcement');
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={{
                flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
                justifyContent: 'center', alignItems: 'center', padding: 20,
            }}>
                <View style={{
                    backgroundColor: '#0f1724', borderRadius: 16, padding: 24,
                    width: isWeb ? 480 : '100%', maxWidth: 480,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                }}>
                    <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 20 }}>
                        Broadcast Notification
                    </Text>

                    {/* Type selector */}
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Type
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {typeOptions.map((t) => (
                            <TouchableOpacity
                                key={t}
                                onPress={() => setType(t)}
                                style={{
                                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                                    backgroundColor: type === t ? 'rgba(56,180,186,0.15)' : 'rgba(255,255,255,0.04)',
                                    borderWidth: 1,
                                    borderColor: type === t ? 'rgba(56,180,186,0.3)' : 'rgba(255,255,255,0.08)',
                                }}
                            >
                                <Text style={{
                                    color: type === t ? '#38b4ba' : '#94a3b8',
                                    fontSize: 12, fontWeight: '600', textTransform: 'capitalize',
                                }}>
                                    {t}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Title */}
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Title
                    </Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="Notification title..."
                        placeholderTextColor="#475569"
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
                            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                            padding: 12, color: '#f1f5f9', fontSize: 14, marginBottom: 16,
                            ...(isWeb ? { outlineStyle: 'none' } as any : {}),
                        }}
                    />

                    {/* Body */}
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Message
                    </Text>
                    <TextInput
                        value={body}
                        onChangeText={setBody}
                        placeholder="Notification message..."
                        placeholderTextColor="#475569"
                        multiline
                        numberOfLines={4}
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
                            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                            padding: 12, color: '#f1f5f9', fontSize: 14, marginBottom: 24,
                            minHeight: 100, textAlignVertical: 'top',
                            ...(isWeb ? { outlineStyle: 'none' } as any : {}),
                        }}
                    />

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                        <TouchableOpacity
                            onPress={onCancel}
                            disabled={loading}
                            style={{
                                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
                                backgroundColor: 'rgba(255,255,255,0.06)',
                            }}
                        >
                            <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSend}
                            disabled={loading || !title.trim()}
                            style={{
                                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
                                backgroundColor: '#38b4ba',
                                opacity: loading || !title.trim() ? 0.5 : 1,
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                                {loading ? 'Sending...' : 'Send to All Users'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* ─── Row Actions Container ─── */
export function RowActions({ children }: { children: React.ReactNode }) {
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            flexWrap: 'wrap',
        }}>
            {children}
        </View>
    );
}
