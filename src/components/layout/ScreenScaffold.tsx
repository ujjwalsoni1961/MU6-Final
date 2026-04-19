import React, { useRef } from 'react';
import { View, Animated, ScrollViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import MobileHeader from './MobileHeader';
import { useResponsive } from '../../hooks/useResponsive';

interface ScreenScaffoldProps {
    children: React.ReactNode;
    dominantColor?: string; // e.g. '#38b4ba'
    contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
    /** When true, ScreenScaffold will NOT render its own Animated.ScrollView.
     *  Instead it passes scrollY via render-children so FlatList screens can drive the header. */
    noScroll?: boolean;
    /** External scrollY ref — used when noScroll=true so the parent FlatList drives the header. */
    scrollY?: Animated.Value;
    refreshControl?: React.ReactElement;
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScreenScaffold({ children, dominantColor, contentContainerStyle, noScroll, scrollY: externalScrollY, refreshControl }: ScreenScaffoldProps) {
    const { isDark, colors } = useTheme();
    const internalScrollY = useRef(new Animated.Value(0)).current;
    const scrollY = externalScrollY || internalScrollY;
    const insets = useSafeAreaInsets();
    const { isWeb, isDesktopLayout, isPhoneLayout } = useResponsive();

    // Gradient Opacity: Fades out as you scroll down
    const gradientOpacity = scrollY.interpolate({
        inputRange: [0, 250],
        outputRange: [isDark ? 0.4 : 0.6, 0],
        extrapolate: 'clamp',
    });

    // Default dominant color if none provided
    const primaryColor = dominantColor || colors.accent.cyan;

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>

            {/* Top Dynamic Gradient (Behind everything) */}
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: 500,
                    opacity: gradientOpacity,
                    zIndex: 0,
                    pointerEvents: 'none',
                }}
            >
                <LinearGradient
                    colors={[primaryColor, 'transparent']}
                    style={{ flex: 1 }}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                />
            </Animated.View>

            {/* Mobile Header (native only). On web the WebHeader,
               rendered by (consumer)/_layout.tsx, is the sole top nav — no
               secondary header is needed here. */}
            {!isWeb && <MobileHeader scrollY={scrollY} />}

            {/* Main Content */}
            {noScroll ? (
                // Let the parent manage its own FlatList/ScrollView
                <View style={{ flex: 1 }}>
                    {children}
                </View>
            ) : (
                <Animated.ScrollView
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    refreshControl={refreshControl}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        contentContainerStyle,
                        {
                            // On web the WebHeader is now position:absolute
                            // so scroll content needs padding to avoid hiding under it.
                            paddingTop: isWeb ? 80 : insets.top + 60,
                            // Reserve space for the bottom bars.
                            //  - Desktop web: just the player bar (≈ 96px)
                            //  - Phone web: player bar + tab bar stacked (≈ 172px)
                            //  - Native: mini player sits on top of tab bar so 0
                            paddingBottom: isDesktopLayout ? 96 : (isPhoneLayout ? 172 : 0),
                            backgroundColor: 'transparent'
                        }
                    ]}
                >
                    {children}
                </Animated.ScrollView>
            )}
        </View>
    );
}
