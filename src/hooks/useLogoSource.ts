import { useTheme } from '../context/ThemeContext';

/**
 * Returns the correct MU6 logo source for the active theme.
 *
 * - Dark theme  → white logo (`assets/mu6-logo-white.png`)
 * - Light theme → black logo (`assets/mu6-logo.png`)
 *
 * Only these two authorized variants exist in the codebase; no other logo
 * files should ever be introduced.
 *
 * Usage:
 *   const logoSource = useLogoSource();
 *   <Image source={logoSource} ... />
 */
export function useLogoSource() {
    const { isDark } = useTheme();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return isDark
        ? require('../../assets/mu6-logo-white.png')
        : require('../../assets/mu6-logo.png');
}
