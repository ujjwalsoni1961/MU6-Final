import React from 'react';
import { View, Text, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { LayoutDashboard, Upload, Music, DollarSign, Gem, Settings, LogOut, Users } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useCreatorRole } from '../../src/hooks/useCreatorRole';

const isWeb = Platform.OS === 'web';

/* ─── Sidebar Nav Item ─── */
function SidebarItem({ path, match, label, Icon, active, onPress }: {
    path: string; match: string; label: string; Icon: any; active: boolean; onPress: () => void;
}) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                marginBottom: 2,
                backgroundColor: active
                    ? 'rgba(56,180,186,0.08)'
                    : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? 'rgba(56,180,186,0.15)' : 'transparent',
            }}
        >
            <Icon size={18} color={active ? '#38b4ba' : isDark ? '#64748b' : '#94a3b8'} />
            <Text
                style={{
                    color: active ? '#38b4ba' : colors.text.secondary,
                    fontSize: 14,
                    fontWeight: active ? '600' : '500',
                    marginLeft: 12,
                }}
            >
                {label}
            </Text>
        </AnimatedPressable>
    );
}

/* ─── Creator Web Sidebar ─── */
function CreatorSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { signOut } = useAuth();
    const { isDark, colors } = useTheme();
    const { isCollaborator } = useCreatorRole();

    const allNavItems = [
        { path: '/(artist)/dashboard', match: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, showFor: 'all' },
        { path: '/(artist)/upload', match: '/upload', label: 'Upload', Icon: Upload, showFor: 'artist' },
        { path: '/(artist)/songs', match: '/songs', label: 'My Songs', Icon: Music, showFor: 'artist' },
        { path: '/(artist)/earnings', match: '/earnings', label: 'Earnings', Icon: DollarSign, showFor: 'all' },
        { path: '/(artist)/nft-manager', match: '/nft-manager', label: 'NFT Manager', Icon: Gem, showFor: 'artist' },
        { path: '/(artist)/my-splits', match: '/my-splits', label: 'My Splits', Icon: Users, showFor: 'collaborator' },
        { path: '/(artist)/splits', match: '/splits', label: 'Splits', Icon: Users, showFor: 'artist' },
        { path: '/(artist)/settings', match: '/settings', label: 'Settings', Icon: Settings, showFor: 'all' },
    ];

    const navItems = allNavItems.filter(item => {
        if (item.showFor === 'all') return true;
        if (item.showFor === 'artist') return !isCollaborator;
        if (item.showFor === 'collaborator') return isCollaborator;
        return true;
    });

    const handleLogout = async () => {
        await signOut();
        router.replace('/(auth)/login');
    };

    return (
        <View
            style={{
                width: 200,
                backgroundColor: colors.bg.base,
                borderRightWidth: 1,
                borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                paddingTop: 24,
                paddingHorizontal: 12,
                justifyContent: 'space-between',
                paddingBottom: 20,
            }}
        >
            <View>
                {/* Logo */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 32 }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -2, fontStyle: 'italic' }}>
                        MU6
                    </Text>
                    <View style={{
                        marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2,
                        borderRadius: 4, backgroundColor: isCollaborator ? 'rgba(56,180,186,0.1)' : 'rgba(139,92,246,0.1)',
                    }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: isCollaborator ? '#38b4ba' : '#8b5cf6', letterSpacing: 1 }}>
                            {isCollaborator ? 'COLLABORATOR' : 'CREATOR'}
                        </Text>
                    </View>
                </View>

                {/* Nav */}
                {navItems.map(({ path, match, label, Icon }) => {
                    const active = pathname === match || pathname.startsWith(match);
                    return (
                        <SidebarItem
                            key={path}
                            path={path}
                            match={match}
                            label={label}
                            Icon={Icon}
                            active={active}
                            onPress={() => router.push(path as any)}
                        />
                    );
                })}
            </View>

            {/* Logout button at bottom */}
            <AnimatedPressable
                preset="row"
                hapticType="light"
                onPress={handleLogout}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: 'rgba(239,68,68,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(239,68,68,0.12)',
                }}
            >
                <LogOut size={16} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600', marginLeft: 10 }}>
                    Logout
                </Text>
            </AnimatedPressable>
        </View>
    );
}

import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

/* ─── Layout Entry Point ─── */
export default function CreatorLayout() {
    const { isDark, colors } = useTheme();
    const { isConnected, isLoading } = useAuth();

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.base }}>
                <ActivityIndicator size="large" color="#38b4ba" />
            </View>
        );
    }

    // Guard: Redirect to login if not authenticated (handles web refresh on deep links)
    if (!isConnected) {
        return <Redirect href="/(auth)/login" />;
    }

    const tabScreens = (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#38b4ba',
                tabBarInactiveTintColor: '#94a3b8',
                tabBarStyle: isWeb ? { display: 'none' } : {
                    backgroundColor: isDark ? '#030711' : 'rgba(255,255,255,0.5)',
                    borderTopWidth: 1,
                    borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.4)',
                    paddingBottom: 4,
                    paddingTop: 4,
                    height: 56,
                },
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                sceneStyle: { backgroundColor: colors.bg.base },
            }}
        >
            <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} /> }} />
            <Tabs.Screen name="upload" options={{ title: 'Upload', tabBarIcon: ({ color, size }) => <Upload size={size} color={color} /> }} />
            <Tabs.Screen name="songs" options={{ title: 'Songs', tabBarIcon: ({ color, size }) => <Music size={size} color={color} /> }} />
            <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <DollarSign size={size} color={color} /> }} />
            <Tabs.Screen name="nft-manager" options={{ title: 'NFTs', tabBarIcon: ({ color, size }) => <Gem size={size} color={color} /> }} />
            <Tabs.Screen name="splits" options={{ href: null }} />
            <Tabs.Screen name="my-splits" options={{ href: null }} />
            <Tabs.Screen name="settings" options={{ href: null }} />
            <Tabs.Screen name="split-editor" options={{ href: null }} />
            <Tabs.Screen name="edit-artist-profile" options={{ href: null }} />
            <Tabs.Screen name="edit-song" options={{ href: null }} />
        </Tabs>
    );

    if (isWeb) {
        return (
            <View style={{ flex: 1, flexDirection: 'row', height: '100%' as any, backgroundColor: colors.bg.base }}>
                <CreatorSidebar />
                <View style={{ flex: 1 }}>
                    {tabScreens}
                </View>
            </View>
        );
    }

    return tabScreens;
}
