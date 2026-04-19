/**
 * useResponsive
 *
 * Single source of truth for responsive breakpoints across MU6 web.
 *
 * Breakpoints (width in CSS pixels):
 *   mobile  : < 640
 *   tablet  : 640 - 1023
 *   desktop : >= 1024
 *   wide    : >= 1440   (optional extra-wide tier)
 *
 * On native platforms the `isWeb` flag is always false, so calling code
 * can continue to use the legacy `Platform.OS === 'web'` style logic — this
 * hook only matters on web, where the viewport width actually varies.
 *
 * Usage:
 *   const { isMobile, isTablet, isDesktop, width } = useResponsive();
 *   if (isMobile) { ...render stacked layout... }
 */

import { Platform, useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
    mobile: 640,
    tablet: 1024,
    wide: 1440,
} as const;

export interface ResponsiveInfo {
    width: number;
    height: number;
    isWeb: boolean;
    /** true when on a web browser with width < 640 — i.e. a phone */
    isMobile: boolean;
    /** true for 640-1023 — tablet / narrow desktop */
    isTablet: boolean;
    /** true for >= 1024 — standard desktop */
    isDesktop: boolean;
    /** true for >= 1440 — wide / ultrawide */
    isWide: boolean;
    /**
     * true when layout should behave like a phone:
     *   - native platforms (always)
     *   - OR web with width < 640
     *
     * This is the correct replacement for most `!isWeb` conditions when
     * the intent is "use phone-friendly layout".
     */
    isPhoneLayout: boolean;
    /**
     * true when layout should use desktop-class two-column / wide layouts.
     * i.e. web AND width >= 1024.
     */
    isDesktopLayout: boolean;
}

export function useResponsive(): ResponsiveInfo {
    const { width, height } = useWindowDimensions();
    const isWeb = Platform.OS === 'web';

    const isMobile = isWeb && width < BREAKPOINTS.mobile;
    const isTablet = isWeb && width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet;
    const isDesktop = isWeb && width >= BREAKPOINTS.tablet;
    const isWide = isWeb && width >= BREAKPOINTS.wide;

    return {
        width,
        height,
        isWeb,
        isMobile,
        isTablet,
        isDesktop,
        isWide,
        isPhoneLayout: !isWeb || width < BREAKPOINTS.mobile,
        isDesktopLayout: isWeb && width >= BREAKPOINTS.tablet,
    };
}
