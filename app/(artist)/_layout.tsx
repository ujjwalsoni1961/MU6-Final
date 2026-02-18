import React from 'react';
import { View, Text, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { LayoutDashboard, Upload, Music, DollarSign, Gem, ChevronLeft } from 'lucide-react-native';

const isWeb = Platform.OS === 'web';

/* ─── Sidebar Nav Item ─── */
function SidebarItem({ path, match, label, Icon, active, onPress }: {
    path: string; match: string; label: string; Icon: any; active: boolean; onPress: () => void;
}) {
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
            <Icon size={18} color={active ? '#38b4ba' : '#64748b'} />
            <Text
                style={{
                    color: active ? '#38b4ba' : '#475569',
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

/* ─── Artist Web Sidebar ─── */
function ArtistSidebar() {
    const router = useRouter();
    const pathname = usePathname();

    const navItems = [
        { path: '/(artist)/dashboard', match: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
        { path: '/(artist)/upload', match: '/upload', label: 'Upload', Icon: Upload },
        { path: '/(artist)/songs', match: '/songs', label: 'My Songs', Icon: Music },
        { path: '/(artist)/earnings', match: '/earnings', label: 'Earnings', Icon: DollarSign },
        { path: '/(artist)/nft-manager', match: '/nft-manager', label: 'NFT Manager', Icon: Gem },
    ];

    return (
        <View
            style={{
                width: 200,
                backgroundColor: '#fafcfd',
                borderRightWidth: 1,
                borderRightColor: '#f1f5f9',
                paddingTop: 24,
                paddingHorizontal: 12,
            }}
        >
            {/* Logo + Back */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 32 }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#0f172a', letterSpacing: -2, fontStyle: 'italic' }}>
                    MU6
                </Text>
                <AnimatedPressable
                    preset="icon"
                    hapticType="none"
                    onPress={() => router.replace('/(auth)/login')}
                    style={{
                        marginLeft: 8,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <ChevronLeft size={16} color="#94a3b8" />
                </AnimatedPressable>
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
    );
}

/* ─── Layout Entry Point ─── */
export default function ArtistLayout() {
    const tabScreens = (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#38b4ba',
                tabBarInactiveTintColor: '#94a3b8',
                tabBarStyle: isWeb ? { display: 'none' } : {
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(255,255,255,0.4)',
                    paddingBottom: 4,
                    paddingTop: 4,
                    height: 56,
                },
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                sceneStyle: { backgroundColor: isWeb ? '#f8fafc' : 'transparent' },
            }}
        >
            <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} /> }} />
            <Tabs.Screen name="upload" options={{ title: 'Upload', tabBarIcon: ({ color, size }) => <Upload size={size} color={color} /> }} />
            <Tabs.Screen name="songs" options={{ title: 'Songs', tabBarIcon: ({ color, size }) => <Music size={size} color={color} /> }} />
            <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <DollarSign size={size} color={color} /> }} />
            <Tabs.Screen name="nft-manager" options={{ title: 'NFTs', tabBarIcon: ({ color, size }) => <Gem size={size} color={color} /> }} />
        </Tabs>
    );

    if (isWeb) {
        return (
            <View style={{ flex: 1, flexDirection: 'row', height: '100%' as any, backgroundColor: '#f8fafc' }}>
                <ArtistSidebar />
                <View style={{ flex: 1 }}>
                    {tabScreens}
                </View>
            </View>
        );
    }

    return tabScreens;
}
