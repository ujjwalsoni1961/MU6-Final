import React, { useEffect } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { Tabs, useRouter, usePathname } from 'expo-router';
import {
    LayoutDashboard, Users, Music, ArrowLeftRight, FileCode,
    Shield, LogOut, Disc3, ShoppingBag, Tag,
    Radio, Wallet, PieChart, CreditCard, DollarSign,
    Settings, ScrollText, Bell, ListMusic,
} from 'lucide-react-native';
import { useAdminAuth } from '../../src/context/AdminAuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/components/admin/AdminActionComponents';

const isWeb = Platform.OS === 'web';

/* ─── Nav section type ─── */
interface NavSection {
    title: string;
    items: { path: string; match: string; label: string; Icon: any }[];
}

const navSections: NavSection[] = [
    {
        title: 'Overview',
        items: [
            { path: '/(admin)/dashboard', match: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
        ],
    },
    {
        title: 'User Management',
        items: [
            { path: '/(admin)/users', match: '/users', label: 'All Users', Icon: Users },
        ],
    },
    {
        title: 'Content',
        items: [
            { path: '/(admin)/songs', match: '/songs', label: 'Songs', Icon: Music },
            { path: '/(admin)/playlists', match: '/playlists', label: 'Playlists', Icon: ListMusic },
        ],
    },
    {
        title: 'NFT & Marketplace',
        items: [
            { path: '/(admin)/nft-releases', match: '/nft-releases', label: 'NFT Releases', Icon: Disc3 },
            { path: '/(admin)/nft-tokens', match: '/nft-tokens', label: 'NFT Tokens', Icon: Tag },
            { path: '/(admin)/marketplace', match: '/marketplace', label: 'Marketplace', Icon: ShoppingBag },
            { path: '/(admin)/contracts', match: '/contracts', label: 'Contracts', Icon: FileCode },
        ],
    },
    {
        title: 'Financial',
        items: [
            { path: '/(admin)/streams', match: '/streams', label: 'Streams', Icon: Radio },
            { path: '/(admin)/royalty-events', match: '/royalty-events', label: 'Royalty Events', Icon: DollarSign },
            { path: '/(admin)/royalty-shares', match: '/royalty-shares', label: 'Royalty Shares', Icon: PieChart },
            { path: '/(admin)/song-splits', match: '/song-splits', label: 'Song Splits', Icon: Wallet },
            { path: '/(admin)/payouts', match: '/payouts', label: 'Payouts', Icon: CreditCard },
            { path: '/(admin)/transactions', match: '/transactions', label: 'Transactions', Icon: ArrowLeftRight },
        ],
    },
    {
        title: 'Platform',
        items: [
            { path: '/(admin)/platform-settings', match: '/platform-settings', label: 'Settings', Icon: Settings },
            { path: '/(admin)/audit-log', match: '/audit-log', label: 'Audit Log', Icon: ScrollText },
            { path: '/(admin)/notifications', match: '/notifications', label: 'Notifications', Icon: Bell },
        ],
    },
];

/* ─── Sidebar Nav Item ─── */
function SidebarItem({ label, Icon, active, onPress }: {
    label: string; Icon: any; active: boolean; onPress: () => void;
}) {
    const { colors } = useTheme();

    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                marginBottom: 1,
                backgroundColor: active
                    ? `${colors.accent.cyan}12`
                    : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? `${colors.accent.cyan}20` : 'transparent',
            }}
        >
            <Icon size={16} color={active ? colors.accent.cyan : colors.text.muted} />
            <Text
                style={{
                    color: active ? colors.accent.cyan : colors.text.secondary,
                    fontSize: 13,
                    fontWeight: active ? '600' : '500',
                    marginLeft: 10,
                }}
            >
                {label}
            </Text>
        </AnimatedPressable>
    );
}

