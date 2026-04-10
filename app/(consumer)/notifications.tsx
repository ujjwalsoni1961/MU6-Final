import React, { useEffect } from 'react';
import { View, Text, FlatList, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, BellRing, DollarSign, UserPlus, Music, ShoppingBag, Megaphone } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import ErrorState from '../../src/components/shared/ErrorState';
import { useTheme } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/hooks/useData';

const isWeb = Platform.OS === 'web';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string | null;
    isRead: boolean;
    createdAt: string;
}

function getNotificationIcon(type: string, color: string) {
    const size = 20;
    switch (type) {
        case 'royalty_earned': return <DollarSign size={size} color={color} />;
        case 'new_follower': return <UserPlus size={size} color={color} />;
        case 'nft_sold': return <ShoppingBag size={size} color={color} />;
        case 'new_song': return <Music size={size} color={color} />;
        case 'broadcast': return <Megaphone size={size} color={color} />;
        default: return <BellRing size={size} color={color} />;
    }
}

function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

export default function NotificationsScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { data: notifications, loading, error, refresh, markAllRead } = useNotifications();

    // Mark all as read when the screen is viewed
    useEffect(() => {
        if (notifications.length > 0) {
            const unread = notifications.filter((n) => !n.isRead);
            if (unread.length > 0) {
                markAllRead();
            }
        }
    }, [notifications.length]);

    const renderNotification = ({ item }: { item: Notification }) => {
        const iconBg = item.isRead
            ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
            : (isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.1)');
        const iconColor = item.isRead ? colors.text.muted : colors.accent.cyan;

        return (
            <View style={{
                flexDirection: 'row',
                paddingVertical: 14,
                paddingHorizontal: 16,
                backgroundColor: item.isRead
                    ? 'transparent'
                    : (isDark ? 'rgba(56,180,186,0.04)' : 'rgba(56,180,186,0.03)'),
                borderBottomWidth: 1,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            }}>
                <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: iconBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                }}>
                    {getNotificationIcon(item.type, iconColor)}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{
                        color: colors.text.primary,
                        fontSize: 14,
                        fontWeight: item.isRead ? '500' : '700',
                    }} numberOfLines={2}>
                        {item.title}
                    </Text>
                    {item.body && (
                        <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                            {item.body}
                        </Text>
                    )}
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4 }}>
                        {timeAgo(item.createdAt)}
                    </Text>
                </View>
                {!item.isRead && (
                    <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.accent.cyan,
                        alignSelf: 'center',
                        marginLeft: 8,
                    }} />
                )}
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
            <View style={{
                paddingTop: isWeb ? 24 : 56,
                paddingHorizontal: 16,
                paddingBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
            }}>
                <AnimatedPressable preset="icon" onPress={() => router.back()} style={{ marginRight: 12 }}>
                    <ArrowLeft size={24} color={colors.text.primary} />
                </AnimatedPressable>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                    Notifications
                </Text>
            </View>

            {loading ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            ) : error ? (
                <ErrorState message={error} onRetry={refresh} />
            ) : notifications.length > 0 ? (
                <FlatList
                    data={notifications}
                    renderItem={renderNotification}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 120 }}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 }}>
                    <Bell size={48} color={colors.text.muted} />
                    <Text style={{ color: colors.text.secondary, fontSize: 16, marginTop: 16 }}>
                        No notifications yet
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4 }}>
                        You'll be notified about royalties, sales, and new followers.
                    </Text>
                </View>
            )}
        </View>
    );
}
