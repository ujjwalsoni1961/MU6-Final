import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ScrollText } from 'lucide-react-native';
import { AdminScreen, AdminDataTable } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminAuditLog } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminAuditLogScreen() {
    const { data: logs, loading, error, refresh } = useAdminAuditLog(100);

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
                data={logs}
                emptyMessage="No audit log entries found"
                renderRow={(log) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <ScrollText size={16} color="#60a5fa" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{log.action}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {log.adminId ? `${log.adminId.slice(0, 8)}...` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{log.targetType || '—'}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {log.targetId ? `${log.targetId.slice(0, 8)}...` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }} numberOfLines={2}>
                                    {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)) : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <ScrollText size={18} color="#60a5fa" style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{log.action}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>
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