/* ─── Admin Web Sidebar ─── */
function AdminSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { adminLogout } = useAdminAuth();
    const { colors } = useTheme();

    return (
        <View
            style={{
                width: 220,
                backgroundColor: colors.bg.card,
                borderRightWidth: 1,
                borderRightColor: colors.border.glass,
                height: '100%' as any,
            }}
        >
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.glass }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -2, fontStyle: 'italic' }}>
                        MU6
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Shield size={12} color={colors.status.error} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.status.error, marginLeft: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Super Admin
                    </Text>
                </View>
            </View>

            {/* Navigation */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
            >
                {navSections.map((section) => (
                    <View key={section.title} style={{ marginBottom: 16 }}>
                        <Text style={{
                            fontSize: 10, fontWeight: '700', color: colors.text.muted,
                            textTransform: 'uppercase', letterSpacing: 1.5,
                            paddingHorizontal: 14, marginBottom: 6,
                        }}>
                            {section.title}
                        </Text>
                        {section.items.map(({ path, match, label, Icon }) => {
                            const active = pathname === match || pathname.startsWith(match + '/');
                            return (
                                <SidebarItem
                                    key={path}
                                    label={label}
                                    Icon={Icon}
                                    active={active}
                                    onPress={() => router.push(path as any)}
                                />
                            );
                        })}
                    </View>
                ))}
            </ScrollView>

            {/* Logout */}
            <View style={{ paddingHorizontal: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border.glass, paddingTop: 12 }}>
                <AnimatedPressable
                    preset="row"
                    hapticType="none"
                    onPress={async () => {
                        await adminLogout();
                        router.replace('/admin-login');
                    }}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                    }}
                >
                    <LogOut size={16} color={colors.status.error} />
                    <Text style={{ color: colors.status.error, fontSize: 13, fontWeight: '600', marginLeft: 10 }}>
                        Sign Out
                    </Text>
                </AnimatedPressable>
            </View>
        </View>
    );
}

/* ─── All tab screen definitions ─── */
const allScreens = [
    'dashboard', 'users', 'songs', 'playlists',
    'nft-releases', 'nft-tokens', 'marketplace', 'contracts',
    'streams', 'royalty-events', 'royalty-shares', 'song-splits', 'payouts', 'transactions',
    'platform-settings', 'audit-log', 'notifications',
];

/* ─── Layout Entry Point ─── */
export default function AdminLayout() {
    const { isAdminLoggedIn, isAdminLoading } = useAdminAuth();
    const { colors } = useTheme();
    const router = useRouter();

    // Redirect to admin login if not authenticated
    useEffect(() => {
        if (!isAdminLoading && !isAdminLoggedIn) {
            router.replace('/admin-login');
        }
    }, [isAdminLoading, isAdminLoggedIn]);

    if (isAdminLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.base }}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    if (!isAdminLoggedIn) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.base }}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
                <Text style={{ color: colors.text.secondary, marginTop: 12, fontSize: 14 }}>Redirecting to login...</Text>
            </View>
        );
    }

    const tabScreens = (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.accent.cyan,
                tabBarInactiveTintColor: colors.text.muted,
                tabBarStyle: isWeb ? { display: 'none' } : {
                    backgroundColor: colors.bg.card,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.glass,
                    paddingBottom: 4,
                    paddingTop: 4,
                    height: 56,
                },
                tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
                sceneStyle: { backgroundColor: colors.bg.base },
            }}
        >
            {allScreens.map((name) => (
                <Tabs.Screen
                    key={name}
                    name={name}
                    options={{
                        title: name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                        tabBarButton: isWeb ? () => null : undefined,
                        tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
                    }}
                />
            ))}
        </Tabs>
    );

    if (isWeb) {
        return (
            <ToastProvider>
                <View style={{ flex: 1, flexDirection: 'row', height: '100%' as any, backgroundColor: colors.bg.base }}>
                    <AdminSidebar />
                    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
                        {tabScreens}
                    </View>
                </View>
            </ToastProvider>
        );
    }

    return <ToastProvider>{tabScreens}</ToastProvider>;
}
