import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ScrollText } from 'lucide-react-native';
import { AdminScreen, AdminDataTable } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminAuditLog } from '../../src/hooks/useAdminData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminAuditLogScreen() {
    const { data: logs, loading, error, refresh } = useAdminAuditLog(100);
    const { colors } = useTheme();

    const logColumns = [
        { label: 'Action', flex: 1 },
        { label: 'Admin ID', flex: 0.8 },
        { label: 'Target Type', flex: 0.8 },
        { label: 'Target ID', flex: 0.8 },
        { label: 'Details', flex: 1.3 },
        { label: 'Date', flex: 1 },
    ];

    return (
        <AdminScreen
            title="Admin Audit Log"
            subtitle={!loading ? `${logs.length} log entries` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Action', 'Admin ID', 'Target Type', 'Target ID', 'Details', 'Date']}
                columns={logColumns}
                data={logs}
                emptyMessage="No audit log entries found"
                minTableWidth={850}
                renderRow={(log) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <ScrollText size={16} color={colors.status.info} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>{log.action}</Text>
                                </View>
                                <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
                                    {log.adminId ? `${log.adminId.slice(0, 8)}...` : '—'}
                                </Text>
                                <Text style={{ flex: 0.8, color: colors.text.secondary, fontSize: 12 }}>{log.targetType || '—'}</Text>
                                <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
                                    {log.targetId ? `${log.targetId.slice(0, 8)}...` : '—'}
                                </Text>
                                <Text style={{ flex: 1.3, color: colors.text.secondary, fontSize: 12 }} numberOfLines={2}>
                                    {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)) : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>
                                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <ScrollText size={18} color={colors.status.info} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{log.action}</Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                                        {log.targetType || '—'} | {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}
