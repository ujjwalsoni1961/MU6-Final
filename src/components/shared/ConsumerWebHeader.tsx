import React from 'react';
import { View, Text, Platform, useWindowDimensions, ScrollView } from 'react-native';
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
    label, Icon, active, onPress, compact,
}: {
    label: string; Icon: any; active: boolean; onPress: () => void; compact?: boolean;
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
                paddingHorizontal: compact ? 10 : 14,
                paddingVertical: 8,
                borderRadius: 10,
                marginRight: 4,
                backgroundColor: active ? 'rgba(56,180,186,0.08)' : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? 'rgba(56,180,186,0.15)' : 'transparent',
            }}
        >
            <Icon size={16} color={active ? '#38b4ba' : (isDark ? '#94a3b8' : '#64748b')} />
            {!compact && (
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
            )}
        </AnimatedPressable>
    );
}

/* ─── Header (responsive) ─── */
export default function ConsumerWebHeader() {
    const router = useRouter();
    const pathname = usePathname() || '';
    const { isDark, colors } = useTheme();
    const { signOut } = useAuth() as any;
    const { width } = useWindowDimensions();

    // Only render on web — on native the bottom tab bar is the nav.
    if (Platform.OS !== 'web') return null;

    // Breakpoints:
    //   < 640px  → icon-only nav, compact logo (no wordmark), tight padding
    //   640-1024 → icon+label nav, slightly tighter padding
    //   >= 1024  → full spacious layout
    const isNarrow = width < 640;
    const isMedium = width < 1024;
    const showWordmark = width >= 480;
    const horizontalPad = isNarrow ? 12 : isMedium ? 16 : 24;

    const isActive = (match: string) => pathname.includes(match);

    const primaryNav = [
        { path: '/(consumer)/home', match: '/home', label: 'Home', Icon: Home },
        { path: '/(consumer)/marketplace', match: '/marketplace', label: 'Market', Icon: Store },
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
                paddingHorizontal: horizontalPad,
                paddingVertical: 10,
                backgroundColor: headerBg,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                // @ts-ignore — web-only CSS
                ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'saturate(180%) blur(12px)' } : {}),
            }}
        >
            {/* Brand logo (always visible) */}
            <AnimatedPressable
                preset="row"
                hapticType="none"
                onPress={() => router.push('/(consumer)/home' as any)}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginRight: isNarrow ? 8 : 24,
                    flexShrink: 0,
                }}
            >
                <View
                    style={{
                        width: 32, height: 32, borderRadius: 8,
                        backgroundColor: '#38b4ba',
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: showWordmark ? 10 : 0,
                    }}
                >
                    <Music2 size={18} color="#ffffff" />
                </View>
                {showWordmark && (
                    <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 }}>
                        MU6
                    </Text>
                )}
            </AnimatedPressable>

            {/* Primary nav (horizontally scrollable if overflow) */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}
                style={{ flex: 1 }}
            >
                {primaryNav.map((item) => (
                    <NavLink
                        key={item.path}
                        label={item.label}
                        Icon={item.Icon}
                        active={isActive(item.match)}
                        compact={isNarrow}
                        onPress={() => router.push(item.path as any)}
                    />
                ))}
            </ScrollView>

            {/* Right cluster: wallet, settings, sign out */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
                <NavLink
                    label="Wallet"
                    Icon={WalletIcon}
                    active={isActive('/wallet')}
                    compact={isNarrow}
                    onPress={() => router.push('/(consumer)/wallet' as any)}
                />
                {!isNarrow && (
                    <NavLink
                        label="Settings"
                        Icon={Settings}
                        active={isActive('/settings')}
                        compact={isMedium}
                        onPress={() => router.push('/(consumer)/settings' as any)}
                    />
                )}
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
                        paddingHorizontal: isNarrow ? 10 : 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        marginLeft: 4,
                    }}
                >
                    <LogOut size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                    {!isNarrow && (
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
                    )}
                </AnimatedPressable>
            </View>
        </View>
    );
}
