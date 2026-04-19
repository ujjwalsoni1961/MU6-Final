import React from 'react';
import { View, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Store, Library, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';

/* Custom Imports */
import { useTheme } from '../../src/context/ThemeContext';
import { PlayerProvider } from '../../src/context/PlayerContext';
import MusicPlayerOverlay from '../../src/components/player/MusicPlayerOverlay';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import WebHeader from '../../src/components/layout/WebHeader';

/* Constants */
const isWeb = Platform.OS === 'web';

/* Helpers */
const platformBottomPadding = (insets: EdgeInsets) => Math.max(insets.bottom, 16);

const getGlassTabBar = (isDark: boolean, colors: any, insets: EdgeInsets) => ({
    backgroundColor: isDark ? '#030711' : 'rgba(255,255,255,0.85)',
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.4)',
    paddingBottom: platformBottomPadding(insets),
    paddingTop: 8,
    height: 60 + platformBottomPadding(insets),
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 0,
});

/* ─── Layout Entry Point ─── */
import { useAuth } from '../../src/context/AuthContext';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native';

export default function ConsumerLayout() {
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { isConnected, isLoading, role, isBlocked } = useAuth();

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    // Guard: Redirect to login if not authenticated (handles web refresh on deep links)
    if (!isConnected) {
        return <Redirect href="/(auth)/login" />;
    }

    // PDF #13 — blocked users are bounced to the suspended screen.
    if (isBlocked) {
        return <Redirect href="/suspended" />;
    }

    // Role-based redirect: creators and admins cannot view consumer routes.
    // This prevents an artist from manually navigating to /home, /library, etc.
    if (role === 'creator') {
        return <Redirect href="/(artist)/dashboard" />;
    }
    if (role === 'admin') {
        return <Redirect href="/(admin)/dashboard" />;
    }

    return (
        <PlayerProvider>
            <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
                {isWeb && <WebHeader />}
                <Tabs
                    screenOptions={{
                        headerShown: false,
                        tabBarActiveTintColor: colors.accent.cyan,
                        tabBarInactiveTintColor: colors.text.muted,
                        tabBarStyle: isWeb ? { display: 'none' } : getGlassTabBar(isDark, colors, insets) as any,
                        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 0 },
                        sceneStyle: { backgroundColor: isWeb ? 'transparent' : 'transparent' },
                        tabBarBackground: () => (
                            isWeb ? null :
                                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(3,7,17,0.9)' : 'rgba(255,255,255,0.9)' }} />
                        ),
                        tabBarButton: (props) => (
                            <AnimatedPressable
                                {...props}
                                preset="icon"
                                hapticType="none" // Expo Router handles its own taps often, but we can animate our press size
                                style={[props.style, { flex: 1, borderRadius: 100 }]}
                            />
                        ),
                    }}
                >
                    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
                    <Tabs.Screen name="marketplace" options={{ title: 'Market', tabBarIcon: ({ color, size }) => <Store size={size} color={color} /> }} />
                    <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color, size }) => <Library size={size} color={color} /> }} />
                    <Tabs.Screen name="collection" options={{ title: 'Collection', tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} /> }} />
                    <Tabs.Screen name="wallet" options={{ href: null }} />
                    <Tabs.Screen name="profile" options={{ href: null }} />
                    <Tabs.Screen name="search" options={{ href: null }} />
                    <Tabs.Screen name="song-detail" options={{ href: null }} />
                    <Tabs.Screen name="artist-profile" options={{ href: null }} />
                    <Tabs.Screen name="nft-detail" options={{ href: null }} />
                    <Tabs.Screen name="settings" options={{ href: null }} />
                    <Tabs.Screen name="edit-profile" options={{ href: null }} />
                    <Tabs.Screen name="deposit" options={{ href: null }} />
                    <Tabs.Screen name="withdraw" options={{ href: null }} />
                    <Tabs.Screen name="bank-details" options={{ href: null }} />
                    <Tabs.Screen name="all-songs" options={{ href: null }} />
                    <Tabs.Screen name="all-creators" options={{ href: null }} />
                    <Tabs.Screen name="all-nfts" options={{ href: null }} />
                    <Tabs.Screen name="playlist-detail" options={{ href: null }} />
                    <Tabs.Screen name="notifications" options={{ href: null }} />
                </Tabs>

                {/* Global Music Player Overlay */}
                <MusicPlayerOverlay />
            </View>
        </PlayerProvider>
    );
}
