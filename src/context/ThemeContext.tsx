import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeColors {
    bg: {
        base: string;
        card: string;
        surface: string;
        glass: string;
    };
    text: {
        primary: string;
        secondary: string;
        tertiary: string;
        muted: string;
        inverse: string;
    };
    border: {
        base: string;
        glass: string;
    };
    accent: {
        cyan: string;
        purple: string;
    };
    status: {
        success: string;
        warning: string;
        error: string;
        info: string;
    };
    shadow: string;
}

const lightColors: ThemeColors = {
    bg: {
        base: '#f0f9fa', // User requested base
        card: '#ffffff',
        surface: '#ffffff',
        glass: 'rgba(255,255,255,0.4)',
    },
    text: {
        primary: '#0f172a',
        secondary: '#64748b',
        tertiary: '#94a3b8',
        muted: '#94a3b8',
        inverse: '#ffffff',
    },
    border: {
        base: '#e2e8f0',
        glass: 'rgba(255,255,255,0.4)',
    },
    accent: {
        cyan: '#38b4ba',
        purple: '#8b5cf6',
    },
    status: {
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
        info: '#3b82f6',
    },
    shadow: '#74e5ea',
};

const darkColors: ThemeColors = {
    bg: {
        base: '#030711', // Near-black with blue undertone
        card: '#0f1724', // Subtle lift from base
        surface: '#0c1a2e', // Slightly lighter for gradients
        glass: 'rgba(255,255,255,0.03)', // Much more transparent
    },
    text: {
        primary: '#f1f5f9', // Softer white
        secondary: '#94a3b8', // Muted text becomes lighter gray
        tertiary: '#475569', // Dimmer
        muted: '#475569', // Light text becomes mid gray
        inverse: '#0f172a',
    },
    border: {
        base: 'rgba(255,255,255,0.04)', // Almost invisible
        glass: 'rgba(255,255,255,0.06)', // Lower opacity
    },
    accent: {
        cyan: '#38b4ba', // Stays same
        purple: '#8b5cf6', // Stays same
    },
    status: {
        success: '#4ade80', // Lighter for dark mode
        warning: '#facc15',
        error: '#f87171',
        info: '#60a5fa',
    },
    shadow: '#38b4ba', // Keeps glow
};

interface ThemeContextType {
    themeMode: ThemeMode;
    toggleTheme: (mode: ThemeMode) => void;
    isDark: boolean;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [isDark, setIsDark] = useState(false);

    // Load saved theme on mount
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await AsyncStorage.getItem('themeMode');
                if (savedTheme) {
                    setThemeMode(savedTheme as ThemeMode);
                }
            } catch (e) {
                console.error('Failed to load theme preference', e);
            }
        };
        loadTheme();
    }, []);

    // Update isDark based on mode and system preference
    useEffect(() => {
        if (themeMode === 'system') {
            setIsDark(systemScheme === 'dark');
        } else {
            setIsDark(themeMode === 'dark');
        }
    }, [themeMode, systemScheme]);

    const toggleTheme = async (mode: ThemeMode) => {
        setThemeMode(mode);
        try {
            await AsyncStorage.setItem('themeMode', mode);
        } catch (e) {
            console.error('Failed to save theme preference', e);
        }
    };

    const colors = isDark ? darkColors : lightColors;

    return (
        <ThemeContext.Provider value={{ themeMode, toggleTheme, isDark, colors }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
