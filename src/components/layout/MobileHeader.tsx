import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    Animated, Platform, View, Text, Modal, TouchableOpacity,
    FlatList, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
    Search, Bell, BellRing, DollarSign, UserPlus, Music,
    ShoppingBag, Megaphone,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications, useUnreadNotificationCount } from '../../hooks/useData';
import AnimatedPressable from '../shared/AnimatedPressable';

interface MobileHeaderProps {
    scrollY?: Animated.Value;
}

/* ── notification helpers (shared with notifications screen) ── */

function getNotificationIcon(type: string, color: string) {
    const size = 18;
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

export default function MobileHeader({ scrollY }: MobileHeaderProps) {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data: unreadCount } = useUnreadNotificationCount();
    const { data: notifications, loading: notifLoading, markAllRead } = useNotifications(20);

    const headerHeight = insets.top + 56;

    const translateY = useRef(new Animated.Value(0)).current;
    const lastScrollY = useRef(0);
    const isHidden = useRef(false);

    // Notification popup state
    const [popupVisible, setPopupVisible] = useState(false);
    const popupAnim = useRef(new Animated.Value(0)).current;

    const openPopup = useCallback(() => {
        setPopupVisible(true);
        Animated.spring(popupAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 100,
            friction: 12,
        }).start();
        // Mark all as read when popup opens
        if (unreadCount > 0) {
            markAllRead();
        }
    }, [unreadCount, markAllRead, popupAnim]);

    const closePopup = useCallback(() => {
        Animated.timing(popupAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
        }).start(() => setPopupVisible(false));
    }, [popupAnim]);

    useEffect(() => {
        if (!scrollY || Platform.OS === 'web') return;

        const listenerId = scrollY.addListener(({ value }) => {
            const diff = value - lastScrollY.current;
            lastScrollY.current = value;

            if (value < headerHeight) {
                if (isHidden.current) {
                    isHidden.current = false;
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 80,
                        friction: 12,
                    }).start();
                }
                return;
            }

            if (diff > 4 && !isHidden.current) {
                isHidden.current = true;
                Animated.spring(translateY, {
                    toValue: -headerHeight,
                    useNativeDriver: true,
                    tension: 80,
                    friction: 12,
                }).start();
            } else if (diff < -4 && isHidden.current) {
                isHidden.current = false;
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 80,
                    friction: 12,
                }).start();
            }
        });

        return () => scrollY.removeListener(listenerId);
    }, [scrollY, headerHeight, translateY]);

    if (Platform.OS === 'web') return null;

    const screenWidth = Dimensions.get('window').width;
    const popupWidth = Math.min(screenWidth - 32, 340);

    return (
        <>
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    paddingTop: insets.top + 6,
                    paddingBottom: 10,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    // Fully transparent — blends with whatever is behind
                    backgroundColor: 'transparent',
                    transform: [{ translateY }],
                }}
            >
                {/* Logo */}
                <Image
                    source={require('../../../assets/mu6-logo.png')}
                    style={{ width: 34, height: 34, borderRadius: 8 }}
                    contentFit="contain"
                />

                {/* Right Actions */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {/* Search */}
                    <AnimatedPressable
                        preset="icon"
                        onPress={() => router.push('/(consumer)/search')}
                        style={{
                            width: 36,
                            height: 36,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Search size={20} color={isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'} />
                    </AnimatedPressable>

                    {/* Notifications */}
                    <AnimatedPressable
                        preset="icon"
                        onPress={popupVisible ? closePopup : openPopup}
                        style={{
                            width: 36,
                            height: 36,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Bell size={20} color={isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'} />
                        {unreadCount > 0 && (
                            <View style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                minWidth: 16,
                                height: 16,
                                borderRadius: 8,
                                backgroundColor: '#ef4444',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingHorizontal: 4,
                            }}>
                                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </AnimatedPressable>

                    {/* Profile Avatar */}
                    <AnimatedPressable
                        preset="icon"
                        onPress={() => router.push('/(consumer)/profile')}
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            overflow: 'hidden',
                            borderWidth: 1.5,
                            borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                        }}
                    >
                        <Image
                            source={{ uri: 'https://picsum.photos/seed/user-avatar/200/200' }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                        />
                    </AnimatedPressable>
                </View>
            </Animated.View>

            {/* ── Notification Popup Modal ── */}
            <Modal
                visible={popupVisible}
                transparent
                animationType="none"
                onRequestClose={closePopup}
            >
                {/* Backdrop — tapping closes the popup */}
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={closePopup}
                    style={{ flex: 1 }}
                >
                    <Animated.View
                        style={{
                            position: 'absolute',
                            top: insets.top + 56,
                            right: 16,
                            width: popupWidth,
                            maxHeight: 420,
                            backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                            borderRadius: 20,
                            overflow: 'hidden',
                            // Shadow
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.25,
                            shadowRadius: 24,
                            elevation: 16,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            // Animations
                            opacity: popupAnim,
                            transform: [{
                                translateY: popupAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-12, 0],
                                }),
                            }, {
                                scale: popupAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.95, 1],
                                }),
                            }],
                        }}
                    >
                        {/* Header */}
                        <View style={{
                            paddingHorizontal: 16,
                            paddingTop: 16,
                            paddingBottom: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        }}>
                            <Text style={{
                                fontSize: 17,
                                fontWeight: '800',
                                color: colors.text.primary,
                                letterSpacing: -0.3,
                            }}>
                                Notifications
                            </Text>
                        </View>

                        {/* Notification list */}
                        {notifications.length === 0 && !notifLoading ? (
                            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                                <Bell size={36} color={colors.text.muted} />
                                <Text style={{
                                    color: colors.text.secondary,
                                    fontSize: 14,
                                    marginTop: 12,
                                }}>
                                    No notifications
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={notifications}
                                keyExtractor={(item) => item.id}
                                showsVerticalScrollIndicator={false}
                                style={{ maxHeight: 340 }}
                                renderItem={({ item }) => {
                                    const iconBg = item.isRead
                                        ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
                                        : (isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.1)');
                                    const iconColor = item.isRead ? colors.text.muted : '#38b4ba';

                                    return (
                                        <View style={{
                                            flexDirection: 'row',
                                            paddingVertical: 12,
                                            paddingHorizontal: 16,
                                            backgroundColor: item.isRead
                                                ? 'transparent'
                                                : (isDark ? 'rgba(56,180,186,0.04)' : 'rgba(56,180,186,0.03)'),
                                            borderBottomWidth: 1,
                                            borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                        }}>
                                            <View style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: 17,
                                                backgroundColor: iconBg,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginRight: 10,
                                            }}>
                                                {getNotificationIcon(item.type, iconColor)}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{
                                                    color: colors.text.primary,
                                                    fontSize: 13,
                                                    fontWeight: item.isRead ? '500' : '700',
                                                }} numberOfLines={2}>
                                                    {item.title}
                                                </Text>
                                                {item.body && (
                                                    <Text style={{
                                                        color: colors.text.secondary,
                                                        fontSize: 12,
                                                        marginTop: 1,
                                                    }} numberOfLines={1}>
                                                        {item.body}
                                                    </Text>
                                                )}
                                                <Text style={{
                                                    color: colors.text.muted,
                                                    fontSize: 10,
                                                    marginTop: 3,
                                                }}>
                                                    {timeAgo(item.createdAt)}
                                                </Text>
                                            </View>
                                            {!item.isRead && (
                                                <View style={{
                                                    width: 7,
                                                    height: 7,
                                                    borderRadius: 4,
                                                    backgroundColor: '#38b4ba',
                                                    alignSelf: 'center',
                                                    marginLeft: 6,
                                                }} />
                                            )}
                                        </View>
                                    );
                                }}
                            />
                        )}
                    </Animated.View>
                </TouchableOpacity>
            </Modal>
        </>
    );
}
