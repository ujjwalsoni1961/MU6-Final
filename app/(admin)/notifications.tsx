import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Bell, Send } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { BroadcastModal, ActionButton } from '../../src/components/admin/AdminActionComponents';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useAdminNotifications } from '../../src/hooks/useAdminData';
import { useAdminNotificationActions } from '../../src/hooks/useAdminActions';

const isWeb = Platform.OS === 'web';

export default function AdminNotificationsScreen() {
    const { data: notifications, loading, error, refresh } = useAdminNotifications(100);
    const actions = useAdminNotificationActions(refresh);
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [broadcastLoading, setBroadcastLoading] = useState(false);

    const handleBroadcast = async (data: { title: string; body: string; type: string }) => {
        setBroadcastLoading(true);
        await actions.broadcastNotification(data);
        setBroadcastLoading(false);
        setShowBroadcast(false);
    };

    return (
        <AdminScreen
            title="Notifications"
            subtitle={!loading ? `${notifications.length} notifications` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
            rightAction={
                <AnimatedPressable
                    preset="card"
                    hapticType="none"
                    onPress={() => setShowBroadcast(true)}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: 'rgba(56,180,186,0.1)', paddingHorizontal: 16,
                        paddingVertical: 10, borderRadius: 10,
                        borderWidth: 1, borderColor: 'rgba(56,180,186,0.2)',
                    }}
                >
                    <Send size={14} color="#38b4ba" />
                    <Text style={{ color: '#38b4ba', fontWeight: '600', fontSize: 13 }}>Broadcast</Text>
                </AnimatedPressable>
            }
        >
            <AdminDataTable
                headers={['Recipient', 'Type', 'Title', 'Body', 'Read', 'Date']}
                data={notifications}
                emptyMessage="No notifications found"
                renderRow={(n) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Bell size={16} color={n.isRead ? '#475569' : '#facc15'} style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{n.profileName}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{n.type || '—'}</Text>
                                <Text style={{ flex: 1, color: '#f1f5f9', fontSize: 12 }}>{n.title || '—'}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }} numberOfLines={2}>{n.body || '—'}</Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={n.isRead ? 'completed' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Bell size={18} color={n.isRead ? '#475569' : '#facc15'} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{n.title || n.type || 'Notification'}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12 }}>{n.profileName} | {n.body || '—'}</Text>
                                </View>
                                <StatusBadge status={n.isRead ? 'completed' : 'pending'} />
                            </View>
                        )}
                    </View>
                )}
            />

            <BroadcastModal
                visible={showBroadcast}
                onSend={handleBroadcast}
                onCancel={() => setShowBroadcast(false)}
                loading={broadcastLoading}
            />
        </AdminScreen>
    );
}
