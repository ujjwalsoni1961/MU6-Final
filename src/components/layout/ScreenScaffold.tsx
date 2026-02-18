import React, { useRef } from 'react';
import { View, Animated, Platform, ScrollViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import WebHeader from './WebHeader';
import MobileHeader from './MobileHeader';

const isWeb = Platform.OS === 'web';

interface ScreenScaffoldProps {
    children: React.ReactNode;
    dominantColor?: string; // e.g. '#38b4ba'
    contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
    /** When true, ScreenScaffold will NOT render its own Animated.ScrollView.
     *  Instead it passes scrollY via render-children so FlatList screens can drive the header. */
    noScroll?: boolean;
    /** External scrollY ref — used when noScroll=true so the parent FlatList drives the header. */
    scrollY?: Animated.Value;
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScreenScaffold({ children, dominantColor, contentContainerStyle, noScroll, scrollY: externalScrollY }: ScreenScaffoldProps) {
    const { isDark, colors } = useTheme();
    const internalScrollY = useRef(new Animated.Value(0)).current;
    const scrollY = externalScrollY || internalScrollY;
    const insets = useSafeAreaInsets();

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

            {/* Web Header (Absolute Top) */}
            {isWeb && <WebHeader scrollY={scrollY} />}

            {/* Mobile Header (Absolute Top) */}
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
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        contentContainerStyle,
                        {
                            paddingTop: isWeb ? 80 : insets.top + 60,
                            paddingBottom: isWeb ? 80 : 0,
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
