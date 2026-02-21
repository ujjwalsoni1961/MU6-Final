import React, { useCallback, useRef, useState } from 'react';
import { Pressable, PressableProps, Platform, ViewStyle, StyleProp, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';

const isWeb = Platform.OS === 'web';

/* ─── Spring Presets ─── */
type Preset = 'card' | 'button' | 'icon' | 'row' | 'tab' | 'miniPlayer';

interface PresetConfig {
    scale: number;
    opacity: number;
    spring: { tension: number; friction: number };
    haptic: 'light' | 'medium' | 'none';
    /* Web-only hover lift */
    hoverScale: number;
    hoverOpacity: number;
}

const PRESETS: Record<Preset, PresetConfig> = {
    card: {
        scale: 0.97,
        opacity: 0.88,
        spring: { tension: 100, friction: 12 },
        haptic: 'light',
        hoverScale: 1.02,
        hoverOpacity: 1,
    },
    button: {
        scale: 0.96,
        opacity: 0.88,
        spring: { tension: 120, friction: 10 },
        haptic: 'medium',
        hoverScale: 1.03,
        hoverOpacity: 1,
    },
    icon: {
        scale: 0.85,
        opacity: 0.7,
        spring: { tension: 140, friction: 12 },
        haptic: 'light',
        hoverScale: 1.15,
        hoverOpacity: 0.85,
    },
    row: {
        scale: 0.98,
        opacity: 0.75,
        spring: { tension: 100, friction: 10 },
        haptic: 'light',
        hoverScale: 1.005,
        hoverOpacity: 1,
    },
    tab: {
        scale: 0.93,
        opacity: 0.85,
        spring: { tension: 120, friction: 10 },
        haptic: 'light',
        hoverScale: 1.05,
        hoverOpacity: 1,
    },
    miniPlayer: {
        scale: 0.98,
        opacity: 0.88,
        spring: { tension: 100, friction: 12 },
        haptic: 'medium',
        hoverScale: 1.01,
        hoverOpacity: 1,
    },
};

/* ─── Haptic helpers ─── */
const triggerHaptic = (type: 'light' | 'medium' | 'none') => {
    if (isWeb || type === 'none') return;
    try {
        if (type === 'light') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (type === 'medium') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
    } catch { /* haptics not available */ }
};

/* ─── Props ─── */
export interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
    preset?: Preset;
    scaleValue?: number;
    hapticType?: 'light' | 'medium' | 'none';
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}

/* ════════════════════════════════════════════════════════════════
   Web Component — CSS transitions for GPU-accelerated 60fps
   ════════════════════════════════════════════════════════════ */
function WebAnimatedPressable({
    preset = 'card',
    scaleValue,
    hapticType,
    onPress,
    onPressIn,
    onPressOut,
    style,
    disabled,
    children,
    ...rest
}: AnimatedPressableProps) {
    const config = PRESETS[preset];
    const targetScale = scaleValue ?? config.scale;
    const [pressed, setPressed] = useState(false);
    const [hovered, setHovered] = useState(false);

    const handlePressIn = useCallback((e: any) => {
        setPressed(true);
        onPressIn?.(e);
    }, [onPressIn]);

    const handlePressOut = useCallback((e: any) => {
        setPressed(false);
        onPressOut?.(e);
    }, [onPressOut]);

    const handlePress = useCallback((e: any) => {
        onPress?.(e);
    }, [onPress]);

    // Determine current visual state
    let currentScale = 1;
    let currentOpacity = 1;
    if (pressed) {
        currentScale = targetScale;
        currentOpacity = config.opacity;
    } else if (hovered && !disabled) {
        currentScale = config.hoverScale;
        currentOpacity = config.hoverOpacity;
    }

    // Faster ease-in on press, bouncier ease-out on release
    const transitionTiming = pressed
        ? 'cubic-bezier(0.2, 0, 0.4, 1)'        // snappy press down
        : 'cubic-bezier(0.34, 1.56, 0.64, 1)';   // spring-like bounce back
    const transitionDuration = pressed ? '100ms' : '300ms';

    return (
        <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            disabled={disabled}
            style={[
                {
                    transform: [{ scale: currentScale }],
                    opacity: currentOpacity,
                    transitionProperty: 'transform, opacity',
                    transitionDuration,
                    transitionTimingFunction: transitionTiming,
                    willChange: 'transform, opacity',
                    cursor: disabled ? 'default' : 'pointer',
                } as any,
                style as any,
            ]}
            {...rest}
        >
            {children}
        </Pressable>
    );
}

/* ════════════════════════════════════════════════════════════════
   Native Component — RN Animated API with native driver
   ════════════════════════════════════════════════════════════ */
const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

function NativeAnimatedPressable({
    preset = 'card',
    scaleValue,
    hapticType,
    onPress,
    onPressIn,
    onPressOut,
    style,
    disabled,
    children,
    ...rest
}: AnimatedPressableProps) {
    const { isDark } = useTheme();
    const config = PRESETS[preset];
    const targetScale = scaleValue ?? config.scale;
    const haptic = hapticType ?? config.haptic;
    const springConfig = config.spring;

    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = useCallback((e: any) => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: targetScale,
                tension: springConfig.tension,
                friction: springConfig.friction,
                useNativeDriver: true,
            }),
            Animated.spring(opacityAnim, {
                toValue: config.opacity,
                tension: springConfig.tension,
                friction: springConfig.friction,
                useNativeDriver: true,
            }),
        ]).start();
        onPressIn?.(e);
    }, [targetScale, springConfig, config.opacity, onPressIn]);

    const handlePressOut = useCallback((e: any) => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: springConfig.tension,
                friction: springConfig.friction,
                useNativeDriver: true,
            }),
            Animated.spring(opacityAnim, {
                toValue: 1,
                tension: springConfig.tension,
                friction: springConfig.friction,
                useNativeDriver: true,
            }),
        ]).start();
        onPressOut?.(e);
    }, [springConfig, onPressOut]);

    const handlePress = useCallback((e: any) => {
        triggerHaptic(haptic);
        onPress?.(e);
    }, [haptic, onPress]);

    return (
        <AnimatedPressableBase
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            disabled={disabled}
            android_ripple={{
                color: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                borderless: preset === 'icon',
                foreground: true
            }}
            style={[
                { transform: [{ scale: scaleAnim }], opacity: opacityAnim, overflow: 'hidden' },
                style as any,
            ]}
            {...rest}
        >
            {children}
        </AnimatedPressableBase>
    );
}

/* ─── Export ─── */
export default function AnimatedPressable(props: AnimatedPressableProps) {
    if (isWeb) {
        return <WebAnimatedPressable {...props} />;
    }
    return <NativeAnimatedPressable {...props} />;
}
