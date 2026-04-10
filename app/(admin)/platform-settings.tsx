import React, { useState } from 'react';
import { View, Text, TextInput, Platform, Alert } from 'react-native';
import { Settings, Save } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { AdminScreen, AdminDataTable } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminPlatformSettings } from '../../src/hooks/useAdminData';
import { supabase } from '../../src/lib/supabase';

const isWeb = Platform.OS === 'web';

export default function AdminPlatformSettingsScreen() {
    const { data: settings, loading, error, refresh } = useAdminPlatformSettings();
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);

    const startEdit = (key: string, currentValue: any) => {
        setEditingKey(key);
        setEditValue(typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : String(currentValue ?? ''));
    };

    const saveEdit = async (key: string) => {
        setSaving(true);
        try {
            let parsedValue: any = editValue;
            try { parsedValue = JSON.parse(editValue); } catch { /* use raw string */ }

            const { error: err } = await supabase
                .from('platform_settings')
                .update({ value: parsedValue })
                .eq('key', key);

            if (err) throw err;
            setEditingKey(null);
            refresh();
        } catch (err: any) {
            if (isWeb) {
                alert('Failed to save: ' + err.message);
            } else {
                Alert.alert('Error', err.message);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminScreen
            title="Platform Settings"
            subtitle={!loading ? `${settings.length} settings` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Key', 'Value', 'Last Updated', 'Actions']}
                data={settings}
                emptyMessage="No platform settings found"
                renderRow={(s) => {
                    const isEditing = editingKey === s.key;
                    const displayValue = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value ?? '');

                    return (
                        <View style={{
                            flexDirection: isWeb ? 'row' : 'column',
                            alignItems: isWeb ? 'center' : 'flex-start',
                            padding: 14,
                        }}>
                            {isWeb ? (
                                <>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <Settings size={16} color="#94a3b8" style={{ marginRight: 10 }} />
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{s.key}</Text>
                                    </View>
                                    <View style={{ flex: 2 }}>
                                        {isEditing ? (
                                            <TextInput
                                                value={editValue}
                                                onChangeText={setEditValue}
                                                multiline
                                                style={{
                                                    color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace',
                                                    backgroundColor: 'rgba(255,255,255,0.04)',
                                                    borderRadius: 8, padding: 10, borderWidth: 1,
                                                    borderColor: 'rgba(56,180,186,0.3)',
                                                    minHeight: 60,
                                                    ...(isWeb ? { outlineStyle: 'none' } as any : {}),
                                                }}
                                            />
                                        ) : (
                                            <Text style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }} numberOfLines={3}>
                                                {displayValue}
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={{ flex: 1, color: '#475569', fontSize: 12, marginLeft: 12 }}>
                                        {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : '—'}
                                    </Text>
                                    <View style={{ flex: 1, flexDirection: 'row', gap: 8, marginLeft: 12 }}>
                                        {isEditing ? (
                                            <>
                                                <AnimatedPressable
                                                    preset="row" hapticType="none"
                                                    onPress={() => saveEdit(s.key)}
                                                    style={{
                                                        backgroundColor: 'rgba(56,180,186,0.15)',
                                                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                        opacity: saving ? 0.5 : 1,
                                                    }}
                                                >
                                                    <Text style={{ color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>Save</Text>
                                                </AnimatedPressable>
                                                <AnimatedPressable
                                                    preset="row" hapticType="none"
                                                    onPress={() => setEditingKey(null)}
                                                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                                                >
                                                    <Text style={{ color: '#64748b', fontSize: 12 }}>Cancel</Text>
                                                </AnimatedPressable>
                                            </>
                                        ) : (
                                            <AnimatedPressable
                                                preset="row" hapticType="none"
                                                onPress={() => startEdit(s.key, s.value)}
                                                style={{
                                                    backgroundColor: 'rgba(255,255,255,0.04)',
                                                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                }}
                                            >
                                                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>Edit</Text>
                                            </AnimatedPressable>
                                        )}
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                        <Settings size={18} color="#94a3b8" style={{ marginRight: 10 }} />
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14, flex: 1 }}>{s.key}</Text>
                                        <AnimatedPressable
                                            preset="row" hapticType="none"
                                            onPress={() => startEdit(s.key, s.value)}
                                            style={{ padding: 4 }}
                                        >
                                            <Text style={{ color: '#38b4ba', fontSize: 12 }}>Edit</Text>
                                        </AnimatedPressable>
                                    </View>
                                    {isEditing ? (
                                        <View>
                                            <TextInput
                                                value={editValue}
                                                onChangeText={setEditValue}
                                                multiline
                                                style={{
                                                    color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace',
                                                    backgroundColor: 'rgba(255,255,255,0.04)',
                                                    borderRadius: 8, padding: 10, borderWidth: 1,
                                                    borderColor: 'rgba(56,180,186,0.3)',
                                                    minHeight: 60, marginBottom: 8,
                                                }}
                                            />
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                <AnimatedPressable preset="row" hapticType="none" onPress={() => saveEdit(s.key)}
                                                    style={{ backgroundColor: 'rgba(56,180,186,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                                                    <Text style={{ color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>Save</Text>
                                                </AnimatedPressable>
                                                <AnimatedPressable preset="row" hapticType="none" onPress={() => setEditingKey(null)}
                                                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                                                    <Text style={{ color: '#64748b', fontSize: 12 }}>Cancel</Text>
                                                </AnimatedPressable>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }} numberOfLines={2}>
                                            {displayValue}
                                        </Text>
                                    )}
                                </>
                            )}
                        </View>
                    );
                }}
            />
        </AdminScreen>
    );
}
