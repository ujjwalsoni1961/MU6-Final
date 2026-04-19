import React, { useState, useRef } from 'react';
import { View, Text, Platform, Pressable, TextInput, Animated } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
    Home, Store, Library, Wallet as WalletIcon, Gem, Settings, LogOut,
    Music2, Menu, X, Search, User,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useSongs } from '../../hooks/useData';
import AnimatedPressable from './AnimatedPressable';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

/**
 * ConsumerWebHeader — unified top nav for consumer screens on web.
 *
 * Behaviour by breakpoint:
 *  - Mobile  (<640):  brand + search icon + hamburger that toggles a
 *                     full-width drop-down nav panel. No inline nav links.
 *  - Tablet  (<1024): brand + compact icon nav + search (collapsed) + avatar.
 *  - Desktop (>=1024): full brand + wordmark + icon+label nav + wide search
 *                     + avatar dropdown.
 *
 * The old separate `WebHeader` (logo + search + avatar) used to render INSIDE
 * ScreenScaffold, on top of this one, causing a duplicated-header bug on
 * mobile. Its functionality is now consolidated here.
 */

/* ─── Sub-components ─── */

function NavLink({
    label, Icon, active, onPress, showLabel,
}: {
    label: string; Icon: any; active: boolean; onPress: () => void; showLabel: boolean;
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
                paddingHorizontal: showLabel ? 14 : 10,
                paddingVertical: 8,
                borderRadius: 10,
                marginRight: 4,
                backgroundColor: active ? 'rgba(56,180,186,0.08)' : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? 'rgba(56,180,186,0.15)' : 'transparent',
            }}
        >
            <Icon size={16} color={active ? '#38b4ba' : (isDark ? '#94a3b8' : '#64748b')} />
            {showLabel && (
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

/* ─── Main header ─── */

export default function ConsumerWebHeader() {
    const router = useRouter();
    const pathname = usePathname() || '';
    const { isDark, colors } = useTheme();
    const { signOut, profile } = useAuth() as any;
    const { isMobile, isTablet, isDesktop } = useResponsive();

    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAvatarMenu, setShowAvatarMenu] = useState(false);
    const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Only render on web
    if (Platform.OS !== 'web') return null;

    const isActive = (match: string) => pathname.includes(match);

    const primaryNav = [
        { path: '/(consumer)/home', match: '/home', label: 'Home', Icon: Home },
        { path: '/(consumer)/marketplace', match: '/marketplace', label: 'Market', Icon: Store },
        { path: '/(consumer)/library', match: '/library', label: 'Library', Icon: Library },
        { path: '/(consumer)/collection', match: '/collection', label: 'Collection', Icon: Gem },
    ];

    const headerBg = isDark ? 'rgba(3,7,17,0.92)' : 'rgba(255,255,255,0.92)';
    const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';

    const avatarUrl = profile?.avatarPath
        ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatarPath}`
        : null;

    // Live search (desktop only — mobile uses a dedicated route)
    const { data: searchResults } = useSongs({ search: searchQuery, limit: 5 });

    /* ─── Mobile layout ─── */
    if (isMobile) {
        return (
            <View style={{
                // @ts-ignore web-only
                position: 'sticky' as any, top: 0, zIndex: 100,
                backgroundColor: headerBg,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                // @ts-ignore
                backdropFilter: 'saturate(180%) blur(12px)',
            }}>
                {/* Bar */}
                <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 12, paddingVertical: 10,
                    justifyContent: 'space-between',
                }}>
                    {/* Brand */}
                    <AnimatedPressable
                        preset="row" hapticType="none"
                        onPress={() => { setMenuOpen(false); router.push('/(consumer)/home' as any); }}
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                        <View style={{
                            width: 32, height: 32, borderRadius: 8,
                            backgroundColor: '#38b4ba',
                            alignItems: 'center', justifyContent: 'center',
                            marginRight: 10,
                        }}>
                            <Music2 size={18} color="#ffffff" />
                        </View>
                        <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700', letterSpacing: 0.5 }}>
                            MU6
                        </Text>
                    </AnimatedPressable>

                    {/* Right actions */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AnimatedPressable
                            preset="icon" hapticType="none"
                            onPress={() => setSearchOpen((v) => !v)}
                            style={{ padding: 8, borderRadius: 10 }}
                        >
                            {searchOpen
                                ? <X size={20} color={colors.text.primary} />
                                : <Search size={20} color={colors.text.primary} />}
                        </AnimatedPressable>
                        <AnimatedPressable
                            preset="icon" hapticType="none"
                            onPress={() => setMenuOpen((v) => !v)}
                            style={{ padding: 8, borderRadius: 10 }}
                        >
                            {menuOpen
                                ? <X size={22} color={colors.text.primary} />
                                : <Menu size={22} color={colors.text.primary} />}
                        </AnimatedPressable>
                    </View>
                </View>

                {/* Expanded search */}
                {searchOpen && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                            borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
                        }}>
                            <Search size={16} color={colors.text.muted} />
                            <TextInput
                                placeholder="Search songs, creators..."
                                placeholderTextColor={colors.text.muted}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                // @ts-ignore
                                style={{
                                    flex: 1, marginLeft: 10, fontSize: 14,
                                    color: colors.text.primary,
                                    outlineStyle: 'none' as any, outline: 'none' as any,
                                    backgroundColor: 'transparent', height: 28,
                                }}
                            />
                        </View>
                        {searchQuery.length > 0 && searchResults.length > 0 && (
                            <View style={{
                                marginTop: 8,
                                backgroundColor: isDark ? colors.bg.card : '#fff',
                                borderRadius: 12, padding: 8,
                                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                            }}>
                                {searchResults.slice(0, 5).map((s: any) => (
                                    <AnimatedPressable
                                        key={s.id}
                                        preset="row" hapticType="none"
                                        onPress={() => {
                                            setSearchOpen(false);
                                            setSearchQuery('');
                                            router.push({ pathname: '/(consumer)/song-detail', params: { id: s.id } } as any);
                                        }}
                                        style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8 }}
                                    >
                                        <Image source={{ uri: s.coverImage }} style={{ width: 36, height: 36, borderRadius: 6 }} contentFit="cover" />
                                        <View style={{ marginLeft: 10, flex: 1 }}>
                                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>{s.title}</Text>
                                            <Text style={{ fontSize: 11, color: colors.text.secondary }} numberOfLines={1}>{s.artistName}</Text>
                                        </View>
                                    </AnimatedPressable>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* Drop-down nav panel */}
                {menuOpen && (
                    <View style={{
                        borderTopWidth: 1, borderTopColor: borderColor,
                        paddingHorizontal: 8, paddingVertical: 8,
                    }}>
                        {primaryNav.map((item) => (
                            <AnimatedPressable
                                key={item.path}
                                preset="row" hapticType="none"
                                onPress={() => { setMenuOpen(false); router.push(item.path as any); }}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    paddingHorizontal: 14, paddingVertical: 12,
                                    borderRadius: 10,
                                    backgroundColor: isActive(item.match) ? 'rgba(56,180,186,0.08)' : 'transparent',
                                }}
                            >
                                <item.Icon size={18} color={isActive(item.match) ? '#38b4ba' : colors.text.secondary} />
                                <Text style={{
                                    marginLeft: 12, fontSize: 15,
                                    fontWeight: isActive(item.match) ? '600' : '500',
                                    color: isActive(item.match) ? '#38b4ba' : colors.text.primary,
                                }}>
                                    {item.label}
                                </Text>
                            </AnimatedPressable>
                        ))}
                        <View style={{ height: 1, backgroundColor: borderColor, marginVertical: 8 }} />
                        <AnimatedPressable
                            preset="row" hapticType="none"
                            onPress={() => { setMenuOpen(false); router.push('/(consumer)/wallet' as any); }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}
                        >
                            <WalletIcon size={18} color={colors.text.secondary} />
                            <Text style={{ marginLeft: 12, fontSize: 15, color: colors.text.primary }}>Wallet</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            preset="row" hapticType="none"
                            onPress={() => { setMenuOpen(false); router.push('/(consumer)/profile' as any); }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}
                        >
                            <User size={18} color={colors.text.secondary} />
                            <Text style={{ marginLeft: 12, fontSize: 15, color: colors.text.primary }}>Profile</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            preset="row" hapticType="none"
                            onPress={() => { setMenuOpen(false); router.push('/(consumer)/settings' as any); }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}
                        >
                            <Settings size={18} color={colors.text.secondary} />
                            <Text style={{ marginLeft: 12, fontSize: 15, color: colors.text.primary }}>Settings</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            preset="row" hapticType="none"
                            onPress={async () => {
                                setMenuOpen(false);
                                try { await signOut?.(); } catch { /* no-op */ }
                                router.replace('/(auth)/login' as any);
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}
                        >
                            <LogOut size={18} color={colors.status?.error || '#ef4444'} />
                            <Text style={{ marginLeft: 12, fontSize: 15, color: colors.status?.error || '#ef4444' }}>Sign out</Text>
                        </AnimatedPressable>
                    </View>
                )}
            </View>
        );
    }

    /* ─── Tablet / Desktop layout ─── */
    const showLabels = isDesktop;
    const horizontalPad = isTablet ? 16 : 24;
    const searchMaxWidth = isDesktop ? 360 : 200;

    const handleAvatarHoverIn = () => {
        if (closeTimeout.current) { clearTimeout(closeTimeout.current); closeTimeout.current = null; }
        setShowAvatarMenu(true);
    };
    const handleAvatarHoverOut = () => {
        closeTimeout.current = setTimeout(() => setShowAvatarMenu(false), 400);
    };

    return (
        <View style={{
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: horizontalPad,
            paddingVertical: 10,
            backgroundColor: headerBg,
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
            // @ts-ignore web-only
            position: 'sticky' as any, top: 0, zIndex: 100,
            // @ts-ignore
            backdropFilter: 'saturate(180%) blur(12px)',
        }}>
            {/* Brand */}
            <AnimatedPressable
                preset="row" hapticType="none"
                onPress={() => router.push('/(consumer)/home' as any)}
                style={{ flexDirection: 'row', alignItems: 'center', marginRight: 24, flexShrink: 0 }}
            >
                <View style={{
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: '#38b4ba',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 10,
                }}>
                    <Music2 size={18} color="#ffffff" />
                </View>
                <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 }}>
                    MU6
                </Text>
            </AnimatedPressable>

            {/* Primary nav */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
                {primaryNav.map((item) => (
                    <NavLink
                        key={item.path}
                        label={item.label}
                        Icon={item.Icon}
                        active={isActive(item.match)}
                        showLabel={showLabels}
                        onPress={() => router.push(item.path as any)}
                    />
                ))}
            </View>

            {/* Flexible spacer */}
            <View style={{ flex: 1 }} />

            {/* Search (desktop+tablet) */}
            <View style={{ position: 'relative', maxWidth: searchMaxWidth, flex: 1, marginHorizontal: 12, zIndex: 101 }}>
                <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                }}>
                    <Search size={14} color={colors.text.muted} />
                    <TextInput
                        placeholder={isDesktop ? 'Search songs, creators, NFTs...' : 'Search...'}
                        placeholderTextColor={colors.text.muted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        // @ts-ignore
                        style={{
                            flex: 1, marginLeft: 10, fontSize: 13,
                            color: colors.text.primary,
                            outlineStyle: 'none' as any, outline: 'none' as any,
                            backgroundColor: 'transparent',
                        }}
                    />
                </View>
                {searchQuery.length > 0 && searchResults.length > 0 && (
                    <View style={{
                        position: 'absolute', top: 42, left: 0, right: 0,
                        backgroundColor: isDark ? colors.bg.card : '#fff',
                        borderRadius: 12, padding: 8,
                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.12, shadowRadius: 16, elevation: 8,
                    }}>
                        {searchResults.slice(0, 5).map((s: any) => (
                            <AnimatedPressable
                                key={s.id}
                                preset="row" hapticType="none"
                                onPress={() => {
                                    setSearchQuery('');
                                    router.push({ pathname: '/(consumer)/song-detail', params: { id: s.id } } as any);
                                }}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8 }}
                            >
                                <Image source={{ uri: s.coverImage }} style={{ width: 36, height: 36, borderRadius: 6 }} contentFit="cover" />
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>{s.title}</Text>
                                    <Text style={{ fontSize: 11, color: colors.text.secondary }} numberOfLines={1}>{s.artistName}</Text>
                                </View>
                            </AnimatedPressable>
                        ))}
                    </View>
                )}
            </View>

            {/* Right cluster */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
                <NavLink
                    label="Wallet"
                    Icon={WalletIcon}
                    active={isActive('/wallet')}
                    showLabel={showLabels}
                    onPress={() => router.push('/(consumer)/wallet' as any)}
                />

                {/* Avatar with dropdown */}
                <View style={{ position: 'relative', marginLeft: 8, zIndex: 1000 }}>
                    <Pressable
                        onPress={() => setShowAvatarMenu((v) => !v)}
                        onHoverIn={handleAvatarHoverIn}
                        onHoverOut={handleAvatarHoverOut}
                        style={{
                            width: 34, height: 34, borderRadius: 17, overflow: 'hidden',
                            borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
                            cursor: 'pointer' as any,
                        }}
                    >
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={{ width: 30, height: 30, borderRadius: 15 }} contentFit="cover" />
                        ) : (
                            <View style={{
                                width: 30, height: 30, borderRadius: 15,
                                backgroundColor: 'rgba(56,180,186,0.15)',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <User size={16} color="#38b4ba" />
                            </View>
                        )}
                    </Pressable>
                    {showAvatarMenu && (
                        <Pressable
                            onHoverIn={handleAvatarHoverIn}
                            onHoverOut={handleAvatarHoverOut}
                            style={{
                                position: 'absolute', top: 42, right: 0, width: 200,
                                backgroundColor: isDark ? colors.bg.card : '#fff',
                                borderRadius: 14, paddingVertical: 6,
                                borderWidth: 1, borderColor: isDark ? colors.border?.base || 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                                shadowOpacity: 0.14, shadowRadius: 20, elevation: 12,
                            }}
                        >
                            <DropdownItem icon={<User size={16} color={colors.text.secondary} />} label="My Profile" onPress={() => { setShowAvatarMenu(false); router.push('/(consumer)/profile' as any); }} />
                            <DropdownItem icon={<Settings size={16} color={colors.text.secondary} />} label="Settings" onPress={() => { setShowAvatarMenu(false); router.push('/(consumer)/settings' as any); }} />
                            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', marginVertical: 4 }} />
                            <DropdownItem icon={<LogOut size={16} color={colors.status?.error || '#ef4444'} />} label="Sign out" labelColor={colors.status?.error || '#ef4444'} onPress={async () => {
                                setShowAvatarMenu(false);
                                try { await signOut?.(); } catch { /* no-op */ }
                                router.replace('/(auth)/login' as any);
                            }} />
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
}

function DropdownItem({
    icon, label, labelColor, onPress,
}: { icon: React.ReactNode; label: string; labelColor?: string; onPress: () => void }) {
    const { colors } = useTheme();
    return (
        <AnimatedPressable
            preset="row" hapticType="none" onPress={onPress}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 }}
        >
            {icon}
            <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: '500', color: labelColor || colors.text.primary }}>
                {label}
            </Text>
        </AnimatedPressable>
    );
}
