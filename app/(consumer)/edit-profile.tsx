import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, ScrollView, Platform, Alert,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView, Dimensions,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { updateProfile } from '../../src/services/auth';
import { useProfiles } from 'thirdweb/react';
import { thirdwebClient } from '../../src/lib/thirdweb';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';
const screenWidth = Dimensions.get('window').width;

/* ─── Preset Avatar Collection ─── */
const PRESET_AVATARS = [
    { id: 'pop',        emoji: '🎤', label: 'Pop',         gradient: ['#ec4899', '#a855f7'] },
    { id: 'hiphop',     emoji: '🎧', label: 'Hip-Hop',     gradient: ['#f59e0b', '#d97706'] },
    { id: 'rock',       emoji: '🎸', label: 'Rock',        gradient: ['#ef4444', '#991b1b'] },
    { id: 'electronic', emoji: '🎛️', label: 'Electronic',  gradient: ['#06b6d4', '#3b82f6'] },
    { id: 'jazz',       emoji: '🎷', label: 'Jazz',        gradient: ['#d97706', '#78350f'] },
    { id: 'classical',  emoji: '🎻', label: 'Classical',   gradient: ['#1e3a5f', '#c9a84c'] },
    { id: 'rnb',        emoji: '💜', label: 'R&B / Soul',  gradient: ['#7c3aed', '#db2777'] },
    { id: 'lofi',       emoji: '🌙', label: 'Lo-Fi',       gradient: ['#8b5cf6', '#38bdf8'] },
    { id: 'country',    emoji: '🤠', label: 'Country',     gradient: ['#92400e', '#16a34a'] },
    { id: 'metal',      emoji: '🤘', label: 'Metal',       gradient: ['#27272a', '#71717a'] },
    { id: 'reggae',     emoji: '🌴', label: 'Reggae',      gradient: ['#16a34a', '#eab308'] },
    { id: 'afrobeat',   emoji: '🥁', label: 'Afrobeat',    gradient: ['#ea580c', '#facc15'] },
];

/* ─── Helper to resolve avatar URI from preset id ─── */
export function getAvatarForPreset(presetId: string | null | undefined): { emoji: string; gradient: string[] } {
    const preset = PRESET_AVATARS.find(a => a.id === presetId);
    return preset
        ? { emoji: preset.emoji, gradient: preset.gradient }
        : { emoji: '🎵', gradient: ['#38b4ba', '#0f766e'] };
}

/* ─── Avatar Circle Component ─── */
function AvatarCircle({ emoji, gradient, size = 64, selected = false }: {
    emoji: string; gradient: string[]; size?: number; selected?: boolean;
}) {
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: gradient[0],
            alignItems: 'center', justifyContent: 'center',
            borderWidth: selected ? 3 : 1.5,
            borderColor: selected ? '#38b4ba' : 'rgba(255,255,255,0.15)',
            ...(selected && !isAndroid ? {
                shadowColor: '#38b4ba',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 10,
            } : {}),
            ...(selected && isAndroid ? {
                elevation: 6,
            } : {}),
        }}>
            <Text style={{ fontSize: size * 0.42 }}>{emoji}</Text>
        </View>
    );
}

/* ─── Glass Card ─── */
function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
    const { isDark, colors } = useTheme();
    return (
        <View style={[{
            borderRadius: isWeb ? 16 : 24,
            backgroundColor: isWeb
                ? (isDark ? colors.bg.card : '#fff')
                : (isDark
                    ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
                    : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.4)')),
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isAndroid ? 0 : 0.04,
            shadowRadius: 8,
            elevation: isAndroid ? 1 : 4,
            overflow: 'hidden',
        }, style]}>
            {children}
        </View>
    );
}

