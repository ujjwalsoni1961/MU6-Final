import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

function Blob({
    size,
    colors,
    top,
    left,
    duration,
    dx,
    dy,
}: {
    size: number;
    colors: string[];
    top: number;
    left: number;
    duration: number;
    dx: number;
    dy: number;
}) {
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animX = Animated.loop(
            Animated.sequence([
                Animated.timing(translateX, { toValue: dx, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(translateX, { toValue: -dx, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
        );
        const animY = Animated.loop(
            Animated.sequence([
                Animated.timing(translateY, { toValue: dy, duration: duration / 2.5, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(translateY, { toValue: -dy, duration: duration / 2.5, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
        );
        animX.start();
        animY.start();
        return () => { animX.stop(); animY.stop(); };
    }, []);

    return (
        <Animated.View
            style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                top,
                left,
                overflow: 'hidden',
                transform: [{ translateX }, { translateY }],
            }}
        >
            <LinearGradient
                colors={colors as any}
                style={{ width: size, height: size, borderRadius: size / 2 }}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />
        </Animated.View>
    );
}

export default function AnimatedBackground() {
    const { isDark } = useTheme();

    // Opacity/Color adjustments based on theme
    const cyanColors = isDark
        ? ['rgba(116,229,234,0.08)', 'rgba(116,229,234,0.005)'] // Reduced opacity, larger blur
        : ['rgba(116,229,234,0.2)', 'rgba(116,229,234,0.03)'];

    const purpleColors = isDark
        ? ['rgba(162,89,255,0.12)', 'rgba(162,89,255,0.01)'] // Slightly more visible
        : ['rgba(162,89,255,0.08)', 'rgba(162,89,255,0.01)'];

    const tealColors = isDark
        ? ['rgba(56,180,186,0.05)', 'rgba(56,180,186,0.005)'] // Warm dark teal
        : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.03)'];

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Blob
                size={isDark ? 320 : 260}
                colors={cyanColors}
                top={-100}
                left={-100}
                duration={25000}
                dx={40}
                dy={30}
            />
            <Blob
                size={isDark ? 300 : 280}
                colors={purpleColors}
                top={isDark ? 40 : height - 250}
                left={isDark ? width - 150 : width - 200}
                duration={28000}
                dx={-35}
                dy={-25}
            />
            <Blob
                size={isDark ? 400 : 180}
                colors={tealColors}
                top={isDark ? height / 2 - 200 : height / 3}
                left={isDark ? -100 : width / 3}
                duration={30000}
                dx={25}
                dy={-20}
            />
        </View>
    );
}
