import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, ScrollView, Platform, Alert,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView, Dimensions,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, Camera } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { updateProfile } from '../../src/services/auth';
import { useProfiles } from 'thirdweb/react';
import { thirdwebClient } from '../../src/lib/thirdweb';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';
const screenWidth = Dimensions.get('window').width;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function uploadToStorage(
    bucket: string, filePath: string, fileUri: string, contentType: string, walletAddress?: string
): Promise<string | null> {
    try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append('file', blob, filePath.split('/').pop() || 'file');
        formData.append('bucket', bucket);
        formData.append('path', filePath);
        if (walletAddress) {
            formData.append('walletAddress', walletAddress);
        }
        formData.append('contentType', contentType);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-file`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: formData,
        });
        const result = await res.json();
        if (!res.ok || !result.success) return null;
        return result.path || filePath;
    } catch (err) {
        return null;
    }
}

/* ─── Default avatar placeholder ─── */
function DefaultAvatar({ size = 80 }: { size?: number }) {
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: '#38b4ba',
            alignItems: 'center', justifyContent: 'center',
        }}>
            <Text style={{ fontSize: size * 0.45 }}>🎵</Text>
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

    const { data: linkedProfiles } = useProfiles({ client: thirdwebClient });
    const thirdwebProfile = linkedProfiles?.find(p => p.type === 'email' || p.type === 'google' || p.type === 'apple');
    const userEmail = profile?.email || thirdwebProfile?.details?.email || 'No email associated';

    const [displayName, setDisplayName] = useState('');
    const [saving, setSaving] = useState(false);

    // Image upload state
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null);

    // Pre-fill with existing data
    useEffect(() => {
        if (profile) {
            const isWalletName = profile.displayName?.startsWith('0x') || !profile.displayName;
            setDisplayName(isWalletName ? '' : (profile.displayName || ''));
            if (profile.avatarPath && !profile.avatarPath.match(/^(pop|hiphop|rock|electronic|jazz|classical|rnb|lofi|country|metal|reggae|afrobeat)$/)) {
                // Only set URI for actual uploaded images, not preset IDs
                setAvatarUri(`${SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatarPath}`);
            }
        }
    }, [profile]);

    const pickAvatar = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            setAvatarUri(asset.uri);
            const ext = asset.uri.split('.').pop() || 'jpg';
            setAvatarFile({
                uri: asset.uri,
                name: `profile_photo.${ext}`,
                mimeType: asset.mimeType || 'image/jpeg',
            });
        } catch (e) {
            console.error('[edit-profile] pick avatar error:', e);
        }
    };

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
            let newAvatarPath = profile.avatarPath;

            // Upload avatar if a new one was selected
            if (avatarFile) {
                const ext = avatarFile.name.split('.').pop() || 'jpg';
                const fName = `${profile.id}_avatar_${Date.now()}.${ext}`;
                const path = await uploadToStorage(
                    'avatars', fName, avatarFile.uri, avatarFile.mimeType, profile.walletAddress
                );
                if (path) newAvatarPath = path;
            }

            const updated = await updateProfile(profile.id, {
                display_name: trimmedName,
                avatar_path: newAvatarPath || undefined as any,
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
            if (isWeb) {
                alert('Something went wrong. Please try again.');
            } else {
                Alert.alert('Error', 'Something went wrong. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

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

                    {/* Profile Photo Upload */}
                    <GlassCard style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, marginBottom: 24 }}>
                        <AnimatedPressable preset="icon" onPress={pickAvatar}>
                            <View style={{
                                padding: 4,
                                borderRadius: 60,
                                borderWidth: 3,
                                borderColor: '#38b4ba',
                                position: 'relative',
                            }}>
                                {avatarUri ? (
                                    <Image
                                        source={{ uri: avatarUri }}
                                        style={{
                                            width: isWeb ? 96 : 88,
                                            height: isWeb ? 96 : 88,
                                            borderRadius: (isWeb ? 96 : 88) / 2,
                                        }}
                                        contentFit="cover"
                                    />
                                ) : (
                                    <DefaultAvatar size={isWeb ? 96 : 88} />
                                )}
                                {/* Camera overlay */}
                                <View style={{
                                    position: 'absolute', bottom: 0, right: 0,
                                    width: 32, height: 32, borderRadius: 16,
                                    backgroundColor: '#38b4ba',
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 3, borderColor: isDark ? '#1e293b' : '#fff',
                                }}>
                                    <Camera size={14} color="#fff" />
                                </View>
                            </View>
                        </AnimatedPressable>
                        <Text style={{
                            color: colors.text.primary, fontSize: 16, fontWeight: '700',
                            marginTop: 16, letterSpacing: -0.3,
                        }}>
                            Profile Photo
                        </Text>
                        <Text style={{
                            color: colors.text.secondary, fontSize: 12,
                            marginTop: 6, textAlign: 'center',
                        }}>
                            Tap to upload a photo from your library
                        </Text>
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
    textInput: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: -0.2,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    },
});
