import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, Platform, Animated } from 'react-native';
import AnimatedPressable from '../shared/AnimatedPressable';
import { useRouter } from 'expo-router';
import { User, Search, ChevronDown, LogOut, Settings, Wallet, X, Clock, TrendingUp } from 'lucide-react-native';
import { Image } from 'expo-image';
import { songs } from '../../mock/songs';
import { useTheme } from '../../context/ThemeContext';

interface WebHeaderProps {
    scrollY?: Animated.Value;
}

export default function WebHeader({ scrollY }: WebHeaderProps) {
    const router = useRouter();
    const scale = useRef(new Animated.Value(1)).current;
    const [showDropdown, setShowDropdown] = useState(false);
    const closeTimeout = useRef<NodeJS.Timeout | null>(null);
    const { isDark, colors, toggleTheme } = useTheme();

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isSearchHovered, setIsSearchHovered] = useState(false); // Replaced Animated.Value with state for Web CSS

    // Filter Logic
    const filteredSongs = searchQuery.length > 0
        ? songs.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.artistName.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
        : [];

    const genres = ['Pop', 'Hiphop', 'R&B', 'Electronic', 'Lo-Fi'];
    const recentSearches = ['Lost in Tokyo', 'Midnight City', 'The Weeknd'];

    const handleSearchHoverIn = () => {
        setIsSearchHovered(true);
    };

    const handleSearchHoverOut = () => {
        setIsSearchHovered(false);
    };

    // Profile Dropdown Handlers
    const handleHoverIn = () => {
        if (closeTimeout.current) {
            clearTimeout(closeTimeout.current);
            closeTimeout.current = null;
        }
        setShowDropdown(true);
        Animated.spring(scale, { toValue: 1.1, useNativeDriver: true, friction: 6 }).start();
    };

    const handleHoverOut = () => {
        closeTimeout.current = setTimeout(() => {
            setShowDropdown(false);
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
        }, 800);
    };

    // Dynamic Header Background Opacity
    const headerOpacity = scrollY ? scrollY.interpolate({
        inputRange: [0, 80],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    }) : 1;

    // Base background color
    const baseBgColor = isDark ? '#030711' : '#ffffff';

    return (
        <View
            style={[
                Platform.select({
                    web: {
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 40,
                        paddingVertical: 18,
                        zIndex: 50,
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                    } as any,
                    default: {
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 40,
                        paddingVertical: 18,
                        backgroundColor: 'transparent',
                        zIndex: 50,
                    }
                })
            ]}
        >
            {/* Animated Background Layer */}
            {Platform.OS === 'web' && (
                <Animated.View
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: isDark ? 'rgba(3,7,17,0.95)' : 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(20px)',
                        opacity: headerOpacity,
                        borderBottomWidth: 1,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)',
                    } as any}
                />
            )}

            {/* Logo */}
            <AnimatedPressable
                preset="icon"
                hapticType="none"
                onPress={() => router.push('/(consumer)/home')}
                style={{ flexDirection: 'row', alignItems: 'center', zIndex: 51 }}
            >
                <Image
                    source={require('../../../assets/mu6-logo.png')}
                    style={{ width: 40, height: 40, borderRadius: 8 }}
                    contentFit="contain"
                />
            </AnimatedPressable>

            {/* Search Bar Container */}
            <View style={{ position: 'relative', flex: 1, maxWidth: 420, marginLeft: 40, zIndex: 101 }}>

                {/* 
                    Using Pressable as a wrapper for Hover detection on Web. 
                    We disable the onPress to avoid stealing focus from TextInput, 
                    but rely on onHoverIn/Out.
                */}
                <Pressable
                    onHoverIn={handleSearchHoverIn}
                    onHoverOut={handleSearchHoverOut}
                    style={({ hovered }: any) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderWidth: 1,
                        borderColor: isSearchFocused ? 'rgba(116,229,234,0.2)' : 'transparent',
                        shadowColor: isSearchFocused ? colors.accent.cyan : 'transparent',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: isSearchFocused ? 0.2 : 0,
                        shadowRadius: 16,

                        // Web Smoothness via CSS Transitions
                        ...Platform.select({
                            web: {
                                transform: [{ scale: (isSearchFocused || isSearchHovered) ? 1.02 : 1 }],
                                transitionProperty: 'transform, box-shadow, border-color, background-color',
                                transitionDuration: '200ms',
                                transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                cursor: 'text', // Looks like a text input area
                            } as any
                        })
                    })}
                    // On Press, we focus the input via ref if needed, but the input inside handles it too.
                    onPress={() => { /* input ref focus could go here if needed */ }}
                >
                    <Search size={16} color={isSearchFocused ? colors.accent.cyan : colors.text.muted} style={{ marginRight: 12 }} />
                    <TextInput
                        placeholder="Search songs, artists, NFTs..."
                        placeholderTextColor={isDark ? colors.text.secondary : colors.text.muted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => {
                            setTimeout(() => setIsSearchFocused(false), 200);
                        }}
                        style={Platform.select({
                            web: {
                                flex: 1,
                                fontSize: 14,
                                color: colors.text.primary,
                                outlineStyle: 'none',
                                outlineWidth: 0,
                                outline: 'none',
                                boxShadow: 'none',
                                backgroundColor: 'transparent',
                                height: '100%',
                            } as any,
                            default: {
                                flex: 1,
                                fontSize: 14,
                                color: colors.text.primary,
                            },
                        })}
                    />
                    {searchQuery.length > 0 && (
                        <AnimatedPressable preset="icon" hapticType="none" onPress={() => setSearchQuery('')}>
                            <X size={14} color={colors.text.muted} />
                        </AnimatedPressable>
                    )}
                </Pressable>

                {/* Inline Search Results Dropdown */}
                {isSearchFocused && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 50,
                            left: 0,
                            right: 0,
                            backgroundColor: isDark ? colors.bg.card : '#fff',
                            borderRadius: 16,
                            padding: 16,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 12 },
                            shadowOpacity: isDark ? 0.4 : 0.1,
                            shadowRadius: 24,
                            elevation: 20,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                            maxHeight: 400,
                            overflow: 'hidden',
                        }}
                    >
                        {/* Default View: Recent & Suggestions */}
                        {searchQuery.length === 0 ? (
                            <>
                                <View style={{ marginBottom: 20 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                        <Clock size={14} color={colors.text.secondary} style={{ marginRight: 6 }} />
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent Searches</Text>
                                    </View>
                                    {recentSearches.map((term, idx) => (
                                        <AnimatedPressable
                                            key={idx}
                                            preset="row"
                                            hapticType="none"
                                            style={{
                                                paddingVertical: 8,
                                                paddingHorizontal: 8,
                                                borderRadius: 8,
                                            }}
                                            onPress={() => setSearchQuery(term)}
                                        >
                                            <Text style={{ color: colors.text.primary, fontSize: 14 }}>{term}</Text>
                                        </AnimatedPressable>
                                    ))}
                                </View>
                                {/* Trending Genres */}
                                <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                        <TrendingUp size={14} color={colors.text.secondary} style={{ marginRight: 6 }} />
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Trending Genres</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        {genres.map((genre) => (
                                            <AnimatedPressable
                                                key={genre}
                                                preset="tab"
                                                hapticType="none"
                                                onPress={() => setSearchQuery(genre)}
                                                style={{
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 6,
                                                    borderRadius: 20,
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                                                    borderWidth: 1,
                                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                                                }}
                                            >
                                                <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '500' }}>{genre}</Text>
                                            </AnimatedPressable>
                                        ))}
                                    </View>
                                </View>
                            </>
                        ) : (
                            /* Filtered Results */
                            <>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Songs & Artists
                                </Text>
                                {filteredSongs.length > 0 ? filteredSongs.map((song) => (
                                    <AnimatedPressable
                                        key={song.id}
                                        preset="row"
                                        hapticType="none"
                                        onPress={() => {
                                            router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } });
                                            setIsSearchFocused(false);
                                        }}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            padding: 8,
                                            borderRadius: 12,
                                            marginBottom: 4,
                                        }}
                                    >
                                        <Image source={{ uri: song.coverImage }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
                                        <View style={{ marginLeft: 12, flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>{song.title}</Text>
                                            <Text style={{ fontSize: 12, color: colors.text.secondary }}>{song.artistName}</Text>
                                        </View>
                                        <ChevronDown size={16} color={colors.text.muted} style={{ transform: [{ rotate: '-90deg' }] }} />
                                    </AnimatedPressable>
                                )) : (
                                    <View style={{ padding: 20, alignItems: 'center' }}>
                                        <Text style={{ color: colors.text.muted }}>No results found</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                )}
            </View>

            <View style={{ flex: 1 }} />

            {/* Profile Avatar with Hover Dropdown */}
            <View style={{ position: 'relative', zIndex: 1000 }}>
                <Animated.View style={{ transform: [{ scale }] }}>
                    <Pressable
                        onPress={() => setShowDropdown(!showDropdown)}
                        onHoverIn={handleHoverIn}
                        onHoverOut={handleHoverOut}
                        style={({ hovered }: any) => ({
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            overflow: 'hidden',
                            borderWidth: 2.5,
                            borderColor: hovered ? colors.accent.cyan : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'), // Subtle border usually
                            cursor: 'pointer',
                        })}
                    >
                        <Image
                            source={{ uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100' }}
                            style={{ width: 35, height: 35, borderRadius: 17.5 }}
                            contentFit="cover"
                        />
                    </Pressable>
                </Animated.View>

                {/* Dropdown Menu */}
                {showDropdown && (
                    <Pressable
                        onHoverIn={() => {
                            if (closeTimeout.current) {
                                clearTimeout(closeTimeout.current);
                                closeTimeout.current = null;
                            }
                        }}
                        onHoverOut={handleHoverOut}
                        style={{
                            position: 'absolute',
                            top: 48,
                            right: 0,
                            width: 200,
                            backgroundColor: isDark ? colors.bg.card : '#fff',
                            borderRadius: 14,
                            paddingVertical: 8,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.12,
                            shadowRadius: 24,
                            elevation: 12,
                            borderWidth: 1,
                            borderColor: isDark ? colors.border.base : '#f1f5f9',
                            zIndex: 1000,
                            cursor: 'default',
                        }}
                    >
                        <DropdownItem icon={<User size={16} color={colors.text.secondary} />} label="My Profile" onPress={() => { setShowDropdown(false); router.push('/(consumer)/profile'); }} />
                        <DropdownItem icon={<Wallet size={16} color={colors.text.secondary} />} label="Wallet" onPress={() => { setShowDropdown(false); router.push('/(consumer)/wallet'); }} />
                        <DropdownItem icon={<Settings size={16} color={colors.text.secondary} />} label="Settings" onPress={() => { setShowDropdown(false); router.push('/(consumer)/settings'); }} />
                        <View style={{ height: 1, backgroundColor: isDark ? colors.border.base : '#f1f5f9', marginVertical: 6 }} />
                        <DropdownItem
                            icon={<>{isDark ? <LogOut size={16} color={colors.text.secondary} /> : <LogOut size={16} color={colors.text.secondary} />}</>}
                            label={isDark ? "Light Mode" : "Dark Mode"}
                            onPress={() => { toggleTheme(isDark ? 'light' : 'dark'); }}
                        />
                        <DropdownItem icon={<LogOut size={16} color={colors.status.error} />} label="Logout" labelColor={colors.status.error} onPress={() => { setShowDropdown(false); router.replace('/(auth)/login'); }} />
                    </Pressable>
                )}
            </View>
        </View>
    );
}

function DropdownItem({ icon, label, labelColor, onPress }: { icon: React.ReactNode; label: string; labelColor?: string; onPress: () => void }) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 10,
            }}
        >
            {icon}
            <Text style={{ marginLeft: 12, fontSize: 13, fontWeight: '500', color: labelColor || colors.text.primary }}>{label}</Text>
        </AnimatedPressable>
    );
}