/* ─── Main Screen ─── */
export default function EditProfileScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { profile, refreshProfile } = useAuth();
    
    // Fetch Thirdweb in-app wallet profiles to display the user's email 
    // since Supabase might not have it synced properly.
    const { data: linkedProfiles } = useProfiles({ client: thirdwebClient });
    const thirdwebProfile = linkedProfiles?.find(p => p.type === 'email' || p.type === 'google' || p.type === 'apple');
    const userEmail = profile?.email || thirdwebProfile?.details?.email || 'No email associated';

    const [displayName, setDisplayName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState<string>('pop');
    const [saving, setSaving] = useState(false);

    // Pre-fill with existing data
    useEffect(() => {
        if (profile) {
            const isWalletName = profile.displayName?.startsWith('0x') || !profile.displayName;
            setDisplayName(isWalletName ? '' : (profile.displayName || ''));
            setSelectedAvatar(profile.avatarPath || 'pop');
        }
    }, [profile]);

    const handleSave = async () => {
        if (!profile) return;

        const trimmedName = displayName.trim();
        if (!trimmedName) {
            if (isWeb) {
                alert('Please enter your name');
            } else {
                Alert.alert('Name Required', 'Please enter your name to continue.');
            }
            return;
        }

        setSaving(true);
        try {
            const updated = await updateProfile(profile.id, {
                display_name: trimmedName,
                avatar_path: selectedAvatar,
            });

            if (updated) {
                await refreshProfile();
                router.back();
            } else {
                if (isWeb) {
                    alert('Failed to save profile. Please try again.');
                } else {
                    Alert.alert('Error', 'Failed to save profile. Please try again.');
                }
            }
        } catch (err) {
            console.error('[edit-profile] save error:', err);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Calculate avatar size based on screen width (4 columns)
    const gridPadding = 16; // card padding
    const avatarGap = 8;
    const containerPadding = 16 * 2; // screen horizontal padding
    const availableWidth = (isWeb ? 600 : screenWidth) - containerPadding - (gridPadding * 2);
    const avatarCellWidth = (availableWidth - (avatarGap * 3)) / 4;
    const avatarSize = Math.min(avatarCellWidth - 8, isWeb ? 64 : 58);

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? colors.bg.base : 'transparent' }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        maxWidth: isWeb ? 600 : undefined,
                        width: '100%' as any,
                        alignSelf: 'center' as any,
                        paddingHorizontal: isWeb ? 32 : 16,
                        paddingBottom: 60,
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <AnimatedPressable preset="icon" onPress={() => router.back()} style={[
                            styles.backButton,
                            {
                                backgroundColor: isWeb
                                    ? (isDark ? colors.bg.card : '#fff')
                                    : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'),
                                borderColor: isWeb
                                    ? (isDark ? colors.border.base : '#f1f5f9')
                                    : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)'),
                            }
                        ] as any}>
                            <ChevronLeft size={20} color={colors.text.primary} />
                        </AnimatedPressable>
                        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit Profile</Text>
                        <View style={{ flex: 1 }} />
                        <AnimatedPressable
                            preset="button"
                            onPress={handleSave}
                            disabled={saving}
                            style={[styles.saveButton, { opacity: saving ? 0.5 : 1 }]}
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Check size={16} color="#fff" />
                                    <Text style={styles.saveText}>Save</Text>
                                </>
                            )}
                        </AnimatedPressable>
                    </View>

                    {/* Selected Avatar Preview */}
                    <GlassCard style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, marginBottom: 24 }}>
                        <View style={{
                            padding: 4,
                            borderRadius: 60,
                            borderWidth: 3,
                            borderColor: '#38b4ba',
                        }}>
                            <AvatarCircle
                                emoji={getAvatarForPreset(selectedAvatar).emoji}
                                gradient={getAvatarForPreset(selectedAvatar).gradient}
                                size={isWeb ? 96 : 88}
                                selected={false}
                            />
                        </View>
                        <Text style={{
                            color: colors.text.primary, fontSize: 18, fontWeight: '700',
                            marginTop: 16, letterSpacing: -0.3,
                        }}>
                            {getAvatarForPreset(selectedAvatar).emoji} {PRESET_AVATARS.find(a => a.id === selectedAvatar)?.label || 'Music Lover'}
                        </Text>
                        <Text style={{
                            color: colors.text.secondary, fontSize: 12,
                            marginTop: 6, textAlign: 'center',
                        }}>
                            Choose an avatar that represents your music vibe
                        </Text>
                    </GlassCard>

                    {/* Avatar Grid */}
                    <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>CHOOSE YOUR AVATAR</Text>
                    <GlassCard style={{ paddingVertical: gridPadding, marginBottom: 24 }}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: gridPadding, gap: 16 }}
                            style={{ flexDirection: 'row' }}
                        >
                            {PRESET_AVATARS.map((avatar) => {
                                const isSelected = selectedAvatar === avatar.id;
                                return (
                                    <AnimatedPressable
                                        key={avatar.id}
                                        preset="icon"
                                        onPress={() => setSelectedAvatar(avatar.id)}
                                        style={{ alignItems: 'center' }}
                                    >
                                        <AvatarCircle
                                            emoji={avatar.emoji}
                                            gradient={avatar.gradient}
                                            size={avatarSize}
                                            selected={isSelected}
                                        />
                                        <Text style={{
                                            color: isSelected ? '#38b4ba' : colors.text.secondary,
                                            fontSize: 10, fontWeight: isSelected ? '700' : '500',
                                            marginTop: 6, textAlign: 'center',
                                            letterSpacing: isSelected ? 0.2 : 0,
                                        }}>
                                            {avatar.label}
                                        </Text>
                                    </AnimatedPressable>
                                );
                            })}
                        </ScrollView>
                    </GlassCard>

                    {/* Name Input */}
                    <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>YOUR NAME</Text>
                    <GlassCard style={{ paddingHorizontal: 20, paddingVertical: isWeb ? 16 : (isAndroid ? 4 : 16) }}>
                        <TextInput
                            value={displayName}
                            onChangeText={setDisplayName}
                            placeholder="Enter your name"
                            placeholderTextColor={colors.text.muted}
                            maxLength={50}
                            autoCapitalize="words"
                            style={[styles.textInput, { color: colors.text.primary }]}
                        />
                    </GlassCard>
                    <Text style={{
                        color: colors.text.muted, fontSize: 11, marginTop: 8,
                        paddingHorizontal: 4, letterSpacing: 0.2,
                    }}>
                        This is how other users will see you
                    </Text>

                    {/* Email Display */}
                    <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 24 }]}>EMAIL ADDRESS</Text>
                    <GlassCard style={{ paddingHorizontal: 20, paddingVertical: isWeb ? 16 : (isAndroid ? 4 : 16) }}>
                        <TextInput
                            value={userEmail}
                            editable={false}
                            style={[styles.textInput, { color: colors.text.secondary, opacity: 0.7 }]}
                        />
                    </GlassCard>
                    <Text style={{
                        color: colors.text.muted, fontSize: 11, marginTop: 8,
                        paddingHorizontal: 4, letterSpacing: 0.2,
                        marginBottom: 24,
                    }}>
                        Your email address cannot be changed here
                    </Text>

                </ScrollView>
            </KeyboardAvoidingView>
        </Container>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: isWeb ? 8 : 16,
        marginBottom: 24,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 1,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#38b4ba',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: isWeb ? 12 : 16,
        gap: 6,
    },
    saveText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        paddingHorizontal: 4,
        marginBottom: 10,
    },
    avatarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    avatarItem: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    textInput: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: -0.2,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    },
});
