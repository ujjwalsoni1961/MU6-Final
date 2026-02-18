import React, { useRef, useEffect } from 'react';
import { Animated, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Search, Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import AnimatedPressable from '../shared/AnimatedPressable';

interface MobileHeaderProps {
    scrollY?: Animated.Value;
}

export default function MobileHeader({ scrollY }: MobileHeaderProps) {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const headerHeight = insets.top + 56;

    const translateY = useRef(new Animated.Value(0)).current;
    const lastScrollY = useRef(0);
    const isHidden = useRef(false);

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

    return (
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
                    onPress={() => {/* TODO */ }}
                    style={{
                        width: 36,
                        height: 36,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Bell size={20} color={isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'} />
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
    );
}
