import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Bell, Send } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { BroadcastModal } from '../../src/components/admin/AdminActionComponents';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useAdminNotifications } from '../../src/hooks/useAdminData';
import { useAdminNotificationActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminNotificationsScreen() {
    const { data: notifications, loading, error, refresh } = useAdminNotifications(100);
    const actions = useAdminNotificationActions(refresh);
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [broadcastLoading, setBroadcastLoading] = useState(false);
    const { colors } = useTheme();

    const handleBroadcast = async (data: { title: string; body: string; type: string }) => {
        setBroadcastLoading(true);
        await actions.broadcastNotification(data);
        setBroadcastLoading(false);
        setShowBroadcast(false);
    };

    const notifColumns = [
        { label: 'Recipient', flex: 1 },
        { label: 'Type', flex: 0.7 },
        { label: 'Title', flex: 1 },
        { label: 'Body', flex: 1.3 },
        { label: 'Read', flex: 0.6 },
        { label: 'Date', flex: 1 },
    ];

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
                        backgroundColor: `${colors.accent.cyan}15`, paddingHorizontal: 16,
                        paddingVertical: 10, borderRadius: 10,
                        borderWidth: 1, borderColor: `${colors.accent.cyan}20`,
                    }}
                >
                    <Send size={14} color={colors.accent.cyan} />
                    <Text style={{ color: colors.accent.cyan, fontWeight: '600', fontSize: 13 }}>Broadcast</Text>
                </AnimatedPressable>
            }
        >
            <AdminDataTable
                headers={['Recipient', 'Type', 'Title', 'Body', 'Read', 'Date']}
                columns={notifColumns}
                data={notifications}
                emptyMessage="No notifications found"
                minTableWidth={850}
                renderRow={(n) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Bell size={16} color={n.isRead ? colors.text.muted : colors.status.warning} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{n.profileName}</Text>
                                </View>
                                <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12, textTransform: 'capitalize' }}>{n.type || '—'}</Text>
                                <Text style={{ flex: 1, color: colors.text.primary, fontSize: 12 }} numberOfLines={1}>{n.title || '—'}</Text>
                                <Text style={{ flex: 1.3, color: colors.text.secondary, fontSize: 12 }} numberOfLines={2}>{n.body || '—'}</Text>
                                <View style={{ flex: 0.6 }}>
                                    <StatusBadge status={n.isRead ? 'completed' : 'pending'} />
                                </View>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 12 }}>
                                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Bell size={18} color={n.isRead ? colors.text.muted : colors.status.warning} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{n.title || n.type || 'Notification'}</Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{n.profileName} | {n.body || '—'}</Text>
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
