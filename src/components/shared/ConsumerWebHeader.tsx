import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Home, Store, Library, Wallet as WalletIcon, Gem, Settings, LogOut, Music2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import AnimatedPressable from './AnimatedPressable';

/**
 * ConsumerWebHeader
 *
 * Top navigation shown on web only (Platform.OS === 'web'). On native the
 * bottom tab bar remains the navigation. This header provides desktop-style
 * horizontal navigation for the consumer shell:
 *
 *  Home  Marketplace  Library  Collection       [ Wallet ]  [ Settings ]  [ Sign out ]
 *
 * Active route is highlighted with the app accent (#38b4ba). All routes
 * navigate via expo-router so SPA routing + URL-bar deep links stay
 * consistent with the rest of the app.
 */

/* ─── Single nav link ─── */
function NavLink({
    label, Icon, active, onPress,
}: {
    label: string; Icon: any; active: boolean; onPress: () => void;
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
                paddingVertical: 8,
                borderRadius: 10,
                marginRight: 4,
                backgroundColor: active ? 'rgba(56,180,186,0.08)' : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? 'rgba(56,180,186,0.15)' : 'transparent',
            }}
        >
            <Icon size={16} color={active ? '#38b4ba' : (isDark ? '#94a3b8' : '#64748b')} />
            <Text
                style={{
                    color: active ? '#38b4ba' : colors.text.secondary,
                    fontSize: 13,
                    fontWeight: active ? '600' : '500',
                    marginLeft: 8,
                }}
            >
                {label}
            </Text>
        </AnimatedPressable>
    );
}

/* ─── Header ─── */
export default function ConsumerWebHeader() {
    const router = useRouter();
    const pathname = usePathname() || '';
    const { isDark, colors } = useTheme();
    const { signOut, profile } = useAuth() as any;

    // Only render on web — on native the bottom tab bar is the nav.
    if (Platform.OS !== 'web') return null;

    const isActive = (match: string) => pathname.includes(match);

    const primaryNav = [
        { path: '/(consumer)/home', match: '/home', label: 'Home', Icon: Home },
        { path: '/(consumer)/marketplace', match: '/marketplace', label: 'Marketplace', Icon: Store },
        { path: '/(consumer)/library', match: '/library', label: 'Library', Icon: Library },
        { path: '/(consumer)/collection', match: '/collection', label: 'Collection', Icon: Gem },
    ];

    const headerBg = isDark ? 'rgba(3,7,17,0.92)' : 'rgba(255,255,255,0.92)';
    const borderColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.08)';

    return (
        <View
            style={{
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingVertical: 12,
                backgroundColor: headerBg,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                // @ts-ignore — web-only CSS
                ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'saturate(180%) blur(12px)' } : {}),
            }}
        >
            {/* Left: brand + primary nav */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <AnimatedPressable
                    preset="row"
                    hapticType="none"
                    onPress={() => router.push('/(consumer)/home' as any)}
                    style={{ flexDirection: 'row', alignItems: 'center', marginRight: 32 }}
                >
                    <View
                        style={{
                            width: 32, height: 32, borderRadius: 8,
                            backgroundColor: '#38b4ba',
                            alignItems: 'center', justifyContent: 'center',
                            marginRight: 10,
                        }}
                    >
                        <Music2 size={18} color="#ffffff" />
                    </View>
                    <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 }}>
                        MU6
                    </Text>
                </AnimatedPressable>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {primaryNav.map((item) => (
                        <NavLink
                            key={item.path}
                            label={item.label}
                            Icon={item.Icon}
                            active={isActive(item.match)}
                            onPress={() => router.push(item.path as any)}
                        />
                    ))}
                </View>
            </View>

            {/* Right: wallet + settings + sign out */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <NavLink
                    label="Wallet"
                    Icon={WalletIcon}
                    active={isActive('/wallet')}
                    onPress={() => router.push('/(consumer)/wallet' as any)}
                />
                <NavLink
                    label="Settings"
                    Icon={Settings}
                    active={isActive('/settings')}
                    onPress={() => router.push('/(consumer)/settings' as any)}
                />
                <AnimatedPressable
                    preset="row"
                    hapticType="none"
                    onPress={async () => {
                        try { await signOut?.(); } catch { /* no-op */ }
                        router.replace('/(auth)/login' as any);
                    }}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        marginLeft: 4,
                    }}
                >
                    <LogOut size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                    <Text
                        style={{
                            color: colors.text.secondary,
                            fontSize: 13,
                            fontWeight: '500',
                            marginLeft: 8,
                        }}
                    >
                        Sign out
                    </Text>
                </AnimatedPressable>
            </View>
        </View>
    );
}
